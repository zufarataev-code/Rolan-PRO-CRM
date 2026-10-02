/**
 * Categories of bank/card operations and the rules that assign them.
 * Plaid sign convention: a positive amount is money going out.
 */

export type CategoryKind = "expense" | "income" | "transfer";

export const BANK_CATEGORIES = [
  { code: "ADVERTISING", label: "Реклама", kind: "expense" },
  { code: "FILM_PURCHASE", label: "Закупка плёнки", kind: "expense" },
  { code: "SHIPPING", label: "Доставка и таможня", kind: "expense" },
  { code: "MATERIALS", label: "Расходники и инструмент", kind: "expense" },
  { code: "INSTALLER_PAY", label: "Оплата специалистов по установке", kind: "expense" },
  { code: "PAYROLL", label: "Зарплата и оклады", kind: "expense" },
  { code: "FUEL", label: "Бензин", kind: "expense" },
  { code: "VEHICLE", label: "Авто: кредит, ремонт", kind: "expense" },
  { code: "RENT", label: "Аренда", kind: "expense" },
  { code: "INSURANCE", label: "Страховки", kind: "expense" },
  { code: "SOFTWARE", label: "Программы и сервисы", kind: "expense" },
  { code: "SERVICES", label: "Подрядчики: бухгалтер, ведение рекламы", kind: "expense" },
  { code: "TAXES", label: "Налоги", kind: "expense" },
  { code: "BANK_FEES", label: "Комиссии банка и Stripe", kind: "expense" },
  { code: "OWNER_DRAW", label: "Личное / выплата владельцу", kind: "expense" },
  { code: "OTHER_EXPENSE", label: "Прочий расход", kind: "expense" },
  { code: "CLIENT_PAYMENT", label: "Оплата клиента", kind: "income" },
  { code: "STRIPE_PAYOUT", label: "Выплата Stripe (оплаты клиентов)", kind: "income" },
  { code: "OTHER_INCOME", label: "Прочий доход", kind: "income" },
  { code: "TRANSFER", label: "Перевод между своими счетами / оплата карты", kind: "transfer" },
] as const;

export type BankCategoryCode = (typeof BANK_CATEGORIES)[number]["code"];

export const BANK_CATEGORY_CODES = new Set<string>(BANK_CATEGORIES.map((category) => category.code));

export function bankCategory(code: string | null | undefined) {
  return BANK_CATEGORIES.find((category) => category.code === code) ?? null;
}

export type CategorizeInput = {
  name: string;
  merchant_name?: string | null;
  amount: number;
  plaid_category?: string | null;
  plaid_category_detail?: string | null;
};

export type CategoryRule = { rule_id: string; pattern: string; category_code: string };

export type CategorizeResult = {
  category_code: BankCategoryCode;
  review_status: "auto" | "needs_review";
  rule_id: string | null;
};

/** Text the rules look at: the merchant when Plaid knows it, then the raw bank description. */
export function categorizationText(input: Pick<CategorizeInput, "name" | "merchant_name">) {
  return `${input.merchant_name ?? ""} ${input.name}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** A pattern to remember for «Запомнить»: the merchant, or the description without digits and ids. */
export function rulePatternFor(input: Pick<CategorizeInput, "name" | "merchant_name">) {
  const base = (input.merchant_name || input.name || "").toLowerCase();
  return base.replace(/[#*]?\d[\d\-/.:]*/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

// Built-in keywords. `sure` assigns the category without review; otherwise it is a suggestion.
const KEYWORD_RULES: Array<{ pattern: RegExp; code: BankCategoryCode; sure: boolean; direction?: "in" | "out" }> = [
  { pattern: /google\s*\*?\s*ads|\bgoogle ads\b|adwords/, code: "ADVERTISING", sure: true, direction: "out" },
  { pattern: /facebk|facebook|\bmeta\b.*ads|meta platforms/, code: "ADVERTISING", sure: true, direction: "out" },
  { pattern: /\bstripe\b/, code: "STRIPE_PAYOUT", sure: true, direction: "in" },
  { pattern: /\bstripe\b/, code: "BANK_FEES", sure: false, direction: "out" },
  { pattern: /\birs\b|franchise tax|\bftb\b|cdtfa|tax payment/, code: "TAXES", sure: true, direction: "out" },
  { pattern: /chevron|\barco\b|\bshell\b|mobil|exxon|valero|circle k|speedway|76 gas|costco gas/, code: "FUEL", sure: true, direction: "out" },
  { pattern: /geico|progressive|state farm|allstate|insurance/, code: "INSURANCE", sure: true, direction: "out" },
  { pattern: /intuit|quickbooks|google \*?(workspace|gsuite|voice)|google gsuite|openai|anthropic|claude\.ai|chatgpt|runcloud|digitalocean|railway|cloudflare|github|shopify|notion|zoom\.us|canva/, code: "SOFTWARE", sure: true, direction: "out" },
  { pattern: /alibaba|aliexpress|1688\.com/, code: "FILM_PURCHASE", sure: false, direction: "out" },
  { pattern: /\bdhl\b|fedex|\bups\b|freight|customs|\bcbp\b|forwarder/, code: "SHIPPING", sure: false, direction: "out" },
  { pattern: /home depot|lowe'?s|harbor freight|ace hardware/, code: "MATERIALS", sure: false, direction: "out" },
];

// Plaid personal finance categories (primary / detailed).
function fromPlaidCategory(primary: string, detailed: string, moneyIn: boolean): { code: BankCategoryCode; sure: boolean } | null {
  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return { code: "TRANSFER", sure: true };
  if (primary === "LOAN_PAYMENTS") {
    return detailed.includes("CREDIT_CARD") ? { code: "TRANSFER", sure: true } : { code: "VEHICLE", sure: false };
  }
  if (primary === "BANK_FEES") return { code: "BANK_FEES", sure: true };
  if (primary === "RENT_AND_UTILITIES") return { code: "RENT", sure: false };
  if (detailed.includes("GAS")) return { code: "FUEL", sure: true };
  if (primary === "TRANSPORTATION") return { code: "VEHICLE", sure: false };
  if (detailed.includes("TAX_PAYMENT")) return { code: "TAXES", sure: true };
  if (detailed.includes("INSURANCE")) return { code: "INSURANCE", sure: true };
  if (detailed.includes("ACCOUNTING")) return { code: "SERVICES", sure: true };
  if (primary === "HOME_IMPROVEMENT" || primary === "GENERAL_MERCHANDISE") return { code: "MATERIALS", sure: false };
  if (primary === "INCOME") return { code: moneyIn ? "OTHER_INCOME" : "OTHER_EXPENSE", sure: false };
  return null;
}

export function categorizeTransaction(input: CategorizeInput, rules: readonly CategoryRule[] = []): CategorizeResult {
  const text = categorizationText(input);
  const moneyIn = input.amount < 0;

  // 1. The owner's remembered rules win.
  const rule = rules
    .filter((candidate) => candidate.pattern && text.includes(candidate.pattern.toLowerCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (rule && BANK_CATEGORY_CODES.has(rule.category_code)) {
    return { category_code: rule.category_code as BankCategoryCode, review_status: "auto", rule_id: rule.rule_id };
  }

  // 2. Built-in keywords.
  const keyword = KEYWORD_RULES.find((candidate) =>
    candidate.pattern.test(text) && (!candidate.direction || (candidate.direction === "in") === moneyIn),
  );
  if (keyword) return { category_code: keyword.code, review_status: keyword.sure ? "auto" : "needs_review", rule_id: null };

  // 3. Plaid's own category.
  const plaid = fromPlaidCategory(
    String(input.plaid_category || "").toUpperCase(),
    String(input.plaid_category_detail || "").toUpperCase(),
    moneyIn,
  );
  if (plaid) return { category_code: plaid.code, review_status: plaid.sure ? "auto" : "needs_review", rule_id: null };

  // 4. Unknown: the owner decides once, «Запомнить» keeps the rule.
  return { category_code: moneyIn ? "OTHER_INCOME" : "OTHER_EXPENSE", review_status: "needs_review", rule_id: null };
}
