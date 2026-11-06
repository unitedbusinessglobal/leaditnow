// Pure CSV helpers: safe to use in the browser.

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

export interface ImportResult {
  created: number;
  merged: number;
  contactsAdded: number;
  skipped: { line: number; reason: string }[];
  accountIds: string[];
}
