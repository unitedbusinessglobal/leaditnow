import { NextResponse } from "next/server";
import { scanDomain } from "@/signals/scan";
import { currentUser } from "@/lib/session";
import { hasServiceKey } from "@/lib/apiKey";

async function allowed(req: Request) {
  return hasServiceKey(req) || Boolean(await currentUser());
}

export const runtime = "nodejs"; // DNS lookups need Node, not the edge runtime
export const maxDuration = 60;

/** GET /api/scan?domain=acme.co.in -> same result as POST; handy for links and checks. */
export async function GET(req: Request) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const domain = new URL(req.url).searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain is required, e.g. /api/scan?domain=example.in" }, { status: 400 });
  try {
    return NextResponse.json(await scanDomain(domain));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

/** POST { "domain": "acme.co.in" } -> need and stack signals with evidence and score. */
export async function POST(req: Request) {
  if (!(await allowed(req))) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { \"domain\": \"example.in\" }" }, { status: 400 });
  }
  if (!body.domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  try {
    return NextResponse.json(await scanDomain(body.domain));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
