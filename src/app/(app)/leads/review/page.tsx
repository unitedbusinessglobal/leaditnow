import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { day } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { SOURCE_LABEL, type SourceId } from "@/discovery/types";
import { addCandidate, dismissCandidate } from "../actions";

const label = (s: string) => SOURCE_LABEL[s as SourceId] ?? (s.startsWith("csv:") ? `CSV ${s.slice(4)}` : s);

export default async function Review({ searchParams }: { searchParams: Promise<{ city?: string; source?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Prisma.LeadCandidateWhereInput = { orgId: user.orgId, status: "NEW" };
  if (sp.city) where.city = { contains: sp.city, mode: "insensitive" };
  if (sp.source) where.source = sp.source;
  const [items, total, sources] = await Promise.all([
    db.leadCandidate.findMany({ where, orderBy: [{ staffSize: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 100 }),
    db.leadCandidate.count({ where }),
    db.leadCandidate.findMany({ where: { orgId: user.orgId, status: "NEW" }, distinct: ["source"], select: { source: true } }),
  ]);
  const edit = can(user.role, "accounts.edit");
  return (
    <div className="stack">
      <div className="head">
        <div>
          <Link href="/leads" className="faint">← Find leads</Link>
          <h1>Review list</h1>
          <p className="muted" style={{ margin: 0 }}>{total} {total === 1 ? "company" : "companies"} found without their own website. Search for the company, paste its website and add it; dismiss the rest.</p>
        </div>
        <form className="row" method="get">
          <input name="city" defaultValue={sp.city} placeholder="City" style={{ width: 140 }} />
          <select name="source" defaultValue={sp.source ?? ""}><option value="">All sources</option>{sources.map((s) => <option key={s.source} value={s.source}>{label(s.source)}</option>)}</select>
          <button className="btn">Filter</button>
        </form>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Company</th><th>Details</th><th>Source</th><th style={{ width: 360 }}>Website</th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="faint">
                    <a href={`https://www.google.com/search?q=${encodeURIComponent(`${c.name} ${c.city ?? ""} website`)}`} target="_blank" rel="noreferrer">Search the web</a>
                    {c.website && <> · <a href={c.website} target="_blank" rel="noreferrer">listed page</a></>}
                  </div>
                </td>
                <td className="faint">{[c.city, c.industry, c.staffSize ? `${c.staffSize} staff` : null, c.phone].filter(Boolean).join(" · ")}{c.address && <div>{c.address}</div>}</td>
                <td className="faint">{label(c.source)}<div>{day(c.createdAt)}</div></td>
                <td>
                  {edit ? (
                    <div className="row" style={{ gap: 6 }}>
                      <form action={addCandidate} className="row" style={{ gap: 6 }}>
                        <input type="hidden" name="id" value={c.id} />
                        <input name="website" placeholder="company.in" style={{ width: 170 }} />
                        <button className="btn btn-sm btn-primary">Add</button>
                      </form>
                      <form action={dismissCandidate}><input type="hidden" name="id" value={c.id} /><button className="btn btn-sm">Dismiss</button></form>
                    </div>
                  ) : <span className="faint">—</span>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="muted" style={{ padding: 24 }}>Nothing to review.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
