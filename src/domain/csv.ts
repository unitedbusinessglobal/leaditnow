import type { PrismaClient } from "@prisma/client";
import { normaliseDomain } from "@/signals/scan";
import { normalisePhone, upsertAccount } from "./accounts";

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export type Field = "name" | "domain" | "city" | "industry" | "staffSize" | "phone" | "contactName" | "contactTitle" | "contactEmail" | "contactPhone";

/** Header guesses for Apollo, HubSpot and hand-made sheets. */
const HEADER_HINTS: Record<Field, RegExp> = {
  domain: /^(website|domain|company domain|company website|url|web)/i,
  name: /^(company|company name|account|account name|organi[sz]ation|business)( name)?$/i,
  city: /^(city|company city|location|town)$/i,
  industry: /^(industry|sector|category|vertical)$/i,
  staffSize: /(employees|# employees|staff|headcount|company size|number of employees)/i,
  phone: /^(company phone|phone|telephone|office phone|mobile)$/i,
  contactName: /^(contact|contact name|full name|name|first name)$/i,
  contactTitle: /^(title|job title|designation|role)$/i,
  contactEmail: /^(email|e-mail|contact email|work email)$/i,
  contactPhone: /^(contact phone|mobile phone|direct phone|work direct phone)$/i,
};

export function guessMapping(headers: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  const order: Field[] = ["domain", "name", "city", "industry", "staffSize", "contactPhone", "phone", "contactEmail", "contactTitle", "contactName"];
  for (const f of order) {
    const idx = headers.findIndex((h, i) => HEADER_HINTS[f].test(h.trim()) && !Object.values(map).includes(i));
    if (idx >= 0) map[f] = idx;
  }
  return map;
}

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

export interface ImportResult {
  created: number;
  merged: number;
  contactsAdded: number;
  skipped: { line: number; reason: string }[];
  accountIds: string[];
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
