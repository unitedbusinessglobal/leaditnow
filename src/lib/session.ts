import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "./db";
import { can, type Action } from "./roles";

/** Current user, read fresh from the database so role changes and deactivation apply at once. */
export async function currentUser(): Promise<User | null> {
  const session = (await auth()) as { uid?: string } | null;
  if (!session?.uid) return null;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  return user?.active ? user : null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCan(action: Action): Promise<User> {
  const user = await requireUser();
  if (!can(user.role, action)) throw new Error("You do not have permission for this action.");
  return user;
}
