/**
 * 公司配置数据库操作
 */

const { db } = require('./connection');

/**
 * 获取公司配置
 */
function getCompany(cb) {
  db.get('SELECT * FROM company WHERE id = 1', (err, row) => {
    if (err) return cb(err);
    cb(null, row || null);
  });
}

/**
 * 设置/更新公司配置
 */
function setCompany(payload, cb) {
  const fields = [
    'companyNameCN',
    'companyNameEN',
    'companyAddressCN',
    'companyAddressEN',
    'companyTel',
    'companyFax',
    'signAt',
    'logoUrl',
    'themeColor',
    'fontSize',
    'headerProduction',
    'headerInvoice',
    'headerPacking',
    'headerSales'
  ];
  const vals = fields.map(k => payload[k] != null ? payload[k] : null);
  db.run(
    `INSERT INTO company (id, ${fields.join(', ')}) VALUES (1, ${fields.map(_ => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${fields.map(k => `${k} = excluded.${k}`).join(', ')}`,
    vals,
    function(err) {
      cb(err, this.changes > 0);
    }
  );
}

module.exports = {
  getCompany,
  setCompany
};
