import { GoogleGenAI } from "@google/genai";

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

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const incomingMessages = body.messages ?? [];
  if (incomingMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "No messages provided." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Build conversation history (all but the last message) and extract the latest user prompt
  const history: ConversationMessage[] = incomingMessages
    .slice(0, -1)
    .map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

  const latestMessage = incomingMessages[incomingMessages.length - 1];
  if (!latestMessage || latestMessage.role !== "user") {
    return new Response(
      JSON.stringify({ error: "Last message must be from the user." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

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

    const stream = await chat.sendMessageStream({ message: latestMessage.content });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
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
