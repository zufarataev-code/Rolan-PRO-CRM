"use client";

import { use } from "react";

import { crmSectionSrc } from "@/features/crm-shell/nav";
import { useCrmRole } from "@/features/crm-shell/shell";
import { PageHeader } from "@/features/crm-shell/ui";

/**
 * A section not redrawn yet. The frame itself (shell.tsx) shows the working
 * CRM's own screen for it; this page only answers for an address that is not
 * a section or is not open to this role.
 */
export default function CrmSectionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const section = crmSectionSrc(key, useCrmRole());
  if (!section) return <PageHeader title="Раздел недоступен" sub="Такого раздела нет или он открыт только владельцу." />;
  return null;
}
