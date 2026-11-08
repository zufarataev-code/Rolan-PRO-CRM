/**
 * Центр управления: кто из агентов над чем работает прямо сейчас.
 *
 * Открытый пулл-реквест — это «занятая» задача (правило .agents/PROTOCOL.md).
 * Агент определяется по префиксу ветки: `claude/…` или `codex/…`.
 * Метки ставит радар пересечений (.github/workflows/agent-conflict-radar.yml):
 * `conflict-risk` — два открытых PR правят одни и те же файлы;
 * `stale` — нет новых коммитов дольше 14 дней (по дате коммита, а не
 * `updated_at`, который сдвигают сами метки и комментарии).
 */

export type AgentName = "Claude" | "Codex" | "Другие";

export type AgentPr = {
  number: number;
  title: string;
  branch: string;
  agent: AgentName;
  draft: boolean;
  updatedAt: string;
  url: string;
  stale: boolean;
  conflictRisk: boolean;
  needsOwner: boolean;
};

export type AgentBoard = {
  ok: boolean;
  error?: string;
  /** When this picture was read from GitHub; older than now when GitHub is failing. */
  asOf: string;
  byAgent: Record<AgentName, AgentPr[]>;
  staleCount: number;
  conflictCount: number;
  ownerCount: number;
};

export const STALE_DAYS = 14;
export const REPO = "zufarataev-code/rolan-pro-crm";

export function agentForBranch(branch: string): AgentName {
  const head = branch.toLowerCase();
  if (head.startsWith("claude/")) return "Claude";
  if (head.startsWith("codex/") || head.startsWith("chatgpt/")) return "Codex";
  return "Другие";
}

type GitHubPull = {
  number: number;
  title: string;
  draft?: boolean;
  updated_at: string;
  html_url: string;
  head?: { ref?: string };
  labels?: { name?: string }[];
};

export function buildAgentBoard(pulls: GitHubPull[], now = new Date()): AgentBoard {
  const byAgent: Record<AgentName, AgentPr[]> = { Claude: [], Codex: [], Другие: [] };
  const staleBefore = now.getTime() - STALE_DAYS * 86_400_000;
  const radarSeen = pulls.some((pull) => (pull.labels ?? []).some((label) => label.name === "stale" || label.name === "conflict-risk"));
  for (const pull of pulls) {
    const branch = pull.head?.ref ?? "";
    const labels = new Set((pull.labels ?? []).map((label) => label.name ?? ""));
    const pr: AgentPr = {
      number: pull.number,
      title: pull.title,
      branch,
      agent: agentForBranch(branch),
      draft: Boolean(pull.draft),
      updatedAt: pull.updated_at,
      url: pull.html_url,
      // The radar's commit-based label wins; updated_at is only a fallback before its first run.
      stale: labels.has("stale") || (!radarSeen && new Date(pull.updated_at).getTime() < staleBefore),
      conflictRisk: labels.has("conflict-risk"),
      needsOwner: labels.has("owner"),
    };
    byAgent[pr.agent].push(pr);
  }
  const all = Object.values(byAgent).flat();
  for (const list of Object.values(byAgent)) {
    // Fresh work first, stale at the bottom.
    list.sort((a, b) => Number(a.stale) - Number(b.stale) || b.updatedAt.localeCompare(a.updatedAt));
  }
  return {
    ok: true,
    asOf: now.toISOString(),
    byAgent,
    staleCount: all.filter((pr) => pr.stale).length,
    conflictCount: all.filter((pr) => pr.conflictRisk).length,
    ownerCount: all.filter((pr) => pr.needsOwner).length,
  };
}

const CACHE_MS = 5 * 60_000;
let cache: { at: number; board: AgentBoard } | null = null;

/** Reads open PRs from GitHub. Public repo works without a token; GITHUB_READ_TOKEN raises the rate limit. */
export async function getAgentBoard(): Promise<AgentBoard> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.board;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "rolanpro-control-center" };
  const token = process.env.GITHUB_READ_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GitHub ответил ${response.status}`);
    const board = buildAgentBoard((await response.json()) as GitHubPull[]);
    cache = { at: Date.now(), board };
    return board;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub недоступен";
    // Keep the last good rows, but say plainly they are not live.
    if (cache) return { ...cache.board, ok: false, error: message };
    return {
      ok: false,
      error: message,
      asOf: new Date().toISOString(),
      byAgent: { Claude: [], Codex: [], Другие: [] },
      staleCount: 0,
      conflictCount: 0,
      ownerCount: 0,
    };
  }
}
