import os
import logging

from flask import Flask, request, jsonify
from threading import Thread

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)

from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
)

from database import (
    init_db,
    add_or_update_user,
    add_referral,
    get_user_stats,
    complete_task,
)


# ==========================================
# تنظیمات
# ==========================================

BOT_TOKEN = os.getenv("8587885341:AAELW-nePD8TlwCOGmbKESFzXAEbgu-DLKU")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")


WEB_APP_URL = (
    "https://afghantanha737-alt.github.io/"
    "telegram-mini-apps-123/"
)

BOT_USERNAME = "AmirAFG123_bot"

CHANNEL_USERNAME = "@AmirCryptoHub"

CHANNEL_TASK_POINTS = 10


# ==========================================
# Logging
# ==========================================

logging.basicConfig(
    format=(
        "%(asctime)s - "
        "%(name)s - "
        "%(levelname)s - "
        "%(message)s"
    ),
    level=logging.INFO,
)

logger = logging.getLogger(__name__)


# ==========================================
# Flask
# ==========================================

web_app = Flask(__name__)


@web_app.route("/")
def home():

    return "Bot is running."


@web_app.route("/health")
def health():

    return jsonify({
        "status": "ok",
        "bot": "online",
    })


# ==========================================
# /start
# ==========================================

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    user = update.effective_user

    if user is None:
        return

    user_id = user.id

    add_or_update_user(
        user_id=user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
    )

    # ======================================
    # Referral
    # ======================================

    if context.args:

        start_parameter = context.args[0]

        if start_parameter.startswith("ref_"):

            referral_id = start_parameter[4:]

            try:

                referrer_id = int(referral_id)

                add_referral(
                    referrer_id=referrer_id,
                    invited_user_id=user_id,
                )

            except ValueError:

                logger.warning(
                    "Invalid referral ID: %s",
                    referral_id,
                )

    # ======================================
    # آمار
    # ======================================

    stats = get_user_stats(user_id)

    points = stats["points"]
    referrals = stats["referrals"]
    tasks = stats["tasks"]

    # ======================================
    # Referral Link
    # ======================================

    referral_link = (
        f"https://t.me/{BOT_USERNAME}"
        f"?start=ref_{user_id}"
    )

    # ======================================
    # Buttons
    # ======================================

    keyboard = [

        [
            InlineKeyboardButton(
                text="🚀 باز کردن Mini App",
                web_app=WebAppInfo(
                    url=WEB_APP_URL
                ),
            )
        ],

        [
            InlineKeyboardButton(
                text="📋 تسک‌ها",
                callback_data="tasks",
            )
        ],

        [
            InlineKeyboardButton(
                text="👥 دعوت دوستان",
                url=referral_link,
            )
        ],

    ]

    reply_markup = InlineKeyboardMarkup(
        keyboard
    )

    # ======================================
    # Welcome
    # ======================================

    first_name = (
        user.first_name
        or "دوست عزیز"
    )

    text = (
        f"سلام {first_name} 👋\n\n"
        "به ربات ما خوش آمدی! 🎉\n\n"
        f"⭐ امتیاز: {points}\n"
        f"👥 دعوت‌های موفق: {referrals}\n"
        f"📋 وظایف: {tasks}\n\n"
        "برای ورود به Mini App روی "
        "دکمه زیر بزن."
    )

    await update.message.reply_text(
        text=text,
        reply_markup=reply_markup,
    )


# ==========================================
# Tasks
# ==========================================

async def show_tasks(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    query = update.callback_query

    await query.answer()

    keyboard = [

        [
            InlineKeyboardButton(
                text="📢 عضویت در کانال",
                url="https://t.me/AmirCryptoHub",
            )
        ],

        [
            InlineKeyboardButton(
                text="✅ بررسی عضویت",
                callback_data="check_channel",
            )
        ],

        [
            InlineKeyboardButton(
                text="🔙 برگشت",
                callback_data="back_start",
            )
        ],

    ]

    reply_markup = InlineKeyboardMarkup(
        keyboard
    )

    text = (
        "📋 تسک‌های فعال\n\n"
        "1️⃣ عضویت در کانال\n\n"
        f"🎁 پاداش: "
        f"{CHANNEL_TASK_POINTS} امتیاز\n\n"
        "ابتدا عضو کانال شو، سپس روی "
        "«✅ بررسی عضویت» بزن."
    )

    await query.edit_message_text(
        text=text,
        reply_markup=reply_markup,
    )


# ==========================================
# Check Channel Membership
# ==========================================

async def check_channel_membership(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    try:

        member = await context.bot.get_chat_member(
            chat_id=CHANNEL_USERNAME,
            user_id=user.id,
        )

        status = member.status

        is_member = status in [
            "member",
            "administrator",
            "creator",
        ]

        if not is_member:

            await query.edit_message_text(
                text=(
                    "❌ هنوز عضو کانال نیستی.\n\n"
                    "ابتدا عضو کانال شو و سپس "
                    "دوباره بررسی کن."
                ),
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton(
                            text="📢 عضویت در کانال",
                            url=(
                                "https://t.me/"
                                "AmirCryptoHub"
                            ),
                        )
                    ],
                    [
                        InlineKeyboardButton(
                            text="🔄 بررسی دوباره",
                            callback_data=(
                                "check_channel"
                            ),
                        )
                    ],
                ]),
            )

            return

        # ==================================
        # Complete Task
        # ==================================

        success = complete_task(
            user_id=user.id,
            task_name="channel_membership",
            points=CHANNEL_TASK_POINTS,
        )

        stats = get_user_stats(user.id)

        if success:

            message = (
                "🎉 تبریک!\n\n"
                "عضویت شما تأیید شد.\n\n"
                f"⭐ +{CHANNEL_TASK_POINTS} "
                "امتیاز دریافت کردی!\n\n"
                f"💰 امتیاز فعلی: "
                f"{stats['points']}"
            )

        else:

            message = (
                "✅ این تسک قبلاً انجام شده است.\n\n"
                f"⭐ امتیاز شما: "
                f"{stats['points']}"
            )

        await query.edit_message_text(
            text=message,
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        text="📋 تسک‌ها",
                        callback_data="tasks",
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="🏠 برگشت",
                        callback_data="back_start",
                    )
                ],
            ]),
        )

    except Exception as error:

        logger.exception(
            "Membership check error"
        )

        await query.edit_message_text(
            text=(
                "⚠️ خطایی هنگام بررسی عضویت "
                "رخ داد.\n\n"
                "لطفاً دوباره امتحان کن."
            ),
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        text="🔄 دوباره امتحان کن",
                        callback_data=(
                            "check_channel"
                        ),
                    )
                ]
            ]),
        )


# ==========================================
# Back
# ==========================================

async def back_start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    query = update.callback_query

    await query.answer()

    user = query.from_user

    stats = get_user_stats(user.id)

    referral_link = (
        f"https://t.me/{BOT_USERNAME}"
        f"?start=ref_{user.id}"
    )

    keyboard = [

        [
            InlineKeyboardButton(
                text="🚀 باز کردن Mini App",
                web_app=WebAppInfo(
                    url=WEB_APP_URL
                ),
            )
        ],

        [
            InlineKeyboardButton(
                text="📋 تسک‌ها",
                callback_data="tasks",
            )
        ],

        [
            InlineKeyboardButton(
                text="👥 دعوت دوستان",
                url=referral_link,
            )
        ],

    ]

    await query.edit_message_text(
        text=(
            f"سلام "
            f"{user.first_name or 'دوست عزیز'} 👋\n\n"
            "به ربات ما خوش آمدی! 🎉\n\n"
            f"⭐ امتیاز: {stats['points']}\n"
            f"👥 دعوت‌های موفق: "
            f"{stats['referrals']}\n"
            f"📋 وظایف: {stats['tasks']}"
        ),
        reply_markup=InlineKeyboardMarkup(
            keyboard
        ),
    )


# ==========================================
# /help
# ==========================================

async def help_command(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
):

    await update.message.reply_text(
        "برای شروع استفاده از ربات، "
        "دستور /start را ارسال کن."
    )


# ==========================================
# Flask Server
# ==========================================

def run_web_server():

    port = int(
        os.environ.get(
            "PORT",
            10000
        )
    )

    web_app.run(
        host="0.0.0.0",
        port=port,
    )


# ==========================================
# Main
# ==========================================

def main():

    # ======================================
    # Database
    # ======================================

    init_db()

    logger.info(
        "Starting Telegram bot..."
    )

    # ======================================
    # Flask
    # ======================================

    web_thread = Thread(
        target=run_web_server,
        daemon=True,
    )

    web_thread.start()

    logger.info(
        "Web server started."
    )

    # ======================================
    # Telegram Application
    # ======================================

    application = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .build()
    )

    # ======================================
    # Handlers
    # ======================================

    application.add_handler(
        CommandHandler(
            "start",
            start,
        )
    )

    application.add_handler(
        CommandHandler(
            "help",
            help_command,
        )
    )

    application.add_handler(
        CallbackQueryHandler(
            show_tasks,
            pattern="^tasks$",
        )
    )

    application.add_handler(
        CallbackQueryHandler(
            check_channel_membership,
            pattern="^check_channel$",
        )
    )

    application.add_handler(
        CallbackQueryHandler(
            back_start,
            pattern="^back_start$",
        )
    )

    logger.info(
        "Bot is running..."
    )

    # ======================================
    # Polling
    # ======================================

    application.run_polling(
        drop_pending_updates=True
    )


# ==========================================
# Start
# ==========================================

if __name__ == "__main__":

    main()