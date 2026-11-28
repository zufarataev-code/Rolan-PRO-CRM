type ProposalEmailInput = {
  clientName?: string | null;
  proposalCode?: string | null;
  proposalTitle: string;
  publicUrl: string;
};

/**
 * The same proposal link by SMS / WhatsApp. Owner, 2026-11-26: the proposal must
 * reach the client's phone, not only a mailbox — the link is what gets opened.
 */
export function buildProposalSms(input: ProposalEmailInput & { language?: "en" | "ru" | null }) {
  const name = input.clientName?.trim().split(/\s+/)[0] || "";
  const reference = input.proposalCode?.trim() || input.proposalTitle.trim();
  if (input.language === "ru") {
    return `${name ? `Здравствуйте, ${name}! ` : "Здравствуйте! "}Ваше предложение Rolan PRO${reference ? ` ${reference}` : ""}: ${input.publicUrl} — выберите услуги и нажмите «Согласовать». Вопросы: (424) 325-0512.`;
  }
  return `${name ? `Hi ${name}, ` : "Hi, "}your Rolan PRO proposal${reference ? ` ${reference}` : ""} is ready: ${input.publicUrl} — pick the services and tap Approve. Questions? Call (424) 325-0512.`;
}

export function buildProposalEmail(input: ProposalEmailInput) {
  const greeting = input.clientName?.trim() ? `Hi ${input.clientName.trim()},` : "Hello,";
  const reference = input.proposalCode?.trim() || input.proposalTitle.trim();

  return {
    subject: `Your ROLANPRO proposal package${reference ? ` - ${reference}` : ""}`,
    body: [
      greeting,
      "",
      "Your ROLANPRO client package is ready.",
      "",
      `Open secure package: ${input.publicUrl}`,
      "",
      "The same page contains your proposal, selected scope of work, agreement/signature, warranty information, and payment instructions when the deposit is ready.",
      "",
      "Preferred payment methods are Zelle or bank transfer. If you choose online payment processing, the applicable processing fee is shown before payment.",
      "",
      "This secure client page does not require access to the ROLANPRO CRM. You can also use Download proposal to save a PDF copy.",
      "",
      "If the link does not open, copy the full address above into your browser.",
      "",
      "ROLANPRO",
    ].join("\n"),
  };
}
