import { UA, type Fetch, type Found, type SearchInput } from "./types";

/** Businesses headquartered in the city (Wikidata, CC0) that list an official website. Mostly larger firms. */
export function wikidataQuery(i: SearchInput): string {
  const city = i.city.replace(/["\\]/g, "");
  const kw = i.keywords?.trim() ? `FILTER(CONTAINS(LCASE(?itemLabel), "${i.keywords.trim().toLowerCase().replace(/["\\]/g, "")}"))` : "";
  return `SELECT ?item ?itemLabel ?website ?employees ?industryLabel WHERE {
  ?city rdfs:label "${city}"@en; wdt:P17 wd:Q668.
  ?item wdt:P159 ?city; wdt:P856 ?website.
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wdt:P1128 ?employees }
  OPTIONAL { ?item wdt:P452 ?industry }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  ${kw}
} LIMIT ${Math.min(i.limit ?? 200, 500)}`;
}

interface Binding { item: { value: string }; itemLabel?: { value: string }; website?: { value: string }; employees?: { value: string }; industryLabel?: { value: string } }

export function parseWikidata(json: { results?: { bindings?: Binding[] } }, i: SearchInput): Found[] {
  const byId = new Map<string, Found>();
  for (const b of json.results?.bindings ?? []) {
    const id = b.item.value.split("/").pop()!;
    const name = b.itemLabel?.value ?? id;
    if (/^Q\d+$/.test(name)) continue; // no English label
    const prev = byId.get(id);
    const staff = b.employees ? Math.round(Number(b.employees.value)) : null;
    if (prev) { prev.staffSize = prev.staffSize ?? staff; continue; }
    byId.set(id, {
      source: "wikidata", externalId: id, name, website: b.website?.value ?? null, city: i.city,
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
