/**
 * 自动备份服务
 * 实现定时备份和自动清理
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const logger = require('../utils/structured-logger');

class BackupService {
  constructor() {
    this.backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
    this.maxBackups = {
      hourly: 24,
      daily: 7,
      weekly: 4,
      monthly: 12
    };
    
    // 确保备份目录存在
    ['hourly', 'daily', 'weekly', 'monthly'].forEach(type => {
      const dir = path.join(this.backupDir, type);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  // 每小时备份
  scheduleHourlyBackup() {
    cron.schedule('0 * * * *', () => {
      this.createBackup('hourly');
    });
  }
  
  // 每天备份（凌晨2点）
  scheduleDailyBackup() {
    cron.schedule('0 2 * * *', () => {
      this.createBackup('daily');
    });
  }
  
  // 每周备份（周日凌晨2点）
  scheduleWeeklyBackup() {
    cron.schedule('0 2 * * 0', () => {
      this.createBackup('weekly');
    });
  }
  
  // 每月备份（1号凌晨2点）
  scheduleMonthlyBackup() {
    cron.schedule('0 2 1 * *', () => {
      this.createBackup('monthly');
    });
  }
  
  async createBackup(type) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${type}-${timestamp}.sqlite`;
    const backupPath = path.join(this.backupDir, type);
    const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'erp.sqlite');
    
    try {
      await this.copyDatabase(dbPath, path.join(backupPath, filename));
      await this.cleanOldBackups(type);
      logger.info(`[Backup] Created ${type} backup: ${filename}`);
    } catch (error) {
      logger.error(`[Backup] Failed to create ${type} backup:`, error);
    }
  }
  
  async cleanOldBackups(type) {
    const backupPath = path.join(this.backupDir, type);
    const files = fs.readdirSync(backupPath)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => ({
        name: f,
        path: path.join(backupPath, f),
        time: fs.statSync(path.join(backupPath, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    const maxBackups = this.maxBackups[type];
    const toDelete = files.slice(maxBackups);
    
    toDelete.forEach(file => {
      fs.unlinkSync(file.path);
      logger.info(`[Backup] Deleted old backup: ${file.name}`);
    });
  }
  
  async copyDatabase(source, dest) {
    return new Promise((resolve, reject) => {
      exec(`sqlite3 "${source}" ".backup '${dest}'"`, (error) => {
        if (error) {
          // 如果sqlite3命令不可用，使用文件复制
          try {
            fs.copyFileSync(source, dest);
            resolve();
          } catch (copyError) {
            reject(copyError);
          }
        } else {
          resolve();
        }
      });
    });
  }
  
  startAll() {
    this.scheduleHourlyBackup();
    this.scheduleDailyBackup();
    this.scheduleWeeklyBackup();
    this.scheduleMonthlyBackup();
    logger.info('[Backup] All backup schedules started');
  }
}

module.exports = new BackupService();
