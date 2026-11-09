import type { PrismaClient } from "@prisma/client";
import { normalisePhone, upsertAccount, recomputeScores } from "@/domain/accounts";
import { ownDomain } from "./website";
import { SOURCE_LABEL, type Found, type SearchInput, type SourceId, type Fetch } from "./types";
import { searchPlaces, placesQuery } from "./places";
import { searchApolloCompanies } from "./apollo";
import { searchOsm } from "./osm";
import { searchWikidata } from "./wikidata";
import { countryName } from "./markets";

export interface IngestResult { found: number; added: number; existing: number; candidates: number; accountIds: string[] }

/**
 * Companies with their own website become accounts (merged by domain, or by phone into an existing account).
 * The rest go to the review list, once per source record.
 */
export async function ingest(db: PrismaClient, orgId: string, found: Found[], opts: { ownerId?: string | null; query: string }): Promise<IngestResult> {
  const r: IngestResult = { found: found.length, added: 0, existing: 0, candidates: 0, accountIds: [] };
  for (const f of found) {
    const domain = ownDomain(f.website);
    const phone = normalisePhone(f.phone, f.country);
    let account = domain ? await db.account.findUnique({ where: { orgId_domain: { orgId, domain } } }) : null;
    if (!account && phone) account = await db.account.findFirst({ where: { orgId, phone } });
    if (!account && f.source === "google-places") account = await db.account.findFirst({ where: { orgId, placeId: f.externalId } });
    if (!account && f.source === "apollo") account = await db.account.findFirst({ where: { orgId, apolloId: f.externalId } });

    if (account) {
      r.existing++;
      await db.account.update({
        where: { id: account.id },
        data: {
          placeId: account.placeId ?? (f.source === "google-places" ? f.externalId : null),
          apolloId: account.apolloId ?? (f.source === "apollo" ? f.externalId : null),
          staffSize: account.staffSize ?? f.staffSize ?? null,
          city: account.city ?? f.city ?? null,
          country: account.country ?? (f.country && f.country !== "IN" ? f.country : null),
        },
      });
      await db.leadCandidate.updateMany({ where: { orgId, source: f.source, externalId: f.externalId, status: "NEW" }, data: { status: "ADDED", accountId: account.id } });
      continue;
    }
    if (domain) {
      const { account: a } = await upsertAccount(db, orgId, {
        domain, name: f.name, city: f.city, country: f.country, industry: f.industry, staffSize: f.staffSize, phone: f.phone, ownerId: opts.ownerId,
        source: f.source, sourceNote: `${SOURCE_LABEL[f.source]}: ${opts.query}`,
      });
      await db.account.update({
        where: { id: a.id },
        data: { placeId: f.source === "google-places" ? f.externalId : null, apolloId: f.source === "apollo" ? f.externalId : null },
      });
      await recomputeScores(db, a.id);
      r.added++;
      r.accountIds.push(a.id);
      continue;
    }
    const existed = await db.leadCandidate.findUnique({ where: { orgId_source_externalId: { orgId, source: f.source, externalId: f.externalId } } });
    if (existed) { r.existing++; continue; }
    await db.leadCandidate.create({
      data: {
        orgId, source: f.source, externalId: f.externalId, name: f.name, city: f.city ?? null, country: f.country && f.country !== "IN" ? f.country : null, address: f.address ?? null,
        phone: f.phone ?? null, website: f.website ?? null, industry: f.industry ?? null, staffSize: f.staffSize ?? null,
        note: `${SOURCE_LABEL[f.source]}: ${opts.query}`,
      },
    });
    r.candidates++;
  }
  return r;
}

export function describe(source: SourceId, i: SearchInput): string {
  if (source === "google-places") return placesQuery(i);
  const parts = [i.keywords?.trim() || i.industry, i.country && i.country !== "IN" ? `${i.city}, ${countryName(i.country)}` : i.city];
  if (source === "apollo" && i.staffRange) parts.push(`${i.staffRange.replace(",", "-")} staff`);
  return parts.join(" · ");
}

export function sourceReady(source: SourceId): string | null {
  if (source === "google-places" && !process.env.GOOGLE_PLACES_API_KEY) return "Google Places is not connected yet. The Founder will add the key; until then, use OpenStreetMap, Wikidata or a CSV import.";
  if (source === "apollo" && !process.env.APOLLO_API_KEY) return "Apollo is not connected yet. The Founder will add the key; until then, use the free sources and enter company details by hand.";
  return null;
}

export async function runSource(source: SourceId, i: SearchInput, f: Fetch = fetch): Promise<Found[]> {
  const missing = sourceReady(source);
  if (missing) throw new Error(missing);
  try {
    switch (source) {
      case "google-places": return await searchPlaces(i, process.env.GOOGLE_PLACES_API_KEY!, f);
      case "apollo": return await searchApolloCompanies(i, process.env.APOLLO_API_KEY!, f);
      case "osm": return await searchOsm(i, f);
      case "wikidata": return await searchWikidata(i, f);
    }
  } catch (e) {
    // Network failures ("fetch failed") don't say where; name the source.
    const msg = (e as Error).message;
    throw new Error(msg.startsWith(SOURCE_LABEL[source]) || msg.startsWith("Google Places") ? msg : `${SOURCE_LABEL[source]}: ${msg === "fetch failed" ? "could not be reached, try again later" : msg}`);
  }
}

/** Run one search, store what it found, and log the run. Errors are logged on the run, not thrown. */
export async function runDiscovery(
  db: PrismaClient, orgId: string, source: SourceId, i: SearchInput,
  opts: { userId?: string | null; savedSearchId?: string | null; fetchImpl?: Fetch },
) {
  const query = describe(source, i);
  try {
    const found = await runSource(source, i, opts.fetchImpl ?? fetch);
    // Found companies start unassigned; the Sales Lead assigns them to a team.
    const r = await ingest(db, orgId, found, { ownerId: null, query });
    const run = await db.discoveryRun.create({
      data: { orgId, source, query, found: r.found, added: r.added, existing: r.existing, candidates: r.candidates, savedSearchId: opts.savedSearchId ?? null, createdById: opts.userId ?? null },
    });
    return { run, result: r };
  } catch (e) {
    const run = await db.discoveryRun.create({
      data: { orgId, source, query, error: (e as Error).message.slice(0, 500), savedSearchId: opts.savedSearchId ?? null, createdById: opts.userId ?? null },
    });
    return { run, result: null };
  }
}
