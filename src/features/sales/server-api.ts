import { cookies, headers } from "next/headers";

import { getEnv } from "@/lib/env";

type ApiEnvelope<T> = {
  data: T | null;
  errors?: Array<{
    message?: string;
  }>;
};

async function fetchSalesApi<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const baseUrl = host
    ? `${forwardedProto ?? "http"}://${host}`
    : getEnv().appUrl;

  const response = await fetch(new URL(path, baseUrl), {
    cache: "no-store",
    headers: {
      cookie: cookieHeader,
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.data) {
    throw new Error(payload?.errors?.[0]?.message ?? `Request failed for ${path}`);
  }

  return payload.data;
}

export async function getManagerDashboardData() {
  const [dashboard, deals, followUps, tasks] = await Promise.all([
    fetchSalesApi<{
      kpis: Record<string, number>;
      recent_activity: Array<{
        activity_id: string;
        action_key: string;
        message: string;
        created_at: string;
      }>;
    }>("/api/v1/crm/dashboard"),
    fetchSalesApi<{ items: any[] }>("/api/v1/deals"),
    fetchSalesApi<{ items: any[] }>("/api/v1/follow-ups"),
    fetchSalesApi<{ items: any[] }>("/api/v1/tasks"),
  ]);

  return {
    dashboard,
    deals: deals.items,
    followUps: followUps.items,
    tasks: tasks.items,
  };
}

export async function getPipelineBoardData() {
  const data = await fetchSalesApi<{ columns: any[] }>("/api/v1/pipeline/board");
  return data.columns;
}

export async function getLeadsData() {
  const data = await fetchSalesApi<{ items: any[] }>("/api/v1/leads");
  return data.items;
}

export async function getClientsData() {
  const data = await fetchSalesApi<{ items: any[] }>("/api/v1/clients");
  return data.items;
}

export async function getDealCardData(dealId: string) {
  const data = await fetchSalesApi<{ deal: any }>(`/api/v1/deals/${dealId}`);
  return data.deal;
}
