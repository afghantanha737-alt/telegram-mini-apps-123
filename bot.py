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
    ContextTypes,
)

from database import (
    init_db,
    add_or_update_user,
    add_referral,
    get_user_stats,
)


# ==========================================
# تنظیمات
# ==========================================

# توکن رباتت را اینجا قرار بده
BOT_TOKEN = "8587885341:AAELW-nePD8TlwCOGmbKESFzXAEbgu-DLKU"

# آدرس GitHub Pages مینی‌اپ خودت را اینجا قرار بده
WEB_APP_URL = "https://afghantanha737-alt.github.io/telegram-mini-apps-123/"

# username ربات
BOT_USERNAME = "AmirAFG123_bot"


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

    # --------------------------------------
    # ذخیره یا به‌روزرسانی کاربر
    # --------------------------------------

    add_or_update_user(
        user_id=user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
    )

    # --------------------------------------
    # بررسی Referral
    # --------------------------------------

    if context.args:

        start_parameter = context.args[0]

        if start_parameter.startswith("ref_"):

            referral_id = start_parameter[4:]

            try:

                referrer_id = int(referral_id)

                success = add_referral(
                    referrer_id=referrer_id,
                    invited_user_id=user_id,
                )

                if success:

                    logger.info(
                        "Referral registered: %s -> %s",
                        referrer_id,
                        user_id,
                    )

                else:

                    logger.info(
                        "Referral was not registered: %s -> %s",
                        referrer_id,
                        user_id,
                    )

            except ValueError:

                logger.warning(
                    "Invalid referral ID: %s",
                    referral_id,
                )

    # --------------------------------------
    # دریافت آمار کاربر
    # --------------------------------------

    stats = get_user_stats(user_id)

    points = stats["points"]
    referrals = stats["referrals"]
    tasks = stats["tasks"]

    # --------------------------------------
    # ساخت لینک Referral
    # --------------------------------------

    referral_link = (
        f"https://t.me/{BOT_USERNAME}"
        f"?start=ref_{user_id}"
    )

    # --------------------------------------
    # دکمه‌ها
    # --------------------------------------

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
                text="👥 دعوت دوستان",
                url=referral_link,
            )
        ],

    ]

    reply_markup = InlineKeyboardMarkup(
        keyboard
    )

    # --------------------------------------
    # پیام خوش‌آمدگویی
    # --------------------------------------

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

    # ساخت دیتابیس
    init_db()

    logger.info(
        "Starting Telegram bot..."
    )

    # ساخت Application
    application = (
        Application
        .builder()
        .token(BOT_TOKEN)
        .build()
    )

    # ثبت دستور /start
    application.add_handler(
        CommandHandler(
            "start",
            start,
        )
    )

    # ثبت دستور /help
    application.add_handler(
        CommandHandler(
            "help",
            help_command,
        )
    )

    logger.info(
        "Bot is running..."
    )

    # اجرای ربات
    application.run_polling(
        drop_pending_updates=True
    )


# ==========================================
# شروع برنامه
# ==========================================

if __name__ == "__main__":
    main()