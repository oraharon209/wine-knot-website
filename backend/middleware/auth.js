const crypto = require('crypto');

function adminToken() {
  const pass = process.env.ADMIN_PASSWORD || 'wineknot';
  return crypto.createHash('sha256').update(`wine-knot:${pass}`).digest('hex');
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token && token === adminToken()) {
    return next();
  }
  return res.status(401).json({ error: 'נדרשת התחברות' });
}

function checkPassword(password) {
  return password === (process.env.ADMIN_PASSWORD || 'wineknot');
}

module.exports = { requireAdmin, adminToken, checkPassword };
