import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

type SessionLike = {
  user: { user_id: string };
};

type LegacyProposalLine = {
  service_code?: string;
  room_name?: string;
  window_id?: string;
  title_en?: string;
  description_en?: string;
  quantity?: number;
  unit_label?: string;
  line_price?: number;
  measurement_snapshot?: Record<string, unknown>;
  dynamic_fields?: Record<string, unknown>;
  item_kind?: string;
};

export type LegacyProposalSnapshot = {
  token?: string;
  legacy_order_id?: string;
  order_number?: string;
  title?: string;
  client?: {
    legacy_client_id?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  items?: LegacyProposalLine[];
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function cleanMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10_000_000) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeSnapshot(input: LegacyProposalSnapshot) {
  const token = cleanText(input.token, 120);
  const legacyOrderId = cleanText(input.legacy_order_id, 120);
  const clientName = cleanText(input.client?.name, 160);
  const email = cleanText(input.client?.email, 191).toLowerCase();
  const phone = cleanText(input.client?.phone, 40);
  if (!/^pp_[a-z0-9]+$/i.test(token) || !legacyOrderId || !clientName) {
    throw new Error("Legacy proposal token, order and client are required.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Client email is invalid.");
  }

  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 500).map((item, index) => ({
    serviceCode: cleanText(item.service_code, 50) || "SOLAR_FILM",
    roomName: cleanText(item.room_name, 160) || null,
    windowId: cleanText(item.window_id, 80) || null,
    titleEn: cleanText(item.title_en, 180) || `Proposal item ${index + 1}`,
    descriptionEn: cleanText(item.description_en, 2_000) || null,
    quantity: Math.max(0.01, cleanMoney(item.quantity) || 1),
    unitLabel: cleanText(item.unit_label, 50) || "item",
    linePrice: cleanMoney(item.line_price),
    measurementSnapshot: item.measurement_snapshot && typeof item.measurement_snapshot === "object"
      ? item.measurement_snapshot as Prisma.InputJsonValue
      : undefined,
    dynamicFields: item.dynamic_fields && typeof item.dynamic_fields === "object"
      ? item.dynamic_fields as Prisma.InputJsonValue
      : undefined,
    itemKind: cleanText(item.item_kind, 40) || "service",
  }));
  if (!items.length) throw new Error("The proposal has no billable lines.");

  return {
    token,
    legacyOrderId,
    legacyClientId: cleanText(input.client?.legacy_client_id, 120),
    orderNumber: cleanText(input.order_number, 80),
    title: cleanText(input.title, 180) || `${cleanText(input.order_number, 80) || "ROLANPRO"} Proposal`,
    clientName,
    email,
    phone,
    address: cleanText(input.client?.address, 2_000),
    items,
  };
}

export async function publishLegacyProposal(session: SessionLike, input: LegacyProposalSnapshot) {
  const snapshot = normalizeSnapshot(input);
  const existing = await prisma.proposal.findUnique({
    where: { access_token: snapshot.token },
    select: { proposal_id: true, status: true, deal_id: true, client_id: true },
  });
  if (existing && ["agreement_signed", "approved", "finalized"].includes(existing.status)) {
    throw new Error("A signed proposal cannot be overwritten. Create a new proposal version.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const pipelineStatus = await tx.pipelineStatus.findUnique({
      where: { status_code: "PROPOSAL_SENT" },
      select: { pipeline_status_id: true },
    });
    if (!pipelineStatus) throw new Error("PROPOSAL_SENT pipeline status is not configured.");

    const serviceTypes = await tx.serviceType.findMany({
      where: { service_code: { in: [...new Set(snapshot.items.map(item => item.serviceCode)), "SOLAR_FILM"] } },
      select: { service_type_id: true, service_code: true },
    });
    const serviceTypeByCode = new Map(serviceTypes.map(item => [item.service_code, item.service_type_id]));
    const fallbackServiceTypeId = serviceTypeByCode.get("SOLAR_FILM") || serviceTypes[0]?.service_type_id;
    if (!fallbackServiceTypeId) throw new Error("No proposal service type is configured.");

    let clientId = existing?.client_id;
    let dealId = existing?.deal_id;
    if (!clientId || !dealId) {
      const match = snapshot.email || snapshot.phone
        ? await tx.client.findFirst({
            where: {
              OR: [
                ...(snapshot.email ? [{ email: { equals: snapshot.email, mode: "insensitive" as const } }] : []),
                ...(snapshot.phone ? [{ phone: snapshot.phone }] : []),
              ],
            },
            orderBy: { updated_at: "desc" },
          })
        : null;
      const client = match
        ? await tx.client.update({
            where: { client_id: match.client_id },
            data: {
              name: snapshot.clientName,
              email: snapshot.email || match.email,
              phone: snapshot.phone || match.phone,
              service_address: snapshot.address || match.service_address,
            },
          })
        : await tx.client.create({
        data: {
          client_code: `LEG-${crypto.randomUUID().slice(0, 8)}`,
          name: snapshot.clientName,
          email: snapshot.email || null,
          phone: snapshot.phone || null,
          service_address: snapshot.address || null,
          notes: `Imported from legacy client ${snapshot.legacyClientId || "unknown"}.`,
        },
      });
      clientId = client.client_id;
      const deal = await tx.deal.create({
        data: {
          deal_code: `LEG-${crypto.randomUUID().slice(0, 8)}`,
          client_id: clientId,
          assigned_manager_id: session.user.user_id,
          pipeline_status_id: pipelineStatus.pipeline_status_id,
          title: snapshot.title,
          estimated_value: snapshot.items.reduce((sum, item) => sum + item.linePrice, 0),
          currency: "USD",
          notes: `Imported from legacy order ${snapshot.legacyOrderId}.`,
        },
      });
      dealId = deal.deal_id;
    }

    await tx.client.update({
      where: { client_id: clientId! },
      data: {
        name: snapshot.clientName,
        email: snapshot.email || undefined,
        phone: snapshot.phone || undefined,
        service_address: snapshot.address || undefined,
      },
    });

    const total = snapshot.items.reduce((sum, item) => sum + item.linePrice, 0);
    const proposal = existing
      ? await tx.proposal.update({
          where: { proposal_id: existing.proposal_id },
          data: {
            title: snapshot.title,
            status: existing.status,
            subtotal_amount: total,
            selected_total_amount: total,
            client_message: "Review the saved project scope below, approve the proposal, and continue to payment when ready.",
            notes: `Canonical copy of legacy order ${snapshot.legacyOrderId}.`,
          },
        })
      : await tx.proposal.create({
          data: {
            proposal_code: `PRP-${crypto.randomUUID().slice(0, 8)}`,
            deal_id: dealId!,
            client_id: clientId!,
            created_by: session.user.user_id,
            title: snapshot.title,
            status: "draft",
            access_token: snapshot.token,
            currency: "USD",
            subtotal_amount: total,
            selected_total_amount: total,
            client_message: "Review the saved project scope below, approve the proposal, and continue to payment when ready.",
            notes: `Canonical copy of legacy order ${snapshot.legacyOrderId}.`,
          },
        });

    if (existing) {
      await tx.proposalItem.deleteMany({ where: { proposal_id: proposal.proposal_id } });
    }
    await tx.proposalItem.createMany({
      data: snapshot.items.map((item, index) => ({
        proposal_id: proposal.proposal_id,
        service_type_id: serviceTypeByCode.get(item.serviceCode) || fallbackServiceTypeId,
        item_kind: item.itemKind,
        room_name: item.roomName,
        window_id: item.windowId,
        title_ru: item.titleEn,
        title_en: item.titleEn,
        description_ru: item.descriptionEn,
        description_en: item.descriptionEn,
        measurement_snapshot: item.measurementSnapshot,
        dynamic_fields: item.dynamicFields,
        quantity: item.quantity,
        unit_label: item.unitLabel,
        line_price: item.linePrice,
        is_optional: false,
        client_selected: true,
        sort_order: index + 1,
      })),
    });

    await tx.deal.update({
      where: { deal_id: dealId! },
      data: { estimated_value: total, pipeline_status_id: pipelineStatus.pipeline_status_id },
    });
    return proposal;
  });

  return {
    proposal_id: result.proposal_id,
    public_url: `${getEnv().appUrl.replace(/\/$/, "")}/proposal/${result.access_token}`,
  };
}
