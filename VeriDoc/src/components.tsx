import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  UploadCloud,
  ArrowUpRight,
  ScanLine,
  X,
  FileText,
  LockKeyhole,
  ArrowRight,
  Download,
  Copy,
  AlertTriangle,
  Info,
  ShieldCheck,
  Search,
  RefreshCw,
  Check,
  LoaderCircle,
  CreditCard,
  BookOpen,
  Stamp,
} from "lucide-react";
import {
  categoryLabels,
  fieldLabels,
  validateDocument,
  exportReport,
  type AnalysisReport,
  type Category,
} from "./screening";
export const formatDate = (v: string) =>
  new Date(v).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Badge({ children }: { children: ReactNode }) {
  const text = String(children);
  return (
    <span
      className={`badge ${/Review|Partial/.test(text) ? "warning" : /Incomplete|Failed|Error/.test(text) ? "danger" : /Completed|No Suspicious/.test(text) ? "success" : "neutral"}`}
    >
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <ScanLine size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function UploadPanel({
  file,
  setFile,
  category,
  setCategory,
  busy,
  onAnalyze,
  error,
  setError,
  connection = "connected",
  onReconnect,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  category: Category;
  setCategory: (c: Category) => void;
  busy: boolean;
  onAnalyze: () => void;
  error: string;
  setError: (s: string) => void;
  connection?: "checking" | "connected" | "offline";
  onReconnect?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false),
    [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function select(next?: File) {
    if (!next || busy) return;
    const message = validateDocument(next);
    setError(message);
    if (!message) setFile(next);
  }
  return (
    <section className="card upload-card" id="upload">
      <div className="card-head">
        <span className="icon-tile">
          <UploadCloud size={21} />
        </span>
        <div>
          <h2>Analyze a document</h2>
          <p>From upload to evidence, in one workspace</p>
        </div>
        <span className="micro-label">LOCAL PROCESSING</span>
      </div>
      <div className="card-body">
        <fieldset className="document-selector">
          <legend>Document type</legend>
          <div className="document-options">
            {[
              {
                id: "aadhaar",
                label: "Aadhaar Card",
                icon: CreditCard,
                note: "Masked identifiers",
              },
              {
                id: "passport",
                label: "Passport",
                icon: BookOpen,
                note: "TD3 MRZ checks",
              },
              {
                id: "visa",
                label: "Visa",
                icon: Stamp,
                note: "MRV-A / B checks",
              },
            ].map((item) => (
              <label
                key={item.id}
                className={category === item.id ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="document-type"
                  value={item.id}
                  checked={category === item.id}
                  disabled={busy}
                  onChange={() => setCategory(item.id as Category)}
                />
                <item.icon size={22} />
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </label>
            ))}
          </div>
          <p>
            PDF, JPG, JPEG, PNG · 10 MB maximum. Existing WEBP support is
            retained.
          </p>
        </fieldset>
        <label className="form-label" htmlFor="category">
          All document categories
        </label>
        <select
          id="category"
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {Object.entries(categoryLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label="Browse document files"
          accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
          disabled={busy}
          onChange={(e) => {
            select(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div
          className={`dropzone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (busy) return;
            if (e.dataTransfer.files.length !== 1) {
              setError("Drop one document at a time.");
              return;
            }
            select(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <>
              {file.type === "application/pdf" ? (
                <div className="pdf-preview">
                  <FileText size={40} />
                  <strong>PDF document selected</strong>
                  <span>
                    Preview unavailable here. The local backend safely parses
                    PDF content.
                  </span>
                </div>
              ) : preview?.file === file ? (
                <img
                  className="preview"
                  src={preview?.url}
                  alt="Selected document preview"
                  onError={() => {
                    setError(
                      "Unable to decode this image. Choose a valid image.",
                    );
                    setFile(null);
                  }}
                />
              ) : (
                <div className="preview-loading" role="status">
                  <LoaderCircle className="spin" size={20} />
                  Preparing image preview…
                </div>
              )}
              <div className="file-info">
                <FileText size={17} />
                <span>
                  {file.name}
                  <small>{(file.size / 1024).toFixed(1)} KB</small>
                </span>
                <button
                  className="icon-button"
                  aria-label="Remove document"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    setError("");
                  }}
                >
                  <X size={17} />
                </button>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                Replace file
                <ArrowUpRight size={13} />
              </button>
            </>
          ) : (
            <>
              <span className="upload-symbol">
                <UploadCloud size={30} />
              </span>
              <h3>Drop your document here</h3>
              <p>or browse files from your device</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                Browse Files
                <ArrowUpRight size={15} />
              </button>
              <small>
                PNG, JPG, WEBP, PDF <span>·</span> Up to 10 MB
              </small>
            </>
          )}
        </div>
        {error && (
          <div className="error" role="alert">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}
        <div className="privacy-inline">
          <LockKeyhole size={15} />
          <span>
            Sent only to your local backend when you click Analyze. File bytes
            are discarded after processing; extracted text and reports are
            retained locally.
          </span>
        </div>
        {connection !== "connected" && (
          <div className="connection-note" role="status">
            <Info size={16} />
            <span>
              {connection === "checking"
                ? "Checking the analysis connection…"
                : "Analysis is unavailable while the backend is offline. You can select and preview a document; no results will be generated."}
            </span>
            {onReconnect && (
              <button
                className="text-button"
                disabled={connection === "checking" || busy}
                onClick={onReconnect}
              >
                Retry Connection
              </button>
            )}
          </div>
        )}
        <button
          className="primary analyze-button"
          disabled={!file || busy || connection !== "connected"}
          onClick={onAnalyze}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <ScanLine size={18} />
          )}
          <span>{busy ? "Analyzing document…" : "Analyze Document"}</span>
          <ArrowRight size={17} />
        </button>
        <div className="upload-foot">
          <span>No third-party document transmission</span>
          <span>Human review first</span>
        </div>
      </div>
    </section>
  );
}
export { ReportView } from "./report-view";
export function HistoryView({
  reports,
  loading,
  error,
  onRefresh,
  onOpen,
  reportPage = false,
}: {
  reports: AnalysisReport[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpen: (r: AnalysisReport) => void;
  reportPage?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("All results"),
    [day, setDay] = useState("");
  const filtered = reports.filter(
    (r) =>
      (r.id + " " + r.fileName).toLowerCase().includes(search.toLowerCase()) &&
      (status === "All results" || r.status === status) &&
      (!day || r.createdAt.slice(0, 10) === day),
  );
  return (
    <section className="card">
      <div className="filters">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search analysis ID or filename"
            placeholder="Search ID or file name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter result"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {[
            "All results",
            "No Suspicious Indicators Detected",
            "Review Recommended",
            "Analysis Incomplete",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Filter analysis date (UTC)"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <button className="secondary" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh
        </button>
        <button
          className="text-button"
          onClick={() => {
            setSearch("");
            setStatus("All results");
            setDay("");
          }}
        >
          Clear filters
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Document / analysis ID",
                "Analyzed",
                "Category",
                "Result",
                "Processing",
                "Action",
              ].map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading &&
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong className="filename-cell">{r.fileName}</strong>
                    <small>{r.id}</small>
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>{categoryLabels[r.category]}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>
                    <Badge>{r.processingStatus}</Badge>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => onOpen(r)}>
                      View {reportPage ? "Report" : "Analysis"}
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {(loading || !filtered.length) && (
        <Empty
          title={
            loading
              ? "Loading analysis history…"
              : error
                ? "History unavailable"
                : "No matching analyses"
          }
        >
          {loading
            ? "Reading saved reports from your local backend."
            : error
              ? "Reconnect to the existing backend and use Refresh. No example records have been substituted."
              : reports.length
                ? "Adjust your search or clear the filters."
                : "Analyze a document to create your first real report."}
        </Empty>
      )}
      <div className="table-footer">
        {error
          ? "Cached records · connection unavailable"
          : `${filtered.length} matching reports`}{" "}
        · Local SQLite storage · Date filter uses UTC
      </div>
    </section>
  );
}
