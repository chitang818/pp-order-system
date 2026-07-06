use tauri::{State, AppHandle};

use crate::db::pool::DbPoolHolder;
use crate::commands::auth::require_user;
use crate::models::order::*;
use crate::utils::common::*;
use chrono::Datelike;
use regex;

/// 从 order_items.extras JSON 解析行级扩展字段，供 API 顶层返回（与 merge_item_extras 对称）
fn extract_order_item_line_fields(extras: &Option<serde_json::Value>) -> (Option<String>, Option<String>, Option<String>) {
    let mut marks = None;
    let mut wrapping = None;
    let mut enabled = None;
    let Some(serde_json::Value::Object(map)) = extras else {
        return (marks, wrapping, enabled);
    };
    if let Some(v) = map.get("marks") {
        if let Some(s) = v.as_str() {
            let t = s.trim();
            if !t.is_empty() {
                marks = Some(t.to_string());
            }
        }
    }
    if let Some(v) = map.get("wrappingCloth").or_else(|| map.get("wrapping_cloth")) {
        if let Some(s) = v.as_str() {
            let t = s.trim();
            if !t.is_empty() {
                wrapping = Some(t.to_string());
            }
        }
    }
    if let Some(v) = map.get("enabled") {
        match v {
            serde_json::Value::String(s) => {
                let t = s.trim();
                if !t.is_empty() {
                    enabled = Some(t.to_string());
                }
            }
            serde_json::Value::Bool(b) => {
                enabled = Some(if *b { "true".into() } else { "false".into() });
            }
            _ => {}
        }
    }
    (marks, wrapping, enabled)
}

#[tauri::command]
pub fn orders_list(holder: State<DbPoolHolder>, payload: OrdersListPayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &payload.token)?;
    
    let page = payload.page.unwrap_or(1);
    let page_size = payload.page_size.unwrap_or(20);
    let offset = (page - 1) * page_size;
    
    let mut where_clauses = vec!["(deletedAt IS NULL OR deletedAt = '')".to_string()];
    let mut params: Vec<String> = Vec::new();
    
    if let Some(model) = payload.product_model {
        if !model.trim().is_empty() {
             where_clauses.push("id IN (SELECT orderId FROM order_items WHERE model LIKE ?)".to_string());
             params.push(format!("%{}%", model.trim()));
        }
    }
    
    let where_sql = where_clauses.join(" AND ");
    
    let base_query = format!(
        "SELECT id, rowid, contractNo, invoiceNo, blNo, invoiceDate, shipmentDate, shipFrom, shipTo, shippedPerSs, forwarder, 
                customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, status
        FROM orders 
        WHERE {} 
        ORDER BY id DESC",
        where_sql
    );
    
    if payload.page.is_some() && payload.page_size.is_some() {
        let count_query = format!("SELECT COUNT(*) FROM orders WHERE {}", where_sql);
        let total: i64 = if params.is_empty() {
            conn.query_row(&count_query, [], |r| r.get(0)).map_err(|e| format!("{:?}", e))?
        } else {
            conn.query_row(&count_query, rusqlite::params![&params[0]], |r| r.get(0)).map_err(|e| format!("{:?}", e))?
        };
        
        let final_query = format!("{} LIMIT ? OFFSET ?", base_query);
        let mut data: Vec<OrderRow> = Vec::new();
        
        let map_row = |r: &rusqlite::Row| -> Result<OrderRow, rusqlite::Error> {
            Ok(OrderRow {
                id: r.get(0)?,
                contract_no: r.get(2)?,
                invoice_no: r.get(3)?,
                bl_no: r.get(4)?,
                invoice_date: r.get(5)?,
                shipment_date: r.get(6)?,
                ship_from: r.get(7)?,
                ship_to: r.get(8)?,
                shipped_per_ss: r.get(9)?,
                forwarder: r.get(10)?,
                customer_id: r.get(11)?,
                customer_name: r.get(12)?,
                total_usd: r.get(13)?,
                created_at: r.get(14)?,
                updated_at: r.get(15)?,
                product_type: r.get::<_, Option<i64>>(16)?.or(Some(1)), 
                extras: parse_json_safe(r.get(17)?),
                status: r.get(18)?,
                deleted_at: None,
            })
        };
        
        if params.is_empty() {
             let mut stmt = conn.prepare(&final_query).map_err(|e| format!("{:?}", e))?;
             let rows = stmt.query_map(rusqlite::params![page_size, offset], map_row).map_err(|e| format!("{:?}", e))?;
             for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        } else {
             let mut stmt = conn.prepare(&final_query).map_err(|e| format!("{:?}", e))?;
             let rows = stmt.query_map(rusqlite::params![&params[0], page_size, offset], map_row).map_err(|e| format!("{:?}", e))?;
             for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        }
        
        Ok(serde_json::json!({
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": (total as f64 / page_size as f64).ceil() as i64,
            "data": data
        }))
    } else {
        let map_row = |r: &rusqlite::Row| -> Result<OrderRow, rusqlite::Error> {
            Ok(OrderRow {
                id: r.get(0)?,
                contract_no: r.get(2)?,
                invoice_no: r.get(3)?,
                bl_no: r.get(4)?,
                invoice_date: r.get(5)?,
                shipment_date: r.get(6)?,
                ship_from: r.get(7)?,
                ship_to: r.get(8)?,
                shipped_per_ss: r.get(9)?,
                forwarder: r.get(10)?,
                customer_id: r.get(11)?,
                customer_name: r.get(12)?,
                total_usd: r.get(13)?,
                created_at: r.get(14)?,
                updated_at: r.get(15)?,
                product_type: r.get::<_, Option<i64>>(16)?.or(Some(1)),
                extras: parse_json_safe(r.get(17)?),
                status: r.get(18)?,
                deleted_at: None,
            })
        };
        
        let mut data: Vec<OrderRow> = Vec::new();
        if params.is_empty() {
            let mut stmt = conn.prepare(&base_query).map_err(|e| format!("{:?}", e))?;
            let rows = stmt.query_map([], map_row).map_err(|e| format!("{:?}", e))?;
            for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        } else {
            let mut stmt = conn.prepare(&base_query).map_err(|e| format!("{:?}", e))?;
            let rows = stmt.query_map(rusqlite::params![&params[0]], map_row).map_err(|e| format!("{:?}", e))?;
            for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        }
        
        Ok(serde_json::json!(data))
    }
}

#[tauri::command]
pub fn orders_get(_app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let mut stmt = conn.prepare(
        "SELECT COALESCE(id, rowid) AS id, rowid,
                contractNo, invoiceNo, blNo, invoiceDate, shipmentDate, shipFrom, shipTo, shippedPerSs, forwarder,
                customerId, customerName, totalUSD, createdAt, updatedAt, productType, extras, status, deletedAt
        FROM orders WHERE id = ? OR rowid = ?"
    ).map_err(|e| format!("查询订单失败：{:?}", e))?;
    
    let order = stmt.query_row([id, id], |r| {
        Ok(OrderRow {
            id: r.get(0)?,
            contract_no: r.get(2)?,
            invoice_no: r.get(3)?,
            bl_no: r.get(4)?,
            invoice_date: r.get(5)?,
            shipment_date: r.get(6)?,
            ship_from: r.get(7)?,
            ship_to: r.get(8)?,
            shipped_per_ss: r.get(9)?,
            forwarder: r.get(10)?,
            customer_id: r.get(11)?,
            customer_name: r.get(12)?,
            total_usd: r.get(13)?,
            created_at: r.get(14)?,
            updated_at: r.get(15)?,
            product_type: r.get::<_, Option<i64>>(16)?.or(Some(1)),
            extras: parse_json_safe(r.get(17)?),
            status: r.get(18)?,
            deleted_at: r.get(19)?,
        })
    }).map_err(|_| "订单不存在".to_string())?;
    
    let mut items_stmt = conn.prepare(
        "SELECT id, orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras 
        FROM order_items WHERE orderId = ? ORDER BY COALESCE(sortIndex, id) ASC"
    ).map_err(|e| format!("查询订单项失败：{:?}", e))?;
    
    let items = items_stmt.query_map([order.id], |r| {
        let extras = parse_json_safe(r.get(17)?);
        let (marks, wrapping_cloth, enabled) = extract_order_item_line_fields(&extras);
        Ok(OrderItemRow {
            id: r.get(0)?,
            order_id: r.get(1)?,
            sort_index: r.get(2)?,
            model: r.get(3)?,
            quantity: r.get(4)?,
            packages: r.get(5)?,
            weight: r.get(6)?,
            actual_weight: r.get(7)?,
            packing: r.get(8)?,
            label_weight: r.get(9)?,
            safety_factor: r.get(10)?,
            cleanliness: r.get(11)?,
            unit: r.get(12)?,
            unit_price: r.get(13)?,
            amount: r.get(14)?,
            label_batch_no: r.get(15)?,
            label: r.get(16)?,
            extras,
            marks,
            wrapping_cloth,
            enabled,
        })
    }).map_err(|e| format!("读取订单项失败：{:?}", e))?;
    
    let mut items_vec: Vec<OrderItemRow> = Vec::new();
    for item in items { items_vec.push(item.map_err(|e| format!("{:?}", e))?); }
    
    Ok(serde_json::json!({
        "success": true,
        "data": {
            "id": order.id,
            "contractNo": order.contract_no,
            "invoiceNo": order.invoice_no,
            "blNo": order.bl_no,
            "invoiceDate": order.invoice_date,
            "shipmentDate": order.shipment_date,
            "shipFrom": order.ship_from,
            "shipTo": order.ship_to,
            "shippedPerSs": order.shipped_per_ss,
            "forwarder": order.forwarder,
            "customerId": order.customer_id,
            "customerName": order.customer_name,
            "totalUSD": order.total_usd,
            "productType": order.product_type,
            "status": order.status,
            "extras": order.extras,
            "createdAt": order.created_at,
            "updatedAt": order.updated_at,
            "deletedAt": order.deleted_at,
            "items": items_vec
        }
    }))
}

#[tauri::command]
pub fn orders_delete(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    let timestamp = now_iso_utc();
    
    let exists: bool = conn.query_row("SELECT COUNT(*) > 0 FROM orders WHERE (id = ? OR rowid = ?)", [id, id], |r| r.get(0)).map_err(|_| "订单不存在".to_string())?;
    if !exists { return Err("订单不存在".to_string()); }
    
    let changes = conn.execute("UPDATE orders SET deletedAt = ? WHERE id = ? OR rowid = ?", rusqlite::params![timestamp, id, id]).map_err(|e| format!("{:?}", e))?;
    append_app_log(&app_handle, "INFO", &format!("用户 {} 删除订单 ID: {}", user.username, id));
    
    Ok(serde_json::json!({
        "success": true, "deletedId": id, "affectedRows": changes, "timestamp": timestamp, "message": "订单已删除（可恢复）"
    }))
}

#[tauri::command]
pub fn orders_restore(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    let timestamp = now_iso_utc();
    
    let exists: bool = conn.query_row("SELECT COUNT(*) > 0 FROM orders WHERE (id = ? OR rowid = ?)", [id, id], |r| r.get(0)).map_err(|_| "订单不存在".to_string())?;
    if !exists { return Err("订单不存在".to_string()); }
    
    let changes = conn.execute("UPDATE orders SET deletedAt = NULL WHERE id = ? OR rowid = ?", [id, id]).map_err(|e| format!("{:?}", e))?;
    append_app_log(&app_handle, "INFO", &format!("用户 {} 恢复订单 ID: {}", user.username, id));
    
    Ok(serde_json::json!({
        "success": true, "restoredId": id, "affectedRows": changes, "timestamp": timestamp, "message": "订单恢复成功"
    }))
}

#[tauri::command]
pub fn orders_delete_permanent(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, id: i64) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    let timestamp = now_iso_utc();
    
    let exists: bool = conn.query_row("SELECT COUNT(*) > 0 FROM orders WHERE id = ? OR rowid = ?", [id, id], |r| r.get(0)).map_err(|_| "订单不存在".to_string())?;
    if !exists { return Err("订单不存在".to_string()); }
    
    conn.execute("DELETE FROM order_items WHERE orderId = ?", [id]).map_err(|e| format!("{:?}", e))?;
    let changes = conn.execute("DELETE FROM orders WHERE id = ? OR rowid = ?", [id, id]).map_err(|e| format!("{:?}", e))?;
    
    append_app_log(&app_handle, "WARN", &format!("用户 {} 永久删除订单 ID: {}", user.username, id));
    Ok(serde_json::json!({
        "success": true, "deletedId": id, "affectedRows": changes, "timestamp": timestamp, "message": "订单已彻底删除"
    }))
}

#[tauri::command]
pub fn orders_list_deleted(_app_handle: AppHandle, holder: State<DbPoolHolder>, token: String, page: Option<i64>, page_size: Option<i64>) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let has_pagination = page.is_some() && page_size.is_some();
    let base_query = "SELECT COALESCE(o.id, o.rowid) AS id, o.rowid,
                o.contractNo, o.invoiceNo, o.blNo, o.invoiceDate, o.shipmentDate, o.shipFrom, o.shipTo, o.shippedPerSs, o.forwarder,
                o.customerId, o.customerName, o.totalUSD, o.createdAt, o.updatedAt, o.productType, o.extras, o.status, o.deletedAt
        FROM orders o Where o.deletedAt IS NOT NULL AND o.deletedAt != '' AND TRIM(o.deletedAt) != '' ORDER BY o.deletedAt DESC";
         
    let map_row = |r: &rusqlite::Row| -> Result<OrderRow, rusqlite::Error> {
        Ok(OrderRow {
            id: r.get(0)?,
            contract_no: r.get(2)?,
            invoice_no: r.get(3)?,
            bl_no: r.get(4)?,
            invoice_date: r.get(5)?,
            shipment_date: r.get(6)?,
            ship_from: r.get(7)?,
            ship_to: r.get(8)?,
            shipped_per_ss: r.get(9)?,
            forwarder: r.get(10)?,
            customer_id: r.get(11)?,
            customer_name: r.get(12)?,
            total_usd: r.get(13)?,
            created_at: r.get(14)?,
            updated_at: r.get(15)?,
            product_type: r.get::<_, Option<i64>>(16)?.or(Some(1)),
            extras: parse_json_safe(r.get(17)?),
            status: r.get(18)?,
            deleted_at: r.get(19)?,
        })
    };
    
    if has_pagination {
        let page = page.unwrap();
        let page_size = page_size.unwrap();
        let offset = (page - 1) * page_size;
        let count_query = "SELECT COUNT(*) as total FROM orders WHERE deletedAt IS NOT NULL AND deletedAt != '' AND TRIM(deletedAt) != ''";
        let total: i64 = conn.query_row(count_query, [], |r| r.get(0)).map_err(|e| format!("{:?}", e))?;
        
        let final_query = format!("{} LIMIT ? OFFSET ?", base_query);
        let mut stmt = conn.prepare(&final_query).map_err(|e| format!("{:?}", e))?;
        let rows = stmt.query_map(rusqlite::params![page_size, offset], map_row).map_err(|e| format!("{:?}", e))?;
        let mut data = Vec::new();
        for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        Ok(serde_json::json!({ "total": total, "page": page, "pageSize": page_size, "totalPages": (total as f64 / page_size as f64).ceil() as i64, "data": data }))
    } else {
        let mut stmt = conn.prepare(base_query).map_err(|e| format!("{:?}", e))?;
        let rows = stmt.query_map([], map_row).map_err(|e| format!("{:?}", e))?;
        let mut data = Vec::new();
        for r in rows { data.push(r.map_err(|e| format!("{:?}", e))?); }
        Ok(serde_json::json!(data))
    }
}

#[tauri::command]
pub fn orders_next_contract_no(app_handle: AppHandle, holder: State<DbPoolHolder>, token: String) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let _ = require_user(&conn, &token)?;
    
    let current_year = chrono::Utc::now().year();
    let year_pattern = format!("SC{}-%", current_year);
    
    let mut stmt = conn.prepare("SELECT contractNo FROM orders WHERE contractNo LIKE ? ORDER BY contractNo DESC").map_err(|e| format!("{:?}", e))?;
    let rows = stmt.query_map([&year_pattern], |r| Ok(r.get::<_, Option<String>>(0)?)).map_err(|e| format!("{:?}", e))?;
    
    let mut next_number = 1;
    let mut max_formatted_number: Option<String> = None;
    for row_result in rows {
        if let Ok(Some(contract_no)) = row_result {
            if let Some(caps) = regex::Regex::new(r"^SC\d{4}-(\d+)").ok().and_then(|re| re.captures(&contract_no)) {
                if let Some(num_str) = caps.get(1) {
                    let num_str = num_str.as_str();
                    if let Ok(num) = num_str.parse::<i64>() {
                        if num > 0 && num >= next_number {
                            next_number = num + 1;
                            max_formatted_number = Some(num_str.to_string());
                        }
                    }
                }
            }
        }
    }
    
    let formatted_number = if let Some(max_fmt) = max_formatted_number {
        let padding_length = max_fmt.len();
        format!("{:0width$}", next_number, width = padding_length)
    } else {
        format!("{:03}", next_number)
    };
    
    let next_contract_no = format!("SC{}-{}", current_year, formatted_number);
    append_app_log(&app_handle, "INFO", &format!("生成下一个合同编号: {}", next_contract_no));
    
    Ok(serde_json::json!({
        "success": true,
        "data": { "nextContractNo": next_contract_no, "currentYear": current_year, "nextNumber": formatted_number }
    }))
}

fn merge_item_extras(item: &OrderItemPayload) -> Option<String> {
    let mut extra_obj = serde_json::Map::new();
    if let Some(serde_json::Value::Object(map)) = &item.extras {
        for (k, v) in map {
            if k != "sortIndex" && k != "marks" && k != "enabled" && k != "wrappingCloth" {
                extra_obj.insert(k.clone(), v.clone());
            }
        }
    }
    if let Some(ref marks) = item.marks { if !marks.is_empty() { extra_obj.insert("marks".to_string(), serde_json::Value::String(marks.clone())); } }
    if let Some(ref enabled) = item.enabled { if !enabled.is_empty() { extra_obj.insert("enabled".to_string(), serde_json::Value::String(enabled.clone())); } }
    // wrappingCloth（包皮布）兼容来源：
    // 1) 顶层 item.wrappingCloth
    // 2) item.extras.wrappingCloth
    // 3) item.extras.wrapping_cloth
    let mut wrapping_val: Option<String> = item.wrapping_cloth.clone().filter(|s| !s.trim().is_empty());
    if wrapping_val.is_none() {
        if let Some(serde_json::Value::Object(map)) = &item.extras {
            // 优先 camelCase
            if let Some(v) = map.get("wrappingCloth") {
                if let Some(s) = v.as_str() {
                    let s = s.trim();
                    if !s.is_empty() { wrapping_val = Some(s.to_string()); }
                }
            }
            // 再尝试 snake_case
            if wrapping_val.is_none() {
                if let Some(v) = map.get("wrapping_cloth") {
                    if let Some(s) = v.as_str() {
                        let s = s.trim();
                        if !s.is_empty() { wrapping_val = Some(s.to_string()); }
                    }
                }
            }
        }
    }
    if let Some(wrapping_cloth) = wrapping_val {
        extra_obj.insert("wrappingCloth".to_string(), serde_json::Value::String(wrapping_cloth));
    }
    if extra_obj.is_empty() { None } else { serde_json::to_string(&extra_obj).ok() }
}

#[tauri::command]
pub fn orders_create(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: OrderCreatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let token = payload.token.clone();
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    let extras_str = payload.extras.as_ref().and_then(|v| serde_json::to_string(v).ok());
    
    conn.execute("BEGIN IMMEDIATE TRANSACTION", []).map_err(|e| format!("{:?}", e))?;
    let product_type = payload.product_type.unwrap_or(1);
    let status = payload.status.as_deref().unwrap_or("已创建");
    let now = now_iso_utc();
    
    conn.execute(
        "INSERT INTO orders (contractNo, invoiceNo, blNo, invoiceDate, shippedPerSs, forwarder, shipFrom, shipTo, customerId, customerName, totalUSD, productType, extras, shipmentDate, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            payload.contract_no, payload.invoice_no, payload.bl_no, payload.invoice_date,
            payload.shipped_per_ss, payload.forwarder, payload.ship_from, payload.ship_to,
            payload.customer_id, payload.customer_name, payload.total_usd, product_type,
            extras_str, payload.shipment_date, status, &now, &now
        ]
    ).map_err(|e| format!("创建订单失败：{:?}", e))?;
    
    let order_id = conn.last_insert_rowid();
    for (index, item) in payload.items.iter().enumerate() {
        let sort_index = item.sort_index.unwrap_or(index as i64);
        let item_extras = merge_item_extras(item);
        conn.execute(
            "INSERT INTO order_items (orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                order_id, sort_index, item.model,
                item.quantity.as_ref().and_then(to_num_or_null),
                item.packages.as_ref().and_then(to_num_or_null),
                item.weight.as_ref().and_then(to_num_or_null),
                item.actual_weight.as_ref().and_then(to_num_or_null),
                item.packing,
                item.label_weight.as_ref().and_then(to_num_or_null),
                item.safety_factor, item.cleanliness, item.unit,
                item.unit_price.as_ref().and_then(to_num_or_null),
                item.amount.as_ref().and_then(to_num_or_null),
                item.label_batch_no, item.label, item_extras
            ]
        ).map_err(|e| format!("{:?}", e))?;
    }
    
    conn.execute("COMMIT", []).map_err(|e| format!("{:?}", e))?;
    append_app_log(&app_handle, "INFO", &format!("用户 {} 创建订单 ID: {}", user.username, order_id));
    
    orders_get(app_handle, holder, token, order_id)
}

#[tauri::command]
pub fn orders_update(app_handle: AppHandle, holder: State<DbPoolHolder>, payload: OrderUpdatePayload) -> Result<serde_json::Value, String> {
    let pool = holder.get()?;
    let token = payload.token.clone();
    let id = payload.id;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let user = require_user(&conn, &token)?;
    let extras_str = payload.extras.as_ref().and_then(|v| serde_json::to_string(v).ok());

    // 检查合同号是否与其他订单冲突
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM orders WHERE contractNo = ? AND id != ? AND (deletedAt IS NULL OR deletedAt = '')",
        rusqlite::params![&payload.contract_no, payload.id],
        |r| r.get(0)
    ).unwrap_or(0);

    if count > 0 {
        return Err(format!("合同编号 {} 已存在，请使用其他编号或检查列表", payload.contract_no.as_deref().unwrap_or("")));
    }
    
    conn.execute("BEGIN IMMEDIATE TRANSACTION", []).map_err(|e| format!("{:?}", e))?;
    let now = now_iso_utc();
    
    conn.execute(
        "UPDATE orders SET updatedAt=?, contractNo=?, invoiceNo=?, blNo=?, invoiceDate=?, shipmentDate=?, shipFrom=?, shipTo=?, shippedPerSs=?, forwarder=?, customerId=?, customerName=?, totalUSD=?, productType=?, status=?, extras=? WHERE id=?",
        rusqlite::params![
            now, payload.contract_no, payload.invoice_no, payload.bl_no, payload.invoice_date, payload.shipment_date,
            payload.ship_from, payload.ship_to, payload.shipped_per_ss, payload.forwarder, payload.customer_id, payload.customer_name,
            payload.total_usd, payload.product_type, payload.status, extras_str, payload.id
        ]
    ).map_err(|e| format!("更新订单失败：{:?}", e))?;
    
    conn.execute("DELETE FROM order_items WHERE orderId = ?", [payload.id]).map_err(|e| format!("{:?}", e))?;
    
    for (index, item) in payload.items.iter().enumerate() {
        let sort_index = item.sort_index.unwrap_or(index as i64);
        let item_extras = merge_item_extras(item);
        conn.execute(
            "INSERT INTO order_items (orderId, sortIndex, model, quantity, packages, weight, actualWeight, packing, labelWeight, safetyFactor, cleanliness, unit, unitPrice, amount, labelBatchNo, label, extras) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                payload.id, sort_index, item.model,
                item.quantity.as_ref().and_then(to_num_or_null),
                item.packages.as_ref().and_then(to_num_or_null),
                item.weight.as_ref().and_then(to_num_or_null),
                item.actual_weight.as_ref().and_then(to_num_or_null),
                item.packing,
                item.label_weight.as_ref().and_then(to_num_or_null),
                item.safety_factor, item.cleanliness, item.unit,
                item.unit_price.as_ref().and_then(to_num_or_null),
                item.amount.as_ref().and_then(to_num_or_null),
                item.label_batch_no, item.label, item_extras
            ]
        ).map_err(|e| format!("{:?}", e))?;
    }
    
    conn.execute("COMMIT", []).map_err(|e| format!("{:?}", e))?;
    append_app_log(&app_handle, "INFO", &format!("用户 {} 更新订单 ID: {}", user.username, payload.id));
    
    orders_get(app_handle, holder, token, id)
}
