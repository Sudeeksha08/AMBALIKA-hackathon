# VeriDoc — local document screening

VeriDoc is the existing React + TypeScript + Vite application with an Express 5 / Node.js backend, local Tesseract English OCR, PDF.js parsing/rendering, Sharp image checks, and SQLite report storage. It performs preliminary screening; it never establishes document authenticity or confirms fraud.

## Run

Use Node.js 24 LTS. In the existing outputs/coderiv project folder:

    npm install

Keep the backend running in one terminal:

    npm run server

Run the frontend in another terminal in the same folder:

    npm run dev

Open http://127.0.0.1:5173/. Express listens on http://127.0.0.1:4100/; Vite forwards /api to that port. Vite alone does not start Express. No API key, separate OCR executable, or runtime model download is required. The English trained model is installed with npm dependencies.

For a local production build:

    npm run build
    npm start

Open http://127.0.0.1:4100/. The backend serves dist and the API. This remains a single-user localhost application without authentication; it is not configured for public hosting.

## Document workflows

Aadhaar Card, Passport, and Visa are prominent selectable cards. The existing generic Identity, Certificate, Invoice, and Other categories remain available. The selected value is sent as the multipart category field and validated on the server.

- Aadhaar: supported English title markers, full/masked number structure, missing expected labels, conflicting values, and supported date checks. Only the final four identifier digits are retained. Raw Aadhaar OCR text is not retained in reports. No UIDAI lookup, Aadhaar checksum, or QR signature verification runs.
- Passport: expected title/fields, basic field/date checks, strict ICAO TD3 MRZ layout/check digits when extracted, and comparison with supported visible document-number/date fields. No check digit is silently corrected.
- Visa: visa/issuer/validity fields and date ordering, plus MRV-A/MRV-B MRZ document-number, birth-date and expiry-date check digits when present. No visa composite checksum is invented.
- Generic categories: configurable English labeled-field rules for the existing workflows.

Dates support YYYY-MM-DD and unambiguous written English month names. Ambiguous numeric date formats, unsupported labels/languages, unknown birth-date precision, extended MRZ numbers, and unsupported MRZ layouts require manual review. MRZ YYMMDD dates do not resolve the century. A missing MRZ is Not checked, not a fraud conclusion.

The reference specifications are ICAO Doc 9303 parts 3 (check-digit calculation), 4 (TD3), and 7 (MRV-A/B):

- https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf
- https://www.icao.int/sites/default/files/publications/DocSeries/9303_p4_cons_en.pdf
- https://www.icao.int/sites/default/files/publications/DocSeries/9303_p7_cons_en.pdf

Masked identifier display exposes only the last four digits, consistent with UIDAI's masked Aadhaar description: https://www.uidai.gov.in/en/my-aadhaar . This application does not claim UIDAI integration or regulatory certification.

## Real processing and limits

- Server checks extension, MIME type, signature, empty input, and the 10 MB size limit. PDF, JPG/JPEG, PNG are supported; existing WEBP support is retained.
- Images are decoded by Sharp, bounded to 24 megapixels and a single frame. Resolution and grayscale contrast are measured. OCR inputs are normalized to fit 2400 by 2400 pixels without enlargement.
- PDFs use embedded-text extraction and document metadata. Scanned pages are rendered locally for English OCR. At most 10 pages are processed, with OCR on at most 3 scanned pages; incomplete coverage is explicitly reported.
- PDF properties include date ordering, image paint operations, attachment presence, and document-level JavaScript presence. Scripts and attachments are not executed. Absent metadata alone is not a finding. Metadata date comparisons currently ignore timezone offsets.
- One analysis at a time, worker processing timeout 90 seconds, bounded V8 heap. Busy uploads receive 429. Processing stage text comes from the actual worker; no fake progress percentages are used.
- No visual tampering, font/alignment comparison, overlay localization, copy-paste analysis, face verification, official database checks, digital signature validation, or sophisticated forgery detection is implemented. These are listed as Not checked.

Load Fictional Sample Document creates an image for the currently selected category. It does not supply results. Clicking Analyze is a separate action that runs the real local pipeline. Use fictional documents for demonstrations.

## Explainable risk assessment

New reports include a versioned risk object from actual findings. This is an uncalibrated indicator index, not the probability a document is fake.

Weights in screening-v1:

- Missing expected field: 8.
- Missing expected document marker: 15.
- Unsupported field format or unparseable date: 12.
- Conflicting field values or inconsistent date ordering: 20.
- Future birth/issue date: 15.
- Expired date: 10. Expiry is not evidence of forgery.
- MRZ check-digit mismatch or MRZ/visible-field mismatch: 25.
- Malformed/unsupported MRZ candidate: 15.
- Measured readability limitation or PDF technical property needing review: 10.
- Insufficient readable text: 0 points; assessment is incomplete instead.

Each rule/field pair is counted once. Scores are the sum capped at 100: Low 0–29, Medium 30–59, High 60–100. Reports show every contribution, duplicate suppression, and the full rule list. Incomplete extraction, truncated coverage, or insufficient recognizable document fields returns a null score and Inconclusive / Manual review required. The absence of a score in a legacy report is preserved, not retrospectively fabricated. A low score does not establish authenticity.

Settings modifies required fields and readability thresholds for future analyses. Reports retain the applied rules. Existing browser preferences are merged with defaults for newly introduced types.

## Readable reports

The main report renders structured fields, not raw response objects. Sections include Analysis Summary, Document Information, Detailed Findings, Verification Checks, Risk Assessment, Limitations & Disclaimer, and Reviewer Notes. Each finding has severity, status, evidence, explanation, action, and rule weight. Check outcomes are Passed, Warning, Failed, or Not checked; Passed means only the specified technical check.

Download Report now creates a self-contained, formatted HTML document. Open it in a browser to read or print. Print / Save PDF prints the styled report from the app. JSON is retained only as a separately labeled Export Data (JSON) action. Saved notes are included; save edits before printing/downloading. HTML output escapes document-provided values, uses no JavaScript or external assets, and includes the limitations.

The frontend validates report identity/category/status and normalizes nullable optional fields, arrays, and primitive values. Raw JSON strings, source-code strings, error objects, and malformed report payloads are rejected rather than treated as successful reports. Missing verification coverage forces incomplete analysis. Error responses are handled separately and internal exception objects are not displayed as report content.

## API contract

Existing routes and camelCase fields are retained to avoid breaking the app:

- GET /api/health: status, OCR configuration, retention, limits, supported categories and default rules.
- POST /api/analyses: multipart document, category, optional rules JSON. Returns 202 with jobId.
- GET /api/jobs/:id: actual stage and processing/completed/failed status; completed includes reportId.
- GET /api/analyses: saved reports.
- GET /api/analyses/:id: one report.
- PUT /api/analyses/:id/notes: JSON notes string (up to 2000 characters), masked before persistence and response.

Reports retain id, category, fileName, createdAt, source, processingStatus, status, fields, text, confidence, checks, issues, metadata, rules, limitations, summary, and notes. New schemaVersion 2 reports add processingTimeMs and risk (score, level, methodology, version, contributions, rules). Findings add id, code, severity, status, explanation, and points. Overall statuses remain No Suspicious Indicators Detected, Review Recommended, or Analysis Incomplete. No missing optional field is substituted with fabricated evidence.

## Privacy and storage

File bytes are held in worker memory and discarded after completion/failure; they are not persisted or served publicly. No document is transmitted to a third-party OCR/AI service. Server exception logs contain operation/stack frames without document bodies; user-facing errors remain generic.

Reports persist locally in data/veridoc.sqlite, ignored by Git. They can contain names, dates, safe extracted fields, metadata, filenames and notes. Identifier patterns are masked before new writes and API delivery. On opening storage, legacy JSON records are updated in place to redact numeric identifiers without deleting the records. Raw Aadhaar OCR text is omitted. English OCR errors can evade pattern recognition; avoid real sensitive documents in demonstrations.

Default retention is 7 days, up to 100 reports. Expired rows are purged at startup/read. SQLite storage is unencrypted; logical redaction/expiry is not guaranteed secure erasure of physical database/WAL remnants. Downloaded reports have separate retention. Rule preferences are browser-local. Earlier prototype fixtures remain separate from real analysis history; legacy helpers are not called by uploads.

## Environment

See .env.example; .env is optional. No secrets are required.

- PORT=4100: backend port. If changed, update the Vite proxy target to match.
- OCR_ENABLED=true: false disables image/scanned-page OCR. Embedded PDF text still extracts; unavailable extraction is reported.
- RETENTION_DAYS=7: integer 1–30.
- VITE_API_BASE_URL=/api: public same-origin API path. Never put secrets in VITE variables. Remote document transmission is not part of this supported local workflow.

## Troubleshooting 500 / backend offline

The reproduced earlier 500 came from Vite when Express was stopped: ECONNREFUSED 127.0.0.1:4100. No database failure was reproduced. Starting the backend restored valid responses. An unavailable development/preview proxy now returns JSON 503 with startup guidance. Genuine backend exceptions are logged separately, not shown as successful reports.

Check directly and through the proxy:

    Invoke-RestMethod http://127.0.0.1:4100/api/health
    Invoke-RestMethod http://127.0.0.1:4100/api/analyses
    Invoke-RestMethod http://127.0.0.1:5173/api/health
    Invoke-RestMethod http://127.0.0.1:5173/api/analyses

Restart the backend after backend source/environment changes. Vite reloads frontend changes. If health returns older category values, the old backend process is still running. Do not blindly change ports or delete the database.

## Tests

    npm test
    npm exec --offline -- tsc --noEmit
    npm run build

The suite covers real image/scanned-PDF OCR, real PDF text/metadata checks, invalid/oversized/spoofed uploads, HTTP upload and saved-note workflows, all three new document types, reference MRZ vectors and altered check digits, evidence-based scoring/deduplication/cap, inconclusive cases, Aadhaar redaction in stored JSON and notes, legacy-row redaction, malformed API responses, HTML escaping/readable exports, and null-safe report rendering. Fixtures are explicitly fictional and test-only, never substituted for production upload results.

Browser/proxy QA used a fictional visa PDF with a future issue date and expired validity. Its actual findings contributed 15 + 10 + 20 = 45 (Medium). The returned structured report was parsed and exported with the same production formatting function. Any such clearly named QA records remain actual processed records, not mock history.

## Source map

- src/main.tsx, src/components.tsx, src/style.css: shell, upload/type selection, history, settings, responsive dark theme.
- src/report-view.tsx, src/report-presentation.ts: readable report UI, print styling, escaped self-contained HTML export.
- src/report-schema.ts, src/api.ts, src/screening.ts: response validation, safe defaults/redaction, API contract and types.
- server/index.mjs, server/worker.mjs: local API and worker lifecycle.
- server/pipeline.mjs, server/rules.mjs, server/documents.mjs, server/mrz.mjs: actual extraction and document-specific checks.
- server/assessment.mjs, server/privacy.mjs, server/store.mjs: documented scoring, masking and SQLite retention.
- server/*.test.mjs, src/*.test.ts*: regression tests and fixtures.

No Git commits or pushes were made.

## Latest verification result

54 tests passed: 29 frontend/schema/report tests and 25 backend/pipeline/API tests. TypeScript (tsc --noEmit) and the Vite production build passed. Both /api/health and /api/analyses returned valid JSON HTTP 200 directly on 4100 and through Vite on 5173. All three selected types were processed via actual HTTP uploads in tests, including stored Aadhaar masking and note updates. An actual fictional visa PDF was also uploaded through the running Vite proxy and rendered in the browser with the documented 45/100 Medium calculation; a formatted example HTML report was exported from that actual result.
