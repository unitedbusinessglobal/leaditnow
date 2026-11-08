import { normaliseDomain } from "@/signals/scan";

/** Pages that are not the company's own website: social profiles, marketplaces, link hubs. */
const NOT_OWN_SITE = /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|youtube|wa|whatsapp|indiamart|justdial|tradeindia|exportersindia|sulekha|google|business\.site|linktr|bit|wix|blogspot|wordpress|medium|zomato|swiggy|practo|amazon|flipkart)\.(com|me|ee|ly|in|site|co)$/i;

/** The company's own domain from a listing's website, or null if it has none (or only a social page). */
export function ownDomain(website?: string | null): string | null {
  if (!website?.trim()) return null;
  let d: string;
  try { d = normaliseDomain(website); } catch { return null; }
  if (NOT_OWN_SITE.test(d) || d === "sites.google.com" || d.endsWith(".business.site")) return null;
  return d;
}
