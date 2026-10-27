# VeriDoc — local document intelligence

VeriDoc upgrades the existing React + Vite + TypeScript app in place with a dark dashboard and real local Node.js analysis. No document is classified as definitively authentic or fake.

## Requirements and installation

Use Node.js 24 LTS and npm. In this existing project folder, run:

    npm install

The install includes Tesseract.js, its bundled English model, Sharp, PDF.js, and native canvas. No separate OCR executable, API key, cloud account, or runtime model download is required. Windows with Node 24 was tested. Other OS/CPU combinations may need native build prerequisites for Sharp or canvas.

## Run in development: two terminals

Backend:

    npm run server

Frontend, in a second terminal in the same folder:

    npm run dev

Open http://127.0.0.1:5173/. Vite forwards /api to http://127.0.0.1:4100. Both processes bind to localhost. Vite uses a strict port: close another process using port 5173 if startup reports a conflict.

## Production build, served locally

    npm run build
    npm start

Open http://127.0.0.1:4100/. The backend serves dist and the API together. This is a single-user local prototype without authentication, not a public hosting service. Keep it on localhost.

## What actually runs

- Server checks extension, MIME type, file signature, and file size. Frontend checks provide early feedback.
- PNG, JPG/JPEG, WEBP: Sharp decodes images and measures resolution and grayscale standard-deviation contrast. Tesseract runs English OCR locally. Reported OCR confidence is an engine measure, not a fraud probability.
- PDF.js extracts embedded text and metadata; counts image paint operations on processed pages; detects document-level JavaScript and attachment presence without executing/opening them. Modification dates preceding creation trigger review; absent metadata alone does not.
- Scanned PDF pages are rendered locally for the same English OCR engine, within coverage limits below.
- Configurable English labeled-field checks support identity documents, certificates, invoices, and other documents: missing required labels, conflicting values, basic ID/invoice-number and amount formats, ISO date validity, future birth/issue dates, expiry, and date ordering.
- Reports distinguish completed, review, partial, failed, inapplicable, and unavailable checks. Result categories are No Suspicious Indicators Detected, Review Recommended, and Analysis Incomplete. Incomplete extraction/coverage takes priority in the overall category; indicators remain visible.
- Actual dashboard counts, searchable/filterable history, reports, saved reviewer notes, JSON export, and copy-summary actions.
- Custom document/shield/check SVG logo and favicon; dark CSS variables; responsive navigation, keyboard focus styles, and reduced-motion support.
- Load Fictional Sample Document creates an explicitly fictional image, not results. Analyze sends that image through the real pipeline only after a separate click.

## Coverage limits

- Upload limit: 10 MB. Images: 24 megapixels, single frame only; normalized to fit 2400 by 2400 pixels without enlargement.
- PDF: first 10 pages, OCR fallback on at most 3 scanned pages. Incomplete coverage is disclosed. Encrypted, malformed, or unsupported PDFs produce incomplete analysis.
- One analysis at a time; worker processing timeout 90 seconds; bounded V8 heap. A concurrent upload receives HTTP 429. Progress is actual stage text, never fabricated percentages. Job polling state is temporary; completed reports persist.
- English labeled fields and YYYY-MM-DD dates only. Comparisons use the current UTC date. PDF metadata date comparisons currently ignore timezone offsets, disclosed in reports.
- PDF image counts are paint operations, not unique images. Per-image resolution/contrast checks do not run inside PDFs.
- Image previews work locally. Native PDF preview is not exposed before parsing; file name and size are displayed instead. Scanned PDF rendering happens in the backend.
- Unavailable: sophisticated image-editing detection, font/alignment analysis, copy-paste/overlay localization, visible-versus-extracted text comparison, MRZ validation, face/biometric checks, digital signature verification, and official database verification. No risk probability is calculated. No external AI integration needs configuration.
- OCR and heuristics may miss or misread evidence. Missing labels may indicate an unsupported template. Completed checks do not establish authenticity; human review remains essential.

## Privacy and persistence

Uploads remain in memory and are discarded after worker completion or failure. Uploaded file bytes and thumbnails are not written to disk or served publicly. Documents are never sent to third-party OCR or AI services.

Reports DO retain extracted text, file names, metadata, fields, timestamps, and saved notes in data/veridoc.sqlite (ignored by Git). Default retention is 7 days, up to 100 reports. Expired rows are purged at startup and record reads. SQLite storage is local and unencrypted. Logical expiry is not a secure-disk-erasure guarantee. Downloaded reports have independent retention.

Rule preferences use browser localStorage. Earlier prototype records remain untouched under their original key and are excluded from actual history/statistics. Legacy fixture helpers remain for compatibility tests only; the upload UI and API do not use them. README-local-backup.md is preserved as historical documentation.

## Environment variables

Use .env.example as a reference. An optional .env file is loaded by the backend and Vite; restart after changes. No secrets are required.

- PORT=4100: backend port. Changing it also requires adjusting Vite's proxy target.
- OCR_ENABLED=true: false disables OCR; embedded PDF text still extracts. Images/scanned pages are incomplete when required OCR is disabled.
- RETENTION_DAYS=7: integer 1 through 30.
- VITE_API_BASE_URL=/api: public API path; leave unchanged for same-origin local operation. Never put secrets in VITE variables. Remote document transmission is outside this app's supported workflow.

Settings configures required fields per category, minimum readable characters (5-500), minimum image width (100-2000), and minimum contrast (1-80). Reports record the rules that ran. Save preferences to retain them across browser sessions.

## API

- GET /api/health: engine configuration.
- POST /api/analyses: multipart document, category (identity/certificate/invoice/other), optional rules JSON. Returns 202 and jobId.
- GET /api/jobs/:id: processing stage and terminal status, reportId on completion.
- GET /api/analyses: actual saved reports.
- GET /api/analyses/:id: one report.
- PUT /api/analyses/:id/notes: JSON notes string, maximum 2000 characters. Empty strings clear notes.

Local host/origin checks, bounded multipart handling, worker timeouts, no-store responses, security headers, and generic server errors are implemented. Uploaded content is not intentionally executed. This is not a malware sandbox or production multi-user service.

## Tests and verification

    npm test
    npm run build

- Original 6 tests passed before changes and remain passing.
- 11 frontend/unit/API-client tests and 12 backend/integration tests passed (23 total). Coverage includes upload validation, spoofed/oversized files, rule evidence, real image OCR, real scanned-PDF OCR, PDF text/metadata, blank/corrupt uploads, disabled/failed OCR, SQLite persistence, saved notes, API failures, untrusted-origin rejection, and worker timeout.
- TypeScript and Vite production build passed.
- Dependency installation audit reported zero vulnerabilities.
- Frontend and proxied API responded HTTP 200.
- Browser checked mobile/desktop layouts, sample selection/preview, real analysis and extracted fields/confidence/limitations, mobile drawer, history search and result-filter empty states. Notes saved through the UI were confirmed via API.
- Browser download-event verification timed out. JSON export generation is implemented, but downloaded-file delivery was not confirmed in the in-app browser. Copy-summary, OS file picker/drag-drop, and every settings control were not exhaustively automated. Verify these in your normal browser before a demonstration.

One actual analysis of veridoc-fictional-sample.png may remain from browser QA. It was processed by the real engine; no illustrative record was inserted.

No commits or pushes were performed.

## Main files

- src/main.tsx, src/components.tsx, src/style.css: UI shell, dashboard, upload, results, notes, settings, history, dark responsive styling.
- src/api.ts, src/screening.ts: API client, validation, result types, JSON export.
- public/veridoc.svg, index.html: branding, favicon, browser metadata.
- server/index.mjs, server/worker.mjs: local API, bounded jobs, worker lifecycle, production static serving.
- server/pipeline.mjs, server/rules.mjs, server/upload.mjs: actual analysis and validation.
- server/store.mjs: SQLite persistence and retention.
- src/\*.test.ts, server/analysis.test.mjs, server/fixtures.mjs: tests and fictional fixtures.

## Troubleshooting: API request failed (500) / ECONNREFUSED

Vite is the frontend development server; it does not start Express. If Vite reports ECONNREFUSED 127.0.0.1:4100 for /api/health or /api/analyses, the backend is not reachable. In the reproduced failure, Vite itself generated an empty HTTP 500; there was no backend exception. Starting the existing backend restored both endpoints without changing the database or port.

Keep two terminals running from this project folder:

    npm run server
    npm run dev

Run each command in a separate terminal. The backend prints its localhost URL on startup. No .env or API keys are required with the defaults. Node 24 is required for the built-in SQLite backend. Do not close the backend terminal while using the dashboard.

Direct checks (PowerShell):

    Invoke-RestMethod http://127.0.0.1:4100/api/health
    Invoke-RestMethod http://127.0.0.1:4100/api/analyses

Proxy checks:

    Invoke-RestMethod http://127.0.0.1:5173/api/health
    Invoke-RestMethod http://127.0.0.1:5173/api/analyses

A successful response is HTTP 200 with actual JSON data. An unreachable backend now produces HTTP 503 with an actionable message through the Vite development/preview proxy. Genuine backend errors retain their error messages; the frontend also handles an empty/non-JSON server error with startup and terminal-inspection guidance. Restart Vite if an existing terminal has not reloaded vite.config.ts, then use Retry or Refresh in the dashboard.

Debug verification: reproduced empty proxy 500 plus ECONNREFUSED with Express stopped; after the proxy fix, stopped-backend requests return JSON 503 with startup guidance. With Express running, GET /api/health and GET /api/analyses both returned valid JSON HTTP 200 directly on 4100 and through 5173. SQLite PRAGMA quick_check returned ok and the reports table exists. npm test passed 26 tests (14 frontend/API-client, 12 backend); npm run build passed TypeScript and production compilation. No backend exception or database failure was reproduced. No port or database change was needed.

## Frontend completion pass

Continued from the saved VeriDoc UI and proxy-error fix. Existing branding, favicon, dark theme, responsive shell, live analysis UI, evidence reports, notes, history, and settings were preserved. No backend files or dependencies were changed in this pass.

Completed checklist:

- Guarded image preview rendering until the selected file's object URL is ready; old preview URLs are revoked.
- Added extension/MIME matching and explicit single-file drag/drop validation.
- Separated connecting/offline states from empty data; disabled analysis while disconnected without preventing file selection/preview; added Retry Connection.
- Removed misleading zero statistics during loading and false empty-history messages after a failed fetch.
- Added mobile drawer Escape handling, focus containment/restoration, a close control, scroll locking, active-page semantics, and hidden-link visibility rules.
- Improved report-download cleanup and truthful download-request/error feedback. Actual downloaded-file delivery remains browser-dependent; no false completion claim is shown.
- Kept analysis errors visible after navigating away from the upload page and reflected disabled OCR configuration accurately.

Verification in this pass:

- 20 frontend tests passed, including 6 new upload/offline/render-state regression tests.
- TypeScript: npm exec --offline -- tsc --noEmit passed.
- Production build: npm run build passed.
- Full npm test: 30 tests passed; 2 pre-existing backend HTTP integration tests were blocked by sandbox localhost socket access (EACCES). The same environmental failure occurred before edits; backend code was not changed to work around it.
- Browser checks passed for mobile drawer focus/Escape, sample-image preview, Reports navigation, existing report content/limitations, copy-summary feedback, and download-request feedback. Tablet and desktop layouts were inspected.
- Optional Prettier execution was unavailable in the offline cache (ENOTCACHED); no download retry or project restart was performed. All work remains saved.

Remaining verification: OS file-picker/drag/drop behavior and downloaded-file delivery should receive a final manual check in the normal browser. PDF preview remains the existing honest filename/size fallback. Actual analysis still requires the existing backend; no mock analysis results were added.
