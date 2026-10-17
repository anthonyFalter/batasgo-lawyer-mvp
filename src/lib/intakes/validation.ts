import { z } from "zod";

const intakeDomains = [
  "Labor & Employment",
  "Family Law",
  "Civil Disputes",
  "Criminal Defense",
  "Immigration",
  "Corporate & Commercial",
  "Other",
] as const;

export const intakeCreateSchema = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  domain: z.union([z.literal(""), z.enum(intakeDomains)]).default(""),
  documents: z.array(z.string().trim().min(1).max(255)).max(10).default([]),
}).strict();

export const intakeStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "declined"]),
}).strict();

export const intakeDTOSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  domain: z.string(),
  risk: z.enum(["Critical", "High", "Medium"]),
  client: z.string(),
  summary: z.string(),
  received: z.string(),
  receivedOrder: z.number(),
  deadline: z.string(),
  deadlineOrder: z.number(),
  deadlineAt: z.string().nullable(),
  documents: z.array(z.string()),
  priorityScore: z.number(),
  status: z.enum(["pending", "accepted", "declined"]),
  isSample: z.boolean(),
  aiSummary: z.string().nullable(),
});

export const intakeListResponseSchema = z.object({
  intakes: z.array(intakeDTOSchema),
});

export const intakeResponseSchema = z.object({
  intake: intakeDTOSchema,
});

export const apiErrorResponseSchema = z.object({
  error: z.string(),
});

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export type IntakeDTO = z.infer<typeof intakeDTOSchema>;
