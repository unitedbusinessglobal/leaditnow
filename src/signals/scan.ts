import { lookupDns, matchDns } from "./dns";
import { scanWebsite } from "./web";
import { needScore, type NeedScore } from "./score";
import type { SignalMatch } from "./rules";

export interface ScanResult {
  domain: string;
  scannedAt: string;
  pagesScanned: string[];
  /** Raw MX hosts found, shown so a BA can check the email-provider call. */
  mx: string[];
  /** Business emails and phones published on the website. */
  contacts?: import("./contacts").FoundContact[];
  signals: SignalMatch[];
  need: NeedScore;
}

/** Normalise "https://www.Example.co.in/contact" to "example.co.in". */
export function normaliseDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split("/")[0].split("?")[0].split(":")[0];
  if (d.startsWith("www.")) d = d.slice(4);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error(`Not a valid domain: ${input}`);
  return d;
}

/** Run DNS and website checks in parallel and score the result. */
export async function scanDomain(input: string): Promise<ScanResult> {
  const domain = normaliseDomain(input);
  const [records, web] = await Promise.all([lookupDns(domain), scanWebsite(domain)]);
  const signals = [...matchDns(records), ...web.matches];
  return {
    domain,
    scannedAt: new Date().toISOString(),
    pagesScanned: web.pagesScanned,
    mx: records.mx,
    contacts: web.contacts,
    signals,
    need: needScore(signals),
  };
}
