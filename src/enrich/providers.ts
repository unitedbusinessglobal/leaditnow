import type { Fetch } from "@/discovery/types";
import { enrichApolloOrg } from "@/discovery/apollo";

/**
 * Company-data and email providers. Each one is optional: it is used only when its key is set.
 * Enrichment tries them in order (free plans first) and stops once staff, revenue and industry are known.
 */
export type ProviderId = "pdl" | "hunter" | "prospeo" | "snov" | "lusha" | "apollo";

export interface CompanyFacts {
  employees: number | null;
  revenueUsd: number | null;
  revenueText: string | null; // the provider's own range, e.g. "$1M-$10M"
  industry: string | null;
  foundedYear: number | null;
  phone: string | null;
  symbol: string | null;
  exchange: string | null;
  listed: boolean | null;
  technologies: string[];
  city: string | null;
  linkedin: string | null;
  externalId: string | null;
}

export interface FoundEmail { email: string; name: string | null; title: string | null; phone: string | null; confidence: number | null; generic: boolean }

export interface Provider {
  id: ProviderId;
  label: string;
  env: string[];
  free: string; // what the free plan gives
  paid: string; // cheapest paid plan
  note?: string; // caveats about API access
  signup: string;
  gives: string;
  company?: (domain: string, f: Fetch) => Promise<CompanyFacts | null>;
  emails?: (domain: string, f: Fetch) => Promise<FoundEmail[]>;
}

export const blankFacts = (): CompanyFacts => ({
  employees: null, revenueUsd: null, revenueText: null, industry: null, foundedYear: null, phone: null,
  symbol: null, exchange: null, listed: null, technologies: [], city: null, linkedin: null, externalId: null,
});

// ---------- parsing helpers ----------

const MULT: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
/** "$1M-$10M" -> 5.5e6, "$250K" -> 250000, "1B+" -> 1e9. Middle of a range. */
export function moneyRange(s: string | null | undefined): number | null {
  if (!s) return null;
  const nums = [...s.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kmbt])?/gi)].map((m) => Number(m[1]) * (m[2] ? MULT[m[2].toLowerCase()] : 1));
  if (nums.length === 0) return null;
  return nums.length === 1 ? nums[0] : (nums[0] + nums[1]) / 2;
}
/** "11-50" -> 30, "201 - 500" -> 350, "10001+" -> 10001. */
export function staffRange(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return s;
  const nums = [...s.replace(/,/g, "").matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  return nums.length === 1 ? nums[0] : Math.round((nums[0] + nums[1]) / 2);
}
const year = (v: unknown) => { const n = Number(String(v ?? "").slice(0, 4)); return n > 1700 && n < 2100 ? n : null; };
const titleCase = (s: string | null | undefined) => (s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : null);

async function getJson(f: Fetch, url: string, init: RequestInit, label: string, notFound: number[] = [404]) {
  const res = await f(url, init);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (notFound.includes(res.status)) return null;
  if (!res.ok) {
    const msg = (body.error as { message?: string })?.message ?? (body.errors as { details?: string; message?: string }[])?.[0]?.details
      ?? (body.message as string) ?? (body.error_code as string) ?? (typeof body.error === "string" ? body.error : null) ?? `HTTP ${res.status}`;
    throw new Error(`${label}: ${msg}`);
  }
  return body;
}

// ---------- People Data Labs ----------

export function parsePdl(c: Record<string, unknown>): CompanyFacts {
  const loc = (c.location ?? {}) as { locality?: string };
  return {
    ...blankFacts(),
    employees: (c.employee_count as number) || staffRange(c.size as string),
    revenueUsd: moneyRange(c.inferred_revenue as string),
    revenueText: (c.inferred_revenue as string) ?? null,
    industry: titleCase(c.industry as string),
    foundedYear: year(c.founded),
    symbol: (c.ticker as string) ?? null,
    listed: c.type === "public" ? true : c.type ? false : null,
    city: titleCase(loc.locality),
    linkedin: (c.linkedin_url as string) ?? null,
    externalId: (c.id as string) ?? null,
  };
}

// ---------- Hunter ----------

export function parseHunterCompany(d: Record<string, unknown>): CompanyFacts {
  const m = (d.metrics ?? {}) as { employees?: string | number; estimatedAnnualRevenue?: string };
  const cat = (d.category ?? {}) as { industry?: string };
  const geo = (d.geo ?? {}) as { city?: string };
  return {
    ...blankFacts(),
    employees: staffRange(m.employees),
    revenueUsd: moneyRange(m.estimatedAnnualRevenue),
    revenueText: m.estimatedAnnualRevenue ?? null,
    industry: cat.industry ?? null,
    foundedYear: year(d.foundedYear),
    phone: (d.phone as string) ?? null,
    symbol: (d.ticker as string) ?? null,
    listed: d.type === "public" ? true : d.type ? false : null,
    technologies: (d.tech as string[]) ?? [],
    city: geo.city ?? null,
  };
}

export function parseHunterEmails(d: Record<string, unknown>): FoundEmail[] {
  return ((d.emails ?? []) as { value: string; type?: string; first_name?: string; last_name?: string; position?: string; phone_number?: string; confidence?: number }[])
    .filter((e) => e.value)
    .map((e) => ({
      email: e.value.toLowerCase(),
      name: [e.first_name, e.last_name].filter(Boolean).join(" ") || null,
      title: e.position ?? null,
      phone: e.phone_number ?? null,
      confidence: e.confidence ?? null,
      generic: e.type === "generic",
    }));
}

// ---------- Prospeo ----------

export function parseProspeo(c: Record<string, unknown>): CompanyFacts {
  const rev = (c.revenue_range ?? {}) as { min?: number; max?: number };
  const phone = (c.phone_hq ?? {}) as { phone_hq_international?: string; phone_hq?: string };
  const loc = (c.location ?? {}) as { city?: string };
  const revenueUsd = rev.min != null && rev.max != null ? (rev.min + rev.max) / 2 : rev.min ?? rev.max ?? null;
  return {
    ...blankFacts(),
    employees: (c.employee_count as number) ?? staffRange(c.employee_range as string),
    revenueUsd,
    revenueText: (c.revenue_range_printed as string) ?? null,
    industry: (c.industry as string) ?? null,
    foundedYear: year(c.founded),
    phone: phone.phone_hq_international ?? phone.phone_hq ?? null,
    technologies: Array.isArray(c.technology) ? (c.technology as (string | { name?: string })[]).map((t) => (typeof t === "string" ? t : t.name ?? "")).filter(Boolean) : [],
    city: loc.city ?? null,
    linkedin: (c.linkedin_url as string) ?? null,
    externalId: (c.company_id as string) ?? null,
  };
}

// ---------- Snov.io ----------

let snovToken: { value: string; until: number } | null = null;
async function snovAuth(f: Fetch): Promise<string> {
  if (snovToken && snovToken.until > Date.now()) return snovToken.value;
  const body = await getJson(f, "https://api.snov.io/v1/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SNOV_CLIENT_ID!, client_secret: process.env.SNOV_CLIENT_SECRET! }),
  }, "Snov.io");
  const token = body!.access_token as string;
  if (!token) throw new Error("Snov.io: no access token (check the client ID and secret)");
  snovToken = { value: token, until: Date.now() + ((body!.expires_in as number) ?? 3600) * 1000 - 60_000 };
  return token;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Snov.io searches run as tasks: start one, then poll for the result. */
async function snovTask(f: Fetch, path: string, domain: string): Promise<Record<string, unknown> | null> {
  const token = await snovAuth(f);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = `https://api.snov.io/v2/domain-search${path ? `/${path}` : ""}`;
  const started = await getJson(f, `${base}/start`, { method: "POST", headers, body: JSON.stringify({ domain }) }, "Snov.io");
  const hash = (started?.meta as { task_hash?: string })?.task_hash ?? (started?.task_hash as string);
  if (!hash) return null;
  for (let i = 0; i < 6; i++) {
    await pause(i === 0 ? 800 : 1500);
    const r = await getJson(f, `${base}/result/${hash}`, { headers }, "Snov.io");
    if (r && r.status !== "in_progress") return r;
  }
  return null;
}

export function parseSnovCompany(r: Record<string, unknown>): CompanyFacts | null {
  const d = (r.data ?? r) as Record<string, unknown>;
  if (!d || (!d.company_name && !d.size && !d.industry)) return null;
  return {
    ...blankFacts(),
    employees: staffRange(d.size as string),
    industry: (d.industry as string) ?? null,
    foundedYear: year(d.founded),
    phone: (d.hq_phone as string) ?? null,
    city: (d.city as string) ?? null,
  };
}

export function parseSnovEmails(r: Record<string, unknown>, generic: boolean): FoundEmail[] {
  const list = (Array.isArray(r.data) ? r.data : []) as { email?: string }[];
  return list.filter((e) => e.email).map((e) => ({ email: e.email!.toLowerCase(), name: null, title: null, phone: null, confidence: null, generic }));
}

// ---------- Lusha ----------

export function parseLusha(d: Record<string, unknown>): CompanyFacts {
  const loc = (d.location ?? {}) as { city?: string };
  const rev = Array.isArray(d.revenueRange) ? (d.revenueRange as number[]) : [];
  const social = (d.social ?? {}) as { linkedin?: { url?: string } };
  return {
    ...blankFacts(),
    employees: staffRange((d.employees ?? d.companySize) as string),
    revenueUsd: rev.length ? (rev.length > 1 ? (rev[0] + rev[1]) / 2 : rev[0]) : null,
    revenueText: rev.length > 1 ? `$${rev[0].toLocaleString("en-US")}–$${rev[1].toLocaleString("en-US")}` : null,
    industry: (d.mainIndustry as string) ?? null,
    foundedYear: year(d.founded),
    technologies: Array.isArray(d.technologies) ? (d.technologies as (string | { name?: string })[]).map((t) => (typeof t === "string" ? t : t.name ?? "")).filter(Boolean) : [],
    city: loc.city ?? null,
    linkedin: social.linkedin?.url ?? (d.linkedin as string) ?? null,
    externalId: d.id != null ? String(d.id) : null,
  };
}

// ---------- registry ----------

export const PROVIDERS: Provider[] = [
  {
    id: "pdl", label: "People Data Labs", env: ["PDL_API_KEY"],
    free: "100 company lookups a month", paid: "from $99 a month",
    signup: "https://dashboard.peopledatalabs.com/signup", gives: "Staff, revenue range, industry, founded year, listed or private, ticker, LinkedIn",
    company: async (domain, f) => {
      const c = await getJson(f, `https://api.peopledatalabs.com/v5/company/enrich?website=${encodeURIComponent(domain)}&min_likelihood=4`,
        { headers: { "x-api-key": process.env.PDL_API_KEY! } }, "People Data Labs");
      return c ? parsePdl(c) : null;
    },
  },
  {
    id: "hunter", label: "Hunter", env: ["HUNTER_API_KEY"],
    free: "50 credits a month", paid: "$34–49 a month for 2,000",
    signup: "https://hunter.io/users/sign_up", gives: "Work emails with names and job titles; company size, revenue range, technologies",
    company: async (domain, f) => {
      const b = await getJson(f, `https://api.hunter.io/v2/companies/find?domain=${encodeURIComponent(domain)}`,
        { headers: { "x-api-key": process.env.HUNTER_API_KEY! } }, "Hunter");
      return b?.data ? parseHunterCompany(b.data as Record<string, unknown>) : null;
    },
    emails: async (domain, f) => {
      const b = await getJson(f, `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10`,
        { headers: { "x-api-key": process.env.HUNTER_API_KEY! } }, "Hunter");
      return b?.data ? parseHunterEmails(b.data as Record<string, unknown>) : [];
    },
  },
  {
    id: "prospeo", label: "Prospeo", env: ["PROSPEO_API_KEY"],
    free: "100 credits a month", paid: "$49 a month for 2,000",
    note: "Prospeo's free plan may not include the API; the key works from the $49 plan.",
    signup: "https://app.prospeo.io/signup", gives: "Staff, revenue range, industry, founded year, head-office phone, technologies",
    company: async (domain, f) => {
      const b = await getJson(f, "https://api.prospeo.io/enrich-company", {
        method: "POST", headers: { "x-key": process.env.PROSPEO_API_KEY!, "content-type": "application/json" },
        body: JSON.stringify({ data: { company_website: domain } }),
      }, "Prospeo");
      if (!b) return null;
      if (b.error && b.error_code === "NO_MATCH") return null;
      return b.company ? parseProspeo(b.company as Record<string, unknown>) : null;
    },
  },
  {
    id: "snov", label: "Snov.io", env: ["SNOV_CLIENT_ID", "SNOV_CLIENT_SECRET"],
    free: "50 credits (trial, does not expire)", paid: "$29–39 a month for 1,000",
    note: "Snov.io gives free accounts API access on request (they book a short demo).",
    signup: "https://app.snov.io/register", gives: "Emails on the company's domain; size, industry, founded year, head-office phone",
    company: async (domain, f) => {
      const r = await snovTask(f, "", domain);
      return r ? parseSnovCompany(r) : null;
    },
    emails: async (domain, f) => {
      const [named, generic] = await Promise.all([snovTask(f, "domain-emails", domain), snovTask(f, "generic-contacts", domain)]);
      return [...(named ? parseSnovEmails(named, false) : []), ...(generic ? parseSnovEmails(generic, true) : [])];
    },
  },
  {
    id: "lusha", label: "Lusha", env: ["LUSHA_API_KEY"],
    free: "40 credits a month (in Lusha's own app)", paid: "about $37 a month per user",
    note: "Lusha's free plan has no API; the key works on a paid plan with API access.",
    signup: "https://www.lusha.com/signup/", gives: "Staff, revenue range, industry, founded year, technologies",
    company: async (domain, f) => {
      const b = await getJson(f, `https://api.lusha.com/v2/company?domain=${encodeURIComponent(domain)}`,
        { headers: { api_key: process.env.LUSHA_API_KEY! } }, "Lusha");
      return b?.data ? parseLusha(b.data as Record<string, unknown>) : null;
    },
  },
  {
    id: "apollo", label: "Apollo", env: ["APOLLO_API_KEY"],
    free: "900 credits a year (in Apollo's own app; no API)", paid: "API from $119 a month",
    note: "Apollo's API needs the Organization plan. On cheaper plans, export searches as CSV and use Import CSV.",
    signup: "https://app.apollo.io/#/signup", gives: "Staff, revenue, listing, technologies; decision makers",
    company: async (domain, f) => {
      const d = await enrichApolloOrg(domain, process.env.APOLLO_API_KEY!, f);
      if (!d) return null;
      return {
        ...blankFacts(), employees: d.employees, revenueUsd: d.annualRevenueUsd, industry: d.industry, foundedYear: d.foundedYear,
        phone: d.phone, symbol: d.symbol, exchange: d.exchange, listed: d.symbol ? true : null, technologies: d.technologies, externalId: d.id,
      };
    },
  },
];

export const providerReady = (p: Provider) => p.env.every((k) => Boolean(process.env[k]));
export const readyProviders = () => PROVIDERS.filter(providerReady);
export const PROVIDER_LABEL = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.label])) as Record<ProviderId, string>;
