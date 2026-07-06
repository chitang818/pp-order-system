/**
 * 迁移脚本：将 label 类别拆分为 label_b 和 label_c
 * 
 * 执行方式：
 * node backend/db/migrations/migrate-label-to-label-b-c.js
 */

const { db } = require('../connection');

// B类品使用的标签
const LABEL_B_VALUES = [
  '红色KTC标签',
  'KT食品标签',
  'KT QR 食品标签',
  'ECHO标签',
  'JD标签（食品）',
  'KT标签',
  'AC标签',
  '103K新标签',
  'SCC标签',
  'SSMD标签'
];

// C类品使用的标签
const LABEL_C_VALUES = [
  'KWS标签',
  'CD3标签',
  'F标签',
  'YS标签',
  '无需标签'
];

async function migrate() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        // 获取所有 label 类别的配置
        db.all('SELECT * FROM order_configs WHERE category = ? ORDER BY sortIndex ASC, id ASC', ['label'], (err, rows) => {
          if (err) {
            db.run('ROLLBACK', () => reject(err));
            return;
          }

          if (!rows || rows.length === 0) {
            console.log('[迁移] 没有找到 label 类别的配置，跳过迁移');
            db.run('COMMIT', (err) => {
              if (err) reject(err);
              else resolve();
            });
            return;
          }

          console.log(`[迁移] 找到 ${rows.length} 个 label 类别的配置，开始迁移...`);

          const now = new Date().toISOString();
          let labelBSortIndex = 1;
          let labelCSortIndex = 1;
          let processed = 0;
          let errors = 0;

          // 处理每个配置项
          rows.forEach((row) => {
            const value = row.value;
            let targetCategory = null;
            let targetSortIndex = null;

            if (LABEL_B_VALUES.includes(value)) {
              targetCategory = 'label_b';
              targetSortIndex = labelBSortIndex++;
            } else if (LABEL_C_VALUES.includes(value)) {
              targetCategory = 'label_c';
              targetSortIndex = labelCSortIndex++;
            } else {
              console.warn(`[迁移] 警告：标签值 "${value}" 不在预期的列表中，将迁移到 label_b`);
              targetCategory = 'label_b';
              targetSortIndex = labelBSortIndex++;
            }

            // 插入到新的类别
            db.run(
              'INSERT INTO order_configs (category, value, sortIndex, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
              [targetCategory, value, targetSortIndex, now, now],
              function(err) {
                if (err) {
                  console.error(`[迁移] 插入失败: ${value} -> ${targetCategory}`, err);
                  errors++;
                } else {
                  console.log(`[迁移] 已迁移: ${value} -> ${targetCategory} (sortIndex: ${targetSortIndex})`);
                  processed++;
                }

                // 检查是否所有项都已处理
                if (processed + errors === rows.length) {
                  // 删除旧的 label 类别配置（可选，建议先注释掉，确认迁移成功后再删除）
                  // db.run('DELETE FROM order_configs WHERE category = ?', ['label'], (err) => {
                  //   if (err) {
                  //     console.error('[迁移] 删除旧配置失败:', err);
                  //     db.run('ROLLBACK', () => reject(err));
                  //     return;
                  //   }
                  //   console.log('[迁移] 已删除旧的 label 类别配置');
                  // });

                  db.run('COMMIT', (err) => {
                    if (err) {
                      reject(err);
                    } else {
                      console.log(`[迁移] 迁移完成！成功: ${processed}, 失败: ${errors}`);
                      console.log(`[迁移] label_b: ${labelBSortIndex - 1} 项, label_c: ${labelCSortIndex - 1} 项`);
                      resolve();
                    }
                  });
                }
              }
            );
          });
        });
      });
    });
  });
}

// 如果直接运行此脚本
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('[迁移] 迁移脚本执行完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[迁移] 迁移脚本执行失败:', err);
      process.exit(1);
    });
}

module.exports = { migrate };

