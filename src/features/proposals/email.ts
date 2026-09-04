type ProposalEmailInput = {
  clientName?: string | null;
  proposalCode?: string | null;
  proposalTitle: string;
  publicUrl: string;
};

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
