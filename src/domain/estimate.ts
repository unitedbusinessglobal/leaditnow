import type { Prisma } from "@prisma/client";
import { INDUSTRIES } from "@/discovery/types";

/**
 * IT budget estimate settings. No public source gives a private company's IT spend, so LeadItNow
 * estimates it from revenue (or headcount) using percentages the Founder or Director sets.
 * Defaults are placeholders to be replaced with your own figures.
 */
export interface EstimateSettings {
  itSpendPct: Record<string, number>; // per industry, % of annual revenue
  otherPct: number; // industries not in the list
  usdInr: number; // converts Apollo's USD revenue to rupees
  itPerEmployeeInr: number; // fallback when revenue is unknown; 0 turns the fallback off
}

export const DEFAULT_SETTINGS: EstimateSettings = {
  itSpendPct: Object.fromEntries(INDUSTRIES.map((i) => [i, 2])),
  otherPct: 2,
  usdInr: 88,
  itPerEmployeeInr: 0,
};

export function readSettings(json: Prisma.JsonValue | null | undefined): EstimateSettings {
  const s = (json && typeof json === "object" && !Array.isArray(json) ? json : {}) as Partial<EstimateSettings>;
  return {
    itSpendPct: { ...DEFAULT_SETTINGS.itSpendPct, ...(s.itSpendPct ?? {}) },
    otherPct: typeof s.otherPct === "number" ? s.otherPct : DEFAULT_SETTINGS.otherPct,
    usdInr: typeof s.usdInr === "number" && s.usdInr > 0 ? s.usdInr : DEFAULT_SETTINGS.usdInr,
    itPerEmployeeInr: typeof s.itPerEmployeeInr === "number" ? s.itPerEmployeeInr : DEFAULT_SETTINGS.itPerEmployeeInr,
  };
}

/** Map a free-text industry ("Pump manufacturing") to one of the target industries. */
const HINTS: [string, RegExp][] = [
  ["Textiles and garments", /textile|garment|apparel|cloth|yarn|knit|hosiery|fabric/i],
  ["Engineering and auto components", /auto|engineering|machin|component|foundry|casting|pump|motor|tool/i],
  ["Food processing", /food|bakery|dairy|beverage|spice|rice|oil mill|snack/i],
  ["Healthcare and clinics", /health|hospital|clinic|pharma|diagnos|dental|medical/i],
  ["Education and training", /educat|school|college|training|academy|institute/i],
  ["Hotels and restaurants", /hotel|restaurant|resort|catering|hospitality/i],
  ["Logistics and transport", /logistic|transport|courier|freight|shipping|cargo/i],
  ["Real estate and construction", /real estate|construct|builder|property|architect|infra/i],
  ["Professional services", /account|audit|legal|law|consult|insurance|finance|tax/i],
  ["IT and software", /software|\bit\b|technolog|digital|web|cloud|saas/i],
  ["Retail and distribution", /retail|wholesale|distribut|trading|store|shop|supermarket/i],
  ["Manufacturing", /manufactur|industr|factory|plastic|chemical|steel|metal|rubber|print/i],
];

export function industryBucket(industry: string | null | undefined): string | null {
  if (!industry) return null;
  if (INDUSTRIES.includes(industry)) return industry;
  return HINTS.find(([, re]) => re.test(industry))?.[0] ?? null;
}

export interface EstimateInput {
  industry: string | null;
  revenueInr: number | null;
  staffSize: number | null;
  stack: string[];
  signalIds: string[];
  contactTitles: (string | null)[];
}

export interface Estimate {
  lowInr: number;
  highInr: number;
  basis: "revenue" | "staff";
  pct: number | null;
  notes: string[];
}

const round = (n: number) => (n >= 1e5 ? Math.round(n / 1e4) * 1e4 : Math.round(n / 1e3) * 1e3);

export function estimateItBudget(a: EstimateInput, s: EstimateSettings): Estimate | null {
  const bucket = industryBucket(a.industry);
  const pct = bucket ? s.itSpendPct[bucket] ?? s.otherPct : s.otherPct;
  let base: number;
  let basis: Estimate["basis"];
  const notes: string[] = [];
  if (a.revenueInr && a.revenueInr > 0) {
    base = (a.revenueInr * pct) / 100;
    basis = "revenue";
    notes.push(`${pct}% of revenue (${bucket ?? "other industries"})`);
  } else if (a.staffSize && s.itPerEmployeeInr > 0) {
    base = a.staffSize * s.itPerEmployeeInr;
    basis = "staff";
    notes.push(`${a.staffSize} staff × ₹${s.itPerEmployeeInr.toLocaleString("en-IN")}`);
  } else {
    return null;
  }
  // Evidence that they already spend on IT nudges the band up.
  let m = 1;
  if (a.stack.length >= 3) { m += 0.15; notes.push("uses 3+ business tools (+15%)"); }
  if (a.signalIds.includes("job-post-it")) { m += 0.2; notes.push("hiring for IT (+20%)"); }
  if (a.contactTitles.some((t) => t && /\b(it|cto|cio|technology|systems)\b/i.test(t))) { m += 0.1; notes.push("has an IT lead (+10%)"); }
  return { lowInr: round(base * m * 0.7), highInr: round(base * m * 1.3), basis, pct: basis === "revenue" ? pct : null, notes };
}

/** "₹12.5 lakh" / "₹3.2 crore" for display. */
export function inrShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} crore`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} lakh`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
