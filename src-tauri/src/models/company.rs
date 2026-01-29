use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompanyRow {
    pub id: i64,
    #[serde(rename = "companyNameCN")]
    pub company_name_cn: Option<String>,
    #[serde(rename = "companyNameEN")]
    pub company_name_en: Option<String>,
    #[serde(rename = "companyAddressCN")]
    pub company_address_cn: Option<String>,
    #[serde(rename = "companyAddressEN")]
    pub company_address_en: Option<String>,
    pub company_tel: Option<String>,
    pub company_fax: Option<String>,
    pub sign_at: Option<String>,
    pub logo_url: Option<String>,
    pub theme_color: Option<String>,
    pub font_size: Option<i32>,
    pub header_production: Option<String>,
    pub header_invoice: Option<String>,
    pub header_packing: Option<String>,
    pub header_sales: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OrderConfigRow {
    pub id: i64,
    pub category: String,
    pub value: String,
    pub sort_index: i64,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct OrderConfigCreatePayload {
    pub token: String,
    pub category: String,
    pub value: String,
    pub sort_index: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct OrderConfigUpdatePayload {
    pub token: String,
    pub id: i64,
    pub value: String,
    pub sort_index: i64,
}
