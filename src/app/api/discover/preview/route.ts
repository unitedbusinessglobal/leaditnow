import { NextResponse } from "next/server";
import { runSource, describe } from "@/discovery/ingest";
import { ownDomain } from "@/discovery/website";
import type { SourceId } from "@/discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview builds only (behind Vercel Authentication): run a lead source and return what it parsed,
 * without saving anything. Used to check live connectors after a deploy. 404 in production.
 */
export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const source = (q.get("source") ?? "osm") as SourceId;
  const i = { industry: q.get("industry") ?? "Manufacturing", city: q.get("city") ?? "Chennai", keywords: q.get("keywords"), limit: 25 };
  try {
    const found = await runSource(source, i);
    return NextResponse.json({
      source, query: describe(source, i), count: found.length,
      withOwnWebsite: found.filter((f) => ownDomain(f.website)).length,
      sample: found.slice(0, 8),
    });
  } catch (e) {
    return NextResponse.json({ source, error: (e as Error).message }, { status: 502 });
  }
}
