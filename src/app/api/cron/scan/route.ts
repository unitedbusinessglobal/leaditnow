import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasServiceKey } from "@/lib/apiKey";
import { scanAndSave } from "@/domain/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily: scan never-scanned accounts first, then re-scan any older than 30 days (LDITNW-11). */
export async function GET(req: Request) {
  if (!hasServiceKey(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const stale = new Date(Date.now() - 30 * 86_400_000);
  const batch = await db.account.findMany({
    where: { OR: [{ lastScannedAt: null }, { lastScannedAt: { lt: stale } }] },
    orderBy: [{ lastScannedAt: { sort: "asc", nulls: "first" } }],
    take: 40,
  });
  let ok = 0;
  const started = Date.now();
  for (let i = 0; i < batch.length; i += 4) {
    if (Date.now() - started > 240_000) break;
    const results = await Promise.all(batch.slice(i, i + 4).map((a) => scanAndSave(db, a)));
    ok += results.filter(Boolean).length;
  }
  return NextResponse.json({ picked: batch.length, scanned: ok });
}
