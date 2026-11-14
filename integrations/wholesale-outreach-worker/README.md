# RolanPRO Wholesale Outreach Worker (`rolanpro-wholesale`)

Рассылка по базе тинтовочных компаний ЛА + бот, который отвечает на входящие письма и продаёт плёнку по прайсу.
Направление: перепродажа плёнки под брендом RolanPRO (см. `/areas/film-resale` у владельца).

Cloudflare Worker, как и `facebook-messenger-worker`. Согласно `DECISIONS.md`, маркетинговые рассылки идут через
**Resend с отдельного домена-отправителя**, не через Google Workspace.

## Что делает

| Часть | Как |
|---|---|
| Серия из 3 писем (день 0 / +3 / +7), **без цен**, цель — запрос прайса | `scheduled()` по крону в 08:30 PT по будням; дневной лимит с прогревом (15 → 40 писем/день за 7 дней) |
| Кнопка «Send me the dealer price list» | `GET /price-list?c=<token>` показывает страницу с кнопкой подтверждения (сканеры почты и превью ссылок ничего не запускают); `POST` отправляет PDF-прайс один раз на контакт (`pricelist_sent_at`), статус `requested`, уведомление владельцу |
| Ответы шопов на письма | Cloudflare Email Routing → `email()` → Claude отвечает как Zak по прайсу и правилам (`src/sales.ts`) |
| Заказ в переписке | бот собирает SKU/кол-во → считает тир (1–2 / 3–9 / 10+) → Stripe Checkout-ссылка (если задан `STRIPE_SECRET_KEY`) или Zelle → письмо владельцу |
| Отписка / «stop» | `GET /unsubscribe?c=` или ответ «stop/no» → статус `unsubscribed`, рассылка останавливается |
| Эскалация | вопросы о производителе, кредите, звонок, 10+ рулонов → письмо владельцу на `OWNER_EMAIL` |
| Файлы | `public/catalog.pdf` (прайс), `public/banner.png`, `public/hero-mp35.png` раздаются самим воркером |

Бот **никогда** не называет поставщика, страну происхождения и закупочные цены; не представляется ИИ; не выдумывает цены — прайс зашит в `src/prices.json`.

## Развёртывание (один раз)

1. **Домен-отправитель.** Нужен домен на Cloudflare DNS (основной `rolan-pro.com` живёт на Webnames — его не трогаем).
   Предлагается новый домен, например `rolanpro-supply.com`, зарегистрированный в Cloudflare Registrar. Поменять `PUBLIC_URL`, `FROM_EMAIL`, `REPLY_TO` в `wrangler.jsonc` под выбранный домен.
2. **Resend.** Добавить домен в Resend → прописать DKIM/SPF/DMARC-записи в Cloudflare DNS → получить API-ключ.
3. **Email Routing** в Cloudflare для этого домена: адрес `zak@<домен>` → действие «Send to a Worker» → `rolanpro-wholesale`.
   (Resend шлёт с `zak@`, ответы приходят на тот же адрес и попадают в воркер.)
4. **D1:**
   ```sh
   npx wrangler d1 create rolanpro_wholesale      # id → в wrangler.jsonc
   npm run db:schema
   ```
5. **Секреты:**
   ```sh
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put ADMIN_TOKEN            # любой длинный пароль для /admin/*
   npx wrangler secret put STRIPE_SECRET_KEY      # необязательно; без него бот даёт Zelle
   npx wrangler secret put STRIPE_WEBHOOK_SECRET  # нужен вместе со Stripe: вебхук `POST /stripe/webhook` (событие `checkout.session.completed`) — только он переводит заказ в `paid` и шлёт владельцу «оплачен»
   ```
6. **Деплой и проверка:**
   ```sh
   npm install && npm run typecheck
   npx wrangler deploy
   curl -X POST https://<PUBLIC_URL>/admin/test-email -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' -d '{"to":"info@rolan-pro.com"}'
   ```
   Ответить на тестовое письмо — бот должен ответить в той же ветке.

## Загрузка базы

Из `RolanPRO_LA_Tint_Shops_Database.xlsx` (колонки Company, Phone, City, Email, Website, Segment, Contact name) берутся только строки с e-mail:

```sh
python3 scripts_import.py RolanPRO_LA_Tint_Shops_Database.xlsx https://<PUBLIC_URL> $ADMIN_TOKEN
```

Повторный импорт безопасен — дубликаты по e-mail пропускаются.

## Админ-API (Bearer `ADMIN_TOKEN`)

- `GET /admin/stats` — контакты по статусам, заказы, лог отправок, остаток дневного лимита
- `GET /admin/contacts` — список
- `GET /admin/messages?contact_id=N` — переписка
- `POST /admin/send-now` — отправить сегодняшнюю партию прямо сейчас
- `POST /admin/test-email {"to":…}` — тестовое письмо №1

## Статусы контакта

`new → sequence → requested (нажал кнопку) → replied (написал) → customer (есть заказ)`; `unsubscribed`, `bounced`.

## Что осталось за владельцем

- Выбрать и купить домен-отправитель; настроить Resend и Email Routing (п. 1–3).
- Подтвердить, какой рулон из прайса идёт как MAGNITRONIC PRIME, и дать datasheet — цифры в промпте бота (IRR 95 / TSER 60) взяты с упаковки MP35.
- Решить по Stripe: ключ live-аккаунта RolanPRO.
- Заполнить e-mail в базе (сейчас 249 компаний с телефонами, почты собираются отдельно).
