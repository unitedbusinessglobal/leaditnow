const TZ = "Asia/Kolkata";

export function inr(n: number | null | undefined): string {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

export function day(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

export function when(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/** "YYYY-MM-DD" from a date input, as 09:00 IST that day. */
export function fromDateInput(v: FormDataEntryValue | null): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T09:00:00+05:30`);
}

export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Start and end of today in IST. */
export function todayIst(now = new Date()): { start: Date; end: Date } {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

export function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[,₹\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}
