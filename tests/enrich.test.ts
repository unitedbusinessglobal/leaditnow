import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { extractContacts, normaliseIndianPhone } from "@/signals/contacts";
import { estimateItBudget, readSettings, industryBucket, inrShort, DEFAULT_SETTINGS } from "@/domain/estimate";
import { rupees, parseCsv, guessMapping, importRows } from "@/domain/csv";
import { enrichApolloOrg } from "@/discovery/apollo";
import { applyApollo } from "@/domain/enrich";
import { upsertAccount, saveScan } from "@/domain/accounts";
import type { Fetch } from "@/discovery/types";

describe("published contact details", () => {
  it("finds emails and Indian phone numbers with their page", () => {
    const pages = [
      { url: "https://kovaipumps.in/contact", html: `<a href="mailto:Sales@KovaiPumps.in?subject=Hi">Mail us</a>
        <p>Phone: 0422 - 2345 678 | Mobile: +91 98430 12345</p><a href="tel:+919843012345">Call</a>
        <img src="logo@2x.png"><p>Write to info@kovaipumps.in or support@gmail.com</p><p>Order no. 2024 5567 8899</p>` },
      { url: "https://kovaipumps.in/", html: `<script>var x="tracker@sentry.io"</script><p>Est. 1998, PIN 641018</p>` },
    ];
    const found = extractContacts(pages, "kovaipumps.in");
    expect(found.filter((f) => f.kind === "email").map((f) => f.value)).toEqual(["sales@kovaipumps.in", "info@kovaipumps.in", "support@gmail.com"]);
    expect(found.filter((f) => f.kind === "phone").map((f) => f.value).sort()).toEqual(["+91 42223 45678", "+91 98430 12345"]);
    expect(found.every((f) => f.sourceUrl === "https://kovaipumps.in/contact")).toBe(true);
    expect(normaliseIndianPhone("1234567890")).toBeNull();
    expect(normaliseIndianPhone("641018")).toBeNull();
  });
});

describe("IT budget estimate", () => {
  const s = readSettings(null);
  it("uses revenue × industry % and widens to a band", () => {
    expect(industryBucket("Pump manufacturing")).toBe("Engineering and auto components");
    const e = estimateItBudget({ industry: "Hospital", revenueInr: 5e7, staffSize: 80, stack: [], signalIds: [], contactTitles: [] }, s)!;
    expect(e.basis).toBe("revenue");
    expect(e.pct).toBe(2);
    expect([e.lowInr, e.highInr]).toEqual([7e5, 13e5]); // 2% of ₹5 crore = ₹10 lakh, ±30%
  });
  it("adds evidence of IT spend and falls back to staff only when set", () => {
    const e = estimateItBudget({ industry: null, revenueInr: 1e8, staffSize: null, stack: ["a", "b", "c"], signalIds: ["job-post-it"], contactTitles: ["Head of IT"] }, s)!;
    expect(e.highInr).toBe(Math.round((2e6 * 1.45 * 1.3) / 1e4) * 1e4);
    expect(e.notes.join(" ")).toMatch(/hiring for IT/);
    expect(estimateItBudget({ industry: null, revenueInr: null, staffSize: 50, stack: [], signalIds: [], contactTitles: [] }, s)).toBeNull();
    const withStaff = estimateItBudget({ industry: null, revenueInr: null, staffSize: 50, stack: [], signalIds: [], contactTitles: [] }, { ...DEFAULT_SETTINGS, itPerEmployeeInr: 20000 })!;
    expect(withStaff).toMatchObject({ basis: "staff", lowInr: 7e5, highInr: 13e5 });
    expect(inrShort(4.5e7)).toBe("₹4.5 crore");
    expect(inrShort(12e5)).toBe("₹12 lakh");
  });
  it("parses rupee amounts as people type them", () => {
    expect(rupees("₹ 4.5 crore")).toBe(4.5e7);
    expect(rupees("12 lakh")).toBe(12e5);
    expect(rupees("1,00,000")).toBe(1e5);
    expect(rupees("Rs. 500000.00")).toBe(5e5);
    expect(rupees("about 5")).toBe(null);
  });
});

describe("Apollo organization enrichment", () => {
  it("maps size, revenue, listing and technologies", async () => {
    const f = (async (url: string) => {
      expect(url).toBe("https://api.apollo.io/api/v1/organizations/enrich?domain=ashokleyland.com");
      return new Response(JSON.stringify({ organization: {
        id: "o1", estimated_num_employees: 11906, annual_revenue: 4_500_000_000, publicly_traded_symbol: "ASHOKLEY",
        publicly_traded_exchange: "nse", founded_year: 1948, technology_names: ["SAP", "Salesforce"], industry: "automotive",
      } }));
    }) as unknown as Fetch;
    const d = await enrichApolloOrg("ashokleyland.com", "K", f);
    expect(d).toMatchObject({ employees: 11906, annualRevenueUsd: 4.5e9, symbol: "ASHOKLEY", foundedYear: 1948, technologies: ["SAP", "Salesforce"] });
  });
});

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("enrichment on Postgres", () => {
  let db: PrismaClient; let pool: Pool; let orgId: string;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    orgId = (await db.organization.create({ data: { name: `Enrich ${Date.now()}`, settings: { usdInr: 80 } } })).id;
  });
  afterAll(async () => { await db.$disconnect(); await pool.end(); });

  it("saves published contacts once and fills the office phone", async () => {
    const { account } = await upsertAccount(db, orgId, { domain: "kovaipumps.in" });
    const scan = { domain: "kovaipumps.in", scannedAt: "", pagesScanned: [], mx: [], signals: [], need: { score: 0, label: "None" as const, stack: [], serviceHints: [], strongIntent: false },
      contacts: [{ kind: "email" as const, value: "sales@kovaipumps.in", sourceUrl: "https://kovaipumps.in/contact" }, { kind: "phone" as const, value: "+91 98430 12345", sourceUrl: "https://kovaipumps.in/contact" }] };
    await saveScan(db, account, scan);
    await saveScan(db, account, scan);
    expect(await db.contactPoint.count({ where: { accountId: account.id } })).toBe(2);
    expect((await db.account.findUniqueOrThrow({ where: { id: account.id } })).phone).toBe("9843012345");
  });

  it("applies Apollo details without overwriting what the team typed", async () => {
    const { account } = await upsertAccount(db, orgId, { domain: "ashokleyland.com" });
    await db.account.update({ where: { id: account.id }, data: { revenueInr: 1e9, revenueSource: "manual", staffSize: 12000 } });
    const a = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    const out = await applyApollo(db, a, { id: "o1", employees: 11906, annualRevenueUsd: 4.5e9, symbol: "ASHOKLEY", exchange: "NSE", foundedYear: 1948, technologies: ["SAP"], phone: null, industry: "automotive" });
    expect(out).toMatchObject({ revenueInr: 1e9, revenueSource: "manual", staffSize: 12000, listed: true, stockSymbol: "ASHOKLEY", foundedYear: 1948, technologies: ["SAP"] });
    const { account: b } = await upsertAccount(db, orgId, { domain: "newco.in" });
    const out2 = await applyApollo(db, b, { id: "o2", employees: 40, annualRevenueUsd: 1e6, symbol: null, exchange: null, foundedYear: null, technologies: [], phone: "+91 44 4000 1234", industry: null });
    expect(out2).toMatchObject({ revenueInr: 8e7, revenueSource: "apollo", staffSize: 40, listed: null }); // $1m at ₹80
  });

  it("keeps register columns on accounts and review items", async () => {
    const rows = parseCsv([
      "CORPORATE_IDENTIFICATION_NUMBER,COMPANY_NAME,COMPANY_STATUS,COMPANY_CLASS,PAIDUP_CAPITAL,LISTED,WEBSITE",
      "U29120TN2001PTC047123,Sri Ganga Castings Private Limited,Active,Private,25000000,Unlisted,gangacastings.com",
      "L34102TN1948PLC000616,Old Listed Ltd,Active,Public,2936000000,Listed,",
    ].join("\n"));
    const map = guessMapping(rows[0]);
    expect(map).toMatchObject({ externalId: 0, name: 1, status: 2, companyClass: 3, paidUpCapital: 4, listed: 5, domain: 6 });
    const res = await importRows(db, orgId, rows, map, { sourceName: "register.csv" });
    expect(res).toMatchObject({ created: 1, candidates: 1 });
    const g = await db.account.findUniqueOrThrow({ where: { orgId_domain: { orgId, domain: "gangacastings.com" } } });
    expect(g).toMatchObject({ cin: "U29120TN2001PTC047123", paidUpCapitalInr: 2.5e7, listed: false, companyClass: "Private" });
    const c = await db.leadCandidate.findFirstOrThrow({ where: { orgId, externalId: "L34102TN1948PLC000616" } });
    expect(c.extra).toMatchObject({ cin: "L34102TN1948PLC000616", listed: true, paidUpCapitalInr: 2.936e9 });
  });
});
