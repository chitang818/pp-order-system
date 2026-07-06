use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use std::collections::HashMap;
pub use crate::utils::fs::append_app_log;

pub fn iso_timestamp_compact() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_else(|_| std::time::Duration::from_millis(0))
        .as_millis();
    format!("{}", ms)
}

pub fn iso_timestamp() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_else(|_| std::time::Duration::from_millis(0))
        .as_millis();
    format!("{}", ms)
}

pub fn now_iso_utc() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

pub fn parse_json_safe(raw: Option<String>) -> Option<serde_json::Value> {
    match raw {
        Some(s) if !s.trim().is_empty() => {
            let t = s.trim();
            // 兼容历史数据：extras 可能直接存为纯文本“要/不要”
            if t == "要" || t == "不要" {
                return Some(serde_json::json!({ "wrappingCloth": t }));
            }
            serde_json::from_str(t).ok()
        }
        _ => None
    }
}

pub fn to_num_or_null(v: &serde_json::Value) -> Option<f64> {
    match v {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                return None;
            }
            
            // 全角数字映射
            let full_width_map: HashMap<char, char> = [
                ('０', '0'), ('１', '1'), ('２', '2'), ('３', '3'), ('４', '4'),
                ('５', '5'), ('６', '6'), ('７', '7'), ('８', '8'), ('９', '9'),
                ('．', '.'), ('－', '-'),
            ].iter().cloned().collect();
            
            // 转换全角数字
            let mut normalized = String::new();
            for c in s.chars() {
                if let Some(&replacement) = full_width_map.get(&c) {
                    normalized.push(replacement);
                } else {
                    normalized.push(c);
                }
            }
            
            // 去除千分位逗号和非数字字符
            let cleaned: String = normalized
                .chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            
            if !cleaned.chars().any(|c| c.is_ascii_digit()) {
                return None;
            }
            
            cleaned.parse::<f64>().ok()
        }
        _ => None,
    }
}


