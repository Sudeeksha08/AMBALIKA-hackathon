# CoderIV frontend

React + Vite + TypeScript prototype. No backend is connected. No uploaded file is sent to a server, extracted by OCR, or checked for tampering. The separate Load Demo Sample action uses explicitly fictional fixtures. Only sample expiry dates are actually compared with the local current date.

## Run

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite.

## Checks

```powershell
npm test
npm run build
```

## Storage and reports

Case metadata and saved reviewer notes use browser localStorage. Uploaded image bytes and filenames are not persisted. Images are previewed with temporary object URLs. Download Report produces JSON containing saved notes, provenance, results, and limitations. Clear site data to remove local history. Unsaved notes prompt before changing the active case.

## Future backend

`src/api.ts` defines the service boundary. Replace its analyze implementation only after defining and validating a backend response contract. Use an environment variable such as VITE_API_BASE_URL for a public API endpoint; never put secrets in frontend variables. Do not return sample data for uploaded-image analysis. Existing upload results deliberately say Analysis Incomplete.

## Files

- src/main.tsx: application shell, dashboard, upload, result review, local notes, case history, privacy dialog
- src/style.css: responsive styles and reduced-motion support
- src/screening.ts: case types, upload validation, fixture generation, expiry check, storage read, report serialization
- src/api.ts: replaceable service adapter, currently browser-local only
- src/screening.test.ts: validation and provenance regression tests

No authentication, official database verification, OCR, MRZ engine, image forensics, or face verification is implemented.

## Verification completed

- Dependency installation succeeded after network permission was granted.
- Upgraded Vitest to 5.0.5 to resolve the audit findings from the original scaffold; installation reported zero vulnerabilities.
- `npm test`: 1 test file passed, 6 tests passed.
- `npm run build`: TypeScript check and Vite production build succeeded.
- Development server started successfully and returned HTTP 200 at http://127.0.0.1:5173/.
- Interactive browser QA was blocked by an in-app browser session-routing error. Upload picker, drag/drop, notes, history filters, downloads, and mobile layout are implemented but have not been verified end-to-end in a browser.
- No Git repository was initialized, and no commit or push was performed.

Manual follow-up: run `npm run dev`, open the printed URL, load the fictional sample, save notes, download JSON, filter history, and select a fictional PNG/JPEG/WEBP. Confirm uploaded images show no extracted fields, all checks Not Run, and Analysis Incomplete. Check invalid and over-10-MB files, image removal, navigation, and a narrow mobile viewport.
