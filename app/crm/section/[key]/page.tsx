"use client";

import { use } from "react";

import { crmSectionSrc } from "@/features/crm-shell/nav";
import { useCrmRole } from "@/features/crm-shell/shell";
import { PageHeader } from "@/features/crm-shell/ui";
import { WorkingSection } from "@/features/crm-shell/working-frame";

/** A section not redrawn yet: the working CRM's own screen, opened inside the new frame. */
export default function CrmSectionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const section = crmSectionSrc(key, useCrmRole());
  if (!section) return <PageHeader title="Раздел недоступен" sub="Такого раздела нет или он открыт только владельцу." />;
  return <WorkingSection src={section.src} title={section.title} />;
}
