import { GoogleGenAI } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { appendMessages, assertSessionOwnership, createSession, updateSessionTitle } from "@/lib/chat/sessions";
import { listWorkspaceIntakes } from "@/lib/intakes/service";
import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 18_000;
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b";
const TITLE_TIMEOUT_MS = 8_000;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are BatasBot, an AI legal research assistant specializing exclusively in Philippine law.

Your scope covers:
- The 1987 Philippine Constitution
- The Civil Code of the Philippines (Republic Act No. 386)
- The Labor Code of the Philippines (Presidential Decree No. 442, as amended)
- The Revised Penal Code (Act No. 3815, as amended)
- The Family Code of the Philippines (Executive Order No. 209)
- The Rules of Court (as amended by the Supreme Court of the Philippines)
- Special laws: VAWC (RA 9262), Anti-Cybercrime Law (RA 10175), Data Privacy Act (RA 10173), Consumer Act (RA 7394), Revised Corporation Code (RA 11232), and other relevant statutes
- Supreme Court and Court of Appeals jurisprudence (cite G.R. numbers and dates when referencing specific cases)

## Response Format
Structure your responses as follows when analyzing a legal question:
1. **Issue** – State the core legal question concisely
2. **Applicable Law** – Cite the specific statute, article, or provision (e.g., "Article 297, Labor Code", "Section 5, Rule 110, Rules of Court")
3. **Analysis** – Apply the law to the situation
4. **Suggested Next Steps** – Practical actions the lawyer or client should take

For simple questions or follow-up conversation, respond naturally without forcing this structure.

## Important Constraints
- Always include this disclaimer at the end of substantive legal answers: *"This is AI-generated legal research for professional reference only. Verify all citations against primary sources and consult applicable jurisprudence before advising clients."*
- Do NOT fabricate case names, G.R. numbers, or statutes. If unsure, say so explicitly.
- Respond in English by default. If the user writes in Filipino/Tagalog, respond in Filipino.
- You are assisting a licensed Philippine lawyer in their professional practice. Be precise, structured, and thorough.`;

// ── Types ─────────────────────────────────────────────────────────────────────

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function cleanSessionTitle(title: string) {
  return title
    .replace(/\*\*/g, "")
    .replace(/[`#]/g, "")
    .replace(/^[-*]\s+/, "")
    .trim()
    .slice(0, 255);
}

function asksAboutWorkspaceMatters(message: string) {
  return /\b(find|show|list|summari[sz]e|review|search|look up|what(?:'s| is))\b.*\b(matter|matters|case|cases|intake|intakes|workspace)\b|\b(matter|matters|case|cases|intake|intakes)\b.*\b(workspace|case overview|summary|summari[sz]e|find|show|list)\b/i.test(message);
}

function isGenericMatterLookup(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  return /^(?:(?:can|could|would)\s+you\s+)?(?:help\s+(?:me\s+)?(?:with\s+)?(?:finding|find|locating|locate|searching for|search for|looking up|look up)|(?:find|show|list|search|look up|locate))\s+(?:a\s+)?matter(?:\s+for me)?(?:\s+in\s+my\s+workspace)?[.!?]*$/i.test(normalized)
    || /^(?:can|could|would)\s+you\s+help\s+me\s+with\s+finding\s+(?:a\s+)?matter\s+in\s+my\s+workspace[.!?]*$/i.test(normalized)
    || /\b(?:forgot|don't know|do not know|not sure)\s+(?:the\s+)?(?:specifics|details)\b/i.test(normalized);
}

function isMatterLookupRequest(message: string) {
  const normalized = message.trim();
  return asksAboutWorkspaceMatters(normalized)
    || /\b(find|locate|search|look up|identify|match)\b.*\b(matter|matters|case|cases|intake|intakes)\b/i.test(normalized)
    || /\b(?:matter|case|intake)[-\s]?\d{3,}/i.test(normalized);
}

async function getWorkspaceMattersContext(userId: string, message: string, history: ConversationMessage[]) {
  const lookupFlowStarted = history.some((item) =>
    item.role === "user" && isMatterLookupRequest(item.content),
  );
  if (!isMatterLookupRequest(message) && !lookupFlowStarted) return "";

  const intakes = await listWorkspaceIntakes(userId);
  if (intakes.length === 0) {
    return `\n\n## Workspace matter context
The user has no matters currently listed in Case Overview. Say that clearly and do not invent matters.`;
  }

  const matterRecords = intakes.map((intake) => ({
    reference: intake.reference,
    domain: intake.domain,
    client: intake.client,
    issue: intake.summary,
    risk: intake.risk,
    status: intake.status,
    caseStage: intake.caseStage || "Not specified",
    deadline: intake.deadline,
    urgencyFlags: intake.urgencyFlags,
    documents: intake.documents,
    existingAiSummary: intake.aiSummary || null,
  }));

  const lookupInstruction = isGenericMatterLookup(message)
    ? `The user has not said which matter they want. Ask a concise clarification question such as: "What are you looking for—a client name, matter reference, legal area, or issue?" Do not list or summarize matters yet.`
    : `Match the user's description semantically against the reference, client, domain, issue, stage, urgency flags, and existing AI summary. Return only the records that match what the user described, including reviewed records. If no record matches, say so and ask for another identifying detail; do not invent a matter.

There are ${matterRecords.length} total matters available in the workspace. Count the matching records before formatting the response. Apply these result-size rules:
- If more than 10 matters match, do not list or summarize them. State the exact number of matching matters and ask the user to be more specific about the matter they are trying to find.
- If 6 to 10 matters match, output a machine-readable table block instead of Markdown table syntax. Use exactly this format, with valid JSON:
[[MATTER_TABLE]]
{"rows":[{"reference":"...","status":"...","client":"...","domain":"...","risk":"...","summary":"..."}]}
[[/MATTER_TABLE]]
Use one row per matching matter and the columns Matter Reference, Status, Client, Domain, Risk, and Issue Summary. Do not add Markdown table syntax inside the block.
- If 1 to 5 matters match, use the compact card format below.

For 1 to 5 matching matters, format every result exactly as a compact card-style Markdown block. Do not use a table, numbered list, or separate "Matched Record" heading. Put the review status directly below the matter reference:

**MATTER-REFERENCE**
**STATUS**
Client name and location
Legal domain · Risk level
Issue summary in one or two concise sentences.

Repeat the same block for each matching matter, with one blank line between blocks. Use the actual review status (Pending, Accepted, or Declined) and keep it directly below the reference.`;

  return `\n\n## Workspace matter context
The following records are the user's Case Overview matters, including pending, accepted, and declined records. These are the only matters you may view or output for this request. Identify each record's review status accurately and do not expose database IDs or claim facts not present here.

${JSON.stringify(matterRecords, null, 2)}

${lookupInstruction}
Clearly label missing or unverified information.`;
}

async function generateSessionTitle(
  history: ConversationMessage[],
  userMessage: string,
  assistantMessage: string,
  geminiApiKey: string | undefined,
  groqApiKey: string | undefined,
) {
  const transcript = [...history, { role: "user" as const, content: userMessage }, { role: "assistant" as const, content: assistantMessage }]
    .map(({ role, content }) => `${role.toUpperCase()}: ${content.slice(0, 1800)}`)
    .join("\n\n")
    .slice(-7_000);
  const prompt = `Create a concise title for this legal assistant conversation.
Summarize the overall topic, not the user's exact wording. Use 3-8 words, title case, no quotation marks, no period, and no generic words like "Chat" or "Conversation". Include the legal issue or subject when clear. Return only the title.

${transcript}`;

  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 30,
          httpOptions: { timeout: TITLE_TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      });
      const title = response.text?.trim().replace(/^["']|["']$/g, "");
      if (title) return cleanSessionTitle(title);
    } catch (error) {
      console.error("Gemini session title generation failed.", error instanceof Error ? error.message : "Unknown error");
    }
  }

  if (groqApiKey) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_CHAT_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_completion_tokens: 30,
        }),
        signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
        const title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
        if (title) return cleanSessionTitle(title);
      } else {
        console.error(`Groq session title generation failed with status ${response.status}.`);
      }
    } catch (error) {
      console.error("Groq session title generation failed.", error instanceof Error ? error.message : "Unknown error");
    }
  }

  const issueMatch = assistantMessage.match(/\bIssue\b\s*[:\-–]\s*(.+?)(?:\n|$)/i);
  if (issueMatch?.[1]) return issueMatch[1].trim().replace(/[.!?]+$/, "").slice(0, 255);
  if (/\bUPL\b|unauthorized practice of law/i.test(`${userMessage}\n${assistantMessage}`)) {
    return "Unauthorized Practice Of Law";
  }
  return undefined;
}

class ChatProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    readonly timedOut = false,
    message = "Provider request failed.",
  ) {
    super(message);
    this.name = "ChatProviderError";
  }
}

// ── Groq response schema ──────────────────────────────────────────────────────

const groqStreamChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ content: z.string().nullable().optional() }),
    finish_reason: z.string().nullable().optional(),
  })).min(1),
});

// ── Provider: Gemini (streaming) ──────────────────────────────────────────────

async function streamWithGemini(
  userMessage: string,
  history: ConversationMessage[],
  apiKey: string,
  workspaceContext: string,
): Promise<ReadableStream<Uint8Array>> {
  const ai = new GoogleGenAI({ apiKey });

  const geminiHistory = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let stream: ReturnType<typeof ai.chats.create>["sendMessageStream"] extends (...args: never[]) => infer R ? Awaited<R> : never;
  try {
    const chat = ai.chats.create({
      model: "gemini-3.8-flash",
      config: {
        systemInstruction: `${SYSTEM_PROMPT}${workspaceContext}`,
        temperature: 0.4,
        maxOutputTokens: 2048,
        httpOptions: {
          timeout: PROVIDER_TIMEOUT_MS,
          retryOptions: { attempts: 1 },
        },
      },
      history: geminiHistory,
    });
    stream = await chat.sendMessageStream({ message: userMessage });
  } catch (error) {
    const status = error instanceof Error && "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
    const timedOut = status === 504 || (error instanceof Error && /timed?\s*out|timeout/i.test(error.message));
    throw new ChatProviderError("Gemini", status, timedOut);
  }

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (error) {
        const status = error instanceof Error && "status" in error && typeof error.status === "number"
          ? error.status
          : undefined;
        const timedOut = status === 504 || (error instanceof Error && /timed?\s*out|timeout/i.test(error.message));
        controller.error(new ChatProviderError("Gemini", status, timedOut));
      }
    },
  });
}

// ── Provider: Groq (streaming via OpenAI-compatible SSE) ─────────────────────

async function streamWithGroq(
  userMessage: string,
  history: ConversationMessage[],
  apiKey: string,
  workspaceContext: string,
): Promise<ReadableStream<Uint8Array>> {
  const messages = [
    { role: "system", content: `${SYSTEM_PROMPT}${workspaceContext}` },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages,
        temperature: 0.4,
        max_completion_tokens: 2048,
        stream: true,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ChatProviderError("Groq", undefined, timedOut);
  }

  if (!response.ok) {
    throw new ChatProviderError("Groq", response.status, response.status === 504);
  }

  if (!response.body) {
    throw new ChatProviderError("Groq", undefined, false, "Provider returned no stream body.");
  }

  // Pipe Groq's SSE stream → plain text chunks
  const encoder = new TextEncoder();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE lines arrive as: "data: {...}\n\n" or "data: [DONE]\n\n"
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the incomplete last line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const chunk = groqStreamChunkSchema.parse(JSON.parse(jsonStr));
              const text = chunk.choices[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // malformed chunk — skip silently
            }
          }
        }
        buffer += decoder.decode();
        if (buffer.trim().startsWith("data:")) {
          const jsonStr = buffer.trim().slice(5).trim();
          if (jsonStr && jsonStr !== "[DONE]") {
            const chunk = groqStreamChunkSchema.parse(JSON.parse(jsonStr));
            const text = chunk.choices[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (error) {
        const status = error instanceof Error && "status" in error && typeof error.status === "number"
          ? error.status : undefined;
        const timedOut = status === 504 || (error instanceof Error && /timed?\s*out|timeout/i.test(error.message));
        controller.error(new ChatProviderError("Groq", status, timedOut));
      } finally {
        reader.releaseLock();
      }
    },
  });
}

async function readProviderChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  provider: string,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ChatProviderError(provider, undefined, true, "Provider response timed out."));
        }, PROVIDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function primeProviderStream(
  stream: ReadableStream<Uint8Array>,
  provider: string,
): Promise<ReadableStream<Uint8Array>> {
  const reader = stream.getReader();
  let firstChunk: Uint8Array;
  try {
    const first = await readProviderChunk(reader, provider);
    if (first.done || !first.value?.length) {
      throw new ChatProviderError(provider, undefined, false, "Provider returned an empty response.");
    }
    firstChunk = first.value;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      // The provider may still have an outstanding read when its timeout fires.
    }
    if (error instanceof ChatProviderError) throw error;

    const status = error instanceof Error && "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
    const timedOut = status === 504 || (error instanceof Error && /timed?\s*out|timeout/i.test(error.message));
    throw new ChatProviderError(provider, status, timedOut);
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(firstChunk);
        while (true) {
          const { done, value } = await readProviderChunk(reader, provider);
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // The stream may have been cancelled while a provider read was pending.
        }
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      try {
        reader.releaseLock();
      } catch {
        // The stream may have an outstanding provider read during cancellation.
      }
    },
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/chat
 *
 * Body (JSON):
 *   message:    string   — the new user message
 *   sessionId?: string   — if provided, load history from DB and persist the exchange
 *   title?:     string   — used when creating a new session (first message)
 *
 * Response: text/plain streaming (reply chunks)
 * Headers:  X-Session-Id  — the session id (new or existing)
 *           X-Assistant   — the assistant name (BatasBot)
 */
export async function POST(request: Request) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!geminiApiKey && !groqApiKey) {
    return new Response(
      JSON.stringify({ error: "BatasBot is not configured on the server." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Unauthorized." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { sessionId?: string; message?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return new Response(
      JSON.stringify({ error: "message is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Resolve workspace + session ───────────────────────────────────────────
  const workspaceId = await getOrCreatePersonalWorkspace(userId);

  let sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    const title = typeof body.title === "string" && body.title.trim()
      ? cleanSessionTitle(body.title)
      : userMessage.slice(0, 80);
    sessionId = await createSession(workspaceId, userId, title);
  } else {
    try {
      await assertSessionOwnership(sessionId, workspaceId, userId);
    } catch {
      return new Response(
        JSON.stringify({ error: "Session not found or access denied." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // ── Load conversation history from DB ─────────────────────────────────────
  const historyRows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  const history: ConversationMessage[] = historyRows.map((row) => ({
    role: row.role,
    content: row.content,
  }));

  let workspaceContext = "";
  try {
    workspaceContext = await getWorkspaceMattersContext(userId, userMessage, history);
  } catch (error) {
    console.error("Could not load workspace matters for BatasBot.", error instanceof Error ? error.message : "Unknown error");
    return new Response(
      JSON.stringify({ error: "BatasBot could not load your Case Overview matters right now. Please try again." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Build provider priority list ──────────────────────────────────────────
  // Gemini first (lower latency, larger context), Groq as fallback
  const providers: { name: string; stream: () => Promise<ReadableStream<Uint8Array>> }[] = [];
  if (geminiApiKey) {
    providers.push({
      name: "Gemini",
      stream: () => streamWithGemini(userMessage, history, geminiApiKey, workspaceContext),
    });
  }
  if (groqApiKey) {
    providers.push({
      name: "Groq",
      stream: () => streamWithGroq(userMessage, history, groqApiKey, workspaceContext),
    });
  }

  // ── Try providers in order ────────────────────────────────────────────────
  const resolvedSessionId = sessionId;
  let bodyStream: ReadableStream<Uint8Array> | null = null;
  const failures: ChatProviderError[] = [];

  for (const provider of providers) {
    try {
      bodyStream = await primeProviderStream(await provider.stream(), provider.name);
      break;
    } catch (error) {
      const failure = error instanceof ChatProviderError
        ? error
        : new ChatProviderError(provider.name, undefined);
      failures.push(failure);
      console.error(
        `BatasBot AI provider failed: ${failure.provider}; status=${failure.status ?? "unknown"}; timedOut=${failure.timedOut}.`,
      );
    }
  }

  if (!bodyStream) {
    const allTimedOut = failures.length > 0 && failures.every(({ timedOut }) => timedOut);
    if (allTimedOut) {
      return new Response(
        JSON.stringify({ error: "BatasBot timed out. Please try again." }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }
    const allBusy = failures.length > 0 && failures.every(({ status }) => status === 503 || status === 429);
    if (allBusy) {
      return new Response(
        JSON.stringify({ error: "BatasBot is temporarily busy. Please try again shortly." }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: "BatasBot is temporarily unavailable. Please try again later." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── Wrap stream to collect full text for DB persistence ───────────────────
  const encoder = new TextEncoder();
  const reader = bodyStream.getReader();

  const persistingStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        // Persist both turns after streaming completes
        if (fullText.trim()) {
          await appendMessages(resolvedSessionId, userMessage, fullText.trim());
          const generatedTitle = await generateSessionTitle(
            history,
            userMessage,
            fullText.trim(),
            geminiApiKey,
            groqApiKey,
          );
          if (generatedTitle) await updateSessionTitle(resolvedSessionId, generatedTitle);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Stream error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(persistingStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
      "X-Session-Id": resolvedSessionId,
      "X-Assistant": "BatasBot",
    },
  });
}
