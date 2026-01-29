use rusqlite::{Connection, Result, Row};
use serde_json::Value;

/// 单据模板数据结构
#[derive(Debug, Clone)]
pub struct DocumentTemplate {
    pub id: i64,
    pub name: String,
    pub template_type: String,
    pub version: String,
    pub config: Value,
    pub is_default: bool,
    pub created_by: Option<i64>,
    pub created_by_username: Option<String>,
    pub created_by_display_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 从数据库行解析模板
fn row_to_template(row: &Row) -> Result<DocumentTemplate> {
    let config_str: String = row.get(3)?;
    let config: Value = serde_json::from_str(&config_str)
        .unwrap_or_else(|_| serde_json::json!({}));
    
    Ok(DocumentTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        template_type: row.get(2)?,
        version: row.get(4).unwrap_or_else(|_| "1.0".to_string()),
        config,
        is_default: row.get::<_, i64>(5)? == 1,
        created_by: row.get(6).ok(),
        created_by_username: row.get(7).ok(),
        created_by_display_name: row.get(8).ok(),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 获取模板列表（支持类型筛选）
pub fn list_templates(conn: &Connection, template_type: Option<&str>) -> Result<Vec<DocumentTemplate>> {
    let mut templates = Vec::new();
    
    if let Some(typ) = template_type {
        let mut stmt = conn.prepare(
            "SELECT 
                dt.id, dt.name, dt.type, dt.config, dt.version, dt.isDefault, dt.createdBy,
                u.username as createdByUsername, u.displayName as createdByDisplayName,
                dt.createdAt, dt.updatedAt
             FROM document_templates dt
             LEFT JOIN users u ON dt.createdBy = u.id
             WHERE dt.type = ?
             ORDER BY dt.createdAt DESC"
        )?;
        let rows = stmt.query_map([typ], |row| row_to_template(row))?;
        for template in rows {
            templates.push(template?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT 
                dt.id, dt.name, dt.type, dt.config, dt.version, dt.isDefault, dt.createdBy,
                u.username as createdByUsername, u.displayName as createdByDisplayName,
                dt.createdAt, dt.updatedAt
             FROM document_templates dt
             LEFT JOIN users u ON dt.createdBy = u.id
             ORDER BY dt.createdAt DESC"
        )?;
        let rows = stmt.query_map([], |row| row_to_template(row))?;
        for template in rows {
            templates.push(template?);
        }
    }
    
    Ok(templates)
}

/// 获取单个模板
pub fn get_template(conn: &Connection, id: i64) -> Result<Option<DocumentTemplate>> {
    let mut stmt = conn.prepare(
        "SELECT 
            dt.id, dt.name, dt.type, dt.config, dt.version, dt.isDefault, dt.createdBy,
            u.username as createdByUsername, u.displayName as createdByDisplayName,
            dt.createdAt, dt.updatedAt
         FROM document_templates dt
         LEFT JOIN users u ON dt.createdBy = u.id
         WHERE dt.id = ?"
    )?;

    let mut iter = stmt.query_map([id], |row| row_to_template(row))?;
    if let Some(template) = iter.next() {
        Ok(Some(template?))
    } else {
        Ok(None)
    }
}

/// 创建模板
pub fn create_template(
    conn: &Connection,
    name: &str,
    template_type: &str,
    config: &Value,
    is_default: bool,
    created_by: i64,
    now: &str,
) -> Result<i64> {
    let config_json = serde_json::to_string(config)
        .map_err(|e| rusqlite::Error::InvalidColumnType(0, format!("序列化配置失败: {}", e), rusqlite::types::Type::Text))?;

    // 如果设为默认，先取消同类型其他模板的默认状态
    if is_default {
        conn.execute(
            "UPDATE document_templates SET isDefault = 0 WHERE type = ?",
            [template_type],
        )?;
    }

    // 插入新模板
    conn.execute(
        "INSERT INTO document_templates (name, type, config, version, isDefault, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, '1.0', ?, ?, ?, ?)",
        rusqlite::params![name, template_type, config_json, if is_default { 1 } else { 0 }, created_by, now, now],
    )?;

    Ok(conn.last_insert_rowid())
}

/// 更新模板
pub fn update_template(
    conn: &Connection,
    id: i64,
    name: &str,
    template_type: &str,
    config: &Value,
    is_default: bool,
    now: &str,
) -> Result<()> {
    let config_json = serde_json::to_string(config)
        .map_err(|e| rusqlite::Error::InvalidColumnType(0, format!("序列化配置失败: {}", e), rusqlite::types::Type::Text))?;

    // 如果设为默认，先取消同类型其他模板的默认状态
    if is_default {
        conn.execute(
            "UPDATE document_templates SET isDefault = 0 WHERE type = ? AND id != ?",
            rusqlite::params![template_type, id],
        )?;
    }

    // 更新模板
    let changes = conn.execute(
        "UPDATE document_templates SET name = ?, type = ?, config = ?, isDefault = ?, updatedAt = ? WHERE id = ?",
        rusqlite::params![name, template_type, config_json, if is_default { 1 } else { 0 }, now, id],
    )?;

    if changes == 0 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTFOUND),
            Some("模板不存在".to_string()),
        ));
    }

    Ok(())
}

/// 删除模板
pub fn delete_template(conn: &Connection, id: i64) -> Result<()> {
    let changes = conn.execute("DELETE FROM document_templates WHERE id = ?", [id])?;
    if changes == 0 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_NOTFOUND),
            Some("模板不存在".to_string()),
        ));
    }
    Ok(())
}

/// 删除所有模板
pub fn delete_all_templates(conn: &Connection) -> Result<usize> {
    let changes = conn.execute("DELETE FROM document_templates", [])?;
    Ok(changes)
}

/// 获取默认模板
pub fn get_default_template(conn: &Connection, template_type: &str) -> Result<Option<DocumentTemplate>> {
    let mut stmt = conn.prepare(
        "SELECT 
            dt.id, dt.name, dt.type, dt.config, dt.version, dt.isDefault, dt.createdBy,
            u.username as createdByUsername, u.displayName as createdByDisplayName,
            dt.createdAt, dt.updatedAt
         FROM document_templates dt
         LEFT JOIN users u ON dt.createdBy = u.id
         WHERE dt.type = ? AND dt.isDefault = 1
         LIMIT 1"
    )?;

    let mut iter = stmt.query_map([template_type], |row| row_to_template(row))?;
    if let Some(template) = iter.next() {
        Ok(Some(template?))
    } else {
        Ok(None)
    }
}
