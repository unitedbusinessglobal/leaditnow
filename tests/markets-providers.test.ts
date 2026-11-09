import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { guessCountry, normaliseIntlPhone, market } from "@/discovery/markets";
import { overpassQuery } from "@/discovery/osm";
import { placesQuery } from "@/discovery/places";
import { wikidataQuery } from "@/discovery/wikidata";
import { normalisePhone } from "@/domain/accounts";
import { extractContacts } from "@/signals/contacts";
import { fitScore } from "@/signals/score";
import { moneyRange, staffRange, parsePdl, parseHunterCompany, parseHunterEmails, parseProspeo, parseLusha, parseSnovCompany } from "@/enrich/providers";
import { enrichAccount, findEmails, mergeFacts, revenueSourceLabel } from "@/domain/enrich";
import { blankFacts } from "@/enrich/providers";
import { upsertAccount } from "@/domain/accounts";

describe("markets", () => {
  it("works out the country from a place name", () => {
    expect(guessCountry("Dubai")).toBe("AE");
    expect(guessCountry("Leeds, UK")).toBe("GB");
    expect(guessCountry("Riyadh, KSA")).toBe("SA");
    expect(guessCountry("Kuala Lumpur")).toBe("MY");
    expect(guessCountry("Chennai")).toBe("IN");
    expect(guessCountry("Atlantis")).toBeNull();
  });
  it("writes phones in international form", () => {
    expect(normaliseIntlPhone("04 123 4567", "AE")).toBe("+971 4123 4567");
    expect(normaliseIntlPhone("+44 20 7946 0000", null)).toBe("+44 20 7946 0000");
    expect(normaliseIntlPhone("(412) 555-0100", "US")).toBe("+1 412 555 0100");
    expect(normaliseIntlPhone("6123 4567", "SG")).toBe("+65 6123 4567");
    expect(normalisePhone("+971 4 123 4567")).toMatch(/^\+971/);
    expect(normalisePhone("044-2345 6789")).toBe("4423456789"); // India unchanged
  });
  it("searches the city inside the chosen country", () => {
    const q = overpassQuery({ industry: "Manufacturing", city: "Birmingham", country: "GB" });
    expect(q).toContain('area["ISO3166-1"="GB"]');
    expect(q).toContain('[~"^name(:en)?$"~"^Birmingham$",i](area.country)');
    expect(placesQuery({ industry: "Manufacturing", city: "Dubai", country: "AE" })).toBe("Manufacturing in Dubai, United Arab Emirates");
    expect(placesQuery({ industry: "Manufacturing", city: "Chennai" })).toBe("Manufacturing in Chennai, Tamil Nadu, India");
    expect(placesQuery({ industry: "Retail", city: "Singapore", country: "SG" })).toBe("Retail in Singapore");
    expect(wikidataQuery({ industry: "Manufacturing", city: "Riyadh", country: "SA" })).toContain(`wd:${market("SA").wikidata}`);
  });
  it("reads phones on foreign websites", () => {
    const html = '<a href="tel:+97143334444">Call</a> <p>Phone: 6123 4567</p>';
    const c = extractContacts([{ url: "https://acme.sg/contact", html }], "acme.sg");
    expect(c.filter((x) => x.kind === "phone").map((x) => x.value)).toEqual(["+971 4333 4444", "+65 6123 4567"]);
  });
  it("gives the fit points for target cities abroad", () => {
    expect(fitScore({ city: "Dubai" })).toBe(25);
    expect(fitScore({ city: "Toronto" })).toBe(25);
  });
});

describe("provider parsing", () => {
  it("reads ranges", () => {
    expect(moneyRange("$1M-$10M")).toBe(5.5e6);
    expect(moneyRange("$250K")).toBe(250000);
    expect(staffRange("11-50")).toBe(31);
    expect(staffRange("201 - 500")).toBe(351);
    expect(staffRange("10001+")).toBe(10001);
  });
  it("maps each provider's company record", () => {
    const pdl = parsePdl({ id: "p1", employee_count: 120, size: "51-200", inferred_revenue: "$10M-$25M", industry: "machinery", founded: 1998, type: "public", ticker: "ACME", location: { locality: "dubai" } });
    expect(pdl).toMatchObject({ employees: 120, revenueUsd: 17.5e6, industry: "Machinery", foundedYear: 1998, listed: true, symbol: "ACME", city: "Dubai" });
    const h = parseHunterCompany({ metrics: { employees: "11-50", estimatedAnnualRevenue: "$1M-$10M" }, category: { industry: "Retail" }, foundedYear: 2010, tech: ["shopify"], type: "private" });
    expect(h).toMatchObject({ employees: 31, revenueUsd: 5.5e6, industry: "Retail", listed: false, technologies: ["shopify"] });
    const p = parseProspeo({ employee_count: 40, revenue_range: { min: 1e6, max: 5e6 }, revenue_range_printed: "1M-5M", industry: "Textiles", founded: 2001, phone_hq: { phone_hq_international: "+60 3 1234 5678" } });
    expect(p).toMatchObject({ employees: 40, revenueUsd: 3e6, phone: "+60 3 1234 5678" });
    const l = parseLusha({ id: 9, employees: "201 - 500", revenueRange: [1e7, 5e7], mainIndustry: "Healthcare", founded: "1990", social: { linkedin: { url: "li" } } });
    expect(l).toMatchObject({ employees: 351, revenueUsd: 3e7, industry: "Healthcare", foundedYear: 1990, linkedin: "li", externalId: "9" });
    expect(parseSnovCompany({ data: { company_name: "Acme", size: "51-200", industry: "IT", founded: "2005", hq_phone: "+1 412 555 0100" } })).toMatchObject({ employees: 126, foundedYear: 2005 });
  });
  it("maps Hunter's emails", () => {
    const e = parseHunterEmails({ emails: [{ value: "Ravi@Acme.ae", type: "personal", first_name: "Ravi", last_name: "K", position: "CTO", confidence: 92 }, { value: "info@acme.ae", type: "generic" }] });
    expect(e).toEqual([
      { email: "ravi@acme.ae", name: "Ravi K", title: "CTO", phone: null, confidence: 92, generic: false },
      { email: "info@acme.ae", name: null, title: null, phone: null, confidence: null, generic: true },
    ]);
  });
  it("fills gaps from later providers only", () => {
    const m = mergeFacts({ ...blankFacts(), employees: 10 }, { ...blankFacts(), employees: 99, revenueUsd: 1e6, technologies: ["sap"] });
    expect([m.employees, m.revenueUsd, m.technologies]).toEqual([10, 1e6, ["sap"]]);
    expect(revenueSourceLabel("pdl|$1M-$10M")).toBe("People Data Labs estimate, $1M-$10M range");
    expect(revenueSourceLabel("apollo")).toBe("Apollo estimate");
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("waterfall enrichment on Postgres", () => {
  let db: PrismaClient;
  let pool: Pool;
  let orgId: string;
  const saved = { ...process.env };
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    orgId = (await db.organization.create({ data: { name: `Providers ${Date.now()}` } })).id;
  });
  afterEach(() => { process.env = { ...saved }; });
  afterAll(async () => { await db.$disconnect(); await pool.end(); });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("tries free sources first, skips one out of credits, and stops when complete", async () => {
    process.env.PDL_API_KEY = "k"; process.env.HUNTER_API_KEY = "k"; process.env.PROSPEO_API_KEY = "k"; process.env.APOLLO_API_KEY = "";
    delete process.env.SNOV_CLIENT_ID; delete process.env.LUSHA_API_KEY;
    const calls: string[] = [];
    const f = (async (u: string) => {
      calls.push(new URL(u).hostname);
      if (u.includes("peopledatalabs")) return json(402, { error: { message: "You have hit your account maximum" } });
      if (u.includes("hunter.io/v2/companies")) return json(200, { data: { metrics: { employees: "51-200", estimatedAnnualRevenue: "$1M-$10M" }, category: { industry: "Retail" } } });
      return json(500, {});
    }) as unknown as typeof fetch;
    const { account } = await upsertAccount(db, orgId, { domain: "souk-traders.ae", city: "Dubai", country: "AE" });
    expect(account.country).toBe("AE");
    const r = await enrichAccount(db, account, f);
    expect(r.status).toBe("done");
    expect(r.used).toEqual(["Hunter"]);
    expect(r.errors[0]).toMatch(/People Data Labs: You have hit/);
    expect(calls).toEqual(["api.peopledatalabs.com", "api.hunter.io"]); // Prospeo not needed
    const after = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect([after.staffSize, after.revenueInr, after.revenueSource]).toEqual([126, 5.5e6 * 88, "hunter|$1M-$10M"]);
  });

  it("saves Hunter's emails with names and titles", async () => {
    process.env.HUNTER_API_KEY = "k";
    const f = (async () => json(200, { data: { emails: [{ value: "md@souk-traders.ae", first_name: "Omar", last_name: "Saeed", position: "Managing Director", confidence: 95, type: "personal" }] } })) as unknown as typeof fetch;
    const account = await db.account.findFirstOrThrow({ where: { orgId, domain: "souk-traders.ae" } });
    const r = await findEmails(db, account, f);
    expect(r.added).toBe(1);
    const p = await db.contactPoint.findFirstOrThrow({ where: { accountId: account.id } });
    expect(p).toMatchObject({ value: "md@souk-traders.ae", name: "Omar Saeed", title: "Managing Director", source: "hunter", confidence: 95 });
    expect((await findEmails(db, account, f)).added).toBe(0);
  });
});
