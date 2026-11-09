import type { PrismaClient } from "@prisma/client";
import { isMarket, guessCountry } from "@/discovery/markets";
import { normaliseDomain } from "@/signals/scan";
import { normalisePhone, upsertAccount } from "./accounts";
import type { Field, ImportResult } from "./csv-parse";

export { parseCsv, guessMapping, type Field, type ImportResult } from "./csv-parse";

function domainFrom(row: Partial<Record<Field, string>>): string | null {
  const candidates = [row.domain, row.contactEmail?.split("@")[1]];
  for (const c of candidates) {
    if (!c) continue;
    const d = c.trim();
    if (/^(gmail|yahoo|hotmail|outlook|rediffmail|live|icloud)\./i.test(d)) continue;
    try { return normaliseDomain(d); } catch { /* not a domain */ }
  }
  return null;
}

/** Rupee amounts: "1,00,000", "₹ 5 lakh", "2.5 crore", "500000.00". */
export function rupees(v?: string): number | null {
  if (!v?.trim()) return null;
  const s = v.toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(lakh|lac|lakhs|crore|cr|crores)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2]?.startsWith("l") ? 1e5 : m[2]?.startsWith("c") ? 1e7 : 1);
  return Number.isFinite(n) ? n : null;
}

function yesListed(v?: string): boolean | null {
  if (!v?.trim()) return null;
  if (/^(unlisted|no|n|false)$/i.test(v.trim())) return false;
  if (/^(listed|yes|y|true)$/i.test(v.trim())) return true;
  return null;
}

/** Register and finance columns, kept on the account (or carried by a review item). */
function registerDetails(r: Partial<Record<Field, string>>) {
  const d = {
    cin: r.externalId && /^[ULF]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i.test(r.externalId) ? r.externalId.toUpperCase() : null,
    paidUpCapitalInr: rupees(r.paidUpCapital),
    listed: yesListed(r.listed),
    companyClass: r.companyClass?.trim() || null,
    revenueInr: rupees(r.revenue),
  };
  return Object.values(d).some((x) => x != null) ? d : null;
}

function staff(v?: string): number | null {
  if (!v) return null;
  const nums = v.replace(/,/g, "").match(/\d+/g);
  if (!nums) return null;
  // "11-50" -> 50 would overstate; use the lower bound of a range.
  return Number(nums[0]);
}

/**
 * Import rows: one account per domain (or per phone when there is no usable domain),
 * merging into existing accounts by domain first, then by phone. The source is kept for DPDP.
 */
export async function importRows(
  db: PrismaClient,
  orgId: string,
  rows: string[][],
  mapping: Partial<Record<Field, number>>,
  opts: { sourceName: string; ownerId?: string | null; hasHeader?: boolean },
): Promise<ImportResult> {
  const res: ImportResult = { created: 0, merged: 0, contactsAdded: 0, candidates: 0, skipped: [], accountIds: [] };
  const body = opts.hasHeader === false ? rows : rows.slice(1);
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    const line = i + (opts.hasHeader === false ? 1 : 2);
    const r: Partial<Record<Field, string>> = {};
    for (const [f, idx] of Object.entries(mapping)) if (idx != null && idx >= 0) r[f as Field] = (body[i][idx] ?? "").trim();
    if (r.status && !/^(active|live|activ)/i.test(r.status)) { res.skipped.push({ line, reason: `Status: ${r.status}` }); continue; }
    const domain = domainFrom(r);
    // Country: a two-letter code, a country name ("United Arab Emirates", "UK"), or worked out from the city.
    const cc = (r.country && (isMarket(r.country) ? r.country.toUpperCase() : guessCountry(r.country))) || guessCountry(r.city) || null;
    const country = cc && cc !== "IN" ? cc : null;
    const phone = normalisePhone(r.phone || r.contactPhone, country);
    if (!domain && !phone && !r.name) { res.skipped.push({ line, reason: "No company name, website or phone" }); continue; }

    let account = domain ? await db.account.findUnique({ where: { orgId_domain: { orgId, domain } } }) : null;
    if (!account && phone) account = await db.account.findFirst({ where: { orgId, phone } });
    let created = false;
    if (!account) {
      if (!domain) {
        // No website yet: queue it for the team to find the site (register files, directories).
        if (!r.name) { res.skipped.push({ line, reason: "Phone only, no company name" }); continue; }
        const source = `csv:${opts.sourceName}`;
        const externalId = r.externalId || `${r.name.toLowerCase()}|${phone ?? r.city ?? ""}`;
        const existing = await db.leadCandidate.findUnique({ where: { orgId_source_externalId: { orgId, source, externalId } } });
        if (!existing) {
          await db.leadCandidate.create({
            data: {
              extra: registerDetails(r) ?? undefined,
              orgId, source, externalId, name: r.name, city: r.city || null, country, phone: r.phone || r.contactPhone || null,
              industry: r.industry || null, staffSize: staff(r.staffSize), note: `Imported from ${opts.sourceName}${r.externalId ? ` (${r.externalId})` : ""}`,
            },
          });
          res.candidates++;
        }
        continue;
      }
      const up = await upsertAccount(db, orgId, {
        domain, name: r.name, city: r.city, country, industry: r.industry, staffSize: staff(r.staffSize), phone: r.phone || r.contactPhone,
        ownerId: opts.ownerId, source: `csv:${opts.sourceName}`, sourceNote: `Imported from ${opts.sourceName}`,
      });
      account = up.account;
      created = up.created;
      const reg = registerDetails(r);
      if (reg) {
        account = await db.account.update({
          where: { id: account.id },
          data: {
            cin: reg.cin, paidUpCapitalInr: reg.paidUpCapitalInr, listed: reg.listed, companyClass: reg.companyClass,
            ...(reg.revenueInr ? { revenueInr: reg.revenueInr, revenueSource: "manual" } : {}),
          },
        });
      }
    } else {
      // Fill gaps only; never overwrite what the team already entered.
      await db.account.update({
        where: { id: account.id },
        data: {
          city: account.city ?? (r.city || null),
          country: account.country ?? country,
          industry: account.industry ?? (r.industry || null),
          staffSize: account.staffSize ?? staff(r.staffSize),
          phone: account.phone ?? phone,
        },
      });
    }
    const key = account.id;
    if (created) res.created++;
    else if (!seen.has(key)) res.merged++;
    seen.add(key);
    if (!res.accountIds.includes(account.id)) res.accountIds.push(account.id);

    if (r.contactName || r.contactEmail) {
      const email = r.contactEmail?.toLowerCase() || null;
      const dup = email
        ? await db.contact.findFirst({ where: { accountId: account.id, email } })
        : await db.contact.findFirst({ where: { accountId: account.id, name: r.contactName } });
      if (!dup) {
        await db.contact.create({
          data: {
            orgId, accountId: account.id, name: r.contactName || email!.split("@")[0], title: r.contactTitle || null,
            email, phone: r.contactPhone || null, consentSource: `Imported from ${opts.sourceName}`,
          },
        });
        res.contactsAdded++;
      }
    }
  }
  return res;
}
