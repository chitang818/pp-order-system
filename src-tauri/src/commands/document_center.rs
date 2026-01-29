use tauri::State;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::db::pool::DbPoolHolder;
use crate::db::document_center;
use crate::commands::auth::require_user;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

/// 获取当前 ISO 时间
fn now_iso_utc() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// 日志记录辅助函数
fn log_action(level: &str, message: &str) {
    println!("[{}] {}", level, message);
}

/// 模板响应结构
#[derive(Debug, Clone, Serialize)]
struct DocumentTemplateResponse {
    id: i64,
    name: String,
    #[serde(rename = "type")]
    template_type: String,
    version: String,
    config: Value,
    #[serde(rename = "isDefault")]
    is_default: bool,
    #[serde(rename = "createdBy")]
    created_by: Option<String>,  // 使用用户名或显示名称
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

/// 转换数据库模型为响应结构
fn template_to_response(template: document_center::DocumentTemplate) -> DocumentTemplateResponse {
    let created_by = template.created_by_display_name
        .or_else(|| template.created_by_username.clone())
        .or_else(|| template.created_by.map(|id| id.to_string()));

    DocumentTemplateResponse {
        id: template.id,
        name: template.name,
        template_type: template.template_type,
        version: template.version,
        config: template.config,
        is_default: template.is_default,
        created_by,
        created_at: template.created_at,
        updated_at: template.updated_at,
    }
}

/// 创建模板请求
#[derive(Debug, Deserialize)]
pub struct DocumentTemplateCreatePayload {
    pub token: String,
    pub name: String,
    #[serde(rename = "type")]
    pub template_type: String,
    pub config: Value,
    #[serde(rename = "isDefault")]
    pub is_default: Option<bool>,
}

/// 更新模板请求
#[derive(Debug, Deserialize)]
pub struct DocumentTemplateUpdatePayload {
    pub token: String,
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub template_type: String,
    pub config: Value,
    #[serde(rename = "isDefault")]
    pub is_default: Option<bool>,
}

/// 获取模板列表
#[tauri::command]
pub fn document_templates_list(
    holder: State<DbPoolHolder>,
    token: String,
    template_type: Option<String>,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;

    let templates = document_center::list_templates(&conn, template_type.as_deref())
        .map_err(|e| format!("查询模板列表失败: {:?}", e))?;

    let data: Vec<DocumentTemplateResponse> = templates
        .into_iter()
        .map(template_to_response)
        .collect();

    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

/// 获取单个模板
#[tauri::command]
pub fn document_templates_get(
    holder: State<DbPoolHolder>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;

    let template = document_center::get_template(&conn, id)
        .map_err(|e| format!("查询模板失败: {:?}", e))?
        .ok_or_else(|| "模板不存在".to_string())?;

    let data = template_to_response(template);

    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

/// 创建模板
#[tauri::command]
pub fn document_templates_create(
    holder: State<DbPoolHolder>,
    payload: DocumentTemplateCreatePayload,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err("模板名称不能为空".to_string());
    }

    let template_type = payload.template_type.trim();
    if template_type.is_empty() {
        return Err("模板类型不能为空".to_string());
    }

    let is_default = payload.is_default.unwrap_or(false);
    let now = now_iso_utc();

    let id = document_center::create_template(
        &conn,
        name,
        template_type,
        &payload.config,
        is_default,
        user.id,
        &now,
    )
    .map_err(|e| format!("创建模板失败: {:?}", e))?;

    // 查询并返回创建的模板
    let template = document_center::get_template(&conn, id)
        .map_err(|e| format!("查询创建的模板失败: {:?}", e))?
        .ok_or_else(|| "模板创建后查询失败".to_string())?;

    let data = template_to_response(template);

    log_action("INFO", &format!("用户 {} 创建模板 ID: {}", user.username, id));

    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

/// 更新模板
#[tauri::command]
pub fn document_templates_update(
    holder: State<DbPoolHolder>,
    payload: DocumentTemplateUpdatePayload,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &payload.token)?;

    let name = payload.name.trim();
    if name.is_empty() {
        return Err("模板名称不能为空".to_string());
    }

    let template_type = payload.template_type.trim();
    if template_type.is_empty() {
        return Err("模板类型不能为空".to_string());
    }

    let is_default = payload.is_default.unwrap_or(false);
    let now = now_iso_utc();

    document_center::update_template(
        &conn,
        payload.id,
        name,
        template_type,
        &payload.config,
        is_default,
        &now,
    )
    .map_err(|e| format!("更新模板失败: {:?}", e))?;

    // 查询并返回更新后的模板
    let template = document_center::get_template(&conn, payload.id)
        .map_err(|e| format!("查询更新的模板失败: {:?}", e))?
        .ok_or_else(|| "模板不存在".to_string())?;

    let data = template_to_response(template);

    log_action("INFO", &format!("用户 {} 更新模板 ID: {}", user.username, payload.id));

    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

/// 删除模板
#[tauri::command]
pub fn document_templates_delete(
    holder: State<DbPoolHolder>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;

    document_center::delete_template(&conn, id)
        .map_err(|e| format!("删除模板失败: {:?}", e))?;

    log_action("INFO", &format!("用户 {} 删除模板 ID: {}", user.username, id));

    Ok(serde_json::json!({
        "success": true,
        "message": "模板已删除"
    }))
}

/// 删除所有模板
#[tauri::command]
pub fn document_templates_delete_all(
    holder: State<DbPoolHolder>,
    token: String,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;

    let deleted_count = document_center::delete_all_templates(&conn)
        .map_err(|e| format!("删除所有模板失败: {:?}", e))?;

    log_action("WARN", &format!("用户 {} 删除所有模板，共 {} 个", user.username, deleted_count));

    Ok(serde_json::json!({
        "success": true,
        "message": format!("已删除所有模板，共 {} 个", deleted_count),
        "deletedCount": deleted_count
    }))
}

/// 获取默认模板
#[tauri::command]
pub fn document_templates_get_default(
    holder: State<DbPoolHolder>,
    token: String,
    template_type: String,
) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;

    let template = document_center::get_default_template(&conn, &template_type)
        .map_err(|e| format!("查询默认模板失败: {:?}", e))?
        .ok_or_else(|| "未找到默认模板".to_string())?;

    let data = template_to_response(template);

    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}
