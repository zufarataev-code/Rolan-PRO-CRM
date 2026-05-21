import os
import json
import asyncio
from datetime import datetime, timedelta
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

# ═══════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════
TOKEN = os.environ.get("BOT_TOKEN", "8289847095:AAEsOR1-WOuYvUEDRypBOXIih8uZqkslR5M")
OWNER_CHAT_ID = int(os.environ.get("OWNER_CHAT_ID", "5896370851"))

# Монтажники — добавь их chat_id когда дадут
WORKERS = {
    "Алексей К.": {"chat_id": None, "role": "installer_senior", "fixed": 200},
    "Дмитрий В.": {"chat_id": None, "role": "installer_junior", "fixed": 144},
    "Сергей М.":  {"chat_id": None, "role": "measurer", "fixed": 0},
    "Ольга Н.":   {"chat_id": None, "role": "manager", "fixed": 2000},
}

DATA_FILE = "data.json"

# ═══════════════════════════════════════════
#  DATA STORE
# ═══════════════════════════════════════════
def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            return json.load(f)
    return {"orders": [], "payments": [], "bonuses": [], "accounts": {
        "Chase Business": 0, "Stripe": 0, "Bemo": 0, "Bank of America": 0
    }, "subscriptions": [
        {"name": "Google Workspace", "amt": 12,  "day": 1,  "type": "biz"},
        {"name": "QuickBooks",        "amt": 30,  "day": 5,  "type": "biz"},
        {"name": "Netflix",           "amt": 22,  "day": 3,  "type": "pers"},
        {"name": "iCloud",            "amt": 10,  "day": 8,  "type": "pers"},
        {"name": "Gym",               "amt": 50,  "day": 1,  "type": "pers"},
        {"name": "Chase Sapphire",    "amt": 150, "day": 20, "type": "cc"},
        {"name": "Amex Gold",         "amt": 100, "day": 25, "type": "cc"},
    ]}

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ═══════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════
def fmt(v):
    return f"${v:,.2f}"

def get_week_dates():
    today = datetime.now()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday

def days_until(day):
    today = datetime.now()
    target = datetime(today.year, today.month, day)
    if target <= today:
        if today.month == 12:
            target = datetime(today.year + 1, 1, day)
        else:
            target = datetime(today.year, today.month + 1, day)
    return (target - today).days

def calc_worker_pay(worker_name, orders_this_week):
    """Calculate pay for a worker this week"""
    w = WORKERS.get(worker_name)
    if not w:
        return 0, []
    
    PIECE_RATES = {
        "Солнцезащитные": 2.5, "Защитная": 3.0, "Смарт": 5.0,
        "Декоративная": 2.5, "Приватная": 2.5
    }
    
    details = []
    total = 0
    
    for order in orders_this_week:
        if worker_name not in order.get("installers", []):
            continue
        area = order.get("area_fact", order.get("area", 0))
        n = max(1, len(order.get("installers", [1])))
        area_per = area / n
        rate = PIECE_RATES.get(order.get("type", ""), 0)
        coef = order.get("coef", 1.0)
        elec_days = order.get("elec_days", 0)
        
        piece = area_per * rate * coef + elec_days * 400 / n
        fixed_rate = w["fixed"]
        days = max(1, elec_days or 1)
        fixed_pay = fixed_rate * days
        
        order_pay = max(piece, fixed_pay)
        total += order_pay
        details.append({
            "num": order.get("num", ""),
            "type": order.get("type", ""),
            "area": area_per,
            "piece": piece,
            "fixed": fixed_pay,
            "pay": order_pay
        })
    
    return total, details

# ═══════════════════════════════════════════
#  COMMANDS
# ═══════════════════════════════════════════
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_chat.id
    if user_id == OWNER_CHAT_ID:
        await update.message.reply_text(
            "👋 *RolanPro Bot* — Добро пожаловать!\n\n"
            "Команды:\n"
            "/summary — 💰 Финансовая сводка\n"
            "/payroll — 👥 Зарплата за неделю\n"
            "/subs — 🔔 Подписки к оплате\n"
            "/accounts — 🏦 Балансы счетов\n"
            "/pay\\_week — ✅ Выплатить зарплату за неделю\n"
            "/add\\_order — ➕ Добавить заказ\n"
            "/add\\_sub — ➕ Добавить подписку",
            parse_mode="Markdown"
        )
    else:
        # Worker
        worker_name = None
        for name, info in WORKERS.items():
            if info.get("chat_id") == user_id:
                worker_name = name
                break
        if worker_name:
            await update.message.reply_text(
                f"👋 Привет, *{worker_name}*!\n\n"
                "/my\\_pay — 💰 Моя зарплата\n"
                "/my\\_week — 📋 Мои заказы за неделю",
                parse_mode="Markdown"
            )
        else:
            await update.message.reply_text(
                f"Твой chat\\_id: `{user_id}`\n"
                "Отправь эту цифру Зуфару чтобы подключиться к боту.",
                parse_mode="Markdown"
            )

async def summary(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != OWNER_CHAT_ID:
        return
    data = load_data()
    monday, sunday = get_week_dates()
    
    # Subscriptions due this week
    urgent_subs = [s for s in data["subscriptions"] if days_until(s["day"]) <= 7]
    
    # Accounts
    acc_text = "\n".join([f"  • {k}: *{fmt(v)}*" for k, v in data["accounts"].items()])
    total_bal = sum(data["accounts"].values())
    
    # Weekly payroll
    week_orders = [o for o in data["orders"] if monday.strftime("%Y-%m-%d") <= o.get("end", o.get("start", "")) <= sunday.strftime("%Y-%m-%d")]
    total_payroll = sum(calc_worker_pay(name, week_orders)[0] for name in WORKERS)
    
    subs_text = ""
    if urgent_subs:
        biz = [s for s in urgent_subs if s["type"] == "biz"]
        pers = [s for s in urgent_subs if s["type"] == "pers"]
        cc = [s for s in urgent_subs if s["type"] == "cc"]
        for group, label in [(biz,"💼 Бизнес"), (pers,"👤 Личные"), (cc,"💳 Карты")]:
            if group:
                subs_text += f"\n{label}:\n"
                for s in group:
                    d = days_until(s["day"])
                    emoji = "🔴" if d <= 0 else "🟡" if d <= 3 else "🟢"
                    subs_text += f"  {emoji} {s['name']}: *{fmt(s['amt'])}* — через {d} дн.\n"
    else:
        subs_text = "\n✅ Нет срочных подписок"
    
    msg = (
        f"📊 *СВОДКА ROLAN PRO*\n"
        f"_{monday.strftime('%d.%m')} — {sunday.strftime('%d.%m.%Y')}_\n\n"
        f"🏦 *Балансы счетов:*\n{acc_text}\n"
        f"💵 Итого: *{fmt(total_bal)}*\n\n"
        f"👥 *Зарплата этой недели:* *{fmt(total_payroll)}*\n"
        f"📅 Выплата в понедельник\n\n"
        f"🔔 *Подписки к оплате:*{subs_text}"
    )
    
    keyboard = [
        [InlineKeyboardButton("👥 Детали зарплаты", callback_data="payroll_detail")],
        [InlineKeyboardButton("✅ Выплатить зарплату", callback_data="pay_week")],
        [InlineKeyboardButton("🔔 Все подписки", callback_data="all_subs")],
    ]
    await update.message.reply_text(msg, parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard))

async def payroll(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != OWNER_CHAT_ID:
        return
    data = load_data()
    monday, sunday = get_week_dates()
    week_orders = [o for o in data["orders"] if monday.strftime("%Y-%m-%d") <= o.get("end", o.get("start", "")) <= sunday.strftime("%Y-%m-%d")]
    
    msg = f"👥 *ЗАРПЛАТА {monday.strftime('%d.%m')}–{sunday.strftime('%d.%m')}*\n\n"
    total = 0
    keyboard = []
    
    installers = {name: info for name, info in WORKERS.items() if info["role"].startswith("installer")}
    
    for name, info in installers.items():
        pay, details = calc_worker_pay(name, week_orders)
        total += pay
        
        # Check bonuses
        bonus = sum(b["amt"] for b in data.get("bonuses", []) 
                   if b["worker"] == name and b["week"] == monday.strftime("%Y-%m-%d"))
        
        msg += f"🔧 *{name}* ({info['role'].replace('installer_','')})\n"
        if details:
            for d in details:
                msg += f"  • {d['num']}: {d['area']:.0f} sqft → сделка *{fmt(d['piece'])}* vs фикс *{fmt(d['fixed'])}* → *{fmt(d['pay'])}*\n"
        else:
            msg += "  Нет заказов на этой неделе\n"
        if bonus > 0:
            msg += f"  🎁 Бонус: *{fmt(bonus)}*\n"
        msg += f"  💰 Итого: *{fmt(pay + bonus)}*\n\n"
        
        keyboard.append([
            InlineKeyboardButton(f"🎁 Бонус {name}", callback_data=f"bonus_{name}"),
            InlineKeyboardButton(f"✅ Выплатил {name}", callback_data=f"paid_{name}"),
        ])
    
    msg += f"💵 *Всего к выплате: {fmt(total)}*"
    keyboard.append([InlineKeyboardButton("📤 Уведомить монтажников", callback_data="notify_all")])
    
    target = update.message or update.callback_query.message
    await target.reply_text(msg, parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard))

async def subs_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != OWNER_CHAT_ID:
        return
    data = load_data()
    
    msg = "🔔 *ВСЕ ПОДПИСКИ*\n\n"
    for type_key, label, emoji in [("biz","💼 БИЗНЕС",""), ("pers","👤 ЛИЧНЫЕ",""), ("cc","💳 КАРТЫ","")]:
        group = [s for s in data["subscriptions"] if s["type"] == type_key]
        if not group:
            continue
        total = sum(s["amt"] for s in group)
        msg += f"{label} — *{fmt(total)}/мес*\n"
        for s in sorted(group, key=lambda x: x["day"]):
            d = days_until(s["day"])
            e = "🔴" if d <= 0 else "🟡" if d <= 3 else "🟢"
            msg += f"  {e} {s['name']}: *{fmt(s['amt'])}* — {s['day']}-го (через {d} дн.)\n"
        msg += "\n"
    
    all_total = sum(s["amt"] for s in data["subscriptions"])
    msg += f"📊 *Итого в месяц: {fmt(all_total)}*\n"
    msg += f"📊 *Итого в год: {fmt(all_total * 12)}*"
    
    await update.message.reply_text(msg, parse_mode="Markdown")

async def accounts_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != OWNER_CHAT_ID:
        return
    data = load_data()
    
    msg = "🏦 *БАЛАНСЫ СЧЕТОВ*\n\n"
    for name, bal in data["accounts"].items():
        emoji = "🟠" if "Bemo" in name else "🟢" if bal > 5000 else "🟡" if bal > 1000 else "🔴"
        msg += f"{emoji} *{name}*: {fmt(bal)}\n"
    
    total = sum(data["accounts"].values())
    bemo = data["accounts"].get("Bemo", 0)
    msg += f"\n💵 *Итого: {fmt(total)}*\n"
    msg += f"🏛 Bemo (налоги): *{fmt(bemo)}*"
    
    await update.message.reply_text(msg, parse_mode="Markdown")

# Worker commands
async def my_pay(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_chat.id
    worker_name = None
    for name, info in WORKERS.items():
        if info.get("chat_id") == user_id:
            worker_name = name
            break
    
    if not worker_name:
        await update.message.reply_text(f"Твой chat_id: `{user_id}` — отправь Зуфару для подключения.", parse_mode="Markdown")
        return
    
    data = load_data()
    monday, sunday = get_week_dates()
    week_orders = [o for o in data["orders"] if monday.strftime("%Y-%m-%d") <= o.get("end", o.get("start","")) <= sunday.strftime("%Y-%m-%d")]
    
    pay, details = calc_worker_pay(worker_name, week_orders)
    bonus = sum(b["amt"] for b in data.get("bonuses", []) 
               if b["worker"] == worker_name and b["week"] == monday.strftime("%Y-%m-%d"))
    
    msg = (
        f"💰 *Твоя зарплата*\n"
        f"_{monday.strftime('%d.%m')} — {sunday.strftime('%d.%m.%Y')}_\n\n"
    )
    
    if details:
        msg += "📋 *Заказы:*\n"
        for d in details:
            msg += f"  • {d['num']} ({d['type']})\n"
            msg += f"    {d['area']:.0f} sqft × ставка × {1.0:.1f} = *{fmt(d['piece'])}*\n"
            msg += f"    Фикс: *{fmt(d['fixed'])}*\n"
            msg += f"    ✅ Выплата: *{fmt(d['pay'])}*\n"
    else:
        msg += "Нет заказов на этой неделе\n"
    
    if bonus > 0:
        msg += f"\n🎁 Бонус: *{fmt(bonus)}*\n"
    
    msg += f"\n💵 *Итого к получению: {fmt(pay + bonus)}*\n"
    msg += f"📅 Выплата каждый понедельник"
    
    await update.message.reply_text(msg, parse_mode="Markdown")

# ═══════════════════════════════════════════
#  CALLBACKS
# ═══════════════════════════════════════════
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data_str = query.data
    chat_id = query.message.chat_id
    
    if chat_id != OWNER_CHAT_ID:
        return
    
    data = load_data()
    monday, _ = get_week_dates()
    
    if data_str == "payroll_detail":
        await payroll(update, context)
    
    elif data_str == "pay_week":
        # Mark week as paid and notify workers
        await query.edit_message_reply_markup(None)
        await query.message.reply_text("✅ *Зарплата выплачена!*\nУведомляю монтажников...", parse_mode="Markdown")
        await notify_workers(context.bot, data)
    
    elif data_str == "notify_all":
        await notify_workers(context.bot, data)
        await query.answer("📤 Уведомления отправлены!")
    
    elif data_str.startswith("bonus_"):
        worker = data_str[6:]
        context.user_data["bonus_for"] = worker
        await query.message.reply_text(
            f"🎁 Бонус для *{worker}*\n\nОтправь сумму и причину через пробел:\n`500 За перевыполнение плана`",
            parse_mode="Markdown"
        )
    
    elif data_str.startswith("paid_"):
        worker = data_str[5:]
        _, week_orders_list = get_week_dates()
        monday_str = monday.strftime("%Y-%m-%d")
        week_orders = [o for o in data["orders"] if monday_str <= o.get("end", o.get("start", "")) <= week_orders_list.strftime("%Y-%m-%d")]
        pay, _ = calc_worker_pay(worker, week_orders)
        bonus = sum(b["amt"] for b in data.get("bonuses", []) if b["worker"] == worker and b["week"] == monday_str)
        
        data.setdefault("payments", []).append({
            "worker": worker, "week": monday_str,
            "pay": pay, "bonus": bonus, "total": pay + bonus,
            "date": datetime.now().strftime("%Y-%m-%d %H:%M")
        })
        save_data(data)
        
        # Notify worker
        w_info = WORKERS.get(worker)
        if w_info and w_info.get("chat_id"):
            await context.bot.send_message(
                chat_id=w_info["chat_id"],
                text=f"✅ *Зарплата выплачена!*\n\nПривет, *{worker}*!\n\nЗа неделю {monday.strftime('%d.%m')}: *{fmt(pay + bonus)}*" + (f"\nВключая бонус: *{fmt(bonus)}*" if bonus else ""),
                parse_mode="Markdown"
            )
        
        await query.answer(f"✅ {worker} — выплачено {fmt(pay + bonus)}")
        await query.message.reply_text(f"✅ *{worker}* — выплачено *{fmt(pay + bonus)}*", parse_mode="Markdown")
    
    elif data_str == "all_subs":
        await subs_cmd(update, context)

async def notify_workers(bot, data):
    monday, sunday = get_week_dates()
    monday_str = monday.strftime("%Y-%m-%d")
    week_orders = [o for o in data["orders"] if monday_str <= o.get("end", o.get("start","")) <= sunday.strftime("%Y-%m-%d")]
    
    for name, info in WORKERS.items():
        if not info.get("chat_id") or not info["role"].startswith("installer"):
            continue
        pay, details = calc_worker_pay(name, week_orders)
        bonus = sum(b["amt"] for b in data.get("bonuses", []) if b["worker"] == name and b["week"] == monday_str)
        
        msg = (
            f"💰 *Зарплата за неделю*\n"
            f"_{monday.strftime('%d.%m')} — {sunday.strftime('%d.%m.%Y')}_\n\n"
            f"Привет, *{name}*! 👋\n\n"
        )
        if details:
            msg += "📋 *Твои заказы:*\n"
            for d in details:
                msg += f"  • {d['num']}: *{fmt(d['pay'])}*\n"
        if bonus > 0:
            msg += f"\n🎁 Бонус: *{fmt(bonus)}*\n"
        msg += f"\n💵 *К получению: {fmt(pay + bonus)}*\n"
        msg += "📅 Выплата сегодня (понедельник) ✅"
        
        try:
            await bot.send_message(chat_id=info["chat_id"], text=msg, parse_mode="Markdown")
        except Exception as e:
            print(f"Error notifying {name}: {e}")

# ═══════════════════════════════════════════
#  SCHEDULED JOBS
# ═══════════════════════════════════════════
async def weekly_owner_summary(context: ContextTypes.DEFAULT_TYPE):
    """Every Monday 9am — send summary to owner"""
    data = load_data()
    monday, sunday = get_week_dates()
    week_orders = [o for o in data["orders"] if monday.strftime("%Y-%m-%d") <= o.get("end", o.get("start","")) <= sunday.strftime("%Y-%m-%d")]
    total_payroll = sum(calc_worker_pay(name, week_orders)[0] for name in WORKERS)
    urgent_subs = [s for s in data["subscriptions"] if days_until(s["day"]) <= 7]
    total_bal = sum(data["accounts"].values())
    
    subs_text = "\n".join([f"  🔔 {s['name']}: {fmt(s['amt'])} — через {days_until(s['day'])} дн." for s in urgent_subs]) or "  ✅ Нет срочных"
    
    msg = (
        f"🌅 *ПОНЕДЕЛЬНИК — СВОДКА ROLAN PRO*\n"
        f"_{monday.strftime('%d.%m.%Y')}_\n\n"
        f"💵 Общий баланс: *{fmt(total_bal)}*\n"
        f"👥 Зарплата к выплате: *{fmt(total_payroll)}*\n\n"
        f"🔔 *Подписки на этой неделе:*\n{subs_text}\n\n"
        f"Нажми /payroll для выплаты зарплат"
    )
    
    keyboard = [[InlineKeyboardButton("👥 Выплатить зарплату", callback_data="payroll_detail")]]
    await context.bot.send_message(chat_id=OWNER_CHAT_ID, text=msg, parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard))

async def daily_sub_check(context: ContextTypes.DEFAULT_TYPE):
    """Every day at 9am — check subscriptions due in 3 days"""
    data = load_data()
    urgent = [s for s in data["subscriptions"] if days_until(s["day"]) <= 3]
    if not urgent:
        return
    
    msg = "⚠️ *ПЛАТЕЖИ ЧЕРЕЗ 3 ДНЯ:*\n\n"
    for s in urgent:
        d = days_until(s["day"])
        type_label = "💼" if s["type"]=="biz" else "👤" if s["type"]=="pers" else "💳"
        msg += f"{type_label} *{s['name']}*: {fmt(s['amt'])}\n"
        msg += f"  📅 {'Сегодня!' if d<=0 else f'Через {d} дн. ({s[\"day\"]}-го)'}\n"
    
    total = sum(s["amt"] for s in urgent)
    msg += f"\n💵 Итого: *{fmt(total)}*"
    
    await context.bot.send_message(chat_id=OWNER_CHAT_ID, text=msg, parse_mode="Markdown")

# ═══════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════
def main():
    app = Application.builder().token(TOKEN).build()
    
    # Commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("summary", summary))
    app.add_handler(CommandHandler("payroll", payroll))
    app.add_handler(CommandHandler("subs", subs_cmd))
    app.add_handler(CommandHandler("accounts", accounts_cmd))
    app.add_handler(CommandHandler("my_pay", my_pay))
    app.add_handler(CallbackQueryHandler(button_handler))
    
    # Scheduled jobs
    job_queue = app.job_queue
    # Every Monday at 9:00 AM (UTC-7 California = 16:00 UTC)
    job_queue.run_daily(weekly_owner_summary, time=datetime.strptime("16:00", "%H:%M").time(), days=(0,))
    # Every day at 9am — subscription check
    job_queue.run_daily(daily_sub_check, time=datetime.strptime("16:00", "%H:%M").time())
    
    print("✅ RolanPro Bot started!")
    app.run_polling()

if __name__ == "__main__":
    main()
