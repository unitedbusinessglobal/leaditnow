import type { PrismaClient } from "@prisma/client";
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
  const res: ImportResult = { created: 0, merged: 0, contactsAdded: 0, skipped: [], accountIds: [] };
  const body = opts.hasHeader === false ? rows : rows.slice(1);
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i++) {
    const line = i + (opts.hasHeader === false ? 1 : 2);
    const r: Partial<Record<Field, string>> = {};
    for (const [f, idx] of Object.entries(mapping)) if (idx != null && idx >= 0) r[f as Field] = (body[i][idx] ?? "").trim();
    const domain = domainFrom(r);
    const phone = normalisePhone(r.phone || r.contactPhone);
    if (!domain && !phone) { res.skipped.push({ line, reason: "No website domain or phone" }); continue; }

    let account = domain ? await db.account.findUnique({ where: { orgId_domain: { orgId, domain } } }) : null;
    if (!account && phone) account = await db.account.findFirst({ where: { orgId, phone } });
    let created = false;
    if (!account) {
      if (!domain) { res.skipped.push({ line, reason: "Phone only: add a website domain to create the account" }); continue; }
      const up = await upsertAccount(db, orgId, {
        domain, name: r.name, city: r.city, industry: r.industry, staffSize: staff(r.staffSize), phone: r.phone || r.contactPhone,
        ownerId: opts.ownerId, source: `csv:${opts.sourceName}`, sourceNote: `Imported from ${opts.sourceName}`,
      });
      account = up.account;
      created = up.created;
    } else {
      // Fill gaps only; never overwrite what the team already entered.
      await db.account.update({
        where: { id: account.id },
        data: {
          city: account.city ?? (r.city || null),
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
