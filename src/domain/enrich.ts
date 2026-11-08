import type { PrismaClient, Account } from "@prisma/client";
import { enrichApolloOrg, type ApolloOrgDetails } from "@/discovery/apollo";
import type { Fetch } from "@/discovery/types";
import { readSettings } from "./estimate";
import { normalisePhone } from "./accounts";

export const APOLLO_MISSING =
  "Apollo is not connected yet, so revenue, staff and listing details can't be fetched automatically. Use “Enter or correct by hand” below meanwhile; the Founder will add the Apollo key later.";

export function apolloReady(): boolean {
  return Boolean(process.env.APOLLO_API_KEY);
}

/** Write Apollo's company details onto the account. Values typed in by hand are never overwritten. */
export async function applyApollo(db: PrismaClient, account: Account, d: ApolloOrgDetails) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: account.orgId } });
  const s = readSettings(org.settings);
  const manualRevenue = account.revenueSource === "manual";
  return db.account.update({
    where: { id: account.id },
    data: {
      apolloId: account.apolloId ?? d.id,
      staffSize: account.staffSize ?? d.employees,
      revenueInr: manualRevenue ? account.revenueInr : d.annualRevenueUsd ? Math.round(d.annualRevenueUsd * s.usdInr) : account.revenueInr,
      revenueSource: manualRevenue ? "manual" : d.annualRevenueUsd ? "apollo" : account.revenueSource,
      listed: account.listed ?? (d.symbol ? true : null),
      stockSymbol: account.stockSymbol ?? d.symbol,
      stockExchange: account.stockExchange ?? d.exchange,
      foundedYear: account.foundedYear ?? d.foundedYear,
      technologies: d.technologies.length ? d.technologies : account.technologies,
      industry: account.industry ?? d.industry,
      phone: account.phone ?? normalisePhone(d.phone),
      enrichedAt: new Date(),
    },
  });
}

/** Enrich one account from Apollo. Returns a short status for the UI. */
export async function enrichAccount(db: PrismaClient, account: Account, f: Fetch = fetch): Promise<"done" | "not-found" | "not-connected"> {
  if (!apolloReady()) return "not-connected";
  const d = await enrichApolloOrg(account.domain, process.env.APOLLO_API_KEY!, f);
  if (!d) {
    await db.account.update({ where: { id: account.id }, data: { enrichedAt: new Date() } });
    return "not-found";
  }
  await applyApollo(db, account, d);
  return "done";
}
