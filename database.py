"""
Database Manager
Amir Crypto Hub - Telegram Mini App

Features:
- Users
- Points
- Tasks
- Referrals
- Referral bonuses
- Points history
- Leaderboard
"""

import sqlite3
import secrets
from datetime import datetime
from typing import Dict, List, Optional, Tuple


class Database:

    def __init__(self, db_name: str = "amir_bot.db"):
        self.db_name = db_name
        self.init_db()

    # =========================================================
    # CONNECTION
    # =========================================================

    def get_connection(self):
        conn = sqlite3.connect(
            self.db_name,
            timeout=30
        )

        conn.row_factory = sqlite3.Row

        return conn

    # =========================================================
    # DATABASE INITIALIZATION
    # =========================================================

    def init_db(self):

        conn = self.get_connection()
        cursor = conn.cursor()

        # Enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON")

        # -----------------------------------------------------
        # USERS
        # -----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (

                user_id INTEGER PRIMARY KEY,

                username TEXT,

                first_name TEXT,

                points INTEGER DEFAULT 0,

                referral_code TEXT UNIQUE,

                referred_by INTEGER,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (referred_by)
                    REFERENCES users(user_id)
            )
        """)

        # -----------------------------------------------------
        # COMPLETED TASKS
        # -----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS completed_tasks (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                task_name TEXT NOT NULL,

                points_earned INTEGER NOT NULL DEFAULT 0,

                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(user_id)
                    ON DELETE CASCADE,

                UNIQUE(user_id, task_name)
            )
        """)

        # -----------------------------------------------------
        # REFERRALS
        # -----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS referrals (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                referrer_id INTEGER NOT NULL,

                referred_user_id INTEGER NOT NULL,

                status TEXT DEFAULT 'active',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (referrer_id)
                    REFERENCES users(user_id)
                    ON DELETE CASCADE,

                FOREIGN KEY (referred_user_id)
                    REFERENCES users(user_id)
                    ON DELETE CASCADE,

                UNIQUE(referred_user_id)
            )
        """)

        # -----------------------------------------------------
        # POINTS LOG
        # -----------------------------------------------------

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS points_log (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                points INTEGER NOT NULL,

                reason TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(user_id)
                    ON DELETE CASCADE
            )
        """)

        conn.commit()
        conn.close()

    # =========================================================
    # REFERRAL CODE
    # =========================================================

    def generate_referral_code(self, user_id: int) -> str:
        """
        Creates a permanent referral code.

        Example:
        ref_123456789
        """

        return f"ref_{user_id}"

    # =========================================================
    # CREATE / GET USER
    # =========================================================

    def get_or_create_user(
        self,
        user_id: int,
        username: str = "",
        first_name: str = "User"
    ) -> Dict:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            # -------------------------------------------------
            # Check existing user
            # -------------------------------------------------

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = cursor.fetchone()

            if user:

                # Update Telegram profile information
                cursor.execute(
                    """
                    UPDATE users
                    SET
                        username = ?,
                        first_name = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                    """,
                    (
                        username or user["username"],
                        first_name or user["first_name"],
                        user_id
                    )
                )

                conn.commit()

                cursor.execute(
                    """
                    SELECT *
                    FROM users
                    WHERE user_id = ?
                    """,
                    (user_id,)
                )

                user = cursor.fetchone()

                return dict(user)

            # -------------------------------------------------
            # Create new user
            # -------------------------------------------------

            referral_code = self.generate_referral_code(
                user_id
            )

            cursor.execute(
                """
                INSERT INTO users
                (
                    user_id,
                    username,
                    first_name,
                    points,
                    referral_code
                )
                VALUES (?, ?, ?, 0, ?)
                """,
                (
                    user_id,
                    username or "",
                    first_name or "User",
                    referral_code
                )
            )

            conn.commit()

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = cursor.fetchone()

            return dict(user)

        finally:

            conn.close()

    # =========================================================
    # GET USER
    # =========================================================

    def get_user(
        self,
        user_id: int
    ) -> Optional[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = cursor.fetchone()

            return dict(user) if user else None

        finally:

            conn.close()

    # =========================================================
    # GET USER BY USERNAME
    # =========================================================

    def get_user_by_username(
        self,
        username: str
    ) -> Optional[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE username = ?
                """,
                (username,)
            )

            user = cursor.fetchone()

            return dict(user) if user else None

        finally:

            conn.close()

    # =========================================================
    # GET USER BY REFERRAL CODE
    # =========================================================

    def get_user_by_referral_code(
        self,
        referral_code: str
    ) -> Optional[Dict]:

        if not referral_code:
            return None

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT *
                FROM users
                WHERE referral_code = ?
                """,
                (referral_code,)
            )

            user = cursor.fetchone()

            return dict(user) if user else None

        finally:

            conn.close()

    # =========================================================
    # SET REFERRER
    # =========================================================

    def set_referrer(
        self,
        user_id: int,
        referrer_id: int
    ) -> bool:
        """
        Sets who invited the user.

        Important:
        - User cannot refer themselves.
        - Referrer can only be set once.
        """

        if user_id == referrer_id:
            return False

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            # Check user
            cursor.execute(
                """
                SELECT referred_by
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = cursor.fetchone()

            if not user:
                return False

            # Already has referrer
            if user["referred_by"] is not None:
                return False

            # Check referrer
            cursor.execute(
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (referrer_id,)
            )

            referrer = cursor.fetchone()

            if not referrer:
                return False

            # Set referrer
            cursor.execute(
                """
                UPDATE users
                SET
                    referred_by = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    referrer_id,
                    user_id
                )
            )

            conn.commit()

            return True

        finally:

            conn.close()

    # =========================================================
    # POINTS
    # =========================================================

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
                """
                SELECT points
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = cursor.fetchone()

            if not user:
                return False, 0

            new_points = (
                int(user["points"]) +
                int(points)
            )

            cursor.execute(
                """
                UPDATE users
                SET
                    points = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    new_points,
                    user_id
                )
            )

            cursor.execute(
                """
                INSERT INTO points_log
                (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, ?, ?)
                """,
                (
                    user_id,
                    points,
                    reason
                )
            )

            conn.commit()

            return True, new_points

        except Exception as e:

            conn.rollback()

            print(
                f"Error adding points: {e}"
            )

            return False, 0

        finally:

            conn.close()

    # =========================================================
    # GET POINTS
    # =========================================================

    def get_points(
        self,
        user_id: int
    ) -> int:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT points
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            result = cursor.fetchone()

            if not result:
                return 0

            return int(result["points"])

        finally:

            conn.close()

    # =========================================================
    # COMPLETE TASK
    # =========================================================

    def complete_task(
        self,
        user_id: int,
        task_name: str,
        points: int
    ) -> Tuple[bool, bool]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            # -------------------------------------------------
            # Check task
            # -------------------------------------------------

            cursor.execute(
                """
                SELECT id
                FROM completed_tasks
                WHERE user_id = ?
                AND task_name = ?
                """,
                (
                    user_id,
                    task_name
                )
            )

            existing = cursor.fetchone()

            if existing:

                return True, True

            # -------------------------------------------------
            # Make sure user exists
            # -------------------------------------------------

            cursor.execute(
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            if not cursor.fetchone():

                return False, False

            # -------------------------------------------------
            # Add completed task
            # -------------------------------------------------

            cursor.execute(
                """
                INSERT INTO completed_tasks
                (
                    user_id,
                    task_name,
                    points_earned
                )
                VALUES (?, ?, ?)
                """,
                (
                    user_id,
                    task_name,
                    points
                )
            )

            # -------------------------------------------------
            # Add points
            # -------------------------------------------------

            cursor.execute(
                """
                UPDATE users
                SET
                    points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    points,
                    user_id
                )
            )

            # -------------------------------------------------
            # Log
            # -------------------------------------------------

            cursor.execute(
                """
                INSERT INTO points_log
                (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, ?, ?)
                """,
                (
                    user_id,
                    points,
                    f"Task: {task_name}"
                )
            )

            conn.commit()

            return True, False

        except Exception as e:

            conn.rollback()

            print(
                f"Error completing task: {e}"
            )

            return False, False

        finally:

            conn.close()

    # =========================================================
    # IS TASK COMPLETED
    # =========================================================

    def is_task_completed(
        self,
        user_id: int,
        task_name: str
    ) -> bool:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT id
                FROM completed_tasks
                WHERE user_id = ?
                AND task_name = ?
                """,
                (
                    user_id,
                    task_name
                )
            )

            return cursor.fetchone() is not None

        finally:

            conn.close()

    # =========================================================
    # GET COMPLETED TASKS
    # =========================================================

    def get_completed_tasks(
        self,
        user_id: int
    ) -> List[str]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT task_name
                FROM completed_tasks
                WHERE user_id = ?
                ORDER BY completed_at ASC
                """,
                (user_id,)
            )

            return [
                row["task_name"]
                for row in cursor.fetchall()
            ]

        finally:

            conn.close()

    # =========================================================
    # ADD REFERRAL
    # =========================================================

    def add_referral(
        self,
        referrer_id: int,
        referred_user_id: int,
        bonus: int = 5
    ) -> Tuple[bool, bool]:
        """
        Add a referral.

        Returns:

        (True, False)
            New referral added.

        (True, True)
            Referral already existed.

        (False, False)
            Error.

        The referred user gets NO points.
        The referrer gets the referral bonus.
        """

        if referrer_id == referred_user_id:
            return False, False

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            # -------------------------------------------------
            # Make sure both users exist
            # -------------------------------------------------

            cursor.execute(
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (referrer_id,)
            )

            if not cursor.fetchone():
                return False, False

            cursor.execute(
                """
                SELECT user_id, referred_by
                FROM users
                WHERE user_id = ?
                """,
                (referred_user_id,)
            )

            referred_user = cursor.fetchone()

            if not referred_user:
                return False, False

            # -------------------------------------------------
            # Check if this user already has a referrer
            # -------------------------------------------------

            if referred_user["referred_by"] is not None:

                return True, True

            # -------------------------------------------------
            # Check referral table
            # -------------------------------------------------

            cursor.execute(
                """
                SELECT id
                FROM referrals
                WHERE referred_user_id = ?
                """,
                (referred_user_id,)
            )

            existing = cursor.fetchone()

            if existing:

                return True, True

            # -------------------------------------------------
            # Set referred_by
            # -------------------------------------------------

            cursor.execute(
                """
                UPDATE users
                SET
                    referred_by = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    referrer_id,
                    referred_user_id
                )
            )

            # -------------------------------------------------
            # Create referral
            # -------------------------------------------------

            cursor.execute(
                """
                INSERT INTO referrals
                (
                    referrer_id,
                    referred_user_id,
                    status
                )
                VALUES (?, ?, 'active')
                """,
                (
                    referrer_id,
                    referred_user_id
                )
            )

            # -------------------------------------------------
            # Referral bonus
            # -------------------------------------------------

            cursor.execute(
                """
                UPDATE users
                SET
                    points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    bonus,
                    referrer_id
                )
            )

            # -------------------------------------------------
            # Points log
            # -------------------------------------------------

            cursor.execute(
                """
                INSERT INTO points_log
                (
                    user_id,
                    points,
                    reason
                )
                VALUES (?, ?, ?)
                """,
                (
                    referrer_id,
                    bonus,
                    f"Referral bonus from user {referred_user_id}"
                )
            )

            conn.commit()

            return True, False

        except sqlite3.IntegrityError:

            conn.rollback()

            return True, True

        except Exception as e:

            conn.rollback()

            print(
                f"Error adding referral: {e}"
            )

            return False, False

        finally:

            conn.close()

    # =========================================================
    # GET REFERRALS
    # =========================================================

    def get_referrals(
        self,
        referrer_id: int
    ) -> List[Dict]:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT
                    u.user_id,
                    u.username,
                    u.first_name,
                    u.created_at,
                    r.created_at AS referral_created_at,
                    r.status

                FROM referrals r

                JOIN users u
                    ON r.referred_user_id = u.user_id

                WHERE r.referrer_id = ?
                AND r.status = 'active'

                ORDER BY r.created_at DESC
                """,
                (referrer_id,)
            )

            return [
                dict(row)
                for row in cursor.fetchall()
            ]

        finally:

            conn.close()

    # =========================================================
    # COUNT REFERRALS
    # =========================================================

    def count_referrals(
        self,
        referrer_id: int
    ) -> int:

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM referrals
                WHERE referrer_id = ?
                AND status = 'active'
                """,
                (referrer_id,)
            )

            return int(
                cursor.fetchone()[0]
            )

        finally:

            conn.close()

    # =========================================================
    # GET USER STATS
    # =========================================================

    def get_user_stats(
        self,
        user_id: int
    ) -> Optional[Dict]:

        user = self.get_user(user_id)

        if not user:
            return None

        completed_tasks = (
            self.get_completed_tasks(user_id)
        )

        referrals = (
            self.get_referrals(user_id)
        )

        return {

            "user_id":
                user["user_id"],

            "username":
                user["username"] or "",

            "first_name":
                user["first_name"] or "User",

            "points":
                int(user["points"] or 0),

            "referral_code":
                user["referral_code"],

            "referred_by":
                user["referred_by"],

            "tasks_completed":
                len(completed_tasks),

            "completed_tasks":
                completed_tasks,

            "referrals_count":
                len(referrals),

            "referrals":
                referrals,

            "created_at":
                user["created_at"]
        }

    # =========================================================
    # GET TOP USERS
    # =========================================================

    def get_top_users(
        self,
        limit: int = 10
    ) -> List[Dict]:

        limit = max(
            1,
            min(int(limit), 100)
        )

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT

                    user_id,

                    username,

                    first_name,

                    points,

                    (
                        SELECT COUNT(*)
                        FROM completed_tasks
                        WHERE completed_tasks.user_id =
                              users.user_id
                    ) AS tasks,

                    (
                        SELECT COUNT(*)
                        FROM referrals
                        WHERE referrals.referrer_id =
                              users.user_id
                        AND referrals.status = 'active'
                    ) AS referrals

                FROM users

                ORDER BY points DESC, user_id ASC

                LIMIT ?
                """,
                (limit,)
            )

            return [
                dict(row)
                for row in cursor.fetchall()
            ]

        finally:

            conn.close()

    # =========================================================
    # POINTS HISTORY
    # =========================================================

    def get_points_history(
        self,
        user_id: int,
        limit: int = 50
    ) -> List[Dict]:

        limit = max(
            1,
            min(int(limit), 100)
        )

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT
                    points,
                    reason,
                    created_at

                FROM points_log

                WHERE user_id = ?

                ORDER BY id DESC

                LIMIT ?
                """,
                (
                    user_id,
                    limit
                )
            )

            return [
                dict(row)
                for row in cursor.fetchall()
            ]

        finally:

            conn.close()

    # =========================================================
    # CLEAR DATABASE
    # =========================================================

    def clear_all(self):

        conn = self.get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                "DELETE FROM points_log"
            )

            cursor.execute(
                "DELETE FROM referrals"
            )

            cursor.execute(
                "DELETE FROM completed_tasks"
            )

            cursor.execute(
                "DELETE FROM users"
            )

            conn.commit()

        finally:

            conn.close()


# =============================================================
# TEST
# =============================================================

if __name__ == "__main__":

    db = Database()

    print(
        "Database initialized successfully."
    )

    # Test user
    user = db.get_or_create_user(
        111111111,
        "test_user",
        "Test User"
    )

    print(
        "User:",
        user
    )

    # Test points
    success, total = db.add_points(
        111111111,
        10,
        "Test points"
    )

    print(
        "Points:",
        success,
        total
    )

    # Test task
    success, already = db.complete_task(
        111111111,
        "channel_join",
        10
    )

    print(
        "Task:",
        success,
        already
    )

    # Test referral
    referred = db.get_or_create_user(
        222222222,
        "test_user_2",
        "Test User 2"
    )

    referral_success, already = db.add_referral(
        111111111,
        222222222,
        5
    )

    print(
        "Referral:",
        referral_success,
        already
    )

    # Stats
    stats = db.get_user_stats(
        111111111
    )

    print(
        "Stats:",
        stats
    )