// ICAO Doc 9303 parts 3, 4 and 7. Strict TD3 and MRV-A/B checks only.
export function checkDigit(value) {
  if (!/^[A-Z0-9<]+$/.test(value)) return null;
  return (
    [...value].reduce(
      (sum, char, i) =>
        sum +
        (char === "<"
          ? 0
          : /\d/.test(char)
            ? Number(char)
            : char.charCodeAt(0) - 55) *
          [7, 3, 1][i % 3],
      0,
    ) % 10
  );
}
export function inspectMRZ(text, category, visible = {}) {
  const expected =
    category === "passport" ? "P" : category === "visa" ? "V" : null;
  const result = { checks: [], issues: [], fields: {}, limitations: [] };
  if (!expected) {
    result.checks.push({
      name: "MRZ checksum validation",
      status: "Not checked",
      detail: "MRZ checks do not apply to this selected document category.",
    });
    return result;
  }
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.replace(/[ \t]/g, "").trim())
    .filter(Boolean);
  const index = lines.findIndex(
    (s) => s.startsWith(expected) && s.includes("<") && s.length >= 25,
  );
  if (index < 0) {
    result.checks.push({
      name: "MRZ checksum validation",
      status: "Not checked",
      detail:
        "No supported MRZ was extracted. A missing or unreadable MRZ does not establish fraud.",
    });
    return result;
  }
  const first = lines[index],
    second = lines[index + 1] || "";
  const len = first.length,
    validLength = category === "passport" ? len === 44 : [36, 44].includes(len);
  const finding = (code, title, evidence, action, field = "mrz") =>
    result.issues.push({ code, title, evidence, action, field });
  if (
    !validLength ||
    second.length !== len ||
    !/^[A-Z0-9<]+$/.test(first + second) ||
    !new RegExp(`^${expected}[A-Z<][A-Z<]{3}`).test(first)
  ) {
    finding(
      "mrz_format",
      "Malformed or unsupported MRZ",
      `Extracted line lengths ${len} and ${second.length}; expected ${category === "passport" ? "44/44" : "44/44 or 36/36"}. Characters were not silently corrected.`,
      "Inspect the MRZ against the source. OCR errors and unsupported formats are common.",
    );
    result.checks.push({
      name: "MRZ checksum validation",
      status: "Failed",
      detail:
        "A candidate MRZ was found but does not match a supported layout.",
    });
    return result;
  }
  if (second[9] === "<") {
    result.checks.push({
      name: "MRZ checksum validation",
      status: "Not checked",
      detail:
        "Extended/omitted document-number check-digit layout is unsupported; no pass was inferred.",
    });
    return result;
  }
  const tests = [
    ["Document number", second.slice(0, 9), second[9]],
    ["Date of birth", second.slice(13, 19), second[19]],
    ["Expiry date", second.slice(21, 27), second[27]],
  ];
  if (category === "passport") {
    const optional = second.slice(28, 42),
      digit = second[42];
    if (!(optional === "<".repeat(14) && digit === "<"))
      tests.push(["Optional data", optional, digit]);
    tests.push([
      "Composite",
      second.slice(0, 10) + second.slice(13, 20) + second.slice(21, 43),
      second[43],
    ]);
  }
  for (const [label, input, digit] of tests) {
    const computed = checkDigit(input);
    const pass = /^\d$/.test(digit) && computed === Number(digit);
    result.checks.push({
      name: `MRZ ${label.toLowerCase()} checksum`,
      status: pass ? "Passed" : "Failed",
      detail: `Calculated check digit ${computed}; extracted check digit ${digit}. This is a text checksum, not issuer verification.`,
    });
    if (!pass)
      finding(
        "mrz_checksum",
        `${label} MRZ checksum mismatch`,
        `Calculated digit ${computed} differs from extracted digit ${digit}.`,
        "Confirm OCR characters and inspect the original MRZ before making a decision.",
        `mrz.${label}`,
      );
  }
  const names = first
    .slice(5)
    .split("<<")
    .filter(Boolean)
    .map((s) => s.replace(/</g, " ").trim());
  result.fields = {
    documentNumber: second.slice(0, 9).replace(/<+$/, ""),
    nationality: second.slice(10, 13).replace(/</g, ""),
    issuer: first.slice(2, 5).replace(/</g, ""),
    fullName: names.join(", "),
    dateOfBirthMrz: second.slice(13, 19),
    expiryDateMrz: second.slice(21, 27),
  };
  for (const [field, raw] of [
    ["documentNumber", result.fields.documentNumber],
    ["dateOfBirth", second.slice(13, 19)],
    ["expiryDate", second.slice(21, 27)],
  ]) {
    if (!visible[field]) continue;
    const shown =
      field === "documentNumber"
        ? visible[field].replace(/[\s-]/g, "").toUpperCase()
        : /^\d{4}-\d{2}-\d{2}$/.test(visible[field])
          ? visible[field].slice(2).replaceAll("-", "")
          : null;
    if (shown && shown !== raw)
      finding(
        "mrz_conflict",
        `MRZ and visible ${field} disagree`,
        `Visible value and extracted MRZ differ in ${field}.`,
        "Compare both fields against the original; extraction may be incorrect.",
        field,
      );
  }
  result.limitations.push(
    "MRZ checks support strict TD3 passport and MRV-A/B visa layouts only. No OCR character substitution, extended-number layouts, digital signatures, or issuer database verification. MRZ YYMMDD dates do not resolve the century.",
  );
  return result;
}
