/**
 * Rate Limiting and Brute-Force Protection
 * In-memory stores with automatic expiration cleanup.
 */

const loginAttempts = new Map(); // key: ip or email -> { count, firstFailedAt, lastFailedAt, lockedUntil }
const forgetCooldowns = new Map(); // key: ip or email -> timestamp

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes lockout

/**
 * Gets the client IP address.
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Checks login status for a given key (IP or email).
 * @param {string} key
 * @returns {{ locked: boolean, captchaRequired: boolean, remainingMs: number, attempts: number }}
 */
function getLoginStatus(key) {
  const record = loginAttempts.get(key);
  if (!record) {
    return { locked: false, captchaRequired: false, remainingMs: 0, attempts: 0 };
  }

  const now = Date.now();

  // If lockout is active
  if (record.lockedUntil && now < record.lockedUntil) {
    return {
      locked: true,
      captchaRequired: true,
      remainingMs: record.lockedUntil - now,
      attempts: record.count
    };
  }

  // If window expired (5 minutes since first failed attempt)
  if (now - record.firstFailedAt > WINDOW_MS) {
    loginAttempts.delete(key);
    return { locked: false, captchaRequired: false, remainingMs: 0, attempts: 0 };
  }

  return {
    locked: record.count >= 5,
    captchaRequired: record.count >= 3,
    remainingMs: record.lockedUntil ? Math.max(0, record.lockedUntil - now) : 0,
    attempts: record.count
  };
}

/**
 * Records a failed login attempt.
 * @param {string} key
 */
function recordLoginFailure(key) {
  const now = Date.now();
  let record = loginAttempts.get(key);

  if (!record || now - record.firstFailedAt > WINDOW_MS) {
    record = { count: 1, firstFailedAt: now, lastFailedAt: now, lockedUntil: null };
  } else {
    record.count += 1;
    record.lastFailedAt = now;
  }

  if (record.count >= 5) {
    record.lockedUntil = now + LOCKOUT_MS;
  }

  loginAttempts.set(key, record);
  return getLoginStatus(key);
}

/**
 * Clears failed login attempts after successful login.
 * @param {string} key
 */
function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

/**
 * Checks forget password cooldown (2 minutes).
 * @param {string} key
 * @returns {{ allowed: boolean, remainingSec: number }}
 */
function checkForgetRateLimit(key) {
  const lastTime = forgetCooldowns.get(key);
  if (!lastTime) return { allowed: true, remainingSec: 0 };

  const elapsed = Date.now() - lastTime;
  const cooldownMs = 2 * 60 * 1000; // 2 minutes
  if (elapsed < cooldownMs) {
    return { allowed: false, remainingSec: Math.ceil((cooldownMs - elapsed) / 1000) };
  }

  return { allowed: true, remainingSec: 0 };
}

/**
 * Records a forget password request.
 * @param {string} key
 */
function recordForgetRequest(key) {
  forgetCooldowns.set(key, Date.now());
}

/**
 * Helper to reset stores in tests.
 */
function resetAllRateLimits() {
  loginAttempts.clear();
  forgetCooldowns.clear();
}

module.exports = {
  getClientIp,
  getLoginStatus,
  recordLoginFailure,
  clearLoginFailures,
  checkForgetRateLimit,
  recordForgetRequest,
  resetAllRateLimits
};
