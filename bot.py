"""
Telegram Bot for Amir Crypto Hub Mini App
Manages channel membership checks and point distribution
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from dotenv import load_dotenv
from database import Database
import logging

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

TELEGRAM_API_URL = f'https://api.telegram.org/bot{BOT_TOKEN}'
CHANNEL_USERNAME = 'AmirCryptoHub'

# Initialize Flask
app = Flask(__name__)
CORS(app)

# Initialize Database
db = Database()

# ===========================
# HELPER FUNCTIONS
# ===========================

def check_user_membership(user_id: int) -> dict:
    """
    Check if user is member of the channel
    Returns: {is_member: bool, status: str, error: str}
    """
    try:
        # Get channel chat member
        url = f'{TELEGRAM_API_URL}/getChatMember'
        params = {
            'chat_id': f'@{CHANNEL_USERNAME}',
            'user_id': user_id
        }

        response = requests.get(url, params=params, timeout=10)
        data = response.json()

        if not data.get('ok'):
            error_msg = data.get('description', 'Unknown error')
            logger.error(f"Telegram API error: {error_msg}")
            return {
                'is_member': False,
                'status': 'error',
                'error': error_msg
            }

        user_status = data['result']['status']
        
        # Check membership status
        is_member = user_status in ['member', 'administrator', 'creator']
        
        return {
            'is_member': is_member,
            'status': user_status,
            'error': None
        }

    except requests.exceptions.Timeout:
        logger.error(f"Timeout checking membership for user {user_id}")
        return {
            'is_member': False,
            'status': 'timeout',
            'error': 'Connection timeout'
        }
    except Exception as e:
        logger.error(f"Error checking membership: {str(e)}")
        return {
            'is_member': False,
            'status': 'error',
            'error': str(e)
        }

def send_notification(user_id: int, message: str) -> bool:
    """Send message to user via bot"""
    try:
        url = f'{TELEGRAM_API_URL}/sendMessage'
        params = {
            'chat_id': user_id,
            'text': message,
            'parse_mode': 'HTML'
        }

        response = requests.post(url, json=params, timeout=10)
        return response.json().get('ok', False)

    except Exception as e:
        logger.error(f"Error sending notification: {str(e)}")
        return False

# ===========================
# API ROUTES
# ===========================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'message': 'Bot is running',
        'timestamp': str(__import__('datetime').datetime.now())
    })

@app.route('/api/user/init', methods=['POST'])
def user_init():
    """Initialize user when Mini App opens"""
    try:
        data = request.json
        user_id = data.get('user_id')
        username = data.get('username', 'unknown')
        first_name = data.get('first_name', 'User')

        if not user_id:
            return jsonify({'success': False, 'message': 'Missing user_id'}), 400

        # Get or create user
        user = db.get_or_create_user(user_id, username, first_name)

        # Get stats
        stats = db.get_user_stats(user_id)

        return jsonify({
            'success': True,
            'user': user,
            'stats': stats
        })

    except Exception as e:
        logger.error(f"Error in user_init: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/check-membership', methods=['POST'])
def check_membership():
    """
    Check if user is member of channel
    Verify membership and award points if applicable
    """
    try:
        data = request.json
        user_id = data.get('userID')
        username = data.get('username')

        if not user_id:
            return jsonify({
                'success': False,
                'message': 'Missing userID'
            }), 400

        # Ensure user exists
        user = db.get_or_create_user(user_id, username, 'User')

        # Check if already completed this task
        already_completed = db.is_task_completed(user_id, 'channel_join')

        # Check membership
        membership = check_user_membership(user_id)

        if not membership['is_member']:
            return jsonify({
                'success': True,
                'isMember': False,
                'message': 'User is not a member of the channel'
            })

        # User is member
        if already_completed:
            return jsonify({
                'success': True,
                'isMember': True,
                'alreadyRewarded': True,
                'message': 'Already rewarded for this task'
            })

        # Award points
        success, points = db.complete_task(user_id, 'channel_join', 10)

        if success:
            # Send notification
            send_notification(
                user_id,
                f'<b>🎉 تبریک!</b>\n\nبرای عضویت در کانال <b>۱۰ امتیاز</b> دریافت کردید!\n\n'
                f'💰 کل امتیاز شما: <b>{points}</b>'
            )

            return jsonify({
                'success': True,
                'isMember': True,
                'alreadyRewarded': False,
                'pointsAwarded': 10,
                'totalPoints': points,
                'message': 'Points awarded successfully'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Error awarding points'
            }), 500

    except Exception as e:
        logger.error(f"Error in check_membership: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/user/stats', methods=['GET'])
def get_user_stats():
    """Get user statistics"""
    try:
        user_id = request.args.get('user_id', type=int)

        if not user_id:
            return jsonify({'success': False, 'message': 'Missing user_id'}), 400

        stats = db.get_user_stats(user_id)

        if not stats:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        return jsonify({
            'success': True,
            'stats': stats
        })

    except Exception as e:
        logger.error(f"Error in get_user_stats: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/user/points', methods=['GET'])
def get_user_points():
    """Get user's current points"""
    try:
        user_id = request.args.get('user_id', type=int)

        if not user_id:
            return jsonify({'success': False, 'message': 'Missing user_id'}), 400

        points = db.get_points(user_id)

        return jsonify({
            'success': True,
            'points': points,
            'user_id': user_id
        })

    except Exception as e:
        logger.error(f"Error in get_user_points: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/referral/process', methods=['POST'])
def process_referral():
    """
    Process referral when referred user joins
    Called when a new user starts bot with referral code
    """
    try:
        data = request.json
        referred_user_id = data.get('referred_user_id')
        referred_username = data.get('referred_username')
        referral_code = data.get('referral_code')

        if not all([referred_user_id, referred_username, referral_code]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400

        # Get referrer by referral code
        referrer = db.get_user_by_referral_code(referral_code)

        if not referrer:
            return jsonify({
                'success': False,
                'message': 'Invalid referral code'
            }), 404

        # Ensure referred user exists
        db.get_or_create_user(referred_user_id, referred_username, 'User')

        # Add referral
        success = db.add_referral(referrer['user_id'], referred_user_id)

        if success:
            referrer_points = db.get_points(referrer['user_id'])

            # Notify referrer
            send_notification(
                referrer['user_id'],
                f'<b>👥 دعوت موفق!</b>\n\n'
                f'کاربر جدید توسط لینک شما عضو شد.\n'
                f'<b>+5 امتیاز</b> دریافت کردید!\n\n'
                f'💰 کل امتیاز: <b>{referrer_points}</b>'
            )

            return jsonify({
                'success': True,
                'message': 'Referral processed successfully',
                'referrer_id': referrer['user_id'],
                'bonus_points': 5
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Error processing referral'
            }), 500

    except Exception as e:
        logger.error(f"Error in process_referral: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get top users leaderboard"""
    try:
        limit = request.args.get('limit', 10, type=int)
        limit = min(limit, 100)  # Max 100

        top_users = db.get_top_users(limit)

        return jsonify({
            'success': True,
            'leaderboard': top_users
        })

    except Exception as e:
        logger.error(f"Error in get_leaderboard: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/tasks/complete', methods=['POST'])
def complete_task():
    """Complete a task and award points"""
    try:
        data = request.json
        user_id = data.get('user_id')
        task_name = data.get('task_name')

        if not all([user_id, task_name]):
            return jsonify({
                'success': False,
                'message': 'Missing required fields'
            }), 400

        # Define task points
        task_points = {
            'channel_join': 10,
            'referral': 5,
            'share': 3
        }

        points = task_points.get(task_name, 0)

        if points == 0:
            return jsonify({
                'success': False,
                'message': 'Invalid task'
            }), 400

        # Complete task
        success, already_completed = db.complete_task(user_id, task_name, points)

        if not success:
            return jsonify({
                'success': False,
                'message': 'Error completing task'
            }), 500

        if already_completed:
            return jsonify({
                'success': True,
                'message': 'Task already completed',
                'alreadyCompleted': True
            })

        total_points = db.get_points(user_id)

        return jsonify({
            'success': True,
            'message': 'Task completed successfully',
            'pointsAwarded': points,
            'totalPoints': total_points
        })

    except Exception as e:
        logger.error(f"Error in complete_task: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

# ===========================
# ERROR HANDLERS
# ===========================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'message': 'Route not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({
        'success': False,
        'message': 'Internal server error'
    }), 500

# ===========================
# RUN APP
# ===========================

if __name__ == '__main__':
    # Development mode
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', 5000)),
        debug=os.getenv('DEBUG', 'False') == 'True'
    )