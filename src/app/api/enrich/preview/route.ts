import { NextResponse } from "next/server";
import { readyProviders, type ProviderId } from "@/enrich/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview builds only (behind Vercel Authentication): ask one connected data source about a domain
 * and return what it parsed, without saving anything. Used to check a newly added key. 404 in production.
 */
export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const domain = q.get("domain") ?? "";
  const id = q.get("source") as ProviderId | null;
  const what = q.get("what") ?? "company";
  const p = readyProviders().find((x) => x.id === id);
  if (!domain || !p) return NextResponse.json({ error: "Give ?source=<connected source>&domain=", connected: readyProviders().map((x) => x.id) }, { status: 400 });
  try {
    const out = what === "emails" ? await p.emails?.(domain, fetch) : await p.company?.(domain, fetch);
    return NextResponse.json({ source: p.id, domain, what, result: out ?? null });
  } catch (e) {
    return NextResponse.json({ source: p.id, error: (e as Error).message }, { status: 502 });
  }
}
