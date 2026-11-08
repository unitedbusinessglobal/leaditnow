import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ownDomain } from "@/discovery/website";
import { searchPlaces, placesQuery } from "@/discovery/places";
import { searchApolloCompanies, searchApolloPeople, revealApolloPerson } from "@/discovery/apollo";
import { overpassQuery, parseOverpass } from "@/discovery/osm";
import { wikidataQuery, parseWikidata } from "@/discovery/wikidata";
import { ingest, runDiscovery } from "@/discovery/ingest";
import type { Fetch } from "@/discovery/types";

const input = { industry: "Manufacturing", city: "Coimbatore" };

/** A fetch stub that records requests and replays canned JSON bodies in order. */
function stub(bodies: unknown[], status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = bodies.shift() ?? {};
    return new Response(JSON.stringify(body), { status });
  }) as unknown as Fetch;
  return { f, calls };
}

describe("lead source connectors", () => {
  it("keeps only a company's own website", () => {
    expect(ownDomain("https://www.kovaipumps.co.in/contact")).toBe("kovaipumps.co.in");
    expect(ownDomain("https://www.facebook.com/kovaipumps")).toBeNull();
    expect(ownDomain("https://www.indiamart.com/kovai-pumps/")).toBeNull();
    expect(ownDomain("https://kovai-pumps.business.site")).toBeNull();
    expect(ownDomain("")).toBeNull();
  });

  it("Google Places: pages through results and skips closed businesses", async () => {
    const { f, calls } = stub([
      {
        places: [
          { id: "p1", displayName: { text: "Kovai Pumps" }, websiteUri: "https://kovaipumps.co.in/", nationalPhoneNumber: "0422 123 4567", businessStatus: "OPERATIONAL",
            addressComponents: [{ longText: "Coimbatore", types: ["locality", "political"] }], formattedAddress: "Avinashi Rd, Coimbatore" },
          { id: "p2", displayName: { text: "Closed Works" }, businessStatus: "CLOSED_PERMANENTLY" },
        ],
        nextPageToken: "t2",
      },
      { places: [{ id: "p3", displayName: { text: "Ganga Castings" }, businessStatus: "OPERATIONAL" }] },
    ]);
    const found = await searchPlaces(input, "KEY", f);
    expect(found.map((x) => x.externalId)).toEqual(["p1", "p3"]);
    expect(found[0]).toMatchObject({ source: "google-places", name: "Kovai Pumps", city: "Coimbatore", phone: "0422 123 4567" });
    expect(calls).toHaveLength(2);
    const h = calls[0].init!.headers as Record<string, string>;
    expect(h["X-Goog-Api-Key"]).toBe("KEY");
    expect(h["X-Goog-FieldMask"]).toContain("places.websiteUri");
    expect(JSON.parse(calls[1].init!.body as string)).toMatchObject({ pageToken: "t2", textQuery: placesQuery(input), regionCode: "IN" });
  });

  it("Google Places: surfaces API errors", async () => {
    const { f } = stub([{ error: { message: "API key not valid" } }], 400);
    await expect(searchPlaces(input, "BAD", f)).rejects.toThrow("Google Places: API key not valid");
  });

  it("Apollo: company search, people search and reveal", async () => {
    const { f, calls } = stub([
      { organizations: [{ id: "a1", name: "Lakshmi Machine Works", primary_domain: "lmwglobal.com", estimated_num_employees: 450, industry: "machinery", city: "Coimbatore", primary_phone: { number: "+91 422 719 2255" } }] },
      { people: [{ id: "u1", first_name: "Priya", last_name_obfuscated: "S***", title: "Head of IT", has_email: true }] },
      { person: { name: "Priya Sundaram", title: "Head of IT", email: "priya@lmwglobal.com", linkedin_url: "https://linkedin.com/in/priya" } },
    ]);
    const orgs = await searchApolloCompanies({ ...input, staffRange: "51,500" }, "AK", f);
    expect(orgs[0]).toMatchObject({ source: "apollo", externalId: "a1", website: "https://lmwglobal.com", staffSize: 450, phone: "+91 422 719 2255" });
    expect(JSON.parse(calls[0].init!.body as string)).toMatchObject({ organization_locations: ["Coimbatore, India"], organization_num_employees_ranges: ["51,500"] });
    expect((calls[0].init!.headers as Record<string, string>)["x-api-key"]).toBe("AK");
    const people = await searchApolloPeople("lmwglobal.com", "AK", f);
    expect(people).toEqual([{ id: "u1", name: "Priya S***", title: "Head of IT", hasEmail: true }]);
    expect(calls[1].url).toMatch(/mixed_people\/api_search$/);
    const p = await revealApolloPerson("u1", "AK", f);
    expect(p).toEqual({ name: "Priya Sundaram", title: "Head of IT", email: "priya@lmwglobal.com", linkedin: "https://linkedin.com/in/priya" });
  });

  it("OpenStreetMap: builds a city and tag query and parses elements", () => {
    const q = overpassQuery({ industry: "Healthcare and clinics", city: "Madurai" });
    expect(q).toContain('area["name"="Madurai"]["boundary"="administrative"]->.city');
    expect(q).toContain('["amenity"~"hospital|clinic|doctors|dentist|pharmacy"]["website"]');
    const found = parseOverpass({
      elements: [
        { type: "node", id: 1, tags: { name: "Meenakshi Clinic", website: "https://meenakshiclinic.in", phone: "+91 452 234 5678", "addr:city": "Madurai" } },
        { type: "way", id: 2, tags: { name: "City Dental", "contact:website": "https://www.facebook.com/citydental" } },
        { type: "node", id: 1, tags: { name: "Meenakshi Clinic" } },
        { type: "node", id: 3, tags: { website: "https://noname.in" } },
      ],
    }, { industry: "Healthcare and clinics", city: "Madurai" });
    expect(found.map((x) => x.externalId)).toEqual(["node/1", "way/2"]);
    expect(found[1].website).toBe("https://www.facebook.com/citydental");
  });

  it("Wikidata: query and parse, one row per company", () => {
    const q = wikidataQuery({ industry: "IT and software", city: "Chennai" });
    expect(q).toContain('?city rdfs:label "Chennai"@en; wdt:P17 wd:Q668.');
    expect(q).toContain("wdt:P31/wdt:P279* wd:Q4830453"); // businesses only
    const media = parseWikidata({ results: { bindings: [
      { item: { value: "http://www.wikidata.org/entity/Q926175" }, itemLabel: { value: "The Hindu" }, website: { value: "https://www.thehindu.com" }, industryLabel: { value: "newspaper publishing" } },
      { item: { value: "http://www.wikidata.org/entity/Q5" }, itemLabel: { value: "Zoho" }, website: { value: "https://zoho.com" }, industryLabel: { value: "software industry" } },
    ] } }, { industry: "IT and software", city: "Chennai" });
    expect(media.map((m) => m.name)).toEqual(["Zoho"]);
    const found = parseWikidata({
      results: { bindings: [
        { item: { value: "http://www.wikidata.org/entity/Q123" }, itemLabel: { value: "Ashok Leyland" }, website: { value: "https://www.ashokleyland.com" }, employees: { value: "11000" } },
        { item: { value: "http://www.wikidata.org/entity/Q123" }, itemLabel: { value: "Ashok Leyland" }, website: { value: "https://www.ashokleyland.com" } },
        { item: { value: "http://www.wikidata.org/entity/Q999" }, itemLabel: { value: "Q999" }, website: { value: "https://x.in" } },
      ] },
    }, { industry: "IT and software", city: "Chennai" });
    expect(found).toEqual([]); // no industry listed: not kept for an industry search
    const auto = parseWikidata({ results: { bindings: [
      { item: { value: "http://www.wikidata.org/entity/Q726193" }, itemLabel: { value: "Ashok Leyland" }, website: { value: "https://ashokleyland.com" }, employees: { value: "11906" }, industryLabel: { value: "automotive industry" } },
      { item: { value: "http://www.wikidata.org/entity/Q1255973" }, itemLabel: { value: "Dravida Munnetra Kazhagam" }, website: { value: "https://www.dmk.in/" } },
    ] } }, { industry: "Manufacturing", city: "Chennai" });
    expect(auto).toEqual([{ source: "wikidata", externalId: "Q726193", name: "Ashok Leyland", website: "https://ashokleyland.com", city: "Chennai", industry: "automotive industry", staffSize: 11906 }]);
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("ingest on Postgres", () => {
  let db: PrismaClient;
  let pool: Pool;
  let orgId: string;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    orgId = (await db.organization.create({ data: { name: `Discovery ${Date.now()}` } })).id;
  });
  afterAll(async () => { await db.$disconnect(); await pool.end(); });

  it("adds companies with websites, queues the rest, and dedupes across runs and sources", async () => {
    const found = [
      { source: "google-places" as const, externalId: "p1", name: "Kovai Pumps", website: "https://kovaipumps.co.in", phone: "0422 123 4567", city: "Coimbatore", industry: "Manufacturing" },
      { source: "google-places" as const, externalId: "p2", name: "Sri Ganga Castings", website: "https://facebook.com/ganga", phone: "0422 765 4321", city: "Coimbatore" },
      { source: "google-places" as const, externalId: "p3", name: "No Site Traders", city: "Coimbatore" },
    ];
    const r1 = await ingest(db, orgId, found, { query: "manufacturing in Coimbatore" });
    expect(r1).toMatchObject({ found: 3, added: 1, candidates: 2, existing: 0 });
    const acc = await db.account.findUniqueOrThrow({ where: { orgId_domain: { orgId, domain: "kovaipumps.co.in" } } });
    expect(acc).toMatchObject({ placeId: "p1", source: "google-places", city: "Coimbatore", phone: "4221234567" });
    expect(acc.fitScore).toBeGreaterThan(0);
    // Same search again: nothing new.
    expect(await ingest(db, orgId, found, { query: "again" })).toMatchObject({ added: 0, candidates: 0, existing: 3 });
    // OpenStreetMap lists the same company by phone only: merges into the account.
    const osm = await ingest(db, orgId, [{ source: "osm", externalId: "node/9", name: "Kovai Pumps Pvt Ltd", phone: "+91 422 123 4567" }], { query: "osm" });
    expect(osm).toMatchObject({ added: 0, existing: 1, candidates: 0 });
    // Apollo finds Ganga Castings' real website: becomes an account. The Places review item stays until someone adds or dismisses it.
    const ap = await ingest(db, orgId, [{ source: "apollo", externalId: "a7", name: "Sri Ganga Castings", website: "https://gangacastings.com", staffSize: 120 }], { query: "apollo" });
    expect(ap.added).toBe(1);
    expect(await db.account.count({ where: { orgId } })).toBe(2);
    expect(await db.leadCandidate.count({ where: { orgId, status: "NEW" } })).toBe(2);
  });

  it("logs failed runs without throwing", async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    const { run, result } = await runDiscovery(db, orgId, "google-places", { industry: "Manufacturing", city: "Salem" }, {});
    expect(result).toBeNull();
    expect(run.error).toMatch(/GOOGLE_PLACES_API_KEY/);
    process.env.GOOGLE_PLACES_API_KEY = saved;
    const { f } = stub([{ elements: [{ type: "node", id: 5, tags: { name: "Salem Steel", website: "https://salemsteel.in" } }] }]);
    const ok = await runDiscovery(db, orgId, "osm", { industry: "Manufacturing", city: "Salem" }, { fetchImpl: f });
    expect(ok.result).toMatchObject({ found: 1, added: 1 });
    expect(ok.run.query).toBe("Manufacturing · Salem");
  });
});
