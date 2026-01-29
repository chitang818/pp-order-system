use serde::{Deserialize, Serialize};

/// 货代数据行（用于列表查询）
/// 与数据库表结构匹配：id, name, address, tel, fax, contact, email, remarks
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwarderRow {
    pub id: i64,
    pub name: String,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
    pub email: Option<String>,
    pub remarks: Option<String>,
}

/// 创建货代请求体
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct ForwarderCreatePayload {
    pub token: String,
    pub name: String,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
    pub email: Option<String>,
    pub remarks: Option<String>,
}

/// 更新货代请求体
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct ForwarderUpdatePayload {
    pub token: String,
    pub id: i64,
    pub name: Option<String>,
    pub address: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub contact: Option<String>,
    pub email: Option<String>,
    pub remarks: Option<String>,
}
