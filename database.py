import sqlite3
from typing import Optional

DATABASE_NAME = "bot_database.db"


def get_connection():
    return sqlite3.connect(DATABASE_NAME)


def init_db():
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            points INTEGER DEFAULT 0,
            referrals INTEGER DEFAULT 0,
            tasks INTEGER DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id INTEGER NOT NULL,
            invited_user_id INTEGER NOT NULL UNIQUE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS completed_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_name TEXT NOT NULL,
            UNIQUE(user_id, task_name)
        )
    """)

    connection.commit()
    connection.close()


def add_or_update_user(
    user_id: int,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
):
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO users (
            user_id,
            username,
            first_name,
            last_name
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name
    """, (
        user_id,
        username,
        first_name,
        last_name,
    ))

    connection.commit()
    connection.close()


def add_referral(
    referrer_id: int,
    invited_user_id: int
) -> bool:

    if referrer_id == invited_user_id:
        return False

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            INSERT INTO referrals (
                referrer_id,
                invited_user_id
            )
            VALUES (?, ?)
        """, (
            referrer_id,
            invited_user_id,
        ))

        cursor.execute("""
            UPDATE users
            SET referrals = referrals + 1,
                points = points + 1
            WHERE user_id = ?
        """, (referrer_id,))

        connection.commit()
        return True

    except sqlite3.IntegrityError:
        connection.rollback()
        return False

    finally:
        connection.close()


def complete_task(
    user_id: int,
    task_name: str,
    points: int
) -> bool:

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("""
            INSERT INTO completed_tasks (
                user_id,
                task_name
            )
            VALUES (?, ?)
        """, (
            user_id,
            task_name,
        ))

        cursor.execute("""
            UPDATE users
            SET points = points + ?,
                tasks = tasks + 1
            WHERE user_id = ?
        """, (
            points,
            user_id,
        ))

        connection.commit()
        return True

    except sqlite3.IntegrityError:
        connection.rollback()
        return False

    finally:
        connection.close()


def get_user_stats(user_id: int):

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT points, referrals, tasks
        FROM users
        WHERE user_id = ?
    """, (user_id,))

    result = cursor.fetchone()

    connection.close()

    if result is None:
        return {
            "points": 0,
            "referrals": 0,
            "tasks": 0,
        }

    return {
        "points": result[0],
        "referrals": result[1],
        "tasks": result[2],
    }