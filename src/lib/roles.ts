import type { Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  FOUNDER: "Founder",
  DIRECTOR: "Director, Marketing and Sales",
  SALES_LEAD: "Sales Lead",
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
  | "activities.log"
  | "leads.find"
  | "accounts.assign"
  | "teams.manage";

const MATRIX: Record<Action, Role[]> = {
  "users.manage": ["FOUNDER", "DIRECTOR"],
  "users.grantFounder": ["FOUNDER"],
  "approvals.decide": ["FOUNDER"],
  "revenue.view": ["FOUNDER", "DIRECTOR"],
  "invoices.edit": ["FOUNDER", "DIRECTOR"],
  "dashboard.view": ["FOUNDER", "DIRECTOR", "SALES_LEAD"],
  "accounts.edit": ["FOUNDER", "DIRECTOR", "SALES_LEAD", "BA", "SALES"],
  "accounts.import": ["FOUNDER", "DIRECTOR", "SALES_LEAD", "BA"],
  "deals.edit": ["FOUNDER", "DIRECTOR", "SALES_LEAD", "BA", "SALES"],
  // Moving a deal into contract stages (MOU, MSA) or recording signed documents.
  "deals.contract": ["FOUNDER", "DIRECTOR"],
  "activities.log": ["FOUNDER", "DIRECTOR", "SALES_LEAD", "BA", "SALES", "INTERN"],
  // Running lead searches and revealing Apollo contacts (which uses paid credits).
  "leads.find": ["FOUNDER", "DIRECTOR", "SALES_LEAD", "BA"],
  // Assigning any account to any team or person, and taking it back.
  "accounts.assign": ["FOUNDER", "DIRECTOR", "SALES_LEAD"],
  // Creating teams, naming their lead and choosing members.
  "teams.manage": ["FOUNDER", "DIRECTOR", "SALES_LEAD"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}

/** Discounts above this need founder approval (Director decides within it). */
export const DISCOUNT_LIMIT_PCT = Number(process.env.DISCOUNT_LIMIT_PCT ?? 10);
