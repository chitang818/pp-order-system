use crate::db::dashboard;
use crate::db::pool::DbPoolHolder;
use tauri::{command, State};
use serde::Serialize;

#[command]
pub fn dashboard_stats(holder: State<DbPoolHolder>) -> Result<dashboard::DashboardStats, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_stats(&conn)
}

#[command]
pub fn dashboard_trends(holder: State<DbPoolHolder>, days: Option<i32>) -> Result<dashboard::TrendsData, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_trends(&conn, days.unwrap_or(30))
}

#[command]
pub fn dashboard_status_distribution(holder: State<DbPoolHolder>) -> Result<std::collections::HashMap<String, i32>, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_status_distribution(&conn)
}

#[command]
pub fn dashboard_customer_ranking(holder: State<DbPoolHolder>, limit: Option<i32>) -> Result<Vec<dashboard::CustomerRankingItem>, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_customer_ranking(&conn, limit.unwrap_or(10))
}

#[command]
pub fn dashboard_monthly_comparison(holder: State<DbPoolHolder>, months: Option<i32>) -> Result<dashboard::ComparisonData, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_monthly_comparison(&conn, months.unwrap_or(6))
}

#[command]
pub fn dashboard_yearly_comparison(holder: State<DbPoolHolder>, years: Option<i32>) -> Result<dashboard::ComparisonData, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_yearly_comparison(&conn, years.unwrap_or(5))
}

#[command]
pub fn dashboard_recent_activities(holder: State<DbPoolHolder>) -> Result<dashboard::RecentActivity, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_recent_activities(&conn)
}

#[command]
pub fn dashboard_destination_distribution(holder: State<DbPoolHolder>) -> Result<Vec<dashboard::DestinationDistributionItem>, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_destination_distribution(&conn)
}

#[command]
pub fn dashboard_product_quantity_ranking(holder: State<DbPoolHolder>, limit: Option<i32>) -> Result<Vec<dashboard::ProductQuantityRankingItem>, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_product_quantity_ranking(&conn, limit.unwrap_or(10))
}

#[command]
pub fn dashboard_box_type_stats(holder: State<DbPoolHolder>, limit: Option<i32>) -> Result<Vec<dashboard::BoxTypeStatsItem>, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    dashboard::get_box_type_stats(&conn, limit.unwrap_or(10))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    stats: Option<dashboard::DashboardStats>,
    trends: Option<dashboard::TrendsData>,
    distribution: Option<std::collections::HashMap<String, i32>>,
    ranking: Option<Vec<dashboard::CustomerRankingItem>>,
    comparison: Option<dashboard::ComparisonData>,
    yearly_comparison: Option<dashboard::ComparisonData>,
    recent_activities: Option<dashboard::RecentActivity>,
    destination_distribution: Option<Vec<dashboard::DestinationDistributionItem>>,
    product_ranking: Option<Vec<dashboard::ProductQuantityRankingItem>>,
    box_type_stats: Option<Vec<dashboard::BoxTypeStatsItem>>,
}

#[command]
pub fn dashboard_batch(
    holder: State<DbPoolHolder>,
    include: Vec<String>,
    trends_days: Option<i32>,
    ranking_limit: Option<i32>,
    comparison_months: Option<i32>,
    yearly_comparison_years: Option<i32>,
    product_ranking_limit: Option<i32>,
    box_type_stats_limit: Option<i32>
) -> Result<BatchResult, String> {
    let pool = holder.get()?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let include_all = include.is_empty();
    
    let stats = if include_all || include.contains(&"stats".to_string()) {
        Some(dashboard::get_stats(&conn)?)
    } else { None };

    let trends = if include_all || include.contains(&"trends".to_string()) {
        Some(dashboard::get_trends(&conn, trends_days.unwrap_or(30))?)
    } else { None };
    
    let distribution = if include_all || include.contains(&"distribution".to_string()) {
        Some(dashboard::get_status_distribution(&conn)?)
    } else { None };

    let ranking = if include_all || include.contains(&"ranking".to_string()) {
        Some(dashboard::get_customer_ranking(&conn, ranking_limit.unwrap_or(10))?)
    } else { None };

    let comparison = if include_all || include.contains(&"comparison".to_string()) {
        Some(dashboard::get_monthly_comparison(&conn, comparison_months.unwrap_or(6))?)
    } else { None };

    let yearly_comparison = if include_all || include.contains(&"yearlyComparison".to_string()) {
        Some(dashboard::get_yearly_comparison(&conn, yearly_comparison_years.unwrap_or(5))?)
    } else { None };
    
    let destination_distribution = if include_all || include.contains(&"destinationDistribution".to_string()) {
         Some(dashboard::get_destination_distribution(&conn)?)
    } else { None };
    
    let product_ranking = if include_all || include.contains(&"productRanking".to_string()) {
         Some(dashboard::get_product_quantity_ranking(&conn, product_ranking_limit.unwrap_or(10))?)
    } else { None };
    
    let box_type_stats = if include_all || include.contains(&"boxTypeStats".to_string()) {
         Some(dashboard::get_box_type_stats(&conn, box_type_stats_limit.unwrap_or(10))?)
    } else { None };

    Ok(BatchResult {
        stats,
        trends,
        distribution,
        ranking,
        comparison,
        yearly_comparison,
        recent_activities: None,
        destination_distribution,
        product_ranking,
        box_type_stats,
    })
}
