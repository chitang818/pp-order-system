use rusqlite::{Connection, Result};
use crate::models::user::User;

pub fn find_by_username(conn: &Connection, username: &str) -> Result<Option<(User, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, username, displayName, avatar, role, status, createdAt, lastLoginAt, password 
         FROM users WHERE username = ? LIMIT 1"
    )?;
    
    let user_iter = stmt.query_map([username], |row| {
        let password: String = row.get(8)?;
        let user = User {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            avatar: row.get(3)?,
            role: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            last_login_at: row.get(7)?,
        };
        Ok((user, password))
    })?;

    for user in user_iter {
        return Ok(Some(user?));
    }

    Ok(None)
}

pub fn update_last_login(conn: &Connection, user_id: i64, now: &str) -> Result<()> {
    conn.execute(
        "UPDATE users SET lastLoginAt = ?1 WHERE id = ?2",
        rusqlite::params![now, user_id],
    )?;
    Ok(())
}

pub fn find_by_id(conn: &Connection, id: i64) -> Result<Option<User>> {
    let mut stmt = conn.prepare(
        "SELECT id, username, displayName, avatar, role, status, createdAt, lastLoginAt
         FROM users WHERE id = ? LIMIT 1"
    )?;
    
    let user_iter = stmt.query_map([id], |row| {
        Ok(User {
            id: row.get(0)?,
            username: row.get(1)?,
            display_name: row.get(2)?,
            avatar: row.get(3)?,
            role: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            last_login_at: row.get(7)?,
        })
    })?;

    for user in user_iter {
        return Ok(Some(user?));
    }

    Ok(None)
}

pub fn update_password(conn: &Connection, user_id: i64, new_hash: &str, updated_at: &str) -> Result<()> {
    conn.execute(
        "UPDATE users SET password = ?1, updatedAt = ?2 WHERE id = ?3",
        rusqlite::params![new_hash, updated_at, user_id],
    )?;
    Ok(())
}

pub fn get_password_hash(conn: &Connection, user_id: i64) -> Result<String> {
    conn.query_row(
        "SELECT password FROM users WHERE id = ?",
        [user_id],
        |row| row.get(0),
    )
}

pub fn update_me(conn: &Connection, user_id: i64, display_name: Option<String>, avatar: Option<String>, updated_at: &str) -> Result<()> {
    conn.execute(
        "UPDATE users SET displayName = COALESCE(?1, displayName), avatar = ?2, updatedAt = ?3 WHERE id = ?4",
        rusqlite::params![display_name, avatar, updated_at, user_id],
    )?;
    Ok(())
}
