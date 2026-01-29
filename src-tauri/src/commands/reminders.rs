use crate::db::reminders;
use crate::db::pool::DbPoolHolder;
use tauri::{command, State};

#[command]
pub fn reminders_get_shipment_settings(holder: State<DbPoolHolder>) -> Result<reminders::ReminderSettings, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_shipment_reminder_settings(&conn)
}

#[command]
pub fn reminders_save_shipment_settings(holder: State<DbPoolHolder>, advance_days: i32) -> Result<(), String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::save_shipment_reminder_settings(&conn, advance_days)
}

#[command]
pub fn reminders_get_shipment_list(holder: State<DbPoolHolder>, advance_days: Option<i32>, limit: Option<i32>) -> Result<reminders::ShipmentRemindersResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_shipment_reminders(&conn, advance_days.unwrap_or(5), limit.unwrap_or(5))
}

#[command]
pub fn reminders_get_payment_list(holder: State<DbPoolHolder>, limit: Option<i32>) -> Result<reminders::PaymentRemindersResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_payment_reminders(&conn, limit.unwrap_or(5))
}
