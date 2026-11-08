import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { upsertAccount, saveScan, addManualSignal, normalisePhone } from "@/domain/accounts";
import { parseCsv, guessMapping, importRows } from "@/domain/csv";
import { loadDeal, checkMove, moveDeal, isStuck } from "@/domain/deals";
import { logActivity } from "@/domain/activities";
import { setDiscount, decideApproval } from "@/domain/approvals";
import { statement, splitNet, toCsv } from "@/domain/revenue";
import type { ScanResult } from "@/signals/scan";

// Runs against a real Postgres with the committed migrations applied (TEST_DATABASE_URL).
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite("domain on Postgres", () => {
  let db: PrismaClient;
  let pool: Pool;
  let orgId: string;
  let founder: { id: string; role: "FOUNDER" };
  let sales: { id: string; role: "SALES" };
  let director: { id: string; role: "DIRECTOR" };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
    const org = await db.organization.create({ data: { name: `Test ${Date.now()}` } });
    orgId = org.id;
    const mk = async (role: "FOUNDER" | "SALES" | "DIRECTOR") =>
      db.user.create({ data: { orgId, role, name: role, email: `${role.toLowerCase()}-${Date.now()}@t.in` } });
    founder = { id: (await mk("FOUNDER")).id, role: "FOUNDER" };
    sales = { id: (await mk("SALES")).id, role: "SALES" };
    director = { id: (await mk("DIRECTOR")).id, role: "DIRECTOR" };
  });
  afterAll(async () => { await db.$disconnect(); await pool.end(); });

  it("adds an account once per domain and scores a saved scan", async () => {
    const a = await upsertAccount(db, orgId, { domain: "https://www.Acme-Tools.co.in/contact", city: "Chennai", industry: "Manufacturing", staffSize: 80 });
    expect(a.created).toBe(true);
    expect(a.account.domain).toBe("acme-tools.co.in");
    expect(a.account.name).toBe("Acme Tools");
    const again = await upsertAccount(db, orgId, { domain: "acme-tools.co.in" });
    expect(again.created).toBe(false);
    const scan: ScanResult = {
      domain: "acme-tools.co.in", scannedAt: new Date().toISOString(), pagesScanned: ["https://acme-tools.co.in/"], mx: [],
      signals: [
        { ruleId: "sells-no-cart", category: "NEED", serviceLine: "E-commerce", weight: 15, label: "x", evidence: "home page" },
        { ruleId: "no-mobile", category: "NEED", serviceLine: "Custom app", weight: 10, label: "x", evidence: "no viewport" },
        { ruleId: "mx-google", category: "STACK", serviceLine: "", weight: 2, label: "Email: Google Workspace", evidence: "MX" },
      ],
      need: { score: 27, label: "Medium", stack: [], serviceHints: [], strongIntent: false },
    };
    const scored = await saveScan(db, a.account, scan);
    expect(scored.needScore).toBe(27);
    expect(scored.needLabel).toBe("Medium");
    expect(scored.stack).toEqual(["Google Workspace"]);
    expect(scored.serviceHint).toBe("E-commerce");
    expect(scored.fitScore).toBe(75); // city + staff + industry
    expect(scored.priority).toBe(Math.round((27 * 75) / 100));
    // A referral adds need, fit and the strong-intent boost; a re-scan keeps manual signals.
    const withRef = await addManualSignal(db, a.account.id, "referral", "Ravi at TN Chamber", sales.id);
    expect(withRef.needScore).toBe(52);
    expect(withRef.fitScore).toBe(85);
    expect(withRef.priority).toBe(Math.round((52 * 85) / 100) + 15);
    const rescanned = await saveScan(db, a.account, { ...scan, signals: [] });
    expect(rescanned.needScore).toBe(25);
    expect(await db.signal.count({ where: { accountId: a.account.id } })).toBe(1);
  });

  it("imports CSV rows, merging by domain then phone", async () => {
    expect(normalisePhone("+91 98400 12345")).toBe("9840012345");
    const csv = [
      "Company,Website,City,Employees,Company Phone,First Name,Title,Email",
      'Sri Murugan Traders,murugantraders.in,Chennai,"11-50",044 2434 5678,Senthil,Owner,senthil@murugantraders.in',
      "Sri Murugan Traders,www.murugantraders.in,Chennai,,,Priya,Accounts,priya@murugantraders.in",
      "Same phone different site,,Chennai,,+91 44 2434 5678,Kumar,,",
      "No data,,,,,,,",
      "Acme again,acme-tools.co.in,Chennai,,,,,",
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(6);
    const mapping = guessMapping(rows[0]);
    expect(mapping).toMatchObject({ name: 0, domain: 1, city: 2, staffSize: 3, phone: 4, contactName: 5, contactTitle: 6, contactEmail: 7 });
    const res = await importRows(db, orgId, rows, mapping, { sourceName: "fair.csv", ownerId: sales.id });
    expect(res.created).toBe(1);
    expect(res.merged).toBe(1); // acme-tools already existed; phone match merges into murugan
    expect(res.contactsAdded).toBe(3);
    expect(res.skipped).toEqual([]);
    expect(res.candidates).toBe(1); // "No data" has a name but no website: goes to the review list
    const m = await db.account.findUniqueOrThrow({ where: { orgId_domain: { orgId, domain: "murugantraders.in" } }, include: { contacts: true } });
    expect(m.staffSize).toBe(11);
    expect(m.source).toBe("csv:fair.csv");
    expect(m.contacts.map((c) => c.name).sort()).toEqual(["Kumar", "Priya", "Senthil"]);
    // Re-importing the same file adds nothing new.
    const again = await importRows(db, orgId, rows, mapping, { sourceName: "fair.csv" });
    expect(again.created).toBe(0);
    expect(again.contactsAdded).toBe(0);
    expect(again.candidates).toBe(0);
    // A company register file: inactive companies skipped, no-website companies queued once by CIN.
    const reg = parseCsv([
      "CORPORATE_IDENTIFICATION_NUMBER,COMPANY_NAME,COMPANY_STATUS,REGISTERED_STATE",
      "U72900TN2024PTC123456,Kaveri Tech Solutions Private Limited,Active,Tamil Nadu",
      "U17110TN2019PTC654321,Old Mills Private Limited,Strike Off,Tamil Nadu",
    ].join("\n"));
    const regMap = guessMapping(reg[0]);
    expect(regMap).toMatchObject({ externalId: 0, name: 1, status: 2 });
    const regRes = await importRows(db, orgId, reg, regMap, { sourceName: "mca.csv" });
    expect(regRes.candidates).toBe(1);
    expect(regRes.skipped).toEqual([{ line: 3, reason: "Status: Strike Off" }]);
    const c = await db.leadCandidate.findFirstOrThrow({ where: { orgId, externalId: "U72900TN2024PTC123456" } });
    expect(c.name).toBe("Kaveri Tech Solutions Private Limited");
  });

  it("enforces exit rules stage by stage", async () => {
    const { account } = await upsertAccount(db, orgId, { domain: "pipeline-test.in" });
    const deal = await db.deal.create({ data: { orgId, accountId: account.id, title: "ERP", serviceLine: "ERP", ownerId: sales.id } });
    let d = await loadDeal(db, deal.id);
    expect(checkMove(d, "OUTREACH", "SALES").gaps).toEqual(["Add at least one contact to the account"]);
    expect(checkMove(d, "DISCOVERY", "SALES").gaps[0]).toMatch(/one stage at a time/);
    const contact = await db.contact.create({ data: { orgId, accountId: account.id, name: "Anand", title: "MD", consentSource: "test" } });
    expect((await moveDeal(db, deal.id, "OUTREACH", sales)).ok).toBe(true);
    // Calls and meetings need a dated next step.
    await expect(logActivity(db, { orgId, userId: sales.id, accountId: account.id, dealId: deal.id, type: "CALL", outcome: "Connected" })).rejects.toThrow(/next step/);
    await logActivity(db, {
      orgId, userId: sales.id, accountId: account.id, dealId: deal.id, contactId: contact.id, type: "MEETING", outcome: "Meeting booked",
      nextStep: "Discovery call", nextStepAt: new Date(Date.now() + 86_400_000),
    });
    expect(await db.task.count({ where: { ownerId: sales.id, entityId: deal.id } })).toBe(1);
    expect((await moveDeal(db, deal.id, "DISCOVERY", sales)).ok).toBe(true);
    d = await loadDeal(db, deal.id);
    expect(checkMove(d, "PROTOTYPE_DEMO", "SALES").gaps).toEqual(["Record the client's pain", "Record the confirmed budget"]);
    await db.deal.update({ where: { id: deal.id }, data: { pain: "Stock in Excel", budgetInr: 400000 } });
    expect((await moveDeal(db, deal.id, "PROTOTYPE_DEMO", sales)).ok).toBe(true);
    await db.deal.update({ where: { id: deal.id }, data: { championContactId: contact.id } });
    await logActivity(db, { orgId, userId: sales.id, accountId: account.id, dealId: deal.id, type: "MEETING", outcome: "Connected", nextStep: "Send MOU", nextStepAt: new Date() });
    const blocked = await moveDeal(db, deal.id, "MOU_SCOPING", sales);
    expect(blocked.ok).toBe(false);
    expect(blocked.gaps).toContain("Only the Director or Founder can move a deal into contract stages");
    expect((await moveDeal(db, deal.id, "MOU_SCOPING", director)).ok).toBe(true);
    await db.document.create({ data: { orgId, dealId: deal.id, kind: "MOU", status: "SIGNED" } });
    expect((await moveDeal(db, deal.id, "MSA_SOW", director)).ok).toBe(true);

    // Discount above the limit: Director's request waits for the Founder.
    const req = await setDiscount(db, deal.id, 18, "Two-module bundle", director);
    expect(req.applied).toBe(false);
    await db.document.create({ data: { orgId, dealId: deal.id, kind: "MSA", status: "SIGNED" } });
    await db.deal.update({ where: { id: deal.id }, data: { valueInr: 900000 } });
    expect((await moveDeal(db, deal.id, "ONBOARD", director)).gaps).toContain("Wait for the pending founder approval");
    await expect(decideApproval(db, req.applied ? "" : req.approvalId, true, "", director)).rejects.toThrow(/Founder/);
    await decideApproval(db, req.applied ? "" : req.approvalId, true, "OK for first client", founder);
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).discountPct).toBe(18);
    expect((await moveDeal(db, deal.id, "ONBOARD", director)).ok).toBe(true);
    expect((await moveDeal(db, deal.id, "LOST", sales)).gaps).toEqual(["Give a reason for losing the deal"]);
    expect((await moveDeal(db, deal.id, "MSA_SOW", sales)).ok).toBe(true); // backward is always allowed
    expect(await db.activity.count({ where: { dealId: deal.id, type: "STAGE_CHANGE" } })).toBe(7);

    const now = new Date();
    expect(isStuck({ stage: "OUTREACH", stageChangedAt: new Date(now.getTime() - 20 * 86_400_000), nextStepAt: now }, now)).toMatch(/20 days/);
    expect(isStuck({ stage: "OUTREACH", stageChangedAt: now, nextStepAt: null }, now)).toBe("No next step");
    expect(isStuck({ stage: "RENEW_EXPAND", stageChangedAt: new Date(0), nextStepAt: null }, now)).toBeNull();
  });

  it("builds the monthly Net Revenue statement from India-originated collections", async () => {
    expect(splitNet(1_000_000)).toEqual({
      usFeeInr: 600000, royaltyInr: 200000, platformInr: 250000, servicesInr: 150000, indiaShareInr: 400000, devReserveInr: 60000, indiaNetInr: 340000,
    });
    const { account } = await upsertAccount(db, orgId, { domain: "revenue-test.in", name: "Kovai Pumps" });
    const india = await db.deal.create({ data: { orgId, accountId: account.id, title: "Kovai ERP", serviceLine: "ERP", indiaOriginated: true } });
    const us = await db.deal.create({ data: { orgId, accountId: account.id, title: "US referral", serviceLine: "CRM", indiaOriginated: false } });
    const ist = (s: string) => new Date(`${s}+05:30`);
    await db.invoice.createMany({
      data: [
        { orgId, dealId: india.id, number: "AIIPL/26-27/001", issuedAt: ist("2026-10-28T10:00:00"), amountInr: 300000, gstInr: 54000, collectedInr: 300000, collectedAt: ist("2026-11-03T10:00:00") },
        { orgId, dealId: india.id, number: "AIIPL/26-27/002", issuedAt: ist("2026-11-01T00:10:00"), amountInr: 200000, gstInr: 36000, collectedInr: 0 },
        { orgId, dealId: us.id, number: "AIIPL/26-27/003", issuedAt: ist("2026-11-05T10:00:00"), amountInr: 999999, collectedInr: 999999, collectedAt: ist("2026-11-05T12:00:00") },
      ],
    });
    const nov = await statement(db, orgId, "2026-11");
    expect(nov.lines).toHaveLength(1);
    expect(nov.invoicedInr).toBe(200000); // only invoice 002 was issued in November
    expect(nov.netRevenueInr).toBe(300000); // invoice 001 was collected in November
    expect(nov.usFeeInr).toBe(180000);
    expect(nov.devReserveInr).toBe(18000);
    const oct = await statement(db, orgId, "2026-10");
    expect(oct.invoicedInr).toBe(300000);
    expect(oct.netRevenueInr).toBe(0);
    expect(toCsv(nov)).toContain("Net Revenue (collected),300000");
  });
});
