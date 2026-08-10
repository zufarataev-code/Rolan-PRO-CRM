# RolanPRO SMS через Twilio

CRM должна отправлять обычные SMS клиентам и принимать ответы без кодов подтверждения.

Лучший вариант: SMS отправляет Twilio Function, а HTML-файл CRM хранит только публичный URL endpoint. Так Twilio Auth Token не попадает в браузерный код.

## Файлы

- `send-sms-function.js` — отправка обычных SMS из CRM: напоминание, баланс, статус проекта, сообщение клиенту.
- `incoming-sms-function.js` — входящие ответы клиентов на Twilio-номер. Функция пересылает ответ владельцу на телефон.

## Настройка отправки SMS

1. Открой Twilio Console.
2. Перейди в `Functions and Assets`.
3. Создай Service, например `rolanpro-crm`.
4. Добавь Function с путём `/send-sms`.
5. Вставь код из `send-sms-function.js`.
6. В `Environment Variables` добавь:

```text
TWILIO_FROM_NUMBER=+18337546657
```

7. Нажми `Deploy All`.
8. Скопируй публичный URL функции, например:

```text
https://rolanpro-crm-sms-4528.twil.io/send-sms
```

## Подключение отправки в CRM

1. Открой CRM.
2. Нажми `Сервис -> SMS / Twilio`.
3. Вставь URL в поле `Webhook / Twilio Function URL`.
4. Укажи `Twilio From number`.
5. Нажми `Сохранить`.
6. Введи свой номер в `Тестовый номер` и нажми `Отправить тест`.

CRM отправляет в endpoint такой JSON:

```json
{
  "to": "+18185550100",
  "body": "RolanPRO test: SMS работает",
  "from": "+1XXXXXXXXXX",
  "source": "RolanPRO CRM",
  "meta": {
    "kind": "test"
  }
}
```

## Настройка входящих ответов клиентов

Чтобы клиент мог отвечать на SMS, нужно привязать входящий webhook к Twilio-номеру.

1. В `Functions and Assets` добавь Function с путём `/incoming-sms`.
2. Вставь код из `incoming-sms-function.js`.
3. В `Environment Variables` добавь:

```text
ROLANPRO_OWNER_PHONE=+1XXXXXXXXXX
TWILIO_FROM_NUMBER=+18337546657
```

4. Нажми `Deploy All`.
5. Скопируй URL:

```text
https://rolanpro-crm-sms-4528.twil.io/incoming-sms
```

6. В Twilio Console открой `Phone Numbers -> Manage -> Active numbers`.
7. Выбери свой Twilio-номер.
8. В секции `Messaging` найди `A message comes in`.
9. Выбери `Webhook`.
10. Вставь URL `/incoming-sms`.
11. Метод поставь `HTTP POST`.
12. Сохрани.

Теперь логика такая:

- CRM отправляет SMS клиенту через `/send-sms`.
- Клиент отвечает на Twilio-номер.
- Twilio вызывает `/incoming-sms`.
- `/incoming-sms` пересылает текст ответа на твой номер из `ROLANPRO_OWNER_PHONE`.

## Важно

Не вставляй Twilio Auth Token в HTML без необходимости. Правильный рабочий режим — через Twilio Function URL.

Коды подтверждения здесь не используются. Клиент просто получает сообщение и может ответить обычным SMS.

## Повторная подача Toll-Free verification

Текущий отказ Twilio связан с opt-in: на публичном сайте должно быть видно, что клиент явно согласился на SMS. Перед повторной отправкой заявки нужно опубликовать форму с обязательным unchecked checkbox:

```text
I agree to receive SMS messages from RolanPRO about my quote, appointment, project updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.
```

Также нужны публичные страницы:

```text
Public SMS opt-in form: https://rolanpro-crm.143-110-136-211.sslip.io/sms-consent
Privacy Policy: https://rolanpro-crm.143-110-136-211.sslip.io/privacy-policy
Terms: https://rolanpro-crm.143-110-136-211.sslip.io/terms
```

В Twilio Toll-Free registration лучше указывать:

```text
Opt-in type: Website form / Web form
Opt-in proof URL: https://rolanpro-crm.143-110-136-211.sslip.io/sms-consent
Privacy Policy URL: https://rolanpro-crm.143-110-136-211.sslip.io/privacy-policy
Terms and Conditions URL: https://rolanpro-crm.143-110-136-211.sslip.io/terms
Use case: Customer care
Opt-in keywords: START, YES, UNSTOP
Age gated content: unchecked
```

Additional information:

```text
Customers opt in by submitting a website quote/contact form that contains an unchecked SMS consent checkbox and clear disclosure. RolanPRO sends only transactional/customer-care messages related to quotes, appointments, measurement visits, installation schedules, project status, payment links/balance updates, and support. We do not send marketing blasts or share/sell SMS opt-in data. No age-gated or prohibited content.
```
