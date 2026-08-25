"""
Telegram Bot + Mini App API
Amir Crypto Hub

Features:
- Flask API
- Telegram Webhook
- Real Referral System
- SQLite Database
- Channel Membership Check
- Task Completion
- User Stats
- Leaderboard
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

TELEGRAM_API_URL = (
    f"https://api.telegram.org/bot{BOT_TOKEN}"
)

CHANNEL_USERNAME = "AmirCryptoHub"


# =========================================================
# LOGGING
# =========================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
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
# TELEGRAM FUNCTIONS
# =========================================================

def check_user_membership(user_id: int) -> dict:

    try:

        url = f"{TELEGRAM_API_URL}/getChatMember"

        params = {
            "chat_id": f"@{CHANNEL_USERNAME}",
            "user_id": user_id
        }

        response = requests.get(
            url,
            params=params,
            timeout=10
        )

        data = response.json()

        if not data.get("ok"):

            error_msg = data.get(
                "description",
                "Unknown Telegram API error"
            )

            logger.error(
                f"Telegram API error: {error_msg}"
            )

            return {
                "is_member": False,
                "status": "error",
                "error": error_msg
            }

        user_status = data["result"]["status"]

        is_member = user_status in [
            "member",
            "administrator",
            "creator"
        ]

        return {
            "is_member": is_member,
            "status": user_status,
            "error": None
        }

    except requests.exceptions.Timeout:

        return {
            "is_member": False,
            "status": "timeout",
            "error": "Connection timeout"
        }

    except Exception as e:

        logger.error(
            f"Membership error: {str(e)}"
        )

        return {
            "is_member": False,
            "status": "error",
            "error": str(e)
        }


def send_notification(
    user_id: int,
    message: str
) -> bool:

    try:

        url = f"{TELEGRAM_API_URL}/sendMessage"

        payload = {
            "chat_id": user_id,
            "text": message,
            "parse_mode": "HTML"
        }

        response = requests.post(
            url,
            json=payload,
            timeout=10
        )

        result = response.json()

        if not result.get("ok"):

            logger.error(
                f"Telegram sendMessage error: {result}"
            )

        return result.get("ok", False)

    except Exception as e:

        logger.error(
            f"Notification error: {str(e)}"
        )

        return False


# =========================================================
# REFERRAL SYSTEM
# =========================================================

def handle_start_command(
    user_id: int,
    username: str,
    first_name: str,
    start_parameter: str = None
):

    try:

        # -------------------------------------------------
        # Create / Get User
        # -------------------------------------------------

        user = db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        if not user:

            return {
                "success": False,
                "referral": False,
                "message": "Could not create user"
            }

        # -------------------------------------------------
        # Normal /start
        # -------------------------------------------------

        if not start_parameter:

            return {
                "success": True,
                "referral": False,
                "message": "Normal start"
            }

        # -------------------------------------------------
        # Validate referral parameter
        # -------------------------------------------------

        if not start_parameter.startswith("ref_"):

            return {
                "success": True,
                "referral": False,
                "message": "Invalid referral code"
            }

        referral_code = start_parameter.strip()

        # -------------------------------------------------
        # Find Referrer
        # -------------------------------------------------

        referrer = db.get_user_by_referral_code(
            referral_code
        )

        if not referrer:

            logger.info(
                f"Referral code not found: {referral_code}"
            )

            return {
                "success": True,
                "referral": False,
                "message": "Referral code not found"
            }

        referrer_id = int(
            referrer["user_id"]
        )

        # -------------------------------------------------
        # Prevent Self Referral
        # -------------------------------------------------

        if referrer_id == user_id:

            logger.warning(
                f"Self referral blocked: {user_id}"
            )

            return {
                "success": True,
                "referral": False,
                "status": "self_referral",
                "message": "Self referral blocked"
            }

        # -------------------------------------------------
        # Register Referral
        # -------------------------------------------------

        success, status = db.add_referral(
            referrer_id,
            user_id
        )

        if not success:

            logger.info(
                f"Referral not registered: "
                f"{user_id} -> {referrer_id}, "
                f"status={status}"
            )

            return {
                "success": True,
                "referral": False,
                "status": status,
                "message": "Referral already processed"
            }

        # -------------------------------------------------
        # Get Referrer Points
        # -------------------------------------------------

        total_points = db.get_points(
            referrer_id
        )

        # -------------------------------------------------
        # Notify Referrer
        # -------------------------------------------------

        send_notification(
            referrer_id,
            (
                "<b>🎉 دعوت جدید!</b>\n\n"
                f"👤 {first_name} با لینک دعوت شما وارد شد.\n\n"
                "⭐ <b>۵ امتیاز</b> دریافت کردید!\n\n"
                f"💰 امتیاز فعلی شما: "
                f"<b>{total_points}</b>"
            )
        )

        # -------------------------------------------------
        # Notify New User
        # -------------------------------------------------

        send_notification(
            user_id,
            (
                "<b>🎉 خوش آمدید!</b>\n\n"
                "لینک دعوت با موفقیت ثبت شد. ✅\n\n"
                "اکنون می‌توانید وارد Mini App شوید "
                "و تسک‌ها را انجام دهید."
            )
        )

        logger.info(
            f"Referral success: "
            f"referrer={referrer_id}, "
            f"user={user_id}"
        )

        return {
            "success": True,
            "referral": True,
            "referrer_id": referrer_id,
            "points_awarded": 5,
            "total_referrer_points": total_points,
            "message": "Referral successfully registered"
        }

    except Exception as e:

        logger.error(
            f"Start command error: {str(e)}"
        )

        return {
            "success": False,
            "referral": False,
            "message": str(e)
        }


# =========================================================
# HEALTH
# =========================================================

@app.route(
    "/api/health",
    methods=["GET"]
)
def health_check():

    return jsonify({
        "status": "ok",
        "message": "Bot is running",
        "referral": "enabled"
    })


# =========================================================
# USER INIT
# =========================================================

@app.route(
    "/api/user/init",
    methods=["POST"]
)
def user_init():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = data.get("user_id")

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

        user = db.get_or_create_user(
            user_id,
            username,
            first_name
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
            f"User init error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# USER STATS
# =========================================================

@app.route(
    "/api/user/stats",
    methods=["GET"]
)
def get_user_stats():

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

        logger.error(
            f"Stats error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# USER POINTS
# =========================================================

@app.route(
    "/api/user/points",
    methods=["GET"]
)
def get_user_points():

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
            "points": points,
            "user_id": user_id
        })

    except Exception as e:

        logger.error(
            f"Points error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# CHECK CHANNEL MEMBERSHIP
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

        # ---------------------------------------------
        # Make sure user exists
        # ---------------------------------------------

        db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        # ---------------------------------------------
        # Check Telegram Membership
        # ---------------------------------------------

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

        # ---------------------------------------------
        # Check Existing Reward
        # ---------------------------------------------

        already_completed = db.is_task_completed(
            user_id,
            "channel_join"
        )

        if already_completed:

            current_points = db.get_points(
                user_id
            )

            return jsonify({
                "success": True,
                "isMember": True,
                "alreadyRewarded": True,
                "pointsAwarded": 0,
                "totalPoints": current_points,
                "message": "این تسک قبلاً انجام شده است."
            })

        # ---------------------------------------------
        # Complete Channel Task
        # ---------------------------------------------

        success, already_completed = db.complete_task(
            user_id,
            "channel_join",
            10
        )

        if not success:

            return jsonify({
                "success": False,
                "message": "خطا در ذخیره امتیاز"
            }), 500

        total_points = db.get_points(
            user_id
        )

        # ---------------------------------------------
        # Notification
        # ---------------------------------------------

        send_notification(
            user_id,
            (
                "<b>🎉 تبریک!</b>\n\n"
                "برای عضویت در کانال "
                "<b>۱۰ امتیاز</b> دریافت کردید!\n\n"
                f"⭐ کل امتیاز شما: "
                f"<b>{total_points}</b>"
            )
        )

        return jsonify({
            "success": True,
            "isMember": True,
            "alreadyRewarded": False,
            "pointsAwarded": 10,
            "totalPoints": total_points,
            "message": "امتیاز با موفقیت اضافه شد."
        })

    except Exception as e:

        logger.error(
            f"Membership route error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# COMPLETE TASK
# =========================================================

@app.route(
    "/api/tasks/complete",
    methods=["POST"]
)
def complete_task():

    try:

        data = request.get_json(
            silent=True
        ) or {}

        user_id = data.get(
            "user_id"
        )

        task_name = data.get(
            "task_name"
        )

        if not user_id or not task_name:

            return jsonify({
                "success": False,
                "message": "Missing required fields"
            }), 400

        user_id = int(user_id)

        task_points = {
            "channel_join": 10,
            "referral": 5,
            "share": 3
        }

        points = task_points.get(
            task_name,
            0
        )

        if points == 0:

            return jsonify({
                "success": False,
                "message": "Invalid task"
            }), 400

        success, already_completed = db.complete_task(
            user_id,
            task_name,
            points
        )

        if not success:

            return jsonify({
                "success": False,
                "message": "Error completing task"
            }), 500

        total_points = db.get_points(
            user_id
        )

        if already_completed:

            return jsonify({
                "success": True,
                "alreadyCompleted": True,
                "pointsAwarded": 0,
                "totalPoints": total_points,
                "message": "Task already completed"
            })

        return jsonify({
            "success": True,
            "alreadyCompleted": False,
            "pointsAwarded": points,
            "totalPoints": total_points,
            "message": "Task completed successfully"
        })

    except Exception as e:

        logger.error(
            f"Complete task error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# LEADERBOARD
# =========================================================

@app.route(
    "/api/leaderboard",
    methods=["GET"]
)
def get_leaderboard():

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

        users = db.get_top_users(
            limit
        )

        return jsonify({
            "success": True,
            "leaderboard": users
        })

    except Exception as e:

        logger.error(
            f"Leaderboard error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# TELEGRAM WEBHOOK
# =========================================================

@app.route(
    "/telegram/webhook",
    methods=["POST"]
)
def telegram_webhook():

    try:

        update = request.get_json(
            silent=True
        ) or {}

        logger.info(
            f"Telegram update received: {update}"
        )

        message = update.get(
            "message"
        )

        if not message:

            return jsonify({
                "ok": True
            })

        telegram_user = (
            message.get("from")
            or {}
        )

        user_id = telegram_user.get(
            "id"
        )

        if not user_id:

            return jsonify({
                "ok": True
            })

        username = telegram_user.get(
            "username",
            "unknown"
        )

        first_name = telegram_user.get(
            "first_name",
            "User"
        )

        text = message.get(
            "text",
            ""
        )

        # -------------------------------------------------
        # /start
        # -------------------------------------------------

        if text.startswith("/start"):

            parts = text.split(
                maxsplit=1
            )

            start_parameter = None

            if len(parts) == 2:

                start_parameter = (
                    parts[1].strip()
                )

            result = handle_start_command(
                user_id=int(user_id),
                username=username,
                first_name=first_name,
                start_parameter=start_parameter
            )

            logger.info(
                f"/start result: {result}"
            )

            # ---------------------------------------------
            # Welcome Message
            # ---------------------------------------------

            if result.get("referral"):

                send_notification(
                    int(user_id),
                    (
                        "<b>🎉 دعوت با موفقیت ثبت شد!</b>\n\n"
                        "خوش آمدید به "
                        "<b>Amir Crypto Hub</b> 🚀\n\n"
                        "اکنون Mini App را باز کنید "
                        "و فعالیت خود را شروع کنید."
                    )
                )

            else:

                send_notification(
                    int(user_id),
                    (
                        "<b>👋 خوش آمدید!</b>\n\n"
                        "به <b>Amir Crypto Hub</b> خوش آمدید. 🚀\n\n"
                        "Mini App را باز کنید و "
                        "تسک‌ها را انجام دهید."
                    )
                )

        return jsonify({
            "ok": True
        })

    except Exception as e:

        logger.error(
            f"Webhook error: {str(e)}"
        )

        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500


# =========================================================
# SET TELEGRAM WEBHOOK
# =========================================================

@app.route(
    "/api/set-webhook",
    methods=["GET"]
)
def set_webhook():

    try:

        webhook_url = request.args.get(
            "url"
        )

        if not webhook_url:

            return jsonify({
                "success": False,
                "message": "Missing webhook URL"
            }), 400

        if not webhook_url.startswith(
            "https://"
        ):

            return jsonify({
                "success": False,
                "message": "Webhook must use HTTPS"
            }), 400

        telegram_url = (
            f"{TELEGRAM_API_URL}/setWebhook"
        )

        response = requests.post(
            telegram_url,
            json={
                "url": webhook_url
            },
            timeout=10
        )

        result = response.json()

        logger.info(
            f"Webhook setup result: {result}"
        )

        return jsonify({
            "success": result.get(
                "ok",
                False
            ),
            "telegram": result
        })

    except Exception as e:

        logger.error(
            f"Webhook setup error: {str(e)}"
        )

        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================================================
# WEBHOOK INFO
# =========================================================

@app.route(
    "/api/webhook-info",
    methods=["GET"]
)
def webhook_info():

    try:

        url = (
            f"{TELEGRAM_API_URL}/getWebhookInfo"
        )

        response = requests.get(
            url,
            timeout=10
        )

        result = response.json()

        return jsonify({
            "success": result.get(
                "ok",
                False
            ),
            "telegram": result
        })

    except Exception as e:

        logger.error(
            f"Webhook info error: {str(e)}"
        )

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
# 500
# =========================================================

@app.errorhandler(500)
def internal_error(error):

    logger.error(
        f"Internal server error: {str(error)}"
    )

    return jsonify({
        "success": False,
        "message": "Internal server error"
    }), 500


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

    logger.info(
        f"Starting server on port {port}"
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )