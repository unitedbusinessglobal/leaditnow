import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCan } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/roles";
import { str, day } from "@/lib/format";
import { audit } from "@/lib/audit";
import { Flash } from "@/components/Flash";

const ROLES = Object.keys(ROLE_LABEL) as Role[];
const go = (kind: "ok" | "error", msg: string): never => redirect(`/settings/users?${kind}=${encodeURIComponent(msg)}`);

async function invite(fd: FormData) {
  "use server";
  const me = await requireCan("users.manage");
  const email = str(fd.get("email")).toLowerCase();
  const name = str(fd.get("name"));
  const role = str(fd.get("role")) as Role;
  if (!email || !name || !ROLES.includes(role)) go("error", "Name, email and role are required.");
  if (role === "FOUNDER" && !can(me.role, "users.grantFounder")) go("error", "Only the Founder can add another Founder.");
  if (await db.user.findUnique({ where: { email } })) go("error", `${email} already has an account.`);
  const u = await db.user.create({ data: { orgId: me.orgId, email, name, role } });
  await audit(me.orgId, me.id, "User", u.id, "invite", { email, role });
  go("ok", `${name} can now sign in with ${email}.`);
}

async function update(fd: FormData) {
  "use server";
  const me = await requireCan("users.manage");
  const id = str(fd.get("id"));
  const target = await db.user.findFirst({ where: { id, orgId: me.orgId } });
  if (!target) go("error", "User not found.");
  const role = str(fd.get("role")) as Role;
  const active = fd.get("active") === "on";
  if (target!.id === me.id && (!active || role !== me.role)) go("error", "You cannot change your own role or deactivate yourself.");
  if ((role === "FOUNDER" || target!.role === "FOUNDER") && !can(me.role, "users.grantFounder")) go("error", "Only the Founder can change a Founder account.");
  if (!ROLES.includes(role)) go("error", "Unknown role.");
  await db.user.update({ where: { id }, data: { role, active, name: str(fd.get("name")) || target!.name } });
  await audit(me.orgId, me.id, "User", id, "update", { role, active });
  go("ok", "Saved.");
}

export default async function Users({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireCan("users.manage");
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { orgId: me.orgId }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const grantable = ROLES.filter((r) => r !== "FOUNDER" || can(me.role, "users.grantFounder"));
  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <div className="head"><div><h1>Team</h1><p className="muted" style={{ margin: 0 }}>Only people listed here can sign in. Use their Google work account email.</p></div></div>
      <Flash ok={sp.ok} error={sp.error} />
      <section className="card">
        <h2>Add a person</h2>
        <form action={invite} className="row">
          <input name="name" required placeholder="Full name" />
          <input name="email" type="email" required placeholder="name@company.com" style={{ minWidth: 240 }} />
          <select name="role" defaultValue="SALES">{grantable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          <button className="btn btn-primary">Add</button>
        </form>
      </section>
      <section className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Last sign-in</th><th /></tr></thead>
          <tbody>
            {users.map((u) => {
              const locked = u.role === "FOUNDER" && !can(me.role, "users.grantFounder");
              return (
                <tr key={u.id}>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <form action={update} className="row" style={{ padding: "8px", gap: 8 }}>
                      <input type="hidden" name="id" value={u.id} />
                      <input name="name" defaultValue={u.name} disabled={locked} style={{ width: 170 }} />
                      <span style={{ width: 230 }} className="muted">{u.email}</span>
                      <select name="role" defaultValue={u.role} disabled={locked}>
                        {(locked ? ROLES : grantable).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <label className="inline"><input type="checkbox" name="active" defaultChecked={u.active} disabled={locked} /> Active</label>
                      <span className="faint" style={{ width: 110 }}>{u.lastLoginAt ? day(u.lastLoginAt) : "never"}</span>
                      {!locked && <button className="btn btn-sm">Save</button>}
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
