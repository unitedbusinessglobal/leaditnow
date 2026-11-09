import type { PrismaClient, Account } from "@prisma/client";
import type { ApolloOrgDetails } from "@/discovery/apollo";
import type { Fetch } from "@/discovery/types";
import { readSettings } from "./estimate";
import { normalisePhone } from "./accounts";
import { readyProviders, blankFacts, PROVIDER_LABEL, type CompanyFacts, type ProviderId } from "@/enrich/providers";

export const APOLLO_MISSING =
  "Apollo is not connected yet. Apollo's API needs its Organization plan; on cheaper plans, export your Apollo search as CSV and use Import CSV.";

export const ENRICH_MISSING =
  "No company-data source is connected yet, so revenue, staff and listing details can't be fetched automatically. Use “Enter or correct by hand” below meanwhile; the Founder can connect People Data Labs or Hunter on their free plans under Data sources.";

export const EMAILS_MISSING = "No email source is connected yet. Hunter or Snov.io can be connected on their free plans under Data sources.";

export function apolloReady(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}
export const enrichReady = () => readyProviders().some((p) => p.company);
export const emailsReady = () => readyProviders().some((p) => p.emails);

/** Fill the gaps in `into` from `from`. */
export function mergeFacts(into: CompanyFacts, from: CompanyFacts): CompanyFacts {
  const out = { ...into };
  for (const k of Object.keys(from) as (keyof CompanyFacts)[]) {
    if (k === "technologies") { if (!out.technologies.length) out.technologies = from.technologies; continue; }
    if (out[k] == null && from[k] != null) (out as Record<string, unknown>)[k] = from[k];
  }
  return out;
}
const complete = (f: CompanyFacts) => f.employees != null && f.revenueUsd != null && f.industry != null;

/** Write company facts onto the account. Values typed in by hand are never overwritten. */
export async function applyFacts(db: PrismaClient, account: Account, d: CompanyFacts, source: ProviderId | string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: account.orgId } });
  const s = readSettings(org.settings);
  const manualRevenue = account.revenueSource === "manual";
  const revenueInr = d.revenueUsd ? Math.round(d.revenueUsd * s.usdInr) : null;
  return db.account.update({
    where: { id: account.id },
    data: {
      apolloId: account.apolloId ?? (source === "apollo" ? d.externalId : null),
      staffSize: account.staffSize ?? d.employees,
      revenueInr: manualRevenue || !revenueInr ? account.revenueInr : revenueInr,
      revenueSource: manualRevenue ? "manual" : revenueInr ? (d.revenueText ? `${source}|${d.revenueText}` : source) : account.revenueSource,
      listed: account.listed ?? d.listed ?? (d.symbol ? true : null),
      stockSymbol: account.stockSymbol ?? d.symbol,
      stockExchange: account.stockExchange ?? d.exchange,
      foundedYear: account.foundedYear ?? d.foundedYear,
      technologies: d.technologies.length ? d.technologies : account.technologies,
      industry: account.industry ?? d.industry,
      city: account.city ?? d.city,
      phone: account.phone ?? normalisePhone(d.phone),
      enrichedAt: new Date(),
    },
  });
}

/** Kept for existing callers and tests: Apollo's details in the shared shape. */
export function applyApollo(db: PrismaClient, account: Account, d: ApolloOrgDetails) {
  return applyFacts(db, account, {
    ...blankFacts(), employees: d.employees, revenueUsd: d.annualRevenueUsd, industry: d.industry, foundedYear: d.foundedYear,
    phone: d.phone, symbol: d.symbol, exchange: d.exchange, technologies: d.technologies, externalId: d.id,
  }, "apollo");
}

/** How the revenue figure is described on the account: "People Data Labs estimate, $1M-$10M range". */
export function revenueSourceLabel(src: string | null): string | null {
  if (!src) return null;
  if (src === "manual") return "entered";
  const [id, range] = src.split("|");
  const label = PROVIDER_LABEL[id as ProviderId] ?? id;
  return range ? `${label} estimate, ${range} range` : `${label} estimate`;
}

export interface EnrichResult { status: "done" | "not-found" | "not-connected"; used: string[]; errors: string[] }

/**
 * Enrich one account from the connected providers, free ones first, stopping once staff, revenue and industry are known.
 * A provider that fails (no credits, no API on its plan) is skipped and reported.
 */
export async function enrichAccount(db: PrismaClient, account: Account, f: Fetch = fetch): Promise<EnrichResult> {
  const providers = readyProviders().filter((p) => p.company);
  if (providers.length === 0) return { status: "not-connected", used: [], errors: [] };
  let facts = blankFacts();
  const used: string[] = [];
  const errors: string[] = [];
  let firstSource: ProviderId | null = null;
  let revenueSource: ProviderId | null = null;
  for (const p of providers) {
    try {
      const r = await p.company!(account.domain, f);
      if (!r) continue;
      if (facts.revenueUsd == null && r.revenueUsd != null) revenueSource = p.id;
      facts = mergeFacts(facts, r);
      used.push(p.label);
      firstSource ??= p.id;
      if (complete(facts)) break;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (used.length === 0) {
    if (errors.length === providers.length) throw new Error(errors.join("; "));
    await db.account.update({ where: { id: account.id }, data: { enrichedAt: new Date() } });
    return { status: "not-found", used, errors };
  }
  await applyFacts(db, account, facts, revenueSource ?? firstSource!);
  return { status: "done", used, errors };
}

/** Find emails on the company's domain from the connected email providers and keep them as contact details. */
export async function findEmails(db: PrismaClient, account: Account, f: Fetch = fetch): Promise<{ added: number; found: number; used: string[]; errors: string[] }> {
  const providers = readyProviders().filter((p) => p.emails);
  let added = 0, found = 0;
  const used: string[] = [];
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const list = await p.emails!(account.domain, f);
      used.push(p.label);
      for (const e of list) {
        found++;
        const exists = await db.contactPoint.findUnique({ where: { accountId_kind_value: { accountId: account.id, kind: "email", value: e.email } } });
        if (exists) {
          if (!exists.name && e.name) await db.contactPoint.update({ where: { id: exists.id }, data: { name: e.name, title: e.title } });
          continue;
        }
        await db.contactPoint.create({
          data: {
            orgId: account.orgId, accountId: account.id, kind: "email", value: e.email, sourceUrl: p.label, source: p.id,
            name: e.name, title: e.title, confidence: e.confidence,
          },
        });
        added++;
        const phone = normalisePhone(e.phone);
        if (phone) {
          await db.contactPoint.upsert({
            where: { accountId_kind_value: { accountId: account.id, kind: "phone", value: phone } },
            create: { orgId: account.orgId, accountId: account.id, kind: "phone", value: phone, sourceUrl: p.label, source: p.id, name: e.name, title: e.title },
            update: {},
          });
        }
      }
      if (found >= 10) break; // enough to work with; save the other providers' credits
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { added, found, used, errors };
}
