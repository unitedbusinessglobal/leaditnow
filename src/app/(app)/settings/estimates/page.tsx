import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { audit } from "@/lib/audit";
import { str } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { INDUSTRIES } from "@/discovery/types";
import { readSettings, DEFAULT_SETTINGS, type EstimateSettings } from "@/domain/estimate";

const num = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number(str(v).replace(/[,₹\s%]/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

async function save(fd: FormData) {
  "use server";
  const user = await requireCan("users.manage");
  const itSpendPct: Record<string, number> = {};
  for (const [i, ind] of INDUSTRIES.entries()) {
    const v = num(fd.get(`pct${i}`), 0, 50);
    if (v == null) redirect(`/settings/estimates?error=${encodeURIComponent(`Enter a percentage between 0 and 50 for ${ind}.`)}`);
    itSpendPct[ind] = v!;
  }
  const s: EstimateSettings = {
    itSpendPct,
    otherPct: num(fd.get("otherPct"), 0, 50) ?? DEFAULT_SETTINGS.otherPct,
    usdInr: num(fd.get("usdInr"), 1, 1000) ?? DEFAULT_SETTINGS.usdInr,
    itPerEmployeeInr: num(fd.get("itPerEmployeeInr"), 0, 10_000_000) ?? 0,
  };
  await db.organization.update({ where: { id: user.orgId }, data: { settings: s as unknown as Prisma.InputJsonValue } });
  await audit(user.orgId, user.id, "Organization", user.orgId, "estimate-settings", s as unknown as Prisma.InputJsonValue);
  redirect("/settings/estimates?ok=Saved.%20Estimates%20on%20every%20account%20use%20these%20figures%20now.");
}

export default async function Estimates({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireCan("users.manage");
  const sp = await searchParams;
  const org = await db.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const s = readSettings(org.settings);
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div>
        <h1>Estimates</h1>
        <p className="muted" style={{ margin: 0 }}>
          No public source gives a private company&apos;s IT spend, so each account shows an estimated IT budget band.
          It is the annual revenue × the percentage for its industry (or staff × the amount per employee when revenue is unknown),
          raised a little when the company already uses several business tools, is hiring for IT, or has an IT lead.
        </p>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={save} className="card form">
        <h2>IT spend as % of annual revenue</h2>
        <p className="faint" style={{ marginTop: -6 }}>The starting value of 2% for every industry is a placeholder: replace it with your own figures.</p>
        <div className="grid3">
          {INDUSTRIES.map((ind, i) => (
            <label key={ind}>{ind}<input name={`pct${i}`} inputMode="decimal" defaultValue={s.itSpendPct[ind]} /></label>
          ))}
          <label>Other industries<input name="otherPct" inputMode="decimal" defaultValue={s.otherPct} /></label>
        </div>
        <h2 style={{ marginTop: 10 }}>Other figures</h2>
        <div className="row">
          <label>IT spend per employee a year (₹), used when revenue is unknown; 0 = off<input name="itPerEmployeeInr" inputMode="numeric" defaultValue={s.itPerEmployeeInr} /></label>
          <label>Rupees per US dollar (converts Apollo&apos;s revenue)<input name="usdInr" inputMode="decimal" defaultValue={s.usdInr} /></label>
        </div>
        <div><button className="btn btn-primary">Save</button></div>
      </form>
    </div>
  );
}
