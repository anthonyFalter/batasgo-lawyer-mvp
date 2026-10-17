export type IntakeRisk = "Critical" | "High" | "Medium";

export function getRiskFromScore(score: number): IntakeRisk {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  return "Medium";
}

export function suggestIntakeDetails(title: string, description: string, documentNames: string[]) {
  const source = `${title} ${description} ${documentNames.join(" ")}`.toLowerCase();
  const specialty = /employment|labor|workplace|wage|salary|dismissal|employer/.test(source)
    ? "Labor & Employment"
    : /divorce|custody|marriage|family|spouse|inheritance/.test(source)
      ? "Family Law"
      : /criminal|arrest|police|prosecution|bail/.test(source)
        ? "Criminal Defense"
        : /immigration|visa|deportation|citizenship/.test(source)
          ? "Immigration"
          : /contract|company|corporate|business|shareholder/.test(source)
            ? "Corporate & Commercial"
            : "Civil Disputes";
  const topic = /passport|withheld/.test(source)
    ? "passport withholding"
    : /wage|salary|compensation|unpaid/.test(source)
      ? "unpaid compensation"
      : /dismiss|termination|fired/.test(source)
        ? "an employment separation"
        : /custody|divorce|spouse/.test(source)
          ? "a family law concern"
          : /contract|agreement|invoice|payment/.test(source)
            ? "a contract or payment dispute"
            : "a matter requiring legal review";
  const suggestedTitle = title.trim() || `${specialty} matter`;
  const suggestedDescription = description.trim()
    || `Prospective ${specialty.toLowerCase()} matter involving ${topic}. Review the submitted materials, confirm the key parties and dates, and identify any upcoming deadlines.`;
  const summary = description.trim()
    ? description.trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 220)
    : `A ${specialty.toLowerCase()} inquiry${documentNames.length ? ` with ${documentNames.length} selected file name${documentNames.length === 1 ? "" : "s"}` : ""}. Review key facts and deadlines before proceeding.`;
  const signals = [
    { pattern: /deadline|hearing|court|summons|urgent|today|overdue/, label: "Time-sensitive" },
    { pattern: /threat|violence|safety|eviction|passport|withheld/, label: "Immediate impact" },
    { pattern: /unpaid|wage|salary|dismiss|termination|filing/, label: "Employment or financial concern" },
  ].filter(({ pattern }) => pattern.test(source)).map(({ label }) => label);
  if (documentNames.length) signals.push(`${documentNames.length} selected file name${documentNames.length === 1 ? "" : "s"}`);
  if (signals.length === 0) signals.push("Initial review needed");
  const score = Math.min(
    98,
    42
      + (/deadline|hearing|court|summons|urgent|today|overdue/.test(source) ? 28 : 0)
      + (/threat|violence|safety|eviction|passport|withheld/.test(source) ? 20 : 0)
      + (/unpaid|wage|salary|dismiss|termination|filing/.test(source) ? 16 : 0)
      + (documentNames.length > 0 ? 5 : 0),
  );

  return { title: suggestedTitle, description: suggestedDescription, specialty, summary, signals, score };
}
