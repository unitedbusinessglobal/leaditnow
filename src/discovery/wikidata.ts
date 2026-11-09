import { UA, type Fetch, type Found, type SearchInput } from "./types";
import { market } from "./markets";

/** Businesses headquartered in the city (Wikidata, CC0) that list an official website. Mostly larger firms. */
export function wikidataQuery(i: SearchInput): string {
  const city = i.city.replace(/["\\]/g, "");
  const kw = i.keywords?.trim() ? `FILTER(CONTAINS(LCASE(?itemLabel), "${i.keywords.trim().toLowerCase().replace(/["\\]/g, "")}"))` : "";
  return `SELECT ?item ?itemLabel ?website ?employees ?industryLabel WHERE {
  ?city rdfs:label "${city}"@en; wdt:P17 wd:${market(i.country).wikidata}.
  ?item wdt:P159 ?city; wdt:P856 ?website.
  ?item wdt:P31/wdt:P279* wd:Q4830453.
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wdt:P1128 ?employees }
  OPTIONAL { ?item wdt:P452 ?industry }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  ${kw}
} LIMIT ${Math.min(i.limit ?? 200, 500)}`;
}

/** Wikidata industry labels that fit each target industry (companies with no industry are kept). */
const INDUSTRY_WORDS: Record<string, RegExp> = {
  "Manufacturing": /manufactur|automotive|engineering|steel|metal|machinery|chemical|cement|electrical|textile|rubber|plastic/i,
  "Textiles and garments": /textile|garment|apparel|cloth|fashion|yarn|cotton/i,
  "Engineering and auto components": /automotive|auto|engineering|machinery|vehicle|tyre|tire|component/i,
  "Retail and distribution": /retail|wholesale|distribut|trade|supermarket|jewel/i,
  "Healthcare and clinics": /health|hospital|pharma|medic|clinic|diagnos/i,
  "Education and training": /educat|school|training|universit|college/i,
  "Hotels and restaurants": /hotel|hospitality|restaurant|food service|tourism/i,
  "Logistics and transport": /logistic|transport|shipping|courier|freight|aviation|airline|port/i,
  "Real estate and construction": /real estate|construction|housing|infrastructure|property/i,
  "Professional services": /consult|account|legal|law|financ|insurance|bank|advis/i,
  "IT and software": /software|information technology|\bit\b|computer|internet|telecom|electronic|technology/i,
  "Food processing": /food|beverage|dairy|bakery|agri|tea|coffee|spice/i,
};

interface Binding { item: { value: string }; itemLabel?: { value: string }; website?: { value: string }; employees?: { value: string }; industryLabel?: { value: string } }

export function parseWikidata(json: { results?: { bindings?: Binding[] } }, i: SearchInput): Found[] {
  const byId = new Map<string, Found>();
  for (const b of json.results?.bindings ?? []) {
    const id = b.item.value.split("/").pop()!;
    const name = b.itemLabel?.value ?? id;
    if (/^Q\d+$/.test(name)) continue; // no English label
    const label = b.industryLabel?.value;
    const words = INDUSTRY_WORDS[i.industry];
    // Keep only companies whose Wikidata industry fits (drops parties, newspapers, societies without one).
    if (words && !(label && words.test(label)) && !byId.has(id)) continue;
    const prev = byId.get(id);
    const staff = b.employees ? Math.round(Number(b.employees.value)) : null;
    if (prev) { prev.staffSize = prev.staffSize ?? staff; continue; }
    byId.set(id, {
      source: "wikidata", externalId: id, name, website: b.website?.value ?? null, city: i.city, country: market(i.country).code,
      industry: b.industryLabel?.value ?? i.industry, staffSize: staff,
    });
  }
  return [...byId.values()];
}

export async function searchWikidata(i: SearchInput, f: Fetch = fetch): Promise<Found[]> {
  const res = await f(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(wikidataQuery(i))}`, {
    headers: { accept: "application/sparql-results+json", "user-agent": UA },
  });
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
  return parseWikidata(await res.json(), i);
}
