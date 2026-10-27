export const categories = [
  "aadhaar",
  "passport",
  "visa",
  "identity",
  "certificate",
  "invoice",
  "other",
];
export const fieldLabels = {
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
export const defaultRules = {
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
export function validateRules(input = {}) {
  const required = input.required;
  if (
    required !== undefined &&
    (!Array.isArray(required) ||
      required.length > Object.keys(fieldLabels).length ||
      !required.every((k) => Object.hasOwn(fieldLabels, k)))
  )
    throw new Error("Invalid required fields.");
  for (const [key, min, max] of [
    ["minTextChars", 5, 500],
    ["minImageWidth", 100, 2000],
    ["minContrast", 1, 80],
  ])
    if (
      input[key] !== undefined &&
      (!Number.isFinite(input[key]) || input[key] < min || input[key] > max)
    )
      throw new Error(`Invalid ${key}.`);
  return {
    required,
    minTextChars: input.minTextChars ?? 25,
    minImageWidth: input.minImageWidth ?? 600,
    minContrast: input.minContrast ?? 12,
  };
}
const patterns = {
  nationality: /^nationality\s*[:=]\s*(.+)$/i,
  fullName: /^(?:full\s*name|name|recipient)\s*[:=]\s*(.+)$/i,
  documentNumber:
    /^(?:document\s*(?:number|no\.?)|passport\s*(?:number|no\.?)|visa\s*(?:number|no\.?)|id\s*(?:number|no\.?))\s*[:=]\s*(.+)$/i,
  dateOfBirth: /^(?:date\s*of\s*birth|dob)\s*[:=]\s*(.+)$/i,
  expiryDate:
    /^(?:expiry\s*date|expiration\s*date|date\s*of\s*expiry|valid\s*(?:to|until)|expires)\s*[:=]\s*(.+)$/i,
  issueDate:
    /^(?:issue\s*date|date\s*of\s*issue|invoice\s*date|valid\s*from)\s*[:=]\s*(.+)$/i,
  issuer:
    /^(?:issuer|issued\s*by|issuing\s*authority|authority|institution)\s*[:=]\s*(.+)$/i,
  invoiceNumber: /^(?:invoice\s*(?:number|no\.?|#))\s*[:=]\s*(.+)$/i,
  total: /^(?:total|total\s*amount|amount\s*due)\s*[:=]\s*(.+)$/i,
};
export function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
    ? d
    : null;
}
export function analyzeText(
  text,
  category,
  options = {},
  now = new Date(),
  extraFields = {},
) {
  const rules = validateRules(options),
    required = rules.required ?? defaultRules[category] ?? [];
  const fields = {},
    issues = [];
  const add = (title, evidence, action, field) =>
    issues.push({ title, evidence, action, field, severity: "Review" });
  for (const [key, pattern] of Object.entries(patterns)) {
    const values = text
      .split(/\r?\n/)
      .map((line) => line.trim().match(pattern)?.[1]?.trim())
      .filter(Boolean);
    fields[key] = values[0] ?? null;
    if (new Set(values.map((v) => v.toLowerCase())).size > 1)
      add(
        `Conflicting ${fieldLabels[key].toLowerCase()} values`,
        values.join(" | "),
        "Compare both occurrences with the source document.",
        key,
      );
  }
  for (const [key, value] of Object.entries(extraFields))
    if (!fields[key]) fields[key] = value;
  const enough = text.replace(/\s/g, "").length >= rules.minTextChars;
  if (!enough)
    add(
      "Insufficient readable text",
      `${text.replace(/\s/g, "").length} non-whitespace characters; configured minimum ${rules.minTextChars}.`,
      "Provide a clearer image or a text-based PDF.",
      "text",
    );
  if (enough)
    for (const key of required)
      if (!fields[key])
        add(
          `Expected ${fieldLabels[key].toLowerCase()} not found`,
          "No supported labeled field was extracted. Labels and templates vary; this is not evidence of fraud.",
          "Review the original and adjust required fields to the document template.",
          key,
        );
  for (const key of ["documentNumber", "invoiceNumber"])
    if (fields[key] && !/^[A-Z0-9][A-Z0-9 /.-]{2,39}$/i.test(fields[key]))
      add(
        `Unexpected ${fieldLabels[key].toLowerCase()} format`,
        fields[key],
        "Inspect extraction and confirm the issuer-specific format.",
        key,
      );
  if (
    category === "invoice" &&
    fields.total &&
    !/^(?:[A-Z]{3}\s*)?[$€£₹]?\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*[A-Z]{3})?$/.test(
      fields.total,
    )
  )
    add(
      "Unrecognized invoice total format",
      fields.total,
      "Confirm the currency and amount manually.",
      "total",
    );
  const dates = {};
  for (const key of ["dateOfBirth", "issueDate", "expiryDate"])
    if (fields[key]) {
      const written = /^(\d{1,2})[ .-]+([a-z]{3,9})[ .-]+(\d{4})$/i.exec(
        fields[key],
      );
      if (written) {
        const month =
          [
            "jan",
            "feb",
            "mar",
            "apr",
            "may",
            "jun",
            "jul",
            "aug",
            "sep",
            "oct",
            "nov",
            "dec",
          ].indexOf(written[2].slice(0, 3).toLowerCase()) + 1;
        const normalized = `${written[3]}-${String(month).padStart(2, "0")}-${written[1].padStart(2, "0")}`;
        if (parseISODate(normalized)) fields[key] = normalized;
      }
      dates[key] = parseISODate(fields[key]);
      if (!dates[key])
        add(
          `Unrecognized ${fieldLabels[key].toLowerCase()} date`,
          fields[key],
          "Check the date manually; this rule supports YYYY-MM-DD only.",
          key,
        );
    }
  const today = now.toISOString().slice(0, 10);
  if (dates.expiryDate && fields.expiryDate < today)
    add(
      "Expiry date has passed",
      `${fields.expiryDate} precedes ${today} (UTC).`,
      "Confirm expiry and the requirements for this review.",
      "expiryDate",
    );
  for (const key of ["dateOfBirth", "issueDate"])
    if (dates[key] && fields[key] > today)
      add(
        `${fieldLabels[key]} is in the future`,
        fields[key],
        "Confirm the date and OCR characters.",
        key,
      );
  for (const [a, b] of [
    ["dateOfBirth", "issueDate"],
    ["dateOfBirth", "expiryDate"],
    ["issueDate", "expiryDate"],
  ])
    if (dates[a] && dates[b] && fields[a] > fields[b])
      add(
        "Inconsistent date ordering",
        `${fieldLabels[a]} ${fields[a]} follows ${fieldLabels[b]} ${fields[b]}.`,
        "Inspect both dates against the source document.",
        a,
      );
  return { fields, issues, enough, rules: { ...rules, required } };
}
