import { UA, type Fetch, type Found, type SearchInput } from "./types";
import { market } from "./markets";

/**
 * OpenStreetMap tag filters per industry. Data © OpenStreetMap contributors, ODbL:
 * stored records keep "OpenStreetMap" as their source for attribution.
 */
const TAGS: Record<string, string[]> = {
  "Manufacturing": ['["industrial"]', '["man_made"="works"]', '["craft"~"metal_construction|carpenter|electronics_repair|printer|sawmill|joiner|tailor"]'],
  "Textiles and garments": ['["shop"~"clothes|fabric|tailor"]', '["craft"~"tailor|textile|dressmaker"]', '["industrial"~"textile|garment"]'],
  "Engineering and auto components": ['["shop"~"car_parts|car_repair|hardware"]', '["industrial"]', '["craft"~"metal_construction|electrician|plumber"]'],
  "Retail and distribution": ['["shop"]', '["office"~"company|wholesale"]'],
  "Healthcare and clinics": ['["amenity"~"hospital|clinic|doctors|dentist|pharmacy"]', '["healthcare"]'],
  "Education and training": ['["amenity"~"school|college|university|training|language_school|driving_school"]', '["office"="educational_institution"]'],
  "Hotels and restaurants": ['["tourism"~"hotel|guest_house|resort"]', '["amenity"~"restaurant|cafe|fast_food"]'],
  "Logistics and transport": ['["office"~"logistics|courier|moving_company"]', '["amenity"="courier"]', '["industrial"~"warehouse|logistics"]'],
  "Real estate and construction": ['["office"~"estate_agent|construction_company|architect"]', '["craft"~"builder|carpenter"]'],
  "Professional services": ['["office"~"accountant|lawyer|tax_advisor|consulting|insurance|financial"]'],
  "IT and software": ['["office"~"it|telecommunication|company"]', '["shop"~"computer|electronics|mobile_phone"]'],
  "Food processing": ['["craft"~"bakery|caterer|confectionery"]', '["industrial"~"food|bakery"]', '["shop"~"bakery|confectionery"]'],
};

export function overpassQuery(i: SearchInput): string {
  const filters = TAGS[i.industry] ?? ['["office"]', '["shop"]', '["craft"]'];
  const name = i.keywords?.trim() ? `["name"~"${i.keywords.trim().replace(/["\\]/g, "")}",i]` : "";
  const city = i.city.replace(/["\\]/g, "");
  const parts = filters.map((t) => `  nwr(area.city)${t}["website"]${name};\n  nwr(area.city)${t}["contact:website"]${name};`).join("\n");
  // The city is looked up inside its country (English or local name), so "Birmingham" means the one in the chosen country.
  const cc = market(i.country).code;
  const area = `area["ISO3166-1"="${cc}"][admin_level=2]->.country;\nrel["boundary"="administrative"][~"^name(:en)?$"~"^${city}$",i](area.country);\nmap_to_area->.city;`;
  return `[out:json][timeout:60];\n${area}\n(\n${parts}\n);\nout center tags ${Math.min(i.limit ?? 150, 300)};`;
}

interface Element { type: string; id: number; tags?: Record<string, string> }

export function parseOverpass(json: { elements?: Element[] }, i: SearchInput): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    if (!t.name) continue;
    const key = `${e.type}/${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ");
    out.push({
      source: "osm", externalId: key, name: t["name:en"] || t.name, website: t.website || t["contact:website"] || null,
      phone: (t.phone || t["contact:phone"] || t["contact:mobile"] || "").split(/[;,]/)[0].trim() || null,
      // Keep the searched (English) city when the map gives it in another script, e.g. Arabic.
      city: t["addr:city:en"] || (t["addr:city"] && /^[\p{Script=Latin}\s.'-]+$/u.test(t["addr:city"]) ? t["addr:city"] : i.city), country: market(i.country).code, address: addr || null, industry: i.industry,
    });
  }
  return out;
}

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** Overpass is busy at times (429/502/504): try the main server, then a mirror. */
export async function searchOsm(i: SearchInput, f: Fetch = fetch): Promise<Found[]> {
  let last = 0;
  for (const url of OVERPASS) {
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
      body: `data=${encodeURIComponent(overpassQuery(i))}`,
    });
    if (res.ok) return parseOverpass(await res.json(), i);
    last = res.status;
    if (![429, 502, 503, 504].includes(res.status)) break;
  }
  throw new Error(`OpenStreetMap (Overpass): ${[429, 502, 503, 504].includes(last) ? "the map servers are busy, try again in a minute" : `HTTP ${last}`}`);
}
