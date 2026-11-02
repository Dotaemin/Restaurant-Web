const prisma = require('../lib/prisma');

/**
 * Rejects direct calls from known HTTP API / CLI tools.
 */
function blockHttpTools(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  // Detect automated HTTP CLI / inspection tools
  const isDirectTool = /curl|postmanruntime|insomnia|python-requests|httpie|wget/i.test(ua);

  if (isDirectTool) {
    return res.status(403).render('errors/403', {
      title: '403 - Access Forbidden',
      cause: 'Direct calls using automated HTTP tools (curl, Postman, etc.) are strictly prohibited.',
      backUrl: '/dishes'
    });
  }

  next();
}

/**
 * Session verification middleware.
 * Attaches req.user and res.locals.currentUser if a valid persistent DB session exists.
 */
async function sessionMiddleware(req, res, next) {
  res.locals.currentUser = null;
  req.user = null;
  req.session = null;

  const sid = req.cookies?.sid;
  if (!sid) {
    return next();
  }

  try {
    const session = await prisma.session.findUnique({
      where: { sid },
      include: { user: true }
    });

    if (!session) {
      res.clearCookie('sid');
      return next();
    }

    // Check expiration
    if (new Date() > new Date(session.expiresAt)) {
      await prisma.session.delete({ where: { sid } }).catch(() => {});
      res.clearCookie('sid');
      return next();
    }

    req.user = session.user;
    req.session = session;
    res.locals.currentUser = session.user;
  } catch (err) {
    console.error('Session middleware error:', err);
  }

  next();
}

/**
 * Requires an active Admin user session for administrative CRUD routes.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(403).render('errors/403', {
      title: '403 - Access Forbidden',
      cause: 'You must log in with an activated Admin account to access administrative views.',
      backUrl: '/login'
    });
  }

  // Reject all attempts from Pending accounts
  if (req.user.status === 'pending') {
    return res.status(403).render('errors/403', {
      title: '403 - Account Pending Activation',
      cause: 'Your account is currently Pending and has not been activated. Please activate your account via email OTP.',
      backUrl: `/activation?email=${encodeURIComponent(req.user.email)}`
    });
  }

  // Check admin role
  if (req.user.role !== 'Admin') {
    return res.status(403).render('errors/403', {
      title: '403 - Access Forbidden',
      cause: 'Your account does not have Admin privileges.',
      backUrl: '/dishes'
    });
  }

  next();
}

module.exports = {
  blockHttpTools,
  sessionMiddleware,
  requireAdmin
};
