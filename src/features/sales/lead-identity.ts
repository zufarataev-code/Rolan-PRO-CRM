/**
 * Who the lead is (Owner, 2026-10-01): a private customer (B2C) with first and
 * last name, or a company (B2B) with its name, type, representative and the
 * representative's job title. `name` stays the display name used everywhere:
 * the person for B2C, the company for B2B.
 */

export const COMPANY_TYPES = [
  "designer",
  "architect",
  "contractor",
  "developer",
  "property_management",
  "commercial_property",
  "office",
  "retail",
  "hospitality",
  "auto",
  "medical",
  "education",
  "government",
  "other",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];
export type LeadCustomerType = "B2C" | "B2B";

export type LeadIdentityInput = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  customer_type?: string | null;
  company_name?: string | null;
  company_type?: string | null;
  contact_title?: string | null;
};

export type LeadIdentity = {
  name: string;
  first_name: string | null;
  last_name: string | null;
  customer_type: LeadCustomerType;
  company_name: string | null;
  company_type: CompanyType | null;
  contact_title: string | null;
};

const B2B_VALUES = new Set(["b2b", "business", "company", "commercial"]);

function clean(value: string | null | undefined, max: number) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text ? text.slice(0, max) : null;
}

export function normalizeLeadIdentity(input: LeadIdentityInput): LeadIdentity | { error: string } {
  const firstName = clean(input.first_name, 80);
  const lastName = clean(input.last_name, 80);
  const companyName = clean(input.company_name, 160);
  const requestedType = clean(input.customer_type, 20)?.toLowerCase();
  const customerType: LeadCustomerType = (requestedType && B2B_VALUES.has(requestedType)) || companyName ? "B2B" : "B2C";
  const rawCompanyType = clean(input.company_type, 40)?.toLowerCase() ?? null;
  const companyType = customerType === "B2B" && rawCompanyType
    ? ((COMPANY_TYPES as readonly string[]).includes(rawCompanyType) ? (rawCompanyType as CompanyType) : "other")
    : null;

  const person = [firstName, lastName].filter(Boolean).join(" ");
  // A company lead is shown by the company, even when an old-style `name`
  // (often the representative) is sent too.
  const name = customerType === "B2B"
    ? companyName ?? clean(input.name, 160) ?? (person || null)
    : clean(input.name, 160) ?? (person || null);
  if (!name) {
    return { error: "Lead name is required: send name, or first_name / company_name." };
  }

  return {
    name,
    first_name: firstName,
    last_name: lastName,
    customer_type: customerType,
    company_name: customerType === "B2B" ? companyName : null,
    company_type: companyType,
    contact_title: customerType === "B2B" ? clean(input.contact_title, 120) : null,
  };
}
