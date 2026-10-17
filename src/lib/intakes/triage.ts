export type IntakeRisk = "Critical" | "High" | "Medium" | "Unassessed";

export function getRiskFromScore(score: number | null): IntakeRisk {
  if (score === null) return "Unassessed";
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  return "Medium";
}

export function suggestIntakeDetails(title: string, description: string, documentNames: string[]) {
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
  const immediateDanger = /\b(immediate danger|physical danger|threatened|threat|violence|unsafe|safety risk)\b/.test(source);
  const imminentTiming = /\b(today|tomorrow|immediately|right away|within 24 hours)\b/.test(source);
  const statedDeadline = /\b(deadline|hearing|court date|filing date|file by|due by|summons)\b/.test(source);
  const approachingDeadline = imminentTiming || /\bwithin\s+\d+\s+days?\b/.test(source);
  const concreteImpact = /\b(unpaid wages|unpaid salary|job loss|lost (?:my )?job|eviction|injury|passport withheld|benefits withheld|locked out)\b/.test(source);
  const urgencyScore = immediateDanger ? 35 : imminentTiming ? 20 : 0;
  const deadlineScore = statedDeadline ? approachingDeadline ? 30 : 12 : 0;
  const impactScore = concreteImpact ? 20 : 0;
  const score = urgencyScore + deadlineScore + impactScore;
  const summary = description.trim()
    ? description.trim().replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0].slice(0, 220)
    : "No description entered. Add matter details or request an AI review of the selected documents.";
  const signals = [
    ...(immediateDanger ? ["Immediate safety concern stated"] : []),
    ...(imminentTiming ? ["Immediate timing stated"] : []),
    ...(statedDeadline ? ["A legal deadline or hearing is mentioned"] : []),
    ...(concreteImpact ? ["Concrete personal or financial impact stated"] : []),
  ];
  if (signals.length === 0) signals.push("No explicit urgency indicators found in entered details");

  return {
    title: title.trim(),
    description: description.trim(),
    specialty,
    summary,
    signals,
    score: score > 0 ? score : null,
    factors: {
      urgency: urgencyScore,
      deadline: deadlineScore,
      impact: impactScore,
    },
    documentsSelected: documentNames.length > 0,
  };
}
