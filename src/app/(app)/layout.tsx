import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { can, ROLE_LABEL } from "@/lib/roles";
import { db } from "@/lib/db";
import { Logo } from "@/components/Logo";
import { ThemePicker } from "@/components/ThemePicker";
import { ProgressBanner } from "@/components/ProgressBanner";
import { progressCounts } from "@/domain/assign";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [pending, counts] = await Promise.all([
    can(user.role, "approvals.decide") ? db.approval.count({ where: { orgId: user.orgId, status: "PENDING" } }) : 0,
    progressCounts(db, user.orgId),
  ]);
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand"><Logo href="/today" /></div>
        <Link href="/today">My day</Link>
        <Link href="/accounts">Accounts</Link>
        {can(user.role, "leads.find") && <Link href="/leads">Find leads</Link>}
        <Link href="/pipeline">Pipeline</Link>
        {(user.teamId || can(user.role, "teams.manage")) && <Link href="/teams">Teams</Link>}
        <Link href="/scan">Quick scan</Link>
        {can(user.role, "dashboard.view") && <Link href="/dashboard">Dashboard</Link>}
        {can(user.role, "approvals.decide") && <Link href="/approvals">Approvals{pending ? ` (${pending})` : ""}</Link>}
        {can(user.role, "revenue.view") && <Link href="/revenue">Net Revenue</Link>}
        {can(user.role, "users.manage") && (
          <>
            <div className="sep" />
            <Link href="/settings/users">Team</Link>
            <Link href="/settings/estimates">Estimates</Link>
            <Link href="/settings/sources">Data sources</Link>
          </>
        )}
        <div className="me">
          {user.name}
          <br />
          {ROLE_LABEL[user.role]}
          <div style={{ margin: "10px 0 2px" }}><ThemePicker /></div>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="btn btn-sm" style={{ marginTop: 8 }}>Sign out</button>
          </form>
        </div>
      </nav>
      <main className="main">
        <ProgressBanner counts={counts} />
        {children}
      </main>
    </div>
  );
}
