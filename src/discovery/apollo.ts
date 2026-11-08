import type { Fetch, Found, SearchInput } from "./types";

const BASE = "https://api.apollo.io/api/v1";

async function call<T>(path: string, body: unknown, apiKey: string, f: Fetch): Promise<T> {
  const res = await f(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cache-control": "no-cache", "x-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(`Apollo: ${json.error ?? json.message ?? res.status}`);
  return json;
}

interface ApolloOrg {
  id: string;
  name?: string;
  website_url?: string | null;
  primary_domain?: string | null;
  phone?: string | null;
  primary_phone?: { number?: string } | null;
  estimated_num_employees?: number | null;
  industry?: string | null;
  city?: string | null;
  raw_address?: string | null;
}

/** Company search (no credits): companies in the city matching the industry keywords and staff range. */
export async function searchApolloCompanies(i: SearchInput, apiKey: string, f: Fetch = fetch): Promise<Found[]> {
  const out: Found[] = [];
  const limit = Math.min(i.limit ?? 100, 200);
  const keywords = (i.keywords?.trim() || i.industry).split(",").map((k) => k.trim()).filter(Boolean);
  for (let page = 1; out.length < limit && page <= 2; page++) {
    const body = await call<{ organizations?: ApolloOrg[]; accounts?: ApolloOrg[]; pagination?: { total_pages?: number } }>(
      "/mixed_companies/search",
      {
        organization_locations: [`${i.city}, India`],
        q_organization_keyword_tags: keywords,
        organization_num_employees_ranges: [i.staffRange || "11,500"],
        page, per_page: 100,
      },
      apiKey, f,
    );
    const orgs = [...(body.organizations ?? []), ...(body.accounts ?? [])];
    for (const o of orgs) {
      out.push({
        source: "apollo", externalId: o.id, name: o.name ?? "Unnamed",
        website: o.website_url ?? (o.primary_domain ? `https://${o.primary_domain}` : null),
        phone: o.primary_phone?.number ?? o.phone ?? null, city: o.city ?? i.city, address: o.raw_address ?? null,
        industry: o.industry ?? i.industry, staffSize: o.estimated_num_employees ?? null,
      });
    }
    if (orgs.length < 100 || (body.pagination?.total_pages ?? 1) <= page) break;
  }
  return out.slice(0, limit);
}

export interface ApolloPerson { id: string; name: string; title: string | null; hasEmail: boolean }

const DECISION_TITLES = ["owner", "founder", "managing director", "director", "ceo", "chief executive", "cto", "cfo", "general manager", "head of it", "it manager", "proprietor", "partner"];

/** People search (no credits): decision makers at a company domain. Emails are not returned here. */
export async function searchApolloPeople(domain: string, apiKey: string, f: Fetch = fetch): Promise<ApolloPerson[]> {
  const body = await call<{ people?: { id: string; first_name?: string; last_name?: string; last_name_obfuscated?: string; title?: string; has_email?: boolean }[] }>(
    "/mixed_people/api_search",
    { q_organization_domains_list: [domain], person_titles: DECISION_TITLES, page: 1, per_page: 25 },
    apiKey, f,
  );
  return (body.people ?? []).map((p) => ({
    id: p.id,
    name: [p.first_name, p.last_name ?? p.last_name_obfuscated].filter(Boolean).join(" ") || "Unknown",
    title: p.title ?? null,
    hasEmail: p.has_email !== false,
  }));
}

export interface RevealedPerson { name: string; title: string | null; email: string | null; linkedin: string | null }

/** People enrichment (uses Apollo credits): full name, work email and LinkedIn for one person. */
export async function revealApolloPerson(id: string, apiKey: string, f: Fetch = fetch): Promise<RevealedPerson> {
  const body = await call<{ person?: { name?: string; first_name?: string; last_name?: string; title?: string; email?: string; linkedin_url?: string } }>(
    "/people/match", { id, reveal_personal_emails: false }, apiKey, f,
  );
  const p = body.person;
  if (!p) throw new Error("Apollo could not match this person.");
  const email = p.email && !p.email.startsWith("email_not_unlocked") ? p.email : null;
  return { name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "), title: p.title ?? null, email, linkedin: p.linkedin_url ?? null };
}

export interface ApolloOrgDetails {
  id: string | null;
  employees: number | null;
  annualRevenueUsd: number | null;
  symbol: string | null;
  exchange: string | null;
  foundedYear: number | null;
  technologies: string[];
  phone: string | null;
  industry: string | null;
}

/** Organization enrichment by domain (uses Apollo credits): size, revenue, listing, technologies. */
export async function enrichApolloOrg(domain: string, apiKey: string, f: Fetch = fetch): Promise<ApolloOrgDetails | null> {
  const res = await f(`${BASE}/organizations/enrich?domain=${encodeURIComponent(domain)}`, {
    method: "GET",
    headers: { "cache-control": "no-cache", "x-api-key": apiKey },
  });
  const json = (await res.json().catch(() => ({}))) as {
    organization?: {
      id?: string; estimated_num_employees?: number; annual_revenue?: number; organization_revenue?: number;
      publicly_traded_symbol?: string; publicly_traded_exchange?: string; founded_year?: number;
      technology_names?: string[]; current_technologies?: { name?: string }[]; industry?: string;
      primary_phone?: { number?: string }; phone?: string;
    };
    error?: string; message?: string;
  };
  if (!res.ok) throw new Error(`Apollo: ${json.error ?? json.message ?? res.status}`);
  const o = json.organization;
  if (!o) return null;
  const tech = o.technology_names?.length ? o.technology_names : (o.current_technologies ?? []).map((t) => t.name ?? "").filter(Boolean);
  return {
    id: o.id ?? null,
    employees: o.estimated_num_employees ?? null,
    annualRevenueUsd: o.annual_revenue ?? o.organization_revenue ?? null,
    symbol: o.publicly_traded_symbol ?? null,
    exchange: o.publicly_traded_exchange ?? null,
    foundedYear: o.founded_year ?? null,
    technologies: tech.slice(0, 40),
    phone: o.primary_phone?.number ?? o.phone ?? null,
    industry: o.industry ?? null,
  };
}
