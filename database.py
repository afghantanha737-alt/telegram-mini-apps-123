"""
Amir Crypto Hub
Database Manager

Primary database:
    PostgreSQL via DATABASE_URL

Fallback:
    SQLite when DATABASE_URL is not available

Features:
- Users
- Points
- Tasks
- Referrals
- Referral bonuses
- Points history
- Leaderboard
- PostgreSQL persistence
"""

import os
import sqlite3
from typing import Dict, List, Optional, Tuple

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None


class Database:

    def __init__(self, db_name: str = "amir_bot.db"):
        self.database_url = os.getenv("DATABASE_URL", "").strip()
        self.db_name = db_name

        if self.database_url and psycopg2 is None:
            raise RuntimeError(
                "DATABASE_URL is set but psycopg2-binary is not installed."
            )

        self.is_postgres = bool(self.database_url)

        self.init_db()

    # =========================================================
    # DATABASE TYPE
    # =========================================================

    def using_postgres(self) -> bool:
        return self.is_postgres

    # =========================================================
    # CONNECTION
    # =========================================================

    def get_connection(self):

        if self.is_postgres:

            conn = psycopg2.connect(
                self.database_url,
                connect_timeout=15
            )

            return conn

        conn = sqlite3.connect(
            self.db_name,
            timeout=30
        )

        conn.row_factory = sqlite3.Row

        return conn

    # =========================================================
    # QUERY HELPERS
    # =========================================================

    def _placeholder(self):
        return "%s" if self.is_postgres else "?"

    def _row_to_dict(self, row):

        if row is None:
            return None

        if isinstance(row, dict):
            return dict(row)

        return dict(row)

    def _fetchone(self, cursor):

        row = cursor.fetchone()

        if row is None:
            return None

        return self._row_to_dict(row)

    def _fetchall(self, cursor):

        rows = cursor.fetchall()

        return [
            self._row_to_dict(row)
            for row in rows
        ]

    def _execute(self, cursor, query, params=()):

        if self.is_postgres:
            cursor.execute(
                query.replace("?", "%s"),
                params
            )
        else:
            cursor.execute(
                query,
                params
            )

    def _last_insert_id(self, cursor):

        if self.is_postgres:
            row = cursor.fetchone()
            if row:
                return row[0]
            return None

        return cursor.lastrowid

    # =========================================================
    # DATABASE INITIALIZATION
    # =========================================================

    def init_db(self):

        conn = self.get_connection()

        try:

            if self.is_postgres:

                cursor = conn.cursor()

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (

                        user_id BIGINT PRIMARY KEY,

                        username TEXT,

                        first_name TEXT,

                        points INTEGER NOT NULL DEFAULT 0,

                        referral_code TEXT UNIQUE,

                        referred_by BIGINT,

                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        CONSTRAINT fk_users_referrer
                            FOREIGN KEY (referred_by)
                            REFERENCES users(user_id)
                            ON DELETE SET NULL
                    )
                """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS completed_tasks (

                        id BIGSERIAL PRIMARY KEY,

                        user_id BIGINT NOT NULL,

                        task_name TEXT NOT NULL,

                        points_earned INTEGER NOT NULL DEFAULT 0,

                        completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        CONSTRAINT fk_completed_tasks_user
                            FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        CONSTRAINT unique_completed_task
                            UNIQUE(user_id, task_name)
                    )
                """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (

                        id BIGSERIAL PRIMARY KEY,

                        referrer_id BIGINT NOT NULL,

                        referred_user_id BIGINT NOT NULL,

                        status TEXT NOT NULL DEFAULT 'active',

                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        CONSTRAINT fk_referrer
                            FOREIGN KEY (referrer_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        CONSTRAINT fk_referred_user
                            FOREIGN KEY (referred_user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        CONSTRAINT unique_referred_user
                            UNIQUE(referred_user_id)
                    )
                """)

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS points_log (

                        id BIGSERIAL PRIMARY KEY,

                        user_id BIGINT NOT NULL,

                        points INTEGER NOT NULL,

                        reason TEXT NOT NULL,

                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        CONSTRAINT fk_points_log_user
                            FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE
                    )
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_users_points
                    ON users(points DESC)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_referrals_referrer
                    ON referrals(referrer_id)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_points_log_user
                    ON points_log(user_id)
                """)

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_completed_tasks_user
                    ON completed_tasks(user_id)
                """)

                conn.commit()

            else:

                cursor = conn.cursor()

                cursor.execute("""
                    PRAGMA foreign_keys = ON
                """)

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
                            ON DELETE SET NULL
                    )
                """)

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

        finally:

            conn.close()

    # =========================================================
    # REFERRAL CODE
    # =========================================================

    def generate_referral_code(self, user_id: int) -> str:
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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = self._fetchone(cursor)

            if user:

                new_username = username or user.get("username") or ""
                new_first_name = (
                    first_name
                    or user.get("first_name")
                    or "User"
                )

                self._execute(
                    cursor,
                    """
                    UPDATE users
                    SET
                        username = ?,
                        first_name = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                    """,
                    (
                        new_username,
                        new_first_name,
                        user_id
                    )
                )

                conn.commit()

                self._execute(
                    cursor,
                    """
                    SELECT *
                    FROM users
                    WHERE user_id = ?
                    """,
                    (user_id,)
                )

                return self._fetchone(cursor)

            referral_code = self.generate_referral_code(user_id)

            self._execute(
                cursor,
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

            self._execute(
                cursor,
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            return self._fetchone(cursor)

        except Exception:

            conn.rollback()
            raise

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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            return self._fetchone(cursor)

        finally:

            conn.close()

    # =========================================================
    # GET USER BY USERNAME
    # =========================================================

    def get_user_by_username(
        self,
        username: str
    ) -> Optional[Dict]:

        if not username:
            return None

        username = username.lstrip("@")

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM users
                WHERE username = ?
                """,
                (username,)
            )

            return self._fetchone(cursor)

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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM users
                WHERE referral_code = ?
                """,
                (referral_code,)
            )

            return self._fetchone(cursor)

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

        if user_id == referrer_id:
            return False

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT referred_by
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = self._fetchone(cursor)

            if not user:
                return False

            if user["referred_by"] is not None:
                return False

            self._execute(
                cursor,
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (referrer_id,)
            )

            if not self._fetchone(cursor):
                return False

            self._execute(
                cursor,
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

        except Exception:

            conn.rollback()
            return False

        finally:

            conn.close()

    # =========================================================
    # ADD POINTS
    # =========================================================

    def add_points(
        self,
        user_id: int,
        points: int,
        reason: str = "Task completed"
    ) -> Tuple[bool, int]:

        try:

            points = int(points)

        except (TypeError, ValueError):

            return False, 0

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT points
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = self._fetchone(cursor)

            if not user:
                return False, 0

            current = int(user["points"] or 0)
            new_points = current + points

            self._execute(
                cursor,
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

            self._execute(
                cursor,
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

        except Exception:

            conn.rollback()
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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT points
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            result = self._fetchone(cursor)

            if not result:
                return 0

            return int(result["points"] or 0)

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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
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

            existing = self._fetchone(cursor)

            if existing:
                return True, True

            self._execute(
                cursor,
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            if not self._fetchone(cursor):
                return False, False

            self._execute(
                cursor,
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
                    int(points)
                )
            )

            self._execute(
                cursor,
                """
                UPDATE users
                SET
                    points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    int(points),
                    user_id
                )
            )

            self._execute(
                cursor,
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
                    int(points),
                    f"Task: {task_name}"
                )
            )

            conn.commit()

            return True, False

        except Exception:

            conn.rollback()
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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
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

            return self._fetchone(cursor) is not None

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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT task_name
                FROM completed_tasks
                WHERE user_id = ?
                ORDER BY completed_at ASC
                """,
                (user_id,)
            )

            rows = cursor.fetchall()

            result = []

            for row in rows:

                if isinstance(row, dict):
                    result.append(row["task_name"])
                else:
                    result.append(row["task_name"])

            return result

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

        if referrer_id == referred_user_id:
            return False, False

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            # Referrer must exist
            self._execute(
                cursor,
                """
                SELECT user_id
                FROM users
                WHERE user_id = ?
                """,
                (referrer_id,)
            )

            if not self._fetchone(cursor):
                return False, False

            # Referred user
            self._execute(
                cursor,
                """
                SELECT user_id, referred_by
                FROM users
                WHERE user_id = ?
                """,
                (referred_user_id,)
            )

            referred_user = self._fetchone(cursor)

            if not referred_user:
                return False, False

            # Already referred
            if referred_user["referred_by"] is not None:
                return True, True

            # Check referral table
            self._execute(
                cursor,
                """
                SELECT id
                FROM referrals
                WHERE referred_user_id = ?
                """,
                (referred_user_id,)
            )

            if self._fetchone(cursor):
                return True, True

            # Set referrer
            self._execute(
                cursor,
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

            # Insert referral
            self._execute(
                cursor,
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

            # Bonus
            self._execute(
                cursor,
                """
                UPDATE users
                SET
                    points = points + ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    int(bonus),
                    referrer_id
                )
            )

            # Log bonus
            self._execute(
                cursor,
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
                    int(bonus),
                    f"Referral bonus from user {referred_user_id}"
                )
            )

            conn.commit()

            return True, False

        except Exception:

            conn.rollback()
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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
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

            return self._fetchall(cursor)

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

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT COUNT(*)
                FROM referrals
                WHERE referrer_id = ?
                AND status = 'active'
                """,
                (referrer_id,)
            )

            row = cursor.fetchone()

            return int(row[0] or 0)

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

        completed_tasks = self.get_completed_tasks(user_id)
        referrals = self.get_referrals(user_id)

        return {
            "user_id": user["user_id"],
            "username": user["username"] or "",
            "first_name": user["first_name"] or "User",
            "points": int(user["points"] or 0),
            "referral_code": user["referral_code"],
            "referred_by": user["referred_by"],
            "tasks_completed": len(completed_tasks),
            "completed_tasks": completed_tasks,
            "referrals_count": len(referrals),
            "referrals": referrals,
            "created_at": user["created_at"]
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

        try:

            cursor = conn.cursor()

            if self.is_postgres:

                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.username,
                        u.first_name,
                        u.points,

                        (
                            SELECT COUNT(*)
                            FROM completed_tasks ct
                            WHERE ct.user_id = u.user_id
                        ) AS tasks,

                        (
                            SELECT COUNT(*)
                            FROM referrals r
                            WHERE r.referrer_id = u.user_id
                            AND r.status = 'active'
                        ) AS referrals

                    FROM users u

                    ORDER BY u.points DESC, u.user_id ASC

                    LIMIT %s
                    """,
                    (limit,)
                )

            else:

                cursor.execute(
                    """
                    SELECT
                        u.user_id,
                        u.username,
                        u.first_name,
                        u.points,

                        (
                            SELECT COUNT(*)
                            FROM completed_tasks ct
                            WHERE ct.user_id = u.user_id
                        ) AS tasks,

                        (
                            SELECT COUNT(*)
                            FROM referrals r
                            WHERE r.referrer_id = u.user_id
                            AND r.status = 'active'
                        ) AS referrals

                    FROM users u

                    ORDER BY u.points DESC, u.user_id ASC

                    LIMIT ?
                    """,
                    (limit,)
                )

            return self._fetchall(cursor)

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

        try:

            cursor = conn.cursor()

            if self.is_postgres:

                cursor.execute(
                    """
                    SELECT
                        points,
                        reason,
                        created_at

                    FROM points_log

                    WHERE user_id = %s

                    ORDER BY id DESC

                    LIMIT %s
                    """,
                    (
                        user_id,
                        limit
                    )
                )

            else:

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

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # DATABASE STATS
    # =========================================================

    def get_database_stats(self) -> Dict:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            cursor.execute(
                "SELECT COUNT(*) FROM users"
            )

            users = int(cursor.fetchone()[0] or 0)

            cursor.execute(
                "SELECT COALESCE(SUM(points), 0) FROM users"
            )

            points = int(cursor.fetchone()[0] or 0)

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM referrals
                WHERE status = 'active'
                """
            )

            referrals = int(cursor.fetchone()[0] or 0)

            cursor.execute(
                "SELECT COUNT(*) FROM completed_tasks"
            )

            tasks = int(cursor.fetchone()[0] or 0)

            return {
                "users": users,
                "points": points,
                "referrals": referrals,
                "tasks": tasks
            }

        finally:

            conn.close()

    # =========================================================
    # GET ALL USERS
    # =========================================================

    def get_all_users(
        self,
        limit: int = 50,
        offset: int = 0,
        search: str = ""
    ) -> List[Dict]:

        limit = max(1, min(int(limit), 100))
        offset = max(0, int(offset))

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            search = (search or "").strip()

            if search:

                pattern = f"%{search}%"

                if self.is_postgres:

                    cursor.execute(
                        """
                        SELECT
                            u.*,
                            (
                                SELECT COUNT(*)
                                FROM referrals r
                                WHERE r.referrer_id = u.user_id
                                AND r.status = 'active'
                            ) AS referrals_count,

                            (
                                SELECT COUNT(*)
                                FROM completed_tasks ct
                                WHERE ct.user_id = u.user_id
                            ) AS tasks_completed

                        FROM users u

                        WHERE
                            CAST(u.user_id AS TEXT) ILIKE %s
                            OR COALESCE(u.username, '') ILIKE %s
                            OR COALESCE(u.first_name, '') ILIKE %s

                        ORDER BY u.created_at DESC

                        LIMIT %s
                        OFFSET %s
                        """,
                        (
                            pattern,
                            pattern,
                            pattern,
                            limit,
                            offset
                        )
                    )

                else:

                    cursor.execute(
                        """
                        SELECT
                            u.*,

                            (
                                SELECT COUNT(*)
                                FROM referrals r
                                WHERE r.referrer_id = u.user_id
                                AND r.status = 'active'
                            ) AS referrals_count,

                            (
                                SELECT COUNT(*)
                                FROM completed_tasks ct
                                WHERE ct.user_id = u.user_id
                            ) AS tasks_completed

                        FROM users u

                        WHERE
                            CAST(u.user_id AS TEXT) LIKE ?
                            OR COALESCE(u.username, '') LIKE ?
                            OR COALESCE(u.first_name, '') LIKE ?

                        ORDER BY u.created_at DESC

                        LIMIT ?
                        OFFSET ?
                        """,
                        (
                            pattern,
                            pattern,
                            pattern,
                            limit,
                            offset
                        )
                    )

            else:

                if self.is_postgres:

                    cursor.execute(
                        """
                        SELECT
                            u.*,

                            (
                                SELECT COUNT(*)
                                FROM referrals r
                                WHERE r.referrer_id = u.user_id
                                AND r.status = 'active'
                            ) AS referrals_count,

                            (
                                SELECT COUNT(*)
                                FROM completed_tasks ct
                                WHERE ct.user_id = u.user_id
                            ) AS tasks_completed

                        FROM users u

                        ORDER BY u.created_at DESC

                        LIMIT %s
                        OFFSET %s
                        """,
                        (
                            limit,
                            offset
                        )
                    )

                else:

                    cursor.execute(
                        """
                        SELECT
                            u.*,

                            (
                                SELECT COUNT(*)
                                FROM referrals r
                                WHERE r.referrer_id = u.user_id
                                AND r.status = 'active'
                            ) AS referrals_count,

                            (
                                SELECT COUNT(*)
                                FROM completed_tasks ct
                                WHERE ct.user_id = u.user_id
                            ) AS tasks_completed

                        FROM users u

                        ORDER BY u.created_at DESC

                        LIMIT ?
                        OFFSET ?
                        """,
                        (
                            limit,
                            offset
                        )
                    )

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # GET RECENT REFERRALS
    # =========================================================

    def get_recent_referrals(
        self,
        limit: int = 100
    ) -> List[Dict]:

        limit = max(
            1,
            min(int(limit), 200)
        )

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            if self.is_postgres:

                cursor.execute(
                    """
                    SELECT
                        r.id,
                        r.referrer_id,
                        r.referred_user_id,
                        r.status,
                        r.created_at

                    FROM referrals r

                    ORDER BY r.id DESC

                    LIMIT %s
                    """,
                    (limit,)
                )

            else:

                cursor.execute(
                    """
                    SELECT
                        r.id,
                        r.referrer_id,
                        r.referred_user_id,
                        r.status,
                        r.created_at

                    FROM referrals r

                    ORDER BY r.id DESC

                    LIMIT ?
                    """,
                    (limit,)
                )

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # ADMIN CHANGE POINTS
    # =========================================================

    def change_points(
        self,
        user_id: int,
        amount: int,
        reason: str = "Admin adjustment"
    ) -> Tuple[bool, int]:

        try:
            amount = int(amount)
        except (TypeError, ValueError):
            return False, 0

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT points
                FROM users
                WHERE user_id = ?
                """,
                (user_id,)
            )

            user = self._fetchone(cursor)

            if not user:
                return False, 0

            current = int(user["points"] or 0)

            # Prevent negative balance.
            new_points = max(
                0,
                current + amount
            )

            actual_change = new_points - current

            self._execute(
                cursor,
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

            if actual_change != 0:

                self._execute(
                    cursor,
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
                        actual_change,
                        reason
                    )
                )

            conn.commit()

            return True, new_points

        except Exception:

            conn.rollback()
            return False, 0

        finally:

            conn.close()

    # =========================================================
    # CLEAR DATABASE
    # =========================================================

    def clear_all(self):

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

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

        except Exception:

            conn.rollback()
            raise

        finally:

            conn.close()


# =============================================================
# TEST
# =============================================================

if __name__ == "__main__":

    print("======================================")
    print("Amir Crypto Hub Database")
    print("======================================")

    db = Database()

    if db.using_postgres():
        print("Database: PostgreSQL")
    else:
        print("Database: SQLite fallback")

    print("Database initialized successfully.")

    try:

        user = db.get_or_create_user(
            111111111,
            "test_user",
            "Test User"
        )

        print("User:", user)

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

        referred = db.get_or_create_user(
            222222222,
            "test_user_2",
            "Test User 2"
        )

        referral_success, referral_already = db.add_referral(
            111111111,
            222222222,
            5
        )

        print(
            "Referral:",
            referral_success,
            referral_already
        )

        stats = db.get_user_stats(
            111111111
        )

        print(
            "Stats:",
            stats
        )

        print(
            "Database stats:",
            db.get_database_stats()
        )

        print("TEST COMPLETED")

    except Exception as exc:

        print("DATABASE TEST FAILED:")
        print(exc)
        raise