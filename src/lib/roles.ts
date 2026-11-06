import type { Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  FOUNDER: "Founder",
  DIRECTOR: "Director, Marketing and Sales",
  BA: "Business Analyst",
  SALES: "Inside Sales",
  INTERN: "Intern",
};

export type Action =
  | "users.manage"
  | "users.grantFounder"
  | "approvals.decide"
  | "revenue.view"
  | "invoices.edit"
  | "dashboard.view"
  | "accounts.edit"
  | "accounts.import"
  | "deals.edit"
  | "deals.contract"
  | "activities.log";

const MATRIX: Record<Action, Role[]> = {
  "users.manage": ["FOUNDER", "DIRECTOR"],
  "users.grantFounder": ["FOUNDER"],
  "approvals.decide": ["FOUNDER"],
  "revenue.view": ["FOUNDER", "DIRECTOR"],
  "invoices.edit": ["FOUNDER", "DIRECTOR"],
  "dashboard.view": ["FOUNDER", "DIRECTOR"],
  "accounts.edit": ["FOUNDER", "DIRECTOR", "BA", "SALES"],
  "accounts.import": ["FOUNDER", "DIRECTOR", "BA"],
  "deals.edit": ["FOUNDER", "DIRECTOR", "BA", "SALES"],
  // Moving a deal into contract stages (MOU, MSA) or recording signed documents.
  "deals.contract": ["FOUNDER", "DIRECTOR"],
  "activities.log": ["FOUNDER", "DIRECTOR", "BA", "SALES", "INTERN"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Discounts above this need founder approval (Director decides within it). */
export const DISCOUNT_LIMIT_PCT = Number(process.env.DISCOUNT_LIMIT_PCT ?? 10);
