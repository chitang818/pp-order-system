const crypto = require('crypto');

function generateEtag(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload || '');
  return 'W/"' + crypto.createHash('sha1').update(str).digest('hex') + '"';
}

module.exports = { generateEtag };