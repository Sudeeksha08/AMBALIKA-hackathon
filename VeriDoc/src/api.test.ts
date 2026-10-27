import { afterEach, describe, expect, it, vi } from "vitest";
import { request, screeningService } from "./api";
import { validateDocument } from "./screening";
afterEach(() => vi.unstubAllGlobals());
describe("real upload validation", () => {
  it("accepts supported PDFs and images, rejects unsupported names and oversized files", () => {
    expect(
      validateDocument({ name: "scan.pdf", type: "application/pdf", size: 50 }),
    ).toBe("");
    expect(
      validateDocument({ name: "scan.exe", type: "image/png", size: 50 }),
    ).toContain("PDF");
    expect(
      validateDocument({ name: "scan.png", type: "image/png", size: 10485761 }),
    ).toContain("10 MB");
    expect(
      validateDocument({ name: "scan.png", type: "image/png", size: 0 }),
    ).toContain("empty");
  });
});
describe("API failure handling", () => {
  it("surfaces server validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 415,
          json: async () => ({ error: "File signature mismatch." }),
        }),
    );
    await expect(request("/analyses")).rejects.toThrow(
      "File signature mismatch",
    );
  });
  it("explains a disconnected backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(request("/health")).rejects.toThrow("npm run server");
  });
  it("rejects malformed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("invalid");
        },
      }),
    );
    await expect(request("/health")).rejects.toThrow("invalid response");
  });
  it("does not substitute demo results for a failed analysis job", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobId: "test-job" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "failed",
            stage: "Failed",
            error: "OCR process failed.",
          }),
        }),
    );
    await expect(
      screeningService.analyze(
        new File(["test"], "sample.png", { type: "image/png" }),
        "identity",
        { minTextChars: 25, minImageWidth: 600, minContrast: 12 },
        () => {},
      ),
    ).rejects.toThrow("OCR process failed");
  });
});

describe("proxy outage diagnostics", () => {
  it("explains Vite's empty 500 response without inventing results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new SyntaxError("Empty body"); },
    }));
    await expect(request("/health")).rejects.toThrow("npm run server");
    await expect(request("/analyses")).rejects.toThrow("HTTP 500");
  });
  it("preserves an explicit backend 500 error instead of mislabeling it offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500, json: async () => ({error:"The local service could not complete this request."}),
    }));
    await expect(request("/analyses")).rejects.toThrow("The local service could not complete this request.");
  });
  it("shows the structured proxy service-unavailable message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({error:"Cannot reach the VeriDoc backend. Run npm run server."}),
    }));
    await expect(request("/health")).rejects.toThrow("Cannot reach the VeriDoc backend");
  });
});
