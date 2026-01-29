use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserRow {
    pub id: i64,
    pub username: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
    #[serde(rename = "lastLoginAt")]
    pub last_login_at: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LoginResponse {
    pub id: i64,
    pub username: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub avatar: Option<String>,
    pub role: String,
    pub token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthLoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthChangePasswordPayload {
    pub token: String,
    #[serde(rename = "oldPassword")]
    pub old_password: String,
    #[serde(rename = "newPassword")]
    pub new_password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthUpdateMePayload {
    pub token: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersCreatePayload {
    pub token: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersUpdatePayload {
    pub token: String,
    pub id: i64,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub role: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersResetPasswordPayload {
    pub token: String,
    pub id: i64,
    #[serde(rename = "newPassword")]
    pub new_password: String,
}
