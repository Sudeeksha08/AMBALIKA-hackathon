import { finalizeReport } from "./assessment.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export class ReportStore {
  constructor(file, retentionDays = 7) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.retentionDays = retentionDays;
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL)",
    );
    this.purge();
    this.redactStoredIdentifiers();
  }
  redactStoredIdentifiers() {
    // Privacy upgrade: retain records while removing full numeric identifiers from legacy JSON.
    const rows = this.db.prepare("SELECT id, body FROM reports").all();
    const update = this.db.prepare("UPDATE reports SET body=? WHERE id=?");
    this.db.exec("BEGIN");
    try {
      for (const row of rows) {
        const safe = JSON.stringify(finalizeReport(JSON.parse(row.body)));
        if (safe !== row.body) update.run(safe, row.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (error instanceof SyntaxError) throw new Error("Stored report JSON is invalid. Privacy upgrade rolled back; no records were removed.");
      throw error;
    }
  }
  purge() {
    this.db
      .prepare("DELETE FROM reports WHERE created_at < ?")
      .run(new Date(Date.now() - this.retentionDays * 86400000).toISOString());
  }
  all() {
    this.purge();
    return this.db
      .prepare("SELECT body FROM reports ORDER BY created_at DESC")
      .all()
      .map((row) => finalizeReport(JSON.parse(row.body)));
  }
  get(id) {
    this.purge();
    const row = this.db.prepare("SELECT body FROM reports WHERE id=?").get(id);
    return row ? finalizeReport(JSON.parse(row.body)) : null;
  }
  put(report) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO reports (id,created_at,body) VALUES (?,?,?)",
      )
      .run(report.id, report.createdAt, JSON.stringify(finalizeReport(report)));
    this.db.exec(
      "DELETE FROM reports WHERE id NOT IN (SELECT id FROM reports ORDER BY created_at DESC LIMIT 100)",
    );
  }
  close() {
    this.db.close();
  }
}
