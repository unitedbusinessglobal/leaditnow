import rulesFile from "./signals.json";

export type SignalSource = "dns-mx" | "dns-txt" | "html" | "manual";

export interface SignalRule {
  id: string;
  source: SignalSource;
  pattern: string;
  zohoApp: string;
  weight: number;
  verified: boolean;
  customNeed?: boolean;
  label: string;
}

/** A rule that matched, with the evidence that proves it. */
export interface SignalMatch {
  ruleId: string;
  zohoApp: string;
  weight: number;
  verified: boolean;
  customNeed: boolean;
  label: string;
  /** The DNS record or page URL (plus the matched text) that triggered the rule. */
  evidence: string;
}

export const RULES: SignalRule[] = (rulesFile.rules as SignalRule[]).map((r) => ({ ...r }));

export function rulesFor(source: SignalSource): SignalRule[] {
  return RULES.filter((r) => r.source === source && r.pattern !== "");
}

function toMatch(rule: SignalRule, evidence: string): SignalMatch {
  return {
    ruleId: rule.id,
    zohoApp: rule.zohoApp,
    weight: rule.weight,
    verified: rule.verified,
    customNeed: Boolean(rule.customNeed),
    label: rule.label,
    evidence,
  };
}

/**
 * Match a list of text values (DNS records or page HTML) against the rules for one source.
 * Each rule matches at most once per call; the first matching value is kept as evidence.
 */
export function matchValues(
  source: SignalSource,
  values: { text: string; where: string }[],
): SignalMatch[] {
  const matches: SignalMatch[] = [];
  for (const rule of rulesFor(source)) {
    const re = new RegExp(rule.pattern, "i");
    for (const v of values) {
      const m = re.exec(v.text);
      if (m) {
        matches.push(toMatch(rule, `${v.where}: ${m[0]}`));
        break;
      }
    }
  }
  return matches;
}

/** A signal the team enters by hand, e.g. a job post or a referral. */
export function manualSignal(ruleId: "job-post-zoho" | "referral-zoho", evidence: string): SignalMatch {
  const rule = RULES.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Unknown manual rule ${ruleId}`);
  return toMatch(rule, evidence);
}
