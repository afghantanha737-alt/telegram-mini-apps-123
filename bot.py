import logging

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

import os

BOT_TOKEN = os.getenv("8587885341:AAELW-nePD8TlwCOGmbKESFzXAEbgu-DLKU")
WEB_APP_URL = "https://afghantanha737-alt.github.io/telegram-mini-apps-123/"

BOT_USERNAME = "AmirAFG123_bot"

# کانال تسک
CHANNEL_USERNAME = "@AmirCryptoHub"

# امتیاز تسک عضویت
CHANNEL_TASK_POINTS = 10


# ==========================================
# Logging
# ==========================================

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger(__name__)


# ==========================================
# /start
# ==========================================

async def start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
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

    # Referral
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

    stats = get_user_stats(user_id)

    points = stats["points"]
    referrals = stats["referrals"]
    tasks = stats["tasks"]

    referral_link = (
        f"https://t.me/{BOT_USERNAME}"
        f"?start=ref_{user_id}"
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

    reply_markup = InlineKeyboardMarkup(
        keyboard
    )

    first_name = user.first_name or "دوست عزیز"

    text = (
        f"سلام {first_name} 👋\n\n"
        "به ربات ما خوش آمدی! 🎉\n\n"
        f"⭐ امتیاز: {points}\n"
        f"👥 دعوت‌های موفق: {referrals}\n"
        f"📋 وظایف: {tasks}\n\n"
        "برای ورود به Mini App روی دکمه زیر بزن."
    )

    await update.message.reply_text(
        text=text,
        reply_markup=reply_markup,
    )


# ==========================================
# نمایش تسک‌ها
# ==========================================

async def show_tasks(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
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
        f"🎁 پاداش: {CHANNEL_TASK_POINTS} امتیاز\n\n"
        "ابتدا عضو کانال شو، سپس روی "
        "«✅ بررسی عضویت» بزن."
    )

    await query.edit_message_text(
        text=text,
        reply_markup=reply_markup,
    )


# ==========================================
# بررسی عضویت کانال
# ==========================================

async def check_channel_membership(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
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

        if status in [
            "member",
            "administrator",
            "creator",
        ]:

            success = complete_task(
                user_id=user.id,
                task_name="channel_membership",
                points=CHANNEL_TASK_POINTS,
            )

            if success:

                stats = get_user_stats(user.id)

                await query.edit_message_text(
                    text=(
                        "🎉 تبریک!\n\n"
                        "عضویت شما با موفقیت تأیید شد.\n\n"
                        f"⭐ +{CHANNEL_TASK_POINTS} امتیاز دریافت کردی!\n\n"
                        f"💰 امتیاز فعلی: {stats['points']}"
                    ),
                    reply_markup=InlineKeyboardMarkup([
                        [
                            InlineKeyboardButton(
                                text="📋 تسک‌ها",
                                callback_data="tasks",
                            )
                        ]
                    ]),
                )

            else:

                stats = get_user_stats(user.id)

                await query.edit_message_text(
                    text=(
                        "✅ این تسک قبلاً انجام شده است.\n\n"
                        f"⭐ امتیاز شما: {stats['points']}"
                    ),
                    reply_markup=InlineKeyboardMarkup([
                        [
                            InlineKeyboardButton(
                                text="📋 تسک‌ها",
                                callback_data="tasks",
                            )
                        ]
                    ]),
                )

        else:

            await query.edit_message_text(
                text=(
                    "❌ هنوز عضو کانال نیستی.\n\n"
                    "اول عضو کانال شو، سپس دوباره "
                    "«بررسی عضویت» را بزن."
                ),
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton(
                            text="📢 عضویت در کانال",
                            url="https://t.me/AmirCryptoHub",
                        )
                    ],
                    [
                        InlineKeyboardButton(
                            text="🔄 بررسی دوباره",
                            callback_data="check_channel",
                        )
                    ]
                ]),
            )

    except Exception as error:

        logger.error(
            "Channel membership check error: %s",
            error,
        )

        await query.edit_message_text(
            text=(
                "⚠️ فعلاً امکان بررسی عضویت وجود ندارد.\n\n"
                "لطفاً چند لحظه بعد دوباره امتحان کن."
            ),
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        text="🔄 دوباره امتحان کن",
                        callback_data="check_channel",
                    )
                ]
            ]),
        )


# ==========================================
# برگشت به صفحه اصلی
# ==========================================

async def back_start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
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
            f"سلام {user.first_name or 'دوست عزیز'} 👋\n\n"
            "به ربات ما خوش آمدی! 🎉\n\n"
            f"⭐ امتیاز: {stats['points']}\n"
            f"👥 دعوت‌های موفق: {stats['referrals']}\n"
            f"📋 وظایف: {stats['tasks']}"
        ),
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ==========================================
# /help
# ==========================================

async def help_command(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE
):

    await update.message.reply_text(
        "برای شروع استفاده از ربات، دستور /start را ارسال کن."
    )


# ==========================================
# اجرای ربات
# ==========================================

def main():

    init_db()

    application = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .build()
    )

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

    logger.info("Bot is running...")

    application.run_polling(
        drop_pending_updates=True
    )


# ==========================================
# شروع
# ==========================================

if __name__ == "__main__":
    main()