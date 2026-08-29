import os
import logging
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

from database import Database


# =========================================================
# CONFIG
# =========================================================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

BOT_USERNAME = os.getenv(
    "BOT_USERNAME",
    "AmirAFG123_bot"
).strip().lstrip("@")

CHANNEL_USERNAME = os.getenv(
    "CHANNEL_USERNAME",
    "AmirCryptoHub"
).strip().lstrip("@")

WEB_APP_URL = os.getenv(
    "WEB_APP_URL",
    "https://afghantanha737-alt.github.io/telegram-mini-apps-123/"
).strip()

ADMIN_IDS_TEXT = os.getenv(
    "ADMIN_IDS",
    ""
).strip()

ADMIN_IDS = set()

if ADMIN_IDS_TEXT:
    for value in ADMIN_IDS_TEXT.split(","):
        value = value.strip()
        if value.isdigit():
            ADMIN_IDS.add(int(value))


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger("amir_crypto_hub")


# =========================================================
# DATABASE
# =========================================================

db = Database()


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*"
        }
    }
)


# =========================================================
# TELEGRAM API
# =========================================================

TELEGRAM_API = ""

if BOT_TOKEN:
    TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


def telegram_request(method, data=None):
    """
    Send request to Telegram Bot API.
    """

    if not BOT_TOKEN:
        return {
            "ok": False,
            "error": "BOT_TOKEN is not configured"
        }

    try:

        response = requests.post(
            f"{TELEGRAM_API}/{method}",
            json=data or {},
            timeout=15
        )

        return response.json()

    except Exception as exc:

        logger.error(
            "Telegram API error: %s",
            exc
        )

        return {
            "ok": False,
            "error": str(exc)
        }


# =========================================================
# ADMIN CHECK
# =========================================================

def is_admin(user_id):
    try:
        return int(user_id) in ADMIN_IDS
    except Exception:
        return False


# =========================================================
# TELEGRAM MEMBERSHIP
# =========================================================

def check_channel_membership(user_id):
    """
    Check whether a Telegram user is a member of
    @AmirCryptoHub.
    """

    if not BOT_TOKEN:
        return False

    result = telegram_request(
        "getChatMember",
        {
            "chat_id": f"@{CHANNEL_USERNAME}",
            "user_id": int(user_id)
        }
    )

    if not result.get("ok"):
        logger.warning(
            "Membership check failed: %s",
            result
        )
        return False

    member = result.get("result", {})

    status = member.get("status", "")

    return status in (
        "creator",
        "administrator",
        "member"
    )


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return jsonify({
        "message": "Amir Crypto Hub API is running",
        "status": "ok",
        "referral": "enabled",
        "database": (
            "PostgreSQL"
            if db.using_postgres()
            else "SQLite"
        )
    })


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    try:

        stats = db.get_database_stats()

        return jsonify({
            "status": "ok",
            "database": (
                "PostgreSQL"
                if db.using_postgres()
                else "SQLite"
            ),
            "users": stats["users"]
        })

    except Exception as exc:

        logger.exception("Health check failed")

        return jsonify({
            "status": "error",
            "error": str(exc)
        }), 500


# =========================================================
# USER INIT
# =========================================================

@app.post("/api/user/init")
def user_init():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = data.get("user_id")

        username = data.get(
            "username",
            ""
        )

        first_name = data.get(
            "first_name",
            "User"
        )

        referral_code = data.get(
            "referral_code"
        )

        if not user_id:

            return jsonify({
                "ok": False,
                "error": "user_id is required"
            }), 400

        user_id = int(user_id)

        user = db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        # ---------------------------------------------
        # REFERRAL
        # ---------------------------------------------

        if referral_code:

            referrer = db.get_user_by_referral_code(
                referral_code
            )

            if referrer:

                db.add_referral(
                    referrer["user_id"],
                    user_id,
                    5
                )

        stats = db.get_user_stats(
            user_id
        )

        referral_link = (
            f"https://t.me/{BOT_USERNAME}"
            f"?start=ref_{user_id}"
        )

        return jsonify({
            "ok": True,
            "user": stats,
            "referral_link": referral_link
        })

    except Exception as exc:

        logger.exception(
            "User initialization failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# USER DATA
# =========================================================

@app.get("/api/user/<int:user_id>")
def get_user_data(user_id):

    try:

        stats = db.get_user_stats(
            user_id
        )

        if not stats:

            return jsonify({
                "ok": False,
                "error": "User not found"
            }), 404

        referral_link = (
            f"https://t.me/{BOT_USERNAME}"
            f"?start=ref_{user_id}"
        )

        return jsonify({
            "ok": True,
            "user": stats,
            "referral_link": referral_link
        })

    except Exception as exc:

        logger.exception(
            "Get user failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# CHECK CHANNEL
# =========================================================

@app.post("/api/task/channel")
def channel_task():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = data.get("user_id")

        if not user_id:

            return jsonify({
                "ok": False,
                "error": "user_id is required"
            }), 400

        user_id = int(user_id)

        user = db.get_user(
            user_id
        )

        if not user:

            return jsonify({
                "ok": False,
                "error": "User not found"
            }), 404

        completed = db.is_task_completed(
            user_id,
            "channel_join"
        )

        if completed:

            return jsonify({
                "ok": True,
                "completed": True,
                "already": True,
                "points": db.get_points(user_id)
            })

        is_member = check_channel_membership(
            user_id
        )

        if not is_member:

            return jsonify({
                "ok": False,
                "completed": False,
                "error": "not_member",
                "message": (
                    f"ابتدا عضو کانال "
                    f"@{CHANNEL_USERNAME} شوید."
                )
            }), 403

        success, already = db.complete_task(
            user_id,
            "channel_join",
            10
        )

        if not success:

            return jsonify({
                "ok": False,
                "error": "Could not complete task"
            }), 500

        return jsonify({
            "ok": True,
            "completed": True,
            "already": already,
            "earned": 0 if already else 10,
            "points": db.get_points(user_id)
        })

    except Exception as exc:

        logger.exception(
            "Channel task failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# REFERRALS
# =========================================================

@app.get("/api/referrals/<int:user_id>")
def get_referrals(user_id):

    try:

        referrals = db.get_referrals(
            user_id
        )

        return jsonify({
            "ok": True,
            "count": len(referrals),
            "referrals": referrals
        })

    except Exception as exc:

        logger.exception(
            "Get referrals failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# LEADERBOARD
# =========================================================

@app.get("/api/leaderboard")
def leaderboard():

    try:

        limit = request.args.get(
            "limit",
            10
        )

        users = db.get_top_users(
            int(limit)
        )

        return jsonify({
            "ok": True,
            "users": users
        })

    except Exception as exc:

        logger.exception(
            "Leaderboard failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# ADMIN STATS
# =========================================================

@app.get("/api/admin/stats")
def admin_stats():

    try:

        user_id = request.args.get(
            "user_id"
        )

        if not user_id or not is_admin(
            int(user_id)
        ):

            return jsonify({
                "ok": False,
                "error": "Unauthorized"
            }), 403

        stats = db.get_database_stats()

        return jsonify({
            "ok": True,
            "stats": stats
        })

    except Exception as exc:

        logger.exception(
            "Admin stats failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# ADMIN USERS
# =========================================================

@app.get("/api/admin/users")
def admin_users():

    try:

        admin_id = request.args.get(
            "user_id"
        )

        if not admin_id or not is_admin(
            int(admin_id)
        ):

            return jsonify({
                "ok": False,
                "error": "Unauthorized"
            }), 403

        limit = request.args.get(
            "limit",
            50
        )

        offset = request.args.get(
            "offset",
            0
        )

        search = request.args.get(
            "search",
            ""
        )

        users = db.get_all_users(
            int(limit),
            int(offset),
            search
        )

        return jsonify({
            "ok": True,
            "users": users
        })

    except Exception as exc:

        logger.exception(
            "Admin users failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# ADMIN CHANGE POINTS
# =========================================================

@app.post("/api/admin/points")
def admin_points():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        admin_id = data.get(
            "admin_id"
        )

        target_user_id = data.get(
            "user_id"
        )

        amount = data.get(
            "amount"
        )

        reason = data.get(
            "reason",
            "Admin adjustment"
        )

        if not admin_id:

            return jsonify({
                "ok": False,
                "error": "admin_id is required"
            }), 400

        if not is_admin(
            int(admin_id)
        ):

            return jsonify({
                "ok": False,
                "error": "Unauthorized"
            }), 403

        if target_user_id is None:

            return jsonify({
                "ok": False,
                "error": "user_id is required"
            }), 400

        if amount is None:

            return jsonify({
                "ok": False,
                "error": "amount is required"
            }), 400

        success, new_points = db.change_points(
            int(target_user_id),
            int(amount),
            reason
        )

        if not success:

            return jsonify({
                "ok": False,
                "error": "User not found"
            }), 404

        return jsonify({
            "ok": True,
            "user_id": int(target_user_id),
            "points": new_points
        })

    except Exception as exc:

        logger.exception(
            "Admin points failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# ADMIN REFERRALS
# =========================================================

@app.get("/api/admin/referrals")
def admin_referrals():

    try:

        admin_id = request.args.get(
            "user_id"
        )

        if not admin_id or not is_admin(
            int(admin_id)
        ):

            return jsonify({
                "ok": False,
                "error": "Unauthorized"
            }), 403

        limit = request.args.get(
            "limit",
            100
        )

        referrals = db.get_recent_referrals(
            int(limit)
        )

        return jsonify({
            "ok": True,
            "referrals": referrals
        })

    except Exception as exc:

        logger.exception(
            "Admin referrals failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# BOT COMMAND: /START
# =========================================================

def handle_start_message(message):

    chat = message.get(
        "chat",
        {}
    )

    user = message.get(
        "from",
        {}
    )

    chat_id = chat.get(
        "id"
    )

    user_id = user.get(
        "id"
    )

    username = user.get(
        "username",
        ""
    )

    first_name = user.get(
        "first_name",
        "User"
    )

    if not user_id or not chat_id:
        return

    db.get_or_create_user(
        int(user_id),
        username,
        first_name
    )

    text = (
        f"سلام {first_name} 👋\n\n"
        "به Amir Crypto Hub خوش آمدید! 🚀\n\n"
        "در اینجا می‌توانید با انجام تسک‌ها "
        "پوینت دریافت کنید و با دعوت دوستان "
        "امتیاز بیشتری بگیرید.\n\n"
        "برای شروع روی دکمه زیر بزنید 👇"
    )

    keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "🚀 Open Mini App",
                    "web_app": {
                        "url": WEB_APP_URL
                    }
                }
            ],
            [
                {
                    "text": "📢 کانال",
                    "url": f"https://t.me/{CHANNEL_USERNAME}"
                }
            ]
        ]
    }

    telegram_request(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "reply_markup": keyboard
        }
    )


# =========================================================
# TELEGRAM WEBHOOK
# =========================================================

@app.post("/webhook")
def webhook():

    try:

        update = request.get_json(
            silent=True
        ) or {}

        if "message" in update:

            message = update["message"]

            text = message.get(
                "text",
                ""
            )

            if text.startswith("/start"):

                parts = text.split(
                    maxsplit=1
                )

                if len(parts) > 1:

                    start_parameter = parts[1].strip()

                    user = message.get(
                        "from",
                        {}
                    )

                    user_id = user.get(
                        "id"
                    )

                    if (
                        user_id
                        and start_parameter.startswith("ref_")
                    ):

                        try:

                            referrer_id = int(
                                start_parameter[4:]
                            )

                            db.get_or_create_user(
                                int(user_id),
                                user.get(
                                    "username",
                                    ""
                                ),
                                user.get(
                                    "first_name",
                                    "User"
                                )
                            )

                            db.get_or_create_user(
                                referrer_id
                            )

                            db.add_referral(
                                referrer_id,
                                int(user_id),
                                5
                            )

                        except Exception as exc:

                            logger.error(
                                "Referral error: %s",
                                exc
                            )

                handle_start_message(
                    message
                )

        return jsonify({
            "ok": True
        })

    except Exception as exc:

        logger.exception(
            "Webhook error"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# SET WEBHOOK
# =========================================================

@app.post("/api/setup/webhook")
def setup_webhook():

    try:

        webhook_url = request.json.get(
            "url"
        ) if request.is_json else None

        if not webhook_url:

            return jsonify({
                "ok": False,
                "error": "url is required"
            }), 400

        result = telegram_request(
            "setWebhook",
            {
                "url": webhook_url
            }
        )

        return jsonify(result)

    except Exception as exc:

        logger.exception(
            "Set webhook failed"
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


# =========================================================
# ERROR HANDLER
# =========================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "ok": False,
        "error": "Route not found"
    }), 404


@app.errorhandler(405)
def method_not_allowed(error):

    return jsonify({
        "ok": False,
        "error": "Method Not Allowed",
        "message": (
            "This endpoint requires a different HTTP method."
        )
    }), 405


@app.errorhandler(500)
def internal_error(error):

    return jsonify({
        "ok": False,
        "error": "Internal Server Error"
    }), 500


# =========================================================
# START
# =========================================================

def run_flask():

    port = int(
        os.getenv(
            "PORT",
            "10000"
        )
    )

    app.run(
        host="0.0.0.0",
        port=port
    )


def main():

    logger.info(
        "======================================"
    )

    logger.info(
        "Amir Crypto Hub"
    )

    logger.info(
        "API starting..."
    )

    logger.info(
        "Database: %s",
        (
            "PostgreSQL"
            if db.using_postgres()
            else "SQLite"
        )
    )

    logger.info(
        "Bot: @%s",
        BOT_USERNAME
    )

    logger.info(
        "Channel: @%s",
        CHANNEL_USERNAME
    )

    logger.info(
        "Web App: %s",
        WEB_APP_URL
    )

    logger.info(
        "Admins: %s",
        list(ADMIN_IDS)
    )

    logger.info(
        "======================================"
    )

    run_flask()


if __name__ == "__main__":
    main()