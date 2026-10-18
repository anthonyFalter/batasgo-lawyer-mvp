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

export const journalIntakeHandoffStorageKey = "batasgo-journal-intake-handoff";

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

export function createCitizenJournalTextFile(handoff: CitizenJournalHandoffContext) {
  const entries = handoff.entries.length
    ? handoff.entries.map((entry, index) => [
      `ENTRY ${index + 1}: ${entry.title}`,
      `Incident date: ${entry.incidentDate || "Not stated"}`,
      entry.location ? `Location: ${entry.location}` : "",
      "Client-reported details:",
      entry.details,
    ].filter(Boolean).join("\n")).join("\n\n")
    : "No journal entry details were included.";
  const attachmentList = handoff.attachments.length
    ? `\n\nOther attachments shared with this journal (not included in this text file):\n${handoff.attachments.map((name) => `- ${name}`).join("\n")}`
    : "";
  const safeTitle = handoff.title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "citizen-journal";
  const contents = [
    "BATASGO CITIZEN JOURNAL HANDOFF",
    `Journal: ${handoff.title}`,
    `Reference: ${handoff.messageId}`,
    "",
    "The following information was shared by the citizen. Treat it as unverified reported facts.",
    "Incident dates below are not legal deadlines unless independently confirmed.",
    "",
    entries,
    attachmentList,
  ].join("\n");

  return new File([contents], `${safeTitle}-journal.txt`, { type: "text/plain" });
}
