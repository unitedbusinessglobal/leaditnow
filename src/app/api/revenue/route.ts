import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { db } from "@/lib/db";
import { statement, toCsv } from "@/domain/revenue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "revenue.view")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month=YYYY-MM is required" }, { status: 400 });
  const csv = toCsv(await statement(db, user.orgId, month));
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="net-revenue-${month}.csv"` },
  });
}
