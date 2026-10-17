import { z } from "zod";

export const intakeDomains = [
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
  priorityScore: z.number().int().min(0).max(100).nullable().optional(),
}).strict();

const intakeAiReviewFactorSchema = z.object({
  score: z.number().int().min(0),
  rationale: z.string().trim().min(1).max(180),
}).strict();

export const intakeAiReviewResponseSchema = z.object({
  review: z.object({
    provider: z.enum(["Gemini", "Groq"]),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1200),
    domain: z.enum(intakeDomains),
    summary: z.string().trim().min(1).max(600),
    signals: z.array(z.string().trim().min(1).max(80)).max(6),
    documentReview: z.object({
      processedCount: z.number().int().min(0).max(5),
      truncated: z.boolean(),
      visionUsed: z.boolean(),
    }).strict(),
    factors: z.object({
      urgency: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(35) }),
      deadline: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(30) }),
      impact: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(25) }),
      unknowns: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(10) }),
    }).strict(),
    priorityScore: z.number().int().min(0).max(100),
    risk: z.enum(["Critical", "High", "Medium"]),
  }).strict(),
}).strict().superRefine(({ review }, context) => {
  const total = review.factors.urgency.score
    + review.factors.deadline.score
    + review.factors.impact.score
    + review.factors.unknowns.score;
  if (review.priorityScore !== total) {
    context.addIssue({
      code: "custom",
      message: "Priority score must equal the sum of its components.",
      path: ["review", "priorityScore"],
    });
  }
  const expectedRisk = total >= 80 ? "Critical" : total >= 60 ? "High" : "Medium";
  if (review.risk !== expectedRisk) {
    context.addIssue({
      code: "custom",
      message: "Risk label must match the priority score.",
      path: ["review", "risk"],
    });
  }
});

export const intakeStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "declined"]),
}).strict();

export const intakeDTOSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  domain: z.string(),
  risk: z.enum(["Critical", "High", "Medium", "Unassessed"]),
  client: z.string(),
  summary: z.string(),
  received: z.string(),
  receivedOrder: z.number(),
  deadline: z.string(),
  deadlineOrder: z.number(),
  deadlineAt: z.string().nullable(),
  documents: z.array(z.string()),
  priorityScore: z.number().nullable(),
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
