use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ProductRow {
    pub id: i64,
    pub model: String,
    pub description: Option<String>,
    #[serde(rename = "estimatedWeight")]
    pub estimated_weight: Option<f64>,
    #[serde(rename = "labelWeight")]
    pub label_weight: Option<f64>,
    #[serde(rename = "safetyFactor")]
    pub safety_factor: Option<String>,
    pub cleanliness: Option<String>,
    pub unit: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "actualWeight")]
    pub actual_weight: Option<f64>,
    #[serde(rename = "labelBatchNo")]
    pub label_batch_no: Option<String>,
    pub label: Option<String>,
    pub marks: Option<String>,
    #[serde(rename = "productType")]
    pub product_type: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProductsSearchPayload {
    pub token: String,
    pub q: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ProductCreatePayload {
    pub token: String,
    pub model: String,
    pub description: Option<String>,
    #[serde(rename = "estimatedWeight")]
    pub estimated_weight: Option<f64>,
    #[serde(rename = "labelWeight")]
    pub label_weight: Option<f64>,
    #[serde(rename = "safetyFactor")]
    pub safety_factor: Option<String>,
    pub cleanliness: Option<String>,
    pub unit: Option<String>,
    #[serde(rename = "labelBatchNo")]
    pub label_batch_no: Option<String>,
    pub label: Option<String>,
    pub marks: Option<String>,
    pub source: Option<String>,
    #[serde(rename = "productType")]
    pub product_type: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ProductUpdatePayload {
    pub token: String,
    pub id: i64,
    pub model: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "actualWeight")]
    pub actual_weight: Option<f64>,
    pub unit: Option<String>,
    #[serde(rename = "safetyFactor")]
    pub safety_factor: Option<String>,
    pub cleanliness: Option<String>,
    #[serde(rename = "labelBatchNo")]
    pub label_batch_no: Option<String>,
    pub label: Option<String>,
    pub marks: Option<String>,
    #[serde(rename = "productType")]
    pub product_type: Option<i64>,
}
