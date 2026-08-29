"""
Amir Crypto Hub
Database Layer
PostgreSQL + SQLite Compatible
"""

import os
import sqlite3
import secrets
import string
from datetime import datetime


class Database:

    def __init__(self, db_name="amir_bot.db"):
        self.database_url = os.getenv("DATABASE_URL")

        if self.database_url:
            # Render/PostgreSQL
            self.db_type = "postgres"
        else:
            # Local / SQLite
            self.db_type = "sqlite"
            self.db_name = db_name

        self.create_tables()

    # =========================================================
    # CONNECTION
    # =========================================================

    def connect(self):
        if self.db_type == "postgres":
            import psycopg2
            from psycopg2.extras import RealDictCursor

            url = self.database_url

            # Render may provide postgres://
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql://", 1)

            return psycopg2.connect(
                url,
                cursor_factory=RealDictCursor
            )

        return sqlite3.connect(
            self.db_name,
            check_same_thread=False
        )

    # =========================================================
    # HELPERS
    # =========================================================

    def execute(self, query, params=(), fetchone=False, fetchall=False):
        conn = self.connect()

        try:
            cur = conn.cursor()

            if self.db_type == "postgres":
                query = query.replace("?", "%s")

            cur.execute(query, params)

            result = None

            if fetchone:
                result = cur.fetchone()

            elif fetchall:
                result = cur.fetchall()

            conn.commit()

            return result

        finally:
            conn.close()

    # =========================================================
    # CREATE TABLES
    # =========================================================

    def create_tables(self):

        conn = self.connect()

        try:
            cur = conn.cursor()

            if self.db_type == "postgres":

                # USERS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        user_id BIGINT PRIMARY KEY,
                        username TEXT UNIQUE,
                        first_name TEXT,
                        points INTEGER DEFAULT 0,
                        referral_code TEXT UNIQUE,
                        referred_by BIGINT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # TASKS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS tasks (
                        task_id SERIAL PRIMARY KEY,
                        title TEXT NOT NULL,
                        description TEXT,
                        points INTEGER DEFAULT 0,
                        task_type TEXT DEFAULT 'general',
                        target TEXT,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # COMPLETED TASKS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS completed_tasks (
                        id SERIAL PRIMARY KEY,
                        user_id BIGINT NOT NULL,
                        task_id INTEGER NOT NULL,
                        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, task_id)
                    )
                """)

                # REFERRALS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (
                        id SERIAL PRIMARY KEY,
                        referrer_id BIGINT NOT NULL,
                        referred_id BIGINT NOT NULL UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # INDEXES
                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_completed_user
                    ON completed_tasks(user_id)
                """)

                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_referrals_referrer
                    ON referrals(referrer_id)
                """)

            else:

                # USERS
                cur.execute("""
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

                # TASKS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS tasks (
                        task_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        description TEXT,
                        points INTEGER DEFAULT 0,
                        task_type TEXT DEFAULT 'general',
                        target TEXT,
                        is_active INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                # COMPLETED TASKS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS completed_tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        task_id INTEGER NOT NULL,
                        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, task_id)
                    )
                """)

                # REFERRALS
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        referrer_id INTEGER NOT NULL,
                        referred_id INTEGER NOT NULL UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_completed_user
                    ON completed_tasks(user_id)
                """)

                cur.execute("""
                    CREATE INDEX IF NOT EXISTS idx_referrals_referrer
                    ON referrals(referrer_id)
                """)

            conn.commit()

        finally:
            conn.close()

    # =========================================================
    # REFERRAL CODE
    # =========================================================

    def generate_referral_code(self, user_id):

        code = "REF" + str(user_id)

        # Make sure it is unique
        existing = self.execute(
            "SELECT user_id FROM users WHERE referral_code = ?",
            (code,),
            fetchone=True
        )

        if existing:
            code = (
                "REF"
                + str(user_id)
                + "_"
                + "".join(
                    secrets.choice(string.ascii_uppercase + string.digits)
                    for _ in range(5)
                )
            )

        return code

    # =========================================================
    # CREATE / UPDATE USER
    # =========================================================

    def add_user(
        self,
        user_id,
        username=None,
        first_name=None,
        referred_by=None
    ):

        user = self.get_user(user_id)

        if user:
            self.execute(
                """
                UPDATE users
                SET username = ?,
                    first_name = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (username, first_name, user_id)
            )

            return self.get_user(user_id)

        referral_code = self.generate_referral_code(user_id)

        self.execute(
            """
            INSERT INTO users
            (
                user_id,
                username,
                first_name,
                points,
                referral_code,
                referred_by
            )
            VALUES (?, ?, ?, 0, ?, ?)
            """,
            (
                user_id,
                username,
                first_name,
                referral_code,
                referred_by
            )
        )

        # Referral reward
        if referred_by and int(referred_by) != int(user_id):

            referrer = self.get_user(referred_by)

            if referrer:

                referral_added = self.add_referral(
                    referred_by,
                    user_id
                )

                if referral_added:
                    self.add_points(
                        referred_by,
                        10
                    )

        return self.get_user(user_id)

    # =========================================================
    # GET USER
    # =========================================================

    def get_user(self, user_id):

        return self.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
            fetchone=True
        )

    # =========================================================
    # GET ALL USERS
    # =========================================================

    def get_all_users(self):

        return self.execute(
            """
            SELECT *
            FROM users
            ORDER BY created_at DESC
            """,
            fetchall=True
        )

    # =========================================================
    # POINTS
    # =========================================================

    def add_points(self, user_id, points):

        self.execute(
            """
            UPDATE users
            SET points = points + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (points, user_id)
        )

        return self.get_user(user_id)

    def remove_points(self, user_id, points):

        self.execute(
            """
            UPDATE users
            SET points = CASE
                WHEN points - ? < 0 THEN 0
                ELSE points - ?
            END,
            updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (points, points, user_id)
        )

        return self.get_user(user_id)

    def get_points(self, user_id):

        user = self.get_user(user_id)

        if not user:
            return 0

        return user["points"]

    # =========================================================
    # TASKS
    # =========================================================

    def add_task(
        self,
        title,
        description="",
        points=0,
        task_type="general",
        target=None
    ):

        if self.db_type == "postgres":

            result = self.execute(
                """
                INSERT INTO tasks
                (
                    title,
                    description,
                    points,
                    task_type,
                    target
                )
                VALUES (?, ?, ?, ?, ?)
                RETURNING task_id
                """,
                (
                    title,
                    description,
                    points,
                    task_type,
                    target
                ),
                fetchone=True
            )

            return result["task_id"]

        conn = self.connect()

        try:
            cur = conn.cursor()

            cur.execute(
                """
                INSERT INTO tasks
                (
                    title,
                    description,
                    points,
                    task_type,
                    target
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    title,
                    description,
                    points,
                    task_type,
                    target
                )
            )

            conn.commit()

            return cur.lastrowid

        finally:
            conn.close()

    def get_tasks(self):

        if self.db_type == "postgres":

            return self.execute(
                """
                SELECT *
                FROM tasks
                WHERE is_active = TRUE
                ORDER BY task_id ASC
                """,
                fetchall=True
            )

        return self.execute(
            """
            SELECT *
            FROM tasks
            WHERE is_active = 1
            ORDER BY task_id ASC
            """,
            fetchall=True
        )

    def get_task(self, task_id):

        return self.execute(
            """
            SELECT *
            FROM tasks
            WHERE task_id = ?
            """,
            (task_id,),
            fetchone=True
        )

    # =========================================================
    # COMPLETED TASKS
    # =========================================================

    def is_task_completed(self, user_id, task_id):

        result = self.execute(
            """
            SELECT id
            FROM completed_tasks
            WHERE user_id = ?
            AND task_id = ?
            """,
            (user_id, task_id),
            fetchone=True
        )

        return result is not None

    def complete_task(self, user_id, task_id):

        if self.is_task_completed(user_id, task_id):
            return False

        task = self.get_task(task_id)

        if not task:
            return False

        conn = self.connect()

        try:
            cur = conn.cursor()

            if self.db_type == "postgres":
                query = """
                    INSERT INTO completed_tasks
                    (user_id, task_id)
                    VALUES (%s, %s)
                """
                cur.execute(
                    query,
                    (user_id, task_id)
                )

            else:
                cur.execute(
                    """
                    INSERT INTO completed_tasks
                    (user_id, task_id)
                    VALUES (?, ?)
                    """,
                    (user_id, task_id)
                )

            conn.commit()

        except Exception:
            conn.rollback()
            return False

        finally:
            conn.close()

        self.add_points(
            user_id,
            task["points"]
        )

        return True

    def get_completed_tasks(self, user_id):

        return self.execute(
            """
            SELECT task_id, completed_at
            FROM completed_tasks
            WHERE user_id = ?
            ORDER BY completed_at DESC
            """,
            (user_id,),
            fetchall=True
        )

    # =========================================================
    # REFERRALS
    # =========================================================

    def add_referral(self, referrer_id, referred_id):

        if int(referrer_id) == int(referred_id):
            return False

        existing = self.execute(
            """
            SELECT id
            FROM referrals
            WHERE referred_id = ?
            """,
            (referred_id,),
            fetchone=True
        )

        if existing:
            return False

        try:

            conn = self.connect()

            try:
                cur = conn.cursor()

                if self.db_type == "postgres":

                    cur.execute(
                        """
                        INSERT INTO referrals
                        (referrer_id, referred_id)
                        VALUES (%s, %s)
                        """,
                        (
                            referrer_id,
                            referred_id
                        )
                    )

                else:

                    cur.execute(
                        """
                        INSERT INTO referrals
                        (referrer_id, referred_id)
                        VALUES (?, ?)
                        """,
                        (
                            referrer_id,
                            referred_id
                        )
                    )

                conn.commit()

            finally:
                conn.close()

            return True

        except Exception:
            return False

    def get_referral_count(self, user_id):

        result = self.execute(
            """
            SELECT COUNT(*) AS count
            FROM referrals
            WHERE referrer_id = ?
            """,
            (user_id,),
            fetchone=True
        )

        return int(result["count"])

    def get_referrals(self, user_id):

        return self.execute(
            """
            SELECT *
            FROM referrals
            WHERE referrer_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
            fetchall=True
        )

    # =========================================================
    # REFERRAL LINK
    # =========================================================

    def get_referral_link(
        self,
        user_id,
        bot_username="AmirAFG123_bot"
    ):

        return (
            f"https://t.me/{bot_username}"
            f"?start=ref_{user_id}"
        )

    # =========================================================
    # USER STATISTICS
    # =========================================================

    def get_user_stats(self, user_id):

        user = self.get_user(user_id)

        if not user:
            return None

        referrals = self.get_referral_count(user_id)

        completed = self.execute(
            """
            SELECT COUNT(*) AS count
            FROM completed_tasks
            WHERE user_id = ?
            """,
            (user_id,),
            fetchone=True
        )

        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "first_name": user["first_name"],
            "points": user["points"],
            "referral_code": user["referral_code"],
            "referrals": referrals,
            "completed_tasks": int(completed["count"])
        }

    # =========================================================
    # ADMIN
    # =========================================================

    def set_points(self, user_id, points):

        self.execute(
            """
            UPDATE users
            SET points = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
            """,
            (points, user_id)
        )

        return self.get_user(user_id)

    def delete_user(self, user_id):

        conn = self.connect()

        try:
            cur = conn.cursor()

            if self.db_type == "postgres":

                cur.execute(
                    "DELETE FROM completed_tasks WHERE user_id = %s",
                    (user_id,)
                )

                cur.execute(
                    """
                    DELETE FROM referrals
                    WHERE referrer_id = %s
                    OR referred_id = %s
                    """,
                    (user_id, user_id)
                )

                cur.execute(
                    "DELETE FROM users WHERE user_id = %s",
                    (user_id,)
                )

            else:

                cur.execute(
                    "DELETE FROM completed_tasks WHERE user_id = ?",
                    (user_id,)
                )

                cur.execute(
                    """
                    DELETE FROM referrals
                    WHERE referrer_id = ?
                    OR referred_id = ?
                    """,
                    (user_id, user_id)
                )

                cur.execute(
                    "DELETE FROM users WHERE user_id = ?",
                    (user_id,)
                )

            conn.commit()

        finally:
            conn.close()

    # =========================================================
    # DATABASE HEALTH
    # =========================================================

    def test_connection(self):

        try:

            conn = self.connect()

            try:
                cur = conn.cursor()
                cur.execute("SELECT 1")
                cur.fetchone()

            finally:
                conn.close()

            return True

        except Exception:
            return False