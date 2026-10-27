import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDigit, inspectMRZ } from "./mrz.mjs";
import { assessRisk, finalizeReport } from "./assessment.mjs";
import { analyzeBuffer } from "./pipeline.mjs";
import { analyzeText } from "./rules.mjs";
import { maskIdentifiers } from "./privacy.mjs";
import { textPDF } from "./fixtures.mjs";
import { ReportStore } from "./store.mjs";
const upper = "P<UTOERIKSSON<<ANNA<MARIA".padEnd(44, "<");
const lower = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
test("ICAO check digit and TD3 reference vector pass; corruption is flagged", () => {
  assert.equal(checkDigit("AB2134<<<"), 5);
  assert.equal(upper.length, 44);
  assert.equal(lower.length, 44);
  const result = inspectMRZ(`${upper}\n${lower}`, "passport");
  assert.ok(result.checks.every((c) => c.status === "Passed"));
  assert.equal(result.issues.length, 0);
  const bad = inspectMRZ(
    `${upper}\n${lower.slice(0, 9)}7${lower.slice(10)}`,
    "passport",
  );
  assert.ok(bad.issues.some((i) => i.code === "mrz_checksum"));
  assert.ok(bad.checks.some((c) => c.status === "Failed"));
});
test("MRV-A and MRV-B check only three mandatory visa check digits", () => {
  for (const size of [36, 44]) {
    const result = inspectMRZ(
      `${"V<UTOERIKSSON<<ANNA<MARIA".padEnd(size, "<")}\n${lower.slice(0, 28).padEnd(size, "<")}`,
      "visa",
    );
    assert.equal(result.checks.length, 3);
    assert.ok(result.checks.every((c) => c.status === "Passed"));
  }
  assert.equal(
    inspectMRZ("Visa with no machine readable zone", "visa").checks[0].status,
    "Not checked",
  );
  assert.ok(
    inspectMRZ("P<UTO" + "<".repeat(30) + "\nBAD", "passport").issues.some(
      (i) => i.code === "mrz_format",
    ),
  );
});
test("MRZ visible field mismatch is explicit and unsupported extended layout is not passed", () => {
  const result = inspectMRZ(`${upper}\n${lower}`, "passport", {
    documentNumber: "OTHER123",
    expiryDate: "2030-01-01",
  });
  assert.equal(
    result.issues.filter((i) => i.code === "mrz_conflict").length,
    2,
  );
  assert.equal(
    inspectMRZ(`${upper}\n${lower.slice(0, 9)}<${lower.slice(10)}`, "passport")
      .checks[0].status,
    "Not checked",
  );
});
test("scoring is deterministic, deduplicated and inconclusive for insufficient evidence", () => {
  const findings = [
    { code: "mrz_checksum", title: "Mismatch", field: "documentNumber" },
    { code: "mrz_checksum", title: "Duplicate", field: "documentNumber" },
    {
      code: "field_conflict",
      title: "Conflicting dates",
      field: "dateOfBirth",
    },
    { code: "mrz_conflict", title: "Visible mismatch", field: "expiryDate" },
  ];
  const result = assessRisk(findings, false);
  assert.equal(result.risk.score, 70);
  assert.equal(result.risk.level, "High");
  assert.equal(result.risk.contributions[1].points, 0);
  assert.equal(assessRisk([], false).risk.score, 0);
  assert.equal(assessRisk([], false).risk.level, "Low");
  assert.equal(assessRisk(findings, true).risk.score, null);
  assert.equal(assessRisk(findings, true).risk.level, "Inconclusive");
  assert.equal(
    assessRisk(
      Array.from({ length: 8 }, (_, i) => ({
        code: "mrz_checksum",
        title: "Mismatch",
        field: String(i),
      })),
      false,
    ).risk.score,
    100,
  );
});
test("Aadhaar PDF runs actual extraction and redacts raw identifiers before storage", async () => {
  // Fictional digit pattern; no real Aadhaar is used or verified.
  const number = "2345 6789 0123";
  const report = await analyzeBuffer({
    buffer: textPDF([
      "AADHAAR - FICTIONAL SAMPLE",
      "Full Name: Alex Example",
      "Date of Birth: 2000-01-01",
      `Aadhaar Number: ${number}`,
    ]),
    format: "pdf",
    fileName: "fictional.pdf",
    category: "aadhaar",
  });
  assert.equal(report.category, "aadhaar");
  assert.equal(report.fields.aadhaarNumber, "XXXX XXXX 0123");
  assert.equal(report.text, "");
  assert.equal(report.risk.score, 0);
  assert.equal(report.status, "No Suspicious Indicators Detected");
  const store = new ReportStore(":memory:");
  store.put(report);
  const raw = store.db.prepare("SELECT body FROM reports").get().body;
  assert.ok(!raw.includes(number));
  assert.ok(!raw.includes("234567890123"));
  assert.ok(raw.includes("XXXX XXXX 0123"));
  store.close();
});
test("visa aliases, issuing authority and validity dates have actual field/date checks", async () => {
  const report = await analyzeBuffer({
    buffer: textPDF([
      "VISA - FICTIONAL SAMPLE",
      "Full Name: Alex Example",
      "Visa Number: EXAMPLE123",
      "Issuing Authority: Example Consulate",
      "Valid From: 2030-01-01",
      "Valid Until: 2020-01-01",
    ]),
    format: "pdf",
    fileName: "visa.pdf",
    category: "visa",
  });
  assert.equal(report.fields.documentNumber, "EXAMPLE123");
  assert.equal(report.fields.issuer, "Example Consulate");
  assert.ok(report.issues.some((i) => i.code === "date_order"));
  assert.ok(report.risk.score > 0);
  assert.ok(
    report.checks.some(
      (c) => c.name === "MRZ checksum validation" && c.status === "Not checked",
    ),
  );
});
test("passport PDF performs supported MRZ checks and returns explained findings", async () => {
  const report = await analyzeBuffer({
    buffer: textPDF([
      "PASSPORT - FICTIONAL SAMPLE",
      "Full Name: Anna Maria Eriksson",
      "Document Number: L898902C3",
      "Date of Birth: 1974-08-12",
      "Expiry Date: 2012-04-15",
      upper,
      lower,
    ]),
    format: "pdf",
    fileName: "passport.pdf",
    category: "passport",
  });
  assert.ok(
    report.checks.some(
      (c) => c.name === "MRZ composite checksum" && c.status === "Passed",
    ),
  );
  assert.ok(report.issues.some((i) => i.code === "date_expired"));
  assert.ok(
    report.issues.every(
      (i) => i.explanation && i.status && typeof i.points === "number",
    ),
  );
  assert.ok(report.processingTimeMs >= 0);
});
test("full nested reports and reviewer notes are masked, including old records on read", () => {
  const value = maskIdentifiers({
    notes: "Identifier 234567890123",
    nested: ["2345-6789-0123"],
  });
  assert.ok(!JSON.stringify(value).includes("2345"));
  assert.ok(JSON.stringify(value).includes("0123"));
  const store = new ReportStore(":memory:");
  const now = new Date().toISOString();
  store.db
    .prepare("INSERT INTO reports VALUES (?,?,?)")
    .run(
      "legacy",
      now,
      JSON.stringify({ id: "legacy", notes: "234567890123" }),
    );
  assert.equal(store.get("legacy").notes, "XXXX XXXX 0123");
  store.close();
  assert.equal(
    finalizeReport({ notes: "234567890123" }).notes,
    "XXXX XXXX 0123",
  );
});

test(
  "all three types work through the real upload API, with safe reports and note updates",
  { timeout: 60000 },
  async () => {
    const { createApp } = await import("./index.mjs");
    const store = new ReportStore(":memory:");
    const { app } = createApp({ store });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    try {
      const health = await (await fetch(`${base}/health`)).json();
      assert.ok(
        ["aadhaar", "passport", "visa"].every((type) =>
          health.categories.includes(type),
        ),
      );
      for (const type of ["aadhaar", "passport", "visa"]) {
        const lines =
          type === "aadhaar"
            ? [
                "AADHAAR FICTIONAL SAMPLE",
                "Full Name: Alex Example",
                "Date of Birth: 2000-01-01",
                "Aadhaar Number: 2345 6789 0123",
              ]
            : [
                type.toUpperCase() + " FICTIONAL SAMPLE",
                "Full Name: Alex Example",
                "Document Number: EXAMPLE123",
                "Date of Birth: 2000-01-01",
                "Issue Date: 2024-01-01",
                "Expiry Date: 2030-01-01",
                "Issuer: Example Authority",
              ];
        const form = new FormData();
        form.append(
          "document",
          new Blob([textPDF(lines)], { type: "application/pdf" }),
          `${type}-fictional.pdf`,
        );
        form.append("category", type);
        const response = await fetch(`${base}/analyses`, {
          method: "POST",
          body: form,
        });
        assert.equal(response.status, 202);
        const { jobId } = await response.json();
        let job;
        for (let i = 0; i < 200; i++) {
          job = await (await fetch(`${base}/jobs/${jobId}`)).json();
          if (job.status !== "processing") break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(job.status, "completed");
        const report = await (
          await fetch(`${base}/analyses/${job.reportId}`)
        ).json();
        assert.equal(report.category, type);
        assert.equal(report.schemaVersion, 2);
        assert.equal(typeof report.risk.score, "number");
        assert.ok(Array.isArray(report.checks));
        if (type === "aadhaar") {
          assert.equal(report.fields.aadhaarNumber, "XXXX XXXX 0123");
          assert.equal(report.text, "");
          assert.ok(!JSON.stringify(report).includes("2345 6789"));
          const response = await fetch(`${base}/analyses/${report.id}/notes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "Private number 234567890123" }),
          });
          const saved = await response.json();
          assert.equal(saved.notes, "Private number XXXX XXXX 0123");
        }
      }
      const bad = new FormData();
      bad.append(
        "document",
        new Blob([textPDF()], { type: "application/pdf" }),
        "sample.pdf",
      );
      bad.append("category", "unknown-type");
      assert.equal(
        (await fetch(`${base}/analyses`, { method: "POST", body: bad })).status,
        400,
      );
      assert.equal(store.all().length, 3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      store.close();
    }
  },
);
test("backend exceptions are logged separately and never serialized as reports", async () => {
  const { createApp } = await import("./index.mjs");
  const errors = [];
  const { app } = createApp({
    store: {
      all() {
        throw new Error("private document details");
      },
      retentionDays: 7,
    },
    onError: (error) => errors.push(error),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/analyses`,
    );
    assert.equal(response.status, 500);
    const json = await response.json();
    assert.equal(typeof json.error, "string");
    assert.ok(!JSON.stringify(json).includes("private"));
    assert.equal(errors.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('legacy persisted identifiers are redacted on reopening without deleting records',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=await import('node:path');const directory=mkdtempSync(path.join(tmpdir(),'veridoc-privacy-'));const file=path.join(directory,'reports.sqlite');let store;
 try{store=new ReportStore(file);store.db.prepare('INSERT INTO reports VALUES (?,?,?)').run('legacy',new Date().toISOString(),JSON.stringify({id:'legacy',notes:'2345 6789 0123'}));store.close();store=new ReportStore(file);const body=store.db.prepare('SELECT body FROM reports WHERE id=?').get('legacy').body;assert.ok(!body.includes('2345'));assert.ok(body.includes('XXXX XXXX 0123'));assert.equal(store.all().length,1);}finally{store?.close();rmSync(directory,{recursive:true,force:true})}
});
test('document titles alone are insufficient for a numerical risk score',async()=>{
 const report=await analyzeBuffer({buffer:textPDF(['PASSPORT FICTIONAL SAMPLE','This page contains no reliably labeled identity fields.']),format:'pdf',fileName:'title-only.pdf',category:'passport'});assert.equal(report.status,'Analysis Incomplete');assert.equal(report.risk.score,null);assert.equal(report.risk.level,'Inconclusive');
});

test('a corrupt stored JSON report is not logged or replaced by fake data during privacy upgrade',()=>{
 const store=new ReportStore(':memory:');store.db.prepare('INSERT INTO reports VALUES (?,?,?)').run('corrupt',new Date().toISOString(),'private invalid JSON');assert.throws(()=>store.redactStoredIdentifiers(),error=>error.message.includes('Stored report JSON is invalid')&&!error.message.includes('private'));assert.equal(store.db.prepare('SELECT body FROM reports WHERE id=?').get('corrupt').body,'private invalid JSON');store.close();
});
