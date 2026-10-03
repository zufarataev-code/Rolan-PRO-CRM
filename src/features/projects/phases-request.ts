import { isProjectConstructorUuid } from "./constructor-request";
import type { CreateProjectPhaseInput } from "./phases";

export function parseProjectPhaseInput(value: unknown): CreateProjectPhaseInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 160) return null;
  if (typeof body.starts_at !== "string" || typeof body.ends_at !== "string") return null;
  const start = Date.parse(body.starts_at), end = Date.parse(body.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (!Array.isArray(body.position_ids) || !body.position_ids.length || !body.position_ids.every(isProjectConstructorUuid)) return null;
  if (!Array.isArray(body.assignments) || !body.assignments.every(row => row && typeof row === "object"
    && isProjectConstructorUuid(row.project_position_id) && isProjectConstructorUuid(row.installer_id))) return null;
  if (body.crew_id != null && !isProjectConstructorUuid(body.crew_id)) return null;
  if (body.client_confirmed !== undefined && typeof body.client_confirmed !== "boolean") return null;
  for (const key of ["notes", "client_confirmation_note"]) {
    if (body[key] != null && (typeof body[key] !== "string" || (body[key] as string).length > 10000)) return null;
  }
  return {
    title: body.title.trim(), starts_at: body.starts_at, ends_at: body.ends_at,
    position_ids: body.position_ids, assignments: body.assignments,
    crew_id: body.crew_id as string | null | undefined,
    client_confirmed: body.client_confirmed as boolean | undefined,
    notes: body.notes as string | null | undefined,
    client_confirmation_note: body.client_confirmation_note as string | null | undefined,
  };
}
