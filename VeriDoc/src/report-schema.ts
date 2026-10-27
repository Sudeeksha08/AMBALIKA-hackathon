import {
  categoryLabels,
  defaultRequired,
  defaultSettings,
  type AnalysisReport,
  type Category,
  type RiskAssessment,
} from "./screening";
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function maskDisplay(value: string) {
  return value.replace(
    /(?<!\d)\d{4}[\s\u200B-]*\d{4}[\s\u200B-]*(\d{4})(?!\d)/g,
    "XXXX XXXX $1",
  );
}
export function readable(value: unknown, fallback = "Not supplied"): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const text = value.trim();
  if (
    /^[{[]/.test(text) ||
    /^(?:Traceback|SyntaxError|TypeError|Error:|import\s|export\s|def\s|function\s|const\s|class\s)/.test(
      text,
    )
  )
    return fallback;
  return maskDisplay(text);
}
function parseRisk(value: unknown): RiskAssessment | null {
  if (
    !record(value) ||
    !Array.isArray(value.rules) ||
    !Array.isArray(value.contributions) ||
    typeof value.methodology !== "string"
  )
    return null;
  if (
    value.score !== null &&
    (typeof value.score !== "number" ||
      !Number.isFinite(value.score) ||
      value.score < 0 ||
      value.score > 100)
  )
    return null;
  const expected =
    value.score === null
      ? "Inconclusive"
      : Number(value.score) < 30
        ? "Low"
        : Number(value.score) < 60
          ? "Medium"
          : "High";
  if (value.level !== expected) return null;
  if (
    value.score !== null &&
    value.score !==
      Math.min(
        100,
        value.contributions
          .filter(record)
          .reduce(
            (total, c) =>
              total +
              (typeof c.points === "number" &&
              Number.isFinite(c.points) &&
              c.points >= 0
                ? c.points
                : 0),
            0,
          ),
      )
  )
    return null;
  return {
    score: value.score as number | null,
    level: expected,
    version: readable(value.version, "Unspecified"),
    methodology: readable(value.methodology),
    assessment: readable(value.assessment, "Manual review required"),
    uncappedTotal:
      typeof value.uncappedTotal === "number" ? value.uncappedTotal : 0,
    contributions: value.contributions
      .filter(record)
      .map((c) => ({
        findingId: readable(c.findingId),
        title: readable(c.title, "Review indicator"),
        rule: readable(c.rule),
        points:
          typeof c.points === "number" && Number.isFinite(c.points)
            ? Math.max(0, c.points)
            : 0,
        reason: readable(c.reason),
      })),
    rules: value.rules
      .filter(record)
      .map((r) => ({
        code: readable(r.code),
        points:
          typeof r.points === "number" && Number.isFinite(r.points)
            ? Math.max(0, r.points)
            : 0,
        severity: readable(r.severity, "Review"),
        explanation: readable(r.explanation),
      })),
  };
}
export function parseAnalysisReport(value: unknown): AnalysisReport {
  if (
    !record(value) ||
    value.source !== "analysis" ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.category !== "string" ||
    !Object.hasOwn(categoryLabels, value.category) ||
    typeof value.createdAt !== "string" ||
    isNaN(Date.parse(value.createdAt)) ||
    ![
      "No Suspicious Indicators Detected",
      "Review Recommended",
      "Analysis Incomplete",
    ].includes(String(value.status))
  )
    throw new Error(
      "The backend returned an invalid analysis report. Refresh history or check the backend logs; no results were substituted.",
    );
  const category = value.category as Category;
  const checks = Array.isArray(value.checks)
    ? value.checks
        .filter(record)
        .map((c) => ({
          name: readable(c.name, "Unspecified check"),
          status: readable(c.status, "Not checked"),
          detail: readable(c.detail, "No check explanation supplied."),
        }))
    : [];
  const missingCoverage = !checks.length || !Array.isArray(value.issues);
  const incomplete =
    missingCoverage ||
    value.processingStatus !== "Completed" ||
    value.status === "Analysis Incomplete";
  const fields = record(value.fields)
    ? Object.fromEntries(
        Object.entries(value.fields).map(([k, v]) => [
          k,
          typeof v === "string" ? readable(v, "Not detected") : null,
        ]),
      )
    : {};
  const rules = record(value.rules) ? value.rules : {};
  const risk = parseRisk(value.risk);
  if (incomplete && risk) {
    risk.score = null;
    risk.level = "Inconclusive";
    risk.assessment = "Manual review required";
  }
  return {
    id: maskDisplay(value.id),
    category,
    source: "analysis",
    fileName: readable(value.fileName, "Filename unavailable"),
    createdAt: value.createdAt,
    processingStatus: incomplete ? "Partial" : "Completed",
    status: incomplete
      ? "Analysis Incomplete"
      : (value.status as AnalysisReport["status"]),
    schemaVersion:
      typeof value.schemaVersion === "number" ? value.schemaVersion : undefined,
    processingTimeMs:
      typeof value.processingTimeMs === "number" &&
      Number.isFinite(value.processingTimeMs) &&
      value.processingTimeMs >= 0
        ? value.processingTimeMs
        : undefined,
    fields,
    text:
      category === "aadhaar"
        ? ""
        : typeof value.text === "string"
          ? maskDisplay(value.text)
          : "",
    confidence:
      typeof value.confidence === "number" &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 100
        ? value.confidence
        : null,
    checks,
    issues: Array.isArray(value.issues)
      ? value.issues
          .filter(record)
          .map((i, n) => ({
            id: readable(i.id, `finding-${n + 1}`),
            title: readable(i.title, "Review indicator"),
            evidence: readable(i.evidence, "Evidence not supplied."),
            action: readable(i.action, "Inspect the original document."),
            field: readable(i.field, "document"),
            severity: readable(i.severity, "Review"),
            status: readable(i.status, "Review recommended"),
            explanation: readable(
              i.explanation,
              "This finding requires a reviewer to compare the extracted information with the original.",
            ),
            points:
              typeof i.points === "number" && Number.isFinite(i.points)
                ? i.points
                : undefined,
            code: typeof i.code === "string" ? i.code : undefined,
          }))
      : [],
    metadata: record(value.metadata)
      ? Object.fromEntries(
          Object.entries(value.metadata)
            .filter(
              ([, v]) =>
                v === null ||
                typeof v === "string" ||
                (typeof v === "number" && Number.isFinite(v)),
            )
            .map(([k, v]) => [
              k,
              typeof v === "string" ? maskDisplay(v) : (v as number | null),
            ]),
        )
      : {},
    rules: {
      ...defaultSettings,
      ...Object.fromEntries(
        Object.entries(rules).filter(
          ([k, v]) =>
            ["minTextChars", "minImageWidth", "minContrast"].includes(k) &&
            typeof v === "number" &&
            Number.isFinite(v),
        ),
      ),
      required: Array.isArray(rules.required)
        ? rules.required.filter((k): k is string => typeof k === "string")
        : defaultRequired[category],
    },
    limitations: [
      ...(Array.isArray(value.limitations)
        ? value.limitations.map((v) => readable(v, "Unspecified limitation."))
        : []),
      ...(missingCoverage
        ? [
            "Verification coverage was missing from the response; no complete assessment can be shown.",
          ]
        : []),
    ],
    summary: readable(
      value.summary,
      `${checks.length} check records and ${Array.isArray(value.issues) ? value.issues.length : 0} findings returned. Review the evidence and limitations below.`,
    ),
    notes: typeof value.notes === "string" ? maskDisplay(value.notes) : "",
    risk,
  };
}
export function parseHistory(value: unknown) {
  if (!Array.isArray(value))
    throw new Error(
      "The backend returned invalid analysis history. No example records were substituted.",
    );
  return value.map(parseAnalysisReport);
}
