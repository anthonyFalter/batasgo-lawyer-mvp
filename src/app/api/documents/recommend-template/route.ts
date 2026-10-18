import { GoogleGenAI } from "@google/genai";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/intakes/validation";
import { listWorkspaceIntakes } from "@/lib/intakes/service";

const requestSchema = z.object({
  matter: z.object({
    reference: z.string().trim().min(1).max(120),
    client: z.string().trim().min(1).max(255),
    domain: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(1200),
  }).strict(),
  templates: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(30),
}).strict();

const responseSchema = z.object({
  templateId: z.string().trim().min(1),
  rationale: z.string().trim().min(1).max(240),
}).strict();

const systemInstruction = `You recommend a document template for a legal practitioner.
Use only the supplied matter and template metadata. Do not give legal advice, invent facts, or decide legal strategy.
Return only valid JSON with exactly these fields: templateId and rationale.
templateId must exactly match one supplied template id. Keep rationale under 30 words and explain the practical fit.`;

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return responseSchema.parse(JSON.parse(cleaned));
}

async function recommendWithGemini(prompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    contents: prompt,
    config: {
      systemInstruction,
      temperature: 0.1,
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
      abortSignal: AbortSignal.timeout(10_000),
      httpOptions: { timeout: 10_000, retryOptions: { attempts: 1 } },
    },
  });
  return parseJson(response.text ?? "");
}

async function recommendWithGroq(prompt: string, apiKey: string) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_completion_tokens: 256,
      reasoning_effort: "low",
      reasoning_format: "hidden",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Groq returned ${response.status}.`);
  const payload = await response.json() as { choices?: { message?: { content?: string | null } }[] };
  return parseJson(payload.choices?.[0]?.message?.content ?? "");
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isSameOriginRequest(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Matter and template details are invalid." }, { status: 400 });

  const workspaceMatter = (await listWorkspaceIntakes(userId))
    .find((intake) => intake.reference === parsed.data.matter.reference && intake.status === "accepted");
  if (!workspaceMatter) return Response.json({ error: "Only accepted workspace matters can use template recommendations." }, { status: 403 });

  const templateList = parsed.data.templates.map(({ id, name, category, description }) => (
    `ID: ${id}\nName: ${name}\nCategory: ${category}\nDescription: ${description}`
  )).join("\n\n");
  const prompt = `Matter reference: ${workspaceMatter.reference}
Client: ${workspaceMatter.client}
Practice area: ${workspaceMatter.domain}
Matter summary (unverified): <matter_summary>${workspaceMatter.summary}</matter_summary>

Available templates:
<templates>
${templateList}
</templates>`;

  const providers = [
    process.env.GEMINI_API_KEY
      ? { name: "Gemini", generate: () => recommendWithGemini(prompt, process.env.GEMINI_API_KEY as string) }
      : null,
    process.env.GROQ_API_KEY
      ? { name: "Groq", generate: () => recommendWithGroq(prompt, process.env.GROQ_API_KEY as string) }
      : null,
  ].filter((provider): provider is NonNullable<typeof provider> => provider !== null);

  if (!providers.length) return Response.json({ error: "AI template recommendations are not configured." }, { status: 503 });

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const recommendation = await provider.generate();
      if (!parsed.data.templates.some((template) => template.id === recommendation.templateId)) {
        throw new Error("AI returned an unavailable template.");
      }
      return Response.json(recommendation);
    } catch (error) {
      failures.push(provider.name);
      console.error("Document template recommendation provider failed.", {
        provider: provider.name,
        reason: error instanceof Error ? error.message : "UnknownError",
      });
    }
  }

  console.error("All document template recommendation providers failed.", { providers: failures });
  return Response.json({ error: "BatasBot could not recommend a template right now. Please try again." }, { status: 502 });
}
