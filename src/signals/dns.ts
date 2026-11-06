import { promises as dns } from "node:dns";
import { matchPresent, type SignalMatch } from "./rules";

export interface DnsRecords {
  mx: string[];
  txt: string[];
}

export async function lookupDns(domain: string): Promise<DnsRecords> {
  const [mx, txt] = await Promise.all([
    dns.resolveMx(domain).then((r) => r.map((x) => x.exchange.toLowerCase())).catch(() => [] as string[]),
    dns.resolveTxt(domain).then((r) => r.map((parts) => parts.join(""))).catch(() => [] as string[]),
  ]);
  return { mx, txt };
}

/** Pure matcher, separated from the network lookup so it can be tested offline. */
export function matchDns(records: DnsRecords): SignalMatch[] {
  return [
    ...matchPresent("dns-mx", records.mx.map((v) => ({ text: v, where: "MX" }))),
    ...matchPresent("dns-txt", records.txt.map((v) => ({ text: v, where: "TXT" }))),
  ];
}

export async function scanDns(domain: string): Promise<SignalMatch[]> {
  return matchDns(await lookupDns(domain));
}
