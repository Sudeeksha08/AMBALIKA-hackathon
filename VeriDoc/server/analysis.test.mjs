import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { analyzeBuffer } from "./pipeline.mjs";
import { analyzeText, validateRules } from "./rules.mjs";
import { validateUpload, MAX_BYTES } from "./upload.mjs";
import { imageFixture, cleanLines, textPDF, scannedPDF } from "./fixtures.mjs";
import { createApp, runAnalysis } from "./index.mjs";
import { ReportStore } from "./store.mjs";
const input = (buffer, extra = {}) => ({
  buffer,
  format: "png",
  fileName: "fictional.png",
  category: "identity",
  ...extra,
});
const noOCR = async () => {
  throw new Error("OCR unavailable");
};
test("server upload validation rejects absent, spoofed, unsupported and oversized uploads", async () => {
  const buffer = await imageFixture();
  const file = { buffer, originalname: "fictional.png", mimetype: "image/png" };
  assert.equal(validateUpload(file), "png");
  for (const candidate of [
    null,
    { ...file, mimetype: "application/pdf" },
    { ...file, originalname: "malicious.exe" },
    { ...file, buffer: Buffer.from("fake png") },
    { ...file, buffer: Buffer.alloc(MAX_BYTES + 1) },
  ])
    assert.throws(() => validateUpload(candidate));
});
test("category-specific configurable rules detect missing, conflicting and invalid dates", () => {
  const result = analyzeText(
    "Full Name: Alex Example\nFull Name: Sam Example\nDate of Birth: 2035-01-01\nExpiry Date: 2020-01-01",
    "identity",
    {},
    new Date("2026-10-27T00:00:00Z"),
  );
  assert.ok(result.issues.some((i) => i.title.includes("Conflicting")));
  assert.ok(
    result.issues.some((i) => i.title.includes("Expected document number")),
  );
  assert.ok(result.issues.some((i) => i.title.includes("future")));
  assert.ok(result.issues.some((i) => i.title.includes("ordering")));
  assert.ok(result.issues.some((i) => i.title.includes("passed")));
  assert.equal(
    analyzeText(
      "Ordinary document content with sufficient readable information.",
      "other",
    ).issues.length,
    0,
  );
  assert.throws(() => validateRules({ minTextChars: 1 }));
  assert.throws(() => validateRules({ required: ["unknown"] }));
});
test("real PDF text extraction succeeds and PDF metadata inconsistency is evidenced", async () => {
  const report = await analyzeBuffer(
    input(textPDF(cleanLines, { dates: true }), {
      format: "pdf",
      fileName: "fictional.pdf",
    }),
  );
  assert.equal(report.fields.fullName, "Alex Example");
  assert.equal(report.status, "Review Recommended");
  assert.ok(
    report.issues.some((i) => i.title === "PDF metadata date ordering"),
  );
  assert.equal(report.metadata.pages, 1);
  assert.ok(
    report.checks.some(
      (c) => c.name === "Text extraction" && c.status === "Completed",
    ),
  );
});
test("clean PDF can complete configured checks without authenticity claims", async () => {
  const report = await analyzeBuffer(
    input(textPDF(), { format: "pdf", fileName: "fictional.pdf" }),
  );
  assert.equal(report.status, "No Suspicious Indicators Detected");
  assert.equal(report.issues.length, 0);
  assert.ok(
    report.checks.some(
      (c) => c.name === "Visual forensics" && c.status === "Not Available",
    ),
  );
  assert.ok(report.summary.includes("No authenticity"));
});
test("OCR failure and disabled OCR are incomplete, never substituted with mock fields", async () => {
  const buffer = await imageFixture();
  for (const extra of [{}, { ocrEnabled: false }]) {
    const report = await analyzeBuffer(input(buffer, extra), () => {}, noOCR);
    assert.equal(report.status, "Analysis Incomplete");
    assert.equal(report.fields.fullName, null);
    assert.equal(report.text, "");
    assert.ok(
      report.checks.some(
        (c) =>
          c.name === "Text extraction" &&
          ["Failed", "Not Run"].includes(c.status),
      ),
    );
  }
});
test("low quality and blank documents generate measured limitations", async () => {
  const buffer = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const report = await analyzeBuffer(
    input(buffer),
    () => {},
    async () => ({ text: "", confidence: 0 }),
  );
  assert.equal(report.status, "Analysis Incomplete");
  assert.ok(report.issues.some((i) => i.title === "Low image resolution"));
  assert.ok(report.issues.some((i) => i.title === "Low image contrast"));
  const blank = await analyzeBuffer(
    input(textPDF([], { blank: true }), { format: "pdf", ocrEnabled: false }),
  );
  assert.equal(blank.status, "Analysis Incomplete");
  const corrupt = await analyzeBuffer(
    input(Buffer.from("%PDF-broken"), { format: "pdf" }),
  );
  assert.equal(corrupt.status, "Analysis Incomplete");
});
test(
  "real local English OCR extracts labeled image fields",
  { timeout: 60000 },
  async () => {
    const report = await analyzeBuffer(input(await imageFixture()));
    assert.equal(report.fields.fullName, "Alex Example");
    assert.equal(report.fields.expiryDate, "2030-01-01");
    assert.ok(report.confidence > 50);
    assert.equal(report.processingStatus, "Completed");
    assert.ok(report.text.includes("FICTIONAL"));
    assert.equal(report.source, "analysis");
  },
);
test(
  "real scanned PDF rendering and OCR extract text",
  { timeout: 60000 },
  async () => {
    const report = await analyzeBuffer(
      input(await scannedPDF(), { format: "pdf", fileName: "scanned.pdf" }),
    );
    assert.equal(report.fields.fullName, "Alex Example");
    assert.equal(report.metadata.scannedPages, 1);
    assert.equal(report.processingStatus, "Completed");
  },
);
test("SQLite persists reports and notes across reopening", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "veridoc-test-"));
  const file = path.join(directory, "reports.sqlite");
  const report = await analyzeBuffer(input(textPDF(), { format: "pdf" }));
  let store = new ReportStore(file);
  store.put({ ...report, notes: "Reviewed locally" });
  store.close();
  store = new ReportStore(file);
  assert.equal(store.get(report.id).notes, "Reviewed locally");
  store.put({ ...report, id: "expired", createdAt: "2000-01-01T00:00:00Z" });
  assert.equal(store.get("expired"), null);
  store.close();
  rmSync(directory, { recursive: true, force: true });
});
test(
  "API validates uploads, runs real analysis, persists notes, and rejects untrusted origins",
  { timeout: 60000 },
  async () => {
    const store = new ReportStore(":memory:");
    const { app } = createApp({ store });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    try {
      assert.equal((await fetch(`${base}/health`)).status, 200);
      assert.equal(
        (
          await fetch(`${base}/analyses`, {
            headers: { Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
      const form = (buffer, name = "sample.pdf", type = "application/pdf") => {
        const f = new FormData();
        f.append("document", new Blob([buffer], { type }), name);
        f.append("category", "identity");
        return f;
      };
      assert.equal(
        (
          await fetch(`${base}/analyses`, {
            method: "POST",
            body: form(Buffer.from("not a PDF")),
          })
        ).status,
        415,
      );
      assert.equal(
        (
          await fetch(`${base}/analyses`, {
            method: "POST",
            body: form(Buffer.alloc(MAX_BYTES + 1)),
          })
        ).status,
        413,
      );
      const response = await fetch(`${base}/analyses`, {
        method: "POST",
        body: form(textPDF()),
      });
      assert.equal(response.status, 202);
      const { jobId } = await response.json();
      let job;
      for (let i = 0; i < 150; i++) {
        job = await (await fetch(`${base}/jobs/${jobId}`)).json();
        if (job.status !== "processing") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(job.status, "completed");
      const report = await (
        await fetch(`${base}/analyses/${job.reportId}`)
      ).json();
      assert.equal(report.fields.fullName, "Alex Example");
      assert.equal(report.source, "analysis");
      const notes = await fetch(`${base}/analyses/${report.id}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Checked source" }),
      });
      assert.equal((await notes.json()).notes, "Checked source");
      assert.equal(
        (
          await fetch(`${base}/analyses/${report.id}/notes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "x".repeat(2001) }),
          })
        ).status,
        400,
      );
      assert.equal((await (await fetch(`${base}/analyses`)).json()).length, 1);
    } finally {
      await new Promise((r) => server.close(r));
      store.close();
    }
  },
);
test("worker timeout terminates processing with a failure", async () => {
  await assert.rejects(
    () => runAnalysis(input(Buffer.from("unused")), () => {}, 1),
    /timed out/,
  );
});
test("API exposes runner failures as failed jobs without fabricated reports", async () => {
  const store = new ReportStore(":memory:");
  const { app } = createApp({
    store,
    runner: async () => {
      throw new Error("internal stack secret");
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const form = new FormData();
    form.append(
      "document",
      new Blob([textPDF()], { type: "application/pdf" }),
      "fixture.pdf",
    );
    form.append("category", "identity");
    const response = await fetch(`${base}/analyses`, {
      method: "POST",
      body: form,
    });
    const { jobId } = await response.json();
    await new Promise((r) => setTimeout(r, 50));
    const job = await (await fetch(`${base}/jobs/${jobId}`)).json();
    assert.equal(job.status, "failed");
    assert.ok(!job.error.includes("secret"));
    assert.equal(store.all().length, 0);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
