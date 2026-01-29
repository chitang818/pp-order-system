/**
 * 应用数据库索引迁移脚本
 * 
 * 用途：执行 add-indexes.sql 创建数据库索引
 * 使用：node backend/db/migrations/apply-indexes.js
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 数据库路径
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', 'data', 'erp.sqlite');

// 索引SQL文件路径
const SQL_FILE = path.join(__dirname, 'add-indexes.sql');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

function warn(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

/**
 * 获取所有现有索引
 */
function getExistingIndexes(db) {
  return new Promise((resolve, reject) => {
    db.all("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
}

/**
 * 获取表的行数
 */
function getTableRowCount(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
      if (err) {
        if (err.message.includes('no such table')) {
          resolve(0);
        } else {
          reject(err);
        }
      } else {
        resolve(row.count);
      }
    });
  });
}

/**
 * 测试查询性能
 */
function testQueryPerformance(db, query, description) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    db.all(query, (err, rows) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      if (err) {
        reject(err);
      } else {
        resolve({
          description,
          duration,
          rowCount: rows.length
        });
      }
    });
  });
}

/**
 * 主函数
 */
async function main() {
  log('', 'reset');
  log('================================================================', 'cyan');
  log('       数据库索引优化工具', 'cyan');
  log('================================================================', 'cyan');
  log('', 'reset');

  // 检查数据库文件是否存在
  if (!fs.existsSync(DB_PATH)) {
    error(`数据库文件不存在: ${DB_PATH}`);
    process.exit(1);
  }

  info(`数据库路径: ${DB_PATH}`);

  // 检查SQL文件是否存在
  if (!fs.existsSync(SQL_FILE)) {
    error(`SQL文件不存在: ${SQL_FILE}`);
    process.exit(1);
  }

  info(`SQL文件路径: ${SQL_FILE}`);
  log('', 'reset');

  // 读取SQL文件
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  
  // 打开数据库连接
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      error(`无法打开数据库: ${err.message}`);
      process.exit(1);
    }
  });

  try {
    // 获取现有索引
    log('📊 检查现有索引...', 'blue');
    const existingIndexes = await getExistingIndexes(db);
    info(`现有索引数量: ${existingIndexes.length}`);
    
    if (existingIndexes.length > 0) {
      log('现有索引列表:', 'yellow');
      existingIndexes.forEach(idx => {
        console.log(`  - ${idx}`);
      });
    }
    log('', 'reset');

    // 获取表的数据量
    log('📈 检查表数据量...', 'blue');
    const tables = ['orders', 'order_items', 'products', 'customers', 'operation_logs', 'sessions', 'users'];
    for (const table of tables) {
      const count = await getTableRowCount(db, table);
      info(`${table}: ${count} 行`);
    }
    log('', 'reset');

    // 性能测试（创建索引前）
    log('⏱️  测试查询性能（创建索引前）...', 'blue');
    const testQueries = [
      {
        query: "SELECT * FROM orders WHERE customerId = 1 LIMIT 100",
        description: "订单-按客户查询"
      },
      {
        query: "SELECT * FROM orders WHERE status = '已创建' LIMIT 100",
        description: "订单-按状态查询"
      },
      {
        query: "SELECT * FROM orders ORDER BY createdAt DESC LIMIT 100",
        description: "订单-按时间排序"
      },
      {
        query: "SELECT * FROM operation_logs WHERE userId = 1 ORDER BY createdAt DESC LIMIT 100",
        description: "日志-按用户查询"
      },
      {
        query: "SELECT * FROM sessions WHERE userId = 1 AND expiresAt > datetime('now')",
        description: "会话-有效会话查询"
      }
    ];

    const beforeResults = [];
    for (const test of testQueries) {
      try {
        const result = await testQueryPerformance(db, test.query, test.description);
        beforeResults.push(result);
        info(`${result.description}: ${result.duration}ms (${result.rowCount}行)`);
      } catch (err) {
        warn(`查询失败: ${test.description} - ${err.message}`);
      }
    }
    log('', 'reset');

    // 执行索引创建
    log('🚀 开始创建索引...', 'blue');
    info('这可能需要几秒到几分钟，取决于数据量');
    log('', 'reset');

    const startTime = Date.now();
    
    await new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    success(`索引创建完成！耗时: ${duration}秒`);
    log('', 'reset');

    // 获取新索引列表
    log('📊 检查新建索引...', 'blue');
    const newIndexes = await getExistingIndexes(db);
    const addedIndexes = newIndexes.filter(idx => !existingIndexes.includes(idx));
    
    if (addedIndexes.length > 0) {
      success(`新增索引数量: ${addedIndexes.length}`);
      log('新增索引列表:', 'green');
      addedIndexes.forEach(idx => {
        console.log(`  ✓ ${idx}`);
      });
    } else {
      info('没有新增索引（可能已存在）');
    }
    log('', 'reset');

    // 性能测试（创建索引后）
    log('⏱️  测试查询性能（创建索引后）...', 'blue');
    const afterResults = [];
    for (const test of testQueries) {
      try {
        const result = await testQueryPerformance(db, test.query, test.description);
        afterResults.push(result);
        info(`${result.description}: ${result.duration}ms (${result.rowCount}行)`);
      } catch (err) {
        warn(`查询失败: ${test.description} - ${err.message}`);
      }
    }
    log('', 'reset');

    // 性能对比
    if (beforeResults.length > 0 && afterResults.length > 0) {
      log('📊 性能对比报告', 'cyan');
      log('================================================================', 'cyan');
      
      let totalBefore = 0;
      let totalAfter = 0;
      
      for (let i = 0; i < beforeResults.length; i++) {
        const before = beforeResults[i];
        const after = afterResults[i];
        
        if (before && after) {
          totalBefore += before.duration;
          totalAfter += after.duration;
          
          const improvement = before.duration > 0 
            ? ((before.duration - after.duration) / before.duration * 100).toFixed(1)
            : 0;
          
          const arrow = after.duration < before.duration ? '📈' : '📉';
          
          log(`${arrow} ${before.description}`, 'yellow');
          log(`   优化前: ${before.duration}ms`, 'reset');
          log(`   优化后: ${after.duration}ms`, 'reset');
          log(`   提升: ${improvement}%`, improvement > 0 ? 'green' : 'red');
          log('', 'reset');
        }
      }
      
      const totalImprovement = totalBefore > 0
        ? ((totalBefore - totalAfter) / totalBefore * 100).toFixed(1)
        : 0;
      
      log('================================================================', 'cyan');
      success(`总体性能提升: ${totalImprovement}%`);
      log(`总耗时: ${totalBefore}ms -> ${totalAfter}ms`, 'cyan');
      log('================================================================', 'cyan');
    }

    // 关闭数据库
    db.close((err) => {
      if (err) {
        error(`关闭数据库失败: ${err.message}`);
      }
    });

    log('', 'reset');
    success('✨ 索引优化完成！');
    log('', 'reset');
    
    info('下一步建议:');
    log('  1. 重启应用以应用新索引', 'reset');
    log('  2. 监控应用性能变化', 'reset');
    log('  3. 如有问题可以删除索引回滚', 'reset');
    log('', 'reset');

  } catch (err) {
    error(`执行失败: ${err.message}`);
    console.error(err);
    
    db.close();
    process.exit(1);
  }
}

// 执行主函数
main().catch(err => {
  error(`未处理的错误: ${err.message}`);
  console.error(err);
  process.exit(1);
});
