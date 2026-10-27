import sharp from "sharp";
import { createWorker } from "tesseract.js";
import english from "@tesseract.js-data/eng";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const fontPath =
  path
    .join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "standard_fonts",
    )
    .split(path.sep)
    .join("/") + "/";
import { analyzeText, validateRules } from "./rules.mjs";
import { documentChecks } from "./documents.mjs";
import { assessRisk, finalizeReport } from "./assessment.mjs";

export async function recognizeImage(buffer) {
  let worker;
  try {
    worker = await createWorker("eng", 1, {
      langPath: english.langPath,
      gzip: true,
      cacheMethod: "none",
      logger: () => {},
      errorHandler: () => {},
    });
    const { data } = await worker.recognize(buffer);
    return { text: data.text, confidence: data.confidence };
  } finally {
    if (worker) await worker.terminate();
  }
}
function pdfDate(value) {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(
    value || "",
  );
  if (!m) return null;
  const d = new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}Z`,
  );
  return isNaN(d.getTime()) ? null : d;
}
export async function analyzeBuffer(
  {
    buffer,
    format,
    fileName,
    category,
    rules: inputRules = {},
    ocrEnabled = true,
  },
  progress = () => {},
  ocr = recognizeImage,
) {
  const startedAt = performance.now();
  const rules = validateRules(inputRules),
    checks = [],
    issues = [],
    limitations = [];
  let text = "",
    confidence = null,
    metadata = {},
    incomplete = false;
  const check = (name, status, detail) => checks.push({ name, status, detail });
  const issue = (title, evidence, action, field = "document") =>
    issues.push({ title, evidence, action, field, severity: "Review" });
  progress("Validating document");
  check(
    "Upload validation",
    "Completed",
    "Extension, MIME type, signature, and 10 MB limit checked by the API.",
  );
  if (format !== "pdf") {
    progress("Measuring image quality");
    let normalized;
    try {
      const image = sharp(buffer, {
        limitInputPixels: 24000000,
        animated: false,
        failOn: "warning",
      });
      const info = await image.metadata();
      if ((info.pages || 1) > 1)
        throw new Error("Multi-frame images are unsupported.");
      const stats = await image
        .clone()
        .flatten({ background: "#ffffff" })
        .greyscale()
        .stats();
      const contrast = stats.channels[0].stdev;
      metadata = {
        format,
        width: info.width,
        height: info.height,
        contrast: Number(contrast.toFixed(2)),
      };
      if (info.width < rules.minImageWidth)
        issue(
          "Low image resolution",
          `${info.width} px wide; minimum configured width ${rules.minImageWidth} px.`,
          "Provide a higher-resolution scan.",
          "image",
        );
      if (contrast < rules.minContrast)
        issue(
          "Low image contrast",
          `Grayscale standard deviation ${contrast.toFixed(2)}; minimum ${rules.minContrast}.`,
          "Use a clearer, evenly lit scan. This measurement does not detect tampering.",
          "image",
        );
      normalized = await image
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      check(
        "Image quality",
        issues.length ? "Review" : "Completed",
        `${info.width} × ${info.height} pixels; grayscale contrast ${contrast.toFixed(2)}. Resolution and contrast only; blur, overlays, and editing artifacts are not measured.`,
      );
    } catch {
      check(
        "Image quality",
        "Failed",
        "Image could not be decoded within the 24-megapixel limit; animated images are unsupported.",
      );
      incomplete = true;
    }
    if (normalized && ocrEnabled) {
      progress("Running local English OCR");
      try {
        const result = await ocr(normalized);
        text = result.text || "";
        confidence = Number.isFinite(result.confidence)
          ? Number(result.confidence.toFixed(1))
          : null;
        check(
          "Text extraction",
          "Completed",
          `Local Tesseract English OCR returned ${text.length} characters.${confidence !== null ? ` Engine confidence ${confidence}/100 (not an authenticity score).` : ""}`,
        );
        if (confidence !== null && confidence < 60)
          issue(
            "Low OCR confidence",
            `Engine-reported mean confidence ${confidence}/100.`,
            "Inspect extracted characters against the source.",
            "text",
          );
      } catch {
        check(
          "Text extraction",
          "Failed",
          "Local OCR failed. No extracted text was fabricated.",
        );
        incomplete = true;
      }
    } else {
      check(
        "Text extraction",
        "Not Run",
        ocrEnabled
          ? "Image decoding failed."
          : "OCR is disabled in server configuration.",
      );
      incomplete = true;
    }
    check("PDF properties", "Not Applicable", "This upload is an image.");
  } else {
    progress("Reading PDF structure");
    let task, doc;
    try {
      task = getDocument({
        data: new Uint8Array(buffer),
        verbosity: 0,
        isEvalSupported: false,
        enableXfa: false,
        useSystemFonts: false,
        standardFontDataUrl: fontPath,
      });
      doc = await task.promise;
      const { info } = await doc.getMetadata();
      const js = await doc.getJSActions();
      const attachments = await doc.getAttachments();
      metadata = {
        format: "pdf",
        pages: doc.numPages,
        title: info.Title || null,
        author: info.Author || null,
        creator: info.Creator || null,
        producer: info.Producer || null,
        creationDate: info.CreationDate || null,
        modificationDate: info.ModDate || null,
        attachments: attachments?.size || 0,
        embeddedImagePaintOperations: 0,
      };
      const created = pdfDate(info.CreationDate),
        modified = pdfDate(info.ModDate);
      if (created && modified && modified < created)
        issue(
          "PDF metadata date ordering",
          `Modification date ${info.ModDate} precedes creation date ${info.CreationDate}. Metadata can be inaccurate.`,
          "Inspect the document generation history.",
          "metadata",
        );
      if (js?.size)
        issue(
          "PDF contains document-level JavaScript",
          `${js.size} action group(s) found. Scripts were not executed.`,
          "Inspect with a secure PDF review tool. Scripts alone do not prove fraud.",
          "metadata",
        );
      if (attachments?.size)
        issue(
          "PDF contains attachments",
          `${attachments.size} attachment(s) found; attachments were not opened or executed.`,
          "Review embedded attachments separately in a secure environment.",
          "metadata",
        );
      const pageLimit = Math.min(doc.numPages, 10);
      let scanned = 0,
        failedPages = 0;
      for (let i = 1; i <= pageLimit; i++) {
        progress(`Extracting PDF page ${i} of ${pageLimit}`);
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let pageText = "",
          lastY = null;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 3) pageText += "\n";
          pageText += item.str + (item.hasEOL ? "\n" : " ");
          lastY = y;
        }
        const operators = await page.getOperatorList();
        metadata.embeddedImagePaintOperations += operators.fnArray.filter(
          (op) =>
            [OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(op),
        ).length;
        if (pageText.replace(/\s/g, "").length < rules.minTextChars) {
          scanned++;
          if (ocrEnabled && scanned <= 3) {
            progress(`Running local OCR on PDF page ${i}`);
            try {
              const unscaled = page.getViewport({ scale: 1 });
              const scale = Math.min(
                2,
                2400 / Math.max(unscaled.width, unscaled.height),
              );
              const viewport = page.getViewport({ scale });
              const canvas = createCanvas(
                Math.ceil(viewport.width),
                Math.ceil(viewport.height),
              );
              await page.render({
                canvas,
                canvasContext: canvas.getContext("2d"),
                viewport,
              }).promise;
              const result = await ocr(canvas.toBuffer("image/png"));
              pageText = result.text || "";
              if (pageText.replace(/\s/g, "").length < rules.minTextChars)
                failedPages++;
            } catch {
              failedPages++;
              limitations.push(`Page ${i}: scanned-page OCR failed.`);
            }
          } else {
            failedPages++;
            limitations.push(
              `Page ${i}: OCR ${ocrEnabled ? "limit of three scanned pages reached" : "disabled"}.`,
            );
          }
        }
        text += pageText + "\n";
        page.cleanup();
      }
      if (doc.numPages > 10) {
        incomplete = true;
        limitations.push("Only the first 10 PDF pages were processed.");
      }
      if (failedPages) {
        incomplete = true;
        limitations.push(
          `${failedPages} processed page(s) lacked sufficient extractable text.`,
        );
      }
      metadata.pagesProcessed = pageLimit;
      metadata.scannedPages = scanned;
      check(
        "PDF properties",
        "Completed",
        `${doc.numPages} pages; ${metadata.embeddedImagePaintOperations} image paint operations on processed pages. Metadata read; absent metadata alone is not flagged. Metadata dates interpreted without timezone offsets.`,
      );
      check(
        "Text extraction",
        failedPages ? "Partial" : "Completed",
        `${pageLimit} page(s) processed; ${scanned} page(s) required OCR; ${text.length} characters. English OCR capped at three scanned pages.`,
      );
      check(
        "Image quality",
        "Not Applicable",
        "PDF text extracted or scanned pages rendered for OCR. Per-image resolution and contrast checks do not run for PDFs.",
      );
    } catch {
      incomplete = true;
      check(
        "PDF properties",
        "Failed",
        "PDF could not be parsed. It may be malformed, encrypted, or unsupported.",
      );
      check(
        "Text extraction",
        "Failed",
        "No complete PDF extraction available.",
      );
    } finally {
      if (task) await task.destroy();
    }
  }
  progress("Applying configured field and date rules");
  if (text.length > 60000) {
    text = text.slice(0, 60000);
    incomplete = true;
    limitations.push("Extracted text capped at 60,000 characters.");
  }
  const preliminary = analyzeText(text, category, { ...rules, required: [] });
  const specific = documentChecks(text, category, preliminary.fields);
  const validation = analyzeText(
    text,
    category,
    rules,
    new Date(),
    specific.fields,
  );
  issues.push(...specific.issues);
  checks.push(...specific.checks);
  limitations.push(...specific.limitations);
  if (specific.insufficient) incomplete = true;
  issues.push(...validation.issues);
  if (!validation.enough) incomplete = true;
  check(
    "Field consistency",
    validation.enough
      ? validation.issues.length
        ? "Review"
        : "Completed"
      : "Not Run",
    validation.enough
      ? `Applied labeled-field rules for ${category}; required: ${validation.rules.required.join(", ") || "none"}. Parser supports English labels, YYYY-MM-DD dates, and dates with written English month names. Ambiguous numeric date formats require manual review.`
      : "Insufficient extracted text for reliable field checks.",
  );
  check(
    "Visual forensics",
    "Not Available",
    "Font alignment, overlays, copy-paste detection, and visible-versus-extracted text comparison are not implemented.",
  );
  check(
    "Official / biometric verification",
    "Not checked",
    "No government database, biometric service, issuer confirmation, or digital signature verification was executed.",
  );
  limitations.push(
    "Heuristic checks cannot establish authenticity or conclusively detect sophisticated manipulation.",
    "OCR and label parsing can miss fields or misread characters. Human review is required.",
  );
  const status = incomplete
    ? "Analysis Incomplete"
    : issues.length
      ? "Review Recommended"
      : "No Suspicious Indicators Detected";
  const completed = checks.filter((c) =>
    ["Completed", "Review", "Passed", "Warning"].includes(c.status),
  ).length;
  progress("Saving analysis report");
  const assessment = assessRisk(issues, incomplete);
  if (category === "aadhaar")
    limitations.push(
      "Raw extracted Aadhaar text is not retained. Identifier patterns are masked before storage and API delivery.",
    );
  return finalizeReport({
    id: `VD-${randomUUID().slice(0, 12).toUpperCase()}`,
    fileName,
    category,
    createdAt: new Date().toISOString(),
    source: "analysis",
    processingStatus: incomplete ? "Partial" : "Completed",
    status,
    fields: validation.fields,
    text: category === "aadhaar" ? "" : text.trim(),
    confidence,
    checks,
    issues: assessment.issues,
    risk: assessment.risk,
    schemaVersion: 2,
    processingTimeMs: Math.round(performance.now() - startedAt),
    metadata,
    rules: validation.rules,
    limitations,
    summary: `${completed} checks completed; ${issues.length} review indicator(s). ${incomplete ? "Important extraction or coverage checks could not be completed." : "Only the configured checks were assessed."} No authenticity determination is made.`,
    notes: "",
  });
}
