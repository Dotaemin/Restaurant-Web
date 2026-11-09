const { verifyCsrfToken } = require('./security');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.authClaims) return next(); // no valid auth cookie = nothing to forge
  if (!verifyCsrfToken(req.authClaims, req.get('X-CSRF-Token'))) {
    return res.status(403).json({
      ok: false,
      error: { code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token.' }
    });
  }
  next();
}

module.exports = { csrfProtection };