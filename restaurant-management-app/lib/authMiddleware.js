const prisma = require('./prisma');
const { verifySessionJwt } = require('./security');

const ROLE_PERMISSIONS = {
  VIEWER: [
    'dish:read'
  ],
  CHEF: [
    'dish:read',
    'dish:create',
    'dish:update',
    'chef:read',
    'ingredient:read'
  ],
  ADMIN: [
    'dish:read',
    'dish:create',
    'dish:update',
    'dish:delete',
    'chef:read',
    'chef:create',
    'chef:update',
    'chef:delete',
    'ingredient:read',
    'ingredient:create',
    'ingredient:update',
    'ingredient:delete',
    'user:read',
    'user:manage'
  ]
};

/**
 * Global authentication middleware:
 * Extracts user from JWT cookie and loads current user profile from DB.
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
    const payload = await verifySessionJwt(token);
    const userId = payload ? Number(payload.sub) : NaN;
    if (!payload || !Number.isInteger(userId)) {
      res.clearCookie('auth_token');
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { chef: true }
    });

    if (!user) {
      res.clearCookie('auth_token');
      return next();
    }

    const safeUser = { ...user };
    delete safeUser.passwordHash;
    delete safeUser.salt;
    delete safeUser.mfaSecret;

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
 * Returns JSON 401 UNAUTHENTICATED
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Please sign in to access this feature.'
      }
    });
  }
  next();
}

/**
 * Guard: Requires user account to be active
 * Returns JSON 403 ACTIVATION_REQUIRED for pending users
 */
function requireActive(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Please sign in to access this feature.'
      }
    });
  }

  if (req.user.status === 'PENDING' || req.user.status === 'pending') {
    return res.status(403).json({
      ok: false,
      requireActivation: true,
      email: req.user.email,
      error: {
        code: 'ACTIVATION_REQUIRED',
        message: 'Please activate your account before continuing.'
      }
    });
  }

  next();
}

/**
 * Guard: Requires specific RBAC permission
 * Returns JSON 403 FORBIDDEN
 */
function requirePermission(permission) {
  return (req, res, next) => {
    // 1. Must be authenticated
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Please sign in to access this feature.'
        }
      });
    }

    // 2. Must be ACTIVE
    if (req.user.status === 'PENDING' || req.user.status === 'pending') {
      return res.status(403).json({
        ok: false,
        requireActivation: true,
        email: req.user.email,
        error: {
          code: 'ACTIVATION_REQUIRED',
          message: 'Please activate your account before continuing.'
        }
      });
    }

    // 3. Must have permission
    const permissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action.'
        }
      });
    }

    next();
  };
}

/**
 * Guard: Only allow unauthenticated guests
 */
function requireGuest(req, res, next) {
  if (req.user && (req.user.status === 'ACTIVE' || req.user.status === 'active')) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'ALREADY_AUTHENTICATED',
        message: 'You are already signed in.'
      }
    });
  }
  next();
}

module.exports = {
  ROLE_PERMISSIONS,
  sessionMiddleware,
  requireAuth,
  requireActive,
  requirePermission,
  requireGuest
};
