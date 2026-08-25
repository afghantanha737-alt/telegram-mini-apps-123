"""
Database Manager for Telegram Mini App Bot
Manages users, tasks, points, and referrals
"""

import sqlite3
from datetime import datetime
from typing import Dict, List, Optional, Tuple


class Database:

    def __init__(self, db_name="amir_bot.db"):
        self.db_name = db_name
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_name)
        conn.row_factory = sqlite3.Row
        return conn

    # =========================
    # DATABASE INIT
    # =========================

    def init_db(self):

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
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
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS completed_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                task_name TEXT,
                points_earned INTEGER,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id),
                UNIQUE(user_id, task_name)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER,
                referred_user_id INTEGER,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(referrer_id) REFERENCES users(user_id),
                FOREIGN KEY(referred_user_id) REFERENCES users(user_id),
                UNIQUE(referred_user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS points_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                points INTEGER,
                reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(user_id)
            )
        """)

        conn.commit()
        conn.close()

    # =========================
    # USER METHODS
    # =========================

    def get_or_create_user(
        self,
        user_id: int,
        username: str,
        first_name: str
    ) -> Dict:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM users WHERE user_id = ?",
            (user_id,)
        )

        user = cursor.fetchone()

        if user:

            cursor.execute("""
                UPDATE users
                SET username = ?,
                    first_name = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (
                username,
                first_name,
                user_id
            ))

            conn.commit()

            cursor.execute(
                "SELECT * FROM users WHERE user_id = ?",
                (user_id,)
            )

            user = cursor.fetchone()

            conn.close()

            return dict(user)

        # Stable referral code
        referral_code = f"ref_{user_id}"

        # Very unlikely collision protection
        cursor.execute(
            "SELECT user_id FROM users WHERE referral_code = ?",
            (referral_code,)
        )

        if cursor.fetchone():

            referral_code = (
                f"ref_{user_id}_{int(datetime.now().timestamp())}"
            )

        cursor.execute("""
            INSERT INTO users (
                user_id,
                username,
                first_name,
                referral_code,
                points
            )
            VALUES (?, ?, ?, ?, 0)
        """, (
            user_id,
            username,
            first_name,
            referral_code
        ))

        conn.commit()

        cursor.execute(
            "SELECT * FROM users WHERE user_id = ?",
            (user_id,)
        )

        user = cursor.fetchone()

        conn.close()

        return dict(user) if user else None

    def get_user(self, user_id: int) -> Optional[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM users WHERE user_id = ?",
            (user_id,)
        )

        user = cursor.fetchone()

        conn.close()

        return dict(user) if user else None

    def get_user_by_username(
        self,
        username: str
    ) -> Optional[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,)
        )

        user = cursor.fetchone()

        conn.close()

        return dict(user) if user else None

    # =========================
    # POINTS
    # =========================

    def add_points(
        self,
        user_id: int,
        points: int,
        reason: str = "Task completed"
    ) -> Tuple[bool, int]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                "SELECT points FROM users WHERE user_id = ?",
                (user_id,)
            )

            result = cursor.fetchone()

            if not result:
                conn.close()
                return False, 0

            cursor.execute("""
                UPDATE users
                SET points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (
                points,
                user_id
            ))

            cursor.execute("""
                INSERT INTO points_log (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, ?, ?)
            """, (
                user_id,
                points,
                reason
            ))

            conn.commit()

            cursor.execute(
                "SELECT points FROM users WHERE user_id = ?",
                (user_id,)
            )

            new_points = cursor.fetchone()[0]

            conn.close()

            return True, new_points

        except Exception as e:

            conn.rollback()
            conn.close()

            print(f"Error adding points: {e}")

            return False, 0

    def get_points(self, user_id: int) -> int:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute(
            "SELECT points FROM users WHERE user_id = ?",
            (user_id,)
        )

        result = cursor.fetchone()

        conn.close()

        return result[0] if result else 0

    # =========================
    # TASKS
    # =========================

    def complete_task(
        self,
        user_id: int,
        task_name: str,
        points: int
    ) -> Tuple[bool, bool]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute("""
                SELECT id
                FROM completed_tasks
                WHERE user_id = ?
                AND task_name = ?
            """, (
                user_id,
                task_name
            ))

            if cursor.fetchone():

                conn.close()

                return True, True

            cursor.execute("""
                INSERT INTO completed_tasks (
                    user_id,
                    task_name,
                    points_earned
                )
                VALUES (?, ?, ?)
            """, (
                user_id,
                task_name,
                points
            ))

            cursor.execute("""
                UPDATE users
                SET points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (
                points,
                user_id
            ))

            cursor.execute("""
                INSERT INTO points_log (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, ?, ?)
            """, (
                user_id,
                points,
                f"Task: {task_name}"
            ))

            conn.commit()
            conn.close()

            return True, False

        except Exception as e:

            conn.rollback()
            conn.close()

            print(f"Error completing task: {e}")

            return False, False

    def is_task_completed(
        self,
        user_id: int,
        task_name: str
    ) -> bool:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id
            FROM completed_tasks
            WHERE user_id = ?
            AND task_name = ?
        """, (
            user_id,
            task_name
        ))

        result = cursor.fetchone() is not None

        conn.close()

        return result

    def get_completed_tasks(
        self,
        user_id: int
    ) -> List[str]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT task_name
            FROM completed_tasks
            WHERE user_id = ?
        """, (user_id,))

        tasks = [
            row[0]
            for row in cursor.fetchall()
        ]

        conn.close()

        return tasks

    # =========================
    # REFERRAL
    # =========================

    def get_user_by_referral_code(
        self,
        referral_code: str
    ) -> Optional[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT *
            FROM users
            WHERE referral_code = ?
        """, (
            referral_code,
        ))

        user = cursor.fetchone()

        conn.close()

        return dict(user) if user else None

    def add_referral(
        self,
        referrer_id: int,
        referred_user_id: int
    ) -> Tuple[bool, str]:

        # Self referral
        if referrer_id == referred_user_id:

            return False, "self_referral"

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            # Make sure both users exist
            cursor.execute(
                "SELECT user_id FROM users WHERE user_id = ?",
                (referrer_id,)
            )

            if not cursor.fetchone():

                conn.close()
                return False, "referrer_not_found"

            cursor.execute(
                "SELECT user_id FROM users WHERE user_id = ?",
                (referred_user_id,)
            )

            if not cursor.fetchone():

                conn.close()
                return False, "referred_user_not_found"

            # Has this user already been referred?
            cursor.execute("""
                SELECT id
                FROM referrals
                WHERE referred_user_id = ?
            """, (
                referred_user_id,
            ))

            if cursor.fetchone():

                conn.close()

                return False, "already_referred"

            # Does referred user already have referred_by?
            cursor.execute("""
                SELECT referred_by
                FROM users
                WHERE user_id = ?
            """, (
                referred_user_id,
            ))

            row = cursor.fetchone()

            if row and row["referred_by"]:

                conn.close()

                return False, "already_referred"

            # Create referral
            cursor.execute("""
                INSERT INTO referrals (
                    referrer_id,
                    referred_user_id,
                    status
                )
                VALUES (?, ?, 'active')
            """, (
                referrer_id,
                referred_user_id
            ))

            # Set referred_by
            cursor.execute("""
                UPDATE users
                SET referred_by = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (
                referrer_id,
                referred_user_id
            ))

            # Give 5 points
            cursor.execute("""
                UPDATE users
                SET points = points + 5,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (
                referrer_id,
            ))

            # Log bonus
            cursor.execute("""
                INSERT INTO points_log (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, 5, ?)
            """, (
                referrer_id,
                f"Referral bonus from user {referred_user_id}"
            ))

            conn.commit()
            conn.close()

            return True, "success"

        except sqlite3.IntegrityError:

            conn.rollback()
            conn.close()

            return False, "already_referred"

        except Exception as e:

            conn.rollback()
            conn.close()

            print(f"Error adding referral: {e}")

            return False, "error"

    def get_referrals(
        self,
        referrer_id: int
    ) -> List[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                u.user_id,
                u.username,
                u.first_name,
                r.created_at
            FROM referrals r
            JOIN users u
                ON r.referred_user_id = u.user_id
            WHERE r.referrer_id = ?
            AND r.status = 'active'
            ORDER BY r.created_at DESC
        """, (
            referrer_id,
        ))

        referrals = [
            dict(row)
            for row in cursor.fetchall()
        ]

        conn.close()

        return referrals

    def count_referrals(
        self,
        referrer_id: int
    ) -> int:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT COUNT(*)
            FROM referrals
            WHERE referrer_id = ?
            AND status = 'active'
        """, (
            referrer_id,
        ))

        count = cursor.fetchone()[0]

        conn.close()

        return count

    # =========================
    # STATS
    # =========================

    def get_user_stats(
        self,
        user_id: int
    ) -> Optional[Dict]:

        user = self.get_user(user_id)

        if not user:
            return None

        completed_tasks = self.get_completed_tasks(user_id)
        referrals = self.get_referrals(user_id)

        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "first_name": user["first_name"],
            "points": user["points"],
            "referral_code": user["referral_code"],
            "referred_by": user["referred_by"],
            "tasks_completed": len(completed_tasks),
            "completed_tasks": completed_tasks,
            "referrals_count": len(referrals),
            "referrals": referrals,
            "created_at": user["created_at"]
        }

    def get_top_users(
        self,
        limit: int = 10
    ) -> List[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                user_id,
                username,
                first_name,
                points,

                (
                    SELECT COUNT(*)
                    FROM completed_tasks
                    WHERE user_id = users.user_id
                ) AS tasks,

                (
                    SELECT COUNT(*)
                    FROM referrals
                    WHERE referrer_id = users.user_id
                    AND status = 'active'
                ) AS referrals

            FROM users

            ORDER BY points DESC

            LIMIT ?
        """, (
            limit,
        ))

        users = [
            dict(row)
            for row in cursor.fetchall()
        ]

        conn.close()

        return users

    # =========================
    # CLEANUP
    # =========================

    def clear_all(self):

        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("DELETE FROM points_log")
        cursor.execute("DELETE FROM referrals")
        cursor.execute("DELETE FROM completed_tasks")
        cursor.execute("DELETE FROM users")

        conn.commit()
        conn.close()