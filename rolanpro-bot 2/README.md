# RolanPro Telegram Bot

## Команды владельца (Зуфар):
- /summary — финансовая сводка
- /payroll — зарплата за неделю + кнопки выплаты
- /subs — все подписки
- /accounts — балансы счетов

## Команды монтажников:
- /my_pay — моя зарплата за неделю
- /my_week — мои заказы

## Установка на Railway:

1. Зайди на railway.app
2. New Project → Deploy from GitHub
3. Загрузи эту папку
4. Variables → добавь:
   - BOT_TOKEN = токен бота
   - OWNER_CHAT_ID = 5896370851

## Добавить chat_id монтажников:
В bot.py найди WORKERS и добавь chat_id каждого.
Монтажник пишет боту /start — бот покажет его chat_id.
