#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=====================================================================================
 ربات تلگرام صرافی ارز دیجیتال
 کتابخانه: pyTelegramBotAPI (telebot)
 پایگاه‌داده: SQLite
=====================================================================================

امکانات:
    - منوی اصلی
    - حساب کاربری
    - فروشگاه (نمایش نرخ ارزها)
    - خرید ارز (USDT, USDC, TRX, Gram)
    - فروش ارز (USDT, USDC, TRX, Gram)
    - محاسبه خودکار مبلغ پرداخت بر اساس نرخ هر ارز
    - ثبت سفارش در پایگاه‌داده
    - نمایش اطلاعات پرداخت (HesabPay / AtomaPay)
    - دریافت عکس رسید پرداخت از کاربر
    - ارسال سفارش و رسید برای ادمین
    - پنل ادمین با دکمه‌های تایید / رد سفارش
    - اطلاع‌رسانی نتیجه به کاربر
    - بخش پشتیبانی (گفتگوی کاربر <-> ادمین)
    - تاریخچه سفارش‌ها
    - آمار کاربران (مخصوص ادمین)

نحوه اجرا:
    1) نصب کتابخانه:
         pip install pyTelegramBotAPI
    2) توکن ربات را در متغیر BOT_TOKEN قرار دهید.
    3) دستور را اجرا کنید:
         python bot.py
=====================================================================================
"""

import sqlite3
import logging
import datetime
import html
import telebot
from telebot import types


# =====================================================================================
#  تنظیمات کلی (این بخش را مطابق نیاز خودتان تغییر دهید)
# =====================================================================================

# توکن ربات را از @BotFather دریافت کرده و اینجا قرار دهید
BOT_TOKEN = "8794039968:AAEQp0G6uHcLpRnhpg3r7QuEVSnQZtOTpiw"

# آیدی عددی ادمین ربات
ADMIN_ID = 6028874275

# واحد پولی که در محاسبات نمایش داده می‌شود (در صورت نیاز تغییر دهید)
CURRENCY_UNIT = "افغانی"

# نرخ خرید و فروش هر ارز (قابل تغییر توسط ادمین از داخل همین کد)
# قیمت‌ها بر حسب CURRENCY_UNIT به ازای هر یک واحد از ارز دیجیتال است.
PRICES = {
    "USDT": {"buy": 71.5, "sell": 70.5},
    "USDC": {"buy": 71.5, "sell": 70.5},
    "TRX":  {"buy": 9.2,  "sell": 8.8},
    "Gram": {"buy": 5.0,  "sell": 4.6},
}

# آدرس کیف‌پول‌هایی که کاربر هنگام «فروش ارز» باید ارز را به آن واریز کند
# (این مقادیر را با آدرس واقعی کیف‌پول خودتان جایگزین کنید)
WALLET_ADDRESSES = {
    "USDT": "PUT_USDT_WALLET_ADDRESS_HERE",
    "USDC": "PUT_USDC_WALLET_ADDRESS_HERE",
    "TRX":  "PUT_TRX_WALLET_ADDRESS_HERE",
    "Gram": "PUT_GRAM_WALLET_ADDRESS_HERE",
}

# اطلاعات حساب‌های پرداخت برای «خرید ارز»
PAYMENT_ACCOUNTS = {
    "HesabPay": "0731301673",
    "AtomaPay": "0770494336",
}

DB_PATH = "exchange_bot.db"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

bot = telebot.TeleBot(BOT_TOKEN, parse_mode="HTML")

# دیکشنری موقت برای نگهداری اطلاعات سفارش در حال ثبت هر کاربر
# ساختار: { user_id: {"order_type": "buy"/"sell", "currency": "USDT", "amount": 10, "total": 715} }
temp_orders = {}

# دیکشنری موقت برای نگهداری اینکه ادمین در حال پاسخ به کدام کاربر پشتیبانی است
# ساختار: { admin_id: user_id }
admin_reply_target = {}


# =====================================================================================
#  توابع پایگاه‌داده (SQLite)
# =====================================================================================

def get_connection():
    """اتصال جدید به پایگاه‌داده SQLite برمی‌گرداند."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """جداول مورد نیاز را در صورت عدم وجود می‌سازد."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            join_date TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            order_type TEXT,
            currency TEXT,
            amount REAL,
            price REAL,
            total REAL,
            status TEXT DEFAULT 'pending',
            receipt_file_id TEXT,
            receive_info TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS support_messages (
            support_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            reply TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()


def add_user_if_not_exists(user_id, username, first_name):
    """در صورتی که کاربر در پایگاه‌داده ثبت نشده باشد، آن را اضافه می‌کند."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    if row is None:
        cur.execute(
            "INSERT INTO users (user_id, username, first_name, join_date) VALUES (?, ?, ?, ?)",
            (user_id, username or "", first_name or "", datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
        )
        conn.commit()
    conn.close()


def get_user(user_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return row


def create_order(user_id, order_type, currency, amount, price, total, receive_info=None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO orders (user_id, order_type, currency, amount, price, total, status, receive_info, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (user_id, order_type, currency, amount, price, total, receive_info,
          datetime.datetime.now().strftime("%Y-%m-%d %H:%M")))
    order_id = cur.lastrowid
    conn.commit()
    conn.close()
    return order_id


def set_order_receipt(order_id, file_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE orders SET receipt_file_id = ? WHERE order_id = ?", (file_id, order_id))
    conn.commit()
    conn.close()


def update_order_status(order_id, status):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE orders SET status = ? WHERE order_id = ?", (status, order_id))
    conn.commit()
    conn.close()


def get_order(order_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,))
    row = cur.fetchone()
    conn.close()
    return row


def get_user_orders(user_id, limit=15):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY order_id DESC LIMIT ?",
        (user_id, limit)
    )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_user_order_count(user_id):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS c FROM orders WHERE user_id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    return row["c"] if row else 0


def create_support_message(user_id, message):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO support_messages (user_id, message, status, created_at)
        VALUES (?, ?, 'pending', ?)
    """, (user_id, message, datetime.datetime.now().strftime("%Y-%m-%d %H:%M")))
    support_id = cur.lastrowid
    conn.commit()
    conn.close()
    return support_id


def set_support_reply(support_id, reply):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE support_messages SET reply = ?, status = 'answered' WHERE support_id = ?",
        (reply, support_id)
    )
    conn.commit()
    conn.close()


def get_stats():
    """آمار کلی کاربران و سفارش‌ها را برمی‌گرداند."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS c FROM users")
    total_users = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) AS c FROM orders")
    total_orders = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'")
    pending_orders = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'confirmed'")
    confirmed_orders = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'completed'")
    completed_orders = cur.fetchone()["c"]

    cur.execute("SELECT COUNT(*) AS c FROM orders WHERE status = 'rejected'")
    rejected_orders = cur.fetchone()["c"]

    conn.close()
    return {
        "total_users": total_users,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "confirmed_orders": confirmed_orders,
        "completed_orders": completed_orders,
        "rejected_orders": rejected_orders,
    }


# =====================================================================================
#  متن‌های ثابت و ترجمه وضعیت‌ها
# =====================================================================================

STATUS_LABELS = {
    "pending": "⏳ در انتظار بررسی",
    "confirmed": "✅ رسید تایید شد (در انتظار ارسال)",
    "completed": "🎉 تکمیل شد",
    "rejected": "❌ رد شده",
}

ORDER_TYPE_LABELS = {
    "buy": "خرید",
    "sell": "فروش",
}

BTN_ACCOUNT = "👤 حساب کاربری"
BTN_STORE = "🛒 فروشگاه"
BTN_BUY = "💰 خرید ارز"
BTN_SELL = "💵 فروش ارز"
BTN_HISTORY = "📜 تاریخچه سفارش‌ها"
BTN_SUPPORT = "🆘 پشتیبانی"
BTN_ADMIN_STATS = "📊 آمار کاربران"
BTN_CANCEL = "❌ لغو"
BTN_BACK = "🔙 بازگشت به منوی اصلی"


# =====================================================================================
#  کیبوردها
# =====================================================================================

def main_menu_keyboard(user_id):
    """منوی اصلی را می‌سازد. اگر کاربر ادمین باشد دکمه آمار هم اضافه می‌شود."""
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=2)
    markup.add(types.KeyboardButton(BTN_ACCOUNT), types.KeyboardButton(BTN_STORE))
    markup.add(types.KeyboardButton(BTN_BUY), types.KeyboardButton(BTN_SELL))
    markup.add(types.KeyboardButton(BTN_HISTORY), types.KeyboardButton(BTN_SUPPORT))
    if user_id == ADMIN_ID:
        markup.add(types.KeyboardButton(BTN_ADMIN_STATS))
    return markup


def cancel_keyboard():
    markup = types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(types.KeyboardButton(BTN_CANCEL))
    return markup


def currency_inline_keyboard(action):
    """کیبورد شیشه‌ای انتخاب ارز برای خرید یا فروش می‌سازد. action یعنی 'buy' یا 'sell'."""
    markup = types.InlineKeyboardMarkup(row_width=2)
    buttons = []
    for currency in PRICES.keys():
        buttons.append(
            types.InlineKeyboardButton(currency, callback_data=f"{action}_{currency}")
        )
    markup.add(*buttons)
    return markup


def order_admin_keyboard(order_id):
    """کیبورد مرحله اول: تایید یا رد رسید پرداخت."""
    markup = types.InlineKeyboardMarkup(row_width=2)
    markup.add(
        types.InlineKeyboardButton("✅ تایید سفارش", callback_data=f"order_confirm_{order_id}"),
        types.InlineKeyboardButton("❌ رد سفارش", callback_data=f"order_reject_{order_id}"),
    )
    return markup


def order_complete_keyboard(order_id):
    """کیبورد مرحله دوم: بعد از تایید رسید، وقتی ادمین ارز/مبلغ را برای کاربر ارسال کرد این دکمه را می‌زند."""
    markup = types.InlineKeyboardMarkup()
    markup.add(
        types.InlineKeyboardButton("📤 تکمیل ارسال به کاربر", callback_data=f"order_complete_{order_id}")
    )
    return markup


def support_admin_keyboard(support_id, user_id):
    markup = types.InlineKeyboardMarkup()
    markup.add(
        types.InlineKeyboardButton("✍️ پاسخ به کاربر", callback_data=f"support_reply_{support_id}_{user_id}")
    )
    return markup


# =====================================================================================
#  توابع کمکی
# =====================================================================================

def escape_html(text):
    """
    متن آزاد کاربر (نام، آدرس ولت، پیام پشتیبانی و ...) را قبل از قرار دادن در
    پیام‌های با parse_mode='HTML' ایمن می‌کند. بدون این کار، اگر متن کاربر شامل
    کاراکترهایی مثل < > & باشد، تلگرام با خطای "can't parse entities" پیام را رد
    می‌کند و همان چیزی است که باعث می‌شود سفارش یا پیام به ادمین نرسد.
    """
    if text is None:
        return ""
    return html.escape(str(text), quote=False)


def clear_temp_order(user_id):
    if user_id in temp_orders:
        del temp_orders[user_id]


def is_number(text):
    try:
        float(text)
        return True
    except (TypeError, ValueError):
        return False


def format_price_list():
    """لیست نرخ ارزها را به صورت متن قالب‌بندی شده برمی‌گرداند."""
    lines = ["<b>💹 نرخ لحظه‌ای ارزهای دیجیتال</b>\n"]
    for currency, prices in PRICES.items():
        lines.append(
            f"🔸 <b>{currency}</b>\n"
            f"   • قیمت خرید شما: {prices['buy']} {CURRENCY_UNIT}\n"
            f"   • قیمت فروش شما: {prices['sell']} {CURRENCY_UNIT}\n"
        )
    return "\n".join(lines)


# =====================================================================================
#  دستور شروع و منوی اصلی
# =====================================================================================

@bot.message_handler(commands=["start"])
def handle_start(message):
    user = message.from_user
    add_user_if_not_exists(user.id, user.username, user.first_name)
    clear_temp_order(user.id)

    text = (
        f"سلام {escape_html(user.first_name)} 👋\n\n"
        "به ربات صرافی ارز دیجیتال خوش آمدید.\n"
        "از منوی زیر یکی از گزینه‌ها را انتخاب کنید:"
    )
    bot.send_message(message.chat.id, text, reply_markup=main_menu_keyboard(user.id))


@bot.message_handler(func=lambda m: m.text == BTN_BACK or m.text == BTN_CANCEL)
def handle_back_to_menu(message):
    clear_temp_order(message.from_user.id)
    bot.send_message(
        message.chat.id,
        "به منوی اصلی بازگشتید.",
        reply_markup=main_menu_keyboard(message.from_user.id)
    )


# =====================================================================================
#  حساب کاربری
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_ACCOUNT)
def handle_account(message):
    user_id = message.from_user.id
    add_user_if_not_exists(user_id, message.from_user.username, message.from_user.first_name)
    user_row = get_user(user_id)
    order_count = get_user_order_count(user_id)

    join_date = user_row["join_date"] if user_row else "-"
    username = f"@{escape_html(user_row['username'])}" if user_row and user_row["username"] else "ثبت نشده"

    text = (
        "<b>👤 حساب کاربری شما</b>\n\n"
        f"🆔 آیدی عددی: <code>{user_id}</code>\n"
        f"👤 نام کاربری: {username}\n"
        f"📅 تاریخ عضویت: {join_date}\n"
        f"📦 تعداد کل سفارش‌ها: {order_count}\n"
    )
    bot.send_message(message.chat.id, text, reply_markup=main_menu_keyboard(user_id))


# =====================================================================================
#  فروشگاه (نمایش نرخ ارزها)
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_STORE)
def handle_store(message):
    bot.send_message(message.chat.id, format_price_list(), reply_markup=main_menu_keyboard(message.from_user.id))


# =====================================================================================
#  خرید ارز
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_BUY)
def handle_buy_start(message):
    clear_temp_order(message.from_user.id)
    bot.send_message(
        message.chat.id,
        "لطفاً ارزی که می‌خواهید خریداری کنید را انتخاب نمایید:",
        reply_markup=currency_inline_keyboard("buy")
    )


@bot.callback_query_handler(func=lambda call: call.data.startswith("buy_"))
def handle_buy_currency_selected(call):
    currency = call.data.split("buy_", 1)[1]
    user_id = call.from_user.id

    if currency not in PRICES:
        bot.answer_callback_query(call.id, "ارز نامعتبر است.")
        return

    temp_orders[user_id] = {"order_type": "buy", "currency": currency}

    bot.answer_callback_query(call.id)
    bot.send_message(
        call.message.chat.id,
        f"شما ارز <b>{currency}</b> را برای خرید انتخاب کردید.\n\n"
        f"لطفاً مقدار {currency} مورد نظر خود را به عدد وارد کنید:\n"
        f"(مثال: 10)",
        reply_markup=cancel_keyboard()
    )
    bot.register_next_step_handler(call.message, process_buy_amount, user_id=user_id)


def process_buy_amount(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "خرید لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not is_number(message.text) or float(message.text) <= 0:
        bot.send_message(message.chat.id, "❗️ لطفاً یک عدد معتبر و بزرگ‌تر از صفر وارد کنید:")
        bot.register_next_step_handler(message, process_buy_amount, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order:
        bot.send_message(message.chat.id, "خطا در فرآیند خرید. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    amount = float(message.text)
    currency = order["currency"]
    price = PRICES[currency]["buy"]
    total = round(amount * price, 2)

    order["amount"] = amount
    order["price"] = price
    order["total"] = total

    payment_text = "\n".join([f"• {name}: <code>{number}</code>" for name, number in PAYMENT_ACCOUNTS.items()])

    text = (
        "<b>🧾 خلاصه سفارش خرید</b>\n\n"
        f"ارز: <b>{currency}</b>\n"
        f"مقدار: {amount}\n"
        f"نرخ هر واحد: {price} {CURRENCY_UNIT}\n"
        f"مبلغ قابل پرداخت: <b>{total} {CURRENCY_UNIT}</b>\n\n"
        "<b>💳 اطلاعات پرداخت:</b>\n"
        f"{payment_text}\n\n"
        "لطفاً مبلغ فوق را به یکی از حساب‌های بالا واریز کرده و سپس عکس رسید پرداخت را ارسال نمایید."
    )
    bot.send_message(message.chat.id, text, reply_markup=cancel_keyboard())
    bot.register_next_step_handler(message, process_buy_receipt, user_id=user_id)


def process_buy_receipt(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "خرید لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not message.photo:
        bot.send_message(message.chat.id, "❗️ لطفاً عکس رسید پرداخت را ارسال کنید:")
        bot.register_next_step_handler(message, process_buy_receipt, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order:
        bot.send_message(message.chat.id, "خطا در فرآیند خرید. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    # عکس رسید موقتاً ذخیره می‌شود تا در مرحله بعد، همراه با آدرس ولت، سفارش نهایی ثبت گردد
    order["receipt_file_id"] = message.photo[-1].file_id
    currency = order["currency"]

    bot.send_message(
        message.chat.id,
        f"✅ رسید دریافت شد.\n\n"
        f"لطفاً آدرس کیف‌پول {currency} خود را جهت واریز ارز خریداری‌شده ارسال کنید.\n"
        f"(مثال: آدرس ولت خود روی شبکه BEP20 یا آیدی پرداخت بایننس / Binance Pay ID)",
        reply_markup=cancel_keyboard()
    )
    bot.register_next_step_handler(message, process_buy_wallet, user_id=user_id)


def process_buy_wallet(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "خرید لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not message.text or not message.text.strip():
        bot.send_message(message.chat.id, "❗️ لطفاً آدرس ولت یا آیدی پرداخت خود را به صورت متنی ارسال کنید:")
        bot.register_next_step_handler(message, process_buy_wallet, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order or "receipt_file_id" not in order:
        bot.send_message(message.chat.id, "خطا در فرآیند خرید. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    receive_info = message.text.strip()
    file_id = order["receipt_file_id"]

    order_id = create_order(
        user_id=user_id,
        order_type="buy",
        currency=order["currency"],
        amount=order["amount"],
        price=order["price"],
        total=order["total"],
        receive_info=receive_info,
    )
    set_order_receipt(order_id, file_id)
    clear_temp_order(user_id)

    sent_ok = send_order_to_admin(order_id, message.from_user, file_id)

    if sent_ok:
        bot.send_message(
            message.chat.id,
            "✅ سفارش شما با موفقیت ثبت شد و برای بررسی به ادمین ارسال گردید.\n"
            "پس از تایید رسید و ارسال ارز، به شما اطلاع داده خواهد شد.",
            reply_markup=main_menu_keyboard(user_id)
        )
    else:
        bot.send_message(
            message.chat.id,
            f"⚠️ سفارش شما با شماره #{order_id} در سیستم ثبت شد اما ارسال خودکار آن به ادمین با خطا مواجه شد.\n"
            "لطفاً از طریق بخش «🆘 پشتیبانی» شماره سفارش را برای ادمین ارسال کنید.",
            reply_markup=main_menu_keyboard(user_id)
        )


# =====================================================================================
#  فروش ارز
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_SELL)
def handle_sell_start(message):
    clear_temp_order(message.from_user.id)
    bot.send_message(
        message.chat.id,
        "لطفاً ارزی که می‌خواهید بفروشید را انتخاب نمایید:",
        reply_markup=currency_inline_keyboard("sell")
    )


@bot.callback_query_handler(func=lambda call: call.data.startswith("sell_"))
def handle_sell_currency_selected(call):
    currency = call.data.split("sell_", 1)[1]
    user_id = call.from_user.id

    if currency not in PRICES:
        bot.answer_callback_query(call.id, "ارز نامعتبر است.")
        return

    temp_orders[user_id] = {"order_type": "sell", "currency": currency}

    bot.answer_callback_query(call.id)
    bot.send_message(
        call.message.chat.id,
        f"شما ارز <b>{currency}</b> را برای فروش انتخاب کردید.\n\n"
        f"لطفاً مقدار {currency} مورد نظر خود را به عدد وارد کنید:\n"
        f"(مثال: 10)",
        reply_markup=cancel_keyboard()
    )
    bot.register_next_step_handler(call.message, process_sell_amount, user_id=user_id)


def process_sell_amount(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "فروش لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not is_number(message.text) or float(message.text) <= 0:
        bot.send_message(message.chat.id, "❗️ لطفاً یک عدد معتبر و بزرگ‌تر از صفر وارد کنید:")
        bot.register_next_step_handler(message, process_sell_amount, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order:
        bot.send_message(message.chat.id, "خطا در فرآیند فروش. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    amount = float(message.text)
    currency = order["currency"]
    price = PRICES[currency]["sell"]
    total = round(amount * price, 2)

    order["amount"] = amount
    order["price"] = price
    order["total"] = total

    wallet = WALLET_ADDRESSES.get(currency, "-")

    text = (
        "<b>🧾 خلاصه سفارش فروش</b>\n\n"
        f"ارز: <b>{currency}</b>\n"
        f"مقدار: {amount}\n"
        f"نرخ هر واحد: {price} {CURRENCY_UNIT}\n"
        f"مبلغ قابل دریافت شما: <b>{total} {CURRENCY_UNIT}</b>\n\n"
        f"<b>👛 آدرس کیف‌پول جهت واریز {currency}:</b>\n"
        f"<code>{wallet}</code>\n\n"
        "لطفاً مقدار ارز فوق را به آدرس بالا واریز کرده و سپس عکس رسید/تراکنش را ارسال نمایید."
    )
    bot.send_message(message.chat.id, text, reply_markup=cancel_keyboard())
    bot.register_next_step_handler(message, process_sell_receipt, user_id=user_id)


def process_sell_receipt(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "فروش لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not message.photo:
        bot.send_message(message.chat.id, "❗️ لطفاً عکس رسید/تراکنش را ارسال کنید:")
        bot.register_next_step_handler(message, process_sell_receipt, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order:
        bot.send_message(message.chat.id, "خطا در فرآیند فروش. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    # عکس رسید موقتاً ذخیره می‌شود تا در مرحله بعد، همراه با شماره حساب دریافتی، سفارش نهایی ثبت گردد
    order["receipt_file_id"] = message.photo[-1].file_id

    payment_names = " یا ".join(PAYMENT_ACCOUNTS.keys())
    bot.send_message(
        message.chat.id,
        f"✅ رسید دریافت شد.\n\n"
        f"لطفاً شماره حساب {payment_names} خود را جهت واریز مبلغ فروش ارسال کنید:",
        reply_markup=cancel_keyboard()
    )
    bot.register_next_step_handler(message, process_sell_payment_info, user_id=user_id)


def process_sell_payment_info(message, user_id):
    if message.text == BTN_CANCEL:
        clear_temp_order(user_id)
        bot.send_message(message.chat.id, "فروش لغو شد.", reply_markup=main_menu_keyboard(user_id))
        return

    if not message.text or not message.text.strip():
        bot.send_message(message.chat.id, "❗️ لطفاً شماره حساب خود را به صورت متنی ارسال کنید:")
        bot.register_next_step_handler(message, process_sell_payment_info, user_id=user_id)
        return

    order = temp_orders.get(user_id)
    if not order or "receipt_file_id" not in order:
        bot.send_message(message.chat.id, "خطا در فرآیند فروش. لطفاً دوباره تلاش کنید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    receive_info = message.text.strip()
    file_id = order["receipt_file_id"]

    order_id = create_order(
        user_id=user_id,
        order_type="sell",
        currency=order["currency"],
        amount=order["amount"],
        price=order["price"],
        total=order["total"],
        receive_info=receive_info,
    )
    set_order_receipt(order_id, file_id)
    clear_temp_order(user_id)

    sent_ok = send_order_to_admin(order_id, message.from_user, file_id)

    if sent_ok:
        bot.send_message(
            message.chat.id,
            "✅ سفارش فروش شما با موفقیت ثبت شد و برای بررسی به ادمین ارسال گردید.\n"
            "پس از تایید و ارسال، مبلغ به حساب شما واریز خواهد شد.",
            reply_markup=main_menu_keyboard(user_id)
        )
    else:
        bot.send_message(
            message.chat.id,
            f"⚠️ سفارش شما با شماره #{order_id} در سیستم ثبت شد اما ارسال خودکار آن به ادمین با خطا مواجه شد.\n"
            "لطفاً از طریق بخش «🆘 پشتیبانی» شماره سفارش را برای ادمین ارسال کنید.",
            reply_markup=main_menu_keyboard(user_id)
        )


# =====================================================================================
#  ارسال سفارش به ادمین و پردازش تایید / رد
# =====================================================================================

def send_order_to_admin(order_id, user, file_id):
    order = get_order(order_id)
    if not order:
        return

    username = f"@{escape_html(user.username)}" if user.username else "ندارد"

    if order["order_type"] == "buy":
        receive_label = "👛 آدرس ولت / آیدی دریافت ارز کاربر"
    else:
        receive_label = "💳 شماره حساب دریافتی کاربر (برای واریز مبلغ)"

    caption = (
        f"<b>🆕 سفارش جدید #{order_id}</b>\n\n"
        f"نوع سفارش: {ORDER_TYPE_LABELS.get(order['order_type'], order['order_type'])}\n"
        f"ارز: <b>{order['currency']}</b>\n"
        f"مقدار: {order['amount']}\n"
        f"نرخ: {order['price']} {CURRENCY_UNIT}\n"
        f"مبلغ کل: <b>{order['total']} {CURRENCY_UNIT}</b>\n\n"
        f"{receive_label}:\n<code>{escape_html(order['receive_info']) or '-'}</code>\n\n"
        f"👤 کاربر: {escape_html(user.first_name)} ({username})\n"
        f"🆔 آیدی: <code>{user.id}</code>\n"
        f"🕒 زمان ثبت: {order['created_at']}"
    )

    try:
        bot.send_photo(
            ADMIN_ID,
            file_id,
            caption=caption,
            reply_markup=order_admin_keyboard(order_id)
        )
        return True
    except Exception as exc:
        # این خطا معمولاً به یکی از این دو دلیل رخ می‌دهد:
        # ۱) ادمین (ADMIN_ID) هنوز به ربات پیام /start نداده است.
        # ۲) آیدی عددی ADMIN_ID اشتباه وارد شده است.
        logger.error("خطا در ارسال سفارش #%s به ادمین: %s", order_id, exc)
        print(f"[ERROR] ارسال سفارش #{order_id} به ادمین ناموفق بود: {exc}")
        return False


@bot.callback_query_handler(func=lambda call: call.data.startswith("order_confirm_") or call.data.startswith("order_reject_"))
def handle_order_decision(call):
    if call.from_user.id != ADMIN_ID:
        bot.answer_callback_query(call.id, "شما اجازه دسترسی به این بخش را ندارید.")
        return

    is_confirm = call.data.startswith("order_confirm_")
    order_id = int(call.data.split("_")[-1])
    order = get_order(order_id)

    if not order:
        bot.answer_callback_query(call.id, "سفارش یافت نشد.")
        return

    if order["status"] != "pending":
        bot.answer_callback_query(call.id, "این سفارش قبلاً بررسی شده است.")
        return

    new_status = "confirmed" if is_confirm else "rejected"
    update_order_status(order_id, new_status)

    # ویرایش کپشن پیام ادمین برای نمایش وضعیت جدید
    try:
        new_caption = call.message.caption + f"\n\n<b>وضعیت:</b> {STATUS_LABELS[new_status]}"
        bot.edit_message_caption(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            caption=new_caption,
            # اگر رسید تایید شده، دکمه «تکمیل ارسال» نمایش داده می‌شود؛ در غیر این صورت دکمه‌ای باقی نمی‌ماند
            reply_markup=order_complete_keyboard(order_id) if is_confirm else None
        )
    except Exception as exc:
        logger.error("خطا در ویرایش پیام ادمین: %s", exc)

    bot.answer_callback_query(call.id, "وضعیت سفارش ثبت شد.")

    # اطلاع‌رسانی به کاربر
    order_type_fa = ORDER_TYPE_LABELS.get(order["order_type"], order["order_type"])
    if is_confirm:
        if order["order_type"] == "buy":
            next_step_fa = f"ارز {order['currency']} به زودی به آدرس اعلام‌شده شما ارسال خواهد شد."
        else:
            next_step_fa = f"مبلغ {order['total']} {CURRENCY_UNIT} به زودی به حساب اعلام‌شده شما واریز خواهد شد."
        user_text = (
            f"✅ رسید سفارش {order_type_fa} شماره #{order_id} شما تایید شد.\n"
            f"ارز: {order['currency']} | مقدار: {order['amount']} | مبلغ: {order['total']} {CURRENCY_UNIT}\n\n"
            f"{next_step_fa}"
        )
    else:
        user_text = (
            f"❌ سفارش {order_type_fa} شماره #{order_id} شما رد شد.\n"
            f"ارز: {order['currency']} | مقدار: {order['amount']} | مبلغ: {order['total']} {CURRENCY_UNIT}\n\n"
            "در صورت داشتن سوال با پشتیبانی در تماس باشید."
        )

    try:
        bot.send_message(order["user_id"], user_text)
    except Exception as exc:
        logger.error("خطا در اطلاع‌رسانی به کاربر: %s", exc)


@bot.callback_query_handler(func=lambda call: call.data.startswith("order_complete_"))
def handle_order_complete(call):
    """وقتی ادمین ارز یا مبلغ را عملاً برای کاربر ارسال کرد، روی این دکمه می‌زند تا سفارش تکمیل شود."""
    if call.from_user.id != ADMIN_ID:
        bot.answer_callback_query(call.id, "شما اجازه دسترسی به این بخش را ندارید.")
        return

    order_id = int(call.data.split("_")[-1])
    order = get_order(order_id)

    if not order:
        bot.answer_callback_query(call.id, "سفارش یافت نشد.")
        return

    if order["status"] != "confirmed":
        bot.answer_callback_query(call.id, "این سفارش در وضعیت مناسبی برای تکمیل نیست.")
        return

    update_order_status(order_id, "completed")

    try:
        new_caption = call.message.caption + f"\n\n<b>وضعیت:</b> {STATUS_LABELS['completed']}"
        bot.edit_message_caption(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id,
            caption=new_caption,
            reply_markup=None
        )
    except Exception as exc:
        logger.error("خطا در ویرایش پیام ادمین: %s", exc)

    bot.answer_callback_query(call.id, "سفارش تکمیل شد.")

    order_type_fa = ORDER_TYPE_LABELS.get(order["order_type"], order["order_type"])
    if order["order_type"] == "buy":
        user_text = (
            f"🎉 سفارش {order_type_fa} شماره #{order_id} شما تکمیل شد.\n"
            f"مقدار {order['amount']} {order['currency']} به آدرس اعلام‌شده شما ارسال گردید.\n\n"
            "با تشکر از خرید شما."
        )
    else:
        user_text = (
            f"🎉 سفارش {order_type_fa} شماره #{order_id} شما تکمیل شد.\n"
            f"مبلغ {order['total']} {CURRENCY_UNIT} به حساب اعلام‌شده شما واریز گردید.\n\n"
            "با تشکر از اعتماد شما."
        )

    try:
        bot.send_message(order["user_id"], user_text)
    except Exception as exc:
        logger.error("خطا در اطلاع‌رسانی تکمیل سفارش به کاربر: %s", exc)


# =====================================================================================
#  تاریخچه سفارش‌ها
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_HISTORY)
def handle_history(message):
    user_id = message.from_user.id
    orders = get_user_orders(user_id)

    if not orders:
        bot.send_message(message.chat.id, "شما تاکنون هیچ سفارشی ثبت نکرده‌اید.",
                          reply_markup=main_menu_keyboard(user_id))
        return

    lines = ["<b>📜 تاریخچه سفارش‌های شما</b>\n"]
    for order in orders:
        order_type_fa = ORDER_TYPE_LABELS.get(order["order_type"], order["order_type"])
        status_fa = STATUS_LABELS.get(order["status"], order["status"])
        lines.append(
            f"#{order['order_id']} | {order_type_fa} {order['currency']}\n"
            f"مقدار: {order['amount']} | مبلغ: {order['total']} {CURRENCY_UNIT}\n"
            f"وضعیت: {status_fa} | تاریخ: {order['created_at']}\n"
        )

    bot.send_message(message.chat.id, "\n".join(lines), reply_markup=main_menu_keyboard(user_id))


# =====================================================================================
#  پشتیبانی
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_SUPPORT)
def handle_support_start(message):
    bot.send_message(
        message.chat.id,
        "لطفاً پیام یا سوال خود را برای پشتیبانی بنویسید:",
        reply_markup=cancel_keyboard()
    )
    bot.register_next_step_handler(message, process_support_message, user_id=message.from_user.id)


def process_support_message(message, user_id):
    if message.text == BTN_CANCEL:
        bot.send_message(message.chat.id, "به منوی اصلی بازگشتید.", reply_markup=main_menu_keyboard(user_id))
        return

    if not message.text:
        bot.send_message(message.chat.id, "❗️ لطفاً پیام خود را به صورت متنی ارسال کنید:")
        bot.register_next_step_handler(message, process_support_message, user_id=user_id)
        return

    support_id = create_support_message(user_id, message.text)

    bot.send_message(
        message.chat.id,
        "✅ پیام شما برای پشتیبانی ارسال شد. به زودی پاسخ داده خواهد شد.",
        reply_markup=main_menu_keyboard(user_id)
    )

    username = f"@{escape_html(message.from_user.username)}" if message.from_user.username else "ندارد"
    admin_text = (
        f"<b>📩 پیام پشتیبانی جدید #{support_id}</b>\n\n"
        f"👤 از طرف: {escape_html(message.from_user.first_name)} ({username})\n"
        f"🆔 آیدی: <code>{user_id}</code>\n\n"
        f"متن پیام:\n{escape_html(message.text)}"
    )
    try:
        bot.send_message(ADMIN_ID, admin_text, reply_markup=support_admin_keyboard(support_id, user_id))
    except Exception as exc:
        logger.error("خطا در ارسال پیام پشتیبانی به ادمین: %s", exc)


@bot.callback_query_handler(func=lambda call: call.data.startswith("support_reply_"))
def handle_support_reply_button(call):
    if call.from_user.id != ADMIN_ID:
        bot.answer_callback_query(call.id, "شما اجازه دسترسی به این بخش را ندارید.")
        return

    parts = call.data.split("_")
    support_id = int(parts[2])
    target_user_id = int(parts[3])

    admin_reply_target[ADMIN_ID] = {"user_id": target_user_id, "support_id": support_id}
    bot.answer_callback_query(call.id)
    bot.send_message(
        ADMIN_ID,
        f"✍️ لطفاً پاسخ خود برای کاربر <code>{target_user_id}</code> را بنویسید:"
    )
    bot.register_next_step_handler(call.message, process_admin_support_reply)


def process_admin_support_reply(message):
    if message.from_user.id != ADMIN_ID:
        return

    target = admin_reply_target.get(ADMIN_ID)
    if not target:
        bot.send_message(ADMIN_ID, "خطا: کاربر مقصد یافت نشد.")
        return

    reply_text = message.text or ""
    set_support_reply(target["support_id"], reply_text)

    try:
        bot.send_message(
            target["user_id"],
            f"<b>📩 پاسخ پشتیبانی:</b>\n\n{escape_html(reply_text)}"
        )
        bot.send_message(ADMIN_ID, "✅ پاسخ شما برای کاربر ارسال شد.")
    except Exception as exc:
        bot.send_message(ADMIN_ID, "❗️ ارسال پیام به کاربر با خطا مواجه شد.")
        logger.error("خطا در ارسال پاسخ پشتیبانی: %s", exc)

    admin_reply_target.pop(ADMIN_ID, None)


# =====================================================================================
#  آمار کاربران (مخصوص ادمین)
# =====================================================================================

@bot.message_handler(func=lambda m: m.text == BTN_ADMIN_STATS)
def handle_admin_stats(message):
    if message.from_user.id != ADMIN_ID:
        bot.send_message(message.chat.id, "شما اجازه دسترسی به این بخش را ندارید.")
        return

    stats = get_stats()
    text = (
        "<b>📊 آمار کلی ربات</b>\n\n"
        f"👥 تعداد کل کاربران: {stats['total_users']}\n"
        f"📦 تعداد کل سفارش‌ها: {stats['total_orders']}\n"
        f"⏳ سفارش‌های در انتظار: {stats['pending_orders']}\n"
        f"✅ رسیدهای تایید شده (در انتظار ارسال): {stats['confirmed_orders']}\n"
        f"🎉 سفارش‌های تکمیل شده: {stats['completed_orders']}\n"
        f"❌ سفارش‌های رد شده: {stats['rejected_orders']}\n"
    )
    bot.send_message(message.chat.id, text, reply_markup=main_menu_keyboard(message.from_user.id))


@bot.message_handler(commands=["admin"])
def handle_admin_command(message):
    handle_admin_stats(message)


# =====================================================================================
#  مدیریت پیام‌های نامشخص
# =====================================================================================

@bot.message_handler(func=lambda m: True, content_types=["text"])
def handle_unknown_text(message):
    # اگر کاربر در وسط یک فرآیند چندمرحله‌ای (خرید/فروش) است، این پیام نباید
    # با پاسخ next_step_handler تداخل ایجاد کند؛ چون در pyTelegramBotAPI هر دو
    # همزمان روی یک پیام اجرا می‌شوند.
    if message.from_user.id in temp_orders:
        return

    bot.send_message(
        message.chat.id,
        "متوجه درخواست شما نشدم. لطفاً از دکمه‌های منو استفاده کنید.",
        reply_markup=main_menu_keyboard(message.from_user.id)
    )


# =====================================================================================
#  اجرای ربات
# =====================================================================================

def main():
    init_db()
    logger.info("ربات صرافی ارز دیجیتال در حال اجراست...")
    bot.infinity_polling(skip_pending=True, timeout=30, long_polling_timeout=30)


if __name__ == "__main__":
    main()
