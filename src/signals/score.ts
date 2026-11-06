import type { SignalMatch } from "./rules";

export type ZohoLabel = "Confirmed" | "Likely" | "Possible" | "None";

export interface ZohoScore {
  score: number; // 0-100
  label: ZohoLabel;
  /** Distinct Zoho apps detected; 4 or more suggests Zoho One. */
  apps: string[];
  likelyZohoOne: boolean;
  customNeed: boolean;
}

/** Zoho score = sum of weights of distinct rules matched, capped at 100. */
export function zohoScore(matches: SignalMatch[]): ZohoScore {
  const byRule = new Map<string, SignalMatch>();
  for (const m of matches) if (!byRule.has(m.ruleId)) byRule.set(m.ruleId, m);
  const distinct = [...byRule.values()];

  const score = Math.min(100, distinct.reduce((sum, m) => sum + m.weight, 0));
  const hasVerified = distinct.some((m) => m.verified);
  const label: ZohoLabel =
    score === 0 ? "None" : score >= 40 && hasVerified ? "Confirmed" : score >= 20 ? "Likely" : "Possible";

  const apps = [...new Set(distinct.map((m) => m.zohoApp).filter((a) => a !== "Stated"))].sort();
  return {
    score,
    label,
    apps,
    likelyZohoOne: apps.length >= 4,
    customNeed: distinct.some((m) => m.customNeed),
  };
}

export interface FitInput {
  city?: string | null;
  staffSize?: number | null;
  industry?: string | null;
  decisionMakerFound?: boolean;
  referral?: boolean;
}

const TARGET_CITIES = ["chennai", "coimbatore", "tirupur", "tiruppur", "madurai"];
const TARGET_INDUSTRIES = [
  "manufacturing",
  "distribution",
  "trading",
  "agri",
  "clinic",
  "diagnostic",
  "education",
  "school",
  "coaching",
  "logistics",
];

/** Fit score against the ideal customer profile (India center plan), 0-100. */
export function fitScore(f: FitInput): number {
  let s = 0;
  if (f.city && TARGET_CITIES.some((c) => f.city!.toLowerCase().includes(c))) s += 25;
  if (f.staffSize != null && f.staffSize >= 10 && f.staffSize <= 200) s += 25;
  if (f.industry && TARGET_INDUSTRIES.some((i) => f.industry!.toLowerCase().includes(i))) s += 25;
  if (f.decisionMakerFound) s += 15;
  if (f.referral) s += 10;
  return s;
}

/** Priority = Zoho score x fit score / 100, plus 15 when the custom-need flag is set. */
export function priority(zoho: ZohoScore, fit: number): number {
  return Math.round((zoho.score * fit) / 100) + (zoho.customNeed ? 15 : 0);
}
