/**
 * Defense-in-depth for /api/admin/*.
 * Production: Cloudflare Access sets Cf-Access-Authenticated-User-Email on authenticated requests.
 * Fallback: Authorization: Bearer <ADMIN_API_KEY> (or legacy ADMIN_PASSWORD).
 * Local dev: set ADMIN_AUTH_DISABLED=true.
 */
function requireAdmin(req, res, next) {
  if (process.env.ADMIN_AUTH_DISABLED === 'true') {
    return next();
  }

  const cfEmail = req.headers['cf-access-authenticated-user-email'];
  if (cfEmail && String(cfEmail).trim()) {
    return next();
  }

  const apiKey = process.env.ADMIN_API_KEY || process.env.ADMIN_PASSWORD;
  if (apiKey) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token && token === apiKey) {
      return next();
    }
  }

  return res.status(401).json({ error: 'נדרשת הרשאת מנהל' });
}

module.exports = { requireAdmin };
