"""
Database Manager for Telegram Mini App Bot
Manages users, tasks, points, and referrals
"""

import sqlite3
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple

class Database:
    def __init__(self, db_name='amir_bot.db'):
        self.db_name = db_name
        self.init_db()

    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_name)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        """Initialize database tables"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT UNIQUE,
                first_name TEXT,
                points INTEGER DEFAULT 0,
                referral_code TEXT UNIQUE,
                referred_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Completed tasks table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS completed_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                task_name TEXT,
                points_earned INTEGER,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id),
                UNIQUE(user_id, task_name)
            )
        ''')

        # Referrals table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER,
                referred_user_id INTEGER,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(referrer_id) REFERENCES users(user_id),
                FOREIGN KEY(referred_user_id) REFERENCES users(user_id)
            )
        ''')

        # Points log table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS points_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                points INTEGER,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id)
            )
        ''')

        conn.commit()
        conn.close()

    # ===========================
    # USER METHODS
    # ===========================

    def get_or_create_user(self, user_id: int, username: str, first_name: str) -> Dict:
        """Get or create a new user"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Check if user exists
        cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()

        if user:
            return dict(user)

        # Create new user
        referral_code = f"ref_{user_id}_{username}_{int(datetime.now().timestamp())}"
        
        cursor.execute('''
            INSERT INTO users (user_id, username, first_name, referral_code, points)
            VALUES (?, ?, ?, ?, 0)
        ''', (user_id, username, first_name, referral_code))

        conn.commit()
        cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()
        conn.close()

        return dict(user) if user else None

    def get_user(self, user_id: int) -> Optional[Dict]:
        """Get user by ID"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()
        conn.close()

        return dict(user) if user else None

    def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user by username"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        conn.close()

        return dict(user) if user else None

    # ===========================
    # POINTS METHODS
    # ===========================

    def add_points(self, user_id: int, points: int, reason: str = "Task completed") -> Tuple[bool, int]:
        """Add points to user"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get current points
            cursor.execute('SELECT points FROM users WHERE user_id = ?', (user_id,))
            result = cursor.fetchone()
            
            if not result:
                conn.close()
                return False, 0

            current_points = result[0]
            new_points = current_points + points

            # Update points
            cursor.execute(
                'UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                (new_points, user_id)
            )

            # Log the transaction
            cursor.execute(
                'INSERT INTO points_log (user_id, points, reason) VALUES (?, ?, ?)',
                (user_id, points, reason)
            )

            conn.commit()
            conn.close()

            return True, new_points

        except Exception as e:
            conn.close()
            print(f"Error adding points: {e}")
            return False, 0

    def get_points(self, user_id: int) -> int:
        """Get user's current points"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT points FROM users WHERE user_id = ?', (user_id,))
        result = cursor.fetchone()
        conn.close()

        return result[0] if result else 0

    # ===========================
    # TASK METHODS
    # ===========================

    def complete_task(self, user_id: int, task_name: str, points: int) -> Tuple[bool, bool]:
        """
        Complete a task for user
        Returns: (success, already_completed)
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Check if already completed
            cursor.execute(
                'SELECT * FROM completed_tasks WHERE user_id = ? AND task_name = ?',
                (user_id, task_name)
            )
            
            if cursor.fetchone():
                conn.close()
                return True, True  # Already completed

            # Add task
            cursor.execute(
                'INSERT INTO completed_tasks (user_id, task_name, points_earned) VALUES (?, ?, ?)',
                (user_id, task_name, points)
            )

            # Add points
            cursor.execute(
                'UPDATE users SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                (points, user_id)
            )

            # Log points
            cursor.execute(
                'INSERT INTO points_log (user_id, points, reason) VALUES (?, ?, ?)',
                (user_id, points, f"Task: {task_name}")
            )

            conn.commit()
            conn.close()

            return True, False  # Success, not already completed

        except Exception as e:
            conn.close()
            print(f"Error completing task: {e}")
            return False, False

    def is_task_completed(self, user_id: int, task_name: str) -> bool:
        """Check if user completed a task"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            'SELECT * FROM completed_tasks WHERE user_id = ? AND task_name = ?',
            (user_id, task_name)
        )
        
        result = cursor.fetchone() is not None
        conn.close()

        return result

    def get_completed_tasks(self, user_id: int) -> List[str]:
        """Get list of completed tasks"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            'SELECT task_name FROM completed_tasks WHERE user_id = ?',
            (user_id,)
        )
        
        tasks = [row[0] for row in cursor.fetchall()]
        conn.close()

        return tasks

    # ===========================
    # REFERRAL METHODS
    # ===========================

    def add_referral(self, referrer_id: int, referred_user_id: int) -> bool:
        """Add a referral relationship"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                'INSERT INTO referrals (referrer_id, referred_user_id) VALUES (?, ?)',
                (referrer_id, referred_user_id)
            )

            # Add points to referrer
            cursor.execute(
                'UPDATE users SET points = points + 5, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                (referrer_id,)
            )

            # Log points
            cursor.execute(
                'INSERT INTO points_log (user_id, points, reason) VALUES (?, ?, ?)',
                (referrer_id, 5, f"Referral bonus from user {referred_user_id}")
            )

            conn.commit()
            conn.close()

            return True

        except Exception as e:
            conn.close()
            print(f"Error adding referral: {e}")
            return False

    def get_referrals(self, referrer_id: int) -> List[Dict]:
        """Get all referrals for a user"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT u.user_id, u.username, u.first_name, r.created_at
            FROM referrals r
            JOIN users u ON r.referred_user_id = u.user_id
            WHERE r.referrer_id = ? AND r.status = 'active'
            ORDER BY r.created_at DESC
        ''', (referrer_id,))

        referrals = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return referrals

    def count_referrals(self, referrer_id: int) -> int:
        """Count active referrals for a user"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            'SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND status = "active"',
            (referrer_id,)
        )

        count = cursor.fetchone()[0]
        conn.close()

        return count

    def get_user_by_referral_code(self, referral_code: str) -> Optional[Dict]:
        """Get user by their referral code"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users WHERE referral_code = ?', (referral_code,))
        user = cursor.fetchone()
        conn.close()

        return dict(user) if user else None

    # ===========================
    # STATS METHODS
    # ===========================

    def get_user_stats(self, user_id: int) -> Dict:
        """Get complete user statistics"""
        user = self.get_user(user_id)
        if not user:
            return None

        completed_tasks = self.get_completed_tasks(user_id)
        referrals = self.get_referrals(user_id)

        return {
            'user_id': user['user_id'],
            'username': user['username'],
            'first_name': user['first_name'],
            'points': user['points'],
            'tasks_completed': len(completed_tasks),
            'referrals_count': len(referrals),
            'referrals': referrals,
            'created_at': user['created_at']
        }

    def get_top_users(self, limit: int = 10) -> List[Dict]:
        """Get top users by points"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT user_id, username, first_name, points,
                   (SELECT COUNT(*) FROM completed_tasks WHERE user_id = users.user_id) as tasks,
                   (SELECT COUNT(*) FROM referrals WHERE referrer_id = users.user_id AND status = 'active') as referrals
            FROM users
            ORDER BY points DESC
            LIMIT ?
        ''', (limit,))

        users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return users

    # ===========================
    # CLEANUP METHODS
    # ===========================

    def clear_all(self):
        """Clear all data (for testing only)"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('DELETE FROM points_log')
        cursor.execute('DELETE FROM referrals')
        cursor.execute('DELETE FROM completed_tasks')
        cursor.execute('DELETE FROM users')

        conn.commit()
        conn.close()


# Example usage
if __name__ == "__main__":
    db = Database()

    # Create test user
    user = db.get_or_create_user(123456789, "testuser", "Test User")
    print(f"User created: {user}")

    # Add points
    success, points = db.add_points(123456789, 10, "Test task")
    print(f"Points added: {success}, Total: {points}")

    # Complete task
    success, already = db.complete_task(123456789, "channel", 10)
    print(f"Task completed: {success}, Already: {already}")

    # Get stats
    stats = db.get_user_stats(123456789)
    print(f"User stats: {stats}")