import type { PrismaClient } from "@prisma/client";

/**
 * Licence-fee split on India-originated Net Revenue, from the intercompany agreement:
 * US 60% (cl. 6.1A components: brand/IP royalty 20, platform 25, services 15) and India 40%,
 * of which 15% is reserved for India office development.
 * Net Revenue here = amounts collected in the month, excluding GST.
 */
export const SPLIT = { usPct: 60, royaltyPct: 20, platformPct: 25, servicesPct: 15, indiaPct: 40, devReserveOfIndiaPct: 15 };

export interface StatementLine {
  dealId: string;
  account: string;
  deal: string;
  invoices: string[];
  invoicedInr: number;
  collectedInr: number;
}

export interface Statement {
  month: string; // YYYY-MM
  lines: StatementLine[];
  invoicedInr: number;
  netRevenueInr: number;
  usFeeInr: number;
  royaltyInr: number;
  platformInr: number;
  servicesInr: number;
  indiaShareInr: number;
  devReserveInr: number;
  indiaNetInr: number;
}

export function monthRange(month: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  // Indian business months: midnight IST (UTC+5:30).
  const start = new Date(Date.UTC(y, m - 1, 1) - 330 * 60_000);
  const end = new Date(Date.UTC(y, m, 1) - 330 * 60_000);
  return { start, end };
}

const pct = (v: number, p: number) => Math.round((v * p) / 100);

export function splitNet(net: number) {
  const royaltyInr = pct(net, SPLIT.royaltyPct);
  const platformInr = pct(net, SPLIT.platformPct);
  const servicesInr = pct(net, SPLIT.servicesPct);
  const usFeeInr = royaltyInr + platformInr + servicesInr;
  const indiaShareInr = net - usFeeInr;
  const devReserveInr = pct(indiaShareInr, SPLIT.devReserveOfIndiaPct);
  return { usFeeInr, royaltyInr, platformInr, servicesInr, indiaShareInr, devReserveInr, indiaNetInr: indiaShareInr - devReserveInr };
}

export async function statement(db: PrismaClient, orgId: string, month: string): Promise<Statement> {
  const { start, end } = monthRange(month);
  const invoices = await db.invoice.findMany({
    where: {
      orgId,
      deal: { indiaOriginated: true },
      OR: [{ issuedAt: { gte: start, lt: end } }, { collectedAt: { gte: start, lt: end } }],
    },
    include: { deal: { include: { account: { select: { name: true } } } } },
    orderBy: { issuedAt: "asc" },
  });
  const byDeal = new Map<string, StatementLine>();
  for (const inv of invoices) {
    const line = byDeal.get(inv.dealId) ?? {
      dealId: inv.dealId, account: inv.deal.account.name, deal: inv.deal.title, invoices: [], invoicedInr: 0, collectedInr: 0,
    };
    line.invoices.push(inv.number);
    if (inv.issuedAt >= start && inv.issuedAt < end) line.invoicedInr += inv.amountInr;
    if (inv.collectedAt && inv.collectedAt >= start && inv.collectedAt < end) line.collectedInr += inv.collectedInr;
    byDeal.set(inv.dealId, line);
  }
  const lines = [...byDeal.values()];
  const netRevenueInr = lines.reduce((s, l) => s + l.collectedInr, 0);
  return {
    month,
    lines,
    invoicedInr: lines.reduce((s, l) => s + l.invoicedInr, 0),
    netRevenueInr,
    ...splitNet(netRevenueInr),
  };
}

export function toCsv(s: Statement): string {
  const rows = [
    ["Month", s.month],
    [],
    ["Account", "Deal", "Invoices", "Invoiced (INR, excl. GST)", "Collected (INR, excl. GST)"],
    ...s.lines.map((l) => [l.account, l.deal, l.invoices.join(" "), String(l.invoicedInr), String(l.collectedInr)]),
    [],
    ["Net Revenue (collected)", String(s.netRevenueInr)],
    [`US licence fee ${SPLIT.usPct}%`, String(s.usFeeInr)],
    [`  Brand/IP royalty ${SPLIT.royaltyPct}%`, String(s.royaltyInr)],
    [`  Platform ${SPLIT.platformPct}%`, String(s.platformInr)],
    [`  Services ${SPLIT.servicesPct}%`, String(s.servicesInr)],
    [`India share ${SPLIT.indiaPct}%`, String(s.indiaShareInr)],
    [`  Development reserve ${SPLIT.devReserveOfIndiaPct}% of India share`, String(s.devReserveInr)],
    ["  India net", String(s.indiaNetInr)],
    [],
    ["Before withholding tax and GST under reverse charge; the CA computes those."],
  ];
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
}
