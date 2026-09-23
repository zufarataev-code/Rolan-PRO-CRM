import { injectMobileProposalsCards as injectMobileProposalsCardsCore } from "./mobile-proposals-core";
import { injectOrderIntakeCleanup } from "./order-intake-cleanup";
import { injectRoleUiPolicy } from "./role-ui";
import { injectSurveyorTaskActions } from "./surveyor-task-actions";

export function injectMobileProposalsCards(html: string) {
  return injectSurveyorTaskActions(
    injectOrderIntakeCleanup(injectRoleUiPolicy(injectMobileProposalsCardsCore(html))),
  );
}
