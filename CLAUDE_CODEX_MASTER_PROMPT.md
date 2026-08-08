# Master prompt для Claude Code / Codex

Ты работаешь над локальной CRM/ERP-системой `ROLANPRO SYSTEM` для компании по установке window film в California.

## Главная цель

Доработать существующее модульное приложение до цельной CRM/ERP с desktop-кабинетами Owner/Manager и обязательными мобильными приложениями Consultant/Installer. Сначала вся логика создается, тестируется и утверждается на локальном компьютере. Публикация на сервер запрещена до отдельного подтверждения владельца.

## Текущая основа

- Рабочий проект: текущая папка `Rolan-PRO CRM`.
- Stack: Next.js 15, React 19, TypeScript, Prisma, PostgreSQL.
- Текущая база уже содержит реальные локальные тестовые данные.
- Не запускай seed поверх существующей базы.
- Перед любым изменением схемы делай резервную копию и сначала показывай database diff.
- В базе нет корректной истории Prisma migrations, поэтому не запускай все существующие migrations подряд. Используй безопасный schema diff и согласованную baseline-стратегию.
- Legacy reference: `legacy-sources/rolanpro-crm_3-source.html`. Это только источник функций и UX-идей, не runtime и не новая основа.
- Визуальные идеи premium proposal можно брать из `rolanpro-crm_6.html`, если файл доступен, но нельзя терять функциональную логику `_3`.
- Прочитай `CRM_AUDIT_AND_ROADMAP_2026-07-19.md` перед началом работы.

## Жесткие ограничения

1. Работай только локально.
2. Не деплой на сервер.
3. Не отправляй реальные email, SMS, WhatsApp, push или review requests.
4. Не создавай live Stripe платежи и не используй production keys.
5. Не удаляй существующие данные.
6. Не переписывай всю систему с нуля.
7. Делай небольшие проверяемые этапы.
8. После каждого этапа запускай production build и необходимые проверки.
9. Все расчеты денег выполняются backend-сервисами, не frontend-компонентами.
10. Все действия, меняющие бизнес-состояние, должны попадать в activity log.

## Роли и финансовая безопасность

### Owner

- полный доступ к выручке, material/labor costs, variable expenses, fixed expenses, payroll, commissions, taxes, gross profit, net profit и margin;
- справочники, настройки, finance, warehouse и payroll;
- просмотр manager workflow.

### Manager

- лиды, сделки, клиенты, задачи, follow-ups, консультации, proposal, scheduling и проекты;
- может вносить разрешенные фактические расходы проекта по утвержденным категориям и прикладывать receipt;
- видит клиентскую сумму, payment status и sales KPIs;
- не видит material cost, labor rate, installer payout, vendor cost, variable-cost breakdown, tax reserve, company overhead, gross profit или net profit;
- API тоже не должен передавать скрытые поля менеджеру.

### Consultant / Surveyor

- только назначенные консультации;
- данные клиента, адрес, manager notes, комнаты, окна, размеры, рисунки, фото, рекомендации и survey checklist;
- не видит finance, payroll и чужие consultations.

### Installer

- только назначенные jobs;
- адрес, контакт клиента, scope, materials-to-bring, schedule, checklist, photos и status actions;
- не видит client pricing, себестоимость, rates, margin, profit, payroll rules, commissions, tax и внутренние расходы;
- payout amount можно показывать только в отдельном earnings screen после утвержденного business rule.

RBAC должен проверяться сервером и API, а не только скрытием элементов интерфейса.

## Целевая воронка продаж

Не показывай 21 длинную колонку. На manager kanban должны быть 8 понятных основных этапов:

1. Новые.
2. Квалификация.
3. Консультация / Замер.
4. КП.
5. Решение клиента.
6. Депозит / Планирование.
7. Монтаж.
8. Закрытие / Aftercare.

Детальные состояния остаются substatus. Нужны drag-and-drop, фильтры, поиск, manager/source/date/attention filters и счетчики.

Для каждой активной сделки обязательны:

- `next_action_type`;
- `next_action_at`;
- `responsible_user_id`;
- `priority`;
- `last_contact_at`;
- `waiting_since`;
- причина проигрыша при lost.

Запрети «мертвые» сделки без следующего шага. При переводе в waiting CRM автоматически создает follow-up sequence и показывает менеджеру ежедневную очередь действий.

Основные источники: Facebook, Instagram, Google. Храни source, campaign, ad/adset, UTM, referral и manual source. Дай Owner/Manager аналитику lead → consultation → proposal → won, cost per lead и revenue by source, но marketing spend доступен только в пределах утвержденных прав.

## Центр задач

Реализуй полноценный Tasks Center:

- задача может быть связана с lead, deal, consultation, proposal, project, installation или client;
- title, description, assignee, creator, due_at, priority, status, checklist, reminder, recurrence и attachments;
- представления Today, Overdue, Upcoming, My Tasks, Team, By Project;
- задачи видны в timeline сущности;
- автоматические задачи создаются событиями воронки;
- переход сделки может требовать закрытия обязательных задач;
- уведомления о просрочке не должны дублироваться бесконечно.

## Survey UX

Сценарий: комната → окно → форма → ширина/высота → количество → glass type → orientation → access → complexity → drawing → photos → recommendation.

Обязательные UX-правила:

- ни один ввод, onChange, add row, autosave или server refresh не прокручивает страницу наверх;
- сохраняй focus и scroll position;
- autosave draft с индикатором Saved / Saving / Offline;
- быстрый duplicate window;
- copy room;
- последовательная нумерация окон;
- расчет sqft на backend и preview на frontend;
- чертеж хранится как structured JSON/SVG data, а не только raster image;
- фото привязываются к конкретному окну или комнате;
- offline draft и sync queue для мобильного приложения;
- конфликты синхронизации не должны молча перезаписывать данные.

## Premium Proposal по умолчанию

Убери идею отдельных равнозначных кнопок «КП», «КП с чертежами», «AI КП». Должно быть одно основное действие: `Создать / открыть Premium Proposal`.

Premium Proposal должен включать:

- Rolan Pro branding и company details;
- данные клиента и объекта;
- summary проблемы и рекомендованного решения;
- чертеж каждого окна с размерами;
- группировку по room/zone;
- film brand/model/specifications;
- package choices Standard / Premium / Ultimate или Good / Better / Best;
- recommended package;
- required и optional items;
- before/after или product visuals;
- subtotal, discounts, taxes/fees where legally applicable, selected total;
- validity date;
- warranty;
- timeline;
- client comments;
- version number;
- electronic signature;
- Stripe deposit/payment link;
- link tracking and timeline events.

После отправки:

- stage = proposal_sent;
- next action создается автоматически;
- если клиент не ответил, CRM запускает configured cadence;
- cadence может создать SMS/email/call task, но в локальном режиме только preview/log, без реальной отправки;
- клиент может выбрать optional items и запросить изменение;
- любые изменения создают новую version;
- подписанная version и total блокируются;
- после approve → agreement → deposit → scheduling.

AI внутри proposal — помощник, а не источник цены. AI может:

- улучшить английский текст;
- сформировать executive summary;
- объяснить выгоды выбранной пленки;
- подготовить ответы на objections;
- предложить релевантный upsell из утвержденного каталога.

AI не может менять sqft, rates, tax, discount, cost, margin или final total без подтвержденных backend rules.

## Installation workflow в стиле Uber

Состояния:

1. Scheduled.
2. Accepted by installer.
3. On the way.
4. Arrived.
5. Pre-install inspection.
6. Work started.
7. Paused / issue.
8. Work completed by crew.
9. Customer acceptance pending.
10. Accepted / issue reported.
11. Final payment pending.
12. Closed.

При назначении клиент и монтажники получают notification preview. В production позже подключаются реальные каналы.

Installer mobile app должен требовать:

- принять job;
- подтвердить выезд;
- зафиксировать прибытие;
- пройти pre-install inspection;
- отметить существующие defects и добавить фото;
- если defects не найдены — подтвердить это явным checkbox;
- принять условия ответственности;
- загрузить before photos;
- выполнить service checklist;
- загрузить after photos;
- отметить используемые материалы;
- завершить работу;
- передать телефон клиенту или отправить secure link для подписи completion act.

Payout lock:

- payout не становится releasable, пока нет required checklist, before/after photos, completion form и customer acceptance;
- issue/dispute переводит payout в hold и создает owner/manager task;
- вся логика выполняется backend-сервисом.

После acceptance:

- final payment request preview;
- review request preview;
- релевантный after-sale offer: extended warranty, exterior protective film, UV protection/maintenance plan или другой утвержденный product catalog item;
- не отправлять реальные сообщения в локальном режиме.

## Project expenses, margin и налоги

Создай project expense register с категориями:

- film/materials;
- installer labor;
- fuel/mileage;
- delivery/shipping;
- electrical work;
- lift/equipment rental;
- subcontractor;
- consumables;
- Stripe/payment fee;
- sales commission;
- permit/parking;
- other approved expense.

Поля: project, position optional, category, amount, vendor, date, receipt, entered_by, approved_by, visibility_scope, notes.

Owner margin waterfall:

`Revenue - discounts - refunds - material - labor - project variable expenses - payment fees - allocated overhead - configured tax reserve = estimated net profit`.

Не зашивай ставки California C-Corp в код. Сделай настраиваемые tax profiles, effective dates, calculation notes и обязательный флаг `accountant_approved`. До утверждения CPA показывай estimate/disclaimer.

## Warehouse

Нужны:

- film rolls/batches;
- width, length, remaining length, unit cost и location;
- reservation по project/position;
- cutting plan;
- waste/offcut;
- consume/return/adjustment movements;
- shortage alerts;
- transfer actual material cost в project finance;
- audit trail.

При создании проекта рекомендуй расходники со склада, но списывай только через подтвержденное движение.

## Academy

Восстанови и развивай Academy как модуль:

- courses, lessons, video/docs, quizzes;
- role track Consultant / Installer / Manager;
- progress и attempts;
- certifications с expiration;
- training assignment;
- допуск монтажника к определенным service types зависит от active certification;
- Owner управляет контентом и требованиями.

## Mobile architecture

Сначала реализуй и утверди mobile-first field flows локально. Затем подготовь структуру Expo React Native для iOS/Android на том же backend API.

Рекомендуемая эволюция без переписывания:

- текущий Next.js app остается desktop CRM и API;
- общие domain types и API client выносятся в shared packages;
- `apps/mobile-field` на Expo React Native обслуживает Consultant и Installer с role-based navigation;
- secure local storage, offline queue, camera, push-ready notification layer;
- background location только в состоянии `on_the_way`, только с разрешением пользователя и с четкой privacy policy;
- клиент видит ETA/status через secure public tracking page, а не полный внутренний job.

## UX и качество

- русский язык для внутренних кабинетов;
- английский для client proposal/agreement/messages с возможностью bilingual preview;
- mobile navigation — bottom tabs и compact header, не desktop sidebar высотой в экран;
- никаких огромных горизонтальных таблиц на телефоне;
- empty/loading/error/offline states;
- confirmation для опасных действий;
- optimistic UI только с rollback;
- idempotency для create/send/pay/status actions;
- audit log;
- rate limiting public endpoints;
- secure token expiration;
- file type/size validation;
- accessibility labels и keyboard support.

## Порядок выполнения

### Phase 1 — Sales Control Foundation

1. Зафиксируй текущий baseline и проверки.
2. Упрости pipeline до 8 macro stages + substatus.
3. Сделай working filters и drag-and-drop.
4. Сделай обязательный next action.
5. Создай полноценный Tasks Center.
6. Добавь configurable follow-up sequences.
7. Проверь server-side RBAC и финансовую видимость.
8. Сделай manager desktop и consultant/installer mobile shells адаптивными.

### Phase 2 — Survey + Proposal

1. Mobile-first survey и offline draft.
2. Устранение scroll/focus reset на всех мутациях.
3. Premium proposal с чертежами.
4. Packages, optional items и upsell.
5. Version locking, agreement и test-mode Stripe link.

### Phase 3 — Installation Runtime

1. Полная state machine.
2. Notifications preview/outbox.
3. Inspection, photos и checklist.
4. Customer completion signature.
5. Payout lock.
6. Review и after-sale workflow.

### Phase 4 — Finance / Warehouse / Payroll

1. Project expense register.
2. Owner margin waterfall.
3. Warehouse reservation/consumption/cutting/waste.
4. Payroll release/hold/paid.
5. Configurable overhead and tax profiles.

### Phase 5 — Academy + Native Apps

1. Academy and certifications.
2. Expo mobile-field app.
3. Offline sync hardening.
4. Push/location preparation.
5. Только после локального acceptance подготовь deployment plan; не выполняй deployment без прямого разрешения.

## Definition of Done для каждого изменения

- business rule описано;
- server-side authorization проверена;
- DB change имеет diff и backup plan;
- UI проверен desktop и mobile;
- нет scroll jump и потери введенных данных;
- activity log создается;
- production build проходит;
- реальные внешние действия не выполняются;
- владелец получает короткий отчет: что сделано, что проверить и какой следующий шаг.

## Начни отсюда

1. Прочитай текущий код и аудит.
2. Не повторяй уже выполненное скрытие финансовых полей.
3. Реализуй `Phase 1 / Sales Control Foundation` небольшими последовательными PR-sized изменениями.
4. Первый результат должен быть локально работающим: 8-колоночная воронка, обязательный next action, центр задач и нормальный mobile shell.
5. После первого результата остановись для бизнес-проверки владельцем. На сервер ничего не загружай.
