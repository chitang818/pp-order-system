use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use chrono::Local;
// use crate::db::connection::open_db_with_path; 


#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLog {
    pub id: i64,
    pub user_id: Option<i64>,
    pub username: Option<String>,
    pub operation: String,
    pub module: String,
    pub target: Option<String>,
    pub details: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsListResult {
    pub total: i64,
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
    pub data: Vec<OperationLog>,
}

#[derive(Debug, Serialize)]
pub struct ChangesResult {
    pub changes: usize,
}

pub fn create_operation_log(
    conn: &Connection, 
    user_id: Option<i64>,
    username: Option<String>,
    operation: &str,
    module: &str,
    target: Option<String>,
    details: Option<String>,
    ip_address: Option<String>,
    user_agent: Option<String>,
    status: Option<String>,
    error_message: Option<String>
) -> Result<i64> {
    let now = Local::now().to_rfc3339();
    
    // Check if table exists, create if not (usually done in init, but safe to verify or ignore)
    // Assuming table exists as per Node.js logic which relies on db.init
    
    conn.execute(
        "INSERT INTO operation_logs (userId, username, operation, module, target, details, ipAddress, userAgent, status, errorMessage, createdAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            user_id,
            username,
            operation,
            module,
            target,
            details,
            ip_address, 
            user_agent,
            status.unwrap_or("success".to_string()),
            error_message,
            now
        ],
    )?;
    
    Ok(conn.last_insert_rowid())
}

pub fn list_operation_logs(
    conn: &Connection,
    page: i32,
    page_size: i32,
    module: Option<String>,
    user_id: Option<i64>,
    operation: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>
) -> Result<LogsListResult> {
    let page = if page < 1 { 1 } else { page };
    let page_size = if page_size < 1 { 50 } else { page_size };
    let offset = (page - 1) * page_size;
    
    let mut where_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new(); // Dynamic params handling
    
    if let Some(m) = module {
        where_clauses.push("module = ?");
        params.push(Box::new(m));
    }
    if let Some(uid) = user_id {
        where_clauses.push("userId = ?");
        params.push(Box::new(uid));
    }
    if let Some(op) = operation {
        where_clauses.push("operation = ?");
        params.push(Box::new(op));
    }
    if let Some(start) = start_date {
        where_clauses.push("createdAt >= ?");
        params.push(Box::new(start));
    }
    if let Some(end) = end_date {
        where_clauses.push("createdAt <= ?");
        params.push(Box::new(end));
    }
    
    let where_sql = if where_clauses.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };
    
    // Total count
    let count_sql = format!("SELECT COUNT(*) FROM operation_logs {}", where_sql);
    let mut count_stmt = conn.prepare(&count_sql)?;
    
    // We need to pass params as slice of references
    let total: i64 = count_stmt.query_row(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), 
        |row| row.get(0)
    ).unwrap_or(0);
    
    // List data
    let list_sql = format!(
        "SELECT id, userId, username, operation, module, target, details, ipAddress, userAgent, status, errorMessage, createdAt 
         FROM operation_logs {} 
         ORDER BY createdAt DESC 
         LIMIT ? OFFSET ?", 
        where_sql
    );
    
    let mut list_params = params; // Move params
    list_params.push(Box::new(page_size));
    list_params.push(Box::new(offset));
    
    let mut stmt = conn.prepare(&list_sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(list_params.iter().map(|p| p.as_ref())),
        |row| {
            Ok(OperationLog {
                id: row.get(0)?,
                user_id: row.get(1)?,
                username: row.get(2)?,
                operation: row.get(3)?,
                module: row.get(4)?,
                target: row.get(5)?,
                details: row.get(6)?,
                ip_address: row.get(7)?,
                user_agent: row.get(8)?,
                status: row.get(9)?,
                error_message: row.get(10)?,
                created_at: row.get(11)?,
            })
        }
    )?;
    
    let mut data = Vec::new();
    for r in rows {
        data.push(r?);
    }
    
    Ok(LogsListResult {
        total,
        page,
        page_size,
        total_pages: (total as f64 / page_size as f64).ceil() as i32,
        data,
    })
}

pub fn delete_operation_log(conn: &Connection, id: i64) -> Result<usize> {
    let count = conn.execute("DELETE FROM operation_logs WHERE id = ?", [id])?;
    Ok(count)
}

pub fn clear_operation_logs(conn: &Connection) -> Result<usize> {
    let count = conn.execute("DELETE FROM operation_logs", [])?;
    Ok(count)
}

pub fn clean_old_operation_logs(conn: &Connection, days: i32) -> Result<usize> {
    let cutoff = Local::now() - chrono::Duration::days(days as i64);
    let cutoff_str = cutoff.to_rfc3339();
    
    let count = conn.execute("DELETE FROM operation_logs WHERE createdAt < ?", [cutoff_str])?;
    Ok(count)
}
