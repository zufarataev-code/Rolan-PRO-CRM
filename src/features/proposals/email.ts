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
    subject: `Your ROLANPRO proposal${reference ? ` - ${reference}` : ""}`,
    body: [
      greeting,
      "",
      "Your ROLANPRO proposal is ready.",
      "",
      `Open proposal: ${input.publicUrl}`,
      "",
      "This secure client page does not require access to the ROLANPRO CRM. You can review the scope, approve the proposal, and use Download proposal to save a PDF copy.",
      "",
      "If the button or link does not open, copy the full address above into your browser.",
      "",
      "ROLANPRO",
    ].join("\n"),
  };
}
