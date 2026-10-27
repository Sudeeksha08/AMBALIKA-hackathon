import { describe, expect, it } from "vitest";
import {
  createCase,
  expiryStatus,
  reportJSON,
  validateFile,
} from "./screening";
describe("upload validation", () => {
  it("accepts supported images only within 10 MB", () => {
    expect(validateFile({ type: "image/png", size: 1024 })).toBe("");
    expect(validateFile({ type: "image/jpeg", size: 10 * 1024 * 1024 })).toBe(
      "",
    );
    expect(validateFile({ type: "application/pdf", size: 20 })).toContain(
      "PNG",
    );
    expect(
      validateFile({ type: "image/webp", size: 10 * 1024 * 1024 + 1 }),
    ).toContain("10 MB");
    expect(validateFile({ type: "image/png", size: 0 })).toContain("empty");
  });
});
describe("expiry validation", () => {
  const now = new Date(2026, 9, 27, 12);
  it("treats today as valid and yesterday as expired", () => {
    expect(expiryStatus("2026-10-27", now)).toBe("Pass");
    expect(expiryStatus("2026-10-26", now)).toBe("Expired");
  });
  it("rejects missing and impossible dates", () => {
    for (const value of [null, "bad", "2026-02-30", "2026-13-01"])
      expect(expiryStatus(value, now)).toBe("Needs Review");
  });
});
describe("responsible result handling", () => {
  it("never supplies fictional extracted fields for uploads", () => {
    const c = createCase(false);
    expect(Object.values(c.fields).every((v) => v === null)).toBe(true);
    expect(c.checks.every((v) => v.status === "Not Run")).toBe(true);
    expect(c.issues).toEqual([]);
    expect(c.status).toBe("Analysis Incomplete");
  });
  it("labels fixtures and does not claim image forensics ran", () => {
    const c = createCase(true);
    expect(c.source).toBe("demo");
    expect(c.checks[3].status).toBe("Not Connected");
    expect(c.summary).toContain("Fictional");
  });
  it("exports saved notes, provenance and limitations", () => {
    const c = createCase(true);
    c.notes = "Manual review needed";
    const report = JSON.parse(reportJSON(c));
    expect(report.notes).toBe(c.notes);
    expect(report.source).toBe("demo");
    expect(report.disclaimer).toContain("fictional");
  });
});
