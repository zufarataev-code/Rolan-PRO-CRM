import { redirect } from "next/navigation";

import { GmailMailbox } from "@/components/gmail-mailbox";
import { ProductShell, type ProductNavGroup } from "@/components/product-shell";
import { ROLE_CODES } from "@/lib/auth/constants";
import { requireAppSession } from "@/lib/auth/app-session";

const MAIL_ROLES = [ROLE_CODES.OWNER, ROLE_CODES.MANAGER] as const;

export default async function MailPage() {
  const session = await requireAppSession(MAIL_ROLES);
  if (!session) redirect("/login");

  const isOwner = session.roles.includes(ROLE_CODES.OWNER);
  const navGroups: ProductNavGroup[] = [
    {
      label: "ROLANPRO",
      items: [
        { href: "/legacy-crm", label: "Рабочая CRM" },
        { href: "/mail", label: "Почта" },
        { href: isOwner ? "/owner" : "/manager", label: "Личный кабинет" },
      ],
    },
  ];

  return (
    <ProductShell
      roleLabel={isOwner ? "Владелец" : "Менеджер"}
      homeHref="/legacy-crm"
      navGroups={navGroups}
      title="Рабочая почта"
      subtitle="Входящие, исходящие, поиск, ответы и привязка писем к заказам."
      kicker="Коммуникации / Gmail"
      activeHref="/mail"
    >
      <GmailMailbox canConnect={isOwner} />
    </ProductShell>
  );
}
