"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { parseCsv, guessMapping, type Field, type ImportResult } from "@/domain/csv-parse";
import { runImport } from "../actions";

const FIELDS: { id: Field; label: string }[] = [
  { id: "domain", label: "Website / domain" },
  { id: "name", label: "Company name" },
  { id: "city", label: "City" },
  { id: "industry", label: "Industry" },
  { id: "staffSize", label: "Staff size" },
  { id: "phone", label: "Company phone" },
  { id: "contactName", label: "Contact name" },
  { id: "contactTitle", label: "Contact title" },
  { id: "contactEmail", label: "Contact email" },
  { id: "contactPhone", label: "Contact phone" },
  { id: "externalId", label: "Company ID (CIN)" },
  { id: "status", label: "Company status" },
];

export function Importer() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<Field, number>>>({});
  const [scanNow, setScanNow] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    setResult(null); setError(null);
    if (!f) return;
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) { setError("The file needs a header row and at least one data row."); return; }
    setFileName(f.name);
    setRows(parsed);
    setMapping(guessMapping(parsed[0]));
  }

  const headers = rows[0] ?? [];
  const mapped = FIELDS.filter((f) => mapping[f.id] != null);
  const ready = mapping.domain != null || mapping.contactEmail != null || mapping.name != null;

  return (
    <div className="stack">
      <div className="card form">
        <label>CSV file (Apollo or HubSpot export, or your own sheet saved as CSV)
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {error && <p className="notice error">{error}</p>}
      </div>

      {rows.length > 1 && !result && (
        <div className="card stack">
          <h2>Match the columns · {rows.length - 1} rows in {fileName}</h2>
          <div className="grid3">
            {FIELDS.map((f) => (
              <label key={f.id}>{f.label}
                <select
                  value={mapping[f.id] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.id]: e.target.value === "" ? undefined : Number(e.target.value) })}
                >
                  <option value="">— not in file —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>{mapped.map((f) => <th key={f.id}>{f.label}</th>)}</tr></thead>
              <tbody>
                {rows.slice(1, 6).map((r, i) => <tr key={i}>{mapped.map((f) => <td key={f.id}>{r[mapping[f.id]!]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ margin: 0 }}>
            Rows merge into existing companies with the same domain, or the same phone number. Existing details are never overwritten; only gaps are filled.
            Companies with no website go to the review list; companies whose status is not active (for example in a company register file) are skipped.
            The file name is stored as each record&apos;s source.
          </p>
          <label className="inline"><input type="checkbox" checked={scanNow} onChange={(e) => setScanNow(e.target.checked)} /> Scan the first 5 new companies now (the daily job scans the rest)</label>
          {!ready && <p className="notice error">Map the website, a contact email, or at least the company name.</p>}
          <div>
            <button
              className="btn btn-primary"
              disabled={!ready || pending}
              onClick={() => start(async () => {
                try { setResult(await runImport({ rows, mapping, fileName, scanNow })); }
                catch (e) { setError((e as Error).message); }
              })}
            >
              {pending ? "Importing…" : `Import ${rows.length - 1} rows`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="card stack">
          <h2>Import finished</h2>
          <div className="grid4">
            <div><div className="kpi">{result.created}</div><div className="faint">new companies</div></div>
            <div><div className="kpi">{result.candidates}</div><div className="faint">to review (no website)</div></div>
            <div><div className="kpi">{result.merged}</div><div className="faint">merged into existing</div></div>
            <div><div className="kpi">{result.contactsAdded}</div><div className="faint">contacts added</div></div>
            <div><div className="kpi">{result.skipped.length}</div><div className="faint">rows skipped</div></div>
          </div>
          {result.skipped.length > 0 && (
            <table>
              <thead><tr><th>Line</th><th>Why skipped</th></tr></thead>
              <tbody>{result.skipped.slice(0, 50).map((s) => <tr key={s.line}><td>{s.line}</td><td>{s.reason}</td></tr>)}</tbody>
            </table>
          )}
          <div className="row">
            <Link className="btn btn-primary" href="/accounts?sort=newest">See accounts</Link>
            {result.candidates > 0 && <Link className="btn" href="/leads/review">Open the review list</Link>}
            <button className="btn" onClick={() => { setRows([]); setResult(null); setFileName(""); }}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
