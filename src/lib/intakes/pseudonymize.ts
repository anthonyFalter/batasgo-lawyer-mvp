const identifierPatterns = [
  {
    type: "ID",
    pattern: /\b(?:TIN|SSS|PhilHealth|passport|national\s+ID|ID\s+number)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Z0-9-]{6,}\b/gi,
  },
  {
    type: "PHONE",
    pattern: /(?<!\w)(?:\+?63[\s-]?)?0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\w)/g,
  },
  {
    type: "ADDRESS",
    pattern: /\b(?:home\s+address|residential\s+address|address|residing\s+at)\s*[:,-]?\s*[^,\n;]{4,100}/gi,
  },
] as const;

const personPatterns = [
  /\b(?:(?:client|applicant|employee|plaintiff|defendant|complainant|respondent)(?:\s*[:,-]\s*|\s+(?:is|named|name is)\s+)|represented by\s+)((?:[A-Z][a-z]+|[A-Z]\.)\s+(?:[A-Z][a-z]+|[A-Z]\.)(?:\s+(?:[A-Z][a-z]+|[A-Z]\.))?)/gi,
  /\b(?:Mr|Mrs|Ms|Miss|Atty|Attorney|Dr)\.?\s+((?:[A-Z][a-z]+|[A-Z]\.)\s+(?:[A-Z][a-z]+|[A-Z]\.)(?:\s+(?:[A-Z][a-z]+|[A-Z]\.))?)/gi,
];

export function createIdentifierPseudonymizer() {
  const tokensByValue = new Map<string, string>();
  const valuesByToken = new Map<string, string>();
  let nextIdentifier = 1;

  const tokenFor = (value: string, type: string) => {
    const key = value.toLocaleLowerCase();
    const existing = tokensByValue.get(key);
    if (existing) return existing;
    const token = `[${type}_${nextIdentifier++}]`;
    tokensByValue.set(key, token);
    valuesByToken.set(token, value);
    return token;
  };

  return {
    redact(value: string) {
      let redacted = value;
      for (const { type, pattern } of identifierPatterns) {
        redacted = redacted.replace(pattern, (match) => tokenFor(match, type));
      }
      for (const pattern of personPatterns) {
        redacted = redacted.replace(pattern, (match, name: string) =>
          match.replace(name, tokenFor(name, "CLIENT")),
        );
      }
      return redacted;
    },
    restore(value: string) {
      return value.replace(/\[(?:CLIENT|PHONE|ADDRESS|ID)_\d+\]/g, (token) =>
        valuesByToken.get(token) ?? token,
      );
    },
  };
}
