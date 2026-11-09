/**
 * Countries where AInformatIQ markets its services, with their main business cities.
 * India stays the default (accounts with no country are Indian).
 */
export interface Market { code: string; name: string; dial: string; wikidata: string; cities: string[] }

export const MARKETS: Market[] = [
  { code: "IN", name: "India", dial: "91", wikidata: "Q668", cities: ["Chennai", "Coimbatore", "Tiruppur", "Madurai", "Tiruchirappalli", "Salem", "Erode", "Hosur", "Vellore", "Tirunelveli", "Bengaluru", "Hyderabad", "Mumbai", "Pune", "Delhi", "Kochi"] },
  { code: "AE", name: "United Arab Emirates", dial: "971", wikidata: "Q878", cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman"] },
  { code: "SA", name: "Saudi Arabia", dial: "966", wikidata: "Q851", cities: ["Riyadh", "Jeddah", "Dammam", "Khobar"] },
  { code: "QA", name: "Qatar", dial: "974", wikidata: "Q846", cities: ["Doha"] },
  { code: "OM", name: "Oman", dial: "968", wikidata: "Q842", cities: ["Muscat"] },
  { code: "KW", name: "Kuwait", dial: "965", wikidata: "Q817", cities: ["Kuwait City"] },
  { code: "BH", name: "Bahrain", dial: "973", wikidata: "Q398", cities: ["Manama"] },
  { code: "SG", name: "Singapore", dial: "65", wikidata: "Q334", cities: ["Singapore"] },
  { code: "MY", name: "Malaysia", dial: "60", wikidata: "Q833", cities: ["Kuala Lumpur", "Petaling Jaya", "Penang", "Johor Bahru", "Shah Alam"] },
  { code: "GB", name: "United Kingdom", dial: "44", wikidata: "Q145", cities: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Leicester"] },
  { code: "IE", name: "Ireland", dial: "353", wikidata: "Q27", cities: ["Dublin", "Cork"] },
  { code: "US", name: "United States", dial: "1", wikidata: "Q30", cities: ["New York", "Dallas", "Houston", "Chicago", "Atlanta", "San Jose", "Pittsburgh", "Edison", "Austin"] },
  { code: "CA", name: "Canada", dial: "1", wikidata: "Q16", cities: ["Toronto", "Mississauga", "Brampton", "Vancouver", "Calgary", "Montreal"] },
  { code: "AU", name: "Australia", dial: "61", wikidata: "Q408", cities: ["Sydney", "Melbourne", "Brisbane", "Perth"] },
  { code: "NZ", name: "New Zealand", dial: "64", wikidata: "Q664", cities: ["Auckland", "Wellington"] },
  { code: "ZA", name: "South Africa", dial: "27", wikidata: "Q258", cities: ["Johannesburg", "Cape Town", "Durban"] },
  { code: "KE", name: "Kenya", dial: "254", wikidata: "Q114", cities: ["Nairobi"] },
];

export const DEFAULT_COUNTRY = "IN";
const BY_CODE = new Map(MARKETS.map((m) => [m.code, m]));

export function market(code: string | null | undefined): Market {
  return BY_CODE.get((code || DEFAULT_COUNTRY).toUpperCase()) ?? BY_CODE.get(DEFAULT_COUNTRY)!;
}
export const isMarket = (code: string | null | undefined) => !!code && BY_CODE.has(code.toUpperCase());
export const countryName = (code: string | null | undefined) => market(code).name;

/** Every city we market in, lower-case, for the fit score. */
export const TARGET_CITIES = MARKETS.flatMap((m) => m.cities.map((c) => c.toLowerCase())).concat(["tirupur", "bangalore", "trichy"]);

/** Which market a free-text location belongs to ("Dubai" -> AE, "Leeds, UK" -> GB). */
export function guessCountry(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const m of MARKETS) if (t.includes(m.name.toLowerCase())) return m.code;
  const aliases: Record<string, string> = { uae: "AE", uk: "GB", "united kingdom": "GB", england: "GB", scotland: "GB", usa: "US", "u.s.": "US", ksa: "SA" };
  for (const [k, v] of Object.entries(aliases)) if (new RegExp(`\\b${k.replace(".", "\\.")}\\b`).test(t)) return v;
  for (const m of MARKETS) if (m.cities.some((c) => t.includes(c.toLowerCase()))) return m.code;
  return null;
}

/**
 * Phone numbers in international form: "+971 4 123 4567" stays as is (spacing tidied);
 * a national number gets the country's dialling code. Indian numbers keep the +91 98400 12345 layout.
 */
export function normaliseIntlPhone(raw: string | null | undefined, country: string | null | undefined): string | null {
  if (!raw) return null;
  const plus = raw.trim().startsWith("+") || raw.trim().startsWith("00");
  let d = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) d = d.slice(2);
  const m = market(country);
  if (!plus) {
    d = d.replace(/^0+/, "");
    if (m.code === "US" || m.code === "CA") d = d.length === 11 && d.startsWith("1") ? d : `1${d}`;
    else if (!d.startsWith(m.dial) || d.length <= 9) d = `${m.dial}${d}`;
  }
  if (d.length < 8 || d.length > 15) return null;
  if (d.startsWith("91") && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  const dial = MARKETS.map((x) => x.dial).sort((a, b) => b.length - a.length).find((x) => d.startsWith(x)) ?? d.slice(0, 2);
  const rest = d.slice(dial.length);
  if (dial === "1" && rest.length === 10) return `+1 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
  // Groups of four from the right: +44 20 7946 0000, +971 4123 4567, +60 3 1234 5678.
  const groups: string[] = [];
  for (let end = rest.length; end > 0; end -= 4) groups.unshift(rest.slice(Math.max(0, end - 4), end));
  return `+${dial} ${groups.join(" ")}`;
}
