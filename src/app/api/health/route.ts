import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health -> app is up; whether its database is reachable and which migrations it has. */
export async function GET() {
  const env = process.env.VERCEL_ENV ?? "local";
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, env, branch, database: "not configured" });
  }
  try {
    const { db } = await import("@/lib/db");
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at`;
    const host = new URL(process.env.DATABASE_URL).hostname.split(".")[0];
    return NextResponse.json({ ok: true, env, branch, database: "connected", endpoint: host, migrations: rows.map((r: { migration_name: string }) => r.migration_name) });
  } catch (e) {
    return NextResponse.json({ ok: false, env, branch, database: "error", error: (e as Error).message.slice(0, 300) }, { status: 503 });
  }
}
