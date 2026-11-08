import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { day } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { scanPending, enrichBatch } from "./actions";
import { apolloReady } from "@/domain/enrich";
import { inrShort } from "@/domain/estimate";
import { SubmitButton } from "@/components/SubmitButton";
import { assignMany } from "./assign-actions";
import { actorFor, assignOptions, loadTeams, stageWhere, STAGE_LABEL, STAGES, type Stage } from "@/domain/assign";

export const maxDuration = 120;

type SP = { q?: string; need?: string; hint?: string; owner?: string; status?: string; team?: string; sort?: string; page?: string; ok?: string; error?: string };

const SORTS: Record<string, Prisma.AccountOrderByWithRelationInput[]> = {
  priority: [{ priority: "desc" }, { needScore: "desc" }],
  need: [{ needScore: "desc" }],
  fit: [{ fitScore: "desc" }],
  name: [{ name: "asc" }],
  newest: [{ createdAt: "desc" }],
};
const PAGE = 50;

export default async function Accounts({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Prisma.AccountWhereInput = { orgId: user.orgId };
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { domain: { contains: sp.q.toLowerCase() } }, { city: { contains: sp.q, mode: "insensitive" } }];
  if (sp.need) where.needLabel = sp.need;
  if (sp.hint) where.serviceHint = sp.hint;
  if (sp.owner === "me") where.ownerId = user.id;
  if (sp.owner === "team") where.teamId = user.teamId ?? "-";
  if (sp.team) where.teamId = sp.team;
  const status = STAGES.includes(sp.status as Stage) ? (sp.status as Stage) : null;
  if (status) where.AND = [stageWhere(status)];
  const page = Math.max(1, Number(sp.page) || 1);
  const apollo = apolloReady();
  const [accounts, total, hints, unscanned, unenriched] = await Promise.all([
    db.account.findMany({
      where, orderBy: SORTS[sp.sort ?? "priority"] ?? SORTS.priority, take: PAGE, skip: (page - 1) * PAGE,
      include: { owner: { select: { name: true } }, team: { select: { name: true } }, _count: { select: { contacts: true, deals: true } } },
    }),
    db.account.count({ where }),
    db.account.findMany({ where: { orgId: user.orgId, serviceHint: { not: null } }, distinct: ["serviceHint"], select: { serviceHint: true } }),
    db.account.count({ where: { orgId: user.orgId, lastScannedAt: null } }),
    db.account.count({ where: { orgId: user.orgId, enrichedAt: null } }),
  ]);
  const [{ teams, outsiders }, actor] = await Promise.all([loadTeams(db, user.orgId), actorFor(db, user)]);
  const groups = assignOptions(actor, teams, outsiders);
  const bulk = groups.length > 0;
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ok: undefined, error: undefined, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/accounts?${p}`;
  };
  const backTo = qs({});
  return (
    <div className="stack">
      <div className="head">
        <div>
          <h1>Accounts</h1>
          <p className="muted" style={{ margin: 0 }}>{total} {total === 1 ? "company" : "companies"}{status ? ` · ${STAGE_LABEL[status]}` : ""}, highest priority first.</p>
        </div>
        <div className="row">
          {can(user.role, "accounts.import") && <Link className="btn" href="/accounts/import">Import CSV</Link>}
          {can(user.role, "accounts.edit") && <Link className="btn btn-primary" href="/accounts/new">Add company</Link>}
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {unscanned > 0 && can(user.role, "accounts.edit") && (
        <form action={scanPending} className="notice row" style={{ justifyContent: "space-between" }}>
          <span>{unscanned} {unscanned === 1 ? "account has" : "accounts have"} not been scanned yet. The daily job scans them; you can also scan a batch now.</span>
          <SubmitButton className="btn btn-sm" pending="Scanning…">Scan next 8</SubmitButton>
        </form>
      )}
      {can(user.role, "leads.find") && unenriched > 0 && (apollo ? (
        <form action={enrichBatch} className="notice row" style={{ justifyContent: "space-between" }}>
          <span>{unenriched} {unenriched === 1 ? "account has" : "accounts have"} no size or revenue details from Apollo yet.</span>
          <SubmitButton className="btn btn-sm" pending="Asking Apollo…">Enrich next 20</SubmitButton>
        </form>
      ) : (
        <p className="faint" style={{ margin: 0 }}>Revenue and staff come from Apollo once it is connected. Until then, enter them on each account under Size and finance.</p>
      ))}
      <form className="card row" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search name, domain or city" style={{ flex: 1, minWidth: 200 }} />
        <select name="need" defaultValue={sp.need ?? ""}>
          <option value="">Any need</option>
          {["High", "Medium", "Low", "None"].map((n) => <option key={n}>{n}</option>)}
        </select>
        <select name="hint" defaultValue={sp.hint ?? ""}>
          <option value="">Any service line</option>
          {hints.map((h) => <option key={h.serviceHint}>{h.serviceHint}</option>)}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""}>
          <option value="">Everyone&apos;s</option>
          <option value="me">Mine</option>
          {user.teamId && <option value="team">My team&apos;s</option>}
        </select>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">Any progress</option>
          {STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
        </select>
        <select name="sort" defaultValue={sp.sort ?? "priority"}>
          <option value="priority">Sort: priority</option>
          <option value="need">Sort: need</option>
          <option value="fit">Sort: fit</option>
          <option value="name">Sort: name</option>
          <option value="newest">Sort: newest</option>
        </select>
        <button className="btn">Apply</button>
      </form>
      <form id="bulk" action={assignMany} className={bulk ? "card row" : undefined} hidden={!bulk}>
        <input type="hidden" name="backTo" value={backTo} />
        <span className="muted">Assign the ticked accounts to</span>
        <select name="to" defaultValue="">
          <option value="" disabled>Choose a team or person</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>{g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          ))}
        </select>
        <input name="note" placeholder="Handover note (optional)" style={{ flex: 1, minWidth: 180 }} />
        <SubmitButton className="btn btn-sm btn-primary" pending="Assigning…">Assign</SubmitButton>
      </form>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>{bulk && <th style={{ width: 28 }} />}<th>Company</th><th>Need</th><th className="num">Fit</th><th className="num">Priority</th><th>Lead with</th><th>Size</th><th>City</th><th>Owner</th><th>Scanned</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                {bulk && <td><input type="checkbox" name="ids" value={a.id} form="bulk" aria-label={`Select ${a.name}`} /></td>}
                <td>
                  <Link href={`/accounts/${a.id}`}><strong>{a.name}</strong></Link>
                  <div className="faint">{a.domain} · {a._count.contacts} contacts · {a._count.deals} deals</div>
                </td>
                <td><span className={`badge ${a.needLabel}`}>{a.needLabel} {a.needScore}</span></td>
                <td className="num">{a.fitScore}</td>
                <td className="num"><strong>{a.priority}</strong></td>
                <td>{a.serviceHint ?? <span className="faint">—</span>}</td>
                <td className="faint">{[a.staffSize ? `${a.staffSize} staff` : null, a.revenueInr ? inrShort(a.revenueInr) : null, a.listed ? `Listed${a.stockSymbol ? ` ${a.stockSymbol}` : ""}` : null].filter(Boolean).join(" · ") || "—"}</td>
                <td>{a.city ?? <span className="faint">—</span>}</td>
                <td>
                  {a.owner ? a.owner.name : a.team ? <span className="faint">{a.team.name} queue</span> : <span className="faint">Unassigned</span>}
                  {!a.ownerId && a.teamId && a.teamId === user.teamId && (
                    <div><button form="bulk" name="pick" value={a.id} className="btn btn-sm" style={{ marginTop: 4 }}>Pick up</button></div>
                  )}
                </td>
                <td className="faint">{a.lastScannedAt ? day(a.lastScannedAt) : "Waiting"}</td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={bulk ? 10 : 9} className="muted" style={{ padding: 24 }}>No companies match. Add one by its website domain or import a CSV.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="row">
          {page > 1 && <Link className="btn btn-sm" href={qs({ page: String(page - 1) })}>Previous</Link>}
          <span className="faint">Page {page} of {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total && <Link className="btn btn-sm" href={qs({ page: String(page + 1) })}>Next</Link>}
        </div>
      )}
    </div>
  );
}
