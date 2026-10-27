import { maskIdentifiers } from "./privacy.mjs";
import express from "express";
import multer from "multer";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { ReportStore } from "./store.mjs";
import { MAX_BYTES, validateUpload } from "./upload.mjs";
import {
  categories,
  defaultRules,
  fieldLabels,
  validateRules,
} from "./rules.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
export function runAnalysis(data, onProgress, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 384 },
    });
    let finished = false;
    const finish = (error, report) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      error ? reject(error) : resolve(report);
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Analysis timed out after 90 seconds. Try a smaller document.",
          ),
        ),
      timeout,
    );
    worker.on("message", (message) => {
      if (message.stage) onProgress(message.stage);
      if (message.report) finish(null, message.report);
      if (message.error) finish(new Error(message.error));
    });
    worker.on("error", () =>
      finish(
        new Error("Analysis worker failed. Try a clearer or smaller file."),
      ),
    );
    worker.on("exit", () => {
      if (!finished) finish(new Error("Analysis stopped before completion."));
    });
  });
}
export function createApp({
  store = new ReportStore(
    path.join(root, "data", "veridoc.sqlite"),
    Number(process.env.RETENTION_DAYS) || 7,
  ),
  runner = runAnalysis,
  ocrEnabled = process.env.OCR_ENABLED !== "false",
  onError = (error, request) => {
    const frames =
      typeof error.stack === "string"
        ? error.stack
            .split("\n")
            .slice(1)
            .filter((line) => line.trim().startsWith("at "))
            .join("\n")
        : "";
    console.error(
      `[VeriDoc] ${request.method} ${request.route?.path || "API request"} failed (${error.name || "Error"}).\n${frames}`,
    );
  },
} = {}) {
  const app = express(),
    jobs = new Map();
  let occupied = false;
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host))
      return res
        .status(403)
        .json({ error: "This server accepts localhost access only." });
    const origin = req.headers.origin;
    if (origin) {
      try {
        const u = new URL(origin);
        if (
          !["127.0.0.1", "localhost"].includes(u.hostname) ||
          !["5173", "4173", String(process.env.PORT || 4100)].includes(u.port)
        )
          return res.status(403).json({ error: "Origin is not allowed." });
      } catch {
        return res.status(403).json({ error: "Invalid origin." });
      }
    }
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; frame-src 'self' blob:; object-src 'none'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: "12kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      name: "VeriDoc",
      status: "ready",
      ocrEnabled,
      ocrLanguage: "English",
      retentionDays: store.retentionDays,
      maxFileBytes: MAX_BYTES,
      maxPdfPages: 10,
      maxScannedPages: 3,
      categories,
      defaultRules,
      fieldLabels,
    }),
  );
  app.get("/api/analyses", (_req, res, next) => {
    try {
      res.json(store.all());
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/analyses/:id", (req, res, next) => {
    try {
      const report = store.get(req.params.id);
      report
        ? res.json(report)
        : res
            .status(404)
            .json({ error: "Report not found or retention period ended." });
    } catch (error) {
      next(error);
    }
  });
  app.put("/api/analyses/:id/notes", (req, res, next) => {
    try {
      if (typeof req.body?.notes !== "string" || req.body.notes.length > 2000)
        return res.status(400).json({
          error: "Notes must be a string of at most 2,000 characters.",
        });
      const report = store.get(req.params.id);
      if (!report) return res.status(404).json({ error: "Report not found." });
      report.notes = maskIdentifiers(req.body.notes.trim());
      store.put(report);
      res.json(report);
    } catch (error) {
      next(error);
    }
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_BYTES,
      files: 1,
      fields: 2,
      fieldSize: 4096,
      parts: 3,
    },
  }).single("document");
  app.post("/api/analyses", (req, res, next) => {
    if (occupied)
      return res
        .status(429)
        .json({ error: "Another analysis is running. Please wait and retry." });
    occupied = true;
    upload(req, res, (error) => {
      if (error) {
        occupied = false;
        return next(error);
      }
      try {
        const format = validateUpload(req.file),
          category = req.body.category;
        if (!categories.includes(category))
          throw Object.assign(new Error("Choose a valid document category."), {
            status: 400,
          });
        let rules;
        try {
          rules = validateRules(JSON.parse(req.body.rules || "{}"));
        } catch {
          throw Object.assign(
            new Error("Invalid validation rule configuration."),
            { status: 400 },
          );
        }
        const id = randomUUID();
        const job = {
          id,
          status: "processing",
          stage: "Validating document",
          createdAt: Date.now(),
        };
        jobs.set(id, job);
        for (const [key, value] of jobs)
          if (Date.now() - value.createdAt > 3600000) jobs.delete(key);
        while (jobs.size > 100) jobs.delete(jobs.keys().next().value);
        const data = {
          buffer: req.file.buffer,
          format,
          fileName: path
            .basename(req.file.originalname.replace(/\\/g, "/"))
            .replace(/[\x00-\x1f]/g, "")
            .slice(0, 180),
          category,
          rules,
          ocrEnabled,
        };
        // Original upload buffers live only in memory. Reports persist; document bytes are never written to disk.
        runner(data, (stage) => {
          job.stage = stage;
        })
          .then((report) => {
            store.put(report);
            job.status = "completed";
            job.stage = "Report ready";
            job.reportId = report.id;
          })
          .catch((error) => {
            job.status = "failed";
            job.stage = "Analysis failed";
            job.error = error.message?.includes("timed out")
              ? "Analysis timed out. Try a smaller document."
              : "Analysis could not complete or its report could not be saved. Please retry.";
          })
          .finally(() => {
            occupied = false;
            data.buffer = null;
          });
        req.file.buffer = null;
        res.status(202).json({ jobId: id });
      } catch (error) {
        occupied = false;
        next(error);
      }
    });
  });
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    job
      ? res.json(job)
      : res.status(404).json({
          error:
            "Analysis job not found. Refresh history to check saved reports.",
        });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  const dist = path.join(root, "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*page}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    const status =
      error.code === "LIMIT_FILE_SIZE"
        ? 413
        : error instanceof multer.MulterError
          ? 400
          : error.status || 500;
    if (status >= 500) onError(error, _req);
    res.status(status).json({
      error:
        status === 413
          ? "Maximum file size is 10 MB."
          : status >= 500
            ? "The local service could not complete this request."
            : error instanceof multer.MulterError
              ? "Upload one supported document with valid fields."
              : error.message || "Invalid request.",
    });
  });
  return { app, store };
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const port = Number(process.env.PORT) || 4100;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("PORT must be between 1024 and 65535.");
  const retention = Number(process.env.RETENTION_DAYS || 7);
  if (!Number.isInteger(retention) || retention < 1 || retention > 30)
    throw new Error("RETENTION_DAYS must be between 1 and 30.");
  const { app, store } = createApp({
    store: new ReportStore(
      path.join(root, "data", "veridoc.sqlite"),
      retention,
    ),
  });
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(`VeriDoc local API: http://127.0.0.1:${port}`),
  );
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () =>
      server.close(() => {
        store.close();
        process.exit(0);
      }),
    );
}
