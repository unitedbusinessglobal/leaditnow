"use client";

import { useState } from "react";
import type { ScanResult } from "@/signals/scan";

const labelColor: Record<string, string> = {
  High: "#1F7A4D",
  Medium: "#3B4FD6",
  Low: "#8A5A00",
  None: "#6B6F88",
};

export default function Home() {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const need = result?.signals.filter((s) => s.category === "NEED") ?? [];

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 4 }}>LeadItNow</h1>
      <p style={{ color: "#4A4F6A", marginTop: 0 }}>
        See whether a business is likely to need software or IT services, using only its public DNS records and web
        pages.
      </p>

      <form onSubmit={scan} style={{ display: "flex", gap: 8, margin: "24px 0", flexWrap: "wrap" }}>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="company domain, e.g. acme.co.in"
          aria-label="Company domain"
          required
          style={{ flex: 1, minWidth: 240, padding: "10px 12px", fontSize: 16, border: "1px solid #C9CCDE", borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "10px 18px", fontSize: 16, background: "#3B4FD6", color: "#fff", border: 0, borderRadius: 8 }}
        >
          {busy ? "Scanning… (up to a minute)" : "Scan for need signals"}
        </button>
      </form>

      {error && <p style={{ color: "#B42318" }}>{error}</p>}

      {result && (
        <section style={{ background: "#fff", border: "1px solid #E1E3EF", borderRadius: 12, padding: 24 }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>
            {result.domain}:{" "}
            <span style={{ color: labelColor[result.need.label] }}>
              {result.need.label} need ({result.need.score}/100)
            </span>
          </h2>
          <p style={{ color: "#4A4F6A", margin: "4px 0" }}>
            Lead with: {result.need.serviceHints.length ? result.need.serviceHints.join(", ") : "general introduction"}
            {result.need.strongIntent && " · strong intent (referral or hiring)"}
          </p>
          <p style={{ color: "#4A4F6A", margin: "4px 0 16px" }}>
            Current stack (internal context, never mention in outreach):{" "}
            {result.need.stack.length ? result.need.stack.join(", ") : "not detected"}
          </p>
          {need.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E1E3EF" }}>
                  <th style={{ padding: 6 }}>Need signal</th>
                  <th style={{ padding: 6 }}>Weight</th>
                  <th style={{ padding: 6 }}>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {need.map((s) => (
                  <tr key={s.ruleId} style={{ borderBottom: "1px solid #F0F1F7" }}>
                    <td style={{ padding: 6 }}>{s.label}</td>
                    <td style={{ padding: 6 }}>{s.weight}</td>
                    <td style={{ padding: 6, wordBreak: "break-all", color: "#4A4F6A" }}>{s.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ color: "#6B6F88", fontSize: 13 }}>
            {result.pagesScanned.length} page(s) checked · MX: {result.mx?.length ? result.mx.join(", ") : "none found"} · {new Date(result.scannedAt).toLocaleString()}
          </p>
        </section>
      )}
    </main>
  );
}
