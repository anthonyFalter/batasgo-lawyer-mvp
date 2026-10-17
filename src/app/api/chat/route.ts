import { GoogleGenAI } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { getOrCreatePersonalWorkspace } from "@/lib/db/workspace";
import { appendMessages, assertSessionOwnership, createSession } from "@/lib/chat/sessions";
import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type ConversationMessage = {
  role: "user" | "model";
  parts: { text: string }[];
};

/**
 * POST /api/chat
 *
 * Body (JSON):
 *   sessionId?: string   — if provided, load history from DB and persist reply
 *   message:   string    — the new user message
 *   title?:    string    — only used when creating a new session (first message)
 *
 * Response: text/plain streaming (Gemini reply chunks)
 * Headers:  X-Session-Id — the session id (new or existing)
 */
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
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
    // First message — create a new session named after the prompt
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 255)
      : userMessage.slice(0, 80);
    sessionId = await createSession(workspaceId, userId, title);
  } else {
    // Existing session — verify ownership
    try {
      await assertSessionOwnership(sessionId, workspaceId, userId);
    } catch {
      return new Response(
        JSON.stringify({ error: "Session not found or access denied." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // ── Load history from DB ──────────────────────────────────────────────────
  const historyRows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  const history: ConversationMessage[] = historyRows.map((row) => ({
    role: row.role === "assistant" ? "model" : "user",
    parts: [{ text: row.content }],
  }));

  // ── Call Gemini ───────────────────────────────────────────────────────────
  const ai = new GoogleGenAI({ apiKey });

  try {
    const chat = ai.chats.create({
      model: "gemini-3.8-flash",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
      history,
    });

    const stream = await chat.sendMessageStream({ message: userMessage });

    // ── Stream reply, collect full text for persistence ───────────────────
    const encoder = new TextEncoder();
    const resolvedSessionId = sessionId; // captured for closure

    const readableStream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              fullText += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          // Persist both turns after streaming completes
          await appendMessages(resolvedSessionId, userMessage, fullText);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Stream error";
          controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
        "X-Session-Id": resolvedSessionId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: `Gemini API error: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
