import { parentPort, workerData } from "node:worker_threads";
import { analyzeBuffer } from "./pipeline.mjs";
try {
  const report = await analyzeBuffer(
    { ...workerData, buffer: Buffer.from(workerData.buffer) },
    (stage) => parentPort.postMessage({ stage }),
  );
  parentPort.postMessage({ report });
} catch {
  parentPort.postMessage({
    error: "Analysis could not be completed. Try another document.",
  });
}
