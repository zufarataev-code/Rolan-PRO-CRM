#!/usr/bin/env node
/**
 * Радар пересечений: находит открытые PR, которые правят одни и те же файлы,
 * чтобы Claude и Codex не переделывали работу друг друга.
 *
 * - Ставит метку `conflict-risk` на все пересекающиеся PR и снимает её, когда
 *   пересечение ушло (центр управления CRM показывает эту метку).
 * - На каждом пересекающемся PR (и на том, что запустил проверку) держит один
 *   обновляемый комментарий: с кем пересекается и по каким файлам. Старый PR
 *   тоже узнаёт, что кто-то начал править его файлы.
 * - PR без нового коммита дольше STALE_DAYS получают метку `stale` и не
 *   считаются «занятыми». Считаем по дате последнего коммита, а не по
 *   `updated_at`: сами метки и комментарии радара сдвигают `updated_at`.
 *
 * Без зависимостей: Node 20+, fetch и GITHUB_TOKEN из Actions.
 */

export const MARKER = "<!-- agent-conflict-radar -->";
export const LABEL = "conflict-risk";
export const STALE_LABEL = "stale";
/** Days without a new commit after which an open PR is «stuck», not «busy». Same number as the control center. */
export const STALE_DAYS = 14;
/** Files where two agents at once almost always break each other. */
export const HOT_FILES = ["private/legacy/rolanpro-crm-cloud.html", "prisma/schema.prisma", "package.json", "package-lock.json"];
/** Files every PR touches by protocol — overlap there is expected, not a conflict. */
export const IGNORED_FILES = ["PROJECT_STATE.md", "DECISIONS.md"];

export function agentOf(branch = "") {
  const head = branch.toLowerCase();
  if (head.startsWith("claude/")) return "Claude";
  if (head.startsWith("codex/") || head.startsWith("chatgpt/")) return "Codex";
  return "другой автор";
}

/**
 * @param {{number:number,title:string,branch:string,files:string[]}[]} prs
 * @returns {Map<number, {number:number,title:string,branch:string,shared:string[],hot:boolean}[]>}
 */
export function findOverlaps(prs) {
  const result = new Map(prs.map((pr) => [pr.number, []]));
  for (let i = 0; i < prs.length; i += 1) {
    for (let j = i + 1; j < prs.length; j += 1) {
      const a = prs[i];
      const b = prs[j];
      const bFiles = new Set(b.files);
      const shared = a.files.filter((file) => bFiles.has(file) && !IGNORED_FILES.includes(file));
      if (!shared.length) continue;
      const hot = shared.some((file) => HOT_FILES.includes(file));
      result.get(a.number).push({ number: b.number, title: b.title, branch: b.branch, shared, hot });
      result.get(b.number).push({ number: a.number, title: a.title, branch: a.branch, shared, hot });
    }
  }
  return result;
}

export function renderStaleComment() {
  return `${MARKER}\n**Радар пересечений:** в этом PR нет новых коммитов дольше ${STALE_DAYS} дней — он помечен \`stale\` и больше не считается занятой работой. Пересечения не проверяются. Автор доводит или закрывает PR (\`.agents/PROTOCOL.md\`, правило 6).`;
}

export function renderComment(overlaps, staleSkipped) {
  if (!overlaps.length) {
    return `${MARKER}\n**Радар пересечений:** с другими активными PR файлы не пересекаются — можно работать.${
      staleSkipped ? `\n\n_Не учтены ${staleSkipped} PR без новых коммитов дольше ${STALE_DAYS} дней._` : ""
    }`;
  }
  const lines = overlaps
    .sort((a, b) => Number(b.hot) - Number(a.hot))
    .map((item) => {
      const files = item.shared.slice(0, 6).map((file) => `\`${file}\``).join(", ");
      const more = item.shared.length > 6 ? ` и ещё ${item.shared.length - 6}` : "";
      return `- ${item.hot ? "🔴" : "🟡"} #${item.number} (${agentOf(item.branch)}, \`${item.branch}\`) — ${files}${more}`;
    });
  return [
    MARKER,
    "**Радар пересечений:** этот PR правит те же файлы, что и другие открытые PR.",
    "",
    ...lines,
    "",
    "Что делать по `.agents/PROTOCOL.md`: 🔴 — общий «горячий» файл, второй PR ждёт, пока первый сольют, затем подтягивает `main`. 🟡 — договориться в комментариях, кто что меняет, и не трогать чужие строки.",
  ].join("\n");
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const current = Number(process.env.PR_NUMBER || 0);
  if (!token || !repo) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");

  const api = async (path, init = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok && response.status !== 404) throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 || response.status === 404 ? null : response.json();
  };
  const all = async (path) => {
    const items = [];
    for (let page = 1; page < 20; page += 1) {
      const chunk = await api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      if (!chunk?.length) break;
      items.push(...chunk);
      if (chunk.length < 100) break;
    }
    return items;
  };

  const staleBefore = Date.now() - STALE_DAYS * 86_400_000;
  const open = await all("/pulls?state=open");
  const lastCommit = new Map();
  for (const pr of open) {
    const commit = await api(`/commits/${pr.head.sha}`);
    lastCommit.set(pr.number, new Date(commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? pr.created_at).getTime());
  }
  // Commit date only: reopening or marking ready does not make an old branch fresh.
  const isStale = (pr) => lastCommit.get(pr.number) < staleBefore;
  const active = open.filter((pr) => !isStale(pr));
  const prs = [];
  for (const pr of active) {
    const files = await all(`/pulls/${pr.number}/files`);
    prs.push({ number: pr.number, title: pr.title, branch: pr.head.ref, files: files.map((file) => file.filename) });
  }
  const overlaps = findOverlaps(prs);

  await api("/labels", { method: "POST", body: JSON.stringify({ name: LABEL, color: "d64545", description: "Правит те же файлы, что другой открытый PR" }) }).catch(() => null);
  await api("/labels", { method: "POST", body: JSON.stringify({ name: STALE_LABEL, color: "8a97a6", description: `Нет новых коммитов дольше ${STALE_DAYS} дней` }) }).catch(() => null);
  // Labels on every open PR, so a PR that went stale loses its old conflict-risk too.
  const sync = async (pr, name, should) => {
    const has = pr.labels.some((label) => label.name === name);
    if (should && !has) await api(`/issues/${pr.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [name] }) });
    if (!should && has) await api(`/issues/${pr.number}/labels/${name}`, { method: "DELETE" });
  };
  for (const pr of open) {
    await sync(pr, LABEL, (overlaps.get(pr.number)?.length ?? 0) > 0);
    await sync(pr, STALE_LABEL, isStale(pr));
  }

  // Comments: every active PR that overlaps or already has a radar comment,
  // so the older PR also learns who started touching its files.
  const staleSkipped = open.length - active.length;
  for (const pr of prs) {
    const list = overlaps.get(pr.number) ?? [];
    const comments = await all(`/issues/${pr.number}/comments`);
    const existing = comments.find((comment) => comment.body?.includes(MARKER));
    if (!existing && !list.length && pr.number !== current) continue;
    const body = renderComment(list, staleSkipped);
    if (existing && existing.body === body) continue;
    if (existing) await api(`/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
    else await api(`/issues/${pr.number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  }
  // Every stale PR with a radar comment gets the stale notice — idempotent, so a failed update is retried next run.
  for (const pr of open.filter(isStale)) {
    const existing = (await all(`/issues/${pr.number}/comments`)).find((comment) => comment.body?.includes(MARKER));
    const body = renderStaleComment();
    if (existing && existing.body !== body) await api(`/issues/comments/${existing.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  }
  const conflicted = [...overlaps.values()].filter((list) => list.length).length;
  console.log(`checked ${prs.length} active PRs (${open.length - active.length} stale skipped), ${conflicted} with overlaps`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
