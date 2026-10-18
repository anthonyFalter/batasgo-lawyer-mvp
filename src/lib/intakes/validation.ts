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

export const intakeCaseStages = [
  "Pre-litigation",
  "Formal notice",
  "Summons / active case",
  "Judgment / enforcement",
] as const;

export const intakeUrgencyFlags = [
  "Immediate safety concern",
  "Eviction or housing loss",
  "Incarceration",
  "Asset seizure or execution",
  "Deadline within 7 days",
] as const;

export const intakeDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

export const intakeCreateSchema = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  domain: z.union([z.literal(""), z.enum(intakeDomains)]).default(""),
  documents: z.array(z.string().trim().min(1).max(255)).max(10).default([]),
  deadlineAt: intakeDateSchema.nullable().optional(),
  caseStage: z.union([z.literal(""), z.enum(intakeCaseStages)]).default(""),
  urgencyFlags: z.array(z.enum(intakeUrgencyFlags)).max(5).default([]),
  priorityScore: z.number().int().min(0).max(100).nullable().optional(),
}).strict();

const intakeAiReviewFactorSchema = z.object({
  score: z.number().int().min(0),
  rationale: z.string().trim().min(1).max(180),
}).strict();

const intakeAiReviewBaseSchema = z.object({
  provider: z.enum(["Gemini", "Groq"]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1200),
  domain: z.enum(intakeDomains),
  summary: z.string().trim().min(1).max(600),
  signals: z.array(z.string().trim().min(1).max(80)).max(6),
  deadlineAt: intakeDateSchema.nullable(),
  caseStage: z.union([z.literal(""), z.enum(intakeCaseStages)]),
  urgencyFlags: z.array(z.enum(intakeUrgencyFlags)).max(5),
  fieldSources: z.object({
    title: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
    description: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
    domain: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
    deadlineAt: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
    caseStage: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
    urgencyFlags: z.object({ document: z.string().max(255).nullable(), page: z.number().int().min(1).max(500).nullable() }).strict(),
  }).strict(),
  documentReview: z.object({
    processedCount: z.number().int().min(0).max(5),
    truncated: z.boolean(),
    visionUsed: z.boolean(),
  }).strict(),
}).strict();

export const intakeAiExtractionResponseSchema = z.object({
  extraction: intakeAiReviewBaseSchema.extend({
    title: z.string().trim().max(120),
    description: z.string().trim().max(1200),
  }).strict(),
}).strict();

export const intakeAiReviewResponseSchema = z.object({
  review: intakeAiReviewBaseSchema.extend({
    factors: z.object({
      temporalDeadlines: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(50) }),
      caseRiskImpact: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(30) }),
      proceduralStatus: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(20) }),
      severityBonus: intakeAiReviewFactorSchema.extend({ score: z.number().int().min(0).max(10) }),
    }).strict(),
    priorityScore: z.number().int().min(0).max(100),
    risk: z.enum(["Critical", "High", "Medium", "Low"]),
  }).strict(),
}).strict().superRefine(({ review }, context) => {
  const total = Math.min(100,
    review.factors.temporalDeadlines.score
      + review.factors.caseRiskImpact.score
      + review.factors.proceduralStatus.score
      + review.factors.severityBonus.score,
  );
  if (review.priorityScore !== total) {
    context.addIssue({
      code: "custom",
      message: "Priority score must equal the sum of its components.",
      path: ["review", "priorityScore"],
    });
  }
  const expectedRisk = total >= 80 ? "Critical" : total >= 60 ? "High" : total >= 30 ? "Medium" : "Low";
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
  risk: z.enum(["Critical", "High", "Medium", "Low", "Unassessed"]),
  client: z.string(),
  summary: z.string(),
  received: z.string(),
  receivedOrder: z.number(),
  deadline: z.string(),
  deadlineOrder: z.number(),
  deadlineAt: z.string().nullable(),
  caseStage: z.string(),
  urgencyFlags: z.array(z.string()),
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
