use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerRow {
    pub id: i64,
    pub name: String,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
    #[serde(rename = "totalUSD")]
    pub total_usd: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct CustomerCreatePayload {
    pub token: String,
    pub name: String,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct CustomerUpdatePayload {
    pub token: String,
    pub id: i64,
    pub name: Option<String>,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
}
