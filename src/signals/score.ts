import { TARGET_CITIES } from "@/discovery/markets";
import type { SignalMatch } from "./rules";

export type NeedLabel = "High" | "Medium" | "Low" | "None";

export interface NeedScore {
  score: number; // 0-100
  label: NeedLabel;
  /** Technology already in use (context for the BA, never used in outreach). */
  stack: string[];
  /** Likely service lines, strongest first. */
  serviceHints: string[];
  /** Referral or job-post signal present: boosts priority. */
  strongIntent: boolean;
}

const STACK_CAP = 5;

/** Need score = distinct NEED weights + at most 5 for STACK signals, capped at 100. */
export function needScore(matches: SignalMatch[]): NeedScore {
  const byRule = new Map<string, SignalMatch>();
  for (const m of matches) if (!byRule.has(m.ruleId)) byRule.set(m.ruleId, m);
  const distinct = [...byRule.values()];
  const need = distinct.filter((m) => m.category === "NEED").sort((a, b) => b.weight - a.weight);
  const stack = distinct.filter((m) => m.category === "STACK");

  const needPoints = need.reduce((s, m) => s + m.weight, 0);
  const stackPoints = Math.min(STACK_CAP, stack.reduce((s, m) => s + m.weight, 0));
  const score = Math.min(100, needPoints + stackPoints);
  const label: NeedLabel = needPoints === 0 ? "None" : score >= 40 ? "High" : score >= 20 ? "Medium" : "Low";

  return {
    score,
    label,
    stack: stack.map((m) => m.label.replace(/^[^:]+:\s*/, "")).sort(),
    serviceHints: [...new Set(need.map((m) => m.serviceLine).filter((s) => s && s !== "Stated"))],
    strongIntent: need.some((m) => m.ruleId === "referral" || m.ruleId === "job-post-it"),
  };
}

export interface FitInput {
  city?: string | null;
  staffSize?: number | null;
  industry?: string | null;
  decisionMakerFound?: boolean;
  referral?: boolean;
}

const TARGET_INDUSTRIES = [
  "manufactur",
  "distribut",
  "trading",
  "retail",
  "commerce",
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
  if (f.staffSize != null && f.staffSize >= 10 && f.staffSize <= 500) s += 25;
  if (f.industry && TARGET_INDUSTRIES.some((i) => f.industry!.toLowerCase().includes(i))) s += 25;
  if (f.decisionMakerFound) s += 15;
  if (f.referral) s += 10;
  return s;
}

/** Priority = need x fit / 100, plus 15 when a referral or job post shows strong intent. */
export function priority(need: NeedScore, fit: number): number {
  return Math.round((need.score * fit) / 100) + (need.strongIntent ? 15 : 0);
}
