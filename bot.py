"""
Amir Crypto Hub
Telegram Bot + Mini App API
"""

import os
import logging
import requests

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Database


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

CHANNEL_USERNAME = "AmirCryptoHub"

BOT_USERNAME = "AmirAFG123_bot"

# اگر Mini App روی GitHub Pages است، اینجا آدرس واقعی آن را بگذار
MINI_APP_URL = os.getenv(
    "MINI_APP_URL",
    "https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY/"
)


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=logging.INFO
)

logger = logging.getLogger(__name__)


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)

CORS(app)


# =========================================================
# DATABASE
# =========================================================

db = Database()


# =========================================================
# TELEGRAM HELPERS
# =========================================================

def telegram_request(method, payload=None):

    try:

        url = f"{TELEGRAM_API_URL}/{method}"

        response = requests.post(
            url,
            json=payload or {},
            timeout=15
        )

        return response.json()

    except Exception as e:

        logger.error(
            f"Telegram request error: {e}"
        )

        return {
            "ok": False,
            "description": str(e)
        }


def send_message(user_id, text):

    result = telegram_request(
        "sendMessage",
        {
            "chat_id": user_id,
            "text": text,
            "parse_mode": "HTML"
        }
    )

    return result.get("ok", False)


def check_user_membership(user_id):

    try:

        result = telegram_request(
            "getChatMember",
            {
                "chat_id": f"@{CHANNEL_USERNAME}",
                "user_id": user_id
            }
        )

        if not result.get("ok"):

            return {
                "is_member": False,
                "status": "error",
                "error": result.get(
                    "description",
                    "Telegram API error"
                )
            }

        status = result["result"]["status"]

        is_member = status in [
            "member",
            "administrator",
            "creator"
        ]

        return {
            "is_member": is_member,
            "status": status,
            "error": None
        }

    except Exception as e:

        logger.error(
            f"Membership error: {e}"
        )

        return {
            "is_member": False,
            "status": "error",
            "error": str(e)
        }


# =========================================================
# REFERRAL PROCESSING
# =========================================================

def process_referral(new_user_id, referral_code):

    if not referral_code:
        return False

    try:

        new_user = db.get_user(new_user_id)

        if not new_user:
            return False

        # اگر قبلاً معرف دارد، دوباره ثبت نکن
        if new_user.get("referred_by"):
            return False

        referrer = db.get_user_by_referral_code(
            referral_code
        )

        if not referrer:
            return False

        referrer_id = int(
            referrer["user_id"]
        )

        # دعوت کردن خودش ممنوع
        if referrer_id == int(new_user_id):
            return False

        # بررسی دعوت تکراری
        existing = db.get_referrals(
            referrer_id
        )

        for item in existing:

            if int(item["user_id"]) == int(new_user_id):
                return False

        # ثبت referral
        success = db.add_referral(
            referrer_id,
            int(new_user_id)
        )

        if not success:
            return False

        # ثبت معرف در users
        try:

            conn = db.get_connection()
            cursor = conn.cursor()

            cursor.execute(
                """
                UPDATE users
                SET referred_by = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    referrer_id,
                    int(new_user_id)
                )
            )

            conn.commit()
            conn.close()

        except Exception as e:

            logger.error(
                f"Could not save referred_by: {e}"
            )

        # اطلاع به معرف
        new_points = db.get_points(
            referrer_id
        )

        send_message(
            referrer_id,
            (
                "<b>🎉 دعوت موفق!</b>\n\n"
                "یک نفر با لینک دعوت شما وارد شد.\n\n"
                "<b>+5 ⭐ امتیاز</b>\n"
                f"⭐ امتیاز فعلی شما: <b>{new_points}</b>"
            )
        )

        return True

    except Exception as e:

        logger.error(
            f"Referral processing error: {e}"
        )

        return False


# =========================================================
# HEALTH
# =========================================================

@app.route("/", methods=["GET"])
def home():

    return jsonify({
        "success": True,
        "status": "ok",
        "message": "Amir Crypto Hub API is running",
        "referral": "enabled"
    })


@app.route("/api/health", methods=["GET"])
def health():

    return jsonify({
        "success": True,
        "status": "ok",
        "message": "Bot is running",
        "referral": "enabled"
    })


# =========================================================
# TELEGRAM WEBHOOK
# =========================================================

@app.route("/webhook", methods=["POST"])
def webhook():

    try:

        update = request.get_json(
            silent=True
        ) or {}

        message = update.get(
            "message"
        )

        if not message:
            return jsonify({
                "ok": True
            })

        user = message.get(
            "from"
        ) or {}

        user_id = user.get("id")

        username = user.get(
            "username",
            "unknown"
        )

        first_name = user.get(
            "first_name",
            "User"
        )

        if not user_id:
            return jsonify({
                "ok": True
            })

        db.get_or_create_user(
            int(user_id),
            username,
            first_name
        )

        text = message.get(
            "text",
            ""
        )

        if text.startswith("/start"):

            parts = text.split(
                maxsplit=1
            )

            referral_code = None

            if len(parts) == 2:
                referral_code = parts[1].strip()

            if referral_code:

                process_referral(
                    int(user_id),
                    referral_code
                )

            welcome_text = (
                f"<b>سلام {first_name} 👋</b>\n\n"
                "به <b>Amir Crypto Hub</b> خوش آمدید! 🚀\n\n"
                "در Mini App می‌توانید تسک انجام دهید، "
                "امتیاز بگیرید و دوستان خود را دعوت کنید."
            )

            send_message(
                int(user_id),
                welcome_text
            )

        return jsonify({
            "ok": True
        })

    except Exception as e:

        logger.error(
            f"Webhook error: {e}"
        )

        return jsonify({
            "ok": True
        })


# =========================================================
# USER INIT
# =========================================================

@app.route("/api/user/init", methods=["POST"])
def user_init():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = data.get(
            "user_id"
        )

        username = data.get(
            "username",
            "unknown"
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
                "success": False,
                "message": "Missing user_id"
            }), 400

        user_id = int(user_id)

        user = db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        # اگر Referral از Mini App آمده
        if referral_code:

            process_referral(
                user_id,
                referral_code
            )

            user = db.get_user(
                user_id
            )

        stats = db.get_user_stats(
            user_id
        )

        return jsonify({
            "success": True,
            "user": user,
            "stats": stats
        })

    except Exception as e:

        logger.error(
            f"User init error: {e}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# USER STATS
# =========================================================

@app.route("/api/user/stats", methods=["GET"])
def user_stats():

    try:

        user_id = request.args.get(
            "user_id",
            type=int
        )

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        stats = db.get_user_stats(
            user_id
        )

        if not stats:

            return jsonify({
                "success": False,
                "message": "User not found"
            }), 404

        return jsonify({
            "success": True,
            "stats": stats
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# POINTS
# =========================================================

@app.route("/api/user/points", methods=["GET"])
def user_points():

    try:

        user_id = request.args.get(
            "user_id",
            type=int
        )

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        points = db.get_points(
            user_id
        )

        return jsonify({
            "success": True,
            "points": points
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# REFERRALS
# =========================================================

@app.route("/api/referrals", methods=["GET"])
def referrals():

    try:

        user_id = request.args.get(
            "user_id",
            type=int
        )

        if not user_id:

            # سازگاری با نسخه قبلی
            user_id = request.args.get(
                "userID",
                type=int
            )

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        referral_list = db.get_referrals(
            user_id
        )

        count = len(
            referral_list
        )

        points = db.get_points(
            user_id
        )

        return jsonify({
            "success": True,
            "referrals": referral_list,
            "referrals_count": count,
            "points": points
        })

    except Exception as e:

        logger.error(
            f"Referral route error: {e}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# CHECK MEMBERSHIP
# =========================================================

@app.route(
    "/api/check-membership",
    methods=["POST"]
)
def check_membership():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = (
            data.get("user_id")
            or data.get("userID")
        )

        username = data.get(
            "username",
            "unknown"
        )

        first_name = data.get(
            "first_name",
            "User"
        )

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        user_id = int(user_id)

        db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        membership = check_user_membership(
            user_id
        )

        if not membership["is_member"]:

            return jsonify({
                "success": True,
                "isMember": False,
                "status": membership["status"],
                "message": "ابتدا در کانال عضو شوید."
            })

        already = db.is_task_completed(
            user_id,
            "channel_join"
        )

        if already:

            return jsonify({
                "success": True,
                "isMember": True,
                "alreadyRewarded": True,
                "pointsAwarded": 0,
                "points": db.get_points(
                    user_id
                ),
                "totalPoints": db.get_points(
                    user_id
                ),
                "message": "این تسک قبلاً انجام شده است."
            })

        success, already = db.complete_task(
            user_id,
            "channel_join",
            10
        )

        if not success:

            return jsonify({
                "success": False,
                "message": "خطا در ثبت امتیاز"
            }), 500

        total_points = db.get_points(
            user_id
        )

        send_message(
            user_id,
            (
                "<b>🎉 تبریک!</b>\n\n"
                "برای عضویت در کانال "
                "<b>۱۰ امتیاز</b> دریافت کردید.\n\n"
                f"⭐ امتیاز شما: <b>{total_points}</b>"
            )
        )

        return jsonify({
            "success": True,
            "isMember": True,
            "alreadyRewarded": False,
            "pointsAwarded": 10,
            "points": total_points,
            "totalPoints": total_points,
            "message": "امتیاز با موفقیت اضافه شد."
        })

    except Exception as e:

        logger.error(
            f"Membership error: {e}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# LEADERBOARD
# =========================================================

@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():

    try:

        limit = request.args.get(
            "limit",
            10,
            type=int
        )

        limit = min(
            max(limit, 1),
            100
        )

        return jsonify({
            "success": True,
            "leaderboard": db.get_top_users(
                limit
            )
        })

    except Exception as e:

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# 404
# =========================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "success": False,
        "message": "Route not found"
    }), 404


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    port = int(
        os.getenv(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )