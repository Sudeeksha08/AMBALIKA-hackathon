import { parseAnalysisReport, parseHistory, readable } from "./report-schema";
import type {
  AnalysisReport,
  Category,
  Health,
  RuleSettings,
} from "./screening";
const base = (
  (import.meta as ImportMeta & { env: Record<string, string> }).env
    .VITE_API_BASE_URL || "/api"
).replace(/\/$/, "");
export async function request<T>(
  path: string,
  options: RequestInit = {},
  timeout = 15000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        (typeof body?.error === "string"
          ? readable(
              body.error,
              "The backend could not complete the request. Check its terminal logs.",
            )
          : "") ||
          (response.status >= 500
            ? `The API returned HTTP ${response.status} without an error explanation. Check that npm run server is running, then inspect the backend and Vite terminals and retry.`
            : `API request failed (${response.status}).`),
      );
    if (body === null) throw new Error("The API returned an invalid response.");
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error(
        "The local API timed out. Check the backend and refresh history before retrying.",
      );
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the local API. Start the backend with npm run server.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export const screeningService = {
  health: async () => {
    const health = await request<Health>("/health");
    if (
      !health ||
      health.status !== "ready" ||
      typeof health.ocrEnabled !== "boolean" ||
      !Number.isFinite(health.retentionDays)
    )
      throw new Error(
        "The backend returned invalid health information. Check its terminal logs.",
      );
    return health;
  },
  history: async () => parseHistory(await request<unknown>("/analyses")),
  notes: async (id: string, notes: string) =>
    parseAnalysisReport(
      await request<unknown>(`/analyses/${encodeURIComponent(id)}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      }),
    ),
  async analyze(
    file: File,
    category: Category,
    rules: RuleSettings,
    onProgress: (stage: string) => void,
  ): Promise<AnalysisReport> {
    const body = new FormData();
    body.append("document", file);
    body.append("category", category);
    body.append("rules", JSON.stringify(rules));
    onProgress("Uploading to the local analysis service");
    const { jobId } = await request<{ jobId: string }>(
      "/analyses",
      { method: "POST", body },
      30000,
    );
    if (typeof jobId !== "string" || !jobId)
      throw new Error(
        "The backend returned an invalid upload response. Refresh history before retrying.",
      );
    const started = Date.now();
    while (Date.now() - started < 105000) {
      const job = await request<{
        status: string;
        stage: string;
        reportId?: string;
        error?: string;
      }>(`/jobs/${encodeURIComponent(jobId)}`);
      onProgress(readable(job.stage, "Processing document…"));
      if (job.status === "failed")
        throw new Error(
          readable(
            job.error,
            "Analysis failed. Check the backend logs and retry.",
          ),
        );
      if (job.status === "completed" && job.reportId)
        return parseAnalysisReport(
          await request<unknown>(
            `/analyses/${encodeURIComponent(job.reportId)}`,
          ),
        );
      if (job.status !== "processing")
        throw new Error(
          "The backend returned an invalid analysis state. Refresh history before retrying.",
        );
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      "Analysis took too long. Refresh history before submitting again.",
    );
  },
};
