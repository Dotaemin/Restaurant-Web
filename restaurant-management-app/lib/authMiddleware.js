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
  req.sessionId = null;

  const token = req.cookies ? req.cookies.auth_token : null;
  if (!token) {
    return next();
  }

  try {
    const payload = await verifySessionJwt(token);
    if (!payload || !payload.sid) {
      res.clearCookie('auth_token');
      return next();
    }

    const session = await prisma.session.findUnique({
      where: { sid: payload.sid },
      include: { user: true }
    });

    if (!session || new Date() > new Date(session.expiresAt)) {
      // Session has expired or was revoked (logout / old sid rejection)
      res.clearCookie('auth_token');
      if (session) {
        // Clean up expired session from DB
        await prisma.session.delete({ where: { sid: session.sid } }).catch(() => {});
      }
      return next();
    }

    // Attach user (never expose password hash or salt)
    const safeUser = { ...session.user };
    delete safeUser.passwordHash;
    delete safeUser.salt;

    req.user = safeUser;
    req.sessionId = session.sid;
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
