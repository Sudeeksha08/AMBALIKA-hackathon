import {
  AlertTriangle,
  Info,
  ShieldCheck,
  Download,
  Copy,
  ArrowRight,
  Printer,
  LayoutDashboard,
} from "lucide-react";
import { Badge, formatDate } from "./components";
import {
  categoryLabels,
  fieldLabels,
  exportReport,
  type AnalysisReport,
} from "./screening";
import { checkOutcome, printableReport } from "./report-presentation";
export function ReportView({
  report,
  notes,
  setNotes,
  onSave,
  saving,
  onReset,
  notify,
  onDashboard,
}: {
  report: AnalysisReport;
  notes: string;
  setNotes: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  onReset: () => void;
  notify: (v: string) => void;
  onDashboard?: () => void;
}) {
  function download(json = false) {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(
        new Blob([json ? exportReport(report) : printableReport(report)], {
          type: json ? "application/json" : "text/html;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.id}.${json ? "json" : "html"}`;
      document.body.append(link);
      link.click();
      link.remove();
      notify(
        json
          ? "JSON data export requested."
          : "Formatted HTML report download requested. Open it in a browser to read or print.",
      );
    } catch {
      notify(
        "Download could not start. Check browser permissions and try again.",
      );
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 1000);
    }
  }
  const risk = report.risk;
  const keys = [
    ...new Set([
      ...(report.rules.required || []),
      ...Object.keys(report.fields).filter((key) => report.fields[key]),
    ]),
  ];
  return (
    <div className="results" id="report">
      <div className="section-heading">
        <div>
          <div className="eyebrow">EVIDENCE FOR HUMAN REVIEW</div>
          <h2>Document screening report</h2>
        </div>
        <Badge>{report.status}</Badge>
      </div>
      <section className="card report-summary">
        <div className="report-icon">
          <ShieldCheck size={28} />
        </div>
        <div className="summary-content">
          <h2>Analysis Summary</h2>
          <p>{report.summary}</p>
          <div className="report-meta">
            <span>{report.id}</span>
            <span>{formatDate(report.createdAt)}</span>
            <span>{categoryLabels[report.category]}</span>
            <Badge>{report.processingStatus}</Badge>
            {report.processingTimeMs !== undefined && (
              <span>{(report.processingTimeMs / 1000).toFixed(2)} seconds</span>
            )}
          </div>
          <p className="file-name">{report.fileName}</p>
        </div>
        <div
          className={`risk-score ${risk?.level?.toLowerCase() || "inconclusive"}`}
        >
          <strong>
            {risk?.score !== null && risk?.score !== undefined ? (
              <>
                {risk.score}
                <small>/100</small>
              </>
            ) : (
              "—"
            )}
          </strong>
          <span>{risk?.level || "Not scored"}</span>
          <small>Screening indicators</small>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Document Information</h2>
            <p>Extracted, not verified · sensitive identifiers masked</p>
          </div>
          {report.confidence !== null && (
            <Badge>OCR confidence {report.confidence}/100</Badge>
          )}
        </div>
        <div className="fields">
          {keys.length ? (
            keys.map((key) => (
              <div key={key}>
                <label>{fieldLabels[key] || key}</label>
                <strong>{report.fields[key] || "Not detected"}</strong>
                <small>Machine extracted · compare with the source</small>
              </div>
            ))
          ) : (
            <p className="muted">
              Not detected. Review extraction coverage below.
            </p>
          )}
        </div>
        <details className="print-hide">
          <summary>Extraction evidence</summary>
          {report.category === "aadhaar" ? (
            <p className="muted">
              Raw Aadhaar text is not retained. Only structured, masked fields
              are available.
            </p>
          ) : (
            <pre>
              {report.text || "No readable extracted text is available."}
            </pre>
          )}
        </details>
        <details>
          <summary>Document properties & applied rules</summary>
          <dl className="properties">
            {Object.entries(report.metadata).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                <dd>{String(value ?? "Not supplied")}</dd>
              </div>
            ))}
            <div>
              <dt>Minimum readable characters</dt>
              <dd>{report.rules.minTextChars}</dd>
            </div>
            <div>
              <dt>Minimum image width</dt>
              <dd>{report.rules.minImageWidth} px</dd>
            </div>
            <div>
              <dt>Minimum grayscale contrast</dt>
              <dd>{report.rules.minContrast}</dd>
            </div>
            <div>
              <dt>Expected fields</dt>
              <dd>
                {report.rules.required
                  ?.map((key) => fieldLabels[key] || key)
                  .join(", ") || "None configured"}
              </dd>
            </div>
          </dl>
        </details>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>
              Detailed Findings{" "}
              <span className="count">{report.issues.length}</span>
            </h2>
            <p>Indicators for investigation, not confirmed fraud</p>
          </div>
        </div>
        <div className="card-body">
          {report.issues.length ? (
            report.issues.map((issue, index) => (
              <article className="issue" key={issue.id || index}>
                <AlertTriangle size={18} />
                <div>
                  <div className="issue-title">
                    <h3>{issue.title}</h3>
                    <Badge>
                      {issue.severity} · {issue.status || "Review recommended"}
                    </Badge>
                  </div>
                  <p>
                    <strong>Related field:</strong>{" "}
                    {fieldLabels[issue.field] || issue.field}
                  </p>
                  <p>
                    <strong>Evidence:</strong> {issue.evidence}
                  </p>
                  <p>
                    <strong>Why it matters:</strong>{" "}
                    {issue.explanation ||
                      "The reviewer should compare the extracted information with the source. OCR and template differences may explain this finding."}
                  </p>
                  <p>
                    <strong>Recommended action:</strong> {issue.action}
                  </p>
                  {issue.points !== undefined && (
                    <p>
                      <strong>Rule weight:</strong> {issue.points} points before
                      deduplication/cap. See the risk assessment for points
                      counted.
                    </p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="inline-note">
              <Info size={18} />
              <p>
                {report.processingStatus === "Partial"
                  ? "No specific indicators were reported, but important checks could not complete."
                  : "No suspicious indicators were reported by the configured completed checks."}{" "}
                This does not establish authenticity.
              </p>
            </div>
          )}
        </div>
      </section>
      <div className="section-heading">
        <h2>Verification Checks</h2>
        <small>Passed means the technical check only</small>
      </div>
      <div className="checks-grid">
        {report.checks.map((check, index) => (
          <section key={`${check.name}-${index}`} className="card check-card">
            <div>
              <Badge>{checkOutcome(check.status)}</Badge>
            </div>
            <h3>{check.name}</h3>
            <p>{check.detail}</p>
          </section>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Risk Assessment</h2>
            <p>Explainable screening rules · not a fraud probability</p>
          </div>
          <Badge>
            {risk?.score === null
              ? "Inconclusive"
              : risk?.level || "Not scored"}
          </Badge>
        </div>
        <div className="card-body">
          <p className="muted">
            {risk?.methodology ||
              "This earlier report has no documented score. A score is not generated retrospectively from incomplete historical data."}
          </p>
          {(!risk || risk.score === null) && (
            <div className="connection-note">
              <Info size={17} />
              <span>
                Manual review required. No numerical score is shown when
                evidence or coverage is insufficient.
              </span>
            </div>
          )}
          {risk && (
            <>
              <div className="risk-contributions">
                {risk.contributions.length ? (
                  risk.contributions.map((contribution, index) => (
                    <div key={index}>
                      <span>
                        <strong>{contribution.title}</strong>
                        <small>{contribution.reason}</small>
                      </span>
                      <b>+{contribution.points}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    No findings contributed points. A low score does not
                    establish authenticity.
                  </p>
                )}
              </div>
              <details>
                <summary>Scoring methodology · {risk.version}</summary>
                <dl className="properties">
                  {risk.rules.map((rule) => (
                    <div key={rule.code}>
                      <dt>
                        {rule.code.replaceAll("_", " ")}
                        <small>{rule.explanation}</small>
                      </dt>
                      <dd>{rule.points} points</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Limitations & Disclaimer</h2>
            <p>Automated screening cannot conclusively prove authenticity</p>
          </div>
        </div>
        <ul className="limitations">
          {report.limitations.map((limitation, index) => (
            <li key={index}>{limitation}</li>
          ))}
          <li>
            No official database, issuer confirmation, or biometric verification
            is implied. A low indicator score is not proof of a genuine
            document.
          </li>
        </ul>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Reviewer notes</h2>
            <p>
              Saved with this report locally. Do not enter full Aadhaar numbers.
            </p>
          </div>
        </div>
        <div className="card-body">
          <label htmlFor="reviewer-notes" className="sr-only">
            Reviewer notes
          </label>
          <textarea
            id="reviewer-notes"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Record observations, verification steps, or reasons for further review..."
          />
          <p className="print-notes">{report.notes || "No saved notes."}</p>
          <div className="notes-footer">
            <small>
              {notes.length}/2,000{" "}
              {notes !== report.notes ? "· Unsaved changes" : ""}
            </small>
            <div>
              <button
                className="text-button"
                disabled={saving}
                onClick={() => setNotes("")}
              >
                Clear Notes
              </button>
              <button
                className="secondary"
                disabled={saving || notes === report.notes}
                onClick={onSave}
              >
                {saving
                  ? "Saving…"
                  : notes.trim()
                    ? "Save Notes"
                    : "Save Cleared Notes"}
              </button>
            </div>
          </div>
          <div className="report-actions">
            <button className="primary" onClick={() => download()}>
              <Download size={16} />
              Download Report
            </button>
            <button className="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Print / Save PDF
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${report.id} | ${report.status}\n${report.summary}`,
                  );
                  notify("Case summary copied.");
                } catch {
                  notify(
                    "Clipboard unavailable. Use the formatted report download.",
                  );
                }
              }}
            >
              <Copy size={16} />
              Copy Summary
            </button>
            <button className="text-button" onClick={onReset}>
              Run Another Analysis
              <ArrowRight size={15} />
            </button>
            {onDashboard && (
              <button className="text-button" onClick={onDashboard}>
                <LayoutDashboard size={15} />
                Dashboard
              </button>
            )}
            <button className="text-button" onClick={() => download(true)}>
              Export Data (JSON)
            </button>
          </div>
          <small className="print-hide">
            Download Report creates a formatted HTML document. JSON is a
            separate data export. Save reviewer notes before printing or
            downloading.
          </small>
        </div>
      </section>
    </div>
  );
}
