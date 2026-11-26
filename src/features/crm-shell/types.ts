/** Read models of the new interface. They are produced by the CRM's own code (private/legacy/crm-shell-models.js). */

export type CrmShellUser = { id: string; name: string; role: "owner" | "manager"; roleLabel: string };

export type CrmProjectCard = {
  id: string;
  number: string;
  client: string;
  address: string;
  status: string;
  sum: number;
  paid: number;
  debt: number;
  urgency: string;
  accent: { label: string; color: string } | null;
  next: string;
  installationAt: string;
  services: number;
  servicesDone: number;
};

export type CrmOverview = {
  user: CrmShellUser;
  activeCount: number;
  activeRevenue: number;
  activePaid: number;
  awaiting: number;
  reachedCount: number;
  lineTotal: number;
  lineDone: number;
  paidPct: number;
  reachedPct: number;
  linePct: number;
  awaitingPct: number;
  directions: { title: string; sum: number; color: string }[];
  funnel: { id: string; title: string; color: string; count: number; sum: number }[];
  month: { revenue: number; paid: number; created: number; clients: number; bars: { label: string; value: number }[] };
  attention: CrmProjectCard[];
  installs: { id: string; number: string; client: string; at: string; crew: string[] }[];
};

export type CrmProjectsBoard = {
  user: CrmShellUser;
  columns: { id: string; title: string; color: string; count: number; sum: number; hidden: number; cards: CrmProjectCard[] }[];
};

export type CrmStage = { state: "done" | "current" | "next" | "skipped"; color: string; label: string; hint: string };

export type CrmProjectDetails = {
  id: string;
  number: string;
  status: string;
  client: { name: string; phone: string; address: string };
  manager: string;
  measurer: string;
  canSeeMoney: boolean;
  revenue: number;
  paid: number;
  paidPct: number;
  stagePct: number;
  stageDone: number;
  stageTotal: number;
  workPct: number;
  doneLines: number;
  windowCount: number;
  sizedCount: number;
  sqft: number;
  stages: CrmStage[];
  next: { title: string; sub: string; variant: string } | null;
  urgency: string;
  lines: { key: string; name: string; direction: string; color: string; qty: number; unit: string; price: number; crew: string[]; installationAt: string; status: "planned" | "in_progress" | "done" }[];
  windows: { key: string; roomId: string; room: string; name: string; size: string; sqft: number; film: string; verified: boolean }[];
  photos: { id: string; url: string; roomId: string; marks: { key: string; x: number; y: number }[] }[];
};

export type CrmProjectPage = { user: CrmShellUser; project: CrmProjectDetails | null };

/** Leads that already have a project, by lead id. */
export type CrmLeadLinks = { user: CrmShellUser; links: Record<string, { projectId: string; number: string; archived: boolean }> };

export type CrmCalendarEvent = {
  id: string;
  kind: "consultation" | "measure" | "install" | "complaint";
  title: string;
  color: string;
  at: string;
  /** Local day of the event, YYYY-MM-DD, in the viewer's time zone. */
  day: string;
  time: string;
  client: string;
  people: string;
  address: string;
  note: string;
  number: string;
  projectId: string;
};

export type CrmCalendar = { user: CrmShellUser; from: string; to: string; today: string; events: CrmCalendarEvent[] };

export type CrmClientRow = {
  id: string;
  name: string;
  companyType: string;
  representative: string;
  phone: string;
  phoneVerified: boolean;
  email: string;
  address: string;
  b2b: boolean;
  regular: boolean;
  relationship: string;
  source: string;
  referredBy: string;
  projects: number;
  addresses: number;
  revenue: number;
  debt: number;
  portal: boolean;
  lastAt: string;
  recent: { id: string; number: string; status: string }[];
  /** Lower-case name, company, person, phone, email and every address, for the search box. */
  search: string;
};

export type CrmClients = { user: CrmShellUser; counts: { all: number; b2c: number; b2b: number; regular: number }; clients: CrmClientRow[] };

export type CrmTaskRow = {
  id: string;
  title: string;
  /** The due day in the viewer's time zone, YYYY-MM-DD; empty when the task has no date. */
  dueKey: string;
  time: string;
  team: string[];
  responsible: string;
  /** The viewer is the one responsible or is on the task's team. */
  mine: boolean;
  client: string;
  clientId: string;
  notes: string;
  agent: boolean;
  done: boolean;
  doneAt: string;
};

export type CrmTasks = { user: CrmShellUser; open: CrmTaskRow[]; done: CrmTaskRow[]; doneTotal: number };
