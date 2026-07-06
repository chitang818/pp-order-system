use crate::db::reminders;
use crate::db::pool::DbPoolHolder;
use serde::Deserialize;
use tauri::{command, State};

#[derive(Debug, Deserialize)]
pub struct SaveShipmentReminderPayload {
    #[serde(alias = "advanceDays")]
    pub advance_days: i32,
}

#[derive(Debug, Deserialize)]
pub struct ShipmentReminderListPayload {
    #[serde(default, alias = "advanceDays")]
    pub advance_days: Option<i32>,
    #[serde(default)]
    pub limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct PaymentReminderListPayload {
    #[serde(default)]
    pub limit: Option<i32>,
}

#[command]
pub fn reminders_get_shipment_settings(holder: State<DbPoolHolder>) -> Result<reminders::ReminderSettings, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_shipment_reminder_settings(&conn)
}

#[command]
pub fn reminders_save_shipment_settings(
    holder: State<DbPoolHolder>,
    payload: SaveShipmentReminderPayload,
) -> Result<(), String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::save_shipment_reminder_settings(&conn, payload.advance_days)
}

#[command]
pub fn reminders_get_shipment_list(
    holder: State<DbPoolHolder>,
    payload: ShipmentReminderListPayload,
) -> Result<reminders::ShipmentRemindersResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_shipment_reminders(
        &conn,
        payload.advance_days.unwrap_or(5),
        payload.limit.unwrap_or(5),
    )
}

#[command]
pub fn reminders_get_payment_list(
    holder: State<DbPoolHolder>,
    payload: PaymentReminderListPayload,
) -> Result<reminders::PaymentRemindersResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    reminders::get_payment_reminders(&conn, payload.limit.unwrap_or(5))
}
