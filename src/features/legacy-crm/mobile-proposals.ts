import { injectMobileProposalsCards as injectMobileProposalsCardsCore } from "./mobile-proposals-core";
import { injectOrderIntakeCleanup } from "./order-intake-cleanup";
import { injectRoleUiPolicy } from "./role-ui";

export function injectMobileProposalsCards(html: string) {
  return injectOrderIntakeCleanup(injectRoleUiPolicy(injectMobileProposalsCardsCore(html)));
}
