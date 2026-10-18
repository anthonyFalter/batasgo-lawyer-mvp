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

export type IntakeUrgencyFactor = { score: number; rationale: string };
export type IntakeUrgencyFactors = {
  temporalDeadlines: IntakeUrgencyFactor;
  caseRiskImpact: IntakeUrgencyFactor;
  proceduralStatus: IntakeUrgencyFactor;
  severityBonus: IntakeUrgencyFactor;
};

type IntakeUrgencyInput = {
  title: string;
  description: string;
  deadlineAt: string | null;
  caseStage: string;
  urgencyFlags: readonly string[];
};

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDeadlineScore(deadlineAt: string | null, urgencyFlags: readonly string[], text: string, now: Date) {
  if (deadlineAt) {
    const [year, month, day] = deadlineAt.split("-").map(Number);
    const [todayYear, todayMonth, todayDay] = getLocalDateKey(now).split("-").map(Number);
    const deadlineTime = Date.UTC(year, month - 1, day);
    const todayTime = Date.UTC(todayYear, todayMonth - 1, todayDay);
    const daysRemaining = Math.floor((deadlineTime - todayTime) / 86_400_000);
    if (daysRemaining <= 2) {
      return { score: 50, rationale: daysRemaining < 0 ? "The confirmed deadline has passed." : "The confirmed deadline is within 48 hours." };
    }
    if (daysRemaining <= 7) return { score: 40, rationale: "The confirmed deadline is within 7 days." };
    if (daysRemaining <= 30) return { score: 25, rationale: "The confirmed deadline is within 30 days." };
    return { score: 10, rationale: "A confirmed deadline is more than 30 days away." };
  }

  if (urgencyFlags.includes("Deadline within 7 days")) {
    return { score: 40, rationale: "The confirmed urgency flag states a deadline within 7 days." };
  }
  if (/\b(?:due\s+)?(?:today|tomorrow|within\s+24\s+hours|within\s+48\s+hours)\b/.test(text)) {
    return { score: 50, rationale: "The details state a deadline within 48 hours." };
  }
  if (/\b(?:within|in)\s+(?:3|4|5|6|7)\s+days?\b/.test(text)) {
    return { score: 40, rationale: "The details state a deadline within 7 days." };
  }
  if (/\b(?:within|in)\s+(?:[89]|[12]\d|30)\s+days?\b/.test(text)) {
    return { score: 25, rationale: "The details state a deadline within 30 days." };
  }
  if (/\b(?:deadline|hearing|court date|filing date|file by|due by|statute of limitations)\b/.test(text)) {
    return { score: 8, rationale: "A legal deadline or hearing is mentioned, but its date is not confirmed." };
  }
  return { score: 0, rationale: "No confirmed deadline or hearing date was provided." };
}

function getCaseRiskScore(urgencyFlags: readonly string[], text: string) {
  if (
    urgencyFlags.includes("Immediate safety concern")
    || urgencyFlags.includes("Incarceration")
    || /\b(?:active (?:domestic )?violence|domestic violence|immediate danger|imminent danger|physical danger|life[- ]threatening|incarcerat(?:ed|ion))\b/.test(text)
  ) {
    return { score: 30, rationale: "The confirmed details report an immediate safety or liberty risk." };
  }
  if (
    urgencyFlags.includes("Eviction or housing loss")
    || urgencyFlags.includes("Asset seizure or execution")
    || /\b(?:eviction(?: execution)?|housing loss|asset seizure|judgment execution|writ of execution|enforcement proceedings|active injunction)\b/.test(text)
  ) {
    return { score: 20, rationale: "The confirmed details report a severe housing, asset, or enforcement consequence." };
  }
  if (/\b(?:operational losses?|business losses?|financial losses?|unpaid wages?|unpaid salary|lost income|income loss)\b/.test(text)) {
    return { score: 5, rationale: "The confirmed details report operational or financial losses without an immediate harm signal." };
  }
  if (/\b(?:threatened|violence|unsafe|safety risk|injury|passport withheld|benefits withheld|locked out|job loss|lost (?:my )?job)\b/.test(text)) {
    return { score: 15, rationale: "The confirmed details report a material risk or impact." };
  }
  return { score: 0, rationale: "No immediate risk or severe consequence was confirmed." };
}

function getProceduralScore(caseStage: string, text: string) {
  const stage = caseStage || (
    /\b(?:judgment execution|writ of execution|enforcement proceedings|asset seizure|eviction execution)\b/.test(text)
      ? "Judgment / enforcement"
      : /\b(?:summons (?:was )?received|served with (?:a )?summons|case (?:was )?filed|pending hearing|hearing scheduled)\b/.test(text)
        ? "Summons / active case"
        : /\b(?:demand letter|formal notice|notice to appear)\b/.test(text)
          ? "Formal notice"
          : /\b(?:pre[- ]litigation|before filing suit|no case filed)\b/.test(text)
            ? "Pre-litigation"
            : ""
  );

  switch (stage) {
    case "Pre-litigation":
      return { score: 10, rationale: "The matter is confirmed as pre-litigation." };
    case "Formal notice":
      return { score: 10, rationale: "A formal notice or demand has been received." };
    case "Summons / active case":
      return { score: 15, rationale: "A summons or active court case is confirmed." };
    case "Judgment / enforcement":
      return { score: 20, rationale: "A judgment or enforcement stage is confirmed." };
    default:
      return { score: 0, rationale: "No procedural stage was confirmed." };
  }
}

export function scoreIntakeUrgency(input: IntakeUrgencyInput, now = new Date()) {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const temporalDeadlines = getDeadlineScore(input.deadlineAt, input.urgencyFlags, text, now);
  const caseRiskImpact = getCaseRiskScore(input.urgencyFlags, text);
  const proceduralStatus = getProceduralScore(input.caseStage, text);
  const activeCategories = [temporalDeadlines, caseRiskImpact, proceduralStatus].filter(({ score }) => score > 0).length;
  const severityBonus = activeCategories >= 3 && (temporalDeadlines.score === 50 || caseRiskImpact.score === 30)
    ? { score: 10, rationale: "Three urgency categories combine with an immediate deadline or critical risk." }
    : activeCategories >= 2
      ? { score: 5, rationale: "Two or more urgency categories are present together." }
      : { score: 0, rationale: "Multiple urgency categories are not present together." };
  const factors = { temporalDeadlines, caseRiskImpact, proceduralStatus, severityBonus };
  const score = Math.min(100,
    temporalDeadlines.score + caseRiskImpact.score + proceduralStatus.score + severityBonus.score,
  );
  const signals = [
    ...(temporalDeadlines.score > 0 ? ["A time-sensitive deadline or hearing is confirmed"] : []),
    ...(caseRiskImpact.score > 0 ? ["A risk or material impact is confirmed"] : []),
    ...(proceduralStatus.score > 0 ? ["A procedural stage is confirmed"] : []),
  ];

  return { score, factors, signals };
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
