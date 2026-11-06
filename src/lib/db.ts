import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// node-postgres pool through Neon's pooled endpoint, as Neon recommends for Vercel Fluid compute.
// attachDatabasePool lets Vercel close idle clients before a function instance is suspended.
const g = globalThis as unknown as { prisma?: PrismaClient; pool?: Pool };

function make(): PrismaClient {
  const pool = g.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
  g.pool = pool;
  if (process.env.VERCEL) attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const db: PrismaClient = g.prisma ?? make();
if (process.env.NODE_ENV !== "production") g.prisma = db;
