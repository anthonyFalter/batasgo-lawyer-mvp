export type CitizenJournalHandoffContext = {
  messageId: string;
  title: string;
  entries: Array<{
    id: string;
    title: string;
    incidentDate: string;
    location: string;
    details: string;
  }>;
  attachments: string[];
};

export function isCitizenJournalHandoffContext(value: unknown): value is CitizenJournalHandoffContext {
  if (!value || typeof value !== "object") return false;
  const handoff = value as Partial<CitizenJournalHandoffContext>;
  return typeof handoff.messageId === "string"
    && handoff.messageId.length > 0
    && typeof handoff.title === "string"
    && handoff.title.length > 0
    && Array.isArray(handoff.entries)
    && handoff.entries.length <= 20
    && handoff.entries.every((entry) =>
      Boolean(entry)
      && typeof entry.id === "string"
      && typeof entry.title === "string"
      && typeof entry.incidentDate === "string"
      && typeof entry.location === "string"
      && typeof entry.details === "string",
    )
    && Array.isArray(handoff.attachments)
    && handoff.attachments.length <= 11
    && handoff.attachments.every((attachment) => typeof attachment === "string");
}
