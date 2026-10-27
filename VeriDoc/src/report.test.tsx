import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseAnalysisReport, parseHistory } from "./report-schema";
import { printableReport, checkOutcome } from "./report-presentation";
import { ReportView } from "./report-view";
import { screeningService, request } from "./api";
const base = () => ({
  id: "VD-TEST-ONLY",
  category: "passport",
  createdAt: "2026-10-27T00:00:00Z",
  source: "analysis",
  processingStatus: "Completed",
  status: "Review Recommended",
  checks: [
    {
      name: "Text extraction",
      status: "Completed",
      detail: "Test extraction fixture.",
    },
  ],
  issues: [
    {
      title: "Expired",
      field: "expiryDate",
      severity: "Low",
      evidence: "2012-04-15",
      action: "Inspect source",
      explanation: "Expiry is not evidence of forgery.",
    },
  ],
  fields: { fullName: "Alex Example" },
  notes: "Reviewer note",
});
afterEach(() => vi.unstubAllGlobals());
describe("analysis response boundary", () => {
  it("rejects code, raw JSON strings and error objects as successful reports", () => {
    for (const value of [
      'print("report")',
      '{"summary":"ok"}',
      { error: "stack trace" },
      null,
    ])
      expect(() => parseAnalysisReport(value)).toThrow(
        "invalid analysis report",
      );
    expect(() => parseHistory({ data: [] })).toThrow(
      "invalid analysis history",
    );
  });
  it("normalizes optional nulls without crashing, and does not infer successful coverage", () => {
    const r = parseAnalysisReport({
      ...base(),
      fields: null,
      text: null,
      checks: null,
      issues: null,
      limitations: null,
      rules: null,
      metadata: null,
      summary: '{"raw":"json"}',
    });
    expect(r.status).toBe("Analysis Incomplete");
    expect(r.fields).toEqual({});
    expect(r.summary).not.toContain("{");
    expect(r.risk).toBeNull();
    expect(
      renderToStaticMarkup(
        <ReportView
          report={r}
          notes=""
          setNotes={() => {}}
          onSave={() => {}}
          saving={false}
          onReset={() => {}}
          notify={() => {}}
        />,
      ),
    ).toContain("Not detected");
  });
  it("redacts Aadhaar fields, notes and raw text before display", () => {
    const r = parseAnalysisReport({
      ...base(),
      category: "aadhaar",
      fields: { aadhaarNumber: "234567890123" },
      text: "2345 6789 0123",
      notes: "2345-6789-0123",
    });
    expect(r.fields.aadhaarNumber).toBe("XXXX XXXX 0123");
    expect(r.text).toBe("");
    expect(r.notes).not.toContain("2345");
  });
  it("does not invent a score for legacy or invalid risk responses", () => {
    expect(parseAnalysisReport(base()).risk).toBeNull();
    expect(
      parseAnalysisReport({
        ...base(),
        risk: {
          score: 99,
          level: "Low",
          methodology: "invalid",
          contributions: [],
          rules: [],
        },
      }).risk,
    ).toBeNull();
  });
  it("validates all history entries rather than trusting a successful HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => [{ error: "not a report" }],
        }),
    );
    await expect(screeningService.history()).rejects.toThrow(
      "invalid analysis report",
    );
  });
  it("keeps structured error objects out of user-facing error strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: { stack: "private internal" } }),
        }),
    );
    await expect(request("/health")).rejects.toThrow("HTTP 500");
  });
});
describe("readable reports", () => {
  it("exports a real HTML report with all requested sections and escaped content", () => {
    const r = parseAnalysisReport({
      ...base(),
      fileName: "<script>alert(1)</script>.pdf",
    });
    const html = printableReport(r);
    for (const title of [
      "Analysis Summary",
      "Document Information",
      "Detailed Findings",
      "Verification Checks",
      "Risk Assessment",
      "Limitations &amp; Disclaimer",
      "Reviewer Notes",
    ])
      expect(html).toContain(title);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Reviewer note");
    expect(html).toContain("not a calibrated");
  });
  it("renders rules as labels, never raw JSON, and offers print and distinct data export actions", () => {
    const r = parseAnalysisReport(base());
    const html = renderToStaticMarkup(
      <ReportView
        report={r}
        notes={r.notes}
        setNotes={() => {}}
        onSave={() => {}}
        saving={false}
        onReset={() => {}}
        notify={() => {}}
      />,
    );
    expect(html).toContain("Minimum readable characters");
    expect(html).not.toContain("minTextChars");
    expect(html).toContain("Print / Save PDF");
    expect(html).toContain("Export Data (JSON)");
    expect(html).toContain("Why it matters:");
  });
  it("distinguishes technical check outcomes", () => {
    expect(checkOutcome("Completed")).toBe("Passed");
    expect(checkOutcome("Review")).toBe("Warning");
    expect(checkOutcome("Failed")).toBe("Failed");
    expect(checkOutcome("Not Available")).toBe("Not checked");
  });
});
