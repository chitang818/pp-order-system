use tauri::State;
use crate::db::pool::DbPoolHolder;
use crate::commands::auth::{require_user, require_admin};
use crate::models::product::*;
use crate::utils::common::*;

#[tauri::command]
pub fn products_list(holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;

    // 检查 productType 列是否存在，如果不存在则使用默认值 1
    let mut stmt = conn
        .prepare(
            "SELECT id, model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit,
                    createdAt, updatedAt, source, actualWeight, labelBatchNo, label, marks,
                    CASE 
                        WHEN EXISTS(SELECT 1 FROM pragma_table_info('products') WHERE name='productType')
                        THEN COALESCE(productType, 1)
                        ELSE 1
                    END AS productType
             FROM products
             ORDER BY model ASC",
        )
        .map_err(|e| format!("查询产品失败：{:?}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(ProductRow {
                id: r.get(0)?,
                model: r.get(1)?,
                description: r.get(2).ok(),
                estimated_weight: r.get(3).ok(),
                label_weight: r.get(4).ok(),
                safety_factor: r.get(5).ok(),
                cleanliness: r.get(6).ok(),
                unit: r.get(7).ok(),
                created_at: r.get(8).ok(),
                updated_at: r.get(9).ok(),
                source: r.get(10).ok(),
                actual_weight: r.get(11).ok(),
                label_batch_no: r.get(12).ok(),
                label: r.get(13).ok(),
                marks: r.get(14).ok(),
                product_type: r.get(15).ok(),
            })
        })
        .map_err(|e| format!("读取产品失败：{:?}", e))?;

    let mut data: Vec<ProductRow> = Vec::new();
    for r in rows {
        data.push(r.map_err(|e| format!("{:?}", e))?);
    }

    Ok(serde_json::json!({ "success": true, "data": data }))
}

#[tauri::command]
pub fn products_search(holder: State<DbPoolHolder>, payload: ProductsSearchPayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &payload.token)?;

    let q = payload.q.trim().to_string();
    if q.is_empty() {
        return Ok(serde_json::json!({ "success": true, "data": [] }));
    }
    let lim = payload.limit.unwrap_or(10).max(1).min(50);
    let like = format!("%{}%", q);
    let prefix = format!("{}%", q);

    let mut stmt = conn
        .prepare(
            "SELECT id, model, description, actualWeight, source, createdAt, updatedAt
             FROM products
             WHERE model LIKE ?1 OR description LIKE ?1
             ORDER BY
               CASE
                 WHEN model = ?2 THEN 1
                 WHEN model LIKE ?3 THEN 2
                 WHEN description = ?2 THEN 3
                 WHEN description LIKE ?3 THEN 4
                 ELSE 5
               END,
               LENGTH(model) ASC,
               model ASC
             LIMIT ?4",
        )
        .map_err(|e| format!("查询产品搜索失败：{:?}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![&like, &q, &prefix, &lim], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "model": r.get::<_, String>(1)?,
                "description": r.get::<_, Option<String>>(2)?,
                "actualWeight": r.get::<_, Option<f64>>(3)?,
                "source": r.get::<_, Option<String>>(4)?,
                "createdAt": r.get::<_, Option<String>>(5)?,
                "updatedAt": r.get::<_, Option<String>>(6)?,
            }))
        })
        .map_err(|e| format!("读取搜索结果失败：{:?}", e))?;

    let mut data: Vec<serde_json::Value> = Vec::new();
    for r in rows {
        data.push(r.map_err(|e| format!("{:?}", e))?);
    }
    Ok(serde_json::json!({ "success": true, "data": data, "query": q, "count": data.len() }))
}

#[tauri::command]
pub fn products_create(holder: State<DbPoolHolder>, payload: ProductCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &payload.token)?;

    let model = payload.model.trim().to_string();
    if model.is_empty() {
        return Err("产品型号不能为空".to_string());
    }
    let now = now_iso_utc();
    let source = payload.source.unwrap_or_else(|| "manual".to_string());

    let res = conn.execute(
        "INSERT INTO products (model, description, estimatedWeight, labelWeight, safetyFactor, cleanliness, unit, labelBatchNo, label, marks, source, createdAt, updatedAt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            &model,
            &payload.description,
            &payload.estimated_weight.unwrap_or(0.0),
            &payload.label_weight.unwrap_or(0.0),
            &payload.safety_factor,
            &payload.cleanliness,
            &payload.unit.unwrap_or_else(|| "".to_string()),
            &payload.label_batch_no.unwrap_or_else(|| "".to_string()),
            &payload.label.unwrap_or_else(|| "".to_string()),
            &payload.marks.unwrap_or_else(|| "".to_string()),
            &source,
            &now,
            &now
        ],
    );

    match res {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            Ok(serde_json::json!({ "success": true, "data": { "id": id, "model": model } }))
        }
        Err(e) => {
            if format!("{:?}", e).contains("UNIQUE") {
                Err("产品型号已存在".to_string())
            } else {
                Err(format!("创建产品失败：{:?}", e))
            }
        }
    }
}

#[tauri::command]
pub fn products_update(holder: State<DbPoolHolder>, payload: ProductUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &payload.token)?;

    let mut stmt = conn
        .prepare("SELECT model, description, actualWeight, unit, safetyFactor, cleanliness, labelBatchNo, label, marks FROM products WHERE id = ?1")
        .map_err(|e| format!("{:?}", e))?;
    let current: (String, Option<String>, Option<f64>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) =
        stmt.query_row([payload.id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?)))
            .map_err(|_| "产品不存在".to_string())?;

    let now = now_iso_utc();
    let model = payload.model.unwrap_or(current.0).trim().to_string();
    if model.is_empty() {
        return Err("产品型号不能为空".to_string());
    }
    let description = payload.description.or(current.1);
    let actual_weight = payload.actual_weight.or(current.2).unwrap_or(0.0);
    let unit = payload.unit.or(current.3).unwrap_or_else(|| "".to_string());
    let safety_factor = payload.safety_factor.or(current.4);
    let cleanliness = payload.cleanliness.or(current.5);
    let label_batch_no = payload.label_batch_no.or(current.6).unwrap_or_else(|| "".to_string());
    let label = payload.label.or(current.7).unwrap_or_else(|| "".to_string());
    let marks = payload.marks.or(current.8).unwrap_or_else(|| "".to_string());

    let changes = conn
        .execute(
            "UPDATE products
             SET model = ?1, description = ?2, actualWeight = ?3, unit = ?4, safetyFactor = ?5, cleanliness = ?6,
                 labelBatchNo = ?7, label = ?8, marks = ?9, source = 'manual', updatedAt = ?10
             WHERE id = ?11",
            rusqlite::params![&model, &description, &actual_weight, &unit, &safety_factor, &cleanliness, &label_batch_no, &label, &marks, &now, &payload.id],
        )
        .map_err(|e| format!("更新产品失败：{:?}", e))?;

    Ok(serde_json::json!({ "success": true, "result": { "changes": changes } }))
}

#[tauri::command]
pub fn products_delete(holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    let changes = conn
        .execute("DELETE FROM products WHERE id = ?1", [id])
        .map_err(|e| format!("删除产品失败：{:?}", e))?;
    Ok(serde_json::json!({ "success": true, "result": { "changes": changes } }))
}

#[tauri::command]
pub fn products_clear(holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_admin(&conn, &token)?;
    let changes = conn
        .execute("DELETE FROM products", [])
        .map_err(|e| format!("清空产品失败：{:?}", e))?;
    Ok(serde_json::json!({ "success": true, "result": { "changes": changes } }))
}
