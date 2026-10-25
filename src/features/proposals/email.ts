type ProposalEmailInput = {
  clientName?: string | null;
  proposalCode?: string | null;
  proposalTitle: string;
  publicUrl: string;
};

type AgreementSignedEmailInput = {
  clientName?: string | null;
  proposalCode?: string | null;
  proposalTitle: string;
  signerName: string;
  signedAt: Date;
  publicUrl: string;
  managerUrl: string;
};

function signedAtLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "long",
    timeStyle: "short",
  }).format(value);
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

export function buildAgreementSignedClientEmail(input: AgreementSignedEmailInput) {
  const greeting = input.clientName?.trim() ? `Hi ${input.clientName.trim()},` : "Hello,";
  const reference = input.proposalCode?.trim() || input.proposalTitle.trim();

  return {
    subject: `ROLANPRO proposal signed${reference ? ` - ${reference}` : ""}`,
    body: [
      greeting,
      "",
      "Thank you. Your ROLANPRO proposal and agreement have been signed successfully.",
      "",
      `Signed by: ${input.signerName}`,
      `Signed on: ${signedAtLabel(input.signedAt)} PT`,
      "",
      `Open your secure proposal package: ${input.publicUrl}`,
      "",
      "You can review the accepted scope, download a PDF copy, and use the payment options on the same page.",
      "",
      "ROLANPRO",
    ].join("\n"),
  };
}

export function buildAgreementSignedManagerEmail(input: AgreementSignedEmailInput) {
  const reference = input.proposalCode?.trim() || input.proposalTitle.trim();

  return {
    subject: `Клиент подписал КП${reference ? ` — ${reference}` : ""}`,
    body: [
      "Клиент подписал КП и agreement.",
      "",
      `Клиент: ${input.clientName?.trim() || "Не указан"}`,
      `Подписал: ${input.signerName}`,
      `Время: ${signedAtLabel(input.signedAt)} PT`,
      `КП: ${reference || "Без номера"}`,
      "",
      `Открыть КП в CRM: ${input.managerUrl}`,
      `Страница клиента: ${input.publicUrl}`,
      "",
      "Проект автоматически переведён в этап «КП принято».",
    ].join("\n"),
  };
}
