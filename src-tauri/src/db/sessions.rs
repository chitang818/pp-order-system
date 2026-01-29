use rusqlite::{Connection, Result};
use crate::models::user::AuthUser;

pub fn create_session(conn: &Connection, token: &str, user_id: i64, expires_at: &str, created_at: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO sessions (token, userId, expiresAt, createdAt) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![token, user_id, expires_at, created_at],
    )?;
    Ok(())
}

pub fn get_user_by_token(conn: &Connection, token: &str) -> Result<Option<(AuthUser, String)>> {
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, u.role, u.status, s.expiresAt
         FROM sessions s
         JOIN users u ON u.id = s.userId
         WHERE s.token = ?
         LIMIT 1"
    )?;

    let iter = stmt.query_map([token], |row| {
        let expires_at: String = row.get(4)?;
        let user = AuthUser {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            status: row.get(3)?,
        };
        Ok((user, expires_at))
    })?;

    for item in iter {
        return Ok(Some(item?));
    }

    Ok(None)
}

pub fn delete_session(conn: &Connection, token: &str) -> Result<()> {
    conn.execute("DELETE FROM sessions WHERE token = ?", [token])?;
    Ok(())
}

pub fn delete_user_sessions(conn: &Connection, user_id: i64) -> Result<()> {
    conn.execute("DELETE FROM sessions WHERE userId = ?", [user_id])?;
    Ok(())
}

pub fn get_username_by_token(conn: &Connection, token: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT u.username FROM sessions s JOIN users u ON u.id = s.userId WHERE s.token = ? LIMIT 1"
    )?;
    
    let iter = stmt.query_map([token], |row| row.get(0))?;
    
    for item in iter {
        return Ok(Some(item?));
    }
    
    Ok(None)
}
