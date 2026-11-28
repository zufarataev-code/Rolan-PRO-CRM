/**
 * Which project a refused workspace save is about.
 *
 * The CRM sends the whole workspace in one save, so a change the server refuses on
 * one project used to block every other project's save from that device: a stale
 * change to a closed project R-261122-165, left on the phone, refused the measurement
 * of a new project R-261127-179 (Owner, 2026-11-27: «невозможно работать так»).
 *
 * When validation fails, the server tries each changed project on its own, with
 * the other changed projects as they are on the server. The first project whose
 * own change is refused is named back, so the browser sets only that project's
 * change aside and saves the rest. When no single project is refused on its own
 * (the cause is outside projects, or only a combination fails), nothing is named
 * and the save is refused as before.
 */

type Row = Record<string, unknown>;

const LISTS = ['orders', 'archivedOrders'] as const;
// Validation on the failure path only; a bound keeps a pathological save cheap.
const MAX_CHANGED_PROJECTS = 30;

const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object' && !Array.isArray(item)) : [];
const idOf = (row: Row) => String(row.id ?? '');

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Row).sort().map(key => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function projectsById(payload: Row): Map<string, { list: (typeof LISTS)[number]; row: Row }> {
  const map = new Map<string, { list: (typeof LISTS)[number]; row: Row }>();
  for (const list of LISTS) {
    for (const row of rows(payload[list])) {
      const id = idOf(row);
      if (id && !map.has(id)) map.set(id, { list, row });
    }
  }
  return map;
}

/** Project ids whose saved copy differs between the two payloads (added, changed, moved or removed). */
export function changedProjectIds(current: Row, next: Row): string[] {
  const before = projectsById(current);
  const after = projectsById(next);
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].filter(id => {
    const a = before.get(id);
    const b = after.get(id);
    return !a || !b || a.list !== b.list || stable(a.row) !== stable(b.row);
  });
}

/** `next` with the given projects put back as they are in `current`. */
function withProjectsFromCurrent(current: Row, next: Row, ids: ReadonlySet<string>): Row {
  const before = projectsById(current);
  const candidate: Row = structuredClone(next);
  for (const list of LISTS) {
    if (Array.isArray(candidate[list])) candidate[list] = rows(candidate[list]).filter(row => !ids.has(idOf(row)));
  }
  for (const id of ids) {
    const saved = before.get(id);
    if (!saved) continue; // a new project that is not tried here is simply left out
    const list = rows(candidate[saved.list]);
    list.push(structuredClone(saved.row));
    candidate[saved.list] = list;
  }
  return candidate;
}

export interface RefusedProject {
  id: string;
  number: string;
  message: string;
}

/**
 * The first changed project that `validate` refuses on its own, or null.
 * `validate` gets fresh copies each time, as validators normalise in place.
 */
export function findRefusedProject(
  current: Row,
  next: Row,
  validate: (current: Row, candidate: Row) => string | null,
): RefusedProject | null {
  const changed = changedProjectIds(current, next);
  if (!changed.length || changed.length > MAX_CHANGED_PROJECTS) return null;
  // With every project as on the server the save must pass; otherwise the cause is
  // outside projects (a directory, a client card…) and no project is to blame.
  if (validate(structuredClone(current), withProjectsFromCurrent(current, next, new Set(changed)))) return null;
  const after = projectsById(next);
  const before = projectsById(current);
  for (const id of changed) {
    const others = new Set(changed.filter(other => other !== id));
    const message = validate(structuredClone(current), withProjectsFromCurrent(current, next, others));
    if (message) {
      const row = after.get(id)?.row ?? before.get(id)?.row ?? {};
      return { id, number: String(row.number ?? '').trim(), message };
    }
  }
  return null;
}

/** The refusal text with the project named, unless it already names it. */
export function refusalNamingProject(message: string, project: RefusedProject | null): string {
  if (!project?.number || message.includes(project.number)) return message;
  return `${project.number}: ${message}`;
}
