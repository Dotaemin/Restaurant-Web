const prisma = require('./prisma');
const { verifySessionJwt } = require('./security');

/**
 * Global authentication middleware:
 * Checks for session JWT cookie, validates it against DB session store,
 * and attaches user object to req and res.locals.
 */
async function sessionMiddleware(req, res, next) {
  res.locals.currentUser = null;
  req.user = null;
  req.authClaims = null;

  const token = req.cookies ? req.cookies.auth_token : null;
  if (!token) {
    return next();
  }

  try {
    const payload = await verifySessionJwt(token); // null if bad signature or expired
    const userId = payload ? Number(payload.sub) : NaN;
    if (!payload || !Number.isInteger(userId)) {
      res.clearCookie('auth_token');
      return next();
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.clearCookie('auth_token'); // user was deleted after token was issued
      return next();
    }

    const safeUser = { ...user };
    delete safeUser.passwordHash;
    delete safeUser.salt;

    req.user = safeUser;
    req.authClaims = payload;
    res.locals.currentUser = safeUser;
    return next();
  } catch (err) {
    console.error('Error in sessionMiddleware:', err.message);
    res.clearCookie('auth_token');
    return next();
  }
}

/**
 * Guard: Requires user to be authenticated
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }

  if (req.user.status === 'pending') {
    return res.redirect('/activation?msg=activation_required');
  }

  next();
}

/**
 * Guard: Only allow unauthenticated guests (e.g. login, register, forget password)
 */
function requireGuest(req, res, next) {
  if (req.user && req.user.status === 'active') {
    return res.redirect('/dishes');
  }
  next();
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  requireGuest
};
