import { GoogleGenAI } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { appendMessages, assertSessionOwnership, createSession } from "@/lib/chat/sessions";
import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_TIMEOUT_MS = 18_000;
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-20b";

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
        systemInstruction: SYSTEM_PROMPT,
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
): Promise<ReadableStream<Uint8Array>> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
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
 *           X-Provider    — which AI provider served the request ("Gemini" | "Groq")
 */
export async function POST(request: Request) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!geminiApiKey && !groqApiKey) {
    return new Response(
      JSON.stringify({ error: "No AI provider API key is configured on the server." }),
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
      ? body.title.trim().slice(0, 255)
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

  // ── Build provider priority list ──────────────────────────────────────────
  // Gemini first (lower latency, larger context), Groq as fallback
  const providers: { name: string; stream: () => Promise<ReadableStream<Uint8Array>> }[] = [];
  if (geminiApiKey) {
    providers.push({
      name: "Gemini",
      stream: () => streamWithGemini(userMessage, history, geminiApiKey),
    });
  }
  if (groqApiKey) {
    providers.push({
      name: "Groq",
      stream: () => streamWithGroq(userMessage, history, groqApiKey),
    });
  }

  // ── Try providers in order ────────────────────────────────────────────────
  const resolvedSessionId = sessionId;
  let bodyStream: ReadableStream<Uint8Array> | null = null;
  let usedProvider = "";
  const failures: ChatProviderError[] = [];

  for (const provider of providers) {
    try {
      bodyStream = await primeProviderStream(await provider.stream(), provider.name);
      usedProvider = provider.name;
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
        JSON.stringify({ error: "BatasBot AI providers are temporarily busy. Please try again shortly." }),
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
      "X-Provider": usedProvider,
    },
  });
}
