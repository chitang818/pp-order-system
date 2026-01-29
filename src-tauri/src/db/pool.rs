use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::sync::{Arc, RwLock};

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Clone)]
pub struct DbPoolHolder(pub Arc<RwLock<Option<DbPool>>>);

impl DbPoolHolder {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(None)))
    }

    pub fn set(&self, pool: DbPool) {
        let mut inner = self.0.write().unwrap();
        *inner = Some(pool);
    }

    pub fn get(&self) -> Result<DbPool, String> {
        let inner = self.0.read().unwrap();
        inner.clone().ok_or_else(|| "数据库连接尚未建立".to_string())
    }

    pub fn is_initialized(&self) -> bool {
        let inner = self.0.read().unwrap();
        inner.is_some()
    }

    pub fn clear(&self) {
        let mut inner = self.0.write().unwrap();
        *inner = None;
    }
}

pub fn init_pool(db_path: &str) -> Result<DbPool, String> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|c| {
            c.execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;",
            )
        });

    Pool::builder()
        .max_size(10)
        .build(manager)
        .map_err(|e| format!("Failed to create pool: {}", e))
}
