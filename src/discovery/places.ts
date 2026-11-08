import type { Fetch, Found, SearchInput } from "./types";

const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.websiteUri",
  "places.nationalPhoneNumber", "places.addressComponents", "places.businessStatus", "nextPageToken",
].join(",");

interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
}

export function placesQuery(i: SearchInput): string {
  return `${i.keywords?.trim() || i.industry} in ${i.city}, Tamil Nadu, India`;
}

/** Google Places API (New) Text Search: up to 3 pages of 20. Bills at the Enterprise tier (website and phone). */
export async function searchPlaces(i: SearchInput, apiKey: string, f: Fetch = fetch): Promise<Found[]> {
  const out: Found[] = [];
  let pageToken: string | undefined;
  const limit = Math.min(i.limit ?? 60, 60);
  do {
    const res = await f("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: placesQuery(i), regionCode: "IN", languageCode: "en", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    const body = (await res.json()) as { places?: Place[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`Google Places: ${body.error?.message ?? res.status}`);
    for (const p of body.places ?? []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      const city = p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ?? i.city;
      out.push({
        source: "google-places", externalId: p.id, name: p.displayName?.text ?? "Unnamed", website: p.websiteUri ?? null,
        phone: p.nationalPhoneNumber ?? null, city, address: p.formattedAddress ?? null, industry: i.industry,
      });
    }
    pageToken = body.nextPageToken;
  } while (pageToken && out.length < limit);
  return out.slice(0, limit);
}
