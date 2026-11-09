import type { PrismaClient, Account } from "@prisma/client";
import { normaliseDomain, scanDomain, type ScanResult } from "@/signals/scan";
import { manualSignal, RULES } from "@/signals/rules";
import { needScore, fitScore, priority } from "@/signals/score";
import type { SignalMatch } from "@/signals/rules";
import { normaliseIntlPhone } from "@/discovery/markets";

const DECISION_MAKER = /\b(owner|founder|co-?founder|director|ceo|cto|cfo|coo|md|managing|proprietor|partner|head|gm|general manager|president|vp)\b/i;

/**
 * Indian numbers compare on their last 10 digits (drops +91, 0 and spacing).
 * Numbers in other countries keep their international form ("+971 4 123 4567").
 */
export function normalisePhone(raw?: string | null, country?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const intl = /^\s*(\+|00)/.test(raw) && !/^\s*(\+|00)\s*91/.test(raw);
  if ((country && country !== "IN") || intl) return normaliseIntlPhone(raw, country && country !== "IN" ? country : null) ?? digits.slice(-10);
  return digits.slice(-10);
}

export function nameFromDomain(domain: string): string {
  const base = domain.split(".")[0].replace(/[-_]+/g, " ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface NewAccount {
  domain: string;
  name?: string | null;
  city?: string | null;
  industry?: string | null;
  staffSize?: number | null;
  phone?: string | null;
  ownerId?: string | null;
  teamId?: string | null;
  country?: string | null;
  source?: string;
  sourceNote?: string | null;
}

/** Create an account, or return the existing one with the same domain (no duplicates per org). */
export async function upsertAccount(db: PrismaClient, orgId: string, a: NewAccount): Promise<{ account: Account; created: boolean }> {
  const domain = normaliseDomain(a.domain);
  const existing = await db.account.findUnique({ where: { orgId_domain: { orgId, domain } } });
  if (existing) return { account: existing, created: false };
  const account = await db.account.create({
    data: {
      orgId,
      domain,
      name: a.name?.trim() || nameFromDomain(domain),
      city: a.city?.trim() || null,
      industry: a.industry?.trim() || null,
      staffSize: a.staffSize ?? null,
      phone: normalisePhone(a.phone, a.country),
      ownerId: a.ownerId ?? null,
      teamId: a.teamId ?? null,
      country: a.country && a.country !== "IN" ? a.country : null,
      assignedAt: a.ownerId || a.teamId ? new Date() : null,
      source: a.source ?? "manual",
      sourceNote: a.sourceNote ?? null,
    },
  });
  return { account, created: true };
}

/** Store a scan: replaces the account's scan signals (manual ones stay) and refreshes the scores. */
export async function saveScan(db: PrismaClient, account: Account, result: ScanResult) {
  const run = await db.scanRun.create({
    data: { orgId: account.orgId, accountId: account.id, status: "DONE", pages: result.pagesScanned, finishedAt: new Date() },
  });
  await db.$transaction([
    db.signal.deleteMany({ where: { accountId: account.id, manual: false } }),
    db.signal.createMany({
      data: result.signals.map((s) => ({
        orgId: account.orgId,
        accountId: account.id,
        ruleId: s.ruleId,
        category: s.category,
        serviceLine: s.serviceLine || null,
        weight: s.weight,
        evidence: s.evidence,
        scanRunId: run.id,
      })),
    }),
    db.account.update({ where: { id: account.id }, data: { lastScannedAt: new Date() } }),
  ]);
  await saveContactPoints(db, account, result.contacts ?? []);
  return recomputeScores(db, account.id);
}

export async function recordScanFailure(db: PrismaClient, account: Account, error: string) {
  await db.scanRun.create({
    data: { orgId: account.orgId, accountId: account.id, status: "FAILED", pages: [], error: error.slice(0, 500), finishedAt: new Date() },
  });
  await db.account.update({ where: { id: account.id }, data: { lastScannedAt: new Date() } });
}

/** Scan the domain now and save the result; failures are recorded, not thrown. */
export async function scanAndSave(db: PrismaClient, account: Account, scan = scanDomain) {
  try {
    const result = await scan(account.domain);
    return await saveScan(db, account, result);
  } catch (e) {
    await recordScanFailure(db, account, (e as Error).message);
    return null;
  }
}

export async function addManualSignal(
  db: PrismaClient,
  accountId: string,
  ruleId: "referral" | "job-post-it" | "growth-news",
  evidence: string,
  userId: string,
) {
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId } });
  const m = manualSignal(ruleId, evidence.trim() || "Added by hand");
  await db.signal.create({
    data: {
      orgId: account.orgId,
      accountId,
      ruleId: m.ruleId,
      category: m.category,
      serviceLine: m.serviceLine || null,
      weight: m.weight,
      evidence: m.evidence,
      manual: true,
      addedById: userId,
    },
  });
  return recomputeScores(db, accountId);
}

/** Need from stored signals; fit from profile, contacts and referral; priority from both. */
export async function recomputeScores(db: PrismaClient, accountId: string) {
  const account = await db.account.findUniqueOrThrow({
    where: { id: accountId },
    include: { signals: true, contacts: { select: { title: true } } },
  });
  const matches: SignalMatch[] = account.signals.map((s) => ({
    ruleId: s.ruleId,
    category: s.category,
    serviceLine: s.serviceLine ?? "",
    weight: s.weight,
    label: s.ruleId,
    evidence: s.evidence,
  }));
  // Labels come from the rule catalogue so the account shows readable stack names.
  for (const m of matches) m.label = RULES.find((r) => r.id === m.ruleId)?.label ?? m.ruleId;
  const need = needScore(matches);
  const fit = fitScore({
    city: account.city,
    staffSize: account.staffSize,
    industry: account.industry,
    decisionMakerFound: account.contacts.some((c) => c.title && DECISION_MAKER.test(c.title)),
    referral: matches.some((m) => m.ruleId === "referral"),
  });
  return db.account.update({
    where: { id: accountId },
    data: {
      needScore: need.score,
      needLabel: need.label,
      stack: need.stack,
      serviceHint: need.serviceHints[0] ?? null,
      fitScore: fit,
      priority: priority(need, fit),
    },
  });
}

/** Keep published emails and phones from the website (new ones only); fill the office phone if empty. */
export async function saveContactPoints(db: PrismaClient, account: Account, found: { kind: string; value: string; sourceUrl: string }[]) {
  if (found.length === 0) return 0;
  const res = await db.contactPoint.createMany({
    data: found.map((c) => ({ orgId: account.orgId, accountId: account.id, kind: c.kind, value: c.value, sourceUrl: c.sourceUrl })),
    skipDuplicates: true,
  });
  const phone = found.find((c) => c.kind === "phone");
  if (!account.phone && phone) await db.account.update({ where: { id: account.id }, data: { phone: normalisePhone(phone.value, account.country) } });
  return res.count;
}
