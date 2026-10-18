export type IntakeRisk = "Critical" | "High" | "Medium" | "Low" | "Unassessed";

export function getRiskFromScore(score: number | null): IntakeRisk {
  if (score === null) return "Unassessed";
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

export function getRiskAction(risk: IntakeRisk): string {
  switch (risk) {
    case "Critical":
      return "Act today";
    case "High":
      return "Act this week";
    case "Medium":
      return "Needs attention soon";
    case "Low":
      return "Routine · no time pressure";
    case "Unassessed":
      return "Needs review";
  }
}

export function suggestIntakeDetails(title: string, description: string) {
  const source = `${title} ${description}`.toLowerCase();
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
            : "Other";
  const deadlineMentioned = /\b(deadline|hearing|court date|filing date|file by|due by|summons|statute of limitations)\b/.test(source);
  const daysUntilDeadline = source.match(/\b(?:within|in)\s+(\d{1,3})\s+days?\b/)?.[1];
  const deadlineTodayOrTomorrow = /\b(?:due )?(?:today|tomorrow|within 24 hours|within 48 hours)\b/.test(source);
  const days = daysUntilDeadline ? Number(daysUntilDeadline) : null;
  const temporalDeadlines = deadlineMentioned
    ? deadlineTodayOrTomorrow || (days !== null && days <= 2) ? 50
      : days !== null && days <= 7 ? 40
        : days !== null && days <= 30 ? 25
          : days !== null ? 10 : 8
    : 0;
  const caseRiskImpact = /\b(active (?:domestic )?violence|domestic violence|immediate danger|physical danger|life[- ]threatening|incarcerat(?:ed|ion)|judgment execution|asset seizure|asset loss|loss of assets|assets? (?:being|at risk of being) seized|eviction execution|injunction (?:issued|in effect|active))\b/.test(source)
    ? 30
    : /\b(threatened|violence|unsafe|safety risk|eviction|injury|passport withheld|benefits withheld|locked out|unpaid wages|unpaid salary|job loss|lost (?:my )?job)\b/.test(source)
      ? 15
      : 0;
  const proceduralStatus = /\b(judgment execution|writ of execution|enforcement proceedings|asset seizure|eviction execution|injunction (?:issued|in effect|active))\b/.test(source)
    ? 20
    : /\b(summons (?:was )?received|served with (?:a )?summons|case (?:was )?filed|pending hearing|hearing scheduled)\b/.test(source)
      ? 13
      : /\b(demand letter|formal notice|notice to appear)\b/.test(source)
        ? 7
        : /\b(pre[- ]litigation|before filing suit|no case filed)\b/.test(source)
          ? 2
          : 0;
  const score = Math.min(100, temporalDeadlines + caseRiskImpact + proceduralStatus);
  const summary = description.trim()
    ? description.trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 220)
    : "No description entered. Add matter details or request an AI review of the selected documents.";
  const signals = [
    ...(deadlineMentioned ? ["A legal deadline or hearing is mentioned"] : []),
    ...(caseRiskImpact > 0 ? ["A concrete risk or impact is stated"] : []),
    ...(proceduralStatus > 0 ? ["A procedural stage is stated"] : []),
  ];

  return {
    title: title.trim(),
    description: description.trim(),
    specialty,
    summary,
    signals,
    score: score > 0 ? score : null,
    factors: {
      temporalDeadlines,
      caseRiskImpact,
      proceduralStatus,
      severityBonus: 0,
    },
  };
}
