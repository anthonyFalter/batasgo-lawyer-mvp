import { z } from "zod";

export const citizenConversationCreateSchema = z.object({
  lawyerProfileId: z.string().uuid(),
  citizenDisplayName: z.string().trim().min(1).max(80).default("Citizen"),
  subject: z.string().trim().min(1).max(120).default("Legal consultation"),
}).strict();

export const citizenMessageCreateSchema = z.object({
  text: z.string().trim().min(1).max(4000),
}).strict();

export const citizenLawyerProfileSchema = z.object({
  specialty: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(600).default(""),
  listed: z.boolean(),
}).strict();

export const citizenJournalEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120).refine((value) => value.trim().length > 0),
  incidentDate: z.string().max(40),
  location: z.string().max(160),
  details: z.string().min(1).max(20_000).refine((value) => value.trim().length > 0),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();

export const citizenHandoffPayloadSchema = z.object({
  handoffId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  consented: z.literal(true),
  entries: z.array(citizenJournalEntrySchema).min(1).max(20),
  attachments: z.array(z.object({
    sourceEntryId: z.string().uuid(),
    fileName: z.string().min(1).max(180).refine((value) => value.trim().length > 0),
    contentType: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/plain",
      "audio/mpeg",
      "audio/wav",
      "video/mp4",
    ]),
  }).strict()).max(11),
}).strict().superRefine((payload, context) => {
  const entryIds = new Set(payload.entries.map((entry) => entry.id));
  for (const [index, attachment] of payload.attachments.entries()) {
    if (!entryIds.has(attachment.sourceEntryId)) {
      context.addIssue({
        code: "custom",
        message: "Each attachment must belong to a selected journal entry.",
        path: ["attachments", index, "sourceEntryId"],
      });
    }
  }

  const totalDetailsLength = payload.entries.reduce((total, entry) => total + entry.details.length, 0);
  if (totalDetailsLength > 40_000) {
    context.addIssue({
      code: "custom",
      message: "Selected journal entries exceed the maximum handoff size.",
      path: ["entries"],
    });
  }
});
