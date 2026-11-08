import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasServiceKey } from "@/lib/apiKey";
import { runDiscovery } from "@/discovery/ingest";
import type { SourceId } from "@/discovery/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly: run every active saved search (LDITNW-27). New accounts are scanned by the nightly scan job. */
export async function GET(req: Request) {
  if (!hasServiceKey(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const searches = await db.savedSearch.findMany({ where: { active: true }, orderBy: { lastRunAt: { sort: "asc", nulls: "first" } }, take: 30 });
  const started = Date.now();
  const results = [];
  for (const s of searches) {
    if (Date.now() - started > 240_000) break;
    const { run } = await runDiscovery(db, s.orgId, s.source as SourceId, s, { savedSearchId: s.id, userId: s.createdById });
    await db.savedSearch.update({ where: { id: s.id }, data: { lastRunAt: new Date() } });
    results.push({ id: s.id, added: run.added, candidates: run.candidates, error: run.error });
  }
  return NextResponse.json({ ran: results.length, results });
}
