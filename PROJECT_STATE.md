# ROLANPRO CRM — Current Project State

This file is the canonical live handoff for every device, chat, agent, and contributor.

## 2026-11-08 — Центр управления: проекты, деньги, агенты + правила совместной работы Claude и Codex (Claude, PR pending)

- Owner: control from the phone — project cards and money inside the CRM control center; Claude and Codex must work together, see the same projects, not redo or block each other but complement each other.
- Done on `claude/control-center-ops-agents-20261108`:
  - `src/features/owner/control-center-ops.ts` — read-only summary of the working CRM (`LegacyWorkspace.payload.orders` + `clients`): active projects by five stages with cards (client, №, status, install date, total/balance, deep link `/legacy-crm#/order/<id>`), installs in the next 7 days, receivables, money received in 30 days, top debtors. Amount comes **only** from the approved estimate `projectEstimateSnapshot.revenue`; accepted projects without one are counted separately («долг не посчитан»), never guessed. Cancelled orders and unconfirmed historical drafts are excluded, same rule as the CRM.
  - `getControlCenterOps()` in `control-center.ts` selects only `payload->'orders'` and `payload->'clients'`, 5 s timeout, 60 s cache — the page does not load the whole workspace on each refresh.
  - `src/features/owner/control-center-agents.ts` — «Агенты: кто что делает»: open PRs grouped by branch prefix (Claude / Codex / others), stale after 14 days, `conflict-risk` and `owner` labels; GitHub REST, 5 min cache, optional `GITHUB_READ_TOKEN`; keeps the last good picture if GitHub is down.
  - Page `/owner/control-center`: money tiles, stage board (horizontal swipe on phone), installs/debtors lists, agents block; existing service statuses and project map unchanged.
  - `.github/workflows/agent-conflict-radar.yml` + `scripts/agents/conflict-radar.mjs` — on PR updates and every 6 h: finds open PRs editing the same files, sets/removes `conflict-risk`, leaves one updatable comment on the triggering PR (🔴 hot files: legacy CRM HTML, Prisma schema, package files). `PROJECT_STATE.md`/`DECISIONS.md` overlaps ignored. Read-only on code, no merging or blocking.
  - `.agents/PROTOCOL.md` → «Совместная работа без столкновений» (open PR = claim, check before starting, hot files in turn, never touch another agent's branch, cross-review, stale PR handling); exceptions to the hard rule come only from the owner and still require Codex review after. `AGENTS.md` summary added.
- Finding (dry run of the radar on 2026-11-08): 52 open PRs, 34 without movement > 30 days; 15 of 18 active PRs edit `private/legacy/rolanpro-crm-cloud.html` — this single file is the main collision point between agents.
- Verification: new tests `control-center-ops.test.ts` 5/5 (incl. Stripe and per-service dates), `agents/conflict-radar.test.ts` 4/4, existing `control-center.test.ts` 6/6; `tsc --noEmit` shows no errors in changed files (Prisma client cannot be generated in the cloud container — engines download 403; CI runs the full build).
- Codex review (PR #491) found 4 issues, all fixed in the same branch: automatic Stripe receipts (in `o.paid`/`o.stripe`, not in `o.payments`) now count in paid and «получено за 30 дней»; upcoming installs use per-service `serviceSchedules` (project date only for older projects; a multi-day service under way counts from today); radar removes `conflict-risk` from PRs that went stale and keeps the explanatory comment on every overlapping PR, not only the triggering one.
- Second review round: radar also runs when a PR closes (partner freed at once); staleness is measured by the head commit date and marked with a `stale` label (14 days, same as the control center) — the radar's own labels/comments bump `updated_at`, so `updated_at` is only a fallback before the radar's first run.
- Third review round: «Монтажи на неделю» lists only confirmed installation statuses (draft plans on `proposal_accepted` stay hidden, as in the CRM calendar); the day boundary is midnight in Los Angeles even on a UTC server; staleness is commit-date only, also for the PR that triggered the run.
- Fourth review round: older orders with only `o.paid` + `paidAt` count in «получено за 30 дней»; LA midnight uses the offset at midnight (correct on DST switch days); a PR that goes stale gets its live conflict comment replaced with a stale notice.
- Fifth review round: an unrelated earlier card payment of the same amount no longer hides a later Stripe receipt (superseded in round 8); when GitHub fails, the agents block keeps the last rows but says they are not live and shows their time.
- Sixth review round: same for project/money numbers — on a database error the last snapshot stays but the page shows «Цифры по проектам не живые» with its time.
- Seventh review round: a missing `primary` workspace row is an error («Рабочая CRM не найдена в базе»), not zero projects and $0.
- Eighth review round: unrecorded Stripe = what `o.paid` holds above the itemized lines (capped by the Stripe amount) — the CRM's own books instead of an amount/date guess; the radar checks every stale PR's comment, so a failed update is retried.
- Next: re-review and merge; owner decision on closing the 34 stale PRs (list in control center «Агенты»).

## 2026-11-07 — Хранилище фото и видео в оригинале (DigitalOcean Spaces) + резервные копии (Claude, PR pending)

- Owner: photos and videos cannot be uploaded to projects; quality must stay original so the files can feed the content factory; do not disrupt working processes. Cause found in code: legacy order photos were base64 inside the order JSON with a 2 MB limit and image-only input.
- Done in DigitalOcean with owner approval: bucket `rolanpro-media` (sfo3, CDN, $5/mo, private listing, CORS for the CRM origin); weekly automated droplet backups enabled for `sf` (Sunday 0:00–4:00 PT, 28-day retention, $3.60/mo). Droplet is 2 GB / 60 GB SFO2 — resize to 4 GB planned at night.
- Code on `claude/media-storage-20261107`: `src/lib/storage/spaces.ts` (SigV4 presign verified against the AWS reference example, safe keys), routes `/api/v1/files/{config,upload-url,view}`; legacy order/window photo inputs upload originals directly (photos + video) with a progress line, keep a small preview in the order, play video and download the original in the lightbox, AI size reading uses the original. Falls back to the old behaviour until `SPACES_ACCESS_KEY` / `SPACES_SECRET_KEY` are set (see `docs/MEDIA_STORAGE.md`). Control center now checks the bucket live and shows backups as enabled.
- Verification: full unit suite **1108/1108**, `tsc --noEmit` clean, legacy inline script passes `node --check`. Blocker: the bucket access key must be created and placed in server env by the owner or Codex (Claude does not type secrets into fields).

## 2026-11-07 — Центр управления владельца `/owner/control-center` (Claude, PR pending)

- Owner: one control center inside CRM for the whole RolanPRO ecosystem — every service with a live works/broken status, links, responsible person, project map, reachable from any device; must not slow the CRM.
- Done on `claude/control-center-20261107`: `src/features/owner/control-center-core.ts` holds the registry (20 services in 6 groups + 8 projects; names, links, owners, statuses only — no secrets) and pure status helpers. `control-center.ts` runs live server-side checks in parallel with a 5 s timeout each and a 30 s cache: server disk/memory/load (`statfs`, `os`), PostgreSQL latency, release SHA, Meta form intake (config + last lead / 7-day count), Messenger worker liveness (expects 403 without verify token) + last chat lead, welcome SMS last success/failure, Twilio 7-day delivery share, Gmail connection/sync error, env presence for Zadarma, marketing email, Stripe, Zelle, Google Ads, AI keys, and HTTP pings of rolan-pro.com and the legal pages. Manual entries record known gaps: no automatic DB backups; photos stored inside order data with a 2 MB limit and no video upload.
- Page `app/owner/control-center/page.tsx` (owner-only, mobile-first, auto-refresh every 60 s): totals, "что требует внимания", grouped service cards, project map. Owner-only "Центр управления" link added to the `/legacy-crm` sidebar.
- Verification: full unit suite **1106/1106**, `tsc --noEmit` clean. Next: file storage (DigitalOcean Spaces with direct uploads) — needs the owner logged into DigitalOcean.

## 2026-11-07 — Лид из рекламы: бот не переспрашивает, SMS «спасибо за интерес», ночной сценарий (Claude, PR pending)

- Owner showed a live Messenger chat (lead from a Meta instant form, commercial, 9 windows, old film peeling): the bot ignored the form data that Meta posts into the chat, sent two first replies, asked the same questions twice, and ended with «I couldn't load an available time». Owner: the form already discloses AI, so the bot must not announce it; a new lead with a phone must get a "thank you for your interest" SMS; at night the SMS should politely ask when a manager may call.
- Worker (`integrations/facebook-messenger-worker`): `parseLeadFormMessage` reads the instant-form summary (name, phone, email, ZIP, service, property) into lead state; ZIP now satisfies the area requirement for booking. Every model call gets a non-overridable `CONVERSATION_RULES` block and a "facts already collected — never ask again" block. Rules: do not volunteer being AI, answer honestly if asked directly, never claim to be human; acknowledge specifics; ask for photos on replacement jobs; ZIP/area mismatch → ask the street address once; book in 2–3 messages; never mention systems or errors. Same-delivery messages are merged per sender and separate deliveries within 2.5 s are debounced through KV, so the customer gets one reply. Photo attachments are no longer dropped. Every former «couldn't load» path (no slots, CRM error, assistant error, booking error) now saves the lead and asks when to call; the reply is captured as `callback_time` and sent to CRM. After a booking the bot asks for the street address (if missing) and photos.
- CRM: new `src/features/sales/lead-first-touch*.ts`. New Meta form leads and new Messenger leads with a phone get one welcome SMS (idempotent via `lead.welcome_sms` activity). Office hours Mon–Sat 8:00–18:00 PT → "manager will call you shortly from (424) 325-0512"; after hours → "office is closed, what time tomorrow/today/Monday is best to call?"; Messenger variant promises nothing the bot is arranging. Every message ends with "Reply STOP to opt out". Meta form leads also create a manager notification ("позвонить сейчас" / "нерабочее время"). Inbound SMS replies from a recently welcomed lead create a `lead.sms_reply` activity and a manager notification. Messenger `callback_time` creates a "Перезвонить" notification. Failed SMS never rolls back a lead; it logs and notifies the manager. Kill switch: `LEAD_WELCOME_SMS_ENABLED=false`.
- Verification: full unit suite **1100/1100**, `tsc --noEmit` clean (Prisma client generated with `--no-engine` in the cloud container; production build not run locally because Prisma engines cannot be downloaded here — CI runs it).
- Not done / blockers: (1) the Worker is a separate Cloudflare release (`npx wrangler deploy` from `integrations/facebook-messenger-worker`) — merging does not update the live bot; (2) SMS delivery depends on the Twilio sender being verified (toll-free/10DLC) — check the first `lead.welcome_sms` activity in production; (3) the root cause of the live «couldn't load» (slots/CRM error) still needs the Worker logs (Cloudflare → rolanpro-bot → Observability) — the customer no longer sees it either way.

## 2026-11-07 — Деплой врал про ошибку: проверка доступности без повторов (Claude, PR pending)

- «Deploy production» падал 20 раз подряд с последнего успешного прогона 2026-11-05T02:44Z, всегда на шаге «Wait for server deployment». Разбор логов: шаг сначала сверяет SHA в `/home/runcloud/.rolanpro-crm-active-release` и только при совпадении делает контрольный запрос. В логе `curl: (28) Connection timed out after 15002 milliseconds`, exit 28 — то есть релиз уже был активен на сервере, а упала единственная проверка доступности. Код доезжал, индикатор был красным, и «деплой упал» перестало что-либо значить.
- Done on `claude/deploy-health-retry` (`.github/workflows/deploy-production.yml`): после совпадения SHA шаг печатает, что релиз активен, затем проверяет доступность до 12 раз с `--max-time 30` и паузой 15 с (до 6 минут на прогрев холодного Next.js). Два исхода теперь различаются текстом: «релиз активен, но сайт не отвечает — код задеплоен, разбираться с доступностью» против «релиз так и не стал активным».
- Verification: `deploy-health-check.test.ts` 3/3 (новый), `meta-lead-ads-deploy.test.ts` 1/1, YAML парсится. Правка только в workflow и тесте, кода приложения не касается. Next: ревью и merge; отдельно остаётся выяснить, почему сайт не отвечает за 15 с после перезапуска — нужен доступ на сервер.

## 2026-11-07 — Почта удалённого сотрудника: объяснить, а не отшивать (Claude, PR pending)

- Owner: «удаляю сотрудника, потом завожу нового с той же почтой — CRM пишет, что сотрудник с такой почтой есть, но я же его удалил». Удаление архивирует аккаунт вместе с историей работ (см. `safe-delete.test.ts`), поэтому почта остаётся занятой — поведение верное, а сообщение об этом молчало.
- Done on `claude/team-archived-email-hint` (`src/features/team/service.ts`): `emailTakenMessage(existing)` — обе проверки почты (`createTeamMember` и смена почты в `updateTeamMember`) читают `is_active` и называют сотрудника по имени. Для отключённого: «занята сотрудником «X»: он отключён и лежит в архиве вместе со своей историей работ… Восстановите его в разделе «Архив сотрудников» или заведите нового с другой почтой». Раздел «Архив сотрудников» с восстановлением уже существует, UI не менялся — `app/api/v1/team/route.ts` отдаёт `error.message` как есть.
- Verification: `archived-email.test.ts` 3/3 (новый) и `safe-delete.test.ts` 4/4. Полный прогон в облачном контейнере 931/962 — 31 падение одинаковые, `@prisma/client did not initialize`: `prisma generate` не проходит, `binaries.prisma.sh` недоступен из контейнера. Падают файлы, которых правка не касается (google-ads, gmail, zadarma, twilio). `npm run typecheck` по той же причине даёт «implicitly any» в `operations-agent` и `reference/pricing` — не в изменённых файлах. Next: прогнать полный набор и сборку там, где Prisma ставится, затем ревью и merge.

## 2026-11-06 — Preserve the approved Meta form list across deployments

- Task owner: Codex, branch `codex/meta-form-allowlist-20261106`, based on `origin/main` `6804d210240296ee751586a0daf2b7208015bd3e`. The owner requested a PR after the deployed protected setting was found to contain only the oldest form.
- The deployment workflow now versions the four approved public form IDs: `1126644350232479`, `1805660454094850`, `2227922148076022`, `1330965225736016` (weekend Quote + Chat). The app credentials and Page ID use the existing protected settings. Counting only those four settings preserves the all-absent skip and partial-config rejection.
- The regression failed against the old workflow and passes with this fix. It runs the generated remote script against a disposable local environment file, verifies all four saved IDs, preserves unrelated configuration, checks mode 0600, and retains the secret-quoting checks. Full unit suite **1084/1084**, TypeScript, production build and `git diff --check` passed locally.
- Runtime was separately repaired and verified earlier with these four IDs. This branch's deployment fix awaits PR review, published-head CI, merge and deployment. Full weekend-form import still requires a genuine enquiry. Next: review this PR, then follow the separately authorized release workflow and verify the deployed form list.

## 2026-11-07 — КП клиента: оплата картой — одна главная кнопка (Claude, PR pending)

- Live check of #479 in the browser pane: the payment block is now readable. Remaining snag — after choosing the card the card showed a big «Selected» button and the actual way into Stripe as a small «Continue to secure payment» link beside it.
- Done on `claude/proposal-card-pay-button`: when the card method is selected and a Stripe link exists, the «Selected» button is hidden and the link becomes the main navy button «Pay $X by card →» / «Оплатить $X картой →» (`.proposal-pay-link`). Zelle and bank transfer unchanged.
- Note: the browser pane showed the old CSS after deploy until a cache-busting reload — clients who opened the proposal earlier may need a refresh.
- Verification: `public-payment-styles.test.ts` 2/2; `tsc --noEmit` clean for the component.

## 2026-11-06 — КП клиента: блок оплаты был почти невидим (Claude, PR pending)

- Owner asked to see the proposal the way the client sees it. In the built-in browser the «Payment» and «Warranty» sections after the document rendered as pale text and unstyled buttons: `PublicPaymentOptions` / `PublicWarrantySummary` use `proposal-section`, `proposal-section-kicker`, `proposal-payment-section` classes that no stylesheet defined, so they inherited the landing page's light `--ink` on the light `#f2f5f7` shell.
- Done on `claude/proposal-payment-visible` (`app/proposal-premium.css`): the sections get the document's width, ink, kicker, headings and muted copy; option cards are white paper with the document border; buttons are the blue `accent-button` style, disabled ones grey with `cursor: not-allowed`; warranty lists inherit ink.
- Verification: `public-payment-styles.test.ts`; live check in the browser pane after deploy.

## 2026-11-06 — Быстрый ввод: прямые расходы проекта, подпись старшего (Claude, PR pending)

- Owner (screenshot): the senior's 10 % was not in the crew payout — because nobody was marked senior; and the one-screen form had no place for project expenses («аренда, доставка и ещё что-нибудь — списываем прямо в этот проект, так точнее»).
- Done on `claude/quick-entry-project-expenses`: form model `expenses[]` (`QUICK_ENTRY_EXPENSE_TYPES`: rent, delivery, gas, equipment, other; `quickEntryAddExpense/RemoveExpense/ExpensesTotal`, read via `qe-x{j}-type/label/amount`); block «Расходы проекта» under the services with quick «+ аренда / + доставка / + бензин / + оборудование / + другое»; the bill shows «Расходы проекта» and the preview margin subtracts them; `quickEntryCommit` writes them to `o.extraExpenses` as `projectDirect` (an explicit rent replaces the complexity default via `orderRentExpense`, gas via its own function, the rest through `orderManualExpensesTotal` — no double count); the crew line says «⭐ старшему +N %» when a senior is in the crew; «Как считает CRM» gained the row. `quickEntryLineCalc` already applied `installerSeniorFactor` — the owner's $750 case simply had no senior.
- Verification: `quick-entry-panel.test.ts` 24/24 (+1), supply-norms and no-film suites green; `node --check` both legacy files.

## 2026-11-06 — «Старший монтажник» как видимая роль (Claude, PR pending)

- Owner: «у нас нет роли старшего монтажника — как система поймёт, кто есть кто». The senior flag existed but nothing showed it.
- Done on `claude/senior-installer-role`: `teamIsSeniorInstaller`, `teamRoleName`, `installerPickLabel`; the team card role select has «Старший монтажник · +N % к доле» (`installer_senior` → role `installer` + `installerLevel: 'senior'`, server still gets INSTALLER); the new-member form has an «INSTALLER_SENIOR» checkbox mapped the same way (`collectTeamRoles` / `collectTeamSenior`); the team list shows «⭐ Имя» and the role name under it; crew pickers (quick entry, project crew, service schedule, assign modal) show ⭐ before the senior's name. Replaces the separate checkbox from PR #476. Pay formula unchanged: equal share + pct of it (owner confirmed 500 → 250/275).
- Verification: `staff-sms-notifications.test.ts`, `quick-entry-panel.test.ts` 26/26; `node --check` both legacy files.

## 2026-11-06 — «Старший монтажник» в карточке сотрудника (Claude, PR pending)

- Owner: «у нас нет роли старшего монтажника, которому 10 % начисляют от монтажного фонда». The role exists (`installerLevel: 'senior'`, `seniorInstallerBonusPct` 10 in «Ставки и расходы», `installerSeniorFactor` = own equal share + pct of it, 1000 → 500/550 per the owner's 2026-10-24 decision) but was invisible in «Команда»; nobody is marked senior on production.
- Done on `claude/senior-installer-in-team-card`: the owner's installer card shows «Старший монтажник · +N % к его доле» (`tm-edit-senior`), saved by `submitTeamMemberEdit`. Formula unchanged — the owner is asked whether the bonus is 10 % of his share (550) or of the whole installation fund (600).
- Verification: `staff-sms-notifications.test.ts` 3/3; HTML scripts `node --check`.

## 2026-11-06 — SMS-уведомления сотрудникам на телефон из карточки (Claude, PR pending)

- Owner: «у каждого сотрудника должна быть форма — телефонный номер в карточке, на него он будет получать уведомления; сейчас этого нет». The phone field already existed in the team card; notifications went only in-app and to Telegram (chat ID, which most staff lack).
- Done on `claude/staff-sms-notifications`: team card — «SMS-уведомления на этот номер» switch (`u.notifySms`, default on); `notifyStatusChange` — after in-app/Telegram, an SMS pass through the existing `sendSmsViaTwilio` (`POST /api/v1/integrations/twilio/messages`) to every recipient (manager, measurer, installers, owners) with a phone and the switch on, excluding the actor; `Promise.allSettled` in the background, result as timeline `sms_staff_sent` / `sms_staff_failed`; `options.skipSms` for callers that must not send.
- Requires Twilio env on the server (`TWILIO_ACCOUNT_SID`, token or API key, `TWILIO_FROM_NUMBER` or messaging service) — the route already exists for client SMS; without it the SMS pass records «не ушло» and nothing else changes.
- Verification: `staff-sms-notifications.test.ts` 2/2, `legacy-sms-ui.test.ts`, project-card/erp-integrity/estimate-workflow/service-progress 110/110; HTML scripts `node --check`.

## 2026-11-06 — Карточка проекта: один вход в замер, нижние секции убраны (Claude, PR pending)

- Owner: «сверху логика воронки кнопками сделана — зачем снизу дублировать, уберём»; and «Назначить замер» on top vs «Внести размеры» below confused the measurement step.
- Done on `claude/measure-one-entry`: `scheduleMeasurementPrompt` is the one measurement entry with two paths — «📐 Выезд замерщика» (the form) and «📏 Внести размеры сейчас» (→ `openManagerMeasureModal`); the next-step card says «Замер: выезд замерщика или размеры сейчас»; the stage button «Замер» opens the prompt until there are windows or a booked visit, then the measurement window. `projectFeedHtml` no longer renders the «Замер / Материалы / КП и оплата / Монтаж / Документы и история» sections; the feed is stage buttons → «Следующий шаг» + «До монтажа» → «Состав проекта» → document chips (incl. Invoice for money roles) → mobile receipt. `renderOrderCleanProgress` puts each step's summary on the button's second line (`metas`: consultation date; windows · sq ft or visit date; KP status; installation date; act signed; paid of total).
- Verification: `project-stages.test.ts`, `project-feed.test.ts` 11/11; `node --check` both legacy files; full `npm test` 905 pass / 36 env failures.

## 2026-11-06 — Карточка проекта: яркие этапы, компактный «Следующий шаг» и «Состав» (Claude, PR pending)

- Owner (screenshot): stage buttons looked pale/translucent; below them the old layout stayed — a full-width blue «Назначить замер» band, then «До монтажа», then a loose «Состав проекта».
- Done on `claude/project-card-color-compact` (CSS + one markup wrap): `.order-clean-stage-btn` — next = 10 % tint of its colour, done = 22 % tint with a dense border, current = fully filled with white text, disabled buttons keep colour; `.project-feed-top` grid puts «Следующий шаг» (compact row, 44 px action card, readable sub-line) and the collapsed «До монтажа» (`<details>`, ≤260 px, full width when opened) side by side, stacked on phones; `.project-feed-services` tightened — cashier map, direction tile, service rows and footer paddings reduced.
- Verification: `project-feed.test.ts`, `project-stages.test.ts` 10/10; `node --check` both legacy files.

## 2026-11-06 — Живое обновление замирало после первого сохранения (Claude, PR pending)

- Found while changing the tax profile on production: `cloudScheduleSave` never cleared `cloudSaveTimer` after the debounce fired, so `cloudHasPendingChanges()` stayed true for the rest of the session and `cloudCheckForUpdates` (#469) treated the tab as busy forever — no remote pulls, no release reload after the first save.
- Done on `claude/live-update-timer-fix`: the timer callback nulls the handle before `cloudPersist()`; `cloudPersistConfirmed` nulls it after `clearTimeout`. Test added to `live-updates.test.ts`.
- Verification: `live-updates.test.ts` 5/5; HTML scripts `node --check`.

## 2026-11-06 — Услуга по площади без плёнки: силикон, мойка, удаление (Claude, PR pending)

- Owner: «сделать 5 проектов с реальными данными и посмотреть, как сработают формулы». Dry run on production data in an in-memory sandbox (save disabled): five historical projects through the real `quickEntryNewOrder` → `quickEntryBuildLine` → `closeQuickProjectAsCompletedWith` → `orderPSS` → `projectProfitability` path. Film ×(1+waste), per-sq-ft installer pay from the service rate, 5 % manager commission, hired specialist as a direct expense, trims/delivery as manual expenses, fixed pool share by revenue and the tax reserve all came out as expected by hand.
- Found: a per-sq-ft service that is not a film («Силикон» $3/sq ft with a hired siliconist at $2/sq ft) could not be closed — `projectQuickCompletionIssues` demanded a film for every `unit === 'sqft'` line («не выбрана плёнка» / «ручную плёнку нужно привязать к складу»), and such a service was locked to one direction.
- Done on `claude/no-film-area-services`: offering flag `noFilm` (editor checkbox «Без плёнки — работа по площади (силикон, мойка, удаление плёнки)» under «Как считается»); `serviceOfferingNoFilm`, `projectLineUsesFilm`; quick-entry form shows «без плёнки · работа по площади» instead of the film select, commit and completion checks skip the film for such lines, the line carries `noFilm: true`; the project card material cell, cashier material card and measurement window check skip the film too; `serviceOfferingDirections` / «Также предлагать в направлениях» allow a no-film area service in any direction; `serviceOfferingPricingMetrics` treats its direct cost as complete (supplies + installer). Server: `noFilm` must be boolean, only with `unit: 'sqft'`, no `filmIds`; directions allowed for it.
- Verification: `no-film-area-service.test.ts` 3/3; `node --check` both legacy files; full `npm test` 902 pass / 36 env failures (baseline on main 900 / 38, DB/network suites).

## 2026-11-05 — Живое обновление CRM на телефонах + аудит экономики (Claude, PR pending)

- Owner: «когда мы вносим изменения, у сотрудников всё должно обновляться автоматически, без перебоев и зависов»; «проверь всю логику: цена → себестоимость (монтаж, материал, прямые расходы) → прибыль → минус налоги и постоянные → чистая прибыль месяца, чтобы не было кассового разрыва».
- Found: (1) the shared workspace was loaded once at boot — another employee's change reached an open tab only on reload or when the tab's own save hit a 409; a new code release reached a standalone PWA only on reload. (2) The default «Реклама» opex plan (category `marketing`) sat in `companyFixedMonthlyBurn` while every project already carries `orderAdAllocation` (marketingPct of last month's revenue) — advertising counted twice in net profit. (3) The tax reserve used only California 8.84 % / $800 — no federal corporate tax.
- Done on `claude/live-updates`: `src/features/legacy-crm/release.ts` (`currentReleaseId`: release dir sha on production, start stamp in dev); `GET /api/v1/legacy-crm/version` → `{ release, revision }` with no payload read; the served page carries `window.__ROLANPRO_RELEASE__`; the page polls every 30 s and on visibility/focus/online — a higher revision is merged with `mergeCloudWorkspaceSnapshots` and re-rendered in place (only when no unsaved local changes and no modal), a new release reloads the page only when the user is quiet (no modal, not typing 20 s, nothing unsaved; retried every 15 s). `companyFixedMonthlyBurn` excludes category `marketing`; `projectProfitTaxProfile` gets `federalRatePct` (21 for C_CORP, 0 for S_CORP), the reserve = profit before tax × (CA + federal) not below the annual minimum; fields in the project estimate and in «Общие ставки компании».
- Verification: `live-updates.test.ts` 4/4; project-profitability, overhead-by-revenue, service-rates green; HTML scripts `node --check`; full `npm test` 900 pass / 35 env failures as on main.

## 2026-11-05 — Склад: форма «Новая модель», полки, пустые записи; карточка проекта: этапы-кнопки (Claude, PR pending)

- Owner: «+ Добавить модель» silently created a blank catalog row (a dozen nameless «Приватная» rows on production); frost must sit on the Decorative and Privacy shelves; the project card header must be compact — the stage bar as a row of coloured buttons, each opening its own step window.
- Done on `claude/warehouse-model-form`: `addCatalogItem` → `openNewCatalogItemModal` (category, brand with datalist, name*, code, vendor, retail/cost/installer rate/waste, «также показывать в категориях» → `extraCategories`), `createCatalogItemFromModal` (duplicate warning). `catalogExtraCategories / catalogItemInCategory`: `catalogByCategory`, the warehouse category screen and «Принять рулон» suggestions (own category first, then the rest of the catalog) honour extra shelves. `blankCatalogItems / removeBlankCatalogItems`: owner button «Удалить пустые · N» on a category screen — only rows with no name, no rolls and no links from services/projects. Project card: `renderOrderCleanProgress` renders 9 stage buttons (`.order-clean-stage-btn`, states done/current/next/skipped, `--stage` colour), click opens the step (client, consultation prompt, measurement, proposal wizard, production workspace, schedule/installation prompt, act signature, payment, history) per role; `projectCardGateChecklist` is a collapsed `<details>` «До монтажа осталось · N шагов».
- Verification: `node --check` both files; project-stages, client-identity-fields, roll-receipt, reference-directory-stability green (ids renamed to `ncat-*` to keep the client-form guard); full `npm test` 896 pass / 35 env failures as on main.

## 2026-11-05 — Материалы услуги из любой категории каталога (Claude, PR pending)

- Owner: in «Услуги и цены» the material list of a service showed only films of its own category; frost (Decorative) must be linkable to a Privacy service. Decision recorded in DECISIONS.md (2026-11-05).
- Done on `claude/service-cross-category-films`: legacy page — `serviceOfferingDefaultFilmId`, `serviceOfferingAllowedFilmIds`, `toggleServiceOfferingFilm`, `setServiceOfferingDefaultFilm` accept any non-archived film; `projectOfferingAllowsFilm` = linked films (any category) or, without links, the own direction; the editor lists own-category films first and others under a collapsible «Из других категорий · N». Server `service-solutions.ts` — `filmMatchesDirection` accepts linked films, `filmAllowedForProject` = linked or own direction, default material only has to be linked. Tests rewritten to the new rule (service-solutions, service-solutions-policy, service-units).
- Verification: `node --check` HTML scripts; the three suites 44/44; full `npm test` 896 pass / 35 env failures as on main.

## 2026-11-05 — Расходники услуги: норма со склада на единицу (Claude, PR pending)

- Owner: «плёнка к услуге привязана — правильно; силикон к услуге „Силикон“ привязать нельзя; у каждой услуги должны быть свои расходники». A service now carries `supplies: [{ id, supplyId, qtyPerUnit }]` (warehouse supply + norm per service unit).
- Done on `claude/service-supply-norms` in `private/legacy/rolanpro-crm-cloud.html`: helpers `serviceOfferingSupplies / HasSupplies / SupplyCostPerUnit / SupplyItemsFor`, owner actions `add/update/removeServiceOfferingSupply`, editor block «Расходники со склада · норма на <unit>» inside «Состав услуги» (sized and size-free services alike). When norms exist they replace the hand-typed `materialCostPerUnit`: `serviceOfferingMaterialCost` (no snapshot → norm), `projectOfferingLine` snapshot, `serviceOfferingPricingMetrics`, and the price book shows the computed figure. Film-service lines get auto supply rows (`auto: true`) on offering/qty change in `projectEstimateUpdateQuickLine` and in the one-screen quick entry (`quickEntrySetLine`, `quickEntryBuildLine` keeps the flag); manual rows are never touched. Size-free services keep their cost through `serviceOfferingMaterialCost` so nothing is counted twice.
- Verification: `node --check` both files (HTML inline scripts extracted); new `service-supply-norms.test.ts` 4/4; quick-entry, project-estimate-workflow, service-units green; full `npm test` 896 pass / 35 env failures as on main.
- Next: owner sets norms in «Услуги и цены» (e.g. Силикон → туба/lft); add «Удаление старой плёнки» and «Мойка» services with prices; the warehouse «+ Добавить модель» form and multi-category films remain open.

## 2026-11-05 — Быстрый ввод в одно окно поверх исторической модели PR #458 (Claude, PR pending)

- Context: PR #458 (Codex, merged 2026-11-05 05:23Z) replaced the one-screen panel from PR #460 with «header → draft → project editor». The owner asked for the one-window flow back («одно окно»): services with «+ услуга», each with its own date, crew or hired specialist, and warehouse supplies.
- Done on `claude/quick-entry-one-screen`: `renderQuickEntry` is the one-screen form again (header incl. surveyor + actual survey date, service cards, project bill, month table grouped by project and expandable to services, right column with «Как считает CRM» and «Проверка формул»). `quickEntryCommit` builds the order with the shared `quickEntryNewOrder` skeleton (extracted from `quickEntryCreateDraft`, which stays as the «только черновик без услуг» path), one line per service via `quickEntryBuildLine` (film services → `quickProjectLine` with catalog film; size-free → `projectOfferingLine`), hired specialist → `subcontractor` direct expense with `lineId`, then runs `projectQuickCompletionIssues` and closes through `closeQuickProjectAsCompletedWith` — the closing body extracted from `closeQuickProjectAsCompleted` (the button handler now reads the form, confirms and calls it). A manager saves a draft; only the owner closes. `projectQuickCompletionIssues` accepts a line whose only executor is a hired specialist (`subcontractor` expense with that `lineId`).
- Verification: `node --check` production-stages.js and the extracted inline scripts of the HTML; `quick-entry-panel.test.ts` 23/23 (new one-screen test added, draft/editor tests kept); `project-estimate-workflow.test.ts` 48/48 (closer test reads both halves); full `npm test` 892 pass / 35 fail — the same 35 environment failures as untouched main.
- Next: merge, deploy, enter a real multi-service project on production; then «расходники к услуге» (service supply norms in «Услуги и цены»).

## 2026-11-04 — Быстрый ввод: проект из нескольких услуг (Claude, PR #460)

- Task owner: Claude, branch `claude/quick-entry-multi-service`, PR #460, rebased on `origin/main` `2c39c72`. Owner request (2026-11-04): the existing `⚡ Быстрый ввод` section (PR #450) must take one project with any number of services via «+ Добавить услугу»; each service carries its own work date, its own installers (or a hired specialist with a fixed amount), its own supplies from the warehouse; the project total, payroll and margin are assembled from the lines. Visual approved on the Design canvas «Карточка проекта RolanPRO — варианты», artboard QUICK-2.
- Implemented only in `private/legacy/production-stages.js` (quickEntry* functions) and `.qe-*` CSS in `private/legacy/rolanpro-crm-cloud.html`. Form state is `form.lines[]` (`quickEntryNewLine`, `quickEntryAddLine/RemoveLine/SetLine`, `quickEntryAddSupply/RemoveSupply`); `quickEntryCommit` writes one project with one `quickProjectLine` per service (`startDate/endDate/installerIds/supplyItems` — the fields the project card and payroll already read), package parts once per service, a hired specialist as a `subcontractor` direct expense, `serviceTypes` = all directions, `createdAt` = first date, close date = last date. `quickEntryLineCalc` previews a line through `installerRateForQuickLine`, `installerSeniorFactor`, `warehouseCatalogCostPerSqft` and supply `costPerUnit`; the committed figures still come only from `orderPSS` / `calcUserPayoutForPeriod`. Month table groups by project and expands to lines; right column adds «Как считает CRM» and «Проверка формул» (counts from `quickEntryEconomics` flags). Site complexity stays one per project (that is what rent/retail coefficients read).
- Verification: `quick-entry-panel.test.ts` rewritten for the multi-line model (6 tests pass); `node --check` on production-stages.js; full `npm test` 847 pass / 35 fail — the same 35 environment-dependent failures as on untouched main (no database/Prisma in this sandbox). Browser check of the live section is still pending after merge.
- Next: owner merges, deploy from main, open `/legacy-crm#/quickEntry`, enter one multi-service project and compare the table/payroll with expectations; then review the flagged formulas.

## 2026-11-04 — CallRail webhook call identifier compatibility (in progress)

- Task owner: Codex, branch `codex/callrail-webhook-identifiers-20261104`, based on verified `origin/main` and active production release `76312df` (merged PR #462).
- The genuine completed-call callback was authenticated and rejected as `invalid_call`: protected diagnostics show `id: undefined`, with a string start/duration and boolean answered flag. No caller values were logged. The provider webhook does not supply the API `id` field expected by the normalizer.
- Accept the fixed call-identifier fields `call_id` or `resource_id` when API `id` is absent, with the same identifier validation and company-scoped durable receipt key. Preserve API-id precedence. Add failing-before-fix alias tests and a signed disposable E2E fixture that deduplicates across field aliases. Type-only diagnostics include the two fixed alias names so a remaining mismatch can be distinguished without exposing values. All 1,022 unit tests, TypeScript and production build pass; independent Claude CLI review reports NO_FINDINGS. Published-head CI, release and genuine acceptance remain pending; the diagnostic has not yet proved which alias this callback supplies.
- PR #462 passed branch CI 41954205998 and merged-main CI 41954729494. Release 41955073538 has the known final health-curl timeout, but active SHA and a deliberately incomplete signed probe independently prove the new protected diagnostic is running. Staging MR !50 remains deployed, noindex, with no external tracking loader or generated Critical CSS.

## 2026-11-04 — Safe CallRail rejection diagnosis (in progress)

- Task owner: Codex, branch `codex/callrail-rejection-diagnostics-20261104`, based on verified `origin/main` and active production release `68826e5` (merged PR #461).
- The provider-supported update of the original genuine completed call reached the dedicated Cloudflare Worker at 02:03 UTC and received 400. Security Events showed no callback block; Worker analytics showed forwarding. CRM receipt remains unconfirmed. The timeline API exposed `answered: null`, while the saved legacy update returned `answered: false`, so PR #461 is not proven to explain the remaining rejection.
- Add only a signed-request rejection reason and fixed field types to protected application logs; malformed JSON records byte count. No caller values, body, URL/query, headers or signature are logged. Authentication and all intake/qualification rules remain unchanged. All 1,021 unit tests, TypeScript and production build pass; independent Claude CLI review reports NO_FINDINGS. Published-head CI, release and genuine recovery remain pending.
- Redesign MR !50 merged at `cf00230` after exact-head CI 2536 passed, then the two marketing files were deployed from that merged ref with a guarded baseline and backup `/home/runcloud/backups/rolan-pro/20261105T015510Z-callrail-cf00230`. Origin and public edge verify noindex, no external tracking loader, and no generated Critical CSS.
- PR #461 passed published CI 41951264405 and merged-main CI 41951791127. Release workflow 41952155580 failed only its final external health curl (exit 28); pinned SSH independently verified the active release, matching normalizer source hash and login 200, and non-record-creating signed probes reached CRM with 400 through both direct and dedicated endpoints. Do not rerun deployment blindly.

## 2026-11-04 — Completed CallRail calls with unknown answer status (in progress)

- Task owner: Codex, branch `codex/callrail-null-answer-20261104`, based on verified `origin/main` and active production release `ad81373` (merged PR #459).
- A read-only inspection of CallRail's genuine missed-call record found `state: completed`, integer duration, and `answered: null`. The receiver rejected this shape. Accept explicit null while preserving it as unknown; missing/malformed answer status and incomplete duration remain rejected. No caller data is committed.
- Adds a failing-before-fix normalization regression and changes the existing signed disposable E2E intake fixture to cover nullable answer status, stored metadata, deduplication, manager triage, enrichment without qualification, and later real proposal/sale gates. All 1,020 unit tests, TypeScript and production build pass; independent Claude CLI review reports no blocking findings. Published-head disposable CI, release and genuine delivery remain pending.
- Live CRM remains configured for proposal-sent qualification, uploads enabled and automatic ten-minute delivery; its queue is empty. Post-Call only uses the dedicated Worker hostname. No genuine call receipt or Google matching is claimed. CallRail does not retry failed callbacks; do not assume earlier failed calls will reappear without a provider-supported completed-call update or reconciliation.

## 2026-11-04 — Dedicated CallRail ingress hostname (in progress)

- Task owner: Codex, PR #459, branch `codex/callrail-dedicated-ingress-20261104`, based on verified main `c01029e` (merged PR #456). That release is active; the deployment workflow's final curl timed out, but read-only diagnose run 41943209710 independently confirmed the active release and local app, and public login returned 200. Do not blindly rerun deployments after that workflow symptom.
- Missed/provider-spam inbound calls are retained for manager review, with existing CLOSED_LOST dismissal, no qualification from contact enrichment, and actual proposal-sent qualification with PHONE source. PR #456 passed 1,019 unit tests, TypeScript/build, disposable DB/API/browser CI 41941543412, merged-main CI 41942214311, final Claude CLI review and current automatic Codex review without unresolved findings.
- Production website MR !49 is deployed. Source hashes, one loader, three swapped tel links, original-number fallback, and fresh reviewed JS/default-on configuration at origin and edge were verified. The installed page-cache CLI queued its purge; the reviewed immediate plugin API cleared the disk cache. Redesign MR !50 still awaits remaining exact-head CI; staging remains noindex, tracking off and Critical CSS off.
- Genuine CallRail delivery is **not confirmed**. The original missed call is genuine and its callback was confirmed by the owner. CallRail's signing key matches receiver authentication; valid non-record-creating probes get 400 and unsigned probes 401. A concrete Cloudflare BIC 1010 block and query-route gap were fixed, but genuine provider POSTs still reached WordPress 404s. This branch permits one dedicated Worker custom domain to remove that origin fallback; no credential, data-model, acquisition or campaign change.
- Dedicated-host source verification: 1,019 unit tests, TypeScript and production build pass locally; Claude CLI found no concrete code blockers. Published-head CI remains required.
- Website cache operation: after checking the site/zone, `SPC\Modules\Cache_Controller::purge_all(true, false, true, $error)` immediately purged disk/edge content; the ordinary 5.3.9 CLI command had only queued it. Saved opt-outs/GPC remain honored.
- No fabricated Google click, enquiry, consent, qualification or sale. Temporary Call Modified recovery was removed while preparing this change. Next: final checks/review, bind the dedicated hostname from merged code, verify TLS/401/400, change Post-Call only, and verify a genuine signed call in CRM before any completion claim.

## 2026-11-04 handoff — Privacy direction + reliable Services entry (PR #458)

- Task owner: Codex, PR [#458](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/458), branch `codex/historical-project-entry-20261103`, rebased onto current `origin/main` `ad81373`. The already-merged quick-entry/direction work was dropped during the rebase, while the historical-project intake and Privacy work were replayed cleanly; the newer CallRail work from main remains intact.
- `privacy_film` is a first-class fifth direction across the service directory, project cashier, measurement, proposal, warehouse/category mapping and calculations. It remains visible even with zero configured services; opening it shows its own empty workspace instead of folding it into Decorative.
- `selectAppView('servicePricing')` now opens «Услуги и цены» immediately, clears any stale modal/direction editor and renders even when `file://` or a repeated `#/service-pricing` hash emits no `hashchange` event.
- Runtime regressions cover the direct menu entry, five direction cards and opening an empty Privacy workspace. Review follow-up preserves both explicit and project-selected Privacy materials saved during the temporary four-direction period without permitting a different cross-direction material, keeps every accessible unfinished historical draft reachable regardless of age, locks manager-created imports to that manager, permits an unknown or cleared surveyor, restricts later manager reassignment and import-marker closure to the owner, defaults an unpaid import to $0 rather than full payment, excludes unfinished imports from every financial rollup, live-project funnel and client cabinet, rejects status/KP/measurement bypasses in both browser and server until owner closure, stamps imported survey completion so fixed-per-job surveyor payroll accrues, lets imports use a fully consumed historical roll's recorded purchase cost without changing today's warehouse or procurement, keeps imports out of the client proposal flow, requires a concrete directory service on every imported line, explicitly authorizes only an owner's persisted-draft-to-closed historical transition without global import mode, exposes historical production facts to managers while keeping financial closure owner-only, accrues each imported service in its own completion period, and materializes packaged work (for example included silicone) with the parent service's actual crew/date so labor and material cannot disappear from project economics.
- Latest local verification: full `pnpm test` **1038/1038**, `pnpm build` (134 routes), `pnpm typecheck`, and `git diff --check`. The Owner explicitly confirmed «публикуй» on 2026-11-04; PR-head CI/re-review, merge and production verification are the remaining release gates.

## 2026-11-04 — CallRail genuine-call delivery repair (in progress)

- Task owner: Codex, PR #456, branch `codex/callrail-provider-id-20261104`, includes current `origin/main` `ada1a7c`; preserves independently merged Meta intake and inbox actions.
- A genuine owner-authorized missed call appears in CallRail as Direct; the owner confirmed the sales rep called back and had been busy. Provider Webhooks is active but records one delivery failure. The read-only production ingress diagnostic ran successfully on this branch and found no matching provider request. CRM receipt is not proved, and the original transport failure cause is unknown. Do not change the numeric legacy webhook company ID based on generic COM API IDs.
- Adds a minimal fixed-destination Cloudflare relay at `https://rolan-pro.com/integrations/callrail`, retaining original signed bytes and CRM HMAC/company authentication. Body is bounded to 128 KiB, headers are isolated, redirects are not followed, and caller data is neither stored nor logged. No new dependency, secret, schema or campaign change. Deployment/rollback: `integrations/callrail-worker/README.md`.
- Owner clarification: missed inbound calls must enter New Leads for manager triage; CallRail-marked spam is now retained with a visible warning, not silently discarded. Existing manager dismissal remains CLOSED_LOST, contact enrichment does not qualify, and actual proposal sent remains the qualification milestone. Focused and disposable E2E regressions cover missed/spam intake, enrichment, later proposal and dismiss/new-call handling. Focused tests pass; the full 1,018 unit tests, TypeScript and production build pass. Exact-head disposable database/API/browser CI is in progress.
- Previous relay verification: four focused relay tests, 1,016 full unit tests and TypeScript pass. Claude CLI Opus 5.5 found no code blockers. Published-head disposable database/API/browser CI and final review remain pending. Relay is not deployed and provider Post-Call URL is unchanged.
- Production website MR !49 passed its exact-head checks and merged at `8766bfc`; reviewed source rollout is underway. Redesign MR !50 still awaits runner capacity; tracking/Critical CSS remain off on staging. Existing managed loader, number/tel swapping and blocked-provider fallback were independently verified earlier; GTM v10 pauses only the old Google forwarding initializer.
- Next: finish CI/review; deploy relay from merged main, verify unsigned 401 and signed incomplete 400 without creating records, update only provider Post-Call URL, and follow a genuine signed call into CRM. Do not manufacture clicks, enquiries, consent, qualification or sales. Google matching still requires actual paid acquisition and later genuine business milestones.

## 2026-11-04 — Meta official test delivery verified; inbox actions fix in progress

- Task owner: Codex, branch `codex/meta-inbox-actions-20261104`, based on current main `4ac9fe1`. The user explicitly requested a test through Meta’s tools after the initial no-op callback verification.
- Scope: create one clearly identified synthetic test lead for approved form `1126644350232479`, observe provider delivery and the existing CRM inbox, and keep all campaigns paused. No customer outreach, booking, qualification or conversion. Test data must not be represented as a genuine enquiry.
- Meta’s official testing-tool preview created the named synthetic test entry; its RTU table reports Success for RolanPro Lead Sync, and the record appeared in the active CRM New Leads inbox with contact, ZIP and service preserved. The test exposed the UI actions branch admitting only website/CallRail sources, so Meta rows lacked Create Project/Dismiss. Added Meta to that existing guard and a rendered-action regression. The regression failed before the fix and passes after it; it also retains website/CallRail actions and the separate Messenger consultation flow. Full CI/typecheck/build and release are pending. No schema, dependency, booking, stage, claim API, contact or conversion change.

## 2026-11-04 — Direct Meta Lead Ads intake (live configuration verified)

- Task owner: Codex, PR [#455](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/455), branch `codex/meta-lead-ads-20261104`, based on latest `origin/main` `2d48a72`.
- Scope: direct signed Meta Lead Ads webhook into canonical NEW_LEAD inbox, with Page/form scope, provider attribution and retry deduplication. User chose direct CRM delivery instead of Zapier. No production test leads or conversions; all seven Meta campaigns remain paused.
- Implemented signed 128-KiB-bounded webhook, scoped Graph retrieval, transaction/unique-ID deduplication, original answers/attribution and the existing inbox source mapping. No schema/dependency change. Deployment can sync all five protected settings atomically; absent settings retain current runtime config. Runbook: `docs/META_LEAD_ADS.md`.
- Verification: 1,011 full unit tests passed, new deployment-secret quoting/partial-config test passed, production build passed, form-allowlist mutation was caught. Final TypeScript readback passed; published-head CI [41910340455](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/41910340455) passed for `20f6c8d`, including migrations, concurrent Meta delivery against the disposable database, full API/lifecycle and existing desktop/phone checks. Local Docker daemon is unavailable; no production test data was written. Independent read-only review found no code blockers for this fixed single-select form.
- Provider: separate **RolanPro Lead Sync** app `1727591805631700` created in verified Rolan Pro portfolio after explicit Terms approval. All six approved permissions and Rolan&PRO Page access are verified. Quote form `1126644350232479` and five single-value questions verified through Graph. All five production secrets have been set through protected GitHub environment input. Page token is valid for this exact app/Page, with no fixed token expiry but a Meta data-access window through 2027-02-02 20:52 UTC. App publication is verified after refresh. PR #455 merged as `4ac9fe1`; main CI [41913720194](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/41913720194) passed. Meta verified the live CRM callback and independently lists this app on Rolan&PRO with only `leadgen` subscribed. Live unsigned POST returned 401; a signed empty batch returned 200/received 0 with no enquiry.
- Release [41914289581](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/41914289581) synced all protected settings and advanced main, but both attempts failed their external HTTPS health probe (curl timeout after detecting active SHA). Read-only [diagnosis 41914949437](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/41914949437) confirmed active `4ac9fe19fb9a01dee8a4c22cd7f988f4e337c3d7`; public receiver signature checks and Meta callback verification succeeded. Do not describe that workflow as green; the receiver itself is independently verified live. No unrelated infrastructure change.
- Final Meta readback: all seven campaigns PAUSED at USD 50/day; 42 service ad sets and copy drafts remain paused with empty media. Next: add owner-supplied media and follow a genuine form enquiry through the office inbox when the owner later activates ads; do not fabricate leads/conversions. Revalidate Meta access before 2027-02-02. Historical Zapier destination remains unverified/unchanged; this integration is direct. Do not reuse MCP or owner Messenger app.

## 2026-11-04 — CallRail website calls (in progress)

- Task owner: Codex, PR [#454](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/454), branch `codex/callrail-crm-20261104`, based on `654de8a`.
- Added signed/company-scoped Post-Call intake, retry/concurrency receipts, caller matching, New Leads and project call history. Original source/consent/stage remain intact; proposal/sale outcomes retain PHONE source. See `docs/CALLRAIL.md`.
- CallRail trial website pool and native Ads connection are configured. Website loader, CRM receiver deployment, signed provider delivery and Google matching remain separate rollout gates. No genuine call or qualification/sale has yet been verified by this branch.
- At `37d7df5`, 1,005 unit tests, TypeScript, build, clean-database migrations, API/lifecycle and desktop/phone browser CI [41891291419](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/41891291419) passed. Claude CLI Opus 5.5 re-reviewed the caller/ambiguity/history/attribution fixes and found no remaining code blockers. A later automated PR review identified synchronous proposal/payment producers creating immutable OTHER-source events; the shared conversion helper now derives PHONE from acquisition for all producers, with unit and real producer E2E regressions. That final delta requires its own CI and Claude readback before release.
- Native CallRail Phone Call action `7889855964` and existing CRM Qualified/Converted actions remain Secondary, independently confirmed through Ads API. Enhanced conversions, text and form imports in CallRail are off. Website MR [!49](https://gitlab.taila64eb.ts.net/pwi/rolan-pro/-/merge_requests/49) implements the owner's default-on tracking policy and storage/DOM-ready checks; it does not establish website deployment. Next: complete final source checks, deploy the receiver, prove signed validation without creating an enquiry, then enable Post-Call and follow a genuine call and later actual proposal/sale. No receiver release or Google acceptance claim yet.

## 2026-11-03 handoff — search privacy, CI runner pin, server diagnose (PRs #446, #448)

- #446: `X-Robots-Tag: noindex` on every response (`next.config.ts`), `app/robots.ts` disallows all, root metadata noindex. CI pinned to `ubuntu-24.04` (Playwright has no Chromium for ubuntu-latest = 26.04).
- #448: manual read-only workflow `Server diagnose` (load, memory, ports, app/nginx local + external response, watcher log).
- Finding: the droplet has 2 GB RAM; each release runs `npm ci` + build on the server, swap fills, HTTPS stops answering for a few minutes → «Wait for server deployment» times out although the release activates. Recommendation to the owner: 4 GB droplet or build in CI. Production verified serving `cab0f8b`.

## 2026-11-01 handoff — film line → models + add-ons in one cashier screen (PR #444)

- Owner corrected the approved visual: `Magnetron`/Magnitronic is the line/category, while SP-5%, SP-15%, SP-20%, SP-35%, SP-50% and SP-70% are the selectable films. Silicone must sit beside those film cards, not behind another step.
- Branch `codex/project-service-cascade-20261101` now uses three steps: direction → film line / primary service → one combined film-and-add-ons grid. Size-free work is hidden from the film-line shelf when sized services exist, but remains available as add-ons or standalone under «Общее по объекту». Historical `Magnetron` rows with no film links infer the existing Magnitronic family for display; explicit links still win.
- Existing offering, catalog and project IDs continue through the same commit path, so measurement, proposal, warehouse, payroll and project totals keep their current calculations. Verification is green: `pnpm test` (**992/992**), `pnpm typecheck`, `pnpm build`, and `git diff --check`. CI and release are pending. Production has not changed.

## 2026-11-01 handoff — client link → proposal page, visit reschedule/cancel (PR #441)

- Cause: `clientPortalUrl` built `/legacy-crm#/client/<id>` (staff-only) → clients hit the employee login, could not pay or move a visit.
- Now `clientPortalUrl` = the order's published proposal URL (or empty). Proposal page shows `PublicVisitCard` (next consultation/measurement/confirmed installation) with «Перенести / Отменить» → `POST /api/public/proposals/[token]/visit` → legacy order `clientRequests` + timeline + notifications (FOR UPDATE, revision+1). Manager resolves in the CRM as before.
- Logic `src/features/proposals/client-visit-core.ts`, test `client-visit.test.ts`. Deployed `4c11c83`.
- Open: the account cabinet `#/account/…` is still inside `/legacy-crm` (same login problem); clients without a published KP get no link. Owner's payment complaint still needs the specific project.

## 2026-10-30 handoff — installer pay rules (PR #439)

- Owner: rates per service, × complexity for film, silicone «$1.5/ft или $200/день — что больше», equal split + senior 10%, $200 crew minimum per visit, road $20/h each beyond 30 miles.
- production-stages.js: `installerPayRules` (`db.settings.installerPayRules`, defaults 200/30/20), `installerComplexityFactor`, `installerWorkLinePay` (offering `installerDayMinimum` × service days), `installerVisitExtras` (top-up + `installerTravel`), `projectTravelRefresh` (Nominatim + OSRM → `o.travel {miles, minutes, hours?}`, on opening the install window), `installTravelHtml`, `ratesPayRulesHtml`. `orderInstallerPayoutForUser` adds top-up/road except for stage scopes (`_stageScope`).
- Server: `installerDayMinimum` is owner-only; installers get `installerPayRules`/`seniorInstallerBonusPct`.
- Test: `installer-pay-rules.test.ts`. Deployed `5f0703c`. Owner still enters the actual rates (smart 5, protective 3, solar 2.5, zone 50, block 400, silicone 1.5 + day 200, Danil 5%).

## 2026-10-29 — Google Ads live delivery and website receiver deployed

- Task owner: Codex; documentation-only PR [#438](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/438), branch `codex/google-ads-live-handoff-20261029`, based on verified `main` `9dd1ef36a0b5d9c4d57a9a256e4fa66c896e4113`. PR [#437](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/437) is merged and its signed, ordered website follow-up receiver is deployed at that commit. The receipt migration and both unique indexes were independently verified in production; signed empty PATCH returned `400 invalid_submission_id` without creating data.
- Verification: 980/980 unit tests, TypeScript, 131-route production build, empty-database migrations/no drift, guarded PostgreSQL/API replay/concurrency/B2B cases, and authenticated 390/1440px inbox/project/follow-up browser checks passed. Feature-head [CI 40948900310](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/40948900310), merged-main [CI 40950701658](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/40950701658), and automatic production [deployment 40951179639](https://github.com/zufarataev-code/Rolan-PRO-CRM/actions/runs/40951179639) succeeded. Final independent Claude Opus 5.5 review found no blockers; automatic Codex review completed without findings. Every available page of comments, reviews, inline comments and review threads was checked before merge; no unresolved findings remained.
- Live readback at **2026-10-29 22:22 UTC**: active release `9dd1ef3`, public/local health `200`, actual Next process flags `GOOGLE_ADS_AUTO_SYNC=on`, `GOOGLE_ADS_UPLOAD_ENABLED=true`, `GOOGLE_ADS_VALIDATE_ONLY=false`; database `upload_enabled=true`, `validate_only=false`. Customer Match remains off. Destination account `6421176143`, Qualified/Converted actions `7877132314` / `7877145046`, and owner-selected qualification `PROPOSAL_SENT` are preserved. These live settings supersede earlier paused/unconfigured snapshots below.
- The same read-only audit found five website leads, **zero acquisition touchpoints, zero conversion events and empty conversion/adjustment/Customer Match outboxes**. Natural Google-related SQL activity was observed on a database socket owned by the running Next process at 22:13:57 UTC, consistent with its ten-minute scheduler; no sync/legacy-reconciliation failures or unexpected restarts appeared in the log window since this release. There is no persisted success heartbeat. Uploads stay enabled while awaiting a genuine eligible event; Google acceptance and matching remain unverified. No enquiry, attribution, milestone or conversion was fabricated, and no worker run was forced.
- The separate WordPress component is tracked by [redesign MR !45](https://gitlab.taila64eb.ts.net/pwi/rolan-pro/-/merge_requests/45) and [production MR !46](https://gitlab.taila64eb.ts.net/pwi/rolan-pro/-/merge_requests/46). Consult their live heads, checks and deployment evidence for publisher rollout status. This CRM receiver is ready for the compatible publisher; the links do not assert a website release.
- Next action: verify the first genuine attributed qualification/sale through the existing outbox diagnostics and Google matching results. Review campaign goals, stage deduplication and bidding separately with the owner; enabling uploads does not prove Google acceptance or authorize a bidding change. This follow-up edits documentation only; its own required PR CI/review and any subsequent automatic main deployment are separate from the application release verified above.

## 2026-10-29 — Website quote corrections and callback follow-ups

- Historical implementation/review snapshot; the merged, deployed and live-mode status is recorded above.
- Task owner: Codex, PR [#437](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/437), branch `codex/website-quote-followups-20261029`, from released main `5199c42`. Initial quote POST already imports and displays submitted context. This follow-up adds signed PATCH to the same website endpoint for later contact corrections, quote edits and callback requests on that original lead.
- ActivityLog stores immutable event/revision receipts and observed contact before-images; a narrow expression-index migration enforces uniqueness. Ordered replay and payload conflicts are explicit. No acquisition, consent, staff note, assignment, status, appointment or sale is changed. Office-only history appears in the canonical New Leads inbox and converted project card through the scoped leads API; polling updates its own history slot without replacing editable project fields.
- Protocol agreed with the separate WordPress redesign implementation; see `docs/WEBSITE_LEAD_FOLLOWUPS.md`. Deploy this receiver before enabling the website PATCH publisher. No production deployment or runtime/provider/customer-data mutation by this branch.
- Local verification: 980/980 unit tests, TypeScript and production build (131 routes) pass; focused validator/rendering checks and diff checks pass. Guarded PostgreSQL/API and authenticated 390/1440px browser cases are added to required CI; their fresh published-head result and final independent review remain required before release. Claude Opus 5.5 found a conditional B2B name issue; the fix preserves company identity while correcting the representative and adds distinct-event race/name regressions. Live-mode copy now distinguishes enabled delivery from provider acceptance and a separate owner bidding decision. The Mac internal data volume ran out of temporary-log space; this task's disposable temp/log files moved to the external workspace without deleting unrelated files.

## Start here

Before doing any work:

1. Fetch the latest GitHub state.
2. Read this entire file and `DECISIONS.md`.
3. Check open pull requests and active branches.
4. Work from the latest `origin/main` on one dedicated branch.
5. Do not rely on a previous chat's memory or local browser storage.

## 2026-10-28 follow-up — payroll completeness in campaign ROI

- Final review also excludes unused quoted quantity components and film-issue prerequisites from excluded directions, while retaining recorded actual purchases, expenses and labor. The home direction from the existing service directory takes precedence over a line's selling scope; general works and historical Privacy aliases retain their existing behavior. An installer-only commission configuration is blocked explicitly because the active payroll only accrues manager commission; it cannot be attested as zero through that producer.
- A broader Claude review also identified earned commission and unstaged per-square-foot obligations without immutable stage amounts. ROI remains unknown until a separate OWNER settlement attestation uses the existing payroll calculator to verify full payment. The server accepts no money total, retains optimistic revision/fingerprint protection and invalidates the attestation after source changes. Manager state writes cannot change it. Archive review uses the same calculator with an optional isolated order list, without changing ordinary payroll calls. Local verification: 975/975 unit tests, TypeScript and production build pass. The guarded PostgreSQL/API regression passed on prior head `9bfd670`; the latest cost-scope changes require fresh exact-head CI and final independent Claude review.
- PR #418 also accrues fixed installer/measurer job pay at the existing installation/measurement completion event, matching active payroll even for inactive staff. Partial and final payments offset the same unstaged obligation; paid and unpaid costs are retained on cancelled jobs. Changed pay inputs invalidate owner cost confirmation. No new ledger, schema or dependency.
- Regression tests exercise the active payroll producer, zero stage snapshots, no/partial/full payment, rate changes, measurer cancellation and unearned/unassigned work. Local verification: 970/970 unit tests, TypeScript and production build pass. Independent read-only Claude review found no blockers; exact-head CI and deployment remain pending. This branch is not deployed.

## 2026-10-26 handoff — complete Google Ads attribution, campaign ROI and delivery

- PR [#418](https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/418) contains the integration and owner runbook; use its current checks for the published revision's CI result.
- Branch `codex/google-ads-roi-integration-20261026`, includes verified `origin/main` `2e8eec0f4fd10c0185f9c2e29a5e71fe1ddd4738` through merge `db4c593`. This is the owner-maintained GitHub CRM repository, separate from the RolanPro WordPress project; portable identity is recorded in `PROJECT.md`.
- Extends the existing script costs/Data Manager/outboxes: stable customer/campaign and legacy-order attribution; canonical-lead preservation; CRM landing capture and independent ad-measurement consent; owner-reviewed form/phone evidence; server acquisition-cohort reporting with net job receipts, per-currency ROAS and reviewed direct-cost ROI.
- Verified manual paid acceptance now reaches the existing conversion outbox. Qualifications no longer fire merely on proposal-link publication. Lead/deal qualification identity is shared; original IDs are retained. Refunds/cancellations create immutable corrections, whose uploads wait for the original conversion to be confirmed.
- Fixes the effective live-mode gate, scope-specific OAuth caching, paid-touchpoint selection, destination-change validation reset, stale click handling and fair, bounded request-status polling. Existing CRM cost keys remain usable.
- Independent Claude audit and reviews reported no blocking correctness/security issues. Review fixes cover reassigned-project publishing, canonical-lead protection, archive preservation, explicit bank/expense reconciliation, decimal cost input, MCC reporting and corrections without a click touchpoint. Cost review intentionally remains conservative for lost jobs and source-record edits.
- Local verification: full unit suite 923/923, guarded PostgreSQL E2E 15/15, TypeScript and production build pass after the review follow-up. Both new E2E regressions reproduced the automatic review findings against the previous compiled build, then passed against the fixes. Initial injected private-JS syntax, empty-database migrations and zero schema drift passed; use the PR's current CI for the published revision's complete migration/E2E/browser result. Desktop and 390px phone report/review flows were checked with disposable data. The E2E also covers overlapping imports, original-lead preservation, 670% → 570% ROI after a refund, a further no-touchpoint restatement, manager authorization and simultaneous sale-event deduplication. No fixture was sent to Google.
- Production, the WordPress site, Google campaign/bidding settings and live-upload activation are unchanged. Next action: review the PR/CI, then separately approve merge/deployment, website capture and Google credentials/actions, validate-only checks and a small live acceptance test. See `docs/GOOGLE_ADS_CRM_INTEGRATION.md` for the full owner/developer handoff.
- Readiness audit on 2026-10-26: #418 extends merged CRM PRs #140, #397 and #401; it is not a complete live rollout by itself. The separate website draft #1 must be updated/ported through its current authoritative GitLab workflow. Live Ads reads confirmed auto-tagging enabled, no offline CRM conversion actions, empty account-level tracking, and campaign UTMs that omit the explicit numeric account/campaign fields required by the ROI report. Campaign goals still select forms and Google calls. Complete website capture/replay, destination/actions/goals configuration, deployment and actual Google matching/revenue/refund acceptance before calling the integration ready.
- The readiness follow-up also fixes all three outbound workers so an explicit CRM pause overrides the legacy environment upload flag. The new offline regression exercises each actual worker, proves paused rows are not claimed and no network call occurs, and preserves environment fallback only when the stored flag is absent. The ten-minute native worker, optional external scheduler and rollback instructions are now distinguished in the runbook.
- Automatic review follow-up addresses correction delivery missing after configuration and late campaign binding of an existing sale. Bounded reconciliation covers native and external processing; serialized retries keep the original correction destination. Verified late binding fills missing links and only requeues never-submitted identifier suppression, preserving original sale identity/value and prior acquisition evidence. Both cases now have real PostgreSQL regressions.
- Review follow-up on 2026-10-27 fixes the two P2 comments on review `5661521129`: payroll matches payments against the same worker/stage obligation while retaining fixed/unstaged payouts; removing the last erroneous refund appends one restoring restatement without changing the original sale or unrelated manual corrections. Terminal retractions now take precedence even when backdated, in both legacy reconciliation and booked-value ROAS. The new PostgreSQL regression reproduced the previous `900.00` instead of `0.00` report, then passed against the fix. Local verification on the current main merge: 945/945 unit tests, 15/15 guarded PostgreSQL E2E, TypeScript and production build; empty migrations and zero application-schema drift also pass. Claude Opus 5.5 independently approved the payroll/refund fixes. No fixtures were uploaded to Google. The runbook now uses current Cloud-project access requirements and explicitly requires owner-reviewed campaign goals/deduplication; deployment, website implementation and live Google acceptance remain outstanding.
- A fresh automated review of `da402b8` found project material purchases hidden by the warehouse-deducted flag. The follow-up reconciles each purchase: priced, warning-free roll-issue IDs prove stock receipts already costed through consumption; actual-expense links and explicit separate purchases retain equipment costs; unknown overlaps require owner review through the existing picker. Reviewed warehouse coverage shares one material allowance, with excess retained; every invoice/link fact stays in the review fingerprint. The real PostgreSQL regression reproduced hidden purchases (`230.00` instead of conservative `380.00`) on the preceding build, then verified reviewed costs `280.00`, ROI `620%` and refund-adjusted ROI `520%` on the fix. Latest local checks pass: 950/950 unit tests, 15/15 guarded PostgreSQL E2E, TypeScript, production build and served legacy-JS checks. The prior head's CI run `40542793191` passed both jobs; its slow browser-tool installation was an Ubuntu mirror delay, not an application failure. Use the current PR checks for this follow-up's remote result.
- Google account preparation on 2026-10-27: the owner's authorized Chrome UI changes added account/campaign attribution fields without replacing tracking templates or custom parameters. Google Ads actions `7877132314` (Qualified Lead, One, no value, 90 days) and `7877145046` (Converted Lead, Every, CRM event value with USD zero default, 90 days) were created as secondary actions with account-default goals off and no campaign adoption. Existing bidding goals and budgets remain unchanged. The owner explicitly confirmed Google's customer-data attestation; enhanced conversions for leads uses the existing GTM path.
- At the last server inspection on 2026-10-27, production CRM was `main` `2e8eec0`; its Google Ads settings and encrypted credential rows are absent, and uploads remain disabled/validate-only. The deployed legacy Save button hardcodes upload enablement, so it was not used to enter the new IDs. The follow-up replaces raw-key textarea entry with an owner-only JSON file picker, bounded to 64 KiB and cleared after success/failure; key contents are never rendered or copied into workspace/browser storage. Ordinary ID saves omit upload/validation flags, and the server omits those mode columns from UPDATE unless explicitly supplied or a changed destination requires validation, so a concurrent pause/reset is preserved. Separate Pause / Enable validation controls remain the only ordinary mode changes. Local verification passes: 962/962 unit tests, including 12 served-handler/settings-service regressions for file validation, secret-safe errors, stale tabs and concurrent mode changes, plus TypeScript, production build and diff checks. Independent Claude review found no release blocker or data-safety regression; its message/handoff clarifications were addressed. The final Claude documentation/copy review is also clean. Publication and exact-head CI are next; no CRM deployment, credential import or outbound processing was performed for this follow-up.
- On 2026-10-28 the Cloud IAM page for project `rolanpro` independently confirms `andriikaprii@gmail.com` has Browser, Service Account Admin, Service Account Key Admin and Service Usage Admin. The owner requested complete integration and revoked yesterday's pause. Refresh the expired local Cloud CLI login, publish the held reviewed UI/settings follow-up, merge current main and verify exact-head CI/reviews before the CRM release. Credential import and controlled provider validation remain pending; existing campaign bidding goals and budgets stay unchanged.

- New review of `548e70d` on 2026-10-28 found that actual WhatsApp/SMS/copy-link proposal sharing records `premium_proposal_sent`, which legacy qualification did not recognize. The bounded fix recognizes that saved fact while continuing to exclude link publication. Its regression fails against the prior code and passes with the fix, proving one stable event/outbox across repeated reconciliation and ordinary sharing. The owner selected `PROPOSAL_SENT` as the qualification rule. Publish this reviewed follow-up and recheck exact-head CI before release.

- Review follow-up on 2026-10-28 includes quantity-service component costs and project-linked variable vehicle/rental expenses. Component snapshots use the existing service-directory fallback; missing/invalid costs block confirmation and changes invalidate the review. Film and component payments have separate explicit material allowances in the existing owner expense picker/API; payment excess remains cost, roll receipts cannot override an explicit component choice, and cancelled/lost quotes retain sunk actual costs without charging unused quoted components. The new unit regressions reproduced both omissions before the fix. Current focused tests pass; a guarded PostgreSQL owner/API regression was added and must pass CI. Independent Claude follow-up found no concrete blocker. No release or provider upload has occurred for this follow-up.

## Last verified state

- Verified: 2026-08-25
- Canonical repository: `zufarataev-code/Rolan-PRO-CRM`
- Canonical code branch: `main`
- Verified `origin/main` commit: `3086998` (`Merge pull request #23 from zufarataev-code/codex/rotate-owner-temp-password`)
- Production status: deploy run #16 succeeded for `3086998`; login page and owner access were verified
- Current phase: security stabilization, data consolidation, and removal of duplicate CRM workflows

> Live repository state has advanced significantly since this old verified snapshot. Always re-check `main`, PRs, and Actions before acting. A current task update is recorded below.

## 2026-10-28 handoff — project composition shows only used directions (PR #435)

- Owner: «в составе проекта убрать ненужные окна по направлениям — лишний шум; изменить состав через кнопку».
- `projectCashierMapHtml` (production-stages.js) renders tiles only for directions in the project (`count-N` grid); missing ones are chips behind «+ Добавить направление» (`projectCashierToggleAdd`, `state.projectCashierAdding[oid]`). Empty project shows chips at once.
- Test: `project-cashier-card.test.ts`. Deployed `3d4d8c8`.

## 2026-10-26 handoff — opened project reads as the cashier (branch `claude/project-card-cashier`)

- Owner, 2026-10-26: «раздел проект очень запутан — сделать понятным, как касса; не ломать всё, а слетать плавно». Prototype he tested: Artifact «Проект · касса RolanPRO».
- The card no longer repeats the funnel as numbered technical blocks. Generic «Визиты» is removed: the measurement date belongs to «Замер», while per-service dates and installers stay in «Монтаж». Client/object data is one compact context strip with explicit «Клиент» and «Объект» edit actions, not a workflow stage. Visible modules are now: «Состав проекта» → «Замер» → conditional «Материалы» → «КП и оплата» → «Монтаж» → «Документы и история». The duplicate «Последние события» card below the feed is removed.
- Inside «Состав проекта», `projectCashierMapHtml` renders the four customer-facing direction tiles (Smart, Solar, Protective, Decorative): a direction in the project is filled with its `rpDir` colour and shows services · windows · sum; one not in the project is a tinted «+ добавить» tile. Either tap opens `openProjectDirectionWindow(oid, key, 'services')` — the picker modal between the tile and the window is no longer used from the card. The three duplicate buttons (Замер / Расчёт / Заказ-наряд) under the map are gone; the facts row (rooms · windows · sq ft) stays.
- «Замер» section: rooms are tiles (`.project-room-tile`) — name, windows, sq ft, chip «базовый» (any `win.quickMeasure`) or «полный ✓»; a tap and «+ Помещение» open the same `measureAction` window.
- Receipt `projectFeedCheckHtml` is mobile-only (≤720px): total, line count, «без замера» count, and one button — «Собрать КП» / «Открыть КП» / «Монтаж» once the KP is signed. Desktop already has totals in the hero, so the receipt is hidden there.
- Fixed the production composer crash: `production-stages.js` is function-only, therefore the four-direction order is local to `projectCashierMapHtml` instead of a lost top-level constant.
- Not touched: direction window, measurement windows, KP wizard, work order, data model. No state changes.
- Verification: focused project/card tests 16/16; full suite 912/912; `npm run typecheck`; production `npm run build` (129 routes); `git diff --check`. The protected database E2E was not run locally because no disposable PostgreSQL was provisioned; CI owns that gate. Production is unchanged; PR review, merge and deployment still require the owner's explicit confirmation.

## 2026-10-26 handoff — card gate-checklist + owner install override, client block removed (branch `claude/project-card-gate-checklist`)

- Owner, tested on prod, frustrated: project card confusing with «тысяча повторяющихся сущностей», and «не могу начать монтаж, вечно что-то блокирует». He asked for an expert redesign, approved a mock-up first (Artifact «Карточка проекта RolanPRO»), and gave three decisions: (1) монтаж — show a checklist «что осталось» + owner «Начать монтаж всё равно»; (2) дубли — fewer sections; (3) approach — mock-up then code.
- This branch stacks on `claude/project-card-cashier` (PR #426, the card «Simplify into one working flow») and adds the two approved deltas the simplify did not cover:
  - **Removed the «Клиент и объект» block** from `projectFeedHtml` (Owner: client + site address live in the client card, address is already in the header — «зачем лишний шум»). The client name in `renderProjectCommandHeader` is now a button linking to the client card (`.project-command-client`). Site contact on the object is a later layer: default = client, overridable when creating a замер/монтаж, shown to the field specialist in the work order.
  - **«До монтажа» checklist** (`projectCardGateChecklist` / `projectInstallGateSteps`): four real steps — услуги+замер, КП принято, аванс, точные размеры — with «осталось N из M». Shown for money roles, above «Состав», only before installation/closed and while something is unfinished. For the owner it carries **«Начать монтаж всё равно»** → `projectForceInstallation`: owner-only, confirm, sets `o.installationForced` + timeline `installation_forced`, then `scheduleInstallationPrompt`. Both gates (`ensureVerifiedMeasurementsForStatus`, `ensureProductionReadyForInstallation`) honour the flag; once forced the button becomes a risk note.
- Verification: focused feed/cashier/gate/production-ui tests pass (`install-gate-checklist.test.ts` new; `project-feed.test.ts` updated for the removed block + header client link); full suite 825 pass / 25 fail — same env-dependent set (google-ads, gmail, twilio, plaid, installer-operations). Build and a prod phone look pending; merge/deploy after the owner's review and after PR #426.
- Still open (next layers the owner approved): site-contact field on замер/монтаж + work order; collapsible groups if he still wants fewer visible sections.

## 2026-10-26 handoff — cashier material step is no longer a dead end (branch `claude/cashier-material-forward`)

- Owner tested on prod and reported: on «Новый проект → Касса услуг → Материал» a picked material seemed to vanish, there was no save button, the window had no way forward, and «where you need to add and save, there is nothing».
- Root cause: in `serviceCashierHtml` the footer only showed «Добавить в проект», and only on the `addons` step (`canCommit`). On the `material` step the only way forward was tapping a specific film card or the «уточним на замере» link — which, in fold mode (>8 films), sits at the top and scrolls out of view. So a chosen film never reached the commit step and the step read as a trap.
- Fix: the footer now always carries a forward action. On `material` it shows «Далее →» (carrying the chosen `catalogId`) or «Далее — уточним на замере →» when none is picked, both calling `serviceCashierPick('material', c.catalogId || '')`; on `addons` it still commits with «Добавить в проект». One edit in `serviceCashierHtml` (`private/legacy/rolanpro-crm-cloud.html`); the top/bottom skip link and every pick path are unchanged.
- Verified persistence of the other add paths while here: `addCatalogItem`, warehouse film-link and the measurement/estimate film-link (`offering.filmIds`) all call `save()` — no lost-write bug found there.
- Verification: cashier/mobile/measure tests 24/24 (`service-cashier.test.ts` asserts the forward button on the material step); full suite unchanged vs main (env-dependent failures only). Build and a prod phone look still pending; merge/deploy after the owner's review.

## 2026-10-26 handoff — all five directions stay visible in the project cashier

- Branch `codex/four-directions-visible`, based on `main` `ac274c7` after PR #412.
- The new-project and existing-project cashier now always shows the five customer-facing film directions: Smart, Solar, Protective, Decorative and Privacy. A direction no longer disappears because its Price Book has zero active services.
- Opening an empty direction shows an explicit message to add and complete a service in «Услуги и цены». No placeholder service or price is invented. «Общее по объекту» remains an additional card only when it has a sellable service.
- Verification: focused cashier/directory/intake tests 21/21, full suite 899/899, `npm run typecheck`, production `npm run build` (129 routes), and `git diff --check` pass.

## 2026-10-26 handoff — exactly four service directions

- Branch `codex/four-service-directions`, based on `origin/main` `a4e34a2`.
- Customer-facing CRM now has exactly four directions: Solar, Smart, Protective and Decorative. Privacy is no longer rendered or created as a fifth direction.
- Frosted/mirror/privacy catalogue items remain valid product variants inside Decorative. The shared direction matcher lets Decorative services use both `decorative` and historical `privacy` materials without changing stock records.
- Old `privacy` / `privacy_film` projects remain readable, while new services coming through a legacy privacy entry point are saved as Decorative. Historical production, payroll and warehouse codes are preserved.
- New-project, measurement, cashier, Proposal-option and Services/Price Book flows use the same canonical four-direction mapping.
- Verification: full suite 895/895, `npm run typecheck`, production `npm run build`, and `git diff --check` pass. Production is unchanged; merge/deploy still require the Owner's explicit confirmation after PR review and CI.

## 2026-10-27 handoff — Codex PR #424 released (owner's yes)

- Merged `5b36859`, deployed. Checked on top of #431 locally: full suite unchanged; harness flow «Запланировать монтаж» → plan saved as draft → «Подготовить производство» → «Подтвердить монтаж» → installation_scheduled.
- Harness scripts that click «Подготовить производство» right after the deposit must follow the next action now (plan first).

## 2026-10-27 handoff — one measurement window + «Режим внедрения» (PR #431)

- Merged `d796c45`, deployed. Separate quick measurement window removed (supersedes #419's quick window; `projectAcceptClientSizes` stays).
- Measurement window: «Поля:» chips (`measureFieldsBarHtml`, per user in localStorage) hide direction / glass & access / notes & photos / Smart zone via `mm-hide-*` classes; measurer default all, others basics.
- Import mode `db.settings.importMode.on` (owner only; Settings «Режим внедрения», banner while on): `changeStatus` skips all stage guards, stock deduction and notifications; measurement completion and estimate readiness never block; server `prepareServiceSolutions` skips its stage checks while stored on (a manager cannot flip the flag).
- Tests: quick-measure.test.ts (rewritten), import-mode-server.test.ts.

## 2026-10-27 handoff — «Клиент уже согласен» (PR #429)

- Merged `addba35`, deployed. KP wizard send step: «🤝 Клиент уже согласен» → `projectAcceptProposalOffline` marks a published KP Sent (timeline «согласовано напрямую») and moves the project to `proposal_accepted`.
- Cause: a formed but unsent KP kept the project at «Замер»; «КП принято» needed `proposal_sent`.

## 2026-10-26 handoff — glass quantity, several rolls per receipt, multi-zone as block type (PR #423)

- Merged `687b9fa`, deployed. Also merged #421 (archived employees' salary mirrors hidden from cost lists).
- Quick measure: each glass row has «шт.» (`win.qty`/`actualQty`); totals and zones count pieces.
- Warehouse `confirmAddRoll`: «Количество рулонов» (1–50) → N rolls, each with its own `reserveRollCode`, movement and expense; guarded by `state.rollReceiptSaving`.
- Smart: multi-zone is a power block type. `smartCashierDesiredLines` adds `multi` («Блок питания мультизона») instead of the ordinary block for multi rooms; no separate multi service. Quick block question: Обычный / Мультизона / Не нужен.
- Open with owner: where Alan still appears (screenshot asked); proposal to measure and clean the legacy JSON state (awaiting yes).

## 2026-10-26 handoff — two-level measurement (PR #419)

- Merged `4c2f03e`, deployed (prod not re-checked in Chrome from this session). Mock-up: canvas boards 15–18.
- `openManagerMeasureModal` routes by `measureEntryMode`: manager → quick, measurer → full, owner → chooser on an empty project (`setMeasureMode(oid,'full'|'quick')`).
- Quick window `quickMeasureHtml` (production-stages.js): rooms, glass W×H, per-room socket (Smart → electrician) and old-film removal, Smart questions (control, block, glass) in `o.quickAnswers`, «Попадёт в КП» with «Создать услугу». Windows carry `quickMeasure: true`, sizes unverified.
- Client sizes no longer block production/scheduling: `projectAcceptClientSizes` sets `clientSizesAcceptedAt` (one confirm); «Внести точные размеры» next action is the measurer's only.
- Smart: electrician/power services first in the install window.
- Fix: renders called `serviceOfferingCanEdit()` (alerts non-owners) — plain role check now.
- Harness scripts must call `setMeasureMode(id,'full')` for the full window. Tests: `quick-measure.test.ts`.

## 2026-10-26 handoff — Smart made simple (PR #416)

- Merged `69389f6`, deployed (prod not re-checked in Chrome from this session).
- Root cause of «не могу создать проект» for Smart: `projectEstimateReadiness` included `smartCashierIssues`, and the electrician was on by default, so a missing «Подключение зоны» / «Электрические работы» stopped every Smart estimate/KP. Removed from readiness.
- Electrician default off; new room flag `powerBlockNeeded` (default off) gates the power-block line; zones stay automatic (1 panel = 1 zone).
- `managerSmartRoomFieldsHtml` override in `production-stages.js`: three toggles + «Попадёт в КП»; missing service → price + «Создать услугу» (`smartCreateOffering`).
- Existing rooms that already stored `electricianNeeded: true` keep it; untick in the room card.
- Tests: `smart-simple.test.ts`.

## 2026-10-26 handoff — manual price on the price sheet + pre-send KP summary (PR #410)

- Merged `28b4c03`, deployed; prod loads `projectSetLinePrice` / `proposalWizardSummaryHtml`.
- Direction window «Цена»: per-line unit price input, list price shown, «вручную» badge and «↺ прайс». One setter `projectSetLinePrice` (also behind `projectCardSetPrice`); owner min/max corridor still enforced.
- Server `service-solutions.ts`: typed unit price accepted on a saved quantity line with honest type/flags; new lines and flag tampering keep the directory price.
- KP wizard «Как увидит» starts with «Проверьте перед отправкой»: client contacts, lines with unit prices, total, deposit, terms.
- Tests: `manual-price.test.ts`; service-units and project-card tests updated to the owner's new rule.

## 2026-10-26 handoff — date and time required for every booking (PR #408)

- Merged `ae13250`, deployed; prod loads `scheduleReadDateTime` / `installDateTimeHtml`.
- Consultation and measurement modals: separate date + time fields with time chips (`scheduleDateTimeHtml` / `scheduleReadDateTime` in `production-stages.js`); nothing saved without both.
- `changeStatus` to consultation_scheduled / measurement_scheduled without a time opens the booking (`opts.skipScheduleGuard` bypasses).
- Install window: start/end as date + time (`installDraftPart`); duration chips no longer guess 9:00.
- Tests: `schedule-time-required.test.ts`.

## 2026-10-25 handoff — «Ставки и расходы»: one source of truth (PR #406)

- Merged `f998e20`, deployed. Owner-only view `ratesCosts` (sidebar 🧾, Settings «company-costs» and «pricing» lead here), code in `production-stages.js` (`renderRatesCosts`, `syncTeamSalaryPlans`).
- Homes: pay → employee `payConfig`; per-unit installer rate/material → `serviceOfferings` (same fields as «Услуги и цены»); fixed/variable payments → `db.opex`; percentages, fuel, consumables, helper → `pricingDefaults`.
- Salaries mirrored into fixed costs as `opx_salary_<userId>` (`autoFrom: 'team'`) on every owner `save()`; legacy `opx_owner_salary` / `opx_measurer_salary` retired (`retiredBy: 'team'`, not deleted). Prod dry-run on a copy: monthly fixed $10,119.99 before and after.
- Tests: `rates-costs.test.ts`.

## 2026-10-25 handoff — «Назначить монтаж» window by service (PR #403)

- Merged `f96b683`, deployed; prod loads `openInstallWindow` / `installStripesHtml`.
- «Назначить монтаж» opens its own cashier-style window: services in order, each with installers, start/end, quick spans, note. One service can be scheduled now, others later. Entering installation needs ≥1 planned service, closing needs all (client + `service-solutions.ts`).
- Calendar: a multi-day service shows on every day («Ceramic · день 1 из 2»). The real `calendarEventsForOrder` is in `production-stages.js` (it overrides the html copy).
- Kanban: one labelled stripe per service — red film, grey silicone, blue electric; dashed = not scheduled (`installWorkKind` / `installWorkKindMeta`).
- Tests: `install-window.test.ts`; local harness full cycle passes.

## 2026-10-25 handoff — focused service directory by five directions

- Branch: `codex/service-direction-browser-release-20261025`, based on current `origin/main` `bb482558` after PR #401.
- «Услуги и цены» now opens with only the five film directions. Selecting a direction opens a separate responsive workspace containing only that direction's services; adding or editing a service stays inside that workspace.
- The focused editor keeps the existing `settings.serviceOfferings` source of truth and all existing fields: internal/client names, calculation unit, client price corridor, installer rate, linked warehouse films/material cost, included services, cross-direction availability, Proposal option/subscription flags, and active state. Company planning and calculator references are no longer mixed into the directory landing screen.
- Verification: 871/871 tests, production build with its TypeScript gate and 129 generated pages, and `git diff --check` pass. Production is not changed by this branch yet; next action is PR CI, merge to `main`, deployment, then authenticated desktop/phone smoke verification.

## 2026-10-25 handoff — client emails were silently skipped

- Production check: Gmail (info@rolan-pro.com) is connected with no sync error, but 30 of 32 automatic client emails were `skipped | нет согласия клиента на Email` — the consent checkbox defaulted to off.
- Fix: service email now goes to every client with an email unless «Не присылать письма» (`emailOptOut`) is ticked; SMS still needs consent. See DECISIONS.md 2026-10-25.
- KP: 5 of 10 proposals on production are still Draft — never sent. KP email goes only when the manager presses Email in the KP window step «Отправить».
- Verification: legacy-sms-ui.test.ts updated; `npm test` matches main locally (env-dependent failures only).

## 2026-10-25 handoff — notification sound

- Owner: in-app notices were silent. New unread notices (🔔) and new incoming client messages now play a short two-tone chime and vibrate on phones.
- Legacy CRM: `checkNotifySound()` polls every 3 s and rings only for ids not seen before; the first check after login stays silent. Audio unlocks on the first tap (browser autoplay rule).
- Topbar: 🔊/🔇 toggle next to the bell, stored per device in localStorage (`rolanpro.notifySound`).
- Verification: `src/features/legacy-crm/notification-sound.test.ts` (2 tests) passes; the rest of `npm test` matches main locally (env-dependent failures only).
- Not done: system push notifications when the CRM tab is closed (needs Web Push).

## 2026-10-25 handoff — Google Ads conversions from the working CRM (owner's spec PDF)

Historical snapshot: the 2026-10-26 handoff and current integration runbook supersede the qualification, contact-based attribution, manual-sale exclusions, live gate and developer-token requirements below.

- Spec «Google Ads CRM integration — Developer specification v1.0» (9 Sep 2026). Server modules already covered events/outbox/Data Manager/diagnostics/adjustments/Customer Match/cost; gaps closed here:
  - `GoogleAdsCredentials` (migration 20261025180000): service-account JSON pasted by the owner, private key encrypted (bank crypto); `oauth.ts` falls back to it after env; `/api/v1/integrations/google-ads/credentials` (owner GET/PUT/DELETE).
  - Lifecycle from the legacy CRM: `closeSaleIfReady` → `ensureClosedWonConversion` (value = signed selected total, time = later of signature/deposit); `publishLegacyProposal` → `ensureQualifiedLeadConversion` with `PROPOSAL_SENT` (fires only if the owner picks that stage) and new deals get the latest touchpoint by client or by a lead with the same email/phone.
  - Delivery: `sync-cycle.ts` (reconcile → uploads → request status → adjustments → Customer Match), every 10 min via root `instrumentation.ts` (`GOOGLE_ADS_AUTO_SYNC=off` disables), owner «Отправить сейчас» = `/api/v1/integrations/google-ads/sync-now`.
  - Live gate: blocked only when env `GOOGLE_ADS_VALIDATE_ONLY=true`; otherwise owner types the customer ID.
  - CRM screen «🎯 Конверсии в Google Ads» (`googleAdsConversionsPanelHtml`) under the Google Ads block: access → IDs + qualification stage → test → live, status/outbox/problems.
- Not covered: sales recorded without an online-signed KP (manual «Оплачено → к монтажу») produce no conversion; website gclid capture lives on rolan-pro.com (send gclid/gbraid/wbraid/consent to `/api/v1/integrations/website/leads`); refunds/adjustments still need the Google Ads API developer token.

## 2026-10-25 handoff — services by direction: tile on the card, add/remove in the window

- PR #399 (42b9c14) merged and deployed; prod checked on R-261025-063: two direction tiles, card services block ~650 px instead of ~1050.
- Card (`renderProjectCardServices`): one `project-direction-tile` per direction (icon, count, status, sum, ›) + short `project-direction-line`s that open the window; before production no per-line editor, no second add button, no include checkbox. Planning rows remain in production.
- Window (`projectDirectionWindowHtml`, step services): «В проекте» with ✕ (`projectDirectionLineRemovable`, `projectDirectionRemoveLine` — a measured service frees its windows, sizes stay; `projectDirectionRemovePending`), add list, «Направление входит в расчёт и КП». Sum moved into the kicker.
- Harness note: exact-size confirmation is now a dialog (Codex #396) — click «✓ Подтвердить точные размеры» after «Подтвердить все размеры».

## 2026-10-25 handoff — CRM key for Google Ads (script-based costs)

- PR #397 (3018a45) merged and deployed; prod checked: key endpoint 200 (no key yet), summary 200, public endpoint 401 on a wrong key, block «📈 Google Ads» in Настройки → Интеграции.
- `IntegrationApiKey` (migration 20261025120000, SHA-256 hash only), `src/features/integrations/api-keys.ts`; owner routes `/api/v1/settings/integration-keys` (GET/POST/DELETE); public `POST /api/public/google-ads/costs` (Bearer key) → `GoogleAdsDailyCost` upsert (`script-costs.ts`); `/api/v1/integrations/google-ads/summary`.
- CRM block (`googleAdsCrmPanelHtml` in production-stages.js): create key → one-time modal with the Google Ads script (GAQL last 30 days, UrlFetchApp); spend, CPL, cost per project, revenue/ROAS for orders whose source is google. Script text is built line by line (a lone «}» line would end the function for the composer).
- Owner's step: create the key, paste the script in Google Ads → Tools → Scripts, authorize, run, schedule daily.

## 2026-10-25 handoff — KP → installation walkthrough on production

- Walked test project R-261025-061 (client «Zufar», owner's own contact) on prod: project → measurement → estimate → KP sent by Gmail → signed on the client page with the 10-year warranty option → Zelle chosen → deposit marked → exact sizes → production → installation scheduled 2026-11-02 10:00. Test data stays on prod (purchase request PUR-2026-0004 is a draft for it).
- PR #392 (37ef622): client options keep the signed estimate approved (`projectReapproveEstimate`); monthly options go to `o.subscriptions`; production modal has «Подтвердить расчёт» and «Заказать плёнку под проект» (`projectOrderShortFilm`, source `project_production_shortage`); film with an active project purchase request no longer blocks readiness; server `markDepositPaid` accepts `agreement_signed`; proposal detail returns `deposit.payment_method`; client page: payment before warranty, scroll after signing, Zelle amount/recipient/memo (`reference` = proposal_code), monthly price label; cashier hides priceless options, «/ мес»; estimate → KP window (not the old studio); Chase texts removed.
- This PR: paid deposit wording on the client page; sync retries a missed server deposit mark.
- Still for the owner: Stripe key and bank details in CRM settings (card and bank transfer show «not configured» to clients); installers in Team — only two «Zufar Ataev» installer accounts exist; SMS needs the client's consent tick; film purchase prices missing for Vision 89 (material $0 in the estimate).

## 2026-10-24 handoff — KP payment sync, one measurement button, paid → installation

- PR #386 (d31c594) and #387 (17d6a4f) merged and deployed; functions present on prod.
- #386: opening a project (`projectFeedHtml`) calls `premiumSyncClientProposal` (throttled 60s) → `premiumApplyServerProposalState`: viewed → local Viewed; agreement signed → status `proposal_accepted` (skipWorkflowGuard) + timeline; deposit paid online → payment + deposit. `o.kpOnline` keeps depositId/status/method. Deposit step names the client's method; payment form preselects it. `confirmPayment`: a payment covering the deposit counts as the deposit (`paymentCoversDeposit`), and `syncServerDepositPaid` POSTs `/api/v1/deposits/{id}/pay`. Measurement footer = one button (`managerMeasureFooterActionHtml`).
- #387: paid (≥ deposit) project in measurement_done/proposal_sent → next action «Оплачено → к монтажу» (`projectAcceptPaidWithoutProposal`): approve estimate, mark deposit, accept.
- Prod: R-261025-057 shows «Оплачено → к монтажу»; R-261024-055 (signed online, Zelle) moves to «Получить аванс» when its card is opened.
- Client payment page: only Zelle is available — bank details and Stripe key are not entered yet (owner enters them in CRM settings).

## 2026-10-24 handoff — one «Опции для КП» block in «Услуги и цены»

- PR #383, merged as 36bfc59, deployed; checked on prod (block renders with the 4 smart options).
- All `proposalOptional` services (non-sized) of every direction are edited in one block at the top of «Услуги и цены» (`proposalOptionsSectionHtml`): name, nameEn, direction (new `updateServiceOffering(id,'direction',…)`), price, once/monthly, installer pay, active; «+ Опция» (`addProposalOption`, draft name «Новая опция»). Options are no longer listed under their directions.
- `projectProposalOptionalOfferings` now skips options priced $0 (before, a named $0 option reached the KP).
- Prod data: smart options «Голосовое управление», «Настенный выключатель», «Второй пульт» (no price yet — owner fills), «Гарантия 10 лет (вместо 5)» $5/month.
- Tests: `kp-options-section.test.ts`; full local cycle ok.

## 2026-10-21 handoff — approved project-card route map

- Branch: `codex/project-card-artifact-20261021`, based on current `origin/main` `5f33d6a` after PR #354.
- The approved three-screen concept (project cashier, measurement, installer work order) is transferred into the canonical Project card as one compact route map: every selected direction remains visible together, the primary direction is marked, and managers can add another direction without being forced into measurement.
- The map links to the existing Measurement, Calculation / Proposal and Work-order workspaces. It does not create another project entity, measurement store, calculator or estimate total: `projectLines(o)` remains the one composition source, while every service keeps its own date, crew and direct expenses in the existing ledger below the map.
- Verification: full suite 749/749, TypeScript, 121-page production build and `git diff --check` pass. GitHub PR/CI, merge, deploy and authenticated production smoke check remain.

## 2026-10-24 handoff — KP options the client ticks; services added inside the direction window

- Branch: `claude/kp-client-options`, based on `main` after PR #381.
- Owner, 2026-10-24: «на замере подбираем плёнку, а в КП добавляем допы — клиент сам выбирает»; smart standard = power supply with remotes; options: voice control, wall switch, second remote, warranty 5 → 10 years at $5/month. And: «выбираем направление — открывается отдельное окно, и тут же внутри добавляешь услуги, чтобы не прыгало туда-сюда».
- Directory: a size-free service can be «Опция в КП — клиент отмечает сам» (`proposalOptional`) and «Подписка: цена — в месяц» (`monthly`). No option services exist on prod yet — the owner adds them with prices.
- KP window «Состав»: «Опции для клиента» list (untick to leave one out, `o.kpOptionsExcluded`). Snapshot appends them after the total is fixed as `is_optional: true, client_selected: false`; a monthly one is $0 now with «— $5/month» in the title.
- Server: `publishLegacyProposal` keeps `is_optional`/`client_selected`; subtotal = required lines, selected total = ticked; `updatePublicProposalSelections` lets the client change only optional items (before, any item could be unticked) and moves an unpaid standard deposit to 10%/≤$1 000 of the selection.
- Back to the CRM: «Забрать выбор клиента» in the feed's KP section, and automatically when the manager marks the KP accepted (`premiumApplyClientOptions` reads `/api/v1/proposals/{id}` and adds ticked options as project lines).
- Direction window «Услуги»: the direction's services are cards right there; a per-sq-ft service asks for its film in the same window (in stock first, «уточним на замере»); the window stays open. «+ Добавить направление» / «+ Направление / услуга» on the card → a short direction list → that direction's window. The cashier remains in the new-project form and the estimate.
- Verification: `kp-options-direction-add.test.ts`; updated cashier/card tests; harness full cycle + phone: picker → Смарт → Smart 90 → film step → «Уточним на замере» → Установка блока питания, all inside the window; KP «Состав» shows the two options.

## 2026-10-24 handoff — project feed and one measurement window (approved mock-up)

- Branch: `claude/project-feed-one-measure`, based on `main` after PR #380 (card step 1).
- Owner approved the Design canvas row «Новый вариант после аудита» (boards 8–11) after a TintWiz test order («делай»).
- Project card = one feed (`projectFeedHtml`, production-stages.js): «Следующий шаг» card, then Визиты → Клиент и объект → Услуги (the existing services list, without its second heading) → Замер → Плёнка и закупка → КП → Оплата и счёт → Монтаж → Документы → История; one button each, opening the existing workspaces. Tabs, side panel and the sticky duplicate step are gone; hero shows Сумма / Оплачено / Остаток. Money sections only for roles that see money.
- One measurement window for every role: `openMeasurerV25ForOrder` → the office window (the field studio stays in code, unused by routing). Footer: «Сохранить и следующее окно» (`managerMeasureNextWindow`), «Сохранить и назад», «✓ Сдать замер» for the measurer (film optional, on-site details required, issues shown in place) / «✓ Завершить замер и рассчитать» for the office.
- Window film list: «На складе» (with sq ft) first, then «Нет на складе — под заказ», then «Нет в списке — добавить и заказать».
- Next: КП with variants (board 11) — a change of the proposal model, separate PR.
- Verification: `project-feed.test.ts`, updated measure/estimate/project-lines tests; harness full cycle at 1440 (project → measure → KP → accept → deposit → verify → production → installer → act → payment → completed) and phone screenshots of the feed and the measurer window.

## 2026-10-24 handoff — measurement unblocked, film «add and order», services land on windows

- Branch: `claude/measure-unblock-audit`, based on `main` after PR #377.
- Owner, 2026-10-24: «замерщик элементарно не может закончить замер… выйти не может, просто сохранить»; «окно добавить плёнку выведено по умолчанию — а логика: при выборе плёнки, если нет на складе, добавить самому, и формируется заказ на закупку»; «услугу из списка можно добавить, но она не добавляется в проект, не считается»; «теги дублируют услуги».
- Measurer dead end: the project card «Замер» opened the office window, which hides films/prices from the measurer and then demands a film to finish. `openManagerMeasureModal` now sends the measurer to his studio. Studio: «Сохранить и выйти» (saves the open window if it was changed, `measureStudioMarkDirty`), ✕ asks to save changes, «Завершить замер» saves the open window first. Office window: «Сохранить и выйти» in a footer that stays on screen on a phone.
- Film: the room-level «Плёнка и склад» block no longer opens by default («Одна плёнка на всю комнату», folded). The window film list ends with «➕ Нет в списке — добавить плёнку и заказать…» (`openWindowManualFilmForm` / `saveWindowManualFilm`): catalog film «ожидает закупки», linked to the service, put on the window (or all windows of the service without film), draft purchase request for the project via the existing `createManualFilmDraft`; the window shows «нет на складе — заявка PUR-…».
- Services: a per-sq-ft service added to a project whose windows already carry another service stayed «ждёт замера» at $0. The cashier now opens «<услуга> — на какие окна?» (`openOfferingWindowsPicker` / `saveOfferingWindows`); pending rows say «не стоит ни на одном окне — $0 · Выбрать окна».
- Duplicates: direction tiles in «Касса проекта» repeated the direction cards below — removed (only «+ Добавить направление» stays). `orderPrice` (м² × price per м²) was still used by the projects list and reports ($468 for a $1 900 project) — now the project revenue; the list shows sq ft.
- Verification: `measure-unblock.test.ts`; updated direction-windows and estimate-workflow tests; legacy suite passes (20 Prisma files fail locally only for the missing engine); TypeScript passes; harness walk: measurer save & exit, owner add-and-order film (PUR draft), Magnetron → window picker → window moved.

## 2026-10-24 handoff — field cabinets, Invoice, Stripe key on the server

- Branch: `claude/field-cabinets-invoice`, based on `main` after PR #376.
- Owner, 2026-10-24: «проверь роль замерщика со всего кабинета и мастера»; «хочу отправить инвойс коммерческим клиентам, чтобы они платили по счёту… снять зависимость от Stripe»; «ключ от Stripe в CRM».
- Measurer: «Сегодня» is local-time (`localDateKey`), the hero says when (`fieldDayLabel`: сегодня / завтра / просрочен · date) and one button from `measurerOrderPrimaryAction` (Принять → Начать/Продолжить → Замер сдан), numbers are Сегодня / Впереди / Сдано за месяц; cards show direction chips in their colours and sq ft (no м²); «Мои замеры» lists open first, then «Сданные». The canonical constructor left the measurer menu; the project card speaks to the measurer and «← Мои замеры».
- Measurement studio: a window is measured for a service of the project (`ms-offering`, `applyWindowOffering`), the film list is that service's films with the cashier's film preselected and «— уточнит менеджер —». «✓ Завершить замер» is inside the studio (`measureStudioFinish`) and lists what is missing in place. The measurer may leave the film to the manager (`orderMeasurementCompletionIssues(o, { film })`); the KP still requires it.
- Installer: «Сегодня» opens on the next job with its one step (`installerOrderPrimaryAction`), overdue jobs say so, «Заработано за месяц», tasks first, map folded. Task cards use the same next step (finishing no longer bypasses «Мои услуги»), the project shows «Ваша выплата», in-progress step «Отметить мои услуги выполненными». Project numbers use the local date (was UTC).
- Invoice: project money actions → «Счёт (Invoice)» (`openProjectInvoice`, production-stages.js): INV-<project> number, Net 15 for commercial / Due on receipt, balance / deposit / custom amount, PO #, bill-to company + attn, English lines (+ adjustment to the project total), payment by bank transfer / Zelle / check from settings; opens a printable page (Save as PDF), saved in `o.invoices` + timeline; «Текст для письма» copies an email. Settings: «Банковский перевод (ACH / wire)» clarified, check payee/mailing address added. Bank details are entered by the owner, never sent in chat.
- Server reads bank details from `achInstructions` (the settings field) — the client KP page showed bank transfer «not configured» because it read a non-existent `bankTransferInstructions`.
- Stripe: the secret key was never stored (sanitize clears `settings.stripe.secretKey`), so the CRM field silently did nothing and the browser called api.stripe.com with it. Now: `StripeSettings` table (migration `20261024120000_stripe_settings`), key encrypted with the bank-secret envelope; `/api/v1/settings/stripe` GET (owner+manager status: mode, `sk_…1234`), PUT/DELETE owner only; `/payment-link` and `/payment-status` make links and check payments on the server. Env `STRIPE_SECRET_KEY` still wins. Browser holds no key and no api.stripe.com calls. Stripe is optional; without it the card option just isn't offered.
- Client documents: services get «Name for the client (EN)»; Russian names fall back to a known English name (Силикон → Structural Silicone) in KP, act and invoice.
- Verification: new `field-cabinets-invoice.test.ts`, `stripe-settings.test.ts`, bank-instructions test; updated surveyor, order-visibility, order-workspaces, service-progress, project-constructor, estimate-workflow, service-units tests. Locally all legacy tests pass; 20 files that open Prisma fail here only for the missing query engine (no network to binaries.prisma.sh) — CI is the check. TypeScript passes. Phone walk-through in the local harness: measurer accept → studio → finish; installer accept → start → done → act signature; invoice PDF.

## 2026-10-24 handoff — Zelle from CRM settings, card fee 3%

- Branch: `claude/zelle-and-card-fee`, based on `main` after PR #375.
- Owner, 2026-10-24: clients should pay by Zelle; a card payment passes Stripe's fee to the client («доплата за карту»). Zelle details given: zufarast@gmail.com, ROLANPRO LLC.
- The client KP page showed every method «not configured» because Zelle/bank details were read only from server env vars. `protectedPaymentInstructions` now falls back to the CRM settings (`settings.clientPayments.zelleRecipient` / `zelleRecipientName` / `zelleEnabled`, `bankTransferInstructions`) in the legacy workspace; env still wins.
- Card fee `PAYMENT_SYSTEM_FEE_PERCENT` 3.5 → 3 (Visa's surcharge cap, ≈ Stripe's rate); Stripe checkout description/metadata use the constant; checkouts created at 3.5% still verify (`LEGACY_PAYMENT_SYSTEM_FEE_PERCENTS`). Client texts say «card processing fee 3%; Zelle and bank transfer have no fee».
- Open (owner): surcharging needs notice to Stripe/Visa 30 days ahead, credit cards only (no debit), and California law restricts surcharges — the owner was told and chose the surcharge.
- Verification: two tests in `public-options.test.ts`; fee tests updated; full suite 815/815; TypeScript passes.

## 2026-10-24 handoff — direction windows and the KP window

- Branch: `claude/direction-windows`, based on `main` after PR #374.
- Owner, 2026-10-24: «когда выбираешь направление, оно должно открываться в окне отдельно и добавлять свои услуги… и КП тоже самое»; «дизайн должен остаться как есть… самое главное везде цветовые решения». A phone mock-up (Design canvas «Проект по направлениям — новый путь») was approved first.
- `openProjectDirectionWindow(oid, key, step)` (production-stages.js): the calculation workspace frame in the direction's `rpDir` colour, three steps Услуги → Замер → Цена with only that direction's lines, pending services, windows and money (owner: direct cost and margin). The project-card direction tiles and «Открыть направление →» open it. «+ Услуга направления» opens the cashier at that direction with `returnTo: 'direction'`, which comes back to the window; «Открыть замер этого направления» selects that scope in the measurement modal, whose header gets «← К направлению».
- `openProposalWizard(oid, step)`: Состав (direction blocks in their colours, total, deposit, readiness issues) → Как увидит (the client page in an iframe) → Отправить (WhatsApp, SMS, Email, copy link via the existing `premiumMarkProposalSent` / `premiumSendCanonicalProposal`). «Собрать КП» runs the existing approve/generate; `openPremiumProposalManagerModal` redirects into the window while it is open or building (`proposalWizardActive`), and the studio stays reachable («Все настройки КП»). Next actions «Расчёт готов → КП», «Сформировать КП» and «Отправить КП клиенту» open the window.
- Phones: `.rp-dirwin` skips the mobile auto-layout; the window is a 4-row grid so the step row does not stretch.
- Verification: new `direction-windows.test.ts`; one next-action assertion updated; full suite 813/813; TypeScript passes; local full cycle passes; KP window flow (compose → build → preview → WhatsApp → sent) and phone/desktop screenshots checked.

## 2026-10-24 handoff — senior in the crew, commission as one number

- Branch: `claude/senior-installer`, based on `main` after PR #373.
- Owner, 2026-10-24: the crew splits the job equally and the senior gets +10% of his share (1000 → 500 and 550); the manager earns 5% of gross revenue.
- `installerSeniorFactor(user)`: `user.installerLevel === 'senior'` multiplies that installer's per-sq-ft share by 1 + `settings.seniorInstallerBonusPct` (default 10), in both `orderInstallerPayoutForUser` definitions (HTML and production-stages, incl. stage pay). «Общие ставки компании» has «Надбавка старшему в бригаде, %» and the «Старшие в бригаде» checkboxes (house term: no «старший специалист»).
- Migration `_commissionMirror20261024` copies each manager's `payConfig.commissionPct` (what payroll uses; Danil 5%) over the stale top-level copy (10%).
- Verification: senior split test in `rates-directory.test.ts`; full suite 809/809; TypeScript passes.

## 2026-10-24 handoff — one rates directory

- Branch: `claude/rates-directory`, based on `main` after PR #372.
- Owner, 2026-10-24: «единый справочник… все ставки… единый источник правды»; no personal installer rates.
- Installer rates came from six places (service, settings by direction, settings by service code, per film, employee card, old server price list) with a silent fallback chain. Now `windowServiceInstallerRate` / `installerRateForQuickLine`: a row of a directory service pays that service's rate, the same for everyone (0 means $0); only rows made before the directory fall back to the old direction rates. Employee per-sq-ft, category and work-type rates are removed from the pay editor and ignored; the warehouse no longer shows a rate per film; the old calculator price list no longer edits or syncs installer rates (`syncLegacyInstallerServiceRate.enabled` off).
- Migration `_ratesDirectory20261024`: a priced per-sq-ft service without a rate gets the rate it was actually paid (production: A2 Security → $5.60) and `installerRateNeedsReview`; the card says «перенесено из старых настроек — проверьте» until the owner edits it.
- «Услуги и цены» → «Общие ставки компании»: deposit %, deposit cap, project profit tax %, commission per active manager (one number: `payConfig.commissionPct`, mirrored to the legacy field).
- Verification: new `rates-directory.test.ts`; affected tests updated; full suite 808/808; TypeScript passes.

## 2026-10-24 handoff — installer card fixed, one deposit rule

- Branch: `claude/team-and-deposit`, based on `main` after PR #371.
- Production audit: the CRM had no active installer. Root cause: two employees (installer zufa2012@yandex.ru and consultant ataevzufar888@gmail.com) were both linked to legacy cards u_z1/u_i1, so every directory load overwrote the installer cards with the consultant's role. `resolveSharedLegacyIds` gives a shared card to the employee whose email is on it (else the earliest), and `loadDirectoryMembers` persists that; the other employee gets their own card.
- Owner, 2026-10-24: «аванс 10 процентов не больше 1000». `companyDepositFor` (settings `advancePct` 10, `depositCapUsd` 1000, applied once via `_depositPolicy20261024`) replaces every hard-coded 30%; the KP deposit uses it too, residential still capped by the California 10% / $1,000 rule; the server fallback `calculateSuggestedDeposit` is 10% / $1,000 for commercial as well. Settings show «Аванс не больше, $».
- Verification: new tests in `directory.test.ts` and `kp-and-flow.test.ts`; full suite 805/805; TypeScript passes.

## 2026-10-24 handoff — phone flow: back buttons, cashier row, simpler project form, one services list

- Branch: `claude/mobile-flow`, based on `main` after PR #370.
- Owner, 2026-10-24 (phone screenshots): no way back from the calculation and the KP, cashier steps stacked as full-width buttons, project creation hard to read, and on «Услуги и цены» a second «Услуги» list under the directions that looked like a duplicate.
- «Услуги и цены»: the old server price list (`renderCanonicalServicePricing` services + add-ons) only feeds the «Калькулятор» page, not projects, cashier or KP. It is now one closed block «Прайс быстрого калькулятора» under the directions, with that explanation; nothing deleted.
- Back: «← К проекту» in the calculation header and in Proposal Studio («← К списку КП» when opened from the registry).
- Cashier: `mobile-workspace.ts` auto-layout passes skip `.rp-cashier` and `[data-rp-keep-layout]`; on phones the steps are one swipeable row. A material list over 8 films folds by series with «Материал уточним на замере» first.
- Calculation footer on phones: hint clamped to two lines, «Сохранить черновик» beside the main button.
- Project form: the chosen client is one line with chips and «Сменить»; segment/relationship fold under «Сегмент и тип клиента · изменить»; one «Адрес объекта» (a select only with several addresses, «+ Другой адрес»); the «старым форматом» address warning is no longer shown here; plain hint for «Услуги проекта».
- Verification: new `mobile-flow.test.ts`; full suite 803/803; TypeScript passes; local full cycle (client → payment, signature) passes on desktop; phone (390 px) screenshots of form, cashier, calculation and KP checked.

## 2026-10-24 handoff — films by direction when a service has none linked

- Branch: `claude/films-by-category`, based on `main` after PR #369.
- Owner, 2026-10-24: «ты выбираешь направление, категорию и под эту категорию плёнку из списка». A service without linked films (production: Silver, Ceramic, A2 Security) left the window's «Материал» list empty and the server refused windows whose film was not in `filmIds` — so the calculation could not be approved and no KP could be made.
- Rule now, the same in the browser (`serviceOfferingAllowedFilmIds`) and on the server (`filmAllowed` in `service-solutions.ts`): linked films restrict the choice; with none linked, every non-archived film of the service's direction is allowed. The browser uses it for the window picker, the cashier material step, quick lines, defaults and every validity check; the directory editor and the code that adds links still read the raw `filmIds`. The owner's «привяжутся к услуге» group appears only when a service already has links.
- Verification: the film test in `flow-fixes.test.ts` rewritten for the rule; new server test in `service-packages.test.ts`; full suite 797/797; TypeScript passes.

## 2026-10-23 handoff — client signature under the act, CRM message cards

- Branch: `claude/act-signature`, based on `main` after PR #368.
- Act: the installer's «Подпись клиента под актом» and the manager's next step open `openActSignature` — the completed work in English (KP line titles), client name, a finger-signature canvas (`touch-action:none`) and an acceptance checkbox. `confirmActSignature` requires all three, stores `o.actSignature` {name, signedAt, collectedBy, image (PNG data URL, a few KB), work}, adds an `act_signature` timeline entry and moves the project to `act_signed`. The project header shows «Акт подписан клиентом: … · Открыть акт»; `openSignedActDocument` opens a printable certificate of completion with the signature.
- Messages: `window.alert` now opens a CRM card (`crmNotice`, layer outside `#app`, queued, Enter/Esc/«Понятно»), kept in sessionStorage so a message shown right before a reload appears again. `confirm` stays native (synchronous callers).
- Card: the «Создать или связать замер» suggestion is gone — the measurement is already the main next-step button.
- Verification: new `act-signature.test.ts` (4 tests); one test updated for the new act action; full suite 796/796; TypeScript passes; the full cycle with the on-screen signature passes in a local copy (empty signature refused with a CRM card, signed act stored and shown).

## 2026-10-23 handoff — KP drawing, one service path, direct installation scheduling (Owner's second pass)

- Branch: `claude/kp-and-flow`, based on `main` after PR #367.
- KP technical drawing: every window in the published KP carries `width_in`, `height_in`, `window_type` (English part), `panels` and `panel_layout` (`premiumWindowDrawingData`); the client page draws each window to scale with its panes and sizes (`WindowDrawing` in `client-proposal-view.tsx`, styles `.proposal-window-drawing*` in `globals.css`). The cover counts openings (was sq ft as «windows») and the line chips show «N windows · X sqft».
- KP language: films read «Madico Sunscape Select 15» (`premiumCatalogTitleEn`, `projectLineMaterialNames(line, { en: true })`) instead of the Russian category label; standard room names and «Окно N» are translated on the English page; quantities and sq ft rounded to hundredths; panes keep hundredths of a millimetre (36×48 in = 12 sq ft, was 12.0079).
- Deposit: `orderExpectedDeposit` takes the KP's «к оплате при подписи» (fallback: advance % of settings) — KP $90 and CRM $270 no longer disagree.
- One way to add a service: the per-direction dropdown in the project card became «+ Услуга в направление», opening the cashier at that direction; the calculation's free line is «+ Своя строка» with a tooltip.
- Installation: the next step «Назначить монтаж» opens the crew-and-date form; «Та же дата и бригада для всех услуг» copies the first service to the rest (`projectScheduleCopyFirstToAll`); while installation is planned the next step shows date and crew instead of «Заказ под контролем». The stage-aware `projectSetServiceProgress` override (production-stages.js) also warns on no photo / future date. «Отметить КП принятым» and «Подписать акт» ask for confirmation.
- Verification: new `kp-and-flow.test.ts` (6 tests, incl. a server-side render of the client KP); one workflow test updated; full suite 792/792; TypeScript passes; the whole cycle (client → project → cashier → measurement → calculation → KP publish with the server's snapshot rules → share → accept → deposit → confirm sizes → production → schedule → installer → act → payment → close) passes end to end in a local copy.

## 2026-10-23 handoff — third batch from the Owner's user test (confirm all sizes, calculation clarity, closing warnings, compact header)

- Branch: `claude/flow-fixes-3`, based on `main` after PR #366.
- Measurement: «✓ Подтвердить все размеры (N)» in the footer (`managerConfirmAllWindowMeasurements`, `managerConfirmableWindows`) confirms every window with typed sizes in one dialog that lists them; windows still on the typical size are named and left; one history entry.
- Calculation: KPI reads «Валовая прибыль / маржа»; the quick card «Плёнка с отходом раскроя»; the lines table note explains why project cost is above the sum of lines. Section 6 is a folded «Чистая прибыль с долей расходов компании · оценка» (remembers open state) and, when the project is the only one of the month, says that all monthly fixed costs fall on it instead of showing a bare −$8 575.
- Installation: marking a service (or «Мои услуги выполнены») done with no photo in the project, or before its planned day, asks first (`projectServiceDoneWarnings` / `projectConfirmServicesDone`) — a warning, never a lock on field work. «Акт подписан» asks «Клиент подписал акт…?».
- Header: compact desktop paddings for the measurement header and progress steps (phone/tablet rules unchanged).
- Verification: new `flow-fixes-3.test.ts` (4 tests); label tests updated; `service-progress.test.ts` stubs `confirm`; full suite 786/786; TypeScript passes; confirm-all, folded net profit and header checked in a local copy of the CRM.

## 2026-10-23 handoff — second batch from the Owner's user test (sizes, KP sent state, drafts, labels, client card)

- Branch: `claude/flow-fixes-2`, based on `main` after PR #365.
- Sizes: a new window starts with `sizePlaceholder: {width, height}` — the typical size draws it, the inputs stay empty with the size as an orange hint, area shows «—», «Размеры» is not green, finishing the measurement / approving the estimate / confirming exact sizes ask for typed sizes (`windowSizeEntered`). Typing a size clears the flag; older windows count as measured.
- Inches: `measureInputToMm` keeps hundredths of a millimetre, so 72 in reads back as 72 (was 72.01, 36 → 35.98).
- KP: publishing only makes the link (`prop.publishedAt`, timeline «ещё не отправлена»); the KP and project become «Отправлено» when the manager shares it (`premiumMarkProposalSent` on WhatsApp / SMS / «Скопировать ссылку»; email already did). The next step reads «Отправить КП клиенту» meanwhile (`projectProposalNextAction`). «КП принято» from the card marks the latest open proposal Accepted. Manager modal in Russian (`premiumStatusLabelRu`); the client portal keeps English labels; opening the modal no longer overwrites the clipboard.
- Directory: a service with the default name «Новая услуга» and no price is a draft (`serviceOfferingIsDraft`) — hidden from the cashier and pickers, shown to the owner with a «Черновик» note; projects that already use it keep it.
- «Ближайшее событие» no longer shows a finished measurement; the fallback takes only future events.
- Labels: direction short names in Russian (Солнцезащитная, Смарт, Защитная, Декоративная, Приватная); the work order shows the access label and the glass card title instead of raw codes.
- Client card: the search text fills name/phone/email; phones are stored as +1XXXXXXXXXX (`normalizeClientPhone`, server matching is E.164 too); empty required fields are outlined and scrolled to; a note explains that without consent the client gets no SMS/email; the B2C company block is really hidden (a later `.grid` rule beat `.hidden`).
- Lin ft lines are 0 (unknown) until windows exist when the project needs a measurement — no «Сумма $5» before any price.
- Verification: new `flow-fixes-2.test.ts` (9 tests); two existing tests updated for the intended KP change; full suite 782/782; TypeScript passes; client card, cashier and placeholder sizes checked in a local copy of the CRM.

## 2026-10-23 handoff — fixes from the Owner's end-to-end user test (payment, deposit, estimate reset, films)

- Branch: `claude/flow-fixes`, based on `main` `50d9cee` (after PR #364).
- Payment: «Отметить оплату» set `payment_received` with $0 recorded and $800 still owed. Now `ensurePaidForStatus` (called in `changeStatus`) refuses `payment_received`/`completed`/`review_received` while `orderAmountDue(o) > 0` and opens the payment form; the act-signed next step is «Получить оплату» (amount, method, date). A partial payment is saved and the status waits; once payments cover the price the status follows (`state._paymentModal.thenStatus`). Payment dates default to the user's local day (`paymentLocalDate`).
- Deposit: `markDepositReceived` used to add to `o.paid` without a payment record. It now opens the payment form with the KP deposit (`orderExpectedDeposit`, advance %) and records a real payment. After acceptance the first next step is «Получить аванс» (`projectDepositExpected`: deposit terms, nothing paid, not waived). It does not block work — «Без аванса» (`waiveProjectDeposit`) records who decided and why. Agreed post-pay asks for nothing.
- Estimate reset: confirming unchanged sizes or picking facade/installation side reopened an accepted calculation and production readiness (three loops per project). `invalidateProjectEstimate` now keeps the approval while `projectEstimatePriceFingerprint` (line qty/price, area, total) is unchanged, and keeps production readiness while `projectProductionFingerprint` (sizes, panels, film, film direction) is unchanged. Fingerprints are stored at approval / production confirmation; older approvals without one behave as before.
- Readiness: production readiness now lists `orderTechnicalMeasurementIssues` (glass, sides, access), so «готово» no longer leads to a refused schedule.
- Films: a service without linked films left an empty «Материал» list and a measurement that could not be finished (in production Magnetron, Silver, Ceramic have none). The owner now sees «Другие плёнки направления — привяжутся к услуге»; choosing one (after a confirm) adds it to `offering.filmIds` and sets the window. Others see a hint that the owner links films in «Услуги и цены». The server rule (window film must belong to the service) is unchanged and satisfied.
- Verification: new `flow-fixes.test.ts` (8 tests); 4 sliced tests stub the new guard; full suite 773/773; TypeScript passes; deposit, film linking, approval survival and partial→full payment walked through in a local copy of the CRM.

## 2026-10-23 fix — window works visible on the window card

- Branch: `claude/window-services-fix`, based on `main` `c4b192a` (after PR #363).
- Found in the Owner's end-to-end user test (client → project → cashier → measurement → calculation → KP → production → installation → act → payment): the «Работы на этом окне» chips sat inside the collapsed «Стекло, доступ и технические характеристики» block, which also collapsed again after every edit, so the ticks were effectively hidden. They now render right after the window sizes.
- The «Работы на окнах» bar compared ticked windows with the ticked set itself, so «1 из 2» offered «снять со всех». It now compares with all candidate windows (the parent service's windows for a package component), shows «N из M» against them, and is hidden until the project has a window.
- Verification: `window-services.test.ts` updated (+partial state, no-window case, chips outside the technical block); full suite 765/765; TypeScript passes; measurement re-rendered locally with the real stylesheet.

## 2026-10-22 handoff — works ticked on individual windows in the measurement

- Branch: `claude/window-services`, based on `main` `0a2d411` (after PR #362).
- Owner's ТЗ кассы («Что требуется на окне»): a size-free service of the project — silicone by lin ft, a per-piece work such as removal of old film — can now be ticked on each window in the measurement, and «на все окна» ticks the whole project (or every window of the package's parent service for an included component).
- Model: `win.serviceIds: string[]`. `projectWindowsForService(o, offeringId, parentId)` returns the ticked windows; while **no** window of the project is ticked for a service the line keeps its old meaning — every window (every parent window for an included line) — so existing projects keep their quantities. `projectWindowServiceLines(o)` lists the lines a window can carry (lft/piece, not quick lines).
- Quantities: lin ft = perimeter of the ticked windows; pieces = sum of their quantities (once a window is ticked). `projectIncludedQty` and the lft auto-sync in `syncProjectIncludedServices` use the same helper; ticking a window clears `qtyManual`, invalidates the estimate and refreshes only the measurement modal (no full render).
- UI: chips «Работы на этом окне» in each window card (direction colour via `orderServiceCardStyle`, measure of that window shown under the name) next to the existing removal checkbox; a «Работы на окнах:» row under the measurement progress with «N из M» / «все M» and «на все окна» / «снять со всех» per service (`managerToggleWindowService`, `managerSetServiceOnAllWindows`, `managerWindowServiceChipsHtml`, `managerWindowServicesBarHtml`).
- Server: window fields are passed through unchanged, so `serviceIds` needs no schema change.
- Verification: new `window-services.test.ts` (6 tests: legacy meaning, quantities, manual qty, all/none, package parent scope, chips/bar markup); full suite 765/765; TypeScript passes; chips and bar rendered with the real stylesheet. GitHub CI, merge, deploy and the Owner's check remain.

## 2026-10-22 handoff — a service may be offered in several directions

- Branch: `claude/service-directions`, based on `main` merge `6524b58`.
- Owner, 2026-10-22: when a service is created in «Услуги и цены» the owner must pick which direction(s) it relates to, so that at project creation it is pulled in under each of them (silicone under protective and smart; high-access work under every film direction). Until now a service lived in exactly one section.
- Model: `offering.direction` stays the home (edited there; films live there); new `offering.directions: string[]` lists the other directions a **size-free** service is also offered in. A per-sq-ft service cannot be shared (its films and measurement belong to one category); switching a shared service to sq ft clears `directions`.
- Directory: each size-free service gets «Также предлагать в направлениях» checkboxes in the direction colours; the other sections show «Также предлагаются здесь: … (из «…»)». `serviceOfferingsFor(direction)` now includes shared services (`homeOnly: true` for the editor).
- Project: `projectAddOfferingLine(oid, offeringId, serviceType)` and `projectOfferingLine(offering, qty, serviceType)` keep the direction the service was sold under (`offeringServiceTypeIn`); a package component follows its parent's direction (`projectOfferingServiceType`). Cashier passes the chosen direction from the card; the intake remembers it (`state._newOrderDirectionsByService`, `newOrderOfferingServiceType`) so `createOrder` builds `serviceTypes` and lines from the chosen direction, not the home.
- Server: `directions` is validated (known directions, size-free only); a line may be sold under any direction the service is offered in.
- Verification: `service-cashier.test.ts` +2, `service-units.test.ts` +1, pattern tests updated; full suite 758/758; single-definition guard passes; directory rendered with the real stylesheet. GitHub CI, merge (after hotfix #360), deploy and the Owner's check remain.
## 2026-10-22 hotfix — the server accepts «Общее по объекту»

- Branch: `claude/general-server-fix`, based on `main` merge `6524b58`.
- PR #358 added the `general` direction on the client only; `service-solutions.ts` still validated `offering.direction` against five directions and mapped project lines through `DIRECTION_BY_SERVICE_TYPE` without `general_works`, so the Owner's save of a general service (and any project with a general line) was refused with «Укажите направление и название услуги» / «Услуга не соответствует направлению проекта».
- Fix: `SERVICE_DIRECTIONS` gains `general`, `DIRECTION_BY_SERVICE_TYPE` gains `general_works`, and a general service per sq ft / lin ft is refused server-side as well.
- Verification: `service-units.test.ts` +1 (directory save, project line, sq-ft refusal); full suite 756/756.

## 2026-10-22 handoff — measurement window card layout on tablet and phone

- Branch / PR: `claude/measure-window-layout` / #359, based on `main` merge `a7e3db1`.
- Owner, 2026-10-22 (iPad screenshot of «Замер объекта»): field labels broke letter by letter, inputs were a few characters wide, the select was cut, «Удалить окно» sat on its own full-width row.
- Cause: `.manager-window-card-body` is a two-column grid (solution | window type) with three children — the `.manager-window-fields` block fell into the first column (170–180 px) and split three fields across it; the global `overflow-wrap: anywhere` from PR #55 then broke label words. `.manager-window-card-head` had three tracks for four children, so the delete button wrapped onto a new row.
- Fix (CSS only): the field block spans the card body and uses `repeat(auto-fit, minmax(150px, 1fr))` at every breakpoint (desktop 4–5 columns, iPad portrait 4, phone 2); labels wrap at spaces only; the head has four tracks and on ≤840 px becomes a wrapping flex row. First column on ≤1180 px is `minmax(200px, .9fr)`.
- Verification: `measurement-ui.test.ts` +1 layout guard; full suite 752/752; single-definition guard passes; window card rendered with the real stylesheet at 1080, 820 and 390 px. GitHub CI, merge, deploy and a check on the Owner's iPad remain.
## 2026-10-22 handoff — «Общее по объекту»: works without a film in the cashier

- Branch: `claude/general-services`, based on `main` merge `a7e3db1` after PR #356.
- Owner, 2026-10-22: besides film services the project needs works that belong to the site, not to a film — removal of old film, washing, electrician, equipment rental, a contractor (ТЗ кассы, level 4 and «Общее по объекту»). Until now every service had to belong to a film direction, so such works could neither be created in «Услуги и цены» nor chosen at the cashier.
- `ORDER_PRIMARY_SERVICES` gains a sixth entry `general_works` (`general: true`, catalogCategory `general`); `SERVICE_OFFERING_DIRECTIONS` gains `general`. The directory shows the group «🧰 Общее по объекту» with its own «+ Добавить услугу»; its services are size-free only (`serviceOfferingUnitsFor`: piece, zone, fixed, custom — never sq ft / lin ft; a saved sq-ft unit falls back to per piece). `filmDirections()` keeps film-only selects (quick-line direction, lead capture) and measurement scopes untouched.
- Cashier: general works appear as a separate add-on group under any film direction, and «Общее по объекту» is also a direction card of its own (no film step). Intake: a general work alone can be the whole project, but once a film direction is chosen it becomes the incoming request (`toggleNewOrderOffering` orders film first).
- No seeded services: the Owner creates the real works and prices in «Услуги и цены» → «Общее по объекту».
- Verification: `service-cashier.test.ts` +2, `project-intake-sequence.test.ts` +1, `service-units.test.ts` updated for the sixth group; full suite 754/754; single-definition guard passes; add-on screen rendered with the real stylesheet. GitHub CI, merge, deploy and production smoke remain.

## 2026-10-21 handoff — service cashier in the new-project form

- Branch: `claude/new-project-cashier`, based on `main` merge `5f33d6a` after PR #354.
- Owner, 2026-10-21 (voice): the cashier was meant for the moment the manager creates a project, not only for an existing card. Step «3. Услуги проекта» of the new-project form no longer lists checkboxes: it shows the chosen services (direction colour, «исходный запрос» on the first, chosen film, included components, «Убрать») and a «+ Услуга» button that opens the same cashier.
- Because the form is the open modal and holds typed fields, the intake cashier renders on its own layer (`#rp-cashier-layer`) above it instead of replacing `state.modal`; it reads the intake state as its scope and commits through the existing `toggleNewOrderOffering` / `setNewOrderOfferingMaterial`, so `createOrder` and everything after it are untouched.
- Verification: `service-cashier.test.ts` +2 (intake layer/scope/commit, field-role guard), `project-intake-sequence.test.ts` updated for the list; full suite 750/751 with one unrelated flaky test (`bank-feeds.test.ts` encryption case) that passes in isolation on this and on the previous `main`; single-definition guard passes; intake list and overlay rendered with the real stylesheet. GitHub CI, merge, deploy and production smoke remain.

## 2026-10-21 handoff — service cashier (касса услуг)

- Branch / PR: `claude/service-cashier` / #354, rebased onto `main` merge `d2a5bf0` after PR #353.
- The «+ Услуга в проект» dropdown on the Project card and the estimate workspace is replaced by the cashier modal (Owner, 2026-10-19): direction → service → film → add-ons → «Добавить в проект». Cards take the direction colour from the shared entity tokens (`--svc-color`), inactive services and archived films are left out, a per-sq-ft service already in the project is shown as «уже в проекте», an included package component is listed in the summary and never offered twice.
- No data-model change. The chosen service, film (`offeringCatalogIds` + windows without a film) and add-ons enter the project through the existing `projectAddOfferingLine`, so estimate, Proposal, included services, schedules and work orders are untouched. From the card the edit stays on the card (`projectCardEdit`); from the estimate workspace the cashier returns to it.
- Verification: `service-cashier.test.ts` (6 tests: guards, flow, back-navigation, commit, return paths), `project-card.test.ts` updated for the button; full suite 744/744; single-definition guard passes; desktop and 390 px renders of all four steps checked with the real stylesheet. GitHub CI, merge, deploy and a production smoke check remain.
## 2026-10-21 handoff — employee ghosts

- Branch / PR: `claude/employee-ghosts` / #353, merged to `main` as `d2a5bf0`; CI (tests/typecheck/build, clean-database gate) passed before merge.
- Owner, 2026-10-20: a deleted surveyor kept appearing in crew, manager and task pickers after the Owner re-created himself under the same email. Cause: `applyEmployeeDirectory` left legacy cards no PostgreSQL employee is linked to untouched, so a former employee's card stayed `active: true` forever; and nine legacy pickers listed `db.users` without the active filter (the dispatch calendar checked a non-existent `isActive` field).
- Fix: unlinked cards are switched off on every read/save — the card and its id stay for historical orders, and re-linking turns it back on. One helper, `activeUsers(roles)`, now feeds the manager, cold-call, task team/assignee, task candidate, Telegram chat-id, Zadarma extension and dispatch lists.
- Verification: `directory.test.ts` (archive/relink rule) and `employee-pickers.test.ts` (helper + no raw `db.users` pickers); full suite 742/742; single-definition guard passes. GitHub CI, merge and deploy remain. After deploy the Owner should review «Команда → Архив сотрудников», where every ghost will now sit.

## 2026-10-20 handoff — safe employee deletion

- Added an explicit owner-only `Удалить` action to the canonical employee directory.
- Deletion is intentionally a reversible archive: login is disabled and the employee leaves new assignment lists, while historical projects, field work, payroll accruals, and audit records keep their employee reference.
- The active owner cannot delete their own account; the existing last-owner guard remains in force. Archived employees are hidden from the working list under a collapsed `Архив сотрудников` and can be restored through `Изменить`.

## 2026-10-20 handoff — legacy single-definition stability guard

- Branch: `codex/legacy-single-definition-guard-20261020`, based on production `main` merge `3a1c6cf` after PR #348.
- Production regression found during an authenticated smoke check: opening «Проекты» could fail with `orderPlannedAreaSqft is not defined`. `composeProductionHtml` treated a one-line overridden function as multiline and removed the following helper. The composer now terminates one-line declarations on their own line, and its tests assert both the generic preservation case and the real planned-area helper in the served HTML.
- Root cause found: `private/legacy/rolanpro-crm-cloud.html` declared `printWorkOrder` twice. The later obsolete global function silently replaced the canonical renderer, so a printed work order could omit the unified project services, each service's crew/date, site access and Smart installation plans even though the newer UI and tests existed earlier in the file.
- Fix: the obsolete shadow printer is removed. `legacy-script-integrity.test.ts` parses the real inline script with the TypeScript parser and fails on any repeated top-level function declaration; it also requires the sole work-order printer to use `renderWorkOrderHtml(order, true)`.
- Audit: `docs/LEGACY_CRM_STABILITY_AUDIT_2026-10-20.md` records the measured monolith size, overlapping legacy PR risk, persistence risk and a phased no-rewrite remediation plan.
- Verification: the production-composer/project focused suite passes 22/22 and the full suite passes 734/734. `git diff --check` passes. Local Prisma CLI loading and `next build` both stall on this host before diagnostics; the existing local generated Prisma Client is older than the schema, so local TypeScript reports unrelated missing generated fields. Clean GitHub CI must regenerate Prisma and provide the required TypeScript, production-build and clean-database gates. No production data or deployment changed.

## 2026-10-19 handoff — unified entity colour tokens

- Branch / PR: `codex/entity-color-tokens-20261019` / #348, based on current `origin/main`; source patch `pr1-entity-color-tokens.patch` applied cleanly.
- `src/features/legacy-crm/entity-tokens.ts` is now the single colour/icon source for the five film directions, add-on services, stock levels and shared frame colours. The `/legacy-crm` route injects its CSS variables and `window.RP_ENTITY` before the legacy script runs.
- Seven legacy direction palettes and five stock-badge call sites now read the shared tokens, so Project cards, measurement, catalog, calendar, kanban, Academy and Warehouse no longer assign conflicting colours to the same entity.
- Verification: full local automated suite passes 730/730; inline legacy scripts compile through the suite; `git diff --check` passes. GitHub CI for PR #348 passed the clean-database/end-to-end gate, test/typecheck/production build and review-response checks. Production has not been changed; merge and deploy remain separate Owner decisions.

## Current task update — 2026-10-07

- Branch / PR: `codex/reference-scroll-calendar-cohesion` / #316, from `origin/main` at `42fe16d`; implementation head `7ffc2ae` passed all three required GitHub checks, including the clean database and phone/desktop browser gate.
- Reference-directory jitter is fixed without changing the data model: ordinary service, price, film-link, and catalog-cell edits save in place instead of rebuilding the complete CRM; the only structural service edit (unit type) captures the scroll position before rendering its changed fields.
- Calendar day, week, month, dispatch-map, event, navigation, filter, and field-role controls keep their existing behavior and now use the shared Rolan PRO design theme: the same 8 px surfaces, 6 px controls, navy-to-cyan active state, borders, typography, and restrained shadows as the rest of the CRM.
- Verification completed locally: 591/591 tests, TypeScript, 119-page production build, inline-script validation, and diff check pass. Release completion remains the normal protected path: final PR CI, merge to `main`, production deploy, then authenticated calendar and reference-directory smoke tests.

## 2026-10-11 handoff — issue #339 project command-center regressions

- Branch / PR: `codex/project-command-center-regressions` / #340, updated onto `main` merge commit `70bd57b` after PR #337; tracked by issue #339.
- Owner/Manager navigation now keeps both `Расчёт / КП` and `Документы / портал`, and exposes a pending client reschedule/cancellation request. The primary warning opens that request workspace, where the existing accept/decline flow remains the single write path.
- Review follow-up: client schedule requests are fail-closed to the owner or the project's assigned manager at the primary action, hidden workspace, direct workspace opener and resolver. Surveyors, installers and unrelated managers cannot render, open or resolve a request, and the denied resolver performs no save or client notification.
- `Ближайшие работы` now groups only future unfinished service lines. Past service dates, explicitly completed lines, and inferred completed lines of legacy closed projects cannot hide the real next work; the full calendar still retains its historical visits.
- Verification on the merged review-fix tree: 698/698 tests, 38 scoped workspace/stage/progress tests, TypeScript, the 121-page production build, inline-script coverage, and diff check pass. Fresh PR CI, merge, deploy and production smoke verification remain.

## 2026-10-11 review follow-up — PR #337

- Branch / PR: `claude/project-flow` / #337, merged to `main` as `70bd57b`; P2 follow-up was committed as `0498af9` on top of reviewed head `7b8162d`.
- The shared proposal-acceptance predicate now gates the production readiness check, the passport «Монтаж» action, and the schedule-workspace «Монтаж» action. A no-window project therefore skips film preparation but cannot offer an actionable installation before the Proposal is accepted.
- Verification of the P2 follow-up: 694/694 tests, the 74 scoped project-stage/estimate/card tests, TypeScript, the 121-page production build, and diff check passed locally; GitHub CI run `38164809310` passed before merge.

## 2026-10-08 handoff — Rolan PRO intelligent agent v1

- Branch: `codex/intelligent-agent-v1`, based on current GitHub `main` `38c9de0` after PR #318. The original checkout had unrelated local changes and a broken stale ref, so implementation uses an isolated fresh clone and does not touch that work.
- The existing AI assistant now has a role-safe «Пульс» and uses the approved `/landing/rolan-mascot.webp` as its entry point. Owner/Manager receive overdue-task, client-debt and missing-next-action guidance; Owner also receives the bank-review action; Surveyor and Installer receive only their next assigned field work.
- Suggested task creation requires confirmation, deduplicates open recommendations and records the agent source. The conversational data context now uses the canonical role-scoped order/client functions and omits money for field roles.
- Verification: 606/606 tests pass, including three new agent tests; all five inline scripts compile and `git diff --check` passes. Local TypeScript and production build were stopped after more than 30 minutes blocked on shared filesystem dependency reads without diagnostics; clean GitHub CI must provide those two gates before merge. No deployment or production data change has been attempted.

## Active pull requests

| PR | Purpose | Branch | State at last verification |
| --- | --- | --- | --- |
| Add CRM Operations Agent safe-write layer for Owner → ChatGPT → CRM commands | `codex/crm-operations-agent-init-09261547` / #241, issue #236 | ChatGPT + Codex review | HMAC service endpoint, allowlisted real CRM writes, durable idempotency receipt/audit, ambiguity handling, real backend IDs, migration, tests, typecheck and production build are implemented; latest CI is green; independent Codex review on the latest head is pending | Complete latest-head Codex review, merge only if no blocking findings, then configure secure runtime secret + service actor and run controlled non-production expense/project smoke tests before any production write |
| #19 | Hide project finance from surveyors and installers | `security/hide-project-finance-field-roles` | Open; review and merge still required |
| #18 | Enforce manager record scope | `security/enforce-manager-record-scope` | Open; review and merge still required |
| #17 | Remove embedded customer export | `security/remove-embedded-wiz-data` | Open; review and merge still required |
| #12 | Bootstrap Claude Builder transport | `feature/claude-builder-transport` | Open; completion state must be reviewed before reuse |
| #24 | Unified proposal delivery, public PDF, employee routing, and removal of duplicate PIN login | `codex/unify-crm-proposal-pdf` | Open; local checks passed, GitHub review/CI and merge still required |
| #98 | Employee email editing, password recovery, and canonical server login | `fix/employee-account-recovery` | Merged and deployed; post-merge security findings are handled by #99 |
| #99 | Revoke old sessions and make password-reset links atomically one-time | `fix/password-reset-session-revocation` | Open; first full CI green, final docs commit CI/security review required before merge |

Always re-check GitHub before acting; this table is a handoff snapshot, not a substitute for the live PR state.

## Confirmed system state

- `/legacy-crm` is the current operating workspace.
- The legacy workspace stores a large state payload through `LegacyWorkspace.payload`.
- Modern CRM modules use relational Prisma/PostgreSQL models.
- Legacy and modern records do not yet have one complete synchronization path.
- This split can produce different results between modules or devices.
- PostgreSQL must become the only source of CRM business data; browser storage may be used only as a disposable cache.
- GitHub `main` is the only source of released code.

## Confirmed duplication to consolidate

- Proposals currently have a legacy proposal flow and a separate modern `ProposalBuilder` flow, plus unused legacy fragments.
- Measurements currently have multiple legacy entry points, a standalone field HTML module, and a modern shared survey workspace.
- The standalone measurement module uses a local desktop file path and therefore cannot be a reliable cloud workflow.
- Legacy order/project cards and modern Project records are not yet one synchronized entity.

## Canonical target workflow

`Deal -> Consultation / Survey -> Measurement -> Proposal -> Agreement / Deposit -> Project`

Target modules:

- Survey and measurement: modern shared consultation/survey workspace.
- Proposal: one database-backed proposal builder; public proposal page is an output, not a second editor.
- Project: one modern Project record shared by scheduling, installation, finance, and operations.
- Permissions: surveyors and installers must not see project totals, margins, costs, or other financial data.

## Priority order

1. Review and merge or close PRs #17, #18, and #19 without duplicating their work.
2. Verify production deployment from the resulting `main` commit.
3. Define and test migration mapping from legacy workspace data to PostgreSQL records.
4. Make modern modules the only write path, then place legacy flows in read-only mode.
5. Consolidate proposal, measurement, and project-card entry points.
6. Remove dead legacy functions only after migrated records and production behavior are verified.

## Current task ownership

| Task | Branch / PR | Owner | Status | Next action |
| --- | --- | --- | --- | --- |
| Keep the measurement workspace stationary while entering width and height | `codex/fix-measure-scroll-jump-20261101` / #442 | Codex | Implemented for review: width, height and quantity changes wait for the browser to finish transferring focus before the canonical modal rebuilds, while the existing keyed scroll restoration remains intact; a closed or replaced measurement modal cannot be reopened by the delayed refresh. Focused checks pass 27/27; clean GitHub tests, TypeScript, production build, database migration/seed and end-to-end gates all pass | Review PR #442; merge/deploy only with separate explicit owner approval, then verify width → height → quantity on a real iPhone session |
| Simplify «Услуги и цены» to five direction cards with a focused service workspace | `codex/service-direction-browser-20261025` | Codex | Implemented locally from current `origin/main`: the entry screen contains only Smart, Solar, Protective, Decorative and Privacy; each direction opens its own responsive service workspace and editor. The canonical `settings.serviceOfferings` store, project calculations, Proposal generation, warehouse links and historical project snapshots remain unchanged. Focused checks pass (75/75, then 37/37 and 9/9 after copy updates); the complete CRM suite passes 858/858. Nothing was published or deployed | Run an authenticated desktop/phone visual review with the Owner; after approval, commit/open PR and merge/deploy only with separate explicit owner approval |
| Prevent legacy code layers from silently replacing canonical CRM behavior | `codex/legacy-single-definition-guard-20261020` | Codex | Obsolete second `printWorkOrder` removed; generic top-level single-definition guard added; 732/732 tests pass; local Prisma/build tooling stalls before diagnostics | Open PR and require clean GitHub TypeScript, build and database gates; merge/deploy only after explicit owner approval |
| Extend the B2B client card with correspondence addresses, multi-object access, and an optional client/partner cabinet | `codex/client-addresses-portal-access` stacked on `claude/client-card-b2b` | Codex | Implemented locally: the shared B2C/B2B contact form stores legal and mailing addresses separately from the existing multi-object address book; every client card can open the address book and set the primary object; a cabinet is created only by an Owner/Manager action and uses a renewable/revocable per-client token; the client view adds customer-safe chronology and never renders internal cost, payroll, profit, or margin. 470/470 tests, TypeScript, 113-page production build, and diff check pass | Commit and open a stacked PR against `claude/client-card-b2b`; review/merge the dependency chain before any production deployment |
| Replace the generic dashboard wall with the approved Precision Workbench operating architecture | `codex/precision-workbench-ui` / #297 | Codex | Implemented on current `main`: the canonical `/legacy-crm` shell now uses a quieter navy navigation rail and compact bright work surface; Owner/Manager «Сегодня» is an action queue backed by existing project data, with an eight-stage operating summary, explicit next steps, exceptions, and live installation progress; phone/tablet collapse to one column above the existing safe-area mobile dock. No API, finance formula, project workflow, or customer data was changed. Review corrected role-specific missing-assignee detection so a surveyor cannot satisfy an installer requirement or vice versa. Inline script validation, diff check, scoped architecture/mobile tests, and PR CI pass; no production deployment was attempted | Re-run clean CI on the reviewed head and complete authenticated desktop/iPhone/tablet visual check; merge only if clean, then request separate owner approval before production deployment |
| Move the CRM Claude assistant from a browser-stored Anthropic key to a protected server gateway | `codex/secure-anthropic-crm-agent` / #322 | Codex | Implemented for review: Owner/Manager-only `/api/v1/ai/claude` calls Anthropic server-side, validates bounded requests and allowlisted models, removes direct browser Anthropic calls and API-key inputs, and purges any historical key from saved legacy payloads. 428/428 tests, TypeScript, production build, and diff checks pass; no secret was committed or deployed | Review and merge PR #322; then, with separate owner approval, fund the Anthropic account, store `ANTHROPIC_API_KEY` only in the protected production environment, deploy from `main`, and run one authenticated CRM assistant smoke test |
| Load verified supplier catalogs and connect stock thresholds to purchase-request drafts | `main` via PR #253 | Codex | Merged and deployed as `ce190c8`: five supplier cards and 79 officially sourced catalog positions use the existing `LegacyWorkspace.payload` vendor/catalog/inventory/purchase-request structures; Rolan PRO MAGNITRONIC SOLAR PRIME remains the canonical in-house Solar line; Owner and Manager can create purchase-request drafts from the Warehouse or a Project, while low stock creates one deduplicated draft. PR CI, main CI run #36295955477, and production deploy run #36296022085 passed | Configure the separate Resend procurement sender before using external email delivery; internal draft creation, assignment, status tracking, and receiving are available now |
| Replace the broken surveyor desktop-file bridge with one cloud measurement workspace optimized separately for phone and tablet | `codex/surveyor-phone-tablet-measurement` | Codex | Implemented locally: every surveyor entry opens the role-safe in-CRM studio; phone is full-screen/single-column, tablet is a two-column workbench, Project context remains visible, and the obsolete JSON-import action is removed from the normal workspace. 382/382 tests passed before the final removal of that obsolete action, and the final scoped diff check passes; a second local run, TypeScript, build, and visual browser check are blocked by concurrent filesystem/module-resolution stalls on this host | Commit and open the PR; let clean GitHub CI run tests, TypeScript, and build, then perform an authenticated phone/tablet visual check before merge/deploy |
| Make the complete canonical CRM convenient on phones without removing functions | `codex/mobile-ui-navigation-09261603-09261811`; original PR #248 is already merged and immutable | Codex | Corrected head `f5f9c88` is published to the original source branch: the separate reduced phone shell is removed; phone and desktop render the same role-authorized CRM, with a mobile shortcut dock and the complete sidebar available through `Ещё`; 379 tests, TypeScript, production build, inline-script validation, and diff check pass. PR #248 was merged earlier at old head `4eca9c2`, so GitHub cannot attach the correction to that closed PR | Obtain owner direction for either a new correction PR or an explicitly authorized direct `main` update; then run CI and authenticated iPhone-size review before release |
| Prevent duplicate client cards and reuse the existing client by phone or email | `codex/prevent-duplicate-clients` / #250 | Codex | Implemented, published, and verified: normalized phone/email matching reuses an existing PostgreSQL or legacy-workspace card across manual creation, Lead conversion, Project/proposal creation, contact edits, and CSV import; server writes serialize identity checks and reject newly introduced workspace duplicates; 387/387 tests, TypeScript, 109-page production build, inline-script validation, diff check, PR CI #36290656485, and Codex Bridge passed; PR is clean; no production records changed | Merge PR #250 after approval and deploy through the normal `main` workflow |
| Prevent Codex Builder 429 TPM failures while preserving phased WORK_BRANCH handoffs | `fix/agent-builder-context-budget` / #237 | ChatGPT + Codex review | Wrapper now preserves WORK_BRANCH from full comments, budgets the complete model-facing input conservatively, caps completion at 6k tokens, and keeps the existing builder logic; prior CI on the branch was green, latest head still requires CI/re-review | Run CI and Codex review on latest head; if green, merge #237, then rerun #236 and verify it reaches planning/build instead of 429 |
| Make Quick Project Entry compact, defer installer scheduling to production, and restore clear Proposal formation | `main` via PR #232 | Codex | Merged, deployed, and production-verified as `2cdca2b`: R-260925-015 now shows only service, film, sqft, and customer total in the commercial row; there is no horizontal modal overflow or visible installer/new-employee control; crew/date selection is deferred to `Монтаж` and propagates to service payroll lines; Proposal readiness correctly says `не указан метраж, не указана цена клиенту` while recognizing the selected film. No customer data was changed. 374/374 tests, TypeScript, production build, PR CI, main CI, and deploy run #36151994943 passed | Monitor normal work; enter the real sqft and customer total, then review the calculation and form the Proposal; choose the crew only after Proposal acceptance through `Монтаж` |
| Full visual architecture audit of every owner CRM section, workspace, modal, and field | `main` via PR #230 | Codex | Merged, deployed, and production-verified as `26d8ea7`: authenticated audit covered all 20 owner sections and 20 settings sections; the standard Projects kanban was the only top-level overflow. At 1920px production now renders all 7 stages inside the 1622px workspace (223px each), with `scrollWidth === clientWidth`, no main-shell overflow, and all 77 visible controls inside the viewport. Narrow screens retain the explicit readable stage scroller. 373/373 tests, TypeScript, production build, PR CI, main CI, and deploy run #36144680293 passed | Monitor normal work; report any specific nested dialog that still clips so it can be reproduced with its data-dependent state |
| Repair CRM workspace architecture, false КП blocking, and employee creation feedback | `main` via PRs #227 and #228 | Codex | Merged, deployed, and production-verified as `0dc1a42`: the live measurement workspace is 1520px with no modal overflow; R-260925-014 uses its 438.55 sqft measurement basis, ignores the stale empty quick draft, reports the calculation ready, exposes the КП action, and shows `проверить` instead of `заблокировано`; Team opens the canonical new-employee form with all four roles, exact API errors, and server role validation. No production customer or employee record was changed during verification. 369/369 tests, TypeScript, production build, PR CI, main CI, and both deployments passed | Monitor normal work; when creating a real employee, use a unique email and select the intended role |
| Fix cramped project/KP/cut-sheet workspaces and eliminate full-screen redraws after each edit | `main` via PRs #224 and #225 | Codex | Deployed and production-verified: at 1920px the quick-project modal is 1520px with no horizontal overflow; proposal readiness is independent of installer/dates while completion still requires them; edits refresh only the active modal body; all seven fullscreen kanban stages fit without horizontal scrolling; the six-piece live cut sheet renders a 2131px detail canvas without compressed segments; 365/365 tests, typecheck, build, CI, and production deploy pass | Monitor normal use; no known follow-up required |
| Allow the website developer to submit HMAC-signed leads without an employee CRM session | `fix/website-lead-hmac-public-route` / #222 | Codex | Merged and deployed as `34cf876`; production key is configured and verified without creating a test lead | Give the developer the endpoint/signing contract and transfer the key separately from the Mac Keychain item `Rolan PRO Website Lead API`; rotate it if exposure is suspected |
| Restore production deployment after Google Ads merge exceeded the 768 MB Next.js build heap | `fix/google-ads-production-build-memory` / #220 | Codex | Merged and deployed as `0556e72`; bounded build heap is now 1024 MB and production is healthy | No remaining release action; retain the bounded 1024 MB build limit unless measured deployment data justifies another change |
| Finish protected CRM → Google Ads learning integration on current main | `main` via #418 and #437; latest application release `9dd1ef3` | Codex | Receiver merged/deployed and uploads enabled; Customer Match off, `PROPOSAL_SENT` preserved. Latest 2026-10-29 audit found no attributed events to upload; Google acceptance/matching remain unverified | Use the latest live-delivery handoff above; verify a genuine eligible event and the separate WordPress MRs !45/!46, then review bidding goals separately with the owner |
| Teach Messenger the decorative static-cling and reeded film catalogs | `fix/messenger-decorative-film-catalogs` / #218 | Codex | Merged and deployed; production Worker version `cfa1403e-8e49-4098-aa14-1b3c7a256222` | Ask the live bot for a reeded or patterned privacy-film recommendation and confirm it distinguishes catalog choice from current stock |
| Teach Messenger Rolan PRO's SAF protective-film range | `fix/messenger-safety-film-line` / #216 | Codex | Merged and deployed; production Worker version `751004dd-74c3-4025-aa10-990100892613` | Ask the live bot to compare SAF 50, SAF 200, and SAF 400 for a realistic security scenario and confirm it asks about the complete glazing system |
| Teach Messenger the signed Rolan PRO architectural and Smart Film warranty terms | `fix/messenger-warranty-contracts` / #214 | Codex | Merged and deployed; production Worker version `230654c5-fc13-4e78-8ba7-1fac68e7eb70` | Ask the live bot separately about residential Solar Film and Smart Film warranty, then confirm it states the limitations rather than making an unconditional promise |
| Teach Messenger that MAGNITRONIC PRIME is Rolan PRO's own solar-film line | `fix/messenger-own-film` / #212 | Codex | Merged and deployed; production Worker version `c493091e-0546-472c-a38d-bfd2e29e5461` | Ask the live bot whose film MAGNITRONIC PRIME is and request a recommendation for one real glass/sun scenario |
| Prevent AI-only repeat-booking claims and force every new Messenger booking through CRM | `fix/messenger-repeat-booking-20260924` / #210 | Codex | Merged and deployed; production Worker version `8e9cc8cb-6f4d-45c5-8566-72fafd7622d0` | Send `запиши меня на новый замер`, answer any missing questions, click a real CRM slot, and confirm the record appears under `Новые лиды` and Calendar |
| Make Messenger a fast film consultant and remove the post-booking CRM-check dead end | `fix/messenger-human-consultant-20260924` / #208 | Codex | Merged and deployed; production Worker version `93c64342-935b-4d81-ad48-89bc8cd2ba4c` | Send one Solar-film question in the existing booked chat and confirm a fast consultation answer rather than a CRM-check status |
| Make Messenger conversations follow the customer's language beyond RU/EN/ES | `fix/messenger-multilingual-20260924` / #206 | Codex | Merged and deployed; production Worker version `dd14f10f-8ebe-4cc4-b905-81b6f4752fbe` | Send controlled messages in two non-English languages and confirm the whole booking flow stays in each language |
| Fix Messenger service recognition for Russian customer messages | `fix/messenger-russian-service-20260924` / #204 | Codex | Merged and deployed; production Worker version `bef48a14-24c6-4d84-95f9-c39e6f0e9103` | Repeat the reported Messenger phrase and finish one controlled booking; confirm the new lead and consultation in CRM |
| Show canonical Messenger leads in active `/legacy-crm` New Leads inbox | `fix/messenger-new-leads-20260924` / #201 | Codex | Merged and deployed; live inbox shows the Zafar Messenger lead | Release the latest-booking selector and confirm the card opens the 10:00 Sherman Way consultation rather than the older 08:00 test booking |
| Show canonical Messenger consultations inside the active `/legacy-crm` calendar | `fix/messenger-consultations-calendar-20260924` / #200 | Codex | Implemented and locally verified; 299 tests, TypeScript, production build, and diff check pass | Merge #200, let the normal production deployment finish, then refresh Calendar and confirm the live Zafar booking is visible at 10:00 |
| Repair live Facebook Messenger lead capture before slot loading | `fix/facebook-messenger-advisory-lock` / #194 | Codex | Merged and deployed as `de262a4`; Prisma `P2010` from deserializing the advisory lock's PostgreSQL `void` return is fixed with `$executeRaw`; 289 tests, TypeScript, local production build, main CI, deploy, health check, and signed production slots smoke test pass | Repeat the live Messenger conversation; confirm the real Lead, Consultation, CalendarEvent, Survey, and notification in CRM |
| Connect the live Facebook Messenger Cloudflare Worker to canonical CRM lead, slot, and booking endpoints | `codex/facebook-messenger-worker` / #192 | Codex | Merged; production Worker `rolanpro-bot` deployed as version `158a75f7-17f1-45b1-9e5f-431a4f091e59`; protected CRM/Worker secret configured | Send one message from an internal Facebook account, complete a real test booking, and confirm the resulting Lead, Consultation, CalendarEvent, Survey, and notification before public promotion |
| Implement issue #164: canonical multi-service Project / Solar measurement constructor | `codex/issue-164-project-constructor` / #169 | Codex | PR open; local verification green; no production deployment performed | Review #169 and its CI, merge only after approval, then run the normal migration/release workflow separately |
| Remove the duplicate field-role CRM shell and open every employee inside the real `/legacy-crm` workspace | `codex/remove-duplicate-field-shell` / `f70355f` | Codex | Merged and deployed | Refresh/sign in through the public `/legacy-crm`; perform a controlled surveyor/installer account check of assigned records and `Рабочий день` without changing live customer data |
| Remove standalone voice-input button from every CRM interface | `codex/remove-voice-button` / #112 | Codex | Merged and deployed | Refresh any already-open CRM tab once; voice will return only inside the future agent |
| Put surveyor and installer inside the single canonical CRM interface | `codex/one-crm-all-roles` / #110 | Codex | Merged and deployed | Surveyor and installer should refresh/sign in through the public CRM and use only the `/legacy-crm` role workspace |
| Remove duplicate owner/manager pricing shell and keep canonical pricing inside the main CRM | `codex/unify-service-pricing-ui` / #108 | Codex | Merged and deployed | Refresh the public CRM and use `Услуги и цены` / `Монтажники сейчас` only inside `/legacy-crm` |
| Daily installer workspace: shifts, hours, mileage, payroll history, and opt-in work tracking | `codex/installer-daily-operations` / #106 | Codex | Merged and deployed | Have each installer sign in, install/open the Rolan PRO app, and begin using `Рабочий день`; review configured installer rates before first payroll |
| Fix installed employee app opening installer 404 | `fix/installer-pwa-entry` / #103 | Codex | Merged and deployed | No remaining code action; employee should close and reopen the installed app |
| Canonical services/pricing and break-even control for owner + manager | `codex/service-pricing-control` / #101 | Codex | Merged and deployed | No remaining release action; owner should confirm planning assumptions before using targets operationally |
| Unify CRM navigation, employee entry points, and one public proposal/PDF output | `codex/unify-crm-proposal-pdf` / #24 | Codex | PR open | Review, merge after CI passes, deploy from `main`, then smoke-test Gmail delivery and the no-login client link |
| Fix employee email editing, forgot-password by email, and server-only employee login | `fix/employee-account-recovery` / #98 | ChatGPT | Merged/deployed | Verify through #99 security hotfix, then controlled production employee-access smoke test |
| Revoke old sessions after credential changes and make reset links concurrency-safe | `fix/password-reset-session-revocation` / #99 | ChatGPT | First full CI green; final docs commit pending checks | Wait for final CI/security review on latest head, merge to `main`, deploy, verify production health |
| Make employee login email editable directly in the employee card | `codex/direct-email-edit` | Codex | Merged and deployed | No remaining code action; use the Team card's `Изменить` action for future email changes |
| Allow owner to change an employee role from the normal employee card | `codex/edit-employee-role` | Codex | Merged and deployed | No remaining code action; change roles through `Команда` → employee → `Изменить` |

Contributors must add a row before starting substantial work and update or remove it at handoff.

## Latest handoff

- What changed: mail returns owners to `/owner` and managers to `/manager`; login and password-change flows now send every employee to the correct role workspace; legacy KP publishing creates or refreshes a canonical PostgreSQL proposal, produces a public `/proposal/<token>` link that does not require CRM login, and sends it through the connected corporate Gmail instead of opening `mailto`; the canonical public proposal keeps its dedicated Letter-size PDF layout and one-click PDF action. The server now removes the legacy pre-rendered PIN screen before serving `/legacy-crm`, legacy employee PINs are removed from seeded and stored workspace data, the Team view no longer manages PINs, and logout returns to the canonical email/password login.
- Why: the old KP button exposed an authenticated `/legacy-crm/#/proposal/...` address and the Email button only opened a local mail composer, so clients could receive an inaccessible link and no server-confirmed company email. Role-based login also incorrectly sent all employees into the legacy owner/manager workspace. The legacy HTML additionally contained a second PIN login that could flash or remain visible before cloud authentication completed.
- Verification: 72 automated tests passed; TypeScript passed; production build passed. A regression test runs the real legacy HTML through the server shell and confirms the pre-rendered PIN screen is absent. The earlier representative 8-line proposal PDF was visually inspected on both pages with no clipping, overlap, or split content. Actual Gmail delivery, public-link access, and cloud login behavior still require a production smoke test after deployment so no test email is sent from development.
- Branch / PR: `codex/unify-crm-proposal-pdf` / #24 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/24`).
- Blocker: the old `/legacy-crm` route must remain available until its business records are fully migrated; this change publishes legacy KP snapshots into the canonical proposal tables but does not yet migrate every legacy order or disable legacy writes.
- Next action: open the PR, let GitHub CI pass, merge and deploy from `main`; in production, send one controlled KP to an internal address, open the public link in a signed-out browser, and verify PDF download before using it with clients.

## 2026-09-01 handoff — employee account recovery / PR #98

- Root cause: the legacy Team access modal matched a server user only by the legacy card's current email. When legacy and PostgreSQL emails had diverged, the owner could see the edit field but the save flow could not reliably identify the canonical account.
- Fix: Team API now exposes `legacyUserIds`; owner-only account updates may link a legacy employee ID to the canonical PostgreSQL User, and the legacy access UI resolves by stable ID first with old email only as a fallback. The mapping is persisted after a successful update.
- Owner account control: the existing Access modal can change the employee login email and can set a new temporary password while preserving the required password-change behavior.
- Forgot-password: `/login` now exposes `Забыли пароль?`; `/forgot-password` sends a reset link through the connected corporate Gmail; `/reset-password` accepts a signed HMAC token with 30-minute TTL. The token is bound to user ID, email, and current password hash, so changing email/password invalidates it.
- Server-only access: employee Access UI now displays/copies the canonical server `/login` URL, and `/legacy-crm` explicitly returns HTML inline. Employees should never receive or store a CRM HTML file; see `docs/EMPLOYEE_ACCESS.md`.
- Security verification added: automated tests cover token signature tampering, expiry, password-change invalidation, and email-change invalidation.
- First CI attempt: all 119 existing tests passed; TypeScript failed only because the two new pages initially imported root `components/` through the `@/` alias that points to `src/`. Those imports were corrected and a new CI run was triggered.
- Branch / PR: `fix/employee-account-recovery` / #98 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/98`).
- Result after handoff: PR #98 later passed CI, merged to `main` as `59c4794ec464ce40a297c73e63032467cb5c96b3`, and production deploy succeeded. A post-merge security review then identified two P1 issues now owned by PR #99.

## 2026-09-01 handoff — password recovery security hotfix / PR #99

- Trigger: the post-merge security review of #98 found two P1 issues: existing stateless session cookies remained valid after a password reset, and concurrent submissions of the same reset link could both validate the old password hash before either write completed.
- Session fix: every newly issued session now carries a one-way fingerprint of the current password hash plus canonical email. Both API and server-rendered app session loaders compare that fingerprint/email with the live PostgreSQL User. Password or email changes therefore invalidate all older sessions automatically.
- Current-session UX: the authenticated change-password endpoint writes the new password and returns one freshly bound cookie for the new credentials; all other older cookies fail validation.
- Reset race fix: reset completion now uses PostgreSQL `updateMany` as an atomic compare-and-swap against exact user ID, email, old password hash, and active status. Only one concurrent request can update one row; every racing/later request gets an invalid/already-used result.
- Tests: regression coverage now checks credential fingerprint creation, password-change invalidation, email-change invalidation, and rejection of malformed/legacy-style session payloads. Existing reset-token signature/TTL/credential-change tests remain.
- Verification on code head `96885575b64e52b0156929bbbaec1838e0d4cca0`: GitHub CI passed tests, TypeScript, and production build. Documentation commits recording this handoff and durable decision were added afterward, so final CI must be green again on the latest head before merge.
- Durable decision: `DECISIONS.md` now records credential-bound sessions and atomic one-time password recovery as the canonical authentication policy.
- Branch / PR: `fix/password-reset-session-revocation` / #99 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/99`).
- Blocker: none in code; release is gated only by final GitHub CI/security review on the latest head.
- Next action: wait for final checks, merge #99 to `main`, let the standard production workflow deploy it, and verify production is serving the merge SHA. Controlled real-email/reset smoke should be done only with an intentionally selected internal/test employee account so no real employee password is changed unexpectedly.

## 2026-09-01 handoff — direct employee email editing

- Root cause: the employee card still rendered the login email as a disabled reference field and delegated changes to a separate Access dialog. The cloud access patch that was intended to support the dialog also contained an invalid nested quote in generated JavaScript, so that patch stopped executing in production.
- Fix: for an owner, the normal Team card editor now contains an enabled email field. Saving resolves the canonical PostgreSQL user by stable `legacyUserIds` first, updates the server login email, and keeps the owner signed in when the owner changes their own email. The malformed inline access-button handler was replaced with a separate valid function.
- Verification: 131 automated tests passed, TypeScript passed, and the production build passed. GitHub CI and the production deploy both succeeded for `e734ea3743ded8afbc2b85cce305514f2c6eb2c9`. A fresh production browser load had no script errors; the Team editor displayed `Почта для входа` as an enabled, non-read-only `email` field for both owner and manager cards. No real employee email was changed during smoke testing.
- Branch / release: `codex/direct-email-edit`; merged by reviewed fast-forward to `main`; production served release `e734ea3743ded8afbc2b85cce305514f2c6eb2c9` before this documentation-only handoff commit.
- Next action: none. When changing an address, open `Команда` → the employee's `Изменить` button, enter the new email, and press `Сохранить`; the new address immediately becomes that employee's login.

## 2026-09-01 handoff — employee role editing from the Team card

- Root cause: the normal employee editor rendered `Роль` as a permanently disabled reference field. The separate access dialog only changed email and password, so the owner had no working UI for changing the canonical server role.
- Fix: an owner editing another employee now gets one role selector in the normal card: Manager, Surveyor, Installer, or Owner. Saving maps that selection to the canonical server role, updates PostgreSQL through the owner-only Team API, and then updates the legacy card. The owner cannot change their own role in this card, preventing accidental self-lockout; promotion to Owner requires an explicit warning confirmation.
- Data safety: the editor hydrates the canonical server email and role before saving. A role-only change therefore does not overwrite a newer server email with stale legacy data. If a server account has multiple roles, the primary legacy view follows the existing access priority: Owner, Manager, Surveyor, Installer.
- Local verification: the legacy inline script compiled; all 133 automated tests passed; TypeScript passed; the production build passed. No real employee account was modified.
- Branch: `codex/edit-employee-role`.
- Production verification: GitHub CI and the production deploy succeeded for `0b6e0883bb0f1713f7dac3858c007a8b4e942474`. On a fresh public CRM load, Danilla's normal employee card showed an enabled `SELECT` with Manager, Surveyor, Installer, and Owner; the current owner's role remained a disabled field. The public page reported no script errors, and the dialog was closed with `Отмена`, so no real account was changed.
- Release: `0b6e0883bb0f1713f7dac3858c007a8b4e942474` from `main`.
- Next action: none. Change a role through `Команда` → employee → `Изменить` → `Роль` → `Сохранить`.

## 2026-09-01 handoff — canonical service pricing and break-even control

- Added focused owner and manager pages for one PostgreSQL-backed service price list. Both roles can add services and add-ons and maintain customer-facing prices used by calculator/proposal flows.
- Owner-only fields include material cost, installer pay rate, block/add-on cost, company overhead, target profit, and margin assumptions. Manager server responses zero internal-cost fields and expose only actionable sales targets.
- Added persistent business-planning assumptions and a monthly signal that converts overhead, contribution margin, average check, and conversion into required revenue, deals, and leads. The owner dashboard now raises an action when the break-even plan is behind.
- Added direct `Услуги и цены` entry points to owner navigation, manager navigation, and the active legacy CRM menu/settings hub.
- Security review: a P1 finding showed that manager PATCH responses could return internal cost fields even though the screen hid them. All GET and PATCH responses now use the same server-side redaction, with dedicated regression tests.
- Local verification: 137 tests passed, TypeScript passed, production build passed, and `git diff --check` passed. Migration status could not be queried locally because this worktree intentionally has no `DATABASE_URL`; the standard production deploy runs `prisma migrate deploy`.
- Branch / PR: `codex/service-pricing-control` / #101 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/101`).
- Release: PR #101 passed CI and security review, then merged to `main` as `fb1c3d69815a53b47ce4cf5262b5ecd0cb993dcc`. Production deploy run #33589241883 completed successfully, including `prisma migrate deploy`.
- Production verification: `/owner/settings/pricing` loaded the live canonical service list, owner-only cost fields, margin figures, and break-even/target cards with no browser errors. `/manager/crm/pricing` also loaded successfully with 24 service/add-on cards and no browser errors. No live price, service, or planning value was changed during smoke testing.
- Next action: owner should review and save the real average deal, lead-to-deal conversion, monthly target profit, and company overhead. After that the dashboard signal becomes the operating monthly target for leads and closed deals.

## 2026-09-01 handoff — installed employee app installer 404

- Root cause: the shared post-login destination mapped the Installer role to `/installer`, while the real employee workspace lives at `/installer/jobs`. The installed PWA therefore opened a valid authenticated session on a nonexistent page and showed the reported 404.
- Fix: Installer login and first-password-change now route to `/installer/jobs`; `/installer` remains as a compatibility redirect so already installed apps, bookmarks, and cached entry links recover automatically after deployment.
- Related access fix: `/api/v1/settings/pricing` now has the same Owner + Manager middleware permission as its route handler, while all other settings APIs remain Owner-only.
- Verification: 138 tests passed, TypeScript passed, production build passed, the build now contains both `/installer` and `/installer/jobs`, and `git diff --check` passed.
- Branch / PR: `fix/installer-pwa-entry` / #103 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/103`).
- Release: PR #103 passed CI and merged to `main` as `03e5c7b345f31d999ff9214d640f042e7856cda3`; production deploy run #33590299756 completed successfully.
- Production verification: unauthenticated requests to both `/installer` and `/installer/jobs` return the same authorization redirect and neither returns 404. The authenticated role destination and compatibility redirect are covered by the passing tests/build. No employee password or live account was used or changed.
- Next action: the affected employee should fully close the installed Rolan PRO app and open it again. If Chrome still shows the old page, refresh once; reinstalling should not be necessary.

## 2026-09-02 handoff — installer daily operations

- Added one mobile-first installer workday inside the canonical CRM at `/installer/today`. Installer login and the installed PWA now open this workspace first; existing job cards remain at `/installer/jobs`.
- A worker can start a shift, bind it to an assigned installation, record starting/ending odometer or manual mileage, add an end-of-shift note, and review the last 30 shifts with hours and miles.
- When an installer completes a job, PostgreSQL creates one immutable payroll accrual snapshot from actual sqft, the saved installer rate, and the saved complexity multiplier. The installer sees only their own owed/paid history; client selling price and company margin are not returned.
- Work location is opt-in at shift start and is accepted only for the authenticated installer's active, tracking-enabled shift. The manager/owner view at `/manager/installers` shows current shift, object, elapsed time, and last location with a Google Maps link. The legacy CRM navigation includes `Монтажники сейчас` so this is reachable from the current operating workspace.
- Data protection: a partial unique database index prevents two simultaneous active shifts for one installer; location writes validate coordinates and are rejected when tracking is inactive; all employee writes are scoped server-side to the authenticated Installer role.
- Local verification: 140 tests passed, TypeScript passed, production build passed with `/installer/today`, `/manager/installers`, and both work-session APIs, and `git diff --check` passed.
- Branch / PR: `codex/installer-daily-operations` / #106 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/106`).
- Release: PR #106 passed GitHub CI and merged to `main` as `d9696a08fd84e2238328dc129a8de49ad02b80ad`. Production deploy run #33602991272 succeeded, including the database migration.
- Production smoke: `/installer`, `/installer/today`, and `/manager/installers` all returned the expected authenticated redirect rather than 404; the work-session API returned 401 without a session. No real employee shift, mileage, payroll, or location record was created.
- Next action: verify the real installer rates in `Услуги и цены`, then have each installer sign in at the public CRM, open `Рабочий день`, allow location only if desired, and start the first real shift.

## 2026-09-02 handoff — one owner/manager CRM interface

- Root cause: the canonical PostgreSQL pricing editor and installer tracking screen were opened in the separate modern owner/manager shell. The data source was correct, but the second sidebar and visual language made it look like a different CRM.
- Fix: `Услуги и цены` now renders directly inside the active `/legacy-crm` shell with compact expandable service/add-on cards, owner-only costs and installer rates, manager-safe selling prices, add-service/add-on actions, and the existing break-even plan. `Монтажники сейчас` also renders inside the same shell through a protected Owner/Manager API.
- Compatibility: `/owner/settings/pricing` and `/manager/crm/pricing` redirect to `/legacy-crm#/service-pricing`; `/manager/installers` redirects to `/legacy-crm#/installer-operations`. Existing bookmarks therefore stop showing the duplicate shell without breaking.
- Data safety: no service, rate, planning, payroll, shift, or location data was deleted. All writes continue through the same authenticated PostgreSQL APIs, including server-side manager cost redaction.
- Local verification: 142 tests passed, TypeScript passed, the legacy inline script compiled, production build passed with the new team API and compatibility redirects, and `git diff --check` passed.
- Branch / PR: `codex/unify-service-pricing-ui` / #108 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/108`).
- Release: PR #108 passed GitHub CI, merged to `main` as `133a1c13fcc0231c3cd87ebd5f05bd3546de0fe8`, and production deploy run #33604923832 succeeded.
- Production safety: the release was deployed without modifying any live price, installer rate, shift, payroll, or location record. An authenticated visual smoke still requires the owner to refresh their existing session; unauthenticated route protection remains in place.
- Next action: close the local `file:///tmp/...` tab, open the public `/legacy-crm`, refresh once, and verify that `Услуги и цены` stays under the same main sidebar.

## 2026-09-02 handoff — one CRM for surveyor and installer

- Root cause: the owner and manager had been consolidated under `/legacy-crm`, but surveyors still opened `/survey` and installers opened `/installer/today`. Those routes used a second white product shell, so the public system still looked like two different CRMs.
- Fix: surveyor login now opens `/legacy-crm/survey`; installer login and the installed PWA open `/legacy-crm/installer`. Consultation details, installer jobs, job details, and field-role notifications all stay under the same `/legacy-crm` namespace.
- Compatibility: every old `/survey...`, `/installer`, `/installer/today`, and `/installer/jobs...` address preserves its suffix and query string and returns a permanent redirect to the canonical CRM route.
- Visual continuity: field workspaces now use the real Rolan PRO logo, dark primary navigation, one `Rolan PRO CRM` identity, and compact rectangular work cards instead of presenting a separate white product shell.
- Data safety: field roles still use their existing PostgreSQL services and server-side assignment filters. They do not receive the owner/manager `LegacyWorkspace.payload`, selling prices, company costs, margins, or unrelated customer records.
- Verification: 146 automated tests passed; TypeScript passed; the production build passed and includes all seven canonical role routes. Local route smoke confirmed old URLs return 308 to the matching `/legacy-crm` URL, while canonical role URLs remain authentication-protected. `git diff --check` passed.
- Branch / PR: `codex/one-crm-all-roles` / #110 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/110`).
- Release: PR #110 passed CI and security review, merged to `main` as `554bb2636332c86825bc38a640805bfc7988bd17`, and production deploy run #33637568763 succeeded.
- Production smoke: old survey and installer URLs returned 308 to the exact canonical `/legacy-crm` route, including consultation/job IDs; canonical field and owner routes remained authentication-protected. No live customer, measurement, shift, mileage, payroll, price, or employee record was changed.
- Next action: sign in once as the real surveyor and installer, refresh or fully close/reopen the installed app, and visually verify their assigned data without changing any live records.

## 2026-09-02 handoff — remove standalone voice input

- Removed the floating `Голосовой ввод` button from the active legacy CRM and from the shared Next.js layout used by employee role pages.
- Removed the unused browser speech-recognition handlers, focus listeners, state, and button styles so the feature cannot reappear on another screen through shared code.
- Kept Google Voice calling/SMS configuration and the Smart-film `Voice Control` catalog capability unchanged; they are unrelated to the removed dictation button.
- Added a regression check that the standalone control and its handler are absent from both CRM shells.
- Verification: 146 automated tests passed, TypeScript passed, production build passed, and `git diff --check` passed.
- Branch / PR: `codex/remove-voice-button` / #112 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/112`).
- Release: PR #112 passed CI and security review, merged to `main` as `3dced4563ff24ad1b45b72ba5d0f2077aa5648c0`, and production deploy run #33641166229 succeeded.
- Production safety: the release changed interface code only. It did not modify customer data, orders, calls, Google Voice configuration, employees, shifts, payroll, prices, or Smart-film services.
- Next action: refresh any already-open CRM tab once. Voice interaction remains deferred until it is designed as part of the unified CRM agent.

## 2026-09-02 handoff — remove the duplicate field-role CRM shell

- Root cause: PR #110 changed the employee URL and colors but kept separate React page trees and a separate `ProductShell`. A route named `/legacy-crm/survey/...` therefore still displayed a different CRM, exactly as reported.
- Fix: the duplicate surveyor and installer page trees and their role shells are removed. Login, notifications, installed-app entry, and every old surveyor/installer URL now resolve to the one real `/legacy-crm` document used by the company.
- Field access: the real legacy workspace now accepts Surveyor and Installer sessions, but its API builds a server-side field view containing only explicitly assigned orders, linked clients, assigned tasks, safe coworkers, and operational reference data. It removes selling prices, payments, costs, margins, company finance, unrelated customers, and other employees' compensation before sending the response.
- Safe writes: field updates merge only operational order facts and assigned-task status into the current full workspace. Existing financial values embedded in measurements and financial timeline events are preserved on the server even though the employee never receives them. Assignment IDs, customer price, payment data, and unauthorized stage transitions cannot be overwritten by a field request.
- Installer continuity: PostgreSQL shift, hours, mileage, opt-in work location, and personal payroll history were not deleted. They now render as `Рабочий день` in the installer menu inside the actual legacy CRM.
- Verification: 150 automated tests passed; TypeScript passed; production build passed and no longer contains `/survey`, `/installer`, `/legacy-crm/survey`, or `/legacy-crm/installer` page bundles. Local route smoke confirmed the reported `/legacy-crm/survey/notifications` and old `/installer/today` addresses return 308 to `/legacy-crm`. No production record, employee account, password, shift, location, payroll, client, or order was changed.
- Release: branch `codex/remove-duplicate-field-shell` was reviewed and fast-forwarded to `main` as `f70355f99c76d32d4ee563a1ecb57b721f62cfe3`. GitHub CI run #33697488074 passed and production deploy run #33697612449 succeeded.
- Production smoke: the exact reported address `/legacy-crm/survey/notifications` and old `/installer/today` both return 308 to `/legacy-crm`; the public build exposes only the actual `/legacy-crm` page and no longer builds the deleted field shells. An unauthenticated request remains protected. No live employee session was used to change records.
- Next action: refresh/sign in through the public `/legacy-crm`, then perform one controlled visual check with mapped surveyor and installer accounts to confirm assigned records and `Рабочий день` without changing live customer data.

## 2026-09-12 handoff — canonical Project / Solar measurement constructor

- Scope: PR #169 completes issue #164 and supersedes the smaller foundation PR #161. One canonical Project now carries independent B2B/B2C customer classification, Residential/Commercial site type, multiple service positions, and service-level default films.
- Solar V1: the existing `/legacy-crm` shell now contains one compact Projects section for owner, manager, and assigned surveyor. It supports room templates, openings, French Window/French Door overall dimensions and cells, glass construction/strength/Low-E details, removal per cell, and film inheritance from service through room/opening/cell.
- Data integrity: PostgreSQL records source/status as `CUSTOMER`/`UNVERIFIED` or `SURVEYOR_VERIFIED`/`VERIFIED`; revisions preserve the prior measurement and a verified measurement cannot be replaced by customer data. Project, position, film category, source, revision, duplicate-cell, and role access checks are enforced on the server.
- Film selection: compatibility is evaluated from the existing `FilmCatalog.allowed_glass_types`, `restricted_orientations`, `requires_review`, and selection note fields. The catalog also receives explicit technology, appearance, application-side, and capability taxonomy. Safety A2 is corrected to 14 mil.
- Storage and permissions: the new section reads and writes canonical PostgreSQL APIs only; it does not create a second shell, second editor, or browser-storage source of truth. Assigned surveyors receive the operational constructor without project finance and can submit only verified measurements.
- Verification: Prisma schema validation and client generation passed; 210 automated tests passed; TypeScript passed; the real legacy inline script compiled in regression coverage; production build passed; `git diff --check` passed. The worktree has no live `DATABASE_URL`, so no migration was applied to any database.
- Branch / PR: `codex/issue-164-project-constructor` / #169 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/169`).
- Release: not deployed. Review #169 and GitHub CI first; merge and deploy only through the normal release workflow, then verify the migration and role-scoped Project screens in a controlled production smoke test.

### 2026-09-12 correction — structured film selection

- User review found that New Order still showed one combined value such as `RolanPRO — Smart Vision Prime`. PR #169 now replaces that control with three cascading fields: film category, product name, and model.
- Example identity is preserved exactly as `Зеркальная → Prime → NE2`; the service direction remains separate. The selected final model still resolves to one existing catalog ID.
- Existing catalog entries are migrated in place without changing IDs. Orders save category/name/model snapshots in addition to the catalog ID so later catalog edits do not erase what was sold.
- The same structure is available in order parameters and catalog management. Missing legacy model codes are displayed as `Модель не указана` instead of inventing a value.
- Final UI correction: the same cascading fields now apply to the Solar service default and every room, opening, and cell override. The New Order form no longer contains the explanatory sidebar, workflow pills, long introductory copy, or redundant field guidance; only actionable validation messages remain.
- New Order correction: site type is now a required independent choice (`RESIDENTIAL` or `COMMERCIAL`). The legacy measurement workspaces use it to show the matching residential-room or commercial-area presets, and the selected value is carried through the canonical proposal into the launched PostgreSQL Project.
- Multi-service film correction: New Order renders one film card for every selected service. Smart, Solar, Safety, and Decorative cards are filtered to their own existing catalog category and each independently selects `Серия / категория → Название → Модель`; the order persists the exact catalog ID and snapshots in `materialsByService`, while the primary-service fields remain for backward compatibility. The selected service film becomes the default for that service's measurement rooms.
- Lead attribution correction: New Order now captures one incoming service rather than treating every project service as a marketing origin. Managers add or remove cross-sold services inside the same project without changing `leadIntentServiceType`. The current-month report groups leads by frozen source + incoming service and reports cross-sell separately. Canonical launched Projects preserve the source and incoming ServiceType through a new relational migration.
- Verification: 219 automated tests pass, including the real legacy script compilation, immutable lead-intent guards, monthly service attribution, cross-sell separation, proposal propagation, and canonical Project persistence. GitHub CI generated the Prisma client, passed TypeScript, and completed the production build on commit `ab31ca7`. The local Prisma CLI did not complete on this host, but the same required Prisma generation passed in the clean CI environment.

### 2026-09-14 correction — strict Residential / Commercial measurement structure

- Project creation now presents the property choice explicitly as `Residential · жилой · комнаты дома` or `Commercial · коммерческий · офисы и зоны`; it remains independent from B2B/B2C.
- Both legacy and canonical measurement workspaces use site-specific terminology and presets. Residential receives home rooms only; Commercial receives offices and commercial zones only.
- Backend validation rejects a room template that belongs to the other site type. After a typed Project has measurements, its site type is locked so existing rooms cannot be reclassified into offices, or offices into home rooms.
- Release: PR #169 merged to `main` as `21d304a4af149172f9d5faea4325ceb248c0bd79`. Main CI run #34933721970 passed Prisma generation, 220 tests, TypeScript, and the production build. Production deploy run #34933844649 succeeded and confirmed that the server is serving the same commit.
- Production smoke: the public login responds successfully and `/legacy-crm` remains session-protected. No customer, order, measurement, film, or employee record was edited during smoke verification.

### 2026-09-15 correction — add service from the Project

- The canonical Project no longer keeps a permanent service dropdown on the page. Owner and manager use one `+ Добавить услугу` button, then choose from a compact list containing only services not already present in that Project.
- The selected service is still added as an existing `ProjectPosition` through the canonical PostgreSQL API. The incoming lead service remains unchanged, and no second order or Project is created.

### 2026-09-15 correction — confirmed Smart catalog and controls

- Smart-film selection now uses confirmed Rolan PRO lines: MS (Mitsubishi) with Vision 85/89/95, AR (Arshi · China) with Vision A-85/B-88/C-92, and decorative variable-pattern models DEC-SMART 1/2/3. Generic placeholder PDLC models are archived from new selection while historical references remain readable.
- Films, power supplies, and control options are separate records. The six confirmed power supplies are Rolan Control 50W, 100W, 200W, 300W, 500W, and 1000W. Wi-Fi, multi-zone, voice, Google Home, Amazon Alexa, Apple Home, and wall switches are selectable control options.
- The owner stated that eight power-supply variants and three manufacturers exist, but only six supply models and two named manufacturer lines plus the decorative line were identified. The two missing supply models and any separate third manufacturer remain intentionally unseeded until their exact names are confirmed.
- This correction extends PR #172. Prices and unprovided technical specifications remain empty/zero rather than being invented. Production deployment remains a separate release action.
- Verification on commit `1b8c07a`: all 226 tests passed locally; GitHub CI run #35043142443 generated Prisma, passed tests and TypeScript, and completed the production build. No production deployment was started.

### 2026-09-15 correction — commercial office glass partitions

- Commercial measurement spaces now offer `Офисная стеклянная перегородка` as a separate opening category alongside windows, doors, storefronts, and skylights. It persists as `glass_partition` with its own dimensions, panes/cells, glass characteristics, removal flags, and film inheritance.
- The manager measurement workspace shows the new add-element category only when the order site type is `COMMERCIAL`. Canonical backend validation rejects `glass_partition` for a `RESIDENTIAL` Project.
- This correction extends PR #172. Existing measurements and Residential choices remain unchanged; production deployment remains separate.

### 2026-09-15 correction — per-window film removal and proposal readiness

- Every measured window/door/partition card now has a distinct `Удаление плёнки` toggle separate from the destructive `Удалить окно` action. Selected windows contribute their measured sqft to one automatically maintained removal service line using the existing configured removal rate; changing dimensions or quantity recalculates that line.
- The selected room/office card now exposes its service-scoped film selector directly and shows the chosen brand/model in the room list. A room-level `Удаление плёнки со всех окон` checkbox applies the same existing opening flag to every opening of the active service; per-window checkboxes remain available for exceptions.
- The canonical opening editor also has one action to select removal for every cell in the opening while retaining per-cell control.
- Fixed the false `есть окна без размера` proposal blocker: `measureAllWindows()` returns `{ room, win }`, and readiness now validates `win` rather than the wrapper. Positive planned dimensions are also used when stale legacy actual dimensions are zero.
- Verification after the room-control correction: all 244 automated tests passed, TypeScript passed, and the production build completed locally.
- This correction extends PR #172. Existing measurements migrate without deletion, and production deployment remains separate.

### 2026-09-15 correction — measurement screen position is stable during editing

- Measurement actions that rebuild the modal now capture the active scroll containers before changing modal state and restore them synchronously and again on the next animation frame after layout settles.
- Browser scroll anchoring is disabled only inside the manager measurement modal because that workspace uses explicit keyed scroll restoration. Selecting film, toggling removal, changing dimensions, adding an opening, or switching an opening type must no longer jump the screen to the top.
- Verification: the local preview remained on the second window after its removal checkbox rebuilt the modal; all 245 automated tests, TypeScript, and the production build passed locally.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-15 correction — project calculation is usable on phones

- The Project calculation modal now converts material, additional-service, and direct-expense tables into labeled stacked rows below 840px instead of retaining a 720px minimum width.
- Inputs and selects use the full available row width, destructive actions have explicit full labels, section actions become full-width touch targets, and the sticky approval footer stacks its actions without horizontal clipping.
- The responsive breakpoint is aligned with the modal shell at 840px, preventing a mobile modal from containing the desktop table. Visual verification at a 390×844 phone viewport showed labeled material rows and both footer actions fully inside the screen.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-15 correction — preliminary customer dimensions versus verified field dimensions

- A manager may create and price a Project from dimensions supplied by the customer. Those windows are stored as `CUSTOMER / UNVERIFIED`, remain clearly marked as preliminary, and do not block calculation or proposal generation.
- Every measured window has an explicit action to confirm exact dimensions. Editing width, height, or quantity after confirmation returns that window to preliminary status; a field-measurement v2.5 import is recorded as `SURVEYOR_VERIFIED / VERIFIED` with provenance.
- Installation scheduling and every later production status are blocked until all active windows have positive, verified exact dimensions. Existing Projects already in installation or completed stages are migrated as verified so historical workflows are not broken.
- This correction extends PR #172. It stays inside the existing Project measurement history and does not authorize an automatic production deployment.

### 2026-09-15 correction — manager calculation is customer pricing, not company accounting

- The manager calculates the Project before creating the proposal: measured sqft, selected material, sale price per sqft, billable add-ons, and the customer total remain available.
- Purchase/material cost, installer and team cost, marketing, direct company expenses, production cost, profit, and margin are owner-only. The manager Project workspace and payment card do not render those fields, and the old expanded form is owner-only.
- Project material cost now follows the cut plan and consumes the proportional purchase cost of fitting warehouse lots (narrowest fitting width, oldest receipt first). Catalog cost is used only for an unpriced lot or shortage. Rates continue to come from the reference settings, and the Project calculator no longer asks for manual marketing spend.
- The default weekly Calendar is now a dispatcher workspace modeled on TintWiz's operational pattern: hourly week grid on the left and the same filtered visits on the map on the right. Events show time, work type, responsible employee, customer and address; overlapping visits receive separate lanes; map pins retain event identity and time; employee and work-type filters update both views together. It continues to use the existing Project/order events and geocache rather than introducing a second calendar store.
- Hidden internal expenses do not block proposal readiness. They remain attached to the same Project for owner accounting instead of becoming manager inputs or another entity.
- This correction extends PR #172 and does not authorize an automatic production deployment.

### 2026-09-16 correction — owner Project profitability from one operational record

- The existing Project calculation now provides one compact operational summary: selected services and films, measured glass sqft, calculated film consumption, billable add-ons, assigned installers, warehouse material cost, and crew pay. It does not introduce another calculator, Project, or storage record.
- Installer labor now comes from each assigned employee's pay configuration and service-category rates. Until a crew is assigned, the estimate keeps a labor reserve from the owner-managed category defaults instead of treating labor as zero. Payroll reuses the same per-employee calculation.
- Owner-only direct Project expenses include delivery, one-off material purchases, helpers/subcontractors, hired specialists, tools/equipment, and the existing categories. These remain separate from recurring company OpEx.
- The management profit view calculates customer revenue minus direct Project cost, then allocates the active fixed monthly OpEx equally across all revenue-bearing Projects in that Project's operating month. A configurable California corporation tax reserve is allocated by revenue share and shown separately from actual tax payments.
- The default planning profile is California C corporation at 8.84% with the $800 annual minimum reserve. Owner may switch to the California S corporation planning rate of 1.5% or a custom rate. This is explicitly a management estimate; tax filings and paid cash remain in accounting.
- Verification: all 251 automated tests passed, TypeScript passed, and the production build completed locally. At a 390×844 viewport the Project calculation had no horizontal overflow; the fast summary, financial cards, tax settings, and approval footer remained within the phone screen.
- This correction extends PR #172. Production deployment remains a separate action.

### 2026-09-16 release correction — fast Project intake and company break-even settings

- The primary new-Project action now creates the same lifecycle record and immediately opens the existing room/office measurement workspace. `Сохранить черновик` remains available when dimensions are not ready; no second order, estimate, or storage record is created.
- Owner Settings now has one focused `Постоянные расходы и безубыточность` section backed by the existing `db.opex` plan data. It accepts recurring company obligations, shows monthly/daily fixed burn, and calculates required Projects and sqft per month.
- Break-even now excludes personal plans, variable expenses, and tax plans. It uses completed Projects when available and otherwise labels the result as preliminary from calculated Projects, so the owner can begin planning before the first completed month.
- Existing role boundaries were rechecked: owner retains company P&L and settings; manager can create, measure, price, and prepare the customer proposal without internal cost/profit; surveyor and installer remain limited to assigned work and never receive company financial totals.
- Verification: all 253 automated tests passed, TypeScript passed, and the production build completed locally. Branch / PR: `codex/project-add-service-button` / #172. The owner explicitly requested the production CRM update; next action is CI, merge to `main`, automatic production deploy, and a read-only smoke check.

### 2026-09-16 correction — quick Project line items do not require dimensions

- The prior primary action that opened measurements immediately was incorrect. New Project now opens the existing Project calculation with a seeded line for the selected incoming service; the manager can quote before any room, office, opening, or dimension exists.
- A quick line records service direction, the service-scoped existing catalog item, quantity, unit, sale price per unit, derived customer total, and owner-only catalog cost per unit. `+ Добавить услугу` adds Solar, Smart, Safety, or Decorative lines to the same Project; it does not create another order, calculator, catalog, or storage root.
- Film choices remain restricted to the selected service category and display the existing Category → Name → Model catalog identity. The same quick lines are published as individual Proposal items. Exact measurements remain mandatory only for production documents and installation release.
- No Prisma schema change is required for this correction: it changes the active legacy Project compatibility payload and Proposal projection while preserving existing relational `ProjectPosition` work from issue #164. A separate database entity or parallel migration would violate the one-Project decision.
- Verification: all 254 automated tests passed, TypeScript passed after the production build generated Next.js types, and the production build completed locally. Branch / PR: `codex/quick-project-line-items` / #173. Production deployment remains separate.

### 2026-09-16 correction — salaries, manager commission, and advertising reserve

- Owner Settings → `Постоянные расходы и безубыточность` now has one explicit compensation/cost model: owner salary $3,000/month, surveyor salary $4,000/month, assigned-manager commission 5% of Project gross revenue, and advertising reserve 10% of Project gross revenue.
- Salaries are fixed monthly company obligations and enter the monthly break-even pool. Manager commission and advertising are variable Project PSS costs; they are calculated automatically from `orderRevenue()` and are not requested from the manager on every Project.
- The previous seeded daily advertising plan is deactivated by an idempotent compatibility migration so the 10% reserve is not counted again as fixed OpEx. Surveyor percentage is set to zero because the approved compensation model is monthly salary.
- Employee pay cards now show and calculate salary per month rather than per week. The Settings model keeps the manager and active surveyor/owner pay configurations synchronized with the same percentages and salaries.
- Implemented as an extension of PR #173. Production deployment remains separate.

### 2026-09-16 correction — quick Project cost comes from Warehouse and Payroll references

- The fast Project service row now contains only manager-owned commercial inputs: service, an in-stock film, quantity/unit, and customer sale price. Manual material cost and manual installation price were removed from that row for every role.
- Film choices are restricted to the selected service category and to catalog items with a positive Warehouse roll balance. The selector shows current metres and approximate sqft; an old selected item remains readable after its stock reaches zero but cannot pass Proposal readiness.
- Preliminary material cost without dimensions is calculated from the remaining value and area of priced Warehouse purchase lots, including the catalog waste percentage. A Project cannot be approved when the selected quantity is not covered by stock with a recorded purchase price.
- Preliminary installer cost without dimensions is calculated from the assigned employee's Payroll category rate. Until installers are assigned, the existing owner-managed category defaults remain the reserve. Quick lines no longer contribute a second embedded service cost.
- Existing quick-line `unitCost` and `cost` compatibility fields are removed during the idempotent legacy-state migration. No second catalog, warehouse, payroll table, Project, or storage root was introduced.
- Verification: all 258 automated tests passed, standalone TypeScript passed, and a clean production build completed after regenerating the Prisma client.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains separate.

### 2026-09-16 correction — separate Quick Project Entry and reference-owned service costs

- The prior embedded quick-entry table inside `Расчёт проекта перед КП` was incorrect. `Быстрый ввод проекта` is now a separate compact window opened from the Project card and immediately after choosing the calculation path while creating a Project.
- The separate window writes service, in-stock film, sqft, and sale price into the same Project compatibility record. `Расчёт проекта` remains the approval and profitability workspace; no second Project, calculator entity, shell, or storage root was introduced.
- The visible `Услуги` reference and the Project service rows now contain customer pricing only. Material cost comes from priced Warehouse lots; film/installation and additional-work pay come from employee Payroll rates. Direct one-off purchases remain Project expenses.
- Employee Payroll cards now support per-unit rates for washing, removal, silicone, electrical work, connection, warranty, and custom work. Those rates are included automatically in Project installer cost.
- Verification: all 261 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains a separate action.

### 2026-09-16 correction — service-owned installer rate

- The owner clarified that each film service must include `Монтажнику / sqft` directly in the `Услуги` reference. This supersedes the immediately preceding rule that Services contain customer prices only.
- Film material cost still comes only from priced Warehouse lots. The service installation rate is the default payroll accrual for both measured openings and quick Project sqft; employee Payroll rates remain optional individual overrides.
- Built-in employee category rates are cleared by an idempotent migration so they do not silently mask the service rate. Genuine non-default employee overrides remain unchanged.
- The same canonical `installation_cost_per_sqft` field already used by relational Projects is restored in the `/legacy-crm` Services UI and synchronized into the compatibility Project calculator. No new entity or storage root is added.
- Verification: all 261 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- This correction extends branch `codex/quick-project-line-items` and PR #173. Production deployment remains separate.

### 2026-09-16 correction — quick import by Project total

- `Быстрый ввод проекта` now matches the minimum data available from the former CRM: service direction, in-stock film, total sqft, customer-facing Project total, and Project installers.
- For every service row, sale price per sqft is derived automatically from total divided by sqft. Existing rows that were originally entered by price per sqft remain readable and retain their previous calculation until the total is edited.
- Every service row now has required start and end dates. Invalid reversed ranges are rejected; the service period is preserved in Proposal data, and the latest quick-service end date supplies the profitability month when no actual installation date exists.
- Installer assignment is available inside the same compact window. The Project calculator continues to derive film COGS from Warehouse lots and installer accrual from the service/employee reference; neither cost is entered manually during import.
- Multi-service rows continue through the existing Project revenue, Proposal, payroll, PSS, fixed-expense allocation, and management-profit formulas. No new database entity, storage root, or alternate calculation pipeline was added.
- Verification: all 264 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`. Production deployment remains separate until explicitly authorized.

### 2026-09-17 correction — per-service executors, film and supplies in Quick Project Entry

- Quick Project Entry now assigns installers on each service row instead of once for the whole Project. The Project card keeps the union only for compatibility and permissions; payroll uses the actual row assignments and splits one row only among its selected installers.
- The owner can add a new installer without leaving the row. The server account is created with its linked compatibility-card ID, the local employee card appears immediately, and it is selected for that service after the one-time password step.
- Each service row can select Warehouse supplies, set used quantities, or create a new supply with current stock and purchase cost. Supply purchase cost is included in PSS and profit without prematurely issuing inventory.
- A new film can be created in the same row using `brand → film category → product name → model`, plus the roll's width, length, lot, retail price, and actual purchase cost. The action writes the existing FilmCatalog and Warehouse receipt structures and immediately selects the new film.
- New Project quick rows and migrated old rows receive independent `installerIds` and `supplyItems`; no second Project, catalog, Warehouse, employee directory, shell, or storage path was introduced.
- Verification: all 268 automated tests passed, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`, PR #174. Production deployment remains separate until explicitly authorized.

### 2026-09-17 correction — one-step closure for completed former-CRM projects

- The owner can now finish a historical import inside `Быстрый ввод проекта` with `Закрыть как выполненный и оплаченный`; no window dimensions or parallel import entity are required. Direct delivery, purchase, helper, subcontractor, tools, rental, permit, and other expenses can be recorded in the same window before closing.
- The action uses service start/end dates and a selected payment date/method, records full payment and completion milestones, approves the Project estimate, and preserves the existing payroll, PSS, monthly fixed-cost, California-tax, and net-profit calculations.
- The close action requires valid service data, assigned installers, film purchase cost, and valid dates. Because the material was consumed before import, it neither checks today's stock quantity nor deducts today's Warehouse; normal active-Project approval remains strict about available priced stock.
- No automatic customer notification is sent for the historical event. The Project carries explicit import flags and audit-timeline notes.
- Verification: all 275 automated tests passed after merging the latest `main`, standalone TypeScript passed, and the production build completed locally.
- Branch: `codex/quick-project-total-and-installers`, PR #174. Production deployment remains separate until explicitly authorized.

### 2026-09-15 architecture correction — Order and Project are the same customer job

- Product rule: one canonical PostgreSQL `Project` survives unchanged from calculation through Proposal, payment, installation, and completion. Closing the sale changes its stage; it must not create a second job record.
- The visible navigation is now consolidated as one `Проекты` workspace, but legacy `db.orders` and relational `Project` are still separate and unsynchronized behind that interface. Finishing the consolidation still requires a tested stable-ID/data migration and one PostgreSQL write path.
- PR #172 must not be treated as the final entity-consolidation release. It may supply the Project fields and permissions, but the duplicate launch/list workflow remains migration work. No production deployment is authorized.

## 2026-09-23 handoff — reset Project data and allow manager manual film

- Owner request: empty all CRM Project/order data and let a manager type a film manually when it is missing from the selectable Warehouse list.
- Branch: `codex/reset-projects-manual-film`.
- Project reset migration: `20260923182500_reset_project_data_only`. It deletes relational Projects and dependent execution rows, clears legacy `payload.orders`, removes only installer work sessions tied to deleted Project jobs, and preserves leads, clients, deals, proposals, consultations, users, catalog, services/pricing, Warehouse and independent employee shifts.
- Quick Project Entry now accepts `manualFilmName`. This lets owner/manager save and quote the film name without creating fake Warehouse stock. New Warehouse film creation remains owner-only.
- A manual film is emitted to Proposal output as a film item, but historical completion is blocked until the line is mapped to a real catalog/Warehouse film so material cost cannot silently remain unknown.
- Verification and release: PR #196 merged to `main` as `d6643933c6f7503c865c0c72ef57882fc42df338`; PR CI #423 and main CI #424 both passed tests, TypeScript, and production build. Production deploy #405 completed successfully. The production watcher applies `prisma migrate deploy` before activating a release and writes the active release only after migration, seed, build, and health checks succeed; therefore the one-time Project reset migration completed before `d6643933` became active.

## 2026-09-23 handoff — Messenger booking SMS + booking visibility

- Owner reported two production symptoms: the bot implied phone follow-up but no SMS arrived, and the booked appointment was not obvious in CRM.
- Root cause confirmed in code: Facebook booking already created the canonical `Lead -> CalendarEvent -> Consultation -> Survey` chain, but `onConsultationScheduled` only created an internal consultant notification; no Twilio send was called.
- Branch: `fix/messenger-booking-sms`.
- Fix: after the booking transaction commits, CRM sends the confirmation through the existing Twilio `sendSms` service, records source/kind/consultation metadata on the Twilio message, and writes a dedicated `integration.facebook_messenger.booking_sms` activity receipt.
- Repeated Meta webhook delivery is protected by a PostgreSQL advisory lock plus the successful SMS receipt, so a confirmed SMS is not sent twice. A failed SMS does not roll back the already-created booking; CRM records the error and creates an unread manager notification.
- New Facebook bookings also create a manager-facing CRM notification `Новая запись из Facebook`. The appointment itself remains a Consultation/Calendar event, visible under `Клиенты -> Замеры` and `Расписание`, not as a Project.
- Worker response now reads `sms_confirmation.status` from CRM. It says SMS was sent only for `sent` / `already_sent`; otherwise it tells the customer to keep the Messenger confirmation.
- Worker logs `crm_booking_confirmed` with lead ID, consultation ID, and SMS status for production diagnosis.
- Verification pending CI, merge/deploy of CRM, and a controlled real Messenger booking smoke test. Worker source deployment remains a separate Cloudflare release action.

## 2026-09-24 handoff — canonical Messenger consultations in the active calendar

- Production diagnosis confirmed that Messenger created canonical Consultation `39be9261-0f86-4dce-8179-23eeb9cf71eb`, CalendarEvent `6476f790-8367-4bde-9ad4-62c27bbafdcf`, and the related Survey before sending SMS. The booking is for Zafar at `385 Sherman Way, Los Angeles`, scheduled for 2026-09-24 10:00–11:00 America/Los_Angeles, assigned to Alan with Danil as manager.
- Root cause: `/legacy-crm` is the only visible CRM, but its calendar read only `LegacyWorkspace.payload.orders`; the canonical PostgreSQL consultation API and the hidden modern consultation page were not represented in that calendar.
- Fix: `/legacy-crm` now loads the existing role-scoped `/api/v1/consultations` feed during cloud startup and projects each Consultation into the existing day/week/month calendar and map at render time. It does not copy canonical consultations into the legacy payload or add another storage path.
- Clicking a canonical event opens a compact `Запись из Messenger` card with customer, date/time, address, service, surveyor, and status inside the same CRM shell.
- Verification: all 299 automated tests passed, TypeScript passed, the production build passed, and `git diff --check` passed.
- Branch / PR: `fix/messenger-consultations-calendar-20260924` / #200.
- Next action: merge #200, wait for the standard production deployment, refresh `/legacy-crm`, open `Календарь`, and confirm the 10:00 Zafar event and detail card.

## 2026-09-24 handoff — canonical Messenger leads in the active inbox

- Owner clarified that a Messenger booking must appear immediately in the visible `Новые лиды` section, not only in Calendar.
- Root cause: the active legacy inbox only read the retired external lead-backend queue and could even show `Сервер лидов не подключён`, while the bot already created the authoritative PostgreSQL Lead.
- Fix: `/legacy-crm` now reads the role-scoped `/api/v1/leads` feed, shows active `facebook_messenger` leads including `CONSULTATION_SCHEDULED`, joins the matching Consultation for address/time/surveyor, and refreshes the visible inbox every 10 seconds.
- A booked Messenger card opens its canonical Consultation. It does not create a duplicate legacy Project or copy canonical leads into `LegacyWorkspace.payload`.
- Verification: all 301 automated tests passed, TypeScript passed, the production build passed, and `git diff --check` passed.
- Branch: `fix/messenger-new-leads-20260924`.
- Live verification after #201 confirmed the Zafar card appears. Because the same Lead has both an older 08:00 test Consultation and the real 10:00 Consultation, the first release selected the earlier list item. Follow-up branch `fix/messenger-new-leads-latest-booking` selects the latest active Consultation and ignores cancelled/deleted records.
- Live verification after the latest-booking release confirmed the card shows 10:00 and Sherman Way. A final follow-up fixes its button to call the existing canonical Consultation card action used by Calendar.

## 2026-09-24 handoff — Russian Messenger service recognition

- Root cause: the Worker depended on the language model to extract the service and its fallback parser checked Russian `защит` before `солнц`. Therefore `солнцезащитная плёнка` could be stored as Safety Film or remain missing, causing the same generic qualification message to repeat.
- Fix: the latest raw customer message is now parsed deterministically for Solar, Smart, Safety, and Decorative Film wording. Solar is resolved before Safety, and an explicit current message corrects a stale model classification. The exact reported typo `услга солнцезащитная пленка` resolves to `Solar Film`.
- Dialog correction: when the model tries to claim a booking before all required facts exist, the Worker asks only for the next missing field. After recognizing the service it asks for Residential/Commercial, then the address/city, rather than requesting service, property type, and address again.
- Verification: all 303 tests passed, including the exact reported phrase and all four service families; TypeScript, production build, Worker dry-run, and `git diff --check` passed. GitHub PR CI also passed tests, TypeScript, and production build.
- Release: PR #204 merged to `main` as `73fd7bef887f23292b1df017ec70e7e0e187b452`. Cloudflare Worker `rolanpro-bot` deployed as version `bef48a14-24c6-4d84-95f9-c39e6f0e9103`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names were present before and after deployment; no secret value was printed or changed. The live endpoint returned the expected protected `403` response to an unsigned GET.
- Next action: send `услуга солнцезащитная пленка` in the existing Messenger chat, answer the single next question, select a real CRM slot, and confirm the booking appears under `Новые лиды` and Calendar.

## 2026-09-24 handoff — multilingual Messenger booking

- The assistant now detects the latest customer's language, stores it as a BCP-47 language tag, replies naturally in that language, and changes languages when the customer does. The prompt explicitly prevents unnecessary transliteration.
- Worker-owned messages no longer fall back permanently to English outside Russian, English, and Spanish. Slot offers, missing-field questions, booking/SMS confirmations, and failure messages are translated through the existing protected Anthropic integration; dates and times use the customer's locale.
- Language normalization covers standard BCP-47 tags and common names for German, French, Portuguese, Italian, Ukrainian, Polish, Turkish, Arabic, Hebrew, Persian, Hindi, Chinese, Japanese, Korean, Vietnamese, Russian, Spanish, and English. Other valid BCP-47 languages pass through generically rather than requiring a hard-coded list.
- Verification: all 304 tests passed, including German, French-Canadian, Arabic, and Chinese language normalization; TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #206 merged to `main` as `8da58b1389a32dfefc074587dea785eb3b589454`. Cloudflare Worker `rolanpro-bot` deployed as version `dd14f10f-8ebe-4cc4-b905-81b6f4752fbe`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: use an internal Messenger account to send one German and one Arabic message, complete the qualification questions, and confirm slot and booking confirmations stay in the selected language.

## 2026-09-24 handoff — fast human-like film consultant

- Root cause of the reported hang: after a confirmed booking, the KV conversation remained in `booked`. A later product question could be interpreted as a slot claim; the Worker then emitted `Проверяю свободное время в CRM`, deliberately skipped a second slot lookup because the customer was already booked, and never sent a follow-up.
- State fix: the real application stage is now passed to the assistant. An already-booked customer receives a normal follow-up consultation answer unless they explicitly ask for another appointment/address. The qualification override is disabled for booked conversations, and the dead-end CRM-check text is removed.
- Consultant behavior: the assistant answers the customer's actual product question first, asks at most one relevant follow-up, and does not force every message into a booking form.
- Product knowledge: the Worker now carries the verified Magnitronic Solar Prime SP-5%, SP-15%, SP-20%, SP-35%, SP-50%, and SP-70% range, 2026 measured VLT/UV/IR/TSER figures, glass-compatibility limits, daytime/nighttime privacy guidance, professional-installation positioning, and the owner-provided lifetime-warranty statement constrained to eligible installations and written terms.
- Speed: customer chat and operational translation use active `claude-haiku-4-5-20251001`, history was reduced from 20 to 12 messages, output was reduced from 1,000 to 500 tokens, and latency/status telemetry is recorded without message contents or PII. Anthropic's official customer-support guidance identifies Haiku 4.5 as the latency-optimized choice.
- Verification: all 305 tests passed, including the exact already-booked qualification guard; TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #208 merged to `main` as `e75dc88f8f75a19bdefadc88f6c6a8d8d2c8afe7`. Cloudflare Worker `rolanpro-bot` deployed as version `93c64342-935b-4d81-ad48-89bc8cd2ba4c`.
- Binding safety: `CHAT`, the CRM URL, and the protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: in the same Messenger chat, ask `Расскажи про солнцезащитную плёнку и какую выбрать?`; confirm the answer explains the line and asks one diagnostic question. Then request another appointment explicitly only if a second booking is desired.

## 2026-09-24 handoff — repeat Messenger bookings must reach CRM

- Root cause: after one confirmed booking the conversation remained marked `booked`. The assistant could interpret a later message as another booking and say it was booked, while the Worker suppressed the second CRM call because it still considered the conversation already booked. The new appointment therefore existed only in the reply text and never in PostgreSQL.
- Fix: explicit repeat-booking requests in Russian, English, and Spanish now restart only the booking state, clear the previous capture marker, recapture the current lead event in CRM, and load real CRM availability. If the assistant attempts a booking claim from an already-booked conversation, the same guard starts this verified flow instead of accepting an AI-only confirmation.
- Booking invariant: a new booking is created only after the customer clicks one of the real slot quick replies and the Worker successfully calls the canonical CRM booking endpoint. The assistant cannot independently invent a time or claim that CRM has been updated.
- Verification: all 306 tests passed, including repeat-booking intent, false-positive prevention for `запись не появилась в CRM`, and source-level guard assertions. TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #210 merged to `main` as `59741e22e786e7eef571c8d9e1103e8c83bb571e`. Cloudflare Worker `rolanpro-bot` deployed as version `8e9cc8cb-6f4d-45c5-8566-72fafd7622d0`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: send `запиши меня на новый замер`, answer any missing questions, and click one of the real time buttons returned from CRM. Then confirm the appointment appears under `Новые лиды` and Calendar. The earlier AI-only attempt cannot be reconstructed because it did not store a valid selected CRM slot.

## 2026-09-24 handoff — Rolan PRO's own MAGNITRONIC PRIME film

- Owner confirmed that MAGNITRONIC PRIME is Rolan PRO's own solar-control film line. The supplied 12-page `ROLANPRO_MAGNITRONIC_PRIME_A4_Product_Cards.pdf` is the canonical source used for this Worker update.
- The bot now says `our Rolan PRO MAGNITRONIC PRIME film` when ownership is relevant and recognizes the official SP-05, SP-15, SP-20, SP-35, SP-50, and SP-70 model names.
- Product guidance now distinguishes specialty high-darkness, maximum glare control, strong solar control, balanced everyday use, high-daylight use, and ultra-clear use. It preserves the product-card requirement to verify glazing and thermal-stress conditions before recommending a model.
- Specification correction: SP-20 IRR is 96.2% and SP-70 IRR is 99.1% in the owner-provided cards. The prior Worker values of 98.3% and 99.4% were replaced. All VLT, IRR, UVR, and TSER figures now match the cards.
- Verification: all 306 tests, TypeScript, production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #212 merged to `main` as `fe031ac2a4a7ea7b4376668a18ddea9ff5579143`. Cloudflare Worker `rolanpro-bot` deployed as version `c493091e-0546-472c-a38d-bfd2e29e5461`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: ask the live bot `Чья это плёнка MAGNITRONIC PRIME и какую выбрать для солнечных окон?`; confirm it identifies the Rolan PRO line, explains the likely direction, and asks one glass/sun diagnostic question instead of inventing a final recommendation.

## 2026-09-24 handoff — official architectural and Smart Film warranties

- The owner supplied the official 5-page Architectural Window Film Limited Warranty and 4-page Smart Film Limited Warranty Agreement. Both PDFs were fully extracted and visually checked before updating the Worker.
- Architectural Film summary: qualifying owner-occupied residential Solar and Safety/Security Film has a non-transferable Limited Lifetime term tied to the original retail purchaser's continuous ownership; commercial and other non-owner-occupied projects use the executed written term up to 12 years; workmanship is 5 years unless a longer term is written.
- Architectural remedy/claim guardrails: the first 5 years generally include standard material and labor on an approved affected area; after year 5, qualifying residential product coverage provides replacement film material while labor/access may be charged. Claims must be reported within 30 days of discovery and before expiry, with project details and photos/video.
- Smart Film summary: 12 years total for qualifying supplied-and-installed film on a paid project - years 1-5 under the applicable manufacturer warranty and years 6-12 under Rolan PRO's Extended Limited Warranty. Installation workmanship and Rolan PRO-supplied/installed power or control equipment are covered for 5 years, subject to the written exclusions. One transfer at the same property is allowed with proof; relocation needs written approval.
- The bot now summarizes exclusions and performance limitations and never promises claim approval. Executed project documents and the full signed warranty control.
- Verification: all 306 tests passed; TypeScript passed after the production build; production build, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #214 merged to `main` as `2ef85d2c444a9b5e376782bb44311c1833bb88a4`. Cloudflare Worker `rolanpro-bot` deployed as version `230654c5-fc13-4e78-8ba7-1fac68e7eb70`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: ask `Какая гарантия на солнцезащитную плёнку для моего дома?` and `Какая гарантия на Smart Film и блок питания?`; confirm the bot gives the correct conditional summary and offers human review for a specific claim.

## 2026-09-24 handoff — Rolan PRO SAF protective-film range

- The owner supplied the 12-page image-only `Защитные пленки.pdf`. Every page was rendered and visually reviewed because the PDF contains no extractable text layer.
- The bot now recognizes Rolan PRO's SAF 50, SAF 100, SAF 200, SAF 300, SAF 350, and SAF 400 protective films, including the card values for thickness, ply count, tensile strength, MD/TD elongation, PLI break strength, VLT, UV rejection, and IR rejection.
- Recommendation logic presents SAF 50 as the thin basic shard-retention option, SAF 100 as heavier-duty protection, SAF 200 for higher-risk security projects, and SAF 300/350/400 as progressively thicker high-strength options. It asks about the customer's risk goal, glass, frame, pane size, access, and attachment/anchoring requirements before recommending a model.
- Safety guardrail: the bot never describes the glass as unbreakable, shatterproof, burglar-proof, bulletproof, blast-proof, hurricane-proof, or injury-proof. It explains that performance depends on the complete film/glass/frame/attachment system and only makes standard-specific claims when the executed project documents identify a tested system and performance level.
- Verification: all 306 tests, production build, TypeScript, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #216 merged to `main` as `8bea3f3a9d8766b55bd6908027eef6b1c89b4ad0`. Cloudflare Worker `rolanpro-bot` deployed as version `751004dd-74c3-4025-aa10-990100892613`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: ask `Чем отличаются SAF 50, SAF 200 и SAF 400 и что выбрать для защиты витрины?`; confirm the bot explains the thickness/security ladder, avoids guarantees, and asks one diagnostic question about the glazing system or threat level.

## 2026-09-24 handoff — decorative static-cling and reeded catalogs

- The owner supplied two three-page supplier catalogs. Both were text-extracted and visually reviewed to verify model-to-image groupings.
- The bot now knows the static-cling privacy pattern ranges AT-001-028, AT-036-043, AT-049-052, textured AT-101-104, and 3D laser-rainbow AT-029-035 plus AT-044-048.
- Reeded/fluted options include AT-C001 25 mm; AT-C002 5 mm in clear, grey, tea, and black; AT-C004B 13 mm; AT-C004 15 mm in clear, tea, and grey; AT-C005 9 mm; AT-C006 6 mm; AT-C008 12 mm; textured AT-S50; and prismatic AT-055B. Supplier roll formats are 1.52 x 30 m and 1.52 x 50 m.
- Catalog guardrails: supplier codes are options, not confirmation of Rolan PRO manufacture, current stock, measured performance, or an installed appearance guarantee. The bot confirms availability and sample appearance before promising a model and does not confuse decorative privacy with Solar, Safety, or Smart Film performance.
- Verification: all 306 tests, production build, TypeScript, Worker dry-run, `git diff --check`, and PR CI passed.
- Release: PR #218 merged to `main` as `8e741c42db8d294f7789bb586e3363100e40f81e`. Cloudflare Worker `rolanpro-bot` deployed as version `cfa1403e-8e49-4098-aa14-1b3c7a256222`.
- Binding safety: the existing `CHAT` KV binding, CRM URL variable, and protected `ANTHROPIC_API_KEY`, `PAGE_TOKEN`, and `ROLANPRO_CRM_SHARED_SECRET` secret names remained present after deployment. No secret value was printed or changed. The unsigned endpoint smoke returned the expected protected `403`.
- Next action: ask `Нужна декоративная плёнка с рифлёными полосами для офисной перегородки, какие варианты есть?`; confirm the bot explains the width/color choices and asks one question about desired privacy or glass size.

## 2026-09-24 handoff — protected website lead key

- A dedicated 256-bit `WEBSITE_LEAD_INGEST_SECRET` was generated for `rolanpro.com`, stored in the production server environment, and saved locally in the macOS login Keychain under service `Rolan PRO Website Lead API`, account `rolanpro.com`. The value was not printed in logs, committed to Git, or included in chat.
- The key is deliberately limited to the website lead ingestion endpoint. It does not grant CRM login, customer-list access, finance access, settings access, Google credentials, or the protected Google Ads scheduler secret.
- Root cause found during smoke testing: the global session middleware intercepted the signed website endpoint before route-level HMAC verification. PR #222 exempts only the exact `/api/v1/integrations/website/leads` path; adjacent integration paths remain session-protected.
- Verification: 362 tests, TypeScript, production build, diff check, PR CI, main CI, and production deploy passed. Production serves `34cf8765889e4a1f4086e71251e020b6afbeeade`. An invalid signature returned `401 invalid_signature`; a current correctly signed empty payload passed HMAC and returned `400 invalid_submission_id`, proving the secret works without creating a lead.
- Next action: send the developer the endpoint and HMAC contract, then copy the secret from Keychain Access and transfer it separately through a secure channel. The website must preserve `gclid`, `gbraid`, `wbraid`, UTMs, consent, and a stable unique submission ID.

## 2026-09-24 handoff — protected Google Ads CRM learning loop

- The existing draft PR #140 was refreshed onto current `origin/main` instead of creating a duplicate integration. Current Messenger, consultation, project, and CRM changes were preserved.
- CRM can accept signed website leads with `gclid`, `gbraid`, `wbraid`, UTMs, consent snapshots, and retry-safe submission IDs. Secrets remain server-side.
- A real `CONSULTATION_SCHEDULED` transition can create a Qualified Lead conversion from either a Deal or a Lead, so a confirmed booking can train Google even before a Deal exists. Attribution falls back to the latest preserved Lead/Client touchpoint when a Deal has no explicit selected touchpoint.
- `CLOSED_WON` creates a separate Converted Lead event and uses the sale value only after the signed-agreement plus paid-deposit gate. Stable transaction IDs and durable outboxes prevent duplicate uploads.
- Google Data Manager uploads default to disabled and validate-only. Live acceptance is reconciled through `requestStatus:retrieve`; only `SUCCESS` becomes `confirmed`, while `FAILED` and `PARTIAL_SUCCESS` require operator review.
- A scheduler can call `POST /api/integrations/google-ads/sync` only with the exact server-side bearer secret `GOOGLE_ADS_SYNC_SECRET` (minimum 32 characters). The response contains operational status but no customer PII or credentials.
- Verification: 360 automated tests passed; TypeScript passed; Prisma schema validation passed; production build passed; `git diff --check` passed; PR #140 CI and bridge checks passed.
- Release: PR #140 merged as `67bc2560574bdd4121414533eb5fe7821283f329`. Its first production build exceeded the old bounded 768 MB V8 heap; the previous healthy release `69b8cc6` stayed active, so customers were not switched to a failed release. PR #220 raised only the deployment build limit to 1024 MB, merged as `0556e72c92db7e7a41bf3ce3101e9f639b3aa69a`, passed CI, and deployed successfully. The production active-release file confirmed `0556e72c92db7e7a41bf3ce3101e9f639b3aa69a`.
- Production protection smoke: unauthenticated Google Ads settings returned `401`; the scheduler endpoint returned `503 integration_not_configured` while `GOOGLE_ADS_SYNC_SECRET` and Google account configuration remain absent. No Google credential, customer/action ID, or secret was printed or added, and no live conversion was uploaded.
- Next action: configure Google Cloud project, Google Ads customer and conversion-action IDs, protected OAuth or service-account access, and a server-generated sync secret outside chat. Keep Qualified Lead on `CONSULTATION_SCHEDULED`, run validate-only checks, and enable live uploads only after Google reports clean validation.

## 2026-09-26 handoff — one complete CRM with a responsive phone interface

- Product correction: mobile CRM must not be a reduced product. The separate phone shell is removed because it exposed only a subset of the functions available in the canonical desktop workspace.
- One interface: phone and desktop now render the same role-authorized `/legacy-crm` document, the same `renderView()` modules, the same actions, and the same server-backed data. There is no mobile-only business workflow or second CRM surface.
- Phone navigation: a safe-area-aware bottom dock provides fast role-specific shortcuts. `Ещё` opens the existing complete sidebar, so every available module, profile context, Settings permission, and logout remains reachable on a phone.
- Role behavior: Owner and Manager retain all sales and operating modules; Consultant retains Projects, measurements, Calendar, tasks, and assigned work; Installer retains assigned installations, Workday, Calendar, tasks, and personal operational data. Existing server authorization remains unchanged.
- Phone behavior: the existing responsive workspace keeps 44px-or-larger controls, 16px form inputs, stacked mobile tables/forms, horizontal-overflow containment, safe-area spacing, and keyboard-focused field centering. Desktop markup and navigation remain unchanged outside the mobile breakpoint.
- Verification: 379/379 automated tests passed, including legacy inline-script validation; `npm run typecheck` passed; `npm run build` completed all 109 static pages and the `/legacy-crm` dynamic route; `git diff --check` passed. No production customer, project, consultation, employee, or authentication record is modified by this UI-only change.
- Release: after PR #248 had already been merged at the earlier head, the owner explicitly authorized a direct fast-forward. Corrected head `b5d6d7f597e890cd3f563a5abfdc9e09499be6b7` reached `main`; CI run #36287140697 and production deploy #36287199985 passed, and production confirmed it was serving that exact SHA.
- Remaining acceptance: review all role navigation and representative create/edit flows at real iPhone sizes without changing production customer data.

## 2026-09-26 handoff — duplicate client prevention

- Identity rule: a normalized phone or normalized email selects the existing client card. US formatting differences, email case, and Gmail dots or `+alias` suffixes do not create another client.
- Covered paths: manual client creation, new-client selection inside Project creation, Lead and cold-prospect conversion, canonical client API creation/update, Project constructor, legacy proposal publication, Wiz/CSV import, and legacy workspace persistence.
- Existing-card behavior: creation returns or selects the existing client ID; Projects keep their own address/snapshot and do not overwrite an established account merely because a contact matched. Contact edits that collide with another card are rejected.
- Server safety: PostgreSQL creation paths take transaction-scoped advisory locks for every normalized identity before lookup/create. Legacy workspace updates reject a newly introduced duplicate pair while allowing old historical duplicates to remain readable until a reviewed merge workflow exists.
- Verification: 387/387 automated tests passed, including exact deduplication flows and legacy inline-script compilation; `npm run typecheck`, the 109-page `npm run build`, and `git diff --check` passed. No production client, Lead, Deal, Project, proposal, workspace, or authentication record was read or modified.
- Branch / PR: `codex/prevent-duplicate-clients` / #250 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/250`). PR CI #36290656485 and Codex Bridge passed, and GitHub reports the PR clean; approval, merge, and production deployment are the remaining release steps.

## 2026-09-26 handoff — official supplier catalog and auto-draft procurement

- Scope: the existing Warehouse/Suppliers/Purchases workflow now owns Madico, LLumar, Johnson Window Films, NEXFIL, and Armolan supplier cards and their officially confirmed architectural product entries. No parallel Prisma model, inventory, or procurement system was introduced.
- Imported catalog: Madico 4, LLumar 27, Johnson Window Films 14, NEXFIL 15, and Armolan 19; 79 positions total. Internal stable IDs are integration keys, not claimed manufacturer SKUs. Unconfirmed dealer SKU, price, warranty, payment terms, and lead time remain empty.
- Supplier cards: store the published company name, phone/email/address when confirmed, official site/contact URL, catalog count, source links, purchase-request history, `Создать заявку`, and an explicit send action for an existing draft. Madico and LLumar have no invented email; their official contact page opens and the draft remains unsent.
- Auto-draft rule: only catalog items already represented by Warehouse stock participate in low-stock evaluation. If remaining stock falls below the item or global reorder threshold, the existing purchase-request array receives one `auto_reorder` draft for the linked vendor and target-stock difference. Any active draft/request/order for the same stock item and vendor suppresses duplicates until it is received or cancelled.
- Sending: external communication occurs only after an Owner or Manager presses send and confirms the destination. The authenticated `/api/v1/integrations/procurement-email/messages` route accepts only a purchase-request ID, resolves the persisted draft, supplier, recipient, and message server-side from a locked workspace row, and uses the separate Resend subdomain rather than the client Google Workspace channel. The purchase-request ID is the provider idempotency key; a successful response transactionally changes the persisted draft to `requested`, appends supplier history, and advances the workspace revision.
- Access and parity: Owner and Manager can create/send/advance procurement. Field-role server payloads contain neither vendors, inventory, nor purchase requests, and catalog commercial fields remain redacted. On phones, procurement tables become labeled cards and supplier actions keep 44px touch targets while using the same canonical data and actions as desktop.
- Verification and release: 387/387 automated tests passed, including the real legacy inline-script compilation; TypeScript and production build passed on the PR and again on `main` in CI run #36295955477. PR #253 merged as `ce190c87d738e393b6774866c8be83746708cb03`; production deploy run #36296022085 completed successfully and verified the live root endpoint.
- Current operating state: internal purchase-request drafts, assignment, status tracking, and Warehouse receiving are live. External supplier email remains intentionally unavailable until the separate Resend procurement sender variables are configured; this does not block internal Manager procurement work.
- Next action: Owner enters any missing real supplier terms and email addresses, configures the procurement sender when external email is wanted, and then performs one controlled Manager draft-to-receipt walkthrough without using customer data.

## Completion rule

### 2026-09-15 correction — one Projects workspace

- Owner and manager navigation now contains one `Проекты` entry instead of separate `Заказы` and `Проекты` entries. New work is labeled `Новый проект`, and the funnel, cards, primary actions, and project intake use the same lifecycle language.
- The canonical PostgreSQL constructor remains available from the Projects workspace as `Проверенные замеры`; it is a measurement tool inside the project, not a second customer-job list.
- Compatibility is preserved: legacy `orders` keys, `#/order/...` links, `R-...` numbers, and `Заказ-наряд` documents are not deleted or rewritten. The relational ID/data migration is still required before legacy storage can be retired.
- Verification: all 240 automated tests pass locally. GitHub CI run #35055402899 generated the current Prisma client, passed the complete test suite and TypeScript, and completed the production build on commit `3d3b146`.
- Branch / PR: `codex/project-add-service-button` / #172. No production deployment was started.

### 2026-09-15 correction — Google Maps in the dispatch calendar

- The calendar/map workspace now uses Google Maps as its primary map. Project visit markers, customer/address details, calendar filters, and the existing route line remain attached to the same Project events.
- `/legacy-crm` receives the restricted browser key from protected server environment configuration (`GOOGLE_MAPS_BROWSER_API_KEY`, with the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` as compatibility fallback). The key is not committed to Git or written into CRM storage.
- If the key is absent, rejected, or Google Maps cannot load, the existing Leaflet map remains an operational fallback instead of breaking Calendar.
- This correction extends PR #172. Production deployment remains a separate release action.

### 2026-09-15 correction — one readable dispatch workspace

- The Day view no longer repeats the same events across KPI cards, an agenda card, and four appointment-type lanes. It now uses one 06:00–21:00 timeline beside the map.
- The Week view uses the same operating model with seven time columns. The calendar receives the primary width; the map is a narrower route-planning context. Month remains a compact calendar with an optional map.
- Date navigation, Day/Week/Month mode, event filter, employee filter, event count, and `+ Назначить` are consolidated into one two-row command bar. Decorative legends and empty dashboard cards were removed from the main scheduling surface.
- The implementation follows the official TintWiz scheduler pattern relevant to Rolan PRO: calendar and map side by side, filtering by appointment/team member, and scheduling against the existing Project. It does not copy TintWiz data or create another scheduling entity.
- Desktop visual verification passed at 1920×1080 for Day and Week in the local preview. This correction extends PR #172; production deployment remains a separate action.

A task is shared and complete only when all applicable statements are true:

- The work is committed and pushed.
- A branch or PR is linked here.
- Required checks passed and results are recorded here.
- The change is merged into `main` when release-ready.
- Production is verified separately when deployment is part of the task.

Local edits, screenshots, chat messages, and unpushed commits do not count as shared completion.

## 2026-09-14 — Mobile measurement viewport repair

- Owner: Codex; branch `codex/mobile-measurement-workspace`, based on current `main`.
- Scope: the existing legacy measurement editor; one mobile scroll surface, compact title/services/progress, collapsible summary, footer in document flow, accessible room inputs.
- Verification: 189 automated tests passed; TypeScript passed; production build passed; inline scripts compile. Independent agent review identified adapter overrides, field focus IDs, details state, and horizontal scroll restoration; all addressed.
- Blocker: browser rejected both local preview URLs with ERR_BLOCKED_BY_CLIENT. Actual mobile rendering, keyboard interaction, and server persistence are NOT verified. Do not claim mobile acceptance or production completion.
- Next action: review dedicated branch/PR, test the injected legacy route at 375/390/430px and desktop with keyboard and save/reopen, then release through main after CI. Not merged or deployed.

## 2026-09-27 — canonical project-stage workflow (in progress)

- Owner: Codex; branch `fix/canonical-project-stage-workflow`, based on current `main`.
- Scope: remove the new-project `Быстрый ввод` bypass and enforce one project path: client/property/service → measurement → estimate/proposal → production preparation → installation → act/payment.
- Compatibility: historical quick-entry data remains readable; no customer or project data is deleted.
- Implementation: new Projects open the measurement workspace and do not create quick lines; estimates require measured openings and selected catalog film; Proposals require an approved measured estimate; installation requires accepted Proposal, deposit, verified dimensions, feasible cut plan, sufficient stock, and explicit production readiness.
- Verification: 388/388 automated tests passed; TypeScript passed; production build completed all 110 routes; `git diff --check` passed.
- Release state: implementation commit `357f677` is published on `fix/canonical-project-stage-workflow`; review is PR #260 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/260`). Both required PR checks passed on the documented head. No production deployment is authorized by this task.
- Material-picker correction: Project measurement and legacy quick-import compatibility now normalize historical catalog category names (`safety film`, `security film`, `PDLC`, `privacy`, Russian labels, and canonical keys) before filtering. A model with a real Warehouse roll remains selectable even if its catalog card was archived; stocked models sort first and display the canonical Category → Name → Model identity. The picker no longer falls back to unrelated service categories when no valid model exists.
- Project-intake correction: `+ Новый проект` now starts with one compact contact gate. The manager searches the existing client directory or opens `+ Добавить контакт`; only after the contact is selected or created does the same modal reveal site type, service, catalog material, manager, notes, and project actions. Creating a contact still writes one canonical client card and returns it to the unfinished Project.
- Smart production correction: the canonical measurement modal now captures a Smart kit per opening: one generated connection zone per physical window quantity, panel drawing, power-supply model and count, silicone quantity, controller, block placement, connection point, wire route, and electrician requirement. Smart measurement cannot be completed without the power supply, wire route, matching zone count, and required silicone. The same records now generate a Smart BOM and room-by-room panel → connection → power block diagram directly in the installer work order; no second Smart project or drawing store was added.
- New-project film correction: material selection no longer silently chooses the alphabetically first catalog record (which could make a Smart project start with Decorative Smart). The manager explicitly chooses Direction → Type/Series → Product → Model; duplicate generic category spellings such as `Смарт` and `smart` are merged into one `Smart / PDLC` choice, and the selected catalog model remains attached to the service and project.
- Responsive-mode correction: a narrow desktop/browser panel is no longer treated as a phone only because its CSS width is below 768 px. Phone card adapters now require either a viewport up to 520 px or a coarse pointer; a 521–840 px fine-pointer desktop uses a compact 76 px desktop rail, normal desktop tables/dialogs, and no bottom phone dock. True phones and touch tablets keep the existing mobile workspace.

## 2026-09-29 handoff — TASK-009 stage 0: clean database build and end-to-end gate

- Governing decision: `DECISIONS.md` → "2026-09-29 — CRM core consolidation" (PR #264). Task: issue #265 / `rolanpro-ai-system` TASK-009. Builder: Claude. Reviewer: Codex.
- What changed:
  - The two 2026-08-24 owner-recovery migrations stay byte-identical (Prisma checksums). `scripts/db-bootstrap-empty.mjs` builds an empty database and marks exactly those two as applied when there are no users; CI uses it. Never run it against production.
  - New migration `20260929120000_align_schema_with_migrations`: idempotently creates `measurements.quantity` (used by the app but never created by any migration), restates four foreign keys with `ON UPDATE CASCADE`, drops a redundant `installer_jobs` index, and renames truncated index names. `schema.prisma` now declares the `updated_at` defaults and the proposal-code default exactly as the database stores them. Drift from migrations to schema is zero.
  - New migration `20260929121000_repair_safety_film_field_config`: moves safety-only survey fields that the seed bug created under Smart Film back to Safety Film when Safety Film lacks them. Nothing is deleted; leftovers are reported via NOTICE.
  - `prisma/seed.ts`: Safety Film fields are created under `SAFETY_FILM` (was `SMART_FILM`); non-production seeds provision the empty legacy workspace from `data/legacy-crm-empty.json`.
  - `scripts/build-empty-legacy-workspace.mjs` no longer defaults to a file in the Owner's `~/Downloads`.
  - Bug fix: `POST /api/v1/consultations/:id/measurements` rejected every measurement without an explicit `constructor` field, because `body.constructor` resolves to the inherited `Object.prototype.constructor`. It now checks an own property. Found by the new end-to-end gate.
  - New CI job `clean-build-e2e`: empty PostgreSQL → `scripts/db-bootstrap-empty.mjs` → drift check → `e2e_disposable_marker` → seed → production build → `next start` → `npm run test:e2e`.
  - E2E safety: needs `E2E_ALLOW_WRITES=1`, local app and DB, a server sentinel proving the server uses the same database, and the `e2e_disposable_marker` table (never present in production).
  - New `e2e/lead-to-measurement.e2e.ts`: manager creates lead → deal → site survey for the surveyor; surveyor records two windows; manager sees both with server-computed square footage; one lead and one deal only; surveyor cannot create leads and does not see the deal value.
- Verification (local, 2026-09-29): empty DB builds with `prisma migrate deploy && pnpm db:seed`; drift exit code 0; 422/422 unit tests; TypeScript; end-to-end 2/2 against a running server.
- Known gaps for the next stages (not changed here): employees are still duplicated between PostgreSQL `User` and the legacy payload (a valid manager sees "Доступ не настроен" in `/legacy-crm` on a clean database); nearly all operating data remains in `LegacyWorkspace.payload`; migration `20260923182500_reset_project_data_only` performs a destructive data reset inside the schema migration history.
- Next action: Codex review of this PR; after Owner approval, merge. Deploying runs the two new idempotent migrations on production — take a database backup first.

## 2026-09-29 handoff — TASK-010 stage 1: one employee directory and "view as employee"

- Governing decision: `DECISIONS.md` → "2026-09-29 — CRM core consolidation", item 3 (one employee directory). Builder: Claude. Reviewer: Codex. Builds on TASK-009 (PR #266).
- Owner-reported symptoms: adding an employee was confusing, the UI jumped between screens, roles could not be changed in the employee card, an employee's workspace could not be inspected.
- Root causes found: employee cards lived in both PostgreSQL and the legacy payload; an in-browser sync (owner only, on every navigation) created links and re-rendered; the legacy card editor reverted the owner's role choice asynchronously and saved only one role; legacy `migrateSchema` forced fixed roles and `active=true` on `u_o1,u_m1,u_z1,u_i1,u_i2` on every load; an employee who signed in before the owner opened the CRM got "Доступ не настроен"; owner-issued passwords allowed 10 characters while change-password required 12; role replacement was not transactional.
- What changed:
  - `src/features/team/directory.ts`: the server derives legacy employee cards from PostgreSQL on every workspace read and save; name, email, role and access always come from PostgreSQL; legacy-only fields stay editable; unlinked historical cards are kept. Every CRM employee gets a stable server-assigned legacy id (`/api/v1/auth/me`, state route).
  - The in-browser team directory sync is removed from `/legacy-crm`; the cloud legacy CRM no longer forces fixed roles/active or invents an owner card.
  - New owner screen `/team`: add employee, several roles, enable/disable access, temporary password, "Посмотреть глазами".
  - "View as employee": `POST/DELETE /api/v1/team/preview` sets/clears an httpOnly cookie honoured only for a real owner session; every API and page is then served as the employee. Read-only is enforced in middleware and in `requireRequestSession`; the legacy page shows a banner and does not attempt saves.
  - One password rule (`src/lib/auth/password-policy.ts`, 12 characters) for owner-issued, change and reset flows; role replacement runs in one transaction.
- Verification (local): 424/424 unit tests, TypeScript, 7/7 end-to-end (`e2e/employee-directory.e2e.ts` + lifecycle gate); manually: owner added an employee with two roles, previewed the surveyor portal read-only, exited; a manager lands on "Портал менеджера" instead of "Доступ не настроен".
- Next action: Codex review; Owner approval; merge after #266. No production deploy without a fresh database backup and explicit Owner approval.

## 2026-09-29 handoff — TASK-011 stage 2: one client per customer (adopts Codex PR #250)

- Governing decision: `DECISIONS.md` → "2026-09-29 — CRM core consolidation". Builder: Claude (integrating Codex's PR #250). Reviewer: Codex. Stacked on TASK-010 (PR #267).
- Adopted from #250 unchanged in intent: phone (E.164) and email normalization, reuse of the existing client on create (API, leads, projects, proposals, Wiz/CSV import), server-side rejection of new duplicate client cards in legacy workspace saves, historical duplicates preserved.
- Integration: merged onto current code; the legacy save now keeps the multi-user merge/retry loop from `main` and adds the `duplicate_client` handling from #250 inside it.
- Bug found by the E2E gate and fixed: `lockClientIdentity` used `$queryRaw` on `pg_advisory_xact_lock`, which returns `void`; Prisma failed to deserialize it, so **every client create with a phone or email returned 500** (also in project and proposal creation paths). Now `$executeRaw`.
- New `e2e/client-identity.e2e.ts`: `(805) 555-0142` and `+1 805-555-0142` resolve to one client; email match is case/space insensitive; a legacy save adding a second card for the same phone is rejected with `duplicate_client`. E2E files run serially (shared legacy workspace revision).
- Known limitation: client lookup scans all clients per create (fine at current volume); add normalized, indexed identity columns before tens of thousands of clients. Legacy-workspace clients and PostgreSQL clients are still two stores until the client collection migrates.
- 2026-10-01 follow-up (Codex): the manual project screen offers every matching client card after a contact conflict and resubmits with the chosen `client_id`; the route forwards it, and a manager may choose only a client within `buildClientReuseWhere`.
- 2026-10-01 follow-up (Codex): the same picker exists for lead → client conversion (deal panel; `PATCH /deals/:id` links only a client within `buildClientReuseWhere`) and for legacy proposal publishing (409 with candidates → «Для кого это КП?» → publish with the chosen, scope-checked `client_id`).
- 2026-10-01 follow-up (Codex): legacy «Создать проект» from a lead asks «Для кого создать проект?» when the contact matches several cards. Production build: CI job «Test, typecheck, and build» (`npm run build`) runs on every push of this PR and is green.

## 2026-09-30 handoff — database backup before every production deploy (PR #274)

- Workflow dump: `.github/workflows/deploy-production.yml` runs `pg_dump --format=custom` on the server before the fast-forward, with credentials from `/home/runcloud/.rolanpro-crm.env.production.local`. The dump is written to a `.partial-` name, verified with `pg_restore --list`, then renamed to `/home/runcloud/backups/crm-db/rolanpro-<UTC>-<full commit SHA>.dump`; any failure removes the partial file and stops the deploy. The last 30 `rolanpro-*.dump` files are kept (only in `crm-db/`; the website snapshots in `/home/runcloud/backups/` are not touched).
- Pre-migration dump: `deploy/watch-production.sh` dumps again right before `prisma migrate deploy` (after the long build) to `…/crm-db/rolanpro-<UTC>-<full SHA>-premigrate.dump`. One dump per commit: a retry after a failed migration keeps the first (clean) dump and adds none. Interrupted `.partial-*` files are removed on TERM/INT, on watcher start and before each dump. A failed dump stops the release.
- Watcher restart is automated: the running bash watcher keeps the code it started with, so when a deployed commit changes `deploy/watch-production.sh` the workflow sends TERM to it right after the fast-forward and waits for the new PID. Verified on the server (2026-10-01): supervisord program `rolanpro-crm-app`, user `runcloud`, `autorestart=true`, `stopsignal=TERM`; the watcher's TERM trap stops Next.js and exits, supervisor starts the new script, which serves the active release and then builds the new commit with the pre-migration dump. Brief restart of the current release (seconds). Later script changes re-exec in place and hand over the running Next.js PID.
- Server prerequisites verified (2026-10-01): `pg_dump`/`pg_restore`/`psql` 17.10 in `/home/runcloud/rolanpro-runtime/bin`; ~40 GB free on `/`.
- Verification after merge: the "Advance production" step log shows `Database backup: …/crm-db/…` and `Watcher restarted: <pid>`; on the server, `ls -lt /home/runcloud/backups/crm-db/` and `tail /home/runcloud/logs/rolanpro-crm-supervisor.log`.
- Next: merge first, then the TASK-009…011 stack and the pay-rule PRs, each preceded by these backups. Off-server copies (Cloudflare R2) are the next step.

## 2026-09-30 handoff — surveyor mobile workspace v4

- Scope: the canonical `/legacy-crm` now gives the Surveyor a field-first mobile workspace with five direct destinations: `Сегодня`, `Календарь`, `Мои задачи`, `Замеры`, and `Ещё`. No second CRM, store, or role API was added.
- Today: assigned visits, the next visit, route context, personal-task count, monthly completion count, and the existing call, WhatsApp, accept, resume-measurement, project, and complete actions are presented as touch-friendly cards.
- Calendar: the Surveyor uses the existing canonical Day/Week/Month dispatch data and filters, with a phone `Расписание / Карта` switch. My Tasks remains the existing shared task module with a compact personal task composer.
- Responsive verification: the four primary Surveyor screens were visually reviewed at 390×844. Tablet 1024×768 and desktop 1440×900 have no document-level horizontal overflow. The approved calm navy/blue field-app visual language was applied without changing desktop business logic or authorization.
- Automated verification: 34 targeted tests passed for mobile parity, Surveyor v4, measurement, field workspace, and dispatch calendar/map; the legacy inline script compiles; `git diff --check` passes. The repository-wide test command remains unstable on the local Node 24 machine because its unbounded parallel `tsx/esbuild` launch stops shared transform services; CI on Node 20 is the release gate for the full suite, TypeScript, and production build.
- Release branch: `codex/surveyor-mobile-v4-release`, rebased at the Git object level onto current `main` `acd2e60`. Production deployment proceeds only after the required PR CI succeeds and the PR is merged into `main`.

## 2026-10-01 handoff — client card: B2C / B2B identity, website leads in «Новые лиды» (PR #284, stacked on #268)

- Owner request (2026-10-01): separate first/last name; B2B company name, company type, representative first/last name and job title; «Постоянный партнёр» as an explicit status (basis for the partner cabinet).
- Legacy CRM: shared identity block in the new-client modal, contact passport and new-project client overlay; `name` stays the display name. Client list shows company type and representative; search covers them. Lead, cold-call and backend conversions fill the same fields; the cold-call form has separate representative name, title and company type.
- Website intake `/api/v1/integrations/website/leads` accepts `first_name`, `last_name`, `customer_type`, `company_name`, `company_type`, `contact_title`; keeps an email/phone only when it looks like one. Website leads are listed in «Новые лиды». «Создать проект» reserves the lead (`POST /api/v1/leads/:id/claim` — `claim`; the lead stays open, a reservation expires after 10 minutes), saves the project with server confirmation (the order keeps `canonicalLeadId`), then closes the lead (`complete` → `CONTACTED`, claimant only); on a failed save it rolls back and `release`s. A repeated click on a lead that already has a saved project only closes it. «Спам / отклонить» → `CLOSED_LOST` (compare-and-set, respects another manager's active reservation). Migration `20261001140000_lead_claims` adds `claimed_by_user_id` / `claimed_at`.
- Managers see their own leads plus the unassigned queue (`buildLeadScopeWhere`); processing an unassigned lead assigns it to them.
- Public lead values are HTML-escaped (leads view, `emailAnchor`, `addressAnchor`, client-list phone).
- Migration `20261001120000_client_identity_fields` (additive nullable columns on `leads` and `clients`).
- Verification: full unit suite and `tsc` green; `lead-identity`, `client-identity-fields`, access tests.
- Production build: CI job «Test, typecheck, and build» (`npm run build`) runs on every push of PR #284 and is green.
- Not done: WordPress form fields (site repo outside this project); B2B terms in КП and the partner cabinet (need Owner decisions and legal review).
- Next action: Codex 👍 on the latest commit, Owner «да», merge after #268, deploy (pre-migration backup is automatic).

## 2026-10-01 handoff — «Специалист по установке» and per-object analytics (PR #282)

- Owner decision (DECISIONS.md «Installation job titles»): «монтажник» is not used anywhere; regular installer = «Специалист по установке», senior = «Руководитель отдела монтажа». Internal codes (`INSTALLER` / `installer`) unchanged.
- Renamed in the legacy CRM, new screens, `ROLE_NAMES` (seeded into `roles.name_ru`), `data/legacy-crm-empty.json`, and stored SMS templates via data migration `20261001130000_installer_title_in_sms_templates` (idempotent, revision bump).
- New installer view «Аналитика»: period filter; objects finished, own sq ft, own earnings, pending earnings; sq ft by film type; one card per object. Measured windows are shared by the order crew; quick lines count only for the installers assigned to each line (same rule as `orderQuickInstallerPayoutForUser`). No client price, cost or margin.
- Verification: full unit suite and `tsc` green; `installer-analytics.test.ts` runs the calculation in a VM; migration checked twice on a scratch database.
- Production build: CI job «Test, typecheck, and build» (`npm run build`) runs on every push of PR #282 and is green; the clean-database + E2E gate is green too.
- Not done: the lead role «Руководитель отдела монтажа» lives in the #275–#277 stack and must adopt the new titles when that stack is rebuilt on top of Codex PR #281.
- Next action: Codex 👍, Owner «да», merge, deploy (pre-migration backup is automatic).

## 2026-10-01 handoff — CRM no longer jumps after every click (PR #285, deployed 03:56 UTC)

- Cause: seven DOM patches injected by `/legacy-crm` waited for the next animation frame, so the unpatched page was painted first (menu items moved 52 px, the top bar resized).
- Fix: `src/features/legacy-crm/before-paint.ts` (`beforePaint`: microtask before paint, runaway guard → next frame). All patches use it; new patches must too. Client list no longer crashes on a client without a source.
- Verified locally with a `layout-shift` observer (0 shifts on menu clicks) and in production (deploy 06a58ab healthy).

## 2026-10-03 — actual service solutions in operating projects

Owner clarified: project direction → owner-created solution → linked material and own price; each service has its own specialist and date. Work owned on `codex/service-solutions-live` from main `4b5463c`, separate from #296 migration/execution work. Reuses/adapts the core of unmerged #295 rather than importing its older warehouse branches.

Implemented: owner-defined solution directory without starter products; many-to-many solution/film links; solution selectors in measured windows, estimate and quick rows; name/customer-price/pay-rate snapshots; server-only catalogue permissions and manager rate redaction; per-service scheduling; calendar events and piece-rate crews scoped to the service. Project summary crew/date is derived on the server. Old workflows without service assignments retain their prior fallback. Measurement/proposal/deposit gates remain.

Verification: local 98 test files passed (including 8 new behavior/security tests), TypeScript/build and disposable DB/API/browser CI results to be recorded after completion. Browser gate covers actual scheduling components in the authenticated CRM at 390/1440px and persistence through the real workspace API, not a complete consultation-to-payment journey. No production writes, migration or deploy have been made. Next action: review CI and screenshots, resolve findings, then release through main with owner authorization. #295 overlaps this implementation and must not be independently merged unchanged; #296 remains separate.

### 2026-10-03 continuation — service solutions release candidate

Rebased `codex/service-solutions-live` onto main `199b0df` (Precision Workbench retained). Local full suite: 501 passed; TypeScript passed. Browser CI now also exercises the real service-pricing page: owner creates a solution, edits price and links material, then verifies the server-saved record. Independent schedule component and API persistence checked at 390/1440 px. CI build, database and browser results pending publication. PR #298 overlaps catalogue/pay/warehouse work; do not merge both unchanged. This change is scoped to the owner-requested solutions and independent assignments, without warehouse schema or historical-order migration.

### 2026-10-04 UTC — PR #299 verified for release

Code head `ecd973bad1ef023e9dd2247799c7da3e6d38bd29`, CI #824 / run 37177592497: 502 tests, TypeScript, production build, clean database migrations/drift and HTTP lifecycle checks passed. Chromium 390/1440 passed real pricing-screen solution creation, material/price persistence, distinct service crews/dates, workspace reload assertions, no JS errors and no schedule overflow. Screenshots artifact 11294070485 reviewed. The fixture uses a real authenticated session on disposable localhost, explicit resets between widths and acknowledged cloud saves; early browser-gate failures were resolved. Installer reads preserve only their assigned service pay snapshot; manager and other-service rates remain hidden. No schema migration or historical order import is included. Latest change after that code head is documentation only. Next: release PR #299 through main CI and protected production workflow, then verify active build. Do not independently merge overlapping #295/#298 unchanged.
## 2026-10-01 handoff — one login email per employee (PR #280)

- Owner report (three days): employee «Ринат» showed one email in the card and another in «Доступ».
- Causes: (1) two PostgreSQL accounts were linked to the same legacy cards (resolved on production 2026-10-01 by deactivating the extra accounts, Owner request); (2) the owner-only fetch guard in `/legacy-crm` stripped `email` from every team PATCH, so «Доступ» reported success while PostgreSQL kept the old address.
- Fix: only `roles` is stripped; the «Доступ» dialog loads the PostgreSQL account before rendering (Save disabled without one) and reports success only when the server returns the new email; the card sends a new email only when the owner typed it.
- Verification: full unit suite and `tsc` green; `team-email-edit.test.ts`.
- Production build: CI job «Test, typecheck, and build» (`npm run build`) runs on every push of PR #280 and is green.
- Next action: Codex 👍, Owner «да», merge, deploy (no migration).
## 2026-10-01 handoff — manually written film → project → purchase request

- Owner request: a manager writes in a film that is not in the warehouse list; it must be fixed in the project so it can be purchased and received and the project cost is correct. Solar films get subtypes.
- Quick project editor, «Плёнки нет в списке»: «✍️ Вписать плёнку вручную и заказать» (owner and manager). Form: type (solar: Зеркальная / Керамическая / Магнетронная (напылённая) / Фотохромная / Другая), name, vendor, roll width, note. Saving creates a catalog film with `pendingPurchase` (reused if the same name exists), puts it on the project line, and creates a draft purchase request for this order (`source: manual_project_film`, metres = sq ft × 92.903 / width mm × 1.1, rounded up to 0.5 m). Changing the line quantity updates the draft. The line shows «Вписана вручную · ожидает закупки · заявка …». Receiving the roll uses the existing «Закупки» flow; the project's material cost then comes from that roll.
- The owner's «+ Добавить плёнку на склад» (roll already in hand) is unchanged and suggests the solar subtypes.
- Review fixes 2 (Codex, #287): a draft's «нужно к» follows line start-date edits and dates filled by «Назначить монтаж» (`refreshManualFilmNeededBy`); a manually written name never reuses an archived film hidden by `catalogCanBeSelected`.
- Review fixes (Codex, #287): one draft per project and film, sized by every quick line that uses the film (`reconcileManualFilmPurchase`: total sq ft → metres, earliest start date as «нужно к»). It runs on quantity changes, film/service changes (old and new film) and line deletion; no square feet left → the draft is cancelled with the reason; a request already sent to the supplier is left to purchasing. A film written in that already has stock creates no request.
- Verification: full unit suite and `tsc` green; `manual-film-purchase.test.ts` runs the flow in a VM; checked in a local CRM (main + this branch): the form, the pending film on the line, PUR-… draft for 300 sq ft = 20.5 m, labels and status in Russian. Production build: CI job «Test, typecheck, and build».
- Next action: Codex 👍, Owner «да», merge, deploy (no migration).

## 2026-10-01 handoff — roll receipt form: codes, typed-in films, price per sq ft (stacked on #287)

- Owner request: the «Принять рулон на склад» form needs category (smart / solar …), brand, vendor, lot, width, model, date, location and a unique code per roll; a film missing from the list is typed in and added to it; the purchase price per sq ft is computed automatically and used in the project material price.
- Form: category, solar type, brand and model (suggestions from the catalog or typed in), vendor, lot, width, length, purchase price (required), live «$/sq ft · roll area», date, location, auto code `RP-YYMM-NNNN` (sequential per month; also the QR code). Receiving: an existing category+brand+model is reused, otherwise the film is added to the catalog; `costPerSqft` is stored on the roll; a purchase request is marked received and the movement keeps its project.
- Project cost: unchanged rule — `warehouseCatalogCostPerSqft` = remaining roll value / remaining area — now always priced because the purchase price is required.
- Warehouse roll table: «Код» and «Закупка / sq ft» columns.
- Review fixes (Codex, #291): the roll code is reserved on the server (`POST /api/v1/warehouse/roll-codes`, owner/manager; table `roll_code_counters`, migration `20261002100000_roll_code_counters`, one atomic upsert per code, floor = highest code already in the CRM), so simultaneous receipts never share a code; no code → nothing is received. All three receipt paths (warehouse form, quick project film, manager film from the measurement) reserve a code; `addInventoryRoll` computes `costPerSqft` itself. A roll received from a purchase request or a film row goes into that film; a film written in by hand for a project (no rolls yet) takes the real brand/model from the receipt and the project lines are relabelled — no duplicate film, the project gets the roll cost. Categories are matched through `canonicalCatalogCategory` (`solar_film` = `solar`). A double click receives one roll.
- Review fixes 2 (Codex, #291): each receipt form carries a hidden token (`ar-form`, `qf-form`, `mrf-form`); after the code is reserved the receipt completes only if the same form is still on screen (`rollReceiptFormStillOpen`) — a form closed or reopened meanwhile receives nothing and closes nothing.
- Verification: full unit suite and `tsc` green; `roll-receipt.test.ts` (code sequence, $/sq ft, reuse vs add, required fields); local CRM: $650 × 30 m × 1.52 m → $1.32 / sq ft, code RP-2610-0001, new film added, project cost $1.32 / sq ft, table shows code and price. Production build: CI job «Test, typecheck, and build».
- Next action: Codex 👍, Owner «да»; merge after #287.
## 2026-10-02 handoff — bank and card feeds through Plaid («Деньги → Счета и карты»)

- Owner decision (2026-10-02): connect all business bank accounts and cards so the CRM tracks balances, recognises every operation and feeds reports; via Plaid (not QuickBooks). Plaid Trial plan: free, up to 10 Production Items (one bank login each), auto-approved, Chase/BoA/Wells via OAuth.
- PostgreSQL (migration `20261002090000_bank_feeds`): `plaid_settings` (owner-entered keys, secret encrypted), `bank_connections` (Plaid Items, access token encrypted, sync cursor, status), `bank_accounts` (name, last digits only, balances), `bank_transactions` (Plaid sign: positive = money out; category, review status), `bank_category_rules` (learned «Запомнить» rules).
- Encryption: AES-256-GCM; key `BANK_TOKEN_ENCRYPTION_KEY` if set, otherwise HKDF from `AUTH_SECRET` under a bank-only label (no server change needed; rotating AUTH_SECRET means re-entering keys and reconnecting banks).
- Plaid over fetch (no SDK): link token (new bank / update mode), public-token exchange, `/accounts/get` balances, institution name, `/transactions/sync` with cursor and restart on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`.
- Categories (`src/features/bank/categories.ts`): owner rules first, then built-in keywords (Google/Facebook ads, Stripe payouts, fuel, taxes, insurance, software, China purchases/shipping as suggestions), then Plaid's category (card payments and transfers are not expenses), otherwise «Разобрать». The owner's confirmed category is never overwritten by a later sync; «Запомнить для похожих» creates a rule and applies it to other unreviewed operations.
- API (owner only, `requireBankOwner`): `/api/v1/finance/bank/{settings,link-token,connections,sync,overview,transactions/:id}`. Common Plaid errors are shown in Russian.
- Screen `/legacy-crm/bank` (owner only, not in «Посмотреть глазами»), opened from «Деньги» as an overlay: keys, «+ Подключить банк или карту» (Plaid Link from cdn.plaid.com), cash and card-debt totals, accounts by bank with re-login, «Разобрать» / «Все операции» with category, «Запомнить», «Верно». Opening the screen syncs when the last download is older than six hours.
- Review fixes (Codex, #292): remembered rules carry the direction of money (`bank_category_rules.direction` = in/out, unique per pattern + direction); «Запомнить» applies only to unreviewed operations of the same direction, and a sync applies a rule only to that direction (a refund or a Stripe payout is never taken for an expense). The «Разобрать» tab asks the server for unreviewed operations only (`overview?review=1`), 200 per page with «Показать ещё» (`offset`, `hasMore`), so every counted operation can be reached. Opening the screen syncs when any bank never loaded or is older than six hours (`bankNeedsRefresh`; a bank waiting for a new login does not trigger it). Checked on a scratch database: rule for money out leaves a refund alone; 151 unreviewed of 603 operations reached in two pages.
- OAuth banks (Codex, #292): link tokens carry `redirect_uri` = `APP_URL` + `/legacy-crm/bank/oauth` when `APP_URL` is HTTPS (`src/features/bank/oauth.ts`). The screen saves the Link token (localStorage, 30 min) before opening Link; the owner-only page `/legacy-crm/bank/oauth` resumes Link with `receivedRedirectUri` and returns to `/legacy-crm/bank`. If Plaid rejects the address (not yet in Dashboard → Developers → API → Allowed redirect URIs), the token is created without it — non-OAuth banks still connect — and the screen shows the exact address to register. Owner action before Chase/BoA/Wells Fargo: register that address in the Plaid Dashboard.
- Verification: full unit suite and `tsc` green; `bank-feeds.test.ts` (rules, crypto, Plaid request shape and errors, paginated sync with restart, owner-only wiring, Russian errors); scratch database built from all migrations with no drift; local CRM: the screen renders, keys are stored encrypted, a bad key gives the Russian message, «Деньги» shows the card and opens the overlay.
- Not yet: daily automatic sync without opening the screen (needs a scheduled job), Stripe API matching of payouts to projects, monthly report and cash forecast built on these operations.
- Next action: Codex 👍, Owner «да», deploy; then the owner enters the Plaid keys (Sandbox first: user_good / pass_good), we check a test bank, switch to Production and connect Chase, BMO and the cards.

## 2026-10-02 handoff — overhead by revenue, ad budget from last month's revenue

- Owner request: «реклама — бюджет следующего месяца = 10% от выручки этого месяца»; fixed costs are covered from the projects' profit. Decision recorded in DECISIONS.md (2026-10-02).
- Legacy block «НАКЛАДНЫЕ ПО ВЫРУЧКЕ» before `orderPSS`: `projectMonthRevenueMap` (revenue by project month, cached for the current task and reset in `save()`), `projectMonthAdBudget(date)` (marketingPct × previous month revenue; `basis: current` fallback when the previous month has none), `projectRevenueShare(o)`, `orderAdAllocation(o)`.
- `orderPSS.marketing` = the project's share of the month's ad budget; `projectProfitability` splits fixed costs by revenue share and returns `revenueShare`, `monthRevenue`, `adBudget`, `adAllocation`.
- Screens: project estimate shows «Реклама — доля бюджета месяца (X% от $budget)», the rule and the shares in «6. Чистая прибыль проекта», a «Бюджет рекламы месяца» card; order cost table says «Реклама (доля бюджета месяца)»; company cost model: «Бюджет рекламы, % от выручки прошлого месяца» with this month's budget and next month's budget from revenue so far.
- Verification: full unit suite and `tsc` green; `overhead-by-revenue.test.ts` (budget from previous month, fallback, revenue shares cover the whole month, unpriced project, draft outside the list, cache reset). Local CRM: September $100 000, October $5 000 + $65 000 → the $5 000 project carries 7.1%: fixed $500 of $7 000 (was $3 500 with the equal split) and ads $714 of $10 000.
## 2026-10-02 handoff — project archive (owner only)

- Owner request: delete projects only by the owner, into an archive, restorable. Decision recorded in DECISIONS.md (2026-10-02).
- Legacy block «АРХИВ ПРОЕКТОВ» before `renderOrders`: `openArchiveProjectModal` (reason optional), `archiveProject` (moves to `db.archivedOrders`, cancels the project's draft purchase requests, timeline `project_archived`, closes the open card), `openProjectArchive` (list with «Восстановить»), `restoreProject` (moves back, reopens those drafts, timeline `project_restored`, opens the card), `projectNumberSequence` (numbers count archived projects).
- Buttons (owner only): «🗑 Удалить в архив» in the project card top bar; «🗄 Архив (N)» in «Проекты». A link to an archived project shows «Проект в архиве — Восстановить» to the owner.
- Server: `src/features/legacy-crm/project-archive.ts` `enforceProjectArchive(current, next, isOwner)` in `PUT /api/v1/legacy-crm/state` for privileged saves.
- Also: the projects list no longer crashes on a project without `createdAt`.
- Verification: full unit suite and `tsc` green; `project-archive.test.ts` (archive/restore with drafts, owner only, numbering, server rule for stale owner and manager saves). Local CRM: archive → stored on the server without the project in `orders` → «🗄 Архив (1)» → «Восстановить» → back in `orders` on the server, card opens, history shows both events.

## 2026-10-04 handoff — design canvas, step 1: the CRM look for every screen

- Owner request: transfer the canvas «CRM RolanPRO — экраны» (https://claude.ai/artifact/3DmLAsiUJwrsVj6oJzSyPb) to the CRM, desktop and phone. Decision recorded in DECISIONS.md (2026-10-04).
- `src/features/legacy-crm/design-theme.ts` (`DESIGN_THEME_HTML`): fonts and one CSS layer (variables, sidebar, top bar, cards incl. Precision Workbench panels, buttons, inputs, chips, dialogs, phone dock, «Создать» sheet); injected first in `injectedUi` in `app/legacy-crm/route.ts`. Layout untouched; on phones the top-bar «+ Проект» is hidden because the dock's «+» creates.
- Legacy: «ДИЗАЙН CRM: ИКОНКИ И «СОЗДАТЬ»» block (`NAV_ICON_PATHS`, `navIconSvg`, `openCreateSheet`), menu and dock icons, owner/manager dock with «+»; the injected calculator menu item has a stroke icon. Also: the projects list no longer crashes on a project without `createdAt` (same one-line fix as #294).
- Verification: full unit suite and `tsc` green; `design-theme.test.ts`. Local CRM at 1440 px and 375 px: sidebar, top bar, «Сегодня», «Проекты», dock and «Создать» checked with screenshots; no horizontal scroll on the phone.
- Next: the canvas screens one by one — «Сегодня» (desktop mosaic + phone), «Воронка», «Карточка заказа», «Календарь», «Склад», «Деньги», phone order/measure/installer screens.


## 2026-10-04 — Mobile variant 2 implementation (Codex)

Task: implement the owner's selected «Пульс бизнеса» mobile design in `/legacy-crm`. Branch: `codex/pulse-business-mobile`, based on main `df112ca10ad6adc5f81c22b36b094092374d6d87`.

Implemented OWNER/MANAGER numbers-first home, month/week/day periods, paid-project-value chart using existing `orderRevenue`, counts scoped by existing visibility helpers, colored square metric rows, report navigation and expandable operating center. Added real white ROLANPRO logo asset and role-scoped square styling. Phone dock opens overview, existing projects (Продажи), tasks, or the full menu. Phone projects default to card list; advanced period/status/manager/date filters collapse without dropping functionality. Other role shells, persistence and API permissions are unchanged.

Validation: test suite 107 file-level test entries passed; TypeScript passed; production build passed with disposable local DATABASE_URL. Isolated Chromium rendering harness checked dashboard/projects/clients/tasks/reports/settings at 320,390,768,1440 widths; 24 screen/viewport cases, no JS errors or phone horizontal overflow. Week switching and full-menu opening passed. Harness uses disposable local fixture data, blocked external requests, existing mobile adapter/theme and actual renderer; authenticated production end-to-end and real customer data were not exercised. Desktop kanban retains its intentional horizontal scrolling. Screenshots and harness remain in `/tmp/rolanpro-browser`, outside source control. Legacy HTML backup: `/tmp/rolanpro-before-pulse.html`.

Release review complete: #305/#306 are unmerged alternative designs and excluded from this selected variant release; no conflict with main. GitHub CI for PR #307 passed unit/type/build and clean-database/end-to-end gates. The owner instructed continuation; #307 merged as eff1c4f4da5138f04f71290bb9233462f9f56b63. Main CI run 37234977549 completed successfully. Production deployment run 37235156366 completed successfully and confirmed active release eff1c4f4da5138f04f71290bb9233462f9f56b63; the new `/landing/rolanpro-mobile-logo.png` returns HTTP 200. No application/customer-data writes or external messages were performed. Release handoff updates live on `codex/pulse-release-handoff`. Next action: owner reviews the released mobile interface; reconcile alternative design PRs against released main before any later merge. Authenticated customer sessions were not inspected during release verification.


## 2026-10-04 — Project intake hierarchy correction (Codex)

Branch `codex/project-intake-sequence`, based on released main eff1c4f. User: owner, reported unseen design and restated direction → service → building type → measurements → proposal.

Corrected intake section order and progressive gates, removed automatic Smart selection, added concrete offering picker from the existing service directory, rejected inactive/foreign-direction offerings, reset downstream selections on direction changes. Stored offering on new projects; shared the existing window offering assignment so measurement defaults inherit the service and customer rate and proposals retain the existing projection. Added explicit `#/overview` routing and «Пульс бизнеса» owner menu label; square styling covers both shared HTML order-card adapters.

Validation: 108 test-file entries passed, TypeScript passed, production build passed. Chromium exercised the real `replaceLegacyBootstrapLogin` HTML/cloud boot with mocked owner-session/workspace APIs at 390 and 1440 px: pulse dashboard present, direction switching clears downstream values, contact appears after building, create-project opens measurement, offering/rate inherited, zero JS errors/dialog errors/page overflow. All records and endpoints in that harness were disposable fixtures; no real customer data or authenticated production session used.

Design complaint: actual production-session cause remains unconfirmed (user supplied role OWNER but not URL); public production release #307 was successful. Next: release this corrected flow after GitHub checks and ask owner to open the canonical overview link. Existing project records and financial formulas are preserved. Backup `/tmp/rolanpro-before-intake-sequence.html`.

## 2026-10-05 — Calendar, multiple services, owner role testing and desktop filters (Codex)

PR #310, branch `codex/month-services-role-testing`, based on restored main `393fae97d32da8e961ef7c21af44cd5f4620f25d`. Owner requests: mobile month weekdays horizontal; multiple project services and films by category; view all roles to inspect calculations; horizontal period/other filters on desktop.

Implemented explicit seven-column month header/body, protected from mobile adapter stacking. Intake selects additional active offerings grouped by direction, persists all offering ids and directions, defaults each new measurement scope to a matching chosen offering. Film assignment validates the measurement category as well as the offering link. Owner header/menu exposes «Проверка ролей» with owner/manager/measurer/installer cards and active-employee selection; server preview optionally isolates one assigned role while preserving actor binding and read-only restrictions. Preview banner permits switching roles and returning to owner forces a session reload. For an employee with manager plus field roles, the preview response derives their legacy card from the isolated role in memory; directory records and assignments are preserved. Roles without active employees are shown unavailable. Desktop project filters use a horizontal flex row and wrap as needed; phone disclosure remains.

Validation: 109 test-file entries passed, TypeScript and production build passed. Added behavioral checks for deduplication/multiple directions, cross-category rejection despite stale film links, exact-role preview, old cookies, actor binding, inactive/owner/unknown-role rejection, and deriving a field-role card from a manager identity without mutating source data. Chromium cloud-boot fixture harness creates one project with two Smart offerings plus Solar at 390/1440 px, opens measurement and verifies the matching rates ($25 Smart, $12 Solar), with no JS errors or overflow. Chromium additionally verified all four role month headers/cells in seven columns at 320/390/768/1440 px (16 cases, no page overflow), eight role switches and four owner returns, zero JS errors, and all five desktop filters aligned horizontally at 1440 px. Fixtures and intercepted APIs are disposable; authenticated production/customer sessions were not exercised. Backup `/tmp/rolanpro-before-month-services-roles.html`.

Status: local implementation and all verification passed; release pending GitHub CI. No customer-data writes or external messages. Next: publish PR, pass checks, merge and verify the automatic production release; record exact PR/SHA/workflow outcomes.

## 2026-10-05 — New-project contact visibility on short screens (Codex)

Branch `codex/intake-contact-scroll`, based on released main `e6d79e2a4d0720d12080e4613e0469f3ec0c471c`. Owner supplied a desktop photo: contact search and results fall below the visible intake window after direction/service/building selection.

Reproduced the contact section below the viewport at 1366×768 and 1440×600. The existing body could scroll, but selecting the building and expanding search results did not bring the contact into view. Intake now has a definite viewport-bounded height and one scrolling body; its header/footer cannot shrink, and the generic mobile dialog rules cannot convert it to a second outer scroller. Selecting a building reveals the contact step in the body; search expansion positions the search input and first result inside that body. The result list has an explicit bounded scroll area, independent of Tailwind utilities. No project/contact data model, permissions, or calculation formula changes.

Validation: full suite 109 test-file entries, TypeScript and production build passed; relevant intake/contact/inline-script tests passed after the final scroll-target refinement. Isolated Chromium fixture harness checked 1366×768,1440×600,1024×600,390×664,390×440. The first search result is fully visible without a manual page scroll, the last returned result can be selected, and the entire footer stays within the viewport after selection; zero JavaScript errors. Fixture customers and intercepted requests are local only. Backup `/tmp/rolanpro-before-contact-scroll.html`; screenshots/harness `/tmp/rolanpro-browser/contact-*`.

Status: implementation and local checks complete; GitHub PR/CI/release pending. No blocker. Next: publish the dedicated branch/PR, pass required checks, merge and confirm production deployment. Previous task #310 is already released: main CI 37261459889 and deployment 37261634376 succeeded for e6d79e2a4d0720d12080e4613e0469f3ec0c471c; release handoff is on `codex/month-services-roles-release-handoff`.

## 2026-10-05 handoff — a release no longer resets the owner's prices and rates (Claude)

- Found while mapping directions and services: `deploy/watch-production.sh` runs `prisma/seed.ts` on every release, and `seedServiceReferences` upserted with `update:` = the seed values. Every release therefore reset the owner's «Услуги и цены» cards (Smart/Solar/Safety base prices 85/19/24, installer cost 14/4.25/5.60 $/sq ft, add-on prices), complexity multipliers and city fields; `#/service-pricing` then copied those installer costs into the legacy `installerRates.serviceTypes`.
- Fix (branch `claude/seed-keep-owner-settings`): `serviceType` and `serviceAddon` are created once (`update: {}`); `complexityLevel` refreshes only `name_en`/`color_token`; `city` only `name_en`; `filmCatalog` refreshes the technical specification but not the owner-edited names, thickness, unit and order. Test: `src/features/core/seed-owner-settings.test.ts`.
- Note: values already reset by earlier releases are not restored by this change; the owner re-enters them once in «Услуги и цены».

## 2026-10-05 handoff — five directions and services without sizes (Claude)

- Owner request and answers: DECISIONS.md (2026-10-05, «Five directions; services priced per sq ft or without sizes»). Branch `claude/service-directions`.
- Legacy: `privacy_film` across ORDER_PRIMARY_SERVICES, MEASURE_SCOPES (+ measurement hint), palettes, code maps, offering directions, roll categories, consultation parsing; `SERVICE_OFFERING_UNITS`, `serviceOfferingUnit/NeedsSizes/UnitShort/MaterialCost`, `projectOfferingLines`, `projectOfferingLine`, `orderNeedsMeasurements`, `projectOfferingPickerHtml`, `projectAddOfferingLine`; the «Услуги и цены» card has «Как считается» and per-unit price / installer pay / material; windows accept only per-sq-ft services; the project estimate shows directory services as «quantity × price» and «+ Услуга без размеров»; proposals list them line by line. Also fixed `suggestedWorkTypeIds` checking a non-existent `safety_film`.
- Server: `service-solutions.ts` — five directions, units, `materialCostPerUnit` (owner-only, snapshotted as `offeringMaterialCost`), film categories compared canonically (`canonicalFilmCategory`); `order-intake-cleanup.ts` privacy labels; seed adds DECORATIVE_FILM and PRIVACY_FILM service types.
- Verification: `service-units.test.ts` plus updated intake/estimate/measurement tests; full suite 567/567, `tsc` clean. Local CRM: five direction cards in «Новый проект»; a Smart «Подключение зоны» at $100/zone, $50 installer, $12 material; a project with only that service opens without measurement, 3 zones → $300 to the client, $36 material, $150 installer pay, no blockers for the proposal.

## 2026-10-09 — Mobile Rolan PRO agent and live voice (Codex)

Branch `fix/mobile-ai-agent-visibility`, based on `main` `a9bf667` after PR #322. The agent launcher now sits above the phone dock and its dialog uses the full phone viewport with iOS safe-area spacing; desktop layout is preserved. Owner and Manager receive a third agent tab, «Голос», with a live WebRTC conversation, microphone mute/end controls and a readable transcript. Closing the agent ends the voice session and releases the microphone.

The browser never receives the standard OpenAI API key. Authenticated Owner/Manager sessions request a short-lived Realtime client secret from `/api/v1/ai/realtime`; the server keeps `OPENAI_API_KEY`, restricts the model, hashes the internal user id as the safety identifier and supplies a bounded role-aware CRM context. The first voice release can explain and recommend, but cannot claim that it changed CRM records; business writes still require explicit confirmation and an existing protected application action.

Validation: full suite 625/625, focused voice/mobile/HTML tests 40/40, TypeScript and the 121-page production build passed; all inline legacy scripts compile. Production release and authenticated iPhone smoke test are pending PR/CI/merge. Voice additionally requires a funded OpenAI account and `OPENAI_API_KEY` in the protected production environment; absence is reported without exposing a key.

## 2026-10-09 — Production OpenAI voice secret sync (Codex)

- Production exposed the expected `voice_not_configured` message after the mobile voice release because the existing repository-level `OPENAI_API_KEY` was not copied into the canonical production environment file.
- Branch `fix/production-openai-voice-secret-sync` adds a protected deployment step that validates the existing GitHub Secret and sends it only over SSH stdin. The value is never committed, printed, or placed in an SSH command line.
- The server atomically replaces only the `OPENAI_API_KEY` line in `/home/runcloud/.rolanpro-crm.env.production.local` with mode `600`; the normal verified release then copies that environment into the new release before starting Next.js.
- Next action: pass workflow syntax and repository checks, merge through a PR, wait for the automatic production deployment, then confirm that an authenticated voice-session request no longer returns `voice_not_configured`.


## 2026-10-05 handoff — multi-service price corridor, persistent object card, scheduling after accepted Proposal (ChatGPT)

- Branch: `codex/project-services-object-proposal-flow`, based on current `main`.
- Added owner-defined `minPricePerUnit` / `maxPricePerUnit` to service offerings. The directory default remains a navigator; project prices may be changed inside the corridor, while the server rejects out-of-range changes and preserves historical snapshots.
- Added persistent Project `siteInfo`: gate/access code, parking, customer parking, parking instructions, HOA/security/permit restrictions, loading/elevator/service entrance, site contact/phone and notes. The Project card has an «Объект» workspace and Work Order notes include the site summary.
- Refined the operational gate: accepted Proposal is enough to continue production preparation/scheduling; deposit/payment is still tracked but no longer hard-blocks the job. Technical/verified-measurement and production-readiness gates remain.
- Added regression tests for price corridors, site information and accepted-Proposal scheduling.
- CI failure at head `b67e56f` was isolated to four assertions: one stale deposit-gate expectation, one missing Work Order rendering of saved `siteInfo`, and two price-integrity regressions where a manager-submitted unit price replaced the Price Book default even though no corridor was configured. The repair keeps the default locked until the Owner sets a min or max, permits overrides only inside that configured corridor, renders object instructions and on-site contact in the Work Order, and aligns the old scheduling test with the accepted-Proposal rule. Local verification passed: 587/587 tests, TypeScript, 119-page production build and `git diff --check`.
- Released through PR #314: head `ac34295` passed all three PR checks and was squash-merged to `main` as `4f96fdea85f69d890dbb0a2fb221b97c12f98008` on 2026-10-06. Post-merge CI run `37560473010` passed both jobs, including clean-database migrations/no-drift, E2E and browser checks. Production deploy run `37560630225` succeeded and activated that exact SHA.
- Production read-only smoke test passed: login returned the ROLANPRO CRM form with HTTP 200, root redirected to login, protected `/legacy-crm` refused an unauthenticated session, `/api/v1/auth/me` returned the expected 401 JSON, and the web manifest returned HTTP 200. No customer data was written. Next: monitor normal use; continue dynamic Proposal blocks/payment presentation and solar recommendation without inventing Smart hardware packages.

## 2026-10-07 handoff — Project as a service container, packages and linear-foot services (Codex)

- Branch `codex/project-service-container-packages`, based on `main` `70b8798` after PR #316. The supplied patch was reviewed and adapted to current main rather than applied verbatim.
- New Project intake selects active services across all directions, keeps the first selection for lead attribution and opens the Project card without forcing measurement. Existing Project, Price Book corridor, site information, accepted-Proposal scheduling and Work Order behavior remain intact.
- Added `lft` quantities from actual pane perimeters and one-level size-free package components as separate `$0` operational lines with their own schedule, crew, installer pay and material. Server rules restore an included line if a client tries to delete or repoint it independently, and convert it back to ordinary corridor/default pricing when its parent leaves the Project.
- The package editor updates in place, preserving the PR #316 reference-directory no-jump fix. Calendar styling remains the unified PR #316 design. No services or Smart hardware packages are seeded.
- Verification on the completed local diff: 600/600 unit tests, TypeScript and the 119-page production build pass. PR #317 head `057b97b` passed `Test, typecheck, and build`, the clean-database migration/no-drift/E2E/browser gate and `respond` in workflow runs `37671446877` / `37671447109`. Production has not been changed; merge/deploy require the owner's explicit confirmation.

## 2026-10-08 handoff — one list of project lines; proposal add-ons from the directory (Claude)

- Branch `claude/project-lines`, based on `main` `2dac72f` (after PR #317). Owner request and rules: DECISIONS.md (2026-10-08).
- Legacy `private/legacy/rolanpro-crm-cloud.html`: `projectLines`, `projectLineNote`, `projectLineQtyText`, `projectLineCrewText`, `projectLinesTableHtml`, `projectLineScopeRows`, `projectPlural` (after `projectServiceCrew`); «Услуги проекта» tile in `renderOrderCleanDetails`; work order / tech sheet / production prep use `projectLineScopeRows` (old `projectOfferingScopeRows` removed); work-document gates use `projectLines`. Proposal: `LEGACY_PROPOSAL_EXTRAS` (was `PREMIUM_EXTRA_SERVICES`) not seeded or offered, `premiumToggleService` only removes, panel only when an old add-on is selected. `removalPricePerSqft()` + `updateRemovalPrice` in «Услуги и цены».
- Server: `service-solutions.ts` — only the owner changes `settings.removalPricePerSqft`; it must be a positive number.
- Verification: new `project-lines.test.ts` (lines, sums equal `orderRevenue` and reference pay, role-based table, card tile, proposal add-ons, removal price); updated `service-units.test.ts`. Legacy suite 351/351, `npm test` 606/606, TypeScript clean. Local browser check (port 3124, local test DB): a project with a per-sq-ft service on 2 windows, a zone service and an included silicone shows 3 lines, total $762 = revenue; the work order lists all three with specialist/date and no prices; the phone layout shows each line as a card.
- Next: Codex review + CI; then the client-selectable optional services on the public proposal page with sync back into the project (needs a server→project path), and the public page deposit following unticked lines.
## 2026-10-09 handoff — voice runtime reloads protected secrets on every server start

- Production symptom: the mobile voice UI was deployed, but `/api/v1/ai/realtime` still returned `voice_not_configured` even after the protected `OPENAI_API_KEY` had been synced to the canonical server environment.
- Root cause: `deploy/watch-production.sh` loaded the canonical environment while building a release, but `start_next()` could start an already-built release from the long-running watcher's stale process environment. Secret rotation therefore did not reliably reach Next.js.
- Fix: `start_next()` now sources `/home/runcloud/.rolanpro-crm.env.production.local` immediately before every `next start`. No secret value is logged, committed, passed in argv, or exposed to the browser.
- Regression coverage: `src/features/core/runtime-secrets-deploy.test.ts` asserts that the canonical protected environment is loaded before the server process starts.
- Verification: shell syntax clean; focused regression 1/1; full suite 626/626; TypeScript clean after the production build; production build successful.
- Branch: `fix/runtime-secret-refresh`. Next action: open PR, merge after green CI, then confirm the production realtime route no longer reports `voice_not_configured`.




## 2026-10-09 handoff — project card as one working screen (Claude)

- Branch `claude/project-card`, based on `main` `0e05479` (after PR #319). Owner rule: DECISIONS.md (2026-10-09).
- Legacy html: «КАРТОЧКА ПРОЕКТА: УСЛУГИ НА ОДНОМ ЭКРАНЕ» block before `projectLineScopeRows` — `renderProjectCardServices`, `renderProjectCardSchedule`, `projectPendingSizedServices`, `projectServicePriceRange`, card handlers (`projectCardAddService`/`SetQty`/`QtyFromWindows`/`DeleteService`/`RemovePending`/`SetPrice`/`ToggleCrew`/`SetDate`/`ConfirmInstallation`), `projectCardSchedule`, `projectCardSyncCrew`, `projectCardEditing` (read by `refreshProjectEstimateWorkspace`). `projectOfferingPickerHtml(o, handler)`. `renderOrderCleanDetails` renders the section after the stage block; the «Услуги проекта» tile from #319 is removed. CSS `.project-card-*`.
- Server `service-solutions.ts`: partial `serviceSchedules` entries allowed (empty date or crew); entering `installation_scheduled` requires every entry complete; derived `installationAt` ignores empty dates.
- Verification: new `project-card.test.ts` (7 tests: pricing vs production rows, schedule, crew materialisation, quick-line crew, price ranges, card edits reuse estimate edits, server rules); `npm test` 622/622; TypeScript clean. Local browser (test DB): quantity edit 3 → 4 zones updates $300 → $400 in the card without opening the estimate; at «КП принято» a specialist and a date chosen in the row are saved through the server (partial first), the schedule lists them, the other rows are highlighted.
- Next: Codex review + CI; owner's «да» before deploy.

## 2026-10-09 handoff — project intake follows the real lifecycle (Codex)

- Branch `codex/project-intake-lifecycle-1009`, based on `main` `cdbbfb4` after PR #321.
- «Новый проект» now follows one ordered flow: client/contact → object and site type → exact services → responsible manager. The first selected service remains the immutable incoming lead intent; additional services stay inside the same Project.
- Each selected per-sq-ft service may store its own warehouse material/model at intake. The choice is optional until measurement, but the server rejects unknown films, films from another service and direction mismatches. The Project card shows either the chosen model or «материал уточнить на замере».
- Measurement is scoped to the exact services selected in the Project. When several sized services share a direction, the surveyor/manager explicitly switches between them; completion requires measurements for every selected sized service. Historical projects without explicit service selections keep the old fallback and remain editable.
- Installation is still scheduled only after accepted Proposal/production preparation and separately for every service row; intake does not ask for installers and Proposal readiness is not blocked by scheduling.
- Validation: focused lifecycle/service/card/estimate suite 80/80, service-unit compatibility 21/21, full suite 647/647, inline CRM scripts compile. On this local Mac both standalone `tsc` and `next build` stalled without diagnostics or CPU load and were stopped; required GitHub CI remains the authoritative typecheck/build gate before merge. Production has not been changed.

## 2026-10-10 handoff — a project's next step follows its services (Claude)

- Branch `claude/project-stages`, based on `main` `83ffe79` (after Codex PR #328). Owner decision: DECISIONS.md (2026-10-10); market review artifact https://claude.ai/artifact/Q2iMamFEYqQDFcJJVyyj57.
- Legacy html: `projectHasServices`, `projectMeasurementSettled`, `PROJECT_PRE_PROPOSAL_STATUSES`, `projectServicesNextAction` (used first by `orderPrimaryNextAction`); `renderOrderCleanProgress` marks skipped consultation/measurement (`.order-clean-progress-step.skipped`); `projectKanbanNextStatus` (kanban advance and card label); `measureStudioScopeButtons(scopeKey, order)` limits «Полевой замер» to the project's directions.
- Verification: new `project-stages.test.ts` (4 tests); `npm test` green; local browser: a new project with only «Подключение зоны» shows «Рассчитать проект — Замер не нужен», consultation and measurement «не нужен», current step КП.
- Next: Codex review + CI; owner's «да» before deploy. Then the ERP core (Project → Services → Visits → Measurement → Work log) together with the CRM core consolidation.

## 2026-10-10 hotfix — service plans compared independent of key order (Claude)

- Branch `claude/fix-plan-compare` from `main` `d148329`. PostgreSQL stores the legacy workspace as jsonb and reorders object keys, so a plan built in the browser and the saved copy differed as plain JSON text. `prepareServiceSolutions` treated an unchanged plan as changed: after a plan was made in one tab, a later save of the closed project (act, payment) in the same tab was refused with «Проект закрыт: исполнителей и даты услуг не меняют.». `stableJson` (sorted keys) now drives the schedule comparisons.
- Verification: new server test; `npm test` green; `tsc` clean. Found while verifying service progress on the local test copy (a 400 on save).

## 2026-10-10 handoff — per-service progress (Claude)

- Branch `claude/service-progress`, based on `main` `d148329` (after #330); includes the same `stableJson` comparison as hotfix #331. Owner decision: DECISIONS.md (2026-10-10, «Each service of a project has its own progress»).
- Legacy html: «ХОД РАБОТ ПО УСЛУГАМ» block — `projectServiceProgress`, `projectCanMarkService`, `projectWriteServiceProgress`, `projectSyncStatusFromServices`, `projectSetServiceProgress`, `projectMarkMyServicesDone`, `projectFinishOpenServices`, `projectServiceProgressCell`, `renderInstallerServiceProgress`; «Ход работ» column in `renderProjectCardServices`; «Мои услуги» on `renderInstallerTechnicalWorkspace`; installer «Мои услуги выполнены» in `installerOrderPrimaryAction`; `changeStatus` finishes open services when an installation is closed by hand; `projectPrunePlans` prunes progress; timeline labels.
- Server: `service-solutions.ts` validates `serviceProgress`; `field-workspace.ts` lets a field specialist change only their own services' progress (`serviceCrew`, `mergeFieldServiceProgress`).
- Verification: new `service-progress.test.ts` (8 tests); `npm test` 662/662; `tsc` clean. Local browser (test DB): reopening a service moved the project to «Монтаж в работе»; marking all services done closed it with the last service's date; a closed-project save in the same tab after an in-session plan was accepted (jsonb key order).
- Next: Codex review + CI; owner's «да». Then pay per service.

## 2026-10-11 handoff — Project card «Операционный штаб» (Codex)

- Branch `codex/project-card-command-center`, based on `main` `84f67d4` after PR #335. The owner approved the recommended «Операционный штаб» visual before implementation.
- The Project card keeps one authoritative project and one `projectLines` list. Services remain the main inline work area; no duplicate order, financial formula, schedule or workflow was introduced.
- Added a compact project navigator that opens the existing focused workspaces for client, object, measurement, estimate/Proposal, calendar, finance and files without leaving the card.
- Added a responsive command-center sidebar: role-safe project economics, grouped upcoming service visits, and readiness counts for measurement, assignment and per-service completion. The schedule and sidebar share the same `projectCardVisits` grouping.
- Desktop uses a services-plus-summary layout; tablet stacks the command center and keeps two summary columns; phone uses one column and the existing full-width workspace dialogs.
- Verification: focused Project/workspace/client tests 41/41; full suite 693/693; all inline CRM scripts compile as part of the suite; `git diff --check` clean. Standalone TypeScript/build on this local Mac again stalled without diagnostics or CPU load and must be confirmed by the required GitHub CI gate. Production has not been changed; deployment still requires the owner's explicit confirmation after CI is green.

## 2026-10-11 handoff — full Project card interface (Codex)

- Branch `codex/project-card-full-interface`, continued from the approved command-center work after the owner correctly reported that production still looked like the old Project card with extra blocks attached.
- Replaced the visible old passport, standalone «Следующий правильный шаг» block and «Все разделы проекта» tile mosaic with the approved «Операционный штаб» hierarchy: compact Project header and lifecycle, section rail, service ledger, selected-service inspector, role-safe economics, upcoming per-service visits and recent chronology.
- The authoritative data and business logic did not move: one Project, one `projectLines` list, existing measurement/Proposal/schedule/finance/history workspaces and existing pricing/payroll/warehouse formulas. The old workspace tiles remain hidden templates only, so the new tabs open the established forms without duplicating records or calculations.
- A service row is selectable and exposes its own quantity/measurement, price corridor, crew, date and progress. Mobile collapses each service to a readable card, stacks the inspector/economics, and keeps the primary action above the bottom navigation.
- Focused Project/card/progress/workspace tests pass 54/54. Full suite and required GitHub CI remain before release. Production has not been changed; deployment still requires the owner's explicit confirmation after CI is green.

## 2026-10-17 handoff — estimate lines form the canonical Proposal (Codex)

- Branch `codex/project-estimate-proposal-v2`, based on current `origin/main`.
- The calculation workspace now begins with «Позиции проекта → единое КП», using the existing `projectLines` model. It shows service/material/quantity/client price and, only to the Owner, material cost, installer reserve and direct line margin; shared expenses remain below and reduce final Project profit.
- Estimate approval stores `schemaVersion: 2`, line-level scope/measurements/materials/prices, payment terms and role-safe economics through `projectEstimateApprovalSnapshot`. Historical quick-import closure uses the same snapshot builder.
- `premiumCanonicalSnapshot` now builds canonical Proposal items through `projectProposalItemsFromEstimate`: measured windows are grouped by service with window-level technical JSON, quantity/included services remain independent lines, and zero-price included scope is never charged by residual total allocation.
- After rebasing onto `origin/main` `0f1a8291` (including per-service production stages), focused estimate/project-line regression tests pass 85/85 and the full suite passes 720/720. Local `tsc --noEmit` again stalled without diagnostics or CPU progress and was stopped; the required GitHub CI remains the authoritative type/build gate. Production has not been changed; release requires the Owner's separate explicit confirmation.

## 2026-10-18 handoff — multi-direction Project card and scoped plan/fact expenses (Codex)

- Branch `codex/project-multi-service-20261018`, based on `origin/main` `0f1a829`; includes the reviewed estimate→Proposal work from PR #343 (`2875091` after cherry-pick).
- The active Project card now groups the authoritative `projectLines` into Solar, Smart, Safety, Decorative and Privacy direction cards. One Project can show several directions at once; each service keeps its own quantity/measurement, client price, note, production stages, crew, date and progress.
- Services can be added inside their direction and reordered with ↑/↓. A per-sq-ft service remains pending until a measurement is linked; it does not force a redirect. Quantity/zone/fixed services remain calculable without measurement.
- Direct expenses now have category, planned amount, actual amount and scope: Project, direction or service. Only one amount is counted at a time (`actual` when entered, otherwise `planned`), avoiding plan/fact double counting while keeping both values visible.
- Context recommendations cover Smart zones/power/electrician, Safety/outside attachment/silicone and missing measurements. They only use active Price Book services and require explicit Add/Open or Dismiss; no automatic service or charge is created.
- The Project calculation and Proposal use the same ordered service list and approved versioned snapshot. Customer Proposal data does not include material cost, specialist pay or direct expenses.
- Verification: focused Project/production suite 53/53; full suite 724/724; `tsc --noEmit` clean; production build successful (121 pages). Production is unchanged; merge/deploy still require the Owner's explicit confirmation.

## 2026-10-25 handoff — Smart room plan reuses the project cashier (Codex)

- Branch `codex/smart-cashier-room-logic`, based on `main` `20bbcf9`.
- Smart measurement is now compact: each measured window/panel contributes area and one or more physical zones, while the room owns one shared block, its automatically recommended capacity, the control mode and optional electrician details.
- The two room control modes are explicit: all room windows together, or independent multi-zone control. Technical summaries and work-order diagrams now describe one block per Smart room instead of one block per window.
- Smart technical quantities are synchronized into the existing cashier/project lines. Existing matching manual lines are adopted, unrelated manual services are preserved, and repeated synchronization is idempotent. Prices are always read from the Owner's current Services/Price Book directory; no fallback price is hardcoded.
- Proposal readiness reports exactly which Smart cashier service or price is missing. Silicone and other optional additions remain ordinary manual cashier rows.
- Verification: focused Smart/measurement/integrity/cashier/estimate suite 77/77; main inline script syntax clean; `git diff --check` clean. A full run reached 859 passing tests and no assertion failures; two unrelated long-running infrastructure files were cancelled after pending Promises did not settle. Standalone `tsc --noEmit` and `next build` again stalled locally without diagnostics or CPU progress and were stopped, so required GitHub CI remains the authoritative type/build gate. Production is unchanged and still requires Owner approval after CI.

## 2026-10-26 handoff — Service price architecture separates sales from cost (Codex)

- Branch `codex/service-price-architecture`, based on `origin/main` `a4e34a2`.
- The Owner service editor now separates the customer-facing list price and manager corridor from internal material/equipment cost and installer pay. Price fields are saved together instead of one by one, while the existing authoritative `serviceOfferings` fields remain unchanged.
- A live unit-economics summary shows direct cost, gross profit, margin and profit at the manager floor. For measured film, the screen clearly treats warehouse film as project-level actual cost and does not pretend the directory contains it.
- Browser and server validations reject a list price outside the manager corridor and reject a size-free service floor below known material plus installer cost. Unchanged historical rows remain readable until their pricing is edited.
- Responsive styling stacks pricing, cost and metrics cleanly on phones. Owner-only fields continue to be redacted from managers by the existing server view.
- PR: #413 (`https://github.com/zufarataev-code/Rolan-PRO-CRM/pull/413`). The first clean-database CI run exposed an outdated browser-test assumption that price changes auto-save on blur. The test now uses the explicit «Сохранить цены и затраты» action and verifies the server-persisted price.
- Verification: focused pricing/service tests 82/82; full suite 896/896; the exact clean-database browser scenario passes at 390 px and 1440 px; `npm run typecheck` clean; production build successful (129 pages); `git diff --check` clean. Production is unchanged; next action is a green rerun of PR #413 CI. Merge/deploy remains a separate Owner decision.

## 2026-10-26 handoff — Manager installation assignment carries field warnings into the work order (Codex)

- Branch `codex/manager-installation-warnings-20261026`, based on `origin/main` `ab83968` after PR #413.
- Removed the duplicated Solar technical gate from production readiness, status transition, the Project-card confirmation and the legacy fallback scheduler. Managers can now plan each service after the existing commercial, measurement-verification and production checks.
- Missing Solar glass type, facade orientation, installation side and access/height remain visible as an orange warning in the assignment window and as a mandatory warning block in the work order. Every affected opening prints the known value or `НЕ УКАЗАНО`.
- Smart zone mismatch and power loads requiring engineering remain blocking issues. The surveyor still cannot submit an on-site measurement while its technical fields are incomplete.
- Focused installation/estimate/card tests pass 83/83; full suite passes 897/897; `npm run typecheck` is clean; production build succeeds with 129 routes; `git diff --check` is clean. Production is unchanged; deployment requires the Owner's separate explicit confirmation.

## 2026-10-26 handoff — Installation planning is saved before production publication (Codex)

- Branch `codex/fix-install-assignment-20261026`, based on `origin/main` `160ee5e`.
- After an accepted Proposal, the Project card now opens the per-service installation planner immediately. The manager can save each service's crew, start and end time even when exact field facts or production preparation remain incomplete.
- A saved plan stays an internal draft. The CRM shows every readiness issue and keeps the dates and crew, while the existing strict production, measurement and Smart engineering checks still block publication to the calendar and the `installation_scheduled` status.
- The main next action first offers «Запланировать монтаж». Once at least one service has a plan, it points to production preparation and then returns to final publication.
- Verified locally in the browser at desktop and 390 px: an accepted Project with an unverified opening and no prepared film saved an installer and date, displayed the service as assigned and recorded `service_planned` without falsely publishing the installation.
- Verification: focused tests 75/75; full suite 907/907; `npm run typecheck` clean; production build successful with 129 routes; `git diff --check` clean. Production is unchanged; release still requires the Owner's separate explicit confirmation.

## 2026-10-28 handoff — Service material selection persists and becomes the project default (Codex)

- Branch `codex/fix-service-material-persistence-20261028`, based on `origin/main` `2e8eec0`.
- The Owner service editor now saves linked films through the normal server persistence path and displays an explicit saving/saved/error state instead of silently updating only the current browser view.
- Every service may have one default linked film. The first linked film becomes the default automatically; when several films are linked, the Owner can choose the default explicitly. Historical services with exactly one active linked film receive the same default behavior without a data migration.
- Adding that service to a new Project automatically fills its saved default film. The manager can still open the completed material step and override the film for the particular Project; the service directory is not modified by that override.
- The server rejects a default film that is not linked to the service or belongs to another direction, preventing invalid directory states.
- Verification: focused material/cashier/directory tests 52/52; full suite 920/920; `npm run typecheck` clean; production build successful with 129 routes; `git diff --check` clean. Production is unchanged; release requires the Owner's separate explicit confirmation.

## 2026-11-03 — Historical completed-Project intake (local implementation)

- Continued from the November quick-entry prototype but removed its one-service immediate-close behavior. The sidebar now creates only a client/object/responsibility draft and opens the established multi-service historical Project editor.
- The draft stores the assigned manager and surveyor. Active Owners are valid surveyors, so Zуфар can be recorded as the field measurer without duplicating his employee account.
- The canonical editor remains the source for multiple service rows, per-service materials, sqft, customer totals, dates, installers and supplies, plus shared direct expenses. Rinat and Nurik are not hard-coded; they will appear when their active installer employee cards and payroll schemes exist.
- Owner closure now records the actual paid amount. Full payment closes the Project; partial/no payment records the completed work at `act_signed` and leaves the debt in receivables.
- No new Project, payroll, warehouse, customer-notification or calculation pipeline was introduced. Local verification is still required before any PR or production release; production is unchanged.

## 2026-11-03 — Privacy Film restored as the fifth direction (local implementation)

- Owner explicitly restored **Privacy Film** as a separate customer-facing direction. This supersedes the 2026-10-26 four-direction grouping without rewriting historical data.
- The shared direction source now contains Smart, Solar, Protective, Decorative and Privacy. Privacy has its own colour, project/cashier tile, Services/Price Book workspace, measurement scope, material boundary, estimate grouping, Proposal code and Google Ads project-cost classification.
- New Privacy services link only Privacy catalog films; Decorative services no longer receive Privacy films. A saved Decorative-to-Privacy link from the temporary four-direction period remains valid only unchanged so ordinary workspace writes do not break old projects.
- Historical payroll follows each imported service date for per-sq-ft specialists, while a fixed-per-job installer receives exactly one project accrual on the last completed service date. Packaged services are materialized with the parent's date and crew before closure.
- Final local verification after review hardening: full suite 1056/1056, `pnpm typecheck`, production build with 134 routes and `git diff --check` pass. A new historical import can be created only as an unpaid draft; neither the initial workspace write nor a later manager save can forge client payment, employee payout, closure or server-owned warehouse cost. A manager can create and edit only a historical draft assigned to one of their authenticated CRM identities; unchanged rows assigned to colleagues still round-trip safely. Once an import is closed, its protected markers cannot be changed to reopen or hide it, its financial/service/production facts are immutable to managers, and only the owner has an explicit correction path; ordinary projects cannot be relabelled as imports. Draft imports are excluded from every installer and surveyor task, route, analytics and payroll screen, as well as manager workbenches, the calendar scheduler and agent insights. All historical imports, including completed records, are excluded from automatic customer follow-up SMS and email. Historical services priced by piece, zone, custom unit or fixed sum share the same service/date/crew/supply editor as film rows, and their supply cost enters project economics. Repeated packaged services keep separate components; changing the parent service removes the old package component before adding the new package. Every included job has its own real unit quantity (for example lin ft of silicone is never copied from sqft of film), while its date and crew follow the exact parent service. The minimum and road for every actual historical visit now accrue in that visit's payroll period instead of being moved to the project's latest service; long services retain every day instead of truncating after fourteen visits. A surveyor's fixed-per-job payroll uses the explicitly recorded historical survey date instead of the first installation date. Depleted-roll cost evidence is available only to historical imports and can no longer give current unpriced stock a false margin. Privacy Proposal lines use their specific English direction name. Old Decorative → Privacy directory links remain removable for compatibility, but cannot become a default or new project selection; only the exact material already saved on an old project remains readable. The Owner explicitly authorized publication; PR/CI review and protected production deployment remain the release gates.
