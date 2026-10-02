import { prisma } from "@/lib/db";

import {
  BANK_CATEGORIES,
  BANK_CATEGORY_CODES,
  categorizationText,
  categorizeTransaction,
  rulePatternFor,
  type CategoryRule,
} from "./categories";
import { decryptBankSecret, encryptBankSecret } from "./crypto";
import {
  createPlaidClient,
  PlaidApiError,
  type PlaidClient,
  type PlaidEnvironment,
  type PlaidTransaction,
} from "./plaid";

/**
 * Bank and card feeds (Owner, 2026-10-02). The owner enters the Plaid keys,
 * connects each bank once through Plaid Link (login happens on the bank's
 * page), and the CRM pulls balances and operations, sorts them by rules and
 * leaves the unclear ones in «Разобрать».
 */

export type BankEnvironment = PlaidEnvironment;

function asEnvironment(value: unknown): BankEnvironment {
  return value === "production" ? "production" : "sandbox";
}

export async function getPlaidSettingsSummary() {
  const settings = await prisma.plaidSettings.findUnique({ where: { settings_id: "primary" } });
  return {
    configured: Boolean(settings),
    environment: asEnvironment(settings?.environment),
    clientIdHint: settings ? `…${settings.client_id.slice(-4)}` : null,
  };
}

export async function savePlaidSettings(input: { clientId?: string; secret?: string; environment?: string }, userId: string) {
  const clientId = String(input.clientId ?? "").trim();
  const secret = String(input.secret ?? "").trim();
  const environment = asEnvironment(input.environment);
  if (!/^[A-Za-z0-9]{10,120}$/.test(clientId)) throw new Error("Проверьте client_id из Plaid.");
  const existing = await prisma.plaidSettings.findUnique({ where: { settings_id: "primary" } });
  if (!secret && !existing) throw new Error("Вставьте secret из Plaid.");
  if (secret && !/^[A-Za-z0-9]{10,120}$/.test(secret)) throw new Error("Проверьте secret из Plaid.");
  await prisma.plaidSettings.upsert({
    where: { settings_id: "primary" },
    create: { settings_id: "primary", client_id: clientId, secret_encrypted: encryptBankSecret(secret), environment, updated_by: userId },
    update: {
      client_id: clientId,
      environment,
      updated_by: userId,
      ...(secret ? { secret_encrypted: encryptBankSecret(secret) } : {}),
    },
  });
  return getPlaidSettingsSummary();
}

export async function plaidClientFromSettings(fetchImpl?: typeof fetch): Promise<{ client: PlaidClient; environment: BankEnvironment }> {
  const settings = await prisma.plaidSettings.findUnique({ where: { settings_id: "primary" } });
  if (!settings) throw new Error("Сначала сохраните ключи Plaid.");
  const environment = asEnvironment(settings.environment);
  return {
    client: createPlaidClient({ clientId: settings.client_id, secret: decryptBankSecret(settings.secret_encrypted), environment }, fetchImpl),
    environment,
  };
}

/** Link token for a new bank, or for re-login of an existing connection (update mode). */
export async function createBankLinkToken(userId: string, connectionId?: string | null) {
  const { client, environment } = await plaidClientFromSettings();
  let accessToken: string | undefined;
  if (connectionId) {
    const connection = await prisma.bankConnection.findUnique({ where: { connection_id: connectionId } });
    if (!connection) throw new Error("Подключение не найдено.");
    if (connection.environment !== environment) throw new Error("Это подключение создано в другом режиме Plaid.");
    accessToken = decryptBankSecret(connection.access_token_encrypted);
  }
  const result = await client.createLinkToken({ userId, accessToken });
  return { linkToken: result.link_token };
}

async function loadRules(): Promise<CategoryRule[]> {
  return prisma.bankCategoryRule.findMany({ select: { rule_id: true, pattern: true, category_code: true } });
}

/** Pulls every page of /transactions/sync; restarts from the original cursor if Plaid reports a mutation mid-pagination. */
export async function collectTransactionChanges(client: PlaidClient, accessToken: string, cursor: string | null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: string[] = [];
    let next = cursor;
    try {
      for (let page = 0; page < 200; page += 1) {
        const result = await client.syncTransactions(accessToken, next);
        added.push(...result.added);
        modified.push(...result.modified);
        removed.push(...result.removed.map((item) => item.transaction_id));
        next = result.next_cursor;
        if (!result.has_more) return { added, modified, removed, cursor: next };
      }
      return { added, modified, removed, cursor: next };
    } catch (error) {
      if (error instanceof PlaidApiError && error.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue;
      throw error;
    }
  }
  throw new Error("Plaid продолжает менять операции во время загрузки — попробуйте обновить позже.");
}

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

async function refreshAccounts(client: PlaidClient, connectionId: string, accessToken: string) {
  const { accounts } = await client.getAccounts(accessToken);
  const now = new Date();
  for (const account of accounts) {
    const balances = {
      name: account.name.slice(0, 160),
      official_name: account.official_name?.slice(0, 200) ?? null,
      mask: account.mask ?? null,
      type: account.type,
      subtype: account.subtype ?? null,
      current_balance: account.balances.current ?? null,
      available_balance: account.balances.available ?? null,
      credit_limit: account.balances.limit ?? null,
      iso_currency: account.balances.iso_currency_code ?? null,
      balance_updated_at: now,
    };
    await prisma.bankAccount.upsert({
      where: { plaid_account_id: account.account_id },
      create: { connection_id: connectionId, plaid_account_id: account.account_id, ...balances },
      update: balances,
    });
  }
}

/** Downloads new operations and balances for one bank connection. */
export async function syncBankConnection(connectionId: string, clientOverride?: PlaidClient) {
  const connection = await prisma.bankConnection.findUnique({ where: { connection_id: connectionId } });
  if (!connection) throw new Error("Подключение не найдено.");
  const client = clientOverride ?? (await plaidClientFromSettings()).client;
  const accessToken = decryptBankSecret(connection.access_token_encrypted);
  try {
    await refreshAccounts(client, connectionId, accessToken);
    const changes = await collectTransactionChanges(client, accessToken, connection.transactions_cursor);
    const accounts = await prisma.bankAccount.findMany({ where: { connection_id: connectionId }, select: { account_id: true, plaid_account_id: true } });
    const accountByPlaidId = new Map(accounts.map((account) => [account.plaid_account_id, account.account_id]));
    const rules = await loadRules();

    for (const tx of [...changes.added, ...changes.modified]) {
      const accountId = accountByPlaidId.get(tx.account_id);
      if (!accountId) continue;
      const fields = {
        account_id: accountId,
        date: toDate(tx.date) ?? new Date(),
        authorized_date: toDate(tx.authorized_date),
        name: (tx.name || "—").slice(0, 300),
        merchant_name: tx.merchant_name?.slice(0, 200) ?? null,
        amount: tx.amount,
        iso_currency: tx.iso_currency_code ?? null,
        pending: Boolean(tx.pending),
        plaid_category: tx.personal_finance_category?.primary ?? null,
        plaid_category_detail: tx.personal_finance_category?.detailed ?? null,
        removed_at: null,
      };
      const existing = await prisma.bankTransaction.findUnique({
        where: { plaid_transaction_id: tx.transaction_id },
        select: { review_status: true },
      });
      // The owner's own choice is never overwritten by a later sync.
      const category = existing?.review_status === "confirmed"
        ? {}
        : categorizeTransaction({ ...fields, amount: tx.amount }, rules);
      await prisma.bankTransaction.upsert({
        where: { plaid_transaction_id: tx.transaction_id },
        create: { plaid_transaction_id: tx.transaction_id, ...fields, ...category },
        update: { ...fields, ...category },
      });
    }
    if (changes.removed.length) {
      await prisma.bankTransaction.updateMany({
        where: { plaid_transaction_id: { in: changes.removed } },
        data: { removed_at: new Date() },
      });
    }
    await prisma.bankConnection.update({
      where: { connection_id: connectionId },
      data: { transactions_cursor: changes.cursor, last_synced_at: new Date(), status: "active", error_code: null },
    });
    return { added: changes.added.length, modified: changes.modified.length, removed: changes.removed.length };
  } catch (error) {
    if (error instanceof PlaidApiError) {
      await prisma.bankConnection.update({
        where: { connection_id: connectionId },
        data: { status: error.code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error", error_code: error.code.slice(0, 80) },
      });
    }
    throw error;
  }
}

export async function syncAllBankConnections() {
  const { client, environment } = await plaidClientFromSettings();
  const connections = await prisma.bankConnection.findMany({ where: { environment }, select: { connection_id: true, institution_name: true } });
  const results = [];
  for (const connection of connections) {
    try {
      results.push({ connectionId: connection.connection_id, ok: true, ...(await syncBankConnection(connection.connection_id, client)) });
    } catch (error) {
      results.push({ connectionId: connection.connection_id, ok: false, message: error instanceof Error ? error.message : "Ошибка загрузки" });
    }
  }
  return results;
}

/** After Plaid Link: keeps the bank login (encrypted), its accounts, and loads operations. */
export async function connectBank(publicToken: string, userId: string) {
  if (!/^public-[a-z]+-[A-Za-z0-9-]+$/.test(publicToken)) throw new Error("Неверный ответ Plaid Link.");
  const { client, environment } = await plaidClientFromSettings();
  const exchanged = await client.exchangePublicToken(publicToken);
  const { item } = await client.getAccounts(exchanged.access_token);
  const institutionName = item.institution_id
    ? await client.getInstitutionName(item.institution_id).catch(() => null)
    : null;
  const connection = await prisma.bankConnection.upsert({
    where: { plaid_item_id: exchanged.item_id },
    create: {
      plaid_item_id: exchanged.item_id,
      environment,
      institution_id: item.institution_id ?? null,
      institution_name: institutionName,
      access_token_encrypted: encryptBankSecret(exchanged.access_token),
      created_by: userId,
    },
    update: {
      access_token_encrypted: encryptBankSecret(exchanged.access_token),
      status: "active",
      error_code: null,
      institution_name: institutionName ?? undefined,
    },
  });
  const sync = await syncBankConnection(connection.connection_id, client);
  return { connectionId: connection.connection_id, institutionName, ...sync };
}

export async function bankOverview(options: { reviewOnly?: boolean; limit?: number } = {}) {
  const settings = await getPlaidSettingsSummary();
  const connections = await prisma.bankConnection.findMany({
    where: { environment: settings.environment },
    include: { accounts: { orderBy: { name: "asc" } } },
    orderBy: { created_at: "asc" },
  });
  const accountIds = connections.flatMap((connection) => connection.accounts.map((account) => account.account_id));
  const baseWhere = { account_id: { in: accountIds }, removed_at: null };
  const [transactions, reviewCount] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { ...baseWhere, ...(options.reviewOnly ? { review_status: "needs_review" } : {}) },
      orderBy: [{ date: "desc" }, { created_at: "desc" }],
      take: Math.min(Math.max(options.limit ?? 200, 1), 1000),
    }),
    prisma.bankTransaction.count({ where: { ...baseWhere, review_status: "needs_review" } }),
  ]);

  const accounts = connections.flatMap((connection) => connection.accounts.map((account) => ({
    accountId: account.account_id,
    connectionId: connection.connection_id,
    institution: connection.institution_name ?? "Банк",
    name: account.name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    current: account.current_balance === null ? null : Number(account.current_balance),
    available: account.available_balance === null ? null : Number(account.available_balance),
    limit: account.credit_limit === null ? null : Number(account.credit_limit),
    currency: account.iso_currency ?? "USD",
    updatedAt: account.balance_updated_at?.toISOString() ?? null,
  })));
  const cash = accounts.filter((account) => account.type === "depository").reduce((sum, account) => sum + (account.current ?? 0), 0);
  const cardDebt = accounts.filter((account) => account.type === "credit").reduce((sum, account) => sum + (account.current ?? 0), 0);

  return {
    settings,
    connections: connections.map((connection) => ({
      connectionId: connection.connection_id,
      institution: connection.institution_name ?? "Банк",
      status: connection.status,
      errorCode: connection.error_code,
      lastSyncedAt: connection.last_synced_at?.toISOString() ?? null,
    })),
    accounts,
    totals: { cash, cardDebt },
    reviewCount,
    categories: BANK_CATEGORIES,
    transactions: transactions.map((tx) => ({
      transactionId: tx.transaction_id,
      accountId: tx.account_id,
      date: tx.date.toISOString().slice(0, 10),
      name: tx.name,
      merchant: tx.merchant_name,
      amount: Number(tx.amount),
      pending: tx.pending,
      category: tx.category_code,
      reviewStatus: tx.review_status,
      note: tx.note,
    })),
  };
}

/**
 * The owner sets a category. With «Запомнить» the merchant/description becomes
 * a rule, and every other unreviewed operation with the same text follows it.
 */
export async function updateBankTransaction(
  transactionId: string,
  input: { category_code?: string; remember?: boolean; note?: string | null },
  userId: string,
) {
  const tx = await prisma.bankTransaction.findUnique({ where: { transaction_id: transactionId } });
  if (!tx) throw new Error("Операция не найдена.");
  const category = String(input.category_code ?? tx.category_code ?? "");
  if (!BANK_CATEGORY_CODES.has(category)) throw new Error("Неизвестная категория.");

  let ruleId: string | null = tx.rule_id;
  let applied = 0;
  if (input.remember) {
    const pattern = rulePatternFor(tx);
    if (pattern.length >= 3) {
      const rule = await prisma.bankCategoryRule.upsert({
        where: { pattern },
        create: { pattern, category_code: category, created_by: userId },
        update: { category_code: category },
      });
      ruleId = rule.rule_id;
      const candidates = await prisma.bankTransaction.findMany({
        where: { review_status: "needs_review", removed_at: null, transaction_id: { not: transactionId } },
        select: { transaction_id: true, name: true, merchant_name: true },
      });
      const matching = candidates.filter((candidate) => categorizationText(candidate).includes(pattern)).map((candidate) => candidate.transaction_id);
      if (matching.length) {
        applied = (await prisma.bankTransaction.updateMany({
          where: { transaction_id: { in: matching } },
          data: { category_code: category, review_status: "auto", rule_id: rule.rule_id },
        })).count;
      }
    }
  }
  await prisma.bankTransaction.update({
    where: { transaction_id: transactionId },
    data: {
      category_code: category,
      review_status: "confirmed",
      rule_id: ruleId,
      ...(input.note !== undefined ? { note: input.note ? String(input.note).slice(0, 2000) : null } : {}),
    },
  });
  return { transactionId, category, appliedToOthers: applied };
}
