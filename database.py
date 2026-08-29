"""
Amir Crypto Hub
Database Manager

Supports:
- PostgreSQL on Render
- SQLite fallback for local testing

Features:
- Users
- Points
- Tasks
- Task completion
- Referrals
- Referral rewards
- Points history
- Withdrawals
- Admin point adjustments
- Admin task management
- Leaderboard
- Statistics
"""

import os
import sqlite3
from typing import Optional, List, Dict, Tuple

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
                "DATABASE_URL is configured, but psycopg2-binary is not installed."
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

            return psycopg2.connect(
                self.database_url,
                connect_timeout=15
            )

        conn = sqlite3.connect(
            self.db_name,
            timeout=30
        )

        conn.row_factory = sqlite3.Row

        return conn

    # =========================================================
    # QUERY HELPERS
    # =========================================================

    def _execute(self, cursor, query: str, params=()):

        if self.is_postgres:
            query = query.replace("?", "%s")
            cursor.execute(query, params)
        else:
            cursor.execute(query, params)

    def _fetchone(self, cursor):

        row = cursor.fetchone()

        if row is None:
            return None

        if isinstance(row, dict):
            return dict(row)

        if hasattr(row, "keys"):
            return dict(row)

        columns = [desc[0] for desc in cursor.description]

        return dict(zip(columns, row))

    def _fetchall(self, cursor):

        rows = cursor.fetchall()

        if not rows:
            return []

        if isinstance(rows[0], dict):
            return [dict(row) for row in rows]

        if hasattr(rows[0], "keys"):
            return [dict(row) for row in rows]

        columns = [desc[0] for desc in cursor.description]

        return [
            dict(zip(columns, row))
            for row in rows
        ]

    # =========================================================
    # INITIALIZE DATABASE
    # =========================================================

    def init_db(self):

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            if not self.is_postgres:

                cursor.execute("PRAGMA foreign_keys = ON")

            # -------------------------------------------------
            # USERS
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (

                        user_id BIGINT PRIMARY KEY,

                        username TEXT,

                        first_name TEXT,

                        points INTEGER NOT NULL DEFAULT 0,

                        referral_code TEXT UNIQUE,

                        referred_by BIGINT,

                        created_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        updated_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (referred_by)
                            REFERENCES users(user_id)
                            ON DELETE SET NULL
                    )
                """)

            else:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (

                        user_id INTEGER PRIMARY KEY,

                        username TEXT,

                        first_name TEXT,

                        points INTEGER NOT NULL DEFAULT 0,

                        referral_code TEXT UNIQUE,

                        referred_by INTEGER,

                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (referred_by)
                            REFERENCES users(user_id)
                            ON DELETE SET NULL
                    )
                """)

            # -------------------------------------------------
            # TASKS
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS tasks (

                        id BIGSERIAL PRIMARY KEY,

                        title TEXT NOT NULL,

                        description TEXT DEFAULT '',

                        link TEXT NOT NULL,

                        task_type TEXT NOT NULL DEFAULT 'link',

                        reward INTEGER NOT NULL DEFAULT 0,

                        active BOOLEAN NOT NULL DEFAULT TRUE,

                        created_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP
                    )
                """)

            else:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS tasks (

                        id INTEGER PRIMARY KEY AUTOINCREMENT,

                        title TEXT NOT NULL,

                        description TEXT DEFAULT '',

                        link TEXT NOT NULL,

                        task_type TEXT NOT NULL DEFAULT 'link',

                        reward INTEGER NOT NULL DEFAULT 0,

                        active INTEGER NOT NULL DEFAULT 1,

                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)

            # -------------------------------------------------
            # COMPLETED TASKS
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS completed_tasks (

                        id BIGSERIAL PRIMARY KEY,

                        user_id BIGINT NOT NULL,

                        task_id BIGINT NOT NULL,

                        points_earned INTEGER NOT NULL DEFAULT 0,

                        completed_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        FOREIGN KEY (task_id)
                            REFERENCES tasks(id)
                            ON DELETE CASCADE,

                        UNIQUE(user_id, task_id)
                    )
                """)

            else:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS completed_tasks (

                        id INTEGER PRIMARY KEY AUTOINCREMENT,

                        user_id INTEGER NOT NULL,

                        task_id INTEGER NOT NULL,

                        points_earned INTEGER NOT NULL DEFAULT 0,

                        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        FOREIGN KEY (task_id)
                            REFERENCES tasks(id)
                            ON DELETE CASCADE,

                        UNIQUE(user_id, task_id)
                    )
                """)

            # -------------------------------------------------
            # REFERRALS
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (

                        id BIGSERIAL PRIMARY KEY,

                        referrer_id BIGINT NOT NULL,

                        referred_user_id BIGINT NOT NULL,

                        bonus INTEGER NOT NULL DEFAULT 0,

                        status TEXT NOT NULL DEFAULT 'active',

                        created_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (referrer_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        FOREIGN KEY (referred_user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE,

                        UNIQUE(referred_user_id)
                    )
                """)

            else:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS referrals (

                        id INTEGER PRIMARY KEY AUTOINCREMENT,

                        referrer_id INTEGER NOT NULL,

                        referred_user_id INTEGER NOT NULL,

                        bonus INTEGER NOT NULL DEFAULT 0,

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

            # -------------------------------------------------
            # POINTS LOG
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS points_log (

                        id BIGSERIAL PRIMARY KEY,

                        user_id BIGINT NOT NULL,

                        points INTEGER NOT NULL,

                        reason TEXT NOT NULL,

                        created_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE
                    )
                """)

            else:

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

            # -------------------------------------------------
            # WITHDRAWALS
            # -------------------------------------------------

            if self.is_postgres:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS withdrawals (

                        id BIGSERIAL PRIMARY KEY,

                        user_id BIGINT NOT NULL,

                        points INTEGER NOT NULL,

                        method TEXT NOT NULL,

                        wallet TEXT DEFAULT '',

                        status TEXT NOT NULL DEFAULT 'pending',

                        admin_note TEXT DEFAULT '',

                        created_at TIMESTAMP NOT NULL
                            DEFAULT CURRENT_TIMESTAMP,

                        processed_at TIMESTAMP,

                        FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE
                    )
                """)

            else:

                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS withdrawals (

                        id INTEGER PRIMARY KEY AUTOINCREMENT,

                        user_id INTEGER NOT NULL,

                        points INTEGER NOT NULL,

                        method TEXT NOT NULL,

                        wallet TEXT DEFAULT '',

                        status TEXT DEFAULT 'pending',

                        admin_note TEXT DEFAULT '',

                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                        processed_at TIMESTAMP,

                        FOREIGN KEY (user_id)
                            REFERENCES users(user_id)
                            ON DELETE CASCADE
                    )
                """)

            # -------------------------------------------------
            # INDEXES
            # -------------------------------------------------

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_users_points
                ON users(points)
            """)

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_completed_user
                ON completed_tasks(user_id)
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
                CREATE INDEX IF NOT EXISTS idx_withdrawals_user
                ON withdrawals(user_id)
            """)

            conn.commit()

        except Exception:

            conn.rollback()

            raise

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

                username = username or user.get("username") or ""
                first_name = first_name or user.get("first_name") or "User"

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
                        username,
                        first_name,
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

        username = (username or "").strip().lstrip("@")

        if not username:
            return None

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

        referral_code = (referral_code or "").strip()

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
        reason: str = "Reward"
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
    # CHANGE POINTS
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
    # GET POINTS
    # =========================================================

    def get_points(
        self,
        user_id: int
    ) -> int:

        user = self.get_user(user_id)

        if not user:
            return 0

        return int(user["points"] or 0)

    # =========================================================
    # CREATE TASK
    # =========================================================

    def create_task(
        self,
        title: str,
        description: str,
        link: str,
        reward: int,
        task_type: str = "link"
    ) -> Optional[int]:

        title = (title or "").strip()
        description = (description or "").strip()
        link = (link or "").strip()
        task_type = (task_type or "link").strip()

        try:
            reward = int(reward)
        except (TypeError, ValueError):
            return None

        if not title or not link or reward < 0:
            return None

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            if self.is_postgres:

                cursor.execute(
                    """
                    INSERT INTO tasks
                    (
                        title,
                        description,
                        link,
                        task_type,
                        reward,
                        active
                    )
                    VALUES (%s, %s, %s, %s, %s, TRUE)
                    RETURNING id
                    """,
                    (
                        title,
                        description,
                        link,
                        task_type,
                        reward
                    )
                )

                row = cursor.fetchone()

                task_id = int(row[0])

            else:

                cursor.execute(
                    """
                    INSERT INTO tasks
                    (
                        title,
                        description,
                        link,
                        task_type,
                        reward,
                        active
                    )
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    (
                        title,
                        description,
                        link,
                        task_type,
                        reward
                    )
                )

                task_id = cursor.lastrowid

            conn.commit()

            return int(task_id)

        except Exception:

            conn.rollback()

            return None

        finally:

            conn.close()

    # =========================================================
    # GET TASK
    # =========================================================

    def get_task(
        self,
        task_id: int
    ) -> Optional[Dict]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM tasks
                WHERE id = ?
                """,
                (int(task_id),)
            )

            return self._fetchone(cursor)

        finally:

            conn.close()

    # =========================================================
    # GET ACTIVE TASKS
    # =========================================================

    def get_active_tasks(
        self
    ) -> List[Dict]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM tasks
                WHERE active = 1
                ORDER BY id DESC
                """,
            )

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # GET ALL TASKS
    # =========================================================

    def get_all_tasks(
        self
    ) -> List[Dict]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT *
                FROM tasks
                ORDER BY id DESC
                """
            )

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # UPDATE TASK
    # =========================================================

    def update_task(
        self,
        task_id: int,
        title: str,
        description: str,
        link: str,
        reward: int,
        active: bool = True
    ) -> bool:

        try:
            reward = int(reward)
        except (TypeError, ValueError):
            return False

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                UPDATE tasks
                SET
                    title = ?,
                    description = ?,
                    link = ?,
                    reward = ?,
                    active = ?
                WHERE id = ?
                """,
                (
                    title.strip(),
                    (description or "").strip(),
                    link.strip(),
                    reward,
                    1 if active else 0,
                    int(task_id)
                )
            )

            changed = cursor.rowcount

            conn.commit()

            return changed > 0

        except Exception:

            conn.rollback()

            return False

        finally:

            conn.close()

    # =========================================================
    # TOGGLE TASK
    # =========================================================

    def toggle_task(
        self,
        task_id: int
    ) -> bool:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT active
                FROM tasks
                WHERE id = ?
                """,
                (int(task_id),)
            )

            task = self._fetchone(cursor)

            if not task:
                return False

            current = task["active"]

            if isinstance(current, str):
                current = current.lower() in (
                    "true",
                    "1",
                    "yes"
                )

            new_status = 0 if bool(current) else 1

            self._execute(
                cursor,
                """
                UPDATE tasks
                SET active = ?
                WHERE id = ?
                """,
                (
                    new_status,
                    int(task_id)
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
    # DELETE TASK
    # =========================================================

    def delete_task(
        self,
        task_id: int
    ) -> bool:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                DELETE FROM tasks
                WHERE id = ?
                """,
                (int(task_id),)
            )

            deleted = cursor.rowcount

            conn.commit()

            return deleted > 0

        except Exception:

            conn.rollback()

            return False

        finally:

            conn.close()

    # =========================================================
    # COMPLETE TASK
    # =========================================================

    def complete_task(
        self,
        user_id: int,
        task_id: int
    ) -> Tuple[bool, bool, int]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            # User
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
                return False, False, 0

            # Task
            self._execute(
                cursor,
                """
                SELECT *
                FROM tasks
                WHERE id = ?
                AND active = 1
                """,
                (int(task_id),)
            )

            task = self._fetchone(cursor)

            if not task:
                return False, False, 0

            # Already completed?
            self._execute(
                cursor,
                """
                SELECT id
                FROM completed_tasks
                WHERE user_id = ?
                AND task_id = ?
                """,
                (
                    user_id,
                    int(task_id)
                )
            )

            if self._fetchone(cursor):
                return True, True, 0

            reward = int(task["reward"] or 0)

            # Completion
            self._execute(
                cursor,
                """
                INSERT INTO completed_tasks
                (
                    user_id,
                    task_id,
                    points_earned
                )
                VALUES (?, ?, ?)
                """,
                (
                    user_id,
                    int(task_id),
                    reward
                )
            )

            # Points
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
                    reward,
                    user_id
                )
            )

            # Log
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
                    reward,
                    f"Task reward: {task['title']}"
                )
            )

            conn.commit()

            return True, False, reward

        except Exception:

            conn.rollback()

            return False, False, 0

        finally:

            conn.close()

    # =========================================================
    # IS TASK COMPLETED
    # =========================================================

    def is_task_completed(
        self,
        user_id: int,
        task_id: int
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
                AND task_id = ?
                """,
                (
                    user_id,
                    int(task_id)
                )
            )

            return self._fetchone(cursor) is not None

        finally:

            conn.close()

    # =========================================================
    # GET COMPLETED TASK IDS
    # =========================================================

    def get_completed_task_ids(
        self,
        user_id: int
    ) -> List[int]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT task_id
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
                    value = row["task_id"]
                elif hasattr(row, "keys"):
                    value = row["task_id"]
                else:
                    value = row[0]

                result.append(int(value))

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

        try:
            bonus = int(bonus)
        except (TypeError, ValueError):
            return False, False

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            # Referrer exists
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

            # Referred user exists
            self._execute(
                cursor,
                """
                SELECT user_id, referred_by
                FROM users
                WHERE user_id = ?
                """,
                (referred_user_id,)
            )

            user = self._fetchone(cursor)

            if not user:
                return False, False

            # Already referred
            if user["referred_by"] is not None:
                return True, True

            # Referral record
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

            # Create referral
            self._execute(
                cursor,
                """
                INSERT INTO referrals
                (
                    referrer_id,
                    referred_user_id,
                    bonus,
                    status
                )
                VALUES (?, ?, ?, 'active')
                """,
                (
                    referrer_id,
                    referred_user_id,
                    bonus
                )
            )

            # Reward referrer
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
                    bonus,
                    referrer_id
                )
            )

            # Log
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
                    bonus,
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
                    r.bonus,
                    r.status,
                    r.created_at AS referral_created_at
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
    # USER STATS
    # =========================================================

    def get_user_stats(
        self,
        user_id: int
    ) -> Optional[Dict]:

        user = self.get_user(user_id)

        if not user:
            return None

        completed = self.get_completed_task_ids(user_id)

        referrals = self.get_referrals(user_id)

        return {
            "user_id": int(user["user_id"]),
            "username": user["username"] or "",
            "first_name": user["first_name"] or "User",
            "points": int(user["points"] or 0),
            "referral_code": user["referral_code"] or "",
            "referred_by": user["referred_by"],
            "tasks_completed": len(completed),
            "completed_tasks": completed,
            "referrals_count": len(referrals),
            "referrals": referrals,
            "created_at": user["created_at"]
        }

    # =========================================================
    # LEADERBOARD
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

                    ORDER BY
                        u.points DESC,
                        u.user_id ASC

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

                    ORDER BY
                        u.points DESC,
                        u.user_id ASC

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
    # CREATE WITHDRAWAL
    # =========================================================

    def create_withdrawal(
        self,
        user_id: int,
        points: int,
        method: str,
        wallet: str
    ) -> Tuple[bool, Optional[int], str]:

        try:
            points = int(points)
        except (TypeError, ValueError):
            return False, None, "Invalid amount."

        method = (method or "").strip()
        wallet = (wallet or "").strip()

        if points <= 0:
            return False, None, "Amount must be greater than zero."

        if not method:
            return False, None, "Withdrawal method is required."

        if not wallet:
            return False, None, "Wallet or account is required."

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
                return False, None, "User not found."

            balance = int(user["points"] or 0)

            if balance < points:
                return False, None, "Insufficient points."

            # Deduct points immediately.
            self._execute(
                cursor,
                """
                UPDATE users
                SET
                    points = points - ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                """,
                (
                    points,
                    user_id
                )
            )

            # Log deduction.
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
                    -points,
                    "Withdrawal request"
                )
            )

            # Withdrawal record.
            if self.is_postgres:

                cursor.execute(
                    """
                    INSERT INTO withdrawals
                    (
                        user_id,
                        points,
                        method,
                        wallet,
                        status
                    )
                    VALUES (%s, %s, %s, %s, 'pending')
                    RETURNING id
                    """,
                    (
                        user_id,
                        points,
                        method,
                        wallet
                    )
                )

                row = cursor.fetchone()

                withdrawal_id = int(row[0])

            else:

                cursor.execute(
                    """
                    INSERT INTO withdrawals
                    (
                        user_id,
                        points,
                        method,
                        wallet,
                        status
                    )
                    VALUES (?, ?, ?, ?, 'pending')
                    """,
                    (
                        user_id,
                        points,
                        method,
                        wallet
                    )
                )

                withdrawal_id = cursor.lastrowid

            conn.commit()

            return True, int(withdrawal_id), "Withdrawal request created."

        except Exception:

            conn.rollback()

            return False, None, "Database error."

        finally:

            conn.close()

    # =========================================================
    # GET WITHDRAWAL
    # =========================================================

    def get_withdrawal(
        self,
        withdrawal_id: int
    ) -> Optional[Dict]:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT
                    w.*,
                    u.username,
                    u.first_name
                FROM withdrawals w
                JOIN users u
                    ON w.user_id = u.user_id
                WHERE w.id = ?
                """,
                (int(withdrawal_id),)
            )

            return self._fetchone(cursor)

        finally:

            conn.close()

    # =========================================================
    # GET USER WITHDRAWALS
    # =========================================================

    def get_user_withdrawals(
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
                    SELECT *
                    FROM withdrawals
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
                    SELECT *
                    FROM withdrawals
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
    # GET ALL WITHDRAWALS
    # =========================================================

    def get_all_withdrawals(
        self,
        status: str = "",
        limit: int = 100
    ) -> List[Dict]:

        limit = max(
            1,
            min(int(limit), 200)
        )

        status = (status or "").strip().lower()

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            if status:

                if self.is_postgres:

                    cursor.execute(
                        """
                        SELECT
                            w.*,
                            u.username,
                            u.first_name
                        FROM withdrawals w
                        JOIN users u
                            ON w.user_id = u.user_id
                        WHERE w.status = %s
                        ORDER BY w.id DESC
                        LIMIT %s
                        """,
                        (
                            status,
                            limit
                        )
                    )

                else:

                    cursor.execute(
                        """
                        SELECT
                            w.*,
                            u.username,
                            u.first_name
                        FROM withdrawals w
                        JOIN users u
                            ON w.user_id = u.user_id
                        WHERE w.status = ?
                        ORDER BY w.id DESC
                        LIMIT ?
                        """,
                        (
                            status,
                            limit
                        )
                    )

            else:

                if self.is_postgres:

                    cursor.execute(
                        """
                        SELECT
                            w.*,
                            u.username,
                            u.first_name
                        FROM withdrawals w
                        JOIN users u
                            ON w.user_id = u.user_id
                        ORDER BY w.id DESC
                        LIMIT %s
                        """,
                        (limit,)
                    )

                else:

                    cursor.execute(
                        """
                        SELECT
                            w.*,
                            u.username,
                            u.first_name
                        FROM withdrawals w
                        JOIN users u
                            ON w.user_id = u.user_id
                        ORDER BY w.id DESC
                        LIMIT ?
                        """,
                        (limit,)
                    )

            return self._fetchall(cursor)

        finally:

            conn.close()

    # =========================================================
    # APPROVE WITHDRAWAL
    # =========================================================

    def approve_withdrawal(
        self,
        withdrawal_id: int,
        admin_note: str = ""
    ) -> bool:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT status
                FROM withdrawals
                WHERE id = ?
                """,
                (int(withdrawal_id),)
            )

            withdrawal = self._fetchone(cursor)

            if not withdrawal:
                return False

            if withdrawal["status"] != "pending":
                return False

            self._execute(
                cursor,
                """
                UPDATE withdrawals
                SET
                    status = 'approved',
                    admin_note = ?,
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    admin_note or "",
                    int(withdrawal_id)
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
    # REJECT WITHDRAWAL
    # =========================================================

    def reject_withdrawal(
        self,
        withdrawal_id: int,
        admin_note: str = ""
    ) -> bool:

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            self._execute(
                cursor,
                """
                SELECT
                    user_id,
                    points,
                    status
                FROM withdrawals
                WHERE id = ?
                """,
                (int(withdrawal_id),)
            )

            withdrawal = self._fetchone(cursor)

            if not withdrawal:
                return False

            if withdrawal["status"] != "pending":
                return False

            user_id = int(withdrawal["user_id"])
            points = int(withdrawal["points"])

            # Return points to user.
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
                    points,
                    user_id
                )
            )

            # Log returned points.
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
                    "Withdrawal rejected - points returned"
                )
            )

            # Reject request.
            self._execute(
                cursor,
                """
                UPDATE withdrawals
                SET
                    status = 'rejected',
                    admin_note = ?,
                    processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    admin_note or "",
                    int(withdrawal_id)
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
    # GET ALL USERS
    # =========================================================

    def get_all_users(
        self,
        limit: int = 50,
        offset: int = 0,
        search: str = ""
    ) -> List[Dict]:

        limit = max(
            1,
            min(int(limit), 100)
        )

        offset = max(
            0,
            int(offset)
        )

        search = (search or "").strip()

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

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
    # DATABASE STATISTICS
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
                FROM tasks
                WHERE active = 1
                """
            )

            active_tasks = int(
                cursor.fetchone()[0] or 0
            )

            cursor.execute(
                "SELECT COUNT(*) FROM completed_tasks"
            )

            completed_tasks = int(
                cursor.fetchone()[0] or 0
            )

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM referrals
                WHERE status = 'active'
                """
            )

            referrals = int(
                cursor.fetchone()[0] or 0
            )

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM withdrawals
                WHERE status = 'pending'
                """
            )

            pending_withdrawals = int(
                cursor.fetchone()[0] or 0
            )

            return {
                "users": users,
                "points": points,
                "active_tasks": active_tasks,
                "completed_tasks": completed_tasks,
                "referrals": referrals,
                "pending_withdrawals": pending_withdrawals
            }

        finally:

            conn.close()

    # =========================================================
    # CLEAR DATABASE
    # =========================================================

    def clear_all(self):

        conn = self.get_connection()

        try:

            cursor = conn.cursor()

            # PostgreSQL
            if self.is_postgres:

                cursor.execute(
                    """
                    TRUNCATE TABLE
                        points_log,
                        withdrawals,
                        referrals,
                        completed_tasks,
                        tasks,
                        users
                    RESTART IDENTITY CASCADE
                    """
                )

            else:

                cursor.execute(
                    "DELETE FROM points_log"
                )

                cursor.execute(
                    "DELETE FROM withdrawals"
                )

                cursor.execute(
                    "DELETE FROM referrals"
                )

                cursor.execute(
                    "DELETE FROM completed_tasks"
                )

                cursor.execute(
                    "DELETE FROM tasks"
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
# LOCAL TEST
# =============================================================

if __name__ == "__main__":

    print()
    print("======================================")
    print("Amir Crypto Hub Database")
    print("======================================")

    try:

        db = Database()

        print(
            "Database:",
            "PostgreSQL" if db.using_postgres()
            else "SQLite"
        )

        print("Database initialized successfully.")

        user = db.get_or_create_user(
            111111111,
            "test_user",
            "Test User"
        )

        print("User created:", user["user_id"])

        success, points = db.add_points(
            111111111,
            10,
            "Test reward"
        )

        print(
            "Add points:",
            success,
            points
        )

        task_id = db.create_task(
            title="Test Task",
            description="Test advertising task",
            link="https://t.me/",
            reward=20,
            task_type="link"
        )

        print(
            "Task created:",
            task_id
        )

        if task_id:

            success, already, reward = db.complete_task(
                111111111,
                task_id
            )

            print(
                "Task completion:",
                success,
                already,
                reward
            )

        stats = db.get_database_stats()

        print(
            "Database statistics:",
            stats
        )

        print()
        print("DATABASE TEST COMPLETED")
        print()

    except Exception as exc:

        print()
        print("DATABASE TEST FAILED")
        print(str(exc))
        print()

        raise