import path from "node:path";
export const MAX_BYTES = 10 * 1024 * 1024;
export function validateUpload(file) {
  if (!file || !file.buffer?.length)
    throw Object.assign(new Error("Choose a nonempty file."), { status: 400 });
  if (file.buffer.length > MAX_BYTES)
    throw Object.assign(new Error("Maximum file size is 10 MB."), {
      status: 413,
    });
  const b = file.buffer;
  const format = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "jpeg"
      : b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP"
        ? "webp"
        : b.subarray(0, 5).toString() === "%PDF-"
          ? "pdf"
          : null;
  const allowed = {
    png: { ext: [".png"], mime: "image/png" },
    jpeg: { ext: [".jpg", ".jpeg"], mime: "image/jpeg" },
    webp: { ext: [".webp"], mime: "image/webp" },
    pdf: { ext: [".pdf"], mime: "application/pdf" },
  };
  const rule = allowed[format];
  if (
    !rule ||
    !rule.ext.includes(path.extname(file.originalname || "").toLowerCase()) ||
    file.mimetype !== rule.mime
  )
    throw Object.assign(
      new Error(
        "File extension, MIME type, and signature must match a PNG, JPEG, WEBP, or PDF.",
      ),
      { status: 415 },
    );
  return format;
}
