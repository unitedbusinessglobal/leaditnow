export type SourceId = "google-places" | "apollo" | "osm" | "wikidata";

export const SOURCE_LABEL: Record<SourceId, string> = {
  "google-places": "Google Places",
  apollo: "Apollo",
  osm: "OpenStreetMap",
  wikidata: "Wikidata",
};

/** A company returned by a lead source, before it becomes an account or a review item. */
export interface Found {
  source: SourceId;
  externalId: string;
  name: string;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  industry?: string | null;
  staffSize?: number | null;
}

export interface SearchInput {
  industry: string;
  city: string;
  country?: string | null; // ISO code; India when empty
  keywords?: string | null;
  staffRange?: string | null; // "11,200"
  limit?: number;
}

export type Fetch = typeof fetch;

export const UA = "LeadItNowBot/0.3 (+https://ainformatiq.com; lead discovery)";

/** Target industries offered on the Find leads page. */
export const INDUSTRIES = [
  "Manufacturing",
  "Textiles and garments",
  "Engineering and auto components",
  "Retail and distribution",
  "Healthcare and clinics",
  "Education and training",
  "Hotels and restaurants",
  "Logistics and transport",
  "Real estate and construction",
  "Professional services",
  "IT and software",
  "Food processing",
];

export { MARKETS } from "./markets";
export const CITIES = ["Chennai", "Coimbatore", "Tiruppur", "Madurai", "Tiruchirappalli", "Salem", "Erode", "Hosur", "Vellore", "Tirunelveli"];
