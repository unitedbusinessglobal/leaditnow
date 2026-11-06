import rulesFile from "./signals.json";

export type SignalSource = "dns-mx" | "dns-txt" | "html" | "manual";
export type SignalCategory = "NEED" | "STACK";
export type RuleKind = "present" | "absent" | "check" | "manual";

export interface SignalRule {
  id: string;
  category: SignalCategory;
  kind: RuleKind;
  source: SignalSource;
  pattern: string;
  serviceLine: string;
  weight: number;
  label: string;
}

/** A rule that fired, with the evidence behind it. */
export interface SignalMatch {
  ruleId: string;
  category: SignalCategory;
  serviceLine: string;
  weight: number;
  label: string;
  /** The DNS record or page URL (plus the matched text or reason). */
  evidence: string;
}

export const RULES: SignalRule[] = (rulesFile.rules as SignalRule[]).map((r) => ({ ...r }));

export function rule(id: string): SignalRule {
  const r = RULES.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown rule ${id}`);
  return r;
}

export function toMatch(r: SignalRule, evidence: string): SignalMatch {
  return { ruleId: r.id, category: r.category, serviceLine: r.serviceLine, weight: r.weight, label: r.label, evidence };
}

/**
 * "present" rules for one source: each rule fires at most once, the first matching value is the evidence.
 */
export function matchPresent(source: SignalSource, values: { text: string; where: string }[]): SignalMatch[] {
  const out: SignalMatch[] = [];
  for (const r of RULES.filter((x) => x.source === source && x.kind === "present")) {
    const re = new RegExp(r.pattern, "i");
    for (const v of values) {
      const m = re.exec(v.text);
      if (m) {
        out.push(toMatch(r, `${v.where}: ${m[0]}`));
        break;
      }
    }
  }
  return out;
}

/** "absent" rules: fire when the pattern is missing from the given page (normally the home page). */
export function matchAbsent(page: { text: string; where: string }): SignalMatch[] {
  return RULES.filter((x) => x.source === "html" && x.kind === "absent")
    .filter((r) => !new RegExp(r.pattern, "i").test(page.text))
    .map((r) => toMatch(r, `${page.where}: not found`));
}

/** A signal the team enters by hand: a referral, job post or growth news. */
export function manualSignal(ruleId: "referral" | "job-post-it" | "growth-news", evidence: string): SignalMatch {
  const r = rule(ruleId);
  if (r.kind !== "manual") throw new Error(`${ruleId} is not a manual rule`);
  return toMatch(r, evidence);
}
