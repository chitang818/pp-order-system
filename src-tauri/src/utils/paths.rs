use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DatabaseConfig {
    pub db_path: String,
    pub is_custom_path: bool,
    pub version: String,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            db_path: String::new(),
            is_custom_path: false,
            version: "1.0.0".to_string(),
        }
    }
}

use tauri::path::BaseDirectory;

pub fn get_app_data_dir(app_handle: &AppHandle) -> PathBuf {
    app_handle
        .path()
        .resolve("", BaseDirectory::AppData)
        .expect("failed to get app data dir")
}

pub fn get_config_dir(app_handle: &AppHandle) -> PathBuf {
    let app_dir = get_app_data_dir(app_handle);
    app_dir.join("config")
}

pub fn get_database_config_path(app_handle: &AppHandle) -> PathBuf {
    get_config_dir(app_handle).join("database.json")
}

pub fn get_default_db_path(app_handle: &AppHandle) -> PathBuf {
    get_app_data_dir(app_handle).join("data").join("erp.sqlite")
}

impl DatabaseConfig {
    pub fn load(app_handle: &AppHandle) -> Result<Self, String> {
        let config_path = get_database_config_path(app_handle);
        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        
        let config: Self = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config file: {}", e))?;
            
        Ok(config)
    }

    pub fn save(&self, app_handle: &AppHandle) -> Result<(), String> {
        let config_path = get_database_config_path(app_handle);
        let config_dir = config_path.parent().unwrap();
        
        if !config_dir.exists() {
            fs::create_dir_all(config_dir)
                .map_err(|e| format!("Failed to create config dir: {}", e))?;
        }

        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
            
        fs::write(config_path, content)
            .map_err(|e| format!("Failed to write config file: {}", e))?;
            
        Ok(())
    }
}
