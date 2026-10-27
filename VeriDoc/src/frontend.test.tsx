import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryView, UploadPanel } from "./components";
import { validateDocument } from "./screening";
const noop = () => {};
const upload = (extra: Partial<Parameters<typeof UploadPanel>[0]> = {}) =>
  renderToStaticMarkup(<UploadPanel file={null} setFile={noop} category="identity" setCategory={noop} busy={false} onAnalyze={noop} error="" setError={noop} {...extra}/>);

describe("upload readiness and preview states", () => {
  it("allows file selection offline, but prevents submitting an analysis", () => {
    const html = upload({connection:"offline", file:new File(["image"],"sample.png",{type:"image/png"}),onReconnect:noop});
    expect(html).toContain("Analysis is unavailable while the backend is offline");
    expect(html).toMatch(/class="primary analyze-button" disabled=""/);
    expect(html).toContain("Retry Connection");
    expect(html).not.toMatch(/class="sr-only"[^>]*disabled/);
  });
  it("waits for an object URL before rendering an image, avoiding empty-src decode errors", () => {
    const html = upload({file:new File(["image"],"sample.png",{type:"image/png"})});
    expect(html).toContain("Preparing image preview");
    expect(html).not.toContain("<img");
  });
  it("keeps repeated submissions and file replacement disabled during processing", () => {
    const html = upload({busy:true,file:new File(["pdf"],"sample.pdf",{type:"application/pdf"})});
    expect(html).toContain("Analyzing document");
    expect(html).toMatch(/aria-label="Remove document" disabled=""/);
    expect(html).toMatch(/class="primary analyze-button" disabled=""/);
  });
});

describe("history error and empty states", () => {
  it("does not imply an unavailable history is a successful empty response", () => {
    const html = renderToStaticMarkup(<HistoryView reports={[]} loading={false} error="Backend unavailable" onRefresh={noop} onOpen={noop}/>);
    expect(html).toContain("History unavailable");
    expect(html).toContain("No example records have been substituted");
    expect(html).not.toContain("create your first real report");
    expect(html).not.toContain("0 matching reports");
  });
  it("keeps genuine empty and loading states distinct", () => {
    const empty = renderToStaticMarkup(<HistoryView reports={[]} loading={false} error="" onRefresh={noop} onOpen={noop}/>);
    const loading = renderToStaticMarkup(<HistoryView reports={[]} loading={true} error="" onRefresh={noop} onOpen={noop}/>);
    expect(empty).toContain("create your first real report");
    expect(loading).toContain("Loading analysis history");
  });
});

describe("matching extension and MIME validation", () => {
  it("rejects renamed files while retaining all supported formats", () => {
    expect(validateDocument({name:"scan.png",type:"application/pdf",size:128})).toContain("do not match");
    expect(validateDocument({name:"scan.pdf",type:"image/png",size:128})).toContain("do not match");
    for (const [name,type] of [["scan.PNG","image/png"],["scan.jpeg","image/jpeg"],["scan.webp","image/webp"],["scan.pdf","application/pdf"]])
      expect(validateDocument({name,type,size:128})).toBe("");
  });
});
