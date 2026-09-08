import { injectMobileProposalsCards as injectMobileProposalsCardsCore } from "./mobile-proposals-core";
import { injectRoleUiPolicy } from "./role-ui";

export function injectMobileProposalsCards(html: string) {
  return injectRoleUiPolicy(injectMobileProposalsCardsCore(html));
}
