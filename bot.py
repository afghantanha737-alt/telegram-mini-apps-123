"""
Telegram Bot + Mini App API
Amir Crypto Hub
"""

import os
import logging
import requests

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Database


# =========================
# ENVIRONMENT
# =========================

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

CHANNEL_USERNAME = "AmirCryptoHub"


# =========================
# LOGGING
# =========================

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


# =========================
# FLASK
# =========================

app = Flask(__name__)

CORS(app)


# =========================
# DATABASE
# =========================

db = Database()


# =========================
# TELEGRAM FUNCTIONS
# =========================

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


def send_notification(user_id: int, message: str) -> bool:

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

        return response.json().get("ok", False)

    except Exception as e:

        logger.error(
            f"Notification error: {str(e)}"
        )

        return False


# =========================
# HEALTH
# =========================

@app.route("/api/health", methods=["GET"])
def health_check():

    return jsonify({
        "status": "ok",
        "message": "Bot is running"
    })


# =========================
# USER INIT
# =========================

@app.route("/api/user/init", methods=["POST"])
def user_init():

    try:

        data = request.get_json(silent=True) or {}

        user_id = data.get("user_id")
        username = data.get("username", "unknown")
        first_name = data.get("first_name", "User")

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        user = db.get_or_create_user(
            int(user_id),
            username,
            first_name
        )

        stats = db.get_user_stats(
            int(user_id)
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


# =========================
# GET USER STATS
# =========================

@app.route("/api/user/stats", methods=["GET"])
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

        stats = db.get_user_stats(user_id)

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


# =========================
# GET USER POINTS
# =========================

@app.route("/api/user/points", methods=["GET"])
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

        points = db.get_points(user_id)

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


# =========================
# CHECK CHANNEL MEMBERSHIP
# =========================

@app.route("/api/check-membership", methods=["POST"])
def check_membership():

    try:

        data = request.get_json(silent=True) or {}

        user_id = data.get("user_id") or data.get("userID")
        username = data.get("username", "unknown")
        first_name = data.get("first_name", "User")

        if not user_id:

            return jsonify({
                "success": False,
                "message": "Missing user_id"
            }), 400

        user_id = int(user_id)

        # Make sure user exists
        db.get_or_create_user(
            user_id,
            username,
            first_name
        )

        # Check whether task was already rewarded
        already_completed = db.is_task_completed(
            user_id,
            "channel_join"
        )

        # Check real Telegram membership
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

        # Already rewarded
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

        # Complete task
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

        # Get REAL points from database
        total_points = db.get_points(
            user_id
        )

        # Notification
        send_notification(
            user_id,
            (
                "<b>🎉 تبریک!</b>\n\n"
                "برای عضویت در کانال "
                "<b>۱۰ امتیاز</b> دریافت کردید!\n\n"
                f"⭐ کل امتیاز شما: <b>{total_points}</b>"
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


# =========================
# COMPLETE TASK
# =========================

@app.route("/api/tasks/complete", methods=["POST"])
def complete_task():

    try:

        data = request.get_json(silent=True) or {}

        user_id = data.get("user_id")
        task_name = data.get("task_name")

        if not user_id or not task_name:

            return jsonify({
                "success": False,
                "message": "Missing required fields"
            }), 400

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
            int(user_id),
            task_name,
            points
        )

        if not success:

            return jsonify({
                "success": False,
                "message": "Error completing task"
            }), 500

        total_points = db.get_points(
            int(user_id)
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


# =========================
# LEADERBOARD
# =========================

@app.route("/api/leaderboard", methods=["GET"])
def get_leaderboard():

    try:

        limit = request.args.get(
            "limit",
            10,
            type=int
        )

        limit = min(max(limit, 1), 100)

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


# =========================
# 404
# =========================

@app.errorhandler(404)
def not_found(error):

    return jsonify({
        "success": False,
        "message": "Route not found"
    }), 404


# =========================
# 500
# =========================

@app.errorhandler(500)
def internal_error(error):

    logger.error(
        f"Internal server error: {str(error)}"
    )

    return jsonify({
        "success": False,
        "message": "Internal server error"
    }), 500


# =========================
# RUN
# =========================

if __name__ == "__main__":

    port = int(
        os.getenv("PORT", 5000)
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )