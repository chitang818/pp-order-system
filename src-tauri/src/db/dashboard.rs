use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct DashboardStats {
    pub orders: OrderStats,
    pub customers: CustomerStats,
    pub products: ProductStats,
    pub documents: DocumentStats,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrderStats {
    pub total: i32,
    pub pending: i32,
    pub shipped: i32,
    pub completed: i32,
    pub total_amount: f64,
    pub monthly_new: i32,
    pub monthly_amount: f64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomerStats {
    pub total: i32,
    pub active: i32,
    pub total_amount: f64,
    pub monthly_new: i32,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProductStats {
    pub total: i32,
    pub monthly_new: i32,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentStats {
    pub monthly_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrendItem {
    pub date: String,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrendAmountItem {
    pub date: String,
    pub amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendsData {
    pub order_count: Vec<TrendItem>,
    pub order_amount: Vec<TrendAmountItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerRankingItem {
    pub customer_id: i32,
    pub customer_name: String,
    pub total_amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonData {
    pub labels: Vec<String>,
    pub order_count: Vec<i32>,
    pub order_amount: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentActivity {
    pub orders: Vec<RecentOrder>,
    pub customers: Vec<RecentCustomer>,
    pub documents: Vec<RecentDocument>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentOrder {
    pub contract_no: String,
    pub operation: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCustomer {
    pub id: i32,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecentDocument {
    // Defines structure if needed
}

// Additional structs
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationDistributionItem {
    pub destination: String,
    pub city: String,
    pub order_count: i32,
    pub total_amount: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductQuantityRankingItem {
    pub model: String,
    pub total_quantity: i32,
    pub total_amount: f64,
    pub order_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxTypeStatsItem {
    pub box_type: String,
    pub order_count: i32,
    pub total_quantity: i32,
    pub total_amount: f64,
}

// Helper to normalize status (ported from JS)
fn normalize_status(status: &str) -> String {
    let s = status.trim();
    if ["已创建", "已排产", "已发货", "已完成"].contains(&s) {
        return s.to_string();
    }
    if s.contains("创建") || s.contains("新建") {
        return "已创建".to_string();
    }
    if s.contains("排产") || s.contains("生产") {
        return "已排产".to_string();
    }
    if s.contains("发货") || s.contains("运输") {
        return "已发货".to_string();
    }
    if s.contains("完成") || s.contains("结束") {
        return "已完成".to_string();
    }
    "已创建".to_string()
}

pub fn get_stats(conn: &Connection) -> Result<DashboardStats, String> {
    // 1. Orders Stats
    let mut stmt = conn.prepare("SELECT status, totalUSD, invoiceDate, createdAt FROM orders WHERE deletedAt IS NULL").map_err(|e| e.to_string())?;
    let order_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?,
            row.get::<_, Option<f64>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut total_orders = 0;
    let mut pending_orders = 0;
    let mut shipped_orders = 0;
    let mut completed_orders = 0;
    let mut total_amount = 0.0;
    let mut monthly_new_orders = 0;
    let mut monthly_amount = 0.0;

    let now = chrono::Local::now();
    let current_month_start = format!("{}-{:02}-01", now.format("%Y"), now.format("%m"));

    for order_res in order_iter {
        if let Ok((status, total_usd, invoice_date, created_at)) = order_res {
            total_orders += 1;
            let status_str = status.unwrap_or_default();
            let norm_status = normalize_status(&status_str);
            let amount = total_usd.unwrap_or(0.0);
            
            total_amount += amount;

            match norm_status.as_str() {
                "已创建" | "已排产" => pending_orders += 1,
                "已发货" => shipped_orders += 1,
                "已完成" => completed_orders += 1,
                _ => {}
            }

            let date_str = invoice_date.or(created_at).unwrap_or_default();
            // Simple string comparison for ISO dates
            let date_part = date_str.split(' ').next().unwrap_or("").split('T').next().unwrap_or("");
            if date_part >= current_month_start.as_str() {
                monthly_new_orders += 1;
                monthly_amount += amount;
            }
        }
    }

    // 2. Customers Stats - customers 表没有 totalUSD 列，需要从 orders 表聚合
    // 先获取客户总数
    let total_customers: i32 = conn.query_row("SELECT COUNT(*) FROM customers", [], |row| row.get(0)).unwrap_or(0);
    
    // 从 orders 表聚合每个客户的交易金额
    let customer_amount_query = "
        SELECT customerId, SUM(totalUSD) as total
        FROM orders 
        WHERE deletedAt IS NULL AND customerId IS NOT NULL
        GROUP BY customerId
    ";
    let mut stmt = conn.prepare(customer_amount_query).map_err(|e| e.to_string())?;
    let customer_amounts = stmt.query_map([], |row| {
        Ok(row.get::<_, Option<f64>>(1)?.unwrap_or(0.0))
    }).map_err(|e| e.to_string())?;

    let mut active_customers = 0;
    let mut customer_total_amount = 0.0;

    for amount_res in customer_amounts {
        if let Ok(amount) = amount_res {
            customer_total_amount += amount;
            if amount > 0.0 {
                active_customers += 1;
            }
        }
    }

    // 3. Products Stats
    let total_products: i32 = conn.query_row("SELECT COUNT(*) FROM products", [], |row| row.get(0)).unwrap_or(0);

    Ok(DashboardStats {
        orders: OrderStats {
            total: total_orders,
            pending: pending_orders,
            shipped: shipped_orders,
            completed: completed_orders,
            total_amount,
            monthly_new: monthly_new_orders,
            monthly_amount,
        },
        customers: CustomerStats {
            total: total_customers,
            active: active_customers,
            total_amount: customer_total_amount,
            monthly_new: 0, 
        },
        products: ProductStats {
            total: total_products,
            monthly_new: 0, 
        },
        documents: DocumentStats {
            monthly_count: 0, 
        },
    })
}

pub fn get_trends(conn: &Connection, days: i32) -> Result<TrendsData, String> {
    let now = chrono::Local::now();
    let start_date = now - chrono::Duration::days(days as i64);
    let start_date_str = start_date.format("%Y-%m-%d").to_string();

    let query = "
        SELECT 
            strftime('%Y-%m-%d', invoiceDate) as date,
            COUNT(*) as count,
            SUM(totalUSD) as amount
        FROM orders
        WHERE invoiceDate IS NOT NULL 
          AND invoiceDate != ''
          AND strftime('%Y-%m-%d', invoiceDate) >= ?
        GROUP BY strftime('%Y-%m-%d', invoiceDate)
        ORDER BY strftime('%Y-%m-%d', invoiceDate) ASC
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([start_date_str], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, Option<f64>>(2)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut data_map = HashMap::new();
    for row in rows {
        if let Ok((date, count, amount)) = row {
            data_map.insert(date, (count, amount.unwrap_or(0.0)));
        }
    }

    let mut order_count = Vec::new();
    let mut order_amount = Vec::new();

    // Loop from day 1 to days (inclusive) relative to start_date
    for i in 1..=days {
       let d = start_date + chrono::Duration::days(i as i64); 
       let d_str = d.format("%Y-%m-%d").to_string();
        let (count, amount) = data_map.get(&d_str).unwrap_or(&(0, 0.0));
        
        order_count.push(TrendItem { date: d_str.clone(), count: *count });
        order_amount.push(TrendAmountItem { date: d_str, amount: *amount });
    }

    Ok(TrendsData {
        order_count,
        order_amount,
    })
}

pub fn get_status_distribution(conn: &Connection) -> Result<HashMap<String, i32>, String> {
    let mut stmt = conn.prepare("SELECT status FROM orders WHERE deletedAt IS NULL").map_err(|e| e.to_string())?;
    
    let mut dist = HashMap::new();
    dist.insert("已创建".to_string(), 0);
    dist.insert("已排产".to_string(), 0);
    dist.insert("已发货".to_string(), 0);
    dist.insert("已完成".to_string(), 0);

    let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0)).map_err(|e| e.to_string())?;
    
    for row in rows {
        if let Ok(status_opt) = row {
            let status = status_opt.unwrap_or_default();
            let norm = normalize_status(&status);
            *dist.entry(norm).or_insert(0) += 1;
        }
    }
    
    Ok(dist)
}

pub fn get_customer_ranking(conn: &Connection, limit: i32) -> Result<Vec<CustomerRankingItem>, String> {
    // customers 表没有 totalUSD 列，需要从 orders 表聚合
    let query = "
        SELECT 
            o.customerId,
            COALESCE(c.name, o.customerName, '未知客户') as customerName,
            SUM(o.totalUSD) as totalAmount
        FROM orders o
        LEFT JOIN customers c ON o.customerId = c.id
        WHERE o.deletedAt IS NULL 
          AND o.customerId IS NOT NULL
        GROUP BY o.customerId
        HAVING totalAmount > 0
        ORDER BY totalAmount DESC
        LIMIT ?
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([limit], |row| {
        Ok(CustomerRankingItem {
            customer_id: row.get::<_, Option<i32>>(0)?.unwrap_or(0),
            customer_name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            total_amount: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            result.push(item);
        }
    }
    Ok(result)
}

pub fn get_recent_activities(conn: &Connection) -> Result<RecentActivity, String> {
    let order_query = "
        SELECT 
          target, operation, createdAt
        FROM operation_logs 
        WHERE module = '订单管理' 
          AND operation IN ('创建订单', '更新订单')
          AND status = 'success'
          AND target IS NOT NULL
          AND target != ''
        ORDER BY createdAt DESC
        LIMIT 5
    ";
    
    // Safe check query
    let mut recent_orders = Vec::new();
    if let Ok(mut stmt) = conn.prepare(order_query) {
        let rows = stmt.query_map([], |row| {
             Ok(RecentOrder {
                contract_no: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                operation: if row.get::<_, String>(1)? == "创建订单" { "新建".to_string() } else { "编辑".to_string() },
                created_at: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(o) = r { recent_orders.push(o); }
            }
        }
    }

    let customer_query = "
        SELECT COALESCE(id, rowid), name 
        FROM customers 
        ORDER BY COALESCE(id, rowid) DESC 
        LIMIT 5
    ";
    
    let mut recent_customers = Vec::new();
    if let Ok(mut stmt) = conn.prepare(customer_query) {
        let rows = stmt.query_map([], |row| {
            Ok(RecentCustomer {
                id: row.get(0)?,
                name: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                created_at: "".to_string(),
            })
        });
        if let Ok(iter) = rows {
            for r in iter {
                if let Ok(c) = r { recent_customers.push(c); }
            }
        }
    }

    Ok(RecentActivity {
        orders: recent_orders,
        customers: recent_customers,
        documents: Vec::new(),
    })
}

pub fn get_monthly_comparison(conn: &Connection, months: i32) -> Result<ComparisonData, String> {
    let now = chrono::Local::now();
    
    let mut labels = Vec::new();
    let mut counts = Vec::new();
    let mut amounts = Vec::new();

    for i in (0..months).rev() {
        let year = now.format("%Y").to_string().parse::<i32>().unwrap_or(2025);
        let month = now.format("%m").to_string().parse::<i32>().unwrap_or(1);
        
        let mut target_year = year;
        let mut target_month = month - i;
        while target_month <= 0 {
            target_year -= 1;
            target_month += 12;
        }
        
        let month_str = format!("{}-{:02}", target_year, target_month);
        labels.push(month_str.clone());

        let query = "
            SELECT COUNT(*), SUM(totalUSD) 
            FROM orders 
            WHERE invoiceDate IS NOT NULL AND invoiceDate != ''
            AND strftime('%Y-%m', invoiceDate) = ?
        ";
        let (count, amount): (i32, f64) = conn.query_row(query, [month_str], |row| {
             Ok((
                row.get(0)?,
                row.get::<_, Option<f64>>(1)?.unwrap_or(0.0)
            ))
        }).unwrap_or((0, 0.0));
        
        counts.push(count);
        amounts.push(amount);
    }
    
    Ok(ComparisonData {
        labels,
        order_count: counts,
        order_amount: amounts,
    })
}

pub fn get_yearly_comparison(conn: &Connection, years: i32) -> Result<ComparisonData, String> {
    let current_year = chrono::Local::now().format("%Y").to_string().parse::<i32>().unwrap_or(2025);
    let start_year = current_year - years + 1;

    let mut labels = Vec::new();
    let mut counts = Vec::new();
    let mut amounts = Vec::new();
    
    let query = "
        SELECT 
            strftime('%Y', createdAt) as year,
            COUNT(*), 
            SUM(totalUSD)
        FROM orders
        WHERE createdAt IS NOT NULL AND createdAt != ''
        GROUP BY year
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        ))
    }).map_err(|e| e.to_string())?;

    let mut data_map = HashMap::new();
    for row in rows {
        if let Ok((y, c, a)) = row {
            data_map.insert(y, (c, a));
        }
    }

    for year in start_year..=current_year {
        let year_str = year.to_string();
        let (c, a) = data_map.get(&year_str).unwrap_or(&(0, 0.0));
        labels.push(year_str);
        counts.push(*c);
        amounts.push(*a);
    }

    Ok(ComparisonData {
        labels,
        order_count: counts,
        order_amount: amounts,
    })
}

pub fn get_destination_distribution(conn: &Connection) -> Result<Vec<DestinationDistributionItem>, String> {
    let query = "
        SELECT 
          shipTo as destination,
          COUNT(*) as orderCount,
          SUM(totalUSD) as totalAmount
        FROM orders
        WHERE shipTo IS NOT NULL 
          AND shipTo != ''
          AND (deletedAt IS NULL OR deletedAt = '')
        GROUP BY shipTo
        ORDER BY orderCount DESC, totalAmount DESC
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i32>(1)?,
            row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
        ))
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok((destination, count, amount)) = row {
            let city = destination.split(',').next().unwrap_or(&destination).trim().to_string();
            result.push(DestinationDistributionItem {
                destination,
                city,
                order_count: count,
                total_amount: amount,
            });
        }
    }
    
    Ok(result)
}

pub fn get_product_quantity_ranking(conn: &Connection, limit: i32) -> Result<Vec<ProductQuantityRankingItem>, String> {
    let query = "
        SELECT 
          oi.model as productModel,
          SUM(CAST(COALESCE(oi.quantity, 0) AS REAL)) as totalQuantity,
          SUM(CASE 
            WHEN oi.amount IS NOT NULL AND oi.amount != 0 THEN oi.amount
            WHEN oi.unitPrice IS NOT NULL AND oi.quantity IS NOT NULL THEN oi.unitPrice * oi.quantity
            ELSE 0
          END) as totalAmount,
          COUNT(DISTINCT oi.orderId) as orderCount
        FROM order_items oi
        INNER JOIN orders o ON oi.orderId = o.id
        WHERE oi.model IS NOT NULL 
          AND oi.model != ''
          AND (o.deletedAt IS NULL OR o.deletedAt = '')
        GROUP BY oi.model
        HAVING totalQuantity > 0
        ORDER BY totalQuantity DESC
        LIMIT ?
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([limit], |row| {
        Ok(ProductQuantityRankingItem {
            model: row.get(0)?,
            total_quantity: row.get::<_, f64>(1)? as i32,
            total_amount: row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
            order_count: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
         if let Ok(item) = row {
            result.push(item);
        }
    }
    Ok(result)
}

pub fn get_box_type_stats(conn: &Connection, limit: i32) -> Result<Vec<BoxTypeStatsItem>, String> {
    let query = "
        WITH OrderBoxTypes AS (
            SELECT 
                id,
                CAST(json_extract(extras, '$.boxType') AS TEXT) as boxType
            FROM orders
            WHERE (deletedAt IS NULL OR deletedAt = '')
              AND extras IS NOT NULL
              AND json_extract(extras, '$.boxType') IS NOT NULL
              AND json_extract(extras, '$.boxType') != ''
              AND json_extract(extras, '$.boxType') != 'null'
        )
        SELECT 
            bt.boxType,
            COUNT(DISTINCT bt.id) as orderCount,
            SUM(CAST(COALESCE(oi.quantity, 0) AS REAL)) as totalQuantity,
            SUM(CASE 
                WHEN oi.amount IS NOT NULL AND oi.amount != 0 THEN oi.amount
                WHEN oi.unitPrice IS NOT NULL AND oi.quantity IS NOT NULL THEN oi.unitPrice * oi.quantity
                ELSE 0
            END) as totalAmount
        FROM OrderBoxTypes bt
        LEFT JOIN order_items oi ON bt.id = oi.orderId
        GROUP BY bt.boxType
        ORDER BY orderCount DESC, totalQuantity DESC
        LIMIT ?
    ";
    
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([limit], |row| {
        Ok(BoxTypeStatsItem {
            box_type: row.get::<_, String>(0)?,
            order_count: row.get(1)?,
            total_quantity: row.get::<_, f64>(2)? as i32,
            total_amount: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(item) = row {
            result.push(item);
        }
    }
    Ok(result)
}
