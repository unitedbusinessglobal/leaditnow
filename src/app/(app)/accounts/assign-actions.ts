"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { str } from "@/lib/format";
import { assignAccount, type Target } from "@/domain/assign";

const go = (to: string, kind: "ok" | "error", msg: string): never =>
  redirect(`${to}${to.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);

/** "none" | "team:<id>" | "user:<id>" | "pickup" | "release" -> where the account should go. */
function parseTarget(to: string, me: string, currentTeam: string | null): Target | null {
  if (to === "none") return { teamId: null, ownerId: null };
  if (to === "pickup") return { teamId: currentTeam, ownerId: me };
  if (to === "release") return { teamId: currentTeam, ownerId: null };
  if (to.startsWith("team:")) return { teamId: to.slice(5), ownerId: null };
  if (to.startsWith("user:")) return { teamId: null, ownerId: to.slice(5) };
  return null;
}

/** Assign, hand over, pick up or release one account. */
export async function assignOne(fd: FormData) {
  const user = await requireUser();
  const id = str(fd.get("id"));
  const backTo = str(fd.get("backTo")) || `/accounts/${id}`;
  const account = await db.account.findFirst({ where: { id, orgId: user.orgId }, select: { teamId: true } });
  if (!account) go(backTo, "error", "Account not found.");
  const target = parseTarget(str(fd.get("to")), user.id, account!.teamId);
  if (!target) go(backTo, "error", "Choose a team or a person.");
  let summary = "";
  try {
    summary = (await assignAccount(db, user.orgId, user, id, target!, str(fd.get("note")))).summary;
  } catch (e) {
    go(backTo, "error", (e as Error).message);
  }
  go(backTo, "ok", `${summary}.`);
}

/** Assign the ticked accounts on the Accounts list (Founder, Director, Sales Lead, or a team lead within the team). */
export async function assignMany(fd: FormData) {
  const user = await requireUser();
  const backTo = str(fd.get("backTo")) || "/accounts";
  // A row's own "Pick up" button sends its id as `pick`.
  const pick = str(fd.get("pick"));
  const ids = pick ? [pick] : fd.getAll("ids").map(String).filter(Boolean);
  const to = pick ? "pickup" : str(fd.get("to"));
  if (ids.length === 0) go(backTo, "error", "Tick the accounts to assign first.");
  if (!to) go(backTo, "error", "Choose a team or a person.");
  const accounts = await db.account.findMany({ where: { id: { in: ids }, orgId: user.orgId }, select: { id: true, name: true, teamId: true } });
  let done = 0;
  const failed: string[] = [];
  let last = "";
  for (const a of accounts) {
    const target = parseTarget(to, user.id, a.teamId);
    if (!target) { failed.push(`${a.name}: choose a team or a person`); continue; }
    try {
      last = (await assignAccount(db, user.orgId, user, a.id, target, str(fd.get("note")))).summary;
      done++;
    } catch (e) {
      failed.push(`${a.name}: ${(e as Error).message}`);
    }
  }
  if (done === 0) go(backTo, "error", failed.slice(0, 3).join(" "));
  const what = done === 1 ? `${last}.` : `${done} accounts updated (${last.replace(/ by .*/, "")}).`;
  go(backTo, failed.length ? "error" : "ok", failed.length ? `${what} Not changed: ${failed.slice(0, 3).join("; ")}` : what);
}
