// Redact before persistence, API delivery, export, and display. Raw OCR exists only in worker memory.
export function maskIdentifiers(value) {
  if (typeof value === "string")
    return value.replace(
      /(?<!\d)\d{4}[\s\u200B-]*\d{4}[\s\u200B-]*(\d{4})(?!\d)/g,
      "XXXX XXXX $1",
    );
  if (Array.isArray(value)) return value.map(maskIdentifiers);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        maskIdentifiers(child),
      ]),
    );
  return value;
}
