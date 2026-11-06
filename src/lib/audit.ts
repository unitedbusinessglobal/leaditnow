import type { Prisma } from "@prisma/client";
import { db } from "./db";

export async function audit(
  orgId: string,
  actorId: string | null,
  entity: string,
  entityId: string,
  action: string,
  diff?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { orgId, actorId, entity, entityId, action, diff } });
}
