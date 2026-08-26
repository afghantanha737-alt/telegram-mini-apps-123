"""
Amir Crypto Hub - Telegram Bot + Mini App API
این فایل با database.py و index.html هماهنگ است.
"""

import os
import logging
import hmac
import hashlib
import json
from urllib.parse import parse_qsl
from datetime import datetime

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from database import Database

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

BOT_USERNAME = os.getenv("BOT_USERNAME", "AmirAFG123_bot").lstrip("@")
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME", "AmirCryptoHub").lstrip("@")

# Render automatically provides this variable.
BASE_URL = os.getenv("RENDER_EXTERNAL_URL", "").rstrip("/")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "").strip()

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("amir_crypto_hub")

app = Flask(__name__)
CORS(app)

db = Database()


def telegram_call(method, payload=None, timeout=15):
    try:
        response = requests.post(
            f"{TELEGRAM_API_URL}/{method}",
            json=payload or {},
            timeout=timeout,
        )
        return response.json()
    except Exception as exc:
        logger.exception("Telegram API error: %s", exc)
        return {"ok": False, "description": str(exc)}


def send_message(chat_id, text):
    return telegram_call(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        },
    )


def check_user_membership(user_id):
    try:
        response = requests.get(
            f"{TELEGRAM_API_URL}/getChatMember",
            params={
                "chat_id": f"@{CHANNEL_USERNAME}",
                "user_id": user_id,
            },
            timeout=10,
        )
        data = response.json()

        if not data.get("ok"):
            return {
                "is_member": False,
                "status": "error",
                "error": data.get("description", "Telegram API error"),
            }

        status = data["result"]["status"]
        return {
            "is_member": status in ("member", "administrator", "creator"),
            "status": status,
            "error": None,
        }
    except requests.RequestException as exc:
        return {
            "is_member": False,
            "status": "error",
            "error": str(exc),
        }


def verify_telegram_init_data(init_data):
    """
    اعتبارسنجی Telegram WebApp initData.
    اگر initData خالی باشد False برمی‌گرداند.
    """
    if not init_data:
        return None

    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = pairs.pop("hash", None)
        if not received_hash:
            return None

        data_check_string = "\n".join(
            f"{key}={pairs[key]}" for key in sorted(pairs)
        )

        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256,
        ).digest()

        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        user_json = pairs.get("user")
        if not user_json:
            return None

        return json.loads(user_json)
    except Exception:
        return None


def get_request_user(data):
    """
    اول Telegram initData را بررسی می‌کند.
    برای سازگاری با نسخه فعلی Mini App، اگر initData قابل استفاده نبود
    userID/user_id را هم می‌خواند.
    """
    init_data = data.get("initData") or data.get("init_data")
    verified_user = verify_telegram_init_data(init_data)

    if verified_user and verified_user.get("id"):
        return {
            "id": int(verified_user["id"]),
            "username": verified_user.get("username", ""),
            "first_name": verified_user.get("first_name", "کاربر"),
        }

    raw_id = data.get("userID") or data.get("user_id")
    if not raw_id:
        return None

    try:
        return {
            "id": int(raw_id),
            "username": data.get("username", ""),
            "first_name": data.get("firstName")
            or data.get("first_name")
            or "کاربر",
        }
    except (TypeError, ValueError):
        return None


def user_json(user):
    if not user:
        return None

    result = dict(user)

    # Make names expected by index.html explicit.
    result["referrals_count"] = db.count_referrals(result["user_id"])
    result["tasks_completed"] = len(db.get_completed_tasks(result["user_id"]))
    result["completed_tasks"] = db.get_completed_tasks(result["user_id"])

    return result


def process_start_command(user_id, username, first_name, start_parameter=None):
    """
    ثبت کاربر و referral فقط یک‌بار.
    self-referral و referral تکراری نادیده گرفته می‌شوند.
    """
    user = db.get_or_create_user(user_id, username or "", first_name or "کاربر")

    if start_parameter and start_parameter.startswith("ref_"):
        referrer = db.get_user_by_referral_code(start_parameter)

        if referrer and referrer["user_id"] != user_id:
            # فقط اگر این کاربر قبلاً referral نداشته باشد.
            existing = db.get_user(user_id)
            if existing and existing.get("referred_by") is None:
                db.add_referral(referrer["user_id"], user_id)

                try:
                    conn = db.get_connection()
                    conn.execute(
                        "UPDATE users SET referred_by=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?",
                        (referrer["user_id"], user_id),
                    )
                    conn.commit()
                    conn.close()
                except Exception:
                    logger.exception("Could not update referred_by")

                send_message(
                    referrer["user_id"],
                    (
                        "🎉 <b>دعوت موفق!</b>\n\n"
                        f"یک نفر با لینک دعوت شما وارد شد.\n"
                        "⭐ <b>۵ امتیاز</b> به حساب شما اضافه شد."
                    ),
                )

                send_message(
                    user_id,
                    "🎉 دعوت شما با موفقیت ثبت شد و در سیستم فعال شدید."
                )

    return user


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "ok",
        "message": "Amir Crypto Hub API is running",
        "referral": "enabled",
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "message": "Bot is running",
        "referral": "enabled",
    })


@app.route("/api/user", methods=["POST"])
@app.route("/api/user/init", methods=["POST"])
def api_user():
    try:
        data = request.get_json(silent=True) or {}
        user_info = get_request_user(data)

        if not user_info:
            return jsonify({
                "success": False,
                "message": "Missing or invalid Telegram user",
            }), 400

        user = db.get_or_create_user(
            user_info["id"],
            user_info["username"],
            user_info["first_name"],
        )

        return jsonify({
            "success": True,
            "user": user_json(user),
        })
    except Exception as exc:
        logger.exception("User API error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/user/stats", methods=["GET"])
def api_user_stats():
    try:
        user_id = request.args.get("user_id", type=int)
        if not user_id:
            return jsonify({"success": False, "message": "Missing user_id"}), 400

        stats = db.get_user_stats(user_id)
        if not stats:
            return jsonify({"success": False, "message": "User not found"}), 404

        stats["referral_code"] = db.get_user(user_id).get("referral_code")
        stats["completed_tasks"] = db.get_completed_tasks(user_id)

        return jsonify({"success": True, "stats": stats})
    except Exception as exc:
        logger.exception("Stats error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/user/points", methods=["GET"])
def api_points():
    try:
        user_id = request.args.get("user_id", type=int)
        if not user_id:
            return jsonify({"success": False, "message": "Missing user_id"}), 400

        return jsonify({
            "success": True,
            "points": db.get_points(user_id),
            "user_id": user_id,
        })
    except Exception as exc:
        logger.exception("Points error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/referrals", methods=["GET"])
def api_referrals():
    try:
        user_id = request.args.get("userID", type=int)
        if not user_id:
            user_id = request.args.get("user_id", type=int)

        if not user_id:
            return jsonify({"success": False, "message": "Missing userID"}), 400

        user = db.get_user(user_id)
        if not user:
            return jsonify({
                "success": True,
                "referrals": [],
                "count": 0,
            })

        referrals = db.get_referrals(user_id)

        return jsonify({
            "success": True,
            "referrals": referrals,
            "count": len(referrals),
        })
    except Exception as exc:
        logger.exception("Referrals error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/check-membership", methods=["POST"])
def api_check_membership():
    try:
        data = request.get_json(silent=True) or {}
        user_info = get_request_user(data)

        if not user_info:
            return jsonify({
                "success": False,
                "message": "کاربر تلگرام شناسایی نشد.",
            }), 400

        user_id = user_info["id"]

        db.get_or_create_user(
            user_id,
            user_info["username"],
            user_info["first_name"],
        )

        membership = check_user_membership(user_id)

        if not membership["is_member"]:
            return jsonify({
                "success": True,
                "isMember": False,
                "status": membership["status"],
                "message": "ابتدا در کانال عضو شوید.",
            })

        # IMPORTANT: database.py uses channel_join consistently.
        task_name = "channel_join"

        if db.is_task_completed(user_id, task_name):
            return jsonify({
                "success": True,
                "isMember": True,
                "alreadyRewarded": True,
                "pointsAwarded": 0,
                "points": db.get_points(user_id),
                "totalPoints": db.get_points(user_id),
                "message": "این تسک قبلاً انجام شده است.",
            })

        success, already = db.complete_task(user_id, task_name, 10)

        if not success:
            return jsonify({
                "success": False,
                "message": "خطا در ذخیره امتیاز",
            }), 500

        total = db.get_points(user_id)

        send_message(
            user_id,
            (
                "🎉 <b>تبریک!</b>\n\n"
                "برای عضویت در کانال "
                "<b>۱۰ امتیاز</b> دریافت کردید.\n\n"
                f"⭐ کل امتیاز شما: <b>{total}</b>"
            ),
        )

        return jsonify({
            "success": True,
            "isMember": True,
            "alreadyRewarded": already,
            "pointsAwarded": 10,
            "points": total,
            "totalPoints": total,
            "message": "امتیاز با موفقیت اضافه شد.",
        })
    except Exception as exc:
        logger.exception("Membership route error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/tasks/complete", methods=["POST"])
def api_complete_task():
    try:
        data = request.get_json(silent=True) or {}
        user_info = get_request_user(data)
        task_name = data.get("task_name")

        if not user_info or not task_name:
            return jsonify({
                "success": False,
                "message": "Missing required fields",
            }), 400

        points_map = {
            "channel_join": 10,
            "channel": 10,
            "share": 3,
        }

        if task_name not in points_map:
            return jsonify({
                "success": False,
                "message": "Invalid task",
            }), 400

        # Normalize old frontend name.
        normalized = "channel_join" if task_name == "channel" else task_name
        points = points_map[task_name]

        db.get_or_create_user(
            user_info["id"],
            user_info["username"],
            user_info["first_name"],
        )

        success, already = db.complete_task(
            user_info["id"],
            normalized,
            points,
        )

        if not success:
            return jsonify({
                "success": False,
                "message": "Error completing task",
            }), 500

        total = db.get_points(user_info["id"])

        return jsonify({
            "success": True,
            "alreadyCompleted": already,
            "pointsAwarded": 0 if already else points,
            "points": total,
            "totalPoints": total,
        })
    except Exception as exc:
        logger.exception("Complete task error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    try:
        limit = request.args.get("limit", 10, type=int)
        limit = min(max(limit, 1), 100)
        return jsonify({
            "success": True,
            "leaderboard": db.get_top_users(limit),
        })
    except Exception as exc:
        logger.exception("Leaderboard error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/telegram/webhook", methods=["POST"])
def telegram_webhook():
    # Optional secret protection.
    if WEBHOOK_SECRET:
        received = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not hmac.compare_digest(received, WEBHOOK_SECRET):
            return jsonify({"ok": False}), 403

    try:
        update = request.get_json(silent=True) or {}
        message = update.get("message") or {}
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        text = message.get("text") or ""

        user_id = from_user.get("id")
        if user_id:
            username = from_user.get("username", "")
            first_name = from_user.get("first_name", "کاربر")

            if text.startswith("/start"):
                parts = text.split(maxsplit=1)
                start_parameter = parts[1].strip() if len(parts) == 2 else None

                process_start_command(
                    int(user_id),
                    username,
                    first_name,
                    start_parameter,
                )

                send_message(
                    int(chat.get("id", user_id)),
                    (
                        f"👋 <b>سلام {first_name}!</b>\n\n"
                        "به <b>Amir Crypto Hub</b> خوش آمدید. 🚀\n\n"
                        "از دکمه Mini App برای شروع استفاده کنید."
                    ),
                )

        return jsonify({"ok": True})
    except Exception:
        logger.exception("Webhook processing error")
        # Always return 200 so Telegram does not endlessly retry malformed updates.
        return jsonify({"ok": True})


@app.route("/api/set-webhook", methods=["GET"])
def set_webhook():
    """
    بعد از Deploy، اگر RENDER_EXTERNAL_URL موجود باشد،
    وبهوک ربات را تنظیم می‌کند.
    """
    if not BASE_URL:
        return jsonify({
            "ok": False,
            "message": "RENDER_EXTERNAL_URL is not set",
        }), 400

    webhook_url = f"{BASE_URL}/telegram/webhook"
    payload = {"url": webhook_url}

    if WEBHOOK_SECRET:
        payload["secret_token"] = WEBHOOK_SECRET

    result = telegram_call("setWebhook", payload)
    return jsonify(result)


@app.route("/api/webhook-info", methods=["GET"])
def webhook_info():
    return jsonify(telegram_call("getWebhookInfo", {}))


@app.errorhandler(404)
def not_found(_error):
    return jsonify({
        "success": False,
        "message": "Route not found",
    }), 404


@app.errorhandler(500)
def internal_error(_error):
    return jsonify({
        "success": False,
        "message": "Internal server error",
    }), 500


# Automatically set webhook after Render deploy.
# This is harmless if the same webhook already exists.
if BASE_URL:
    try:
        webhook_url = f"{BASE_URL}/telegram/webhook"
        payload = {"url": webhook_url}
        if WEBHOOK_SECRET:
            payload["secret_token"] = WEBHOOK_SECRET
        result = telegram_call("setWebhook", payload)
        logger.info("Webhook setup: %s", result)
    except Exception:
        logger.exception("Automatic webhook setup failed")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
