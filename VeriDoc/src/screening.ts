export type Fields = {
  fullName: string | null;
  documentNumber: string | null;
  dateOfBirth: string | null;
  expiryDate: string | null;
};
export type Check = { name: string; status: string; detail: string };
export type Case = {
  id: string;
  createdAt: string;
  source: "demo" | "upload";
  fields: Fields;
  checks: Check[];
  status: string;
  issues: { title: string; detail: string; action: string }[];
  summary: string;
  notes: string;
};
export const stages = [
  "Image quality check",
  "OCR text extraction",
  "MRZ validation",
  "Expiry date validation",
  "Image analysis",
  "Report generation",
];
export function validateFile(file: Pick<File, "type" | "size">): string {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "Choose a PNG, JPG, JPEG, or WEBP image.";
  if (!file.size) return "This file is empty. Choose another image.";
  if (file.size > 10 * 1024 * 1024) return "The image exceeds the 10 MB limit.";
  return "";
}
export function expiryStatus(value: string | null, now = new Date()): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Needs Review";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return "Needs Review";
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return value < today ? "Expired" : "Pass";
}
export function createCase(demo: boolean): Case {
  const expiry = expiryStatus("2030-01-01");
  return {
    id: `CIV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    source: demo ? "demo" : "upload",
    fields: demo
      ? {
          fullName: "Alex Example",
          documentNumber: "DEMO-XX123456",
          dateOfBirth: "2000-01-01",
          expiryDate: "2030-01-01",
        }
      : {
          fullName: null,
          documentNumber: null,
          dateOfBirth: null,
          expiryDate: null,
        },
    checks: demo
      ? [
          {
            name: "OCR extraction",
            status: "Completed",
            detail:
              "Four fictional fixture fields. No OCR engine was executed; confidence unavailable.",
          },
          {
            name: "MRZ validation",
            status: "Needs Review",
            detail:
              "Illustrative scenario: one ambiguous MRZ character. No MRZ engine or check-digit validation ran.",
          },
          {
            name: "Expiry validation",
            status: expiry,
            detail: `Sample date 2030-01-01 compared with the current local date: ${expiry}.`,
          },
          {
            name: "Image analysis",
            status: "Not Connected",
            detail:
              "Image forensics, quality scoring, and face verification are not connected.",
          },
        ]
      : [
          "OCR extraction",
          "MRZ validation",
          "Expiry validation",
          "Image analysis",
        ].map((name) => ({
          name,
          status: "Not Run",
          detail:
            "Analysis not connected. No check was executed on this image.",
        })),
    status: demo ? "Review Required" : "Analysis Incomplete",
    issues: demo
      ? [
          {
            title: "Sample MRZ character needs review",
            detail:
              "Fictional scenario: the sample extraction contains an ambiguous character in the MRZ.",
            action:
              "Inspect the fictional MRZ and confirm the character before continuing.",
          },
        ]
      : [],
    summary: demo
      ? `Fictional demo: four fixture fields displayed; MRZ requires review; expiry check on the sample date: ${expiry}. Image forensics did not run. Human review remains required.`
      : "OCR unavailable. No backend is connected, so no fields were extracted and no MRZ, expiry, or image checks ran. This image has not been analyzed.",
    notes: "",
  };
}
export function readCases(): Case[] {
  const raw: unknown = JSON.parse(
    localStorage.getItem("coderiv.cases") || "[]",
  );
  if (
    !Array.isArray(raw) ||
    !raw.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        typeof c.createdAt === "string" &&
        ["demo", "upload"].includes(c.source) &&
        c.fields &&
        Array.isArray(c.checks) &&
        Array.isArray(c.issues) &&
        typeof c.summary === "string" &&
        typeof c.notes === "string",
    )
  )
    throw new Error("Invalid local case data");
  return raw;
}
export function reportJSON(c: Case) {
  return JSON.stringify(
    {
      ...c,
      disclaimer:
        "Prototype for human review. Demo fields and MRZ results are fictional. Uploaded images have not been analyzed. No authenticity determination is made.",
    },
    null,
    2,
  );
}

export const categoryLabels = {
  aadhaar: "Aadhaar Card",
  passport: "Passport",
  visa: "Visa",
  identity: "Identity document",
  certificate: "Certificate",
  invoice: "Invoice",
  other: "Other document",
} as const;
export type Category = keyof typeof categoryLabels;
export const fieldLabels: Record<string, string> = {
  aadhaarNumber: "Aadhaar number (masked)",
  nationality: "Nationality",
  dateOfBirthMrz: "MRZ birth date (YYMMDD)",
  expiryDateMrz: "MRZ expiry date (YYMMDD)",
  fullName: "Full name",
  documentNumber: "Document number",
  dateOfBirth: "Date of birth",
  expiryDate: "Expiry date",
  issueDate: "Issue date",
  issuer: "Issuer",
  invoiceNumber: "Invoice number",
  total: "Total",
};
export const defaultRequired: Record<Category, string[]> = {
  aadhaar: ["fullName", "dateOfBirth", "aadhaarNumber"],
  passport: [
    "fullName",
    "documentNumber",
    "dateOfBirth",
    "expiryDate",
    "issuer",
  ],
  visa: ["fullName", "documentNumber", "issuer", "issueDate", "expiryDate"],
  identity: ["fullName", "documentNumber", "dateOfBirth", "expiryDate"],
  certificate: ["fullName", "issuer", "issueDate"],
  invoice: ["invoiceNumber", "issueDate", "total"],
  other: [],
};
export interface RuleSettings {
  required?: string[];
  minTextChars: number;
  minImageWidth: number;
  minContrast: number;
}
export const defaultSettings: RuleSettings = {
  minTextChars: 25,
  minImageWidth: 600,
  minContrast: 12,
};
export interface RiskAssessment {
  score: number | null;
  level: "Low" | "Medium" | "High" | "Inconclusive";
  version: string;
  methodology: string;
  assessment: string;
  uncappedTotal: number;
  contributions: {
    findingId: string;
    title: string;
    rule: string;
    points: number;
    reason: string;
  }[];
  rules: {
    code: string;
    points: number;
    severity: string;
    explanation: string;
  }[];
}
export interface AnalysisReport {
  schemaVersion?: number;
  processingTimeMs?: number;
  risk?: RiskAssessment | null;
  id: string;
  fileName: string;
  category: Category;
  createdAt: string;
  source: "analysis";
  processingStatus: "Completed" | "Partial";
  status:
    | "No Suspicious Indicators Detected"
    | "Review Recommended"
    | "Analysis Incomplete";
  fields: Record<string, string | null>;
  text: string;
  confidence: number | null;
  checks: Check[];
  issues: {
    title: string;
    evidence: string;
    action: string;
    field: string;
    severity: string;
    id?: string;
    code?: string;
    points?: number;
    status?: string;
    explanation?: string;
  }[];
  metadata: Record<string, string | number | null>;
  rules: RuleSettings;
  limitations: string[];
  summary: string;
  notes: string;
}
export interface Health {
  status: string;
  ocrEnabled: boolean;
  ocrLanguage: string;
  retentionDays: number;
  maxFileBytes: number;
  maxPdfPages: number;
  maxScannedPages: number;
}
export function validateDocument(file: Pick<File, "type" | "size" | "name">) {
  if (
    !/\.(png|jpe?g|webp|pdf)$/i.test(file.name) ||
    !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
      file.type,
    )
  )
    return "Choose a PNG, JPG, JPEG, WEBP, or PDF document.";
  const expectedMime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (expectedMime[extension] !== file.type)
    return "The file extension and type do not match. Choose the original PNG, JPEG, WEBP, or PDF file.";
  if (!file.size) return "This file is empty. Choose another document.";
  return file.size > 10 * 1024 * 1024 ? "Maximum file size is 10 MB." : "";
}
export function exportReport(report: AnalysisReport) {
  return JSON.stringify(
    {
      ...report,
      disclaimer:
        "VeriDoc performs local heuristic screening. Completed checks do not establish authenticity. Unavailable checks and extraction limitations are listed explicitly.",
    },
    null,
    2,
  );
}
