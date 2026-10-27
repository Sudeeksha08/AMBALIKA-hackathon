import { maskIdentifiers } from "./privacy.mjs";
export const scoreRules = [
  {
    code: "missing_field",
    points: 8,
    severity: "Low",
    explanation:
      "An expected field was not extracted. Templates and OCR can cause omissions.",
  },
  {
    code: "document_marker",
    points: 15,
    severity: "Medium",
    explanation:
      "Expected document text is missing, so the selected type needs confirmation.",
  },
  {
    code: "field_format",
    points: 12,
    severity: "Medium",
    explanation:
      "An extracted field does not match a supported structural format.",
  },
  {
    code: "field_conflict",
    points: 20,
    severity: "High",
    explanation: "Conflicting values need comparison with the source document.",
  },
  {
    code: "date_invalid",
    points: 12,
    severity: "Medium",
    explanation:
      "The extracted date cannot be reliably parsed by supported rules.",
  },
  {
    code: "date_future",
    points: 15,
    severity: "Medium",
    explanation: "A birth or issue date appears to be in the future.",
  },
  {
    code: "date_order",
    points: 20,
    severity: "High",
    explanation:
      "The extracted dates have an inconsistent chronological order.",
  },
  {
    code: "date_expired",
    points: 10,
    severity: "Low",
    explanation:
      "The expiry date has passed. Expiry is not evidence of forgery.",
  },
  {
    code: "mrz_checksum",
    points: 25,
    severity: "High",
    explanation:
      "An extracted check digit does not match the calculated text checksum; OCR may be responsible.",
  },
  {
    code: "mrz_format",
    points: 15,
    severity: "Medium",
    explanation: "An MRZ candidate has an unsupported or malformed layout.",
  },
  {
    code: "mrz_conflict",
    points: 25,
    severity: "High",
    explanation: "MRZ and visible extracted values disagree.",
  },
  {
    code: "quality",
    points: 10,
    severity: "Low",
    explanation:
      "A measured readability limitation reduces the reliability of extraction.",
  },
  {
    code: "pdf_metadata",
    points: 10,
    severity: "Low",
    explanation:
      "A technical PDF property warrants inspection; it does not prove fraud.",
  },
  {
    code: "insufficient_text",
    points: 0,
    severity: "Medium",
    explanation:
      "Insufficient readable content prevents a complete assessment. No fraud points are assigned for extraction failure.",
  },
];
function codeFor(issue) {
  const t = issue.title.toLowerCase();
  return (
    issue.code ||
    (t.startsWith("expected ")
      ? "missing_field"
      : t.includes("conflicting")
        ? "field_conflict"
        : t.includes("format")
          ? "field_format"
          : t.includes("unrecognized") && t.includes("date")
            ? "date_invalid"
            : t.includes("future")
              ? "date_future"
              : t.includes("date ordering") && !t.includes("pdf")
                ? "date_order"
                : t.includes("expiry date has passed")
                  ? "date_expired"
                  : t.includes("pdf")
                    ? "pdf_metadata"
                    : t.includes("insufficient")
                      ? "insufficient_text"
                      : "quality")
  );
}
export function assessRisk(issues, incomplete) {
  const scored = issues.map((issue, index) => {
    const rule = scoreRules.find((r) => r.code === codeFor(issue));
    return {
      ...issue,
      id: `finding-${index + 1}`,
      code: rule.code,
      severity: rule.severity,
      points: rule.points,
      status: "Review recommended",
      explanation: rule.explanation,
    };
  });
  const seen = new Set();
  const contributions = scored.map((i) => {
    const key = `${i.code}:${i.field || "document"}`;
    const counted = !seen.has(key);
    seen.add(key);
    return {
      findingId: i.id,
      title: i.title,
      rule: i.code,
      points: counted ? i.points : 0,
      reason: counted
        ? i.explanation
        : "Same rule and field already counted; no duplicate points.",
    };
  });
  const total = contributions.reduce((sum, item) => sum + item.points, 0),
    score = incomplete ? null : Math.min(100, total);
  return {
    issues: scored,
    risk: {
      version: "screening-v1",
      score,
      level:
        score === null
          ? "Inconclusive"
          : score < 30
            ? "Low"
            : score < 60
              ? "Medium"
              : "High",
      assessment:
        score === null
          ? "Manual review required"
          : "Preliminary screening indicators",
      methodology:
        "Add documented finding weights, counting each rule/field pair once; cap the sum at 100. Low 0–29, Medium 30–59, High 60–100. Incomplete extraction or important coverage returns no numerical score. This is not a calibrated fraud probability.",
      uncappedTotal: total,
      contributions,
      rules: scoreRules,
    },
  };
}
export function finalizeReport(report) {
  // Old reports keep their original results. Never retrospectively invent a score.
  return maskIdentifiers(report);
}
