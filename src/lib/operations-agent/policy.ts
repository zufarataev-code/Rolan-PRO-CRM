export const OPERATIONS_AGENT_READ_ACTIONS = [
  "find_client",
  "find_project",
  "get_project",
  "find_lead_or_deal",
  "get_schedule",
] as const;

export const OPERATIONS_AGENT_WRITE_ACTIONS = [
  "create_client",
  "update_client_contact_address",
  "create_manual_project",
  "update_project_notes",
  "record_project_expense",
  "create_task",
  "update_task",
  "create_consultation",
  "record_measurements",
  "add_project_note",
] as const;

export type OperationsAgentReadAction = (typeof OPERATIONS_AGENT_READ_ACTIONS)[number];
export type OperationsAgentWriteAction = (typeof OPERATIONS_AGENT_WRITE_ACTIONS)[number];
export type OperationsAgentAction = OperationsAgentReadAction | OperationsAgentWriteAction;

export function isOperationsAgentAction(action: string): action is OperationsAgentAction {
  return (
    (OPERATIONS_AGENT_READ_ACTIONS as readonly string[]).includes(action) ||
    (OPERATIONS_AGENT_WRITE_ACTIONS as readonly string[]).includes(action)
  );
}

export function isOperationsAgentWriteAction(action: string): action is OperationsAgentWriteAction {
  return (OPERATIONS_AGENT_WRITE_ACTIONS as readonly string[]).includes(action);
}

export function isHighRiskOperationsAction(action: string) {
  return /(delete|archive|refund|payment|invoice|send|message|bulk|price|warranty|credential)/i.test(action);
}
