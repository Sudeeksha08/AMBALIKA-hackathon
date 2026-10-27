import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ShieldCheck,
  LayoutDashboard,
  History,
  ScanLine,
  Files,
  Settings,
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
  Plus,
  FileText,
  AlertTriangle,
  LockKeyhole,
  Menu,
  X,
  Info,
  LoaderCircle,
  CircleCheck,
  CircleHelp,
  Server,
  Download,
} from "lucide-react";
import { screeningService } from "./api";
import {
  Badge,
  Empty,
  HistoryView,
  ReportView,
  UploadPanel,
  formatDate,
} from "./components";
import {
  categoryLabels,
  defaultRequired,
  defaultSettings,
  fieldLabels,
  type AnalysisReport,
  type Category,
  type Health,
  type RuleSettings,
} from "./screening";
import "./style.css";
const nav = [
  { id: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { id: "analyze", name: "Analyze Document", icon: ScanLine },
  { id: "history", name: "Verification History", icon: History },
  { id: "reports", name: "Reports", icon: Files },
  { id: "settings", name: "Settings", icon: Settings },
];
const route = () => {
  const value = location.hash.slice(1);
  return [...nav.map((n) => n.id), "results"].includes(value)
    ? value
    : "dashboard";
};
function App() {
  const [page, setPage] = useState(route),
    [drawer, setDrawer] = useState(false),
    [reports, setReports] = useState<AnalysisReport[]>([]),
    [current, setCurrent] = useState<AnalysisReport | null>(null),
    [health, setHealth] = useState<Health | null>(null),
    [historyError, setHistoryError] = useState(""),
    [loading, setLoading] = useState(true),
    [file, setFile] = useState<File | null>(null),
    [category, setCategory] = useState<Category>("passport"),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [error, setError] = useState(""),
    [notes, setNotes] = useState(""),
    [saving, setSaving] = useState(false),
    [toast, setToast] = useState(""),
    [privacy, setPrivacy] = useState(false),
    [settings, setSettings] = useState<RuleSettings>(defaultSettings),
    [required, setRequired] =
      useState<Record<Category, string[]>>(defaultRequired);
  const dialog = useRef<HTMLDialogElement>(null),
    locked = useRef(false),
    mounted = useRef(true),
    sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const onResize = () => {
      if (!media.matches) setDrawer(false);
    };
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);
  useEffect(() => {
    if (!drawer || !sidebar.current) return;
    const panel = sidebar.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawer(false);
      }
      if (event.key !== "Tab") return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"),
      );
      const first = targets[0],
        last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      menuButton.current?.focus();
    };
  }, [drawer]);
  async function refresh() {
    setLoading(true);
    try {
      const [h, items] = await Promise.all([
        screeningService.health(),
        screeningService.history(),
      ]);
      if (mounted.current) {
        setHealth(h);
        setReports(items);
        setHistoryError("");
      }
    } catch (e) {
      if (mounted.current) {
        setHistoryError(
          e instanceof Error ? e.message : "Unable to load local reports.",
        );
        setHealth(null);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const listener = () => setPage(route());
    window.addEventListener("hashchange", listener);
    try {
      const saved = JSON.parse(
        localStorage.getItem("veridoc.settings") || "null",
      );
      if (saved) {
        if (
          [
            ["minTextChars", 5, 500],
            ["minImageWidth", 100, 2000],
            ["minContrast", 1, 80],
          ].every(
            ([k, min, max]) =>
              typeof saved.settings?.[k] === "number" &&
              saved.settings[k] >= Number(min) &&
              saved.settings[k] <= Number(max),
          ) &&
          saved.required &&
          typeof saved.required === "object" &&
          Object.entries(saved.required).every(
            ([key, fields]) =>
              Object.hasOwn(defaultRequired, key) &&
              Array.isArray(fields) &&
              fields.every(
                (field: unknown) =>
                  typeof field === "string" &&
                  Object.hasOwn(fieldLabels, field),
              ),
          )
        ) {
          setSettings(saved.settings);
          setRequired({ ...defaultRequired, ...saved.required });
        }
      }
    } catch {
      setToast("Saved rule preferences could not be read. Defaults applied.");
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("hashchange", listener);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (privacy) dialog.current?.showModal();
    else dialog.current?.close();
  }, [privacy]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (busy || notes !== (current?.notes || "")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy, notes, current]);
  function navigate(next: string) {
    location.hash = next;
    setPage(next);
    setDrawer(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function discard() {
    return (
      notes === (current?.notes || "") ||
      confirm("Discard unsaved reviewer notes?")
    );
  }
  function reset() {
    if (busy || !discard()) return;
    setCurrent(null);
    setNotes("");
    setFile(null);
    setError("");
    navigate("analyze");
  }
  async function analyze() {
    if (!file || locked.current || !discard()) return;
    if (!health || loading) {
      setError(
        "Connect to the existing backend before analyzing. Use Retry Connection; your selected file is preserved.",
      );
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    setCurrent(null);
    setNotes("");
    try {
      const report = await screeningService.analyze(
        file,
        category,
        { ...settings, required: required[category] },
        (message) => {
          if (mounted.current) setStage(message);
        },
      );
      if (!mounted.current) return;
      setCurrent(report);
      setNotes(report.notes);
      setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
      setFile(null);
      navigate("results");
      setToast("Analysis report saved locally.");
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Analysis failed. Please retry.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) {
        setBusy(false);
        setStage("");
      }
    }
  }
  function open(report: AnalysisReport) {
    if (busy || !discard()) return;
    setCurrent(report);
    setNotes(report.notes);
    setError("");
    navigate("results");
  }
  async function saveNotes() {
    if (!current || saving) return;
    setSaving(true);
    try {
      const updated = await screeningService.notes(current.id, notes);
      setCurrent(updated);
      setNotes(updated.notes);
      setReports((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
      setToast("Reviewer notes saved to the local database.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Notes could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  async function sample() {
    if (busy || !discard()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 850;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Sample creation is unavailable in this browser.");
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1400, 850);
    ctx.fillStyle = "#162036";
    ctx.font = "bold 42px Arial";
    ctx.fillText(
      `${categoryLabels[category].toUpperCase()} - FICTIONAL SAMPLE / NOT VALID`,
      60,
      90,
    );
    ctx.font = "32px Arial";
    [
      "Full Name: Alex Example",
      category === "aadhaar"
        ? "Aadhaar Number: XXXX XXXX 0123"
        : "Document Number: DEMO-XX123456",
      "Date of Birth: 2000-01-01",
      "Issue Date: 2024-01-01",
      "Expiry Date: 2030-01-01",
      "Issuer: Example Training Organization",
    ].forEach((text, i) => ctx.fillText(text, 60, 190 + i * 75));
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Sample creation failed.");
        return;
      }
      setFile(
        new File([blob], "veridoc-fictional-sample.png", { type: "image/png" }),
      );

      setError("");
      navigate("analyze");
      setToast(
        "Fictional sample selected. Click Analyze to run the real local pipeline.",
      );
    }, "image/png");
  }
  const stats = [
    {
      label: "Documents analyzed",
      value: reports.length,
      detail: "Saved analysis records",
      icon: FileText,
      color: "purple",
    },
    {
      label: "Flagged for review",
      value: reports.filter((r) => r.status === "Review Recommended").length,
      detail: "Review recommended",
      icon: AlertTriangle,
      color: "amber",
    },
    {
      label: "No indicators detected",
      value: reports.filter(
        (r) => r.status === "No Suspicious Indicators Detected",
      ).length,
      detail: "Within configured checks",
      icon: CircleCheck,
      color: "green",
    },
    {
      label: "Further investigation",
      value: reports.filter((r) => r.status === "Analysis Incomplete").length,
      detail: "Incomplete analyses",
      icon: CircleHelp,
      color: "cyan",
    },
  ];
  const title =
    page === "results"
      ? "Analysis Results"
      : nav.find((n) => n.id === page)?.name || "Dashboard";
  return (
    <div className="app">
      <aside
        id="primary-navigation"
        ref={sidebar}
        className={`sidebar ${drawer ? "open" : ""}`}
        aria-label="Workspace navigation"
      >
        <button
          className="sidebar-close icon-button"
          aria-label="Close navigation menu"
          onClick={() => setDrawer(false)}
        >
          <X size={20} />
        </button>
        <a
          href="#dashboard"
          className="brand"
          onClick={() => navigate("dashboard")}
        >
          <img src="/veridoc.svg" alt="" />
          <span>
            Veri<span className="brand-accent">Doc</span>
            <small>DOCUMENT INTELLIGENCE</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.id}
              className={
                page === item.id ||
                (page === "results" && item.id === "reports")
                  ? "active"
                  : ""
              }
              aria-current={
                page === item.id ||
                (page === "results" && item.id === "reports")
                  ? "page"
                  : undefined
              }
              href={`#${item.id}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              {item.name}
              {item.id === "history" ? (
                <span className="nav-count">{reports.length}</span>
              ) : (
                <ChevronRight size={14} />
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className={`status-dot ${health ? "online" : ""}`} />
            <span>
              {loading
                ? "Checking local engine…"
                : health
                  ? "Local engine connected"
                  : "Local engine offline"}
              <small>
                {health
                  ? health.ocrEnabled
                    ? "English OCR + rule checks"
                    : "OCR disabled · PDF text / rules"
                  : "Start the backend to analyze"}
              </small>
            </span>
          </div>
          <button
            className="privacy-link"
            onClick={() => {
              setDrawer(false);
              setPrivacy(true);
            }}
          >
            <LockKeyhole size={14} />
            Privacy & retention
            <ArrowUpRight size={13} />
          </button>
          <div className="version">
            VeriDoc Workspace<span>v2.0</span>
          </div>
        </div>
      </aside>
      {drawer && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="main-shell">
        <header>
          <div className="breadcrumbs">
            <button
              ref={menuButton}
              aria-controls="primary-navigation"
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(!drawer)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="engine-pill">
              <span className={`status-dot ${health ? "online" : ""}`} />
              {loading
                ? "CONNECTING"
                : health
                  ? "LOCAL ANALYSIS"
                  : "API OFFLINE"}
            </span>
            <div className="reviewer">
              <span className="avatar">LR</span>
              <span>
                Local Reviewer<small>Private review workspace</small>
              </span>
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                DOCUMENT INTELLIGENCE <span>/</span>{" "}
                {page === "dashboard" ? "OVERVIEW" : title.toUpperCase()}
              </div>
              <h1>
                {page === "dashboard"
                  ? "Document intelligence, with evidence."
                  : title}
              </h1>
              <p>
                {page === "dashboard"
                  ? "Screen documents, investigate indicators, and make informed review decisions."
                  : page === "analyze"
                    ? "Choose a document category and run the local screening pipeline."
                    : page === "settings"
                      ? "Configure the scope of your review. Every report records the rules that ran."
                      : page === "results"
                        ? "Review the evidence, coverage, and next steps for this document."
                        : "Real analysis records from your local document screening service."}
              </p>
            </div>
            <button className="primary" disabled={busy} onClick={reset}>
              <Plus size={17} />
              New Analysis
            </button>
          </div>
          <div className="notice">
            <Info size={17} />
            <span>
              <strong>Evidence supports decisions.</strong> VeriDoc runs local
              OCR and configurable heuristic checks. Results do not establish
              document authenticity.
            </span>
            <span className="micro-label">HUMAN REVIEW FIRST</span>
          </div>
          {(page === "dashboard" || page === "analyze") && (
            <>
              {page === "dashboard" && (
                <div className="stats">
                  {stats.map((s) => (
                    <section className="stat" key={s.label}>
                      <div className="stat-top">
                        <span>{s.label}</span>
                        <span className={`stat-icon ${s.color}`}>
                          <s.icon size={19} />
                        </span>
                      </div>
                      <strong>
                        {loading || historyError
                          ? "—"
                          : s.value.toLocaleString()}
                      </strong>
                      <small>{s.detail}</small>
                    </section>
                  ))}
                </div>
              )}
              {historyError && (
                <div role="alert" className="error">
                  <AlertTriangle size={17} />
                  {historyError}
                  <button
                    className="text-button"
                    onClick={() => void refresh()}
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="workspace-grid">
                <UploadPanel
                  file={file}
                  setFile={setFile}
                  category={category}
                  setCategory={setCategory}
                  busy={busy}
                  onAnalyze={() => void analyze()}
                  error={error}
                  setError={setError}
                  connection={
                    loading ? "checking" : health ? "connected" : "offline"
                  }
                  onReconnect={() => void refresh()}
                />
                <div className="right-stack">
                  <section className="card overview">
                    <div className="card-head">
                      <div>
                        <h2>
                          {busy
                            ? "Analysis in progress"
                            : "Your review workspace"}
                        </h2>
                        <p>
                          {busy
                            ? "Live status from the backend"
                            : "Clear checks. Transparent limitations."}
                        </p>
                      </div>
                      <span
                        className={`status-dot ${health ? "online" : ""}`}
                      />
                    </div>
                    {busy ? (
                      <div
                        className="live-progress"
                        role="status"
                        aria-live="polite"
                      >
                        <span className="scan-orbit">
                          <ScanLine size={34} />
                        </span>
                        <h3>{stage}</h3>
                        <p>
                          Processing locally. Complex scans can take up to 90
                          seconds.
                        </p>
                        <div className="indeterminate">
                          <span />
                        </div>
                        <small>No simulated completion percentage</small>
                      </div>
                    ) : (
                      <Empty title="Ready for your next review">
                        Upload a document to inspect extracted text, validation
                        evidence, and technical properties.
                      </Empty>
                    )}
                  </section>
                  <section className="capability-card">
                    <div className="sample-top">
                      <span className="icon-tile">
                        <ShieldCheck size={20} />
                      </span>
                      <span className="micro-label">
                        BUILT FOR TRANSPARENCY
                      </span>
                    </div>
                    <h3>What actually runs?</h3>
                    <ul>
                      <li>
                        <CircleCheck size={14} />
                        Local English OCR & PDF extraction
                      </li>
                      <li>
                        <CircleCheck size={14} />
                        Resolution, contrast & field checks
                      </li>
                      <li>
                        <Info size={14} />
                        Visual forensics remains unavailable
                      </li>
                    </ul>
                    <button
                      className="text-button sample-action"
                      disabled={busy}
                      onClick={() => void sample()}
                    >
                      Load Fictional Sample Document
                      <ArrowRight size={16} />
                    </button>
                    <small>
                      Creates a sample image. Analysis runs only after you click
                      Analyze.
                    </small>
                  </section>
                </div>
              </div>
            </>
          )}
          {busy && page !== "dashboard" && page !== "analyze" && (
            <div className="notice" role="status">
              <LoaderCircle size={17} className="spin" />
              {stage} · Analysis continues locally.
            </div>
          )}
          {error && page !== "dashboard" && page !== "analyze" && !busy && (
            <div className="error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => navigate("analyze")}
              >
                Return to Upload
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <section className="card recent">
              <div className="card-head">
                <div>
                  <h2>Recent activity</h2>
                  <p>Your latest saved document analyses</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("history")}
                >
                  View all analyses
                  <ArrowRight size={15} />
                </button>
              </div>
              {loading ? (
                <Empty title="Loading records…">
                  Connecting to local history.
                </Empty>
              ) : historyError && !reports.length ? (
                <Empty title="Recent activity unavailable">
                  Reconnect to the existing backend and click Retry. No sample
                  records are shown as real history.
                </Empty>
              ) : reports.length ? (
                reports.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    className="recent-row"
                    disabled={busy}
                    onClick={() => open(r)}
                  >
                    <span className="icon-tile">
                      <FileText size={19} />
                    </span>
                    <span>
                      <strong>{r.fileName}</strong>
                      <small>
                        {r.id} · {formatDate(r.createdAt)}
                      </small>
                    </span>
                    <Badge>{r.status}</Badge>
                    <ArrowUpRight size={16} />
                  </button>
                ))
              ) : (
                <Empty title="A clean slate">
                  Your first document analysis will appear here. No illustrative
                  records or statistics are added.
                </Empty>
              )}
            </section>
          )}
          {page === "results" &&
            (current ? (
              <ReportView
                report={current}
                notes={notes}
                setNotes={setNotes}
                onSave={() => void saveNotes()}
                saving={saving}
                onReset={reset}
                notify={setToast}
                onDashboard={() => navigate("dashboard")}
              />
            ) : (
              <section className="card">
                <Empty title="Select an analysis to view its report">
                  Open Verification History to choose a saved analysis.
                </Empty>
                <div className="center-action">
                  <button
                    className="primary"
                    onClick={() => navigate("history")}
                  >
                    Open History
                    <ArrowRight size={16} />
                  </button>
                </div>
              </section>
            ))}
          {(page === "history" || page === "reports") && (
            <HistoryView
              reports={reports}
              loading={loading}
              error={historyError}
              onRefresh={() => void refresh()}
              onOpen={open}
              reportPage={page === "reports"}
            />
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="card">
                <div className="card-head">
                  <span className="icon-tile">
                    <Settings size={20} />
                  </span>
                  <div>
                    <h2>Validation rules</h2>
                    <p>Preferences apply to future analyses only</p>
                  </div>
                </div>
                <div className="card-body settings-form">
                  <label htmlFor="settings-category">Document category</label>
                  <select
                    id="settings-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <fieldset>
                    <legend>Expected labeled fields</legend>
                    <p>
                      Missing labels trigger review, not a fraud conclusion.
                      Choose fields appropriate for your document template.
                    </p>
                    <div className="checkbox-grid">
                      {Object.entries(fieldLabels).map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={required[category].includes(key)}
                            onChange={(e) =>
                              setRequired((prev) => ({
                                ...prev,
                                [category]: e.target.checked
                                  ? [...prev[category], key]
                                  : prev[category].filter((v) => v !== key),
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {[
                    {
                      key: "minTextChars",
                      label: "Minimum readable characters",
                      min: 5,
                      max: 500,
                    },
                    {
                      key: "minImageWidth",
                      label: "Minimum image width (pixels)",
                      min: 100,
                      max: 2000,
                    },
                    {
                      key: "minContrast",
                      label: "Minimum grayscale contrast (standard deviation)",
                      min: 1,
                      max: 80,
                    },
                  ].map((s) => (
                    <label key={s.key}>
                      {s.label}
                      <input
                        type="number"
                        min={s.min}
                        max={s.max}
                        value={settings[s.key as keyof RuleSettings] as number}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            [s.key]: Number(e.target.value),
                          }))
                        }
                      />
                      <small>
                        Allowed range {s.min}–{s.max}
                      </small>
                    </label>
                  ))}
                  <div className="settings-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setSettings(defaultSettings);
                        setRequired(defaultRequired);
                      }}
                    >
                      Restore Defaults
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        if (
                          settings.minTextChars < 5 ||
                          settings.minTextChars > 500 ||
                          settings.minImageWidth < 100 ||
                          settings.minImageWidth > 2000 ||
                          settings.minContrast < 1 ||
                          settings.minContrast > 80
                        ) {
                          setToast(
                            "Set all numeric rules within their allowed ranges.",
                          );
                          return;
                        }
                        try {
                          localStorage.setItem(
                            "veridoc.settings",
                            JSON.stringify({ settings, required }),
                          );
                          setToast("Rule preferences saved in this browser.");
                        } catch {
                          setToast(
                            "Browser storage unavailable. Rules apply to this session only.",
                          );
                        }
                      }}
                    >
                      Save Preferences
                    </button>
                  </div>
                </div>
              </section>
              <div className="right-stack">
                <section className="card">
                  <div className="card-head">
                    <span className="icon-tile">
                      <Server size={20} />
                    </span>
                    <h2>Engine configuration</h2>
                  </div>
                  <dl className="properties">
                    <div>
                      <dt>Processing</dt>
                      <dd>Local Node.js backend</dd>
                    </div>
                    <div>
                      <dt>OCR</dt>
                      <dd>
                        {health
                          ? health.ocrEnabled
                            ? "Tesseract · English"
                            : "Disabled by server"
                          : "API offline"}
                      </dd>
                    </div>
                    <div>
                      <dt>Retention</dt>
                      <dd>
                        {health
                          ? `${health.retentionDays} days · up to 100 reports`
                          : "Unavailable until connected"}
                      </dd>
                    </div>
                    <div>
                      <dt>PDF limits</dt>
                      <dd>10 pages · 3 OCR pages</dd>
                    </div>
                    <div>
                      <dt>Max file / image</dt>
                      <dd>10 MB / 24 megapixels</dd>
                    </div>
                  </dl>
                  <div className="card-body">
                    <p className="muted">
                      Server configuration uses PORT, OCR_ENABLED, and
                      RETENTION_DAYS. Restart the backend after changing its
                      environment.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => void refresh()}
                    >
                      Check Connection
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
                <section className="capability-card">
                  <LockKeyhole size={23} />
                  <h3>Private by design</h3>
                  <p>
                    No third-party document services. Uploaded bytes are
                    discarded after processing. Extracted text, file names,
                    metadata, and notes are stored in the local database until
                    retention expiry.
                  </p>
                  <p>
                    Earlier prototype records remain separate and are excluded
                    from real analysis statistics.
                  </p>
                </section>
              </div>
            </div>
          )}
          <footer>
            <ShieldCheck size={15} />
            <span>
              VeriDoc provides document screening indicators for human review.
              Completed checks do not independently establish authenticity.
            </span>
            <span>LOCAL ENGINE · TRANSPARENT EVIDENCE</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        className="modal"
        ref={dialog}
        onCancel={() => setPrivacy(false)}
        onClose={() => setPrivacy(false)}
      >
        <LockKeyhole size={28} />
        <h2>Local processing. Clear retention.</h2>
        <p>
          Clicking Analyze sends your chosen document to the local Node.js
          backend. OCR runs with a bundled English model; no document is sent to
          a third-party service.
        </p>
        <p>
          Uploads remain in memory and are discarded after processing. Reports
          contain extracted text, file names, metadata, and notes, stored
          locally for {health?.retentionDays || 7} days, up to 100 reports.
          Expired records are purged when the database is accessed.
        </p>
        <p>
          This workspace has no user authentication. Keep it on localhost. Use
          fictional documents for demonstrations.
        </p>
        <button className="primary" onClick={() => setPrivacy(false)}>
          Understood
        </button>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
