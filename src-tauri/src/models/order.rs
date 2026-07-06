use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderRow {
    #[serde(rename = "id")]
    pub id: i64,
    pub contract_no: Option<String>,
    pub invoice_no: Option<String>,
    pub bl_no: Option<String>,
    pub invoice_date: Option<String>,
    pub shipment_date: Option<String>,
    pub ship_from: Option<String>,
    pub ship_to: Option<String>,
    pub shipped_per_ss: Option<String>,
    pub forwarder: Option<String>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    #[serde(rename = "totalUSD")]
    pub total_usd: Option<f64>,
    pub product_type: Option<i64>,
    pub status: Option<String>,
    pub extras: Option<serde_json::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderItemRow {
    #[serde(rename = "id")]
    pub id: i64,
    #[serde(rename = "orderId")]
    pub order_id: i64,
    pub sort_index: Option<i64>,
    pub model: String,
    pub quantity: Option<f64>,
    pub packages: Option<f64>,
    pub weight: Option<f64>,
    pub actual_weight: Option<f64>,
    pub packing: Option<String>,
    pub label_weight: Option<f64>,
    pub safety_factor: Option<String>,
    pub cleanliness: Option<String>,
    pub unit: Option<String>,
    pub unit_price: Option<f64>,
    pub amount: Option<f64>,
    pub label_batch_no: Option<String>,
    pub label: Option<String>,
    pub extras: Option<serde_json::Value>,
    /// 从 extras 展开，便于前端与预览、编辑共用同一字段（数据库仍仅存于 extras）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub marks: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wrapping_cloth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrdersListPayload {
    pub token: String,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub product_model: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)] // Serialize added for flexible usage if needed
pub struct OrderItemPayload {
    #[serde(rename = "sortIndex")]
    pub sort_index: Option<i64>,
    pub model: String,
    pub quantity: Option<serde_json::Value>,
    pub packages: Option<serde_json::Value>,
    pub weight: Option<serde_json::Value>,
    #[serde(rename = "actualWeight")]
    pub actual_weight: Option<serde_json::Value>,
    pub packing: Option<String>,
    #[serde(rename = "labelWeight")]
    pub label_weight: Option<serde_json::Value>,
    #[serde(rename = "safetyFactor")]
    pub safety_factor: Option<String>,
    pub cleanliness: Option<String>,
    pub unit: Option<String>,
    #[serde(rename = "unitPrice")]
    pub unit_price: Option<serde_json::Value>,
    pub amount: Option<serde_json::Value>,
    #[serde(rename = "labelBatchNo")]
    pub label_batch_no: Option<String>,
    pub label: Option<String>,
    pub marks: Option<String>,
    pub enabled: Option<String>,
    #[serde(rename = "wrappingCloth")]
    pub wrapping_cloth: Option<String>,
    pub extras: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct OrderCreatePayload {
    pub token: String,
    #[serde(rename = "contractNo")]
    pub contract_no: Option<String>,
    #[serde(rename = "invoiceNo")]
    pub invoice_no: Option<String>,
    #[serde(rename = "blNo")]
    pub bl_no: Option<String>,
    #[serde(rename = "invoiceDate")]
    pub invoice_date: Option<String>,
    #[serde(rename = "shipmentDate")]
    pub shipment_date: Option<String>,
    #[serde(rename = "shipFrom")]
    pub ship_from: Option<String>,
    #[serde(rename = "shipTo")]
    pub ship_to: Option<String>,
    #[serde(rename = "shippedPerSs")]
    pub shipped_per_ss: Option<String>,
    pub forwarder: Option<String>,
    #[serde(rename = "customerId")]
    pub customer_id: Option<i64>,
    #[serde(rename = "customerName")]
    pub customer_name: Option<String>,
    #[serde(rename = "totalUSD")]
    pub total_usd: Option<f64>,
    #[serde(rename = "productType")]
    pub product_type: Option<i64>,
    pub status: Option<String>,
    pub extras: Option<serde_json::Value>,
    pub items: Vec<OrderItemPayload>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct OrderUpdatePayload {
    pub token: String,
    pub id: i64,
    #[serde(rename = "contractNo")]
    pub contract_no: Option<String>,
    #[serde(rename = "invoiceNo")]
    pub invoice_no: Option<String>,
    #[serde(rename = "blNo")]
    pub bl_no: Option<String>,
    #[serde(rename = "invoiceDate")]
    pub invoice_date: Option<String>,
    #[serde(rename = "shipmentDate")]
    pub shipment_date: Option<String>,
    #[serde(rename = "shipFrom")]
    pub ship_from: Option<String>,
    #[serde(rename = "shipTo")]
    pub ship_to: Option<String>,
    #[serde(rename = "shippedPerSs")]
    pub shipped_per_ss: Option<String>,
    pub forwarder: Option<String>,
    #[serde(rename = "customerId")]
    pub customer_id: Option<i64>,
    #[serde(rename = "customerName")]
    pub customer_name: Option<String>,
    #[serde(rename = "totalUSD")]
    pub total_usd: Option<f64>,
    #[serde(rename = "productType")]
    pub product_type: Option<i64>,
    pub status: Option<String>,
    pub extras: Option<serde_json::Value>,
    pub items: Vec<OrderItemPayload>,
}
