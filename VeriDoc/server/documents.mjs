import { inspectMRZ } from "./mrz.mjs";
import { maskIdentifiers } from "./privacy.mjs";
export function documentChecks(text, category, visible) {
  const fields = {},
    issues = [],
    checks = [],
    limitations = [];
  const add = (code, title, evidence, action, field = "document") =>
    issues.push({ code, title, evidence, action, field });
  if (!["aadhaar", "passport", "visa"].includes(category))
    return { fields, issues, checks, limitations, insufficient: false };
  const keywords = {
    aadhaar: /\b(aadhaa?r|uidai)\b/i,
    passport: /\bpassport\b/i,
    visa: /\bvisa\b/i,
  };
  const marker =
    keywords[category].test(text) ||
    ((category === "passport" || category === "visa") &&
      text
        .split(/\r?\n/)
        .some((s) =>
          s.trim().startsWith(category === "passport" ? "P<" : "V<"),
        ));
  if (!marker)
    add(
      "document_marker",
      "Expected document text not detected",
      `No supported ${category} title or MRZ marker was extracted.`,
      "Confirm the selected type and provide the relevant complete page. Templates and OCR vary.",
    );
  checks.push({
    name: "Document structure",
    status: marker ? "Passed" : "Warning",
    detail: marker
      ? `A supported ${category} text marker was found. Logo, QR authenticity, and official validity were not verified.`
      : `Expected ${category} text was not extracted; document type cannot be confirmed from this text alone.`,
  });
  if (category === "aadhaar") {
    const candidates =
      text.match(
        /(?<!\d)(?:\d{4}[ \t-]?\d{4}[ \t-]?\d{4}|[Xx*]{4}[ \t-]?[Xx*]{4}[ \t-]?\d{4})(?!\d)/g,
      ) || [];
    const normalized = [
      ...new Set(candidates.map((s) => s.replace(/[ \t-]/g, "").toUpperCase())),
    ];
    const labeled = text
      .match(/(?:aadhaa?r|uid)\s*(?:number|no\.?|#)?\s*[:=]\s*([^\r\n]+)/i)?.[1]
      ?.trim();
    fields.aadhaarNumber = normalized[0]
      ? maskIdentifiers(normalized[0])
      : labeled
        ? "Redacted (unrecognized identifier)"
        : null;
    if (normalized.length > 1)
      add(
        "field_conflict",
        "Conflicting Aadhaar identifiers",
        `${normalized.length} different identifier patterns detected; numbers are redacted.`,
        "Inspect the source privately. Do not copy full identifiers into notes.",
        "aadhaarNumber",
      );
    if (
      labeled &&
      !/^(?:\d{12}|[X*]{8}\d{4})$/.test(
        labeled.replace(/[ \t-]/g, "").toUpperCase(),
      )
    )
      add(
        "field_format",
        "Unexpected Aadhaar identifier format",
        "The labeled identifier does not contain 12 digits or an eight-character masked prefix plus four digits.",
        "Inspect the source and OCR. This is structural screening only.",
        "aadhaarNumber",
      );
    checks.push({
      name: "Aadhaar number structure",
      status: normalized.length ? "Passed" : "Warning",
      detail: normalized.length
        ? "A 12-digit or masked identifier pattern was detected. Only the final four digits are retained. No UIDAI, QR signature, or checksum verification ran."
        : "No supported full or masked Aadhaar number pattern was extracted.",
    });
    limitations.push(
      "Aadhaar checks are English-text and number-pattern screening only. No UIDAI lookup, secure QR verification, or Aadhaar checksum was performed. Names and dates may still be sensitive.",
    );
  }
  if (category === "passport" || category === "visa") {
    const mrz = inspectMRZ(text, category, visible);
    issues.push(...mrz.issues);
    checks.push(...mrz.checks);
    limitations.push(...mrz.limitations);
    for (const [key, value] of Object.entries(mrz.fields))
      if (value && !visible[key]) fields[key] = value;
  }
  const merged = { ...visible, ...fields };
  return {
    fields,
    issues,
    checks,
    limitations,
    insufficient: Object.values(merged).filter(Boolean).length < 2,
  };
}
