const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { SignJWT, jwtVerify } = require('jose');

// Default fallback secret for JWT development if not in process.env
const JWT_SECRET_STRING = process.env.JWT_SECRET || 'bht_diner_super_secure_jwt_secret_key_2026';
const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET_STRING);

// Google reCAPTCHA v2 Test Keys fallback (official Google test keys that always pass)
const GOOGLE_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const GOOGLE_TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || GOOGLE_TEST_SITE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || GOOGLE_TEST_SECRET_KEY;

/**
 * Generate a random 5-digit numeric string for salt
 */
function generate5DigitSalt() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * Hash password with 5-digit salt string using bcrypt
 */
async function hashPassword(plainPassword, salt) {
  return await bcrypt.hash(plainPassword + salt, 10);
}

/**
 * Verify plain password against bcrypt hash + salt
 */
async function verifyPassword(plainPassword, salt, hash) {
  try {
    return await bcrypt.compare(plainPassword + salt, hash);
  } catch (err) {
    return false;
  }
}

/**
 * Generate a 6-digit random numeric OTP
 */
function generate6DigitOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate cryptographically secure random reset token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash reset token using SHA-256 for secure storage
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random session ID (UUID v4)
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Validate password complexity:
 * - At least 8 characters
 * - At least 1 capitalized letter
 * - At least 1 number
 * - At least 1 special character (!, @, #, $, %, ^, &, *, <, >, .)
 */
function validatePasswordComplexity(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*<>.]/.test(password);
  return hasUpperCase && hasNumber && hasSpecial;
}

/**
 * Validate email is in format ...@gmail.com
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
  return gmailRegex.test(trimmed);
}

/**
 * Validate Google reCAPTCHA v2 token
 */
async function verifyRecaptcha(recaptchaResponse, remoteIp) {
  if (!recaptchaResponse) {
    if (process.env.NODE_ENV === 'test') return true;
    return false;
  }

  // If using Google's official test secret key and client sent a dummy/test token, accept
  if (RECAPTCHA_SECRET_KEY === GOOGLE_TEST_SECRET_KEY && recaptchaResponse.startsWith('test_')) {
    return true;
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', RECAPTCHA_SECRET_KEY);
    params.append('response', recaptchaResponse);
    if (remoteIp) params.append('remoteip', remoteIp);

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const data = await res.json();
    return Boolean(data && data.success);
  } catch (err) {
    console.error('reCAPTCHA verification error:', err.message);
    if (process.env.NODE_ENV === 'test') return true;
    return false;
  }
}

/**
 * Sign session JWT using jose library.
 * Header : { alg: 'HS256', typ: 'JWT' }
 * Payload: { sid, role, sub (user id), iat, exp }
 * NOTE: role is informational only. Authorization must keep using the
 * role loaded from the database (req.user.role), never the token's role.
 */
async function signSessionJwt(sessionId, user) {
  return await new SignJWT({ sid: sessionId, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET_KEY);
}

/**
 * Verify JWT using jose library and return claims
 */
async function verifySessionJwt(jwtString) {
  try {
    const { payload } = await jwtVerify(jwtString, JWT_SECRET_KEY);
    return payload;
  } catch (err) {
    return null;
  }
}

module.exports = {
  RECAPTCHA_SITE_KEY,
  generate5DigitSalt,
  hashPassword,
  verifyPassword,
  generate6DigitOtp,
  generateResetToken,
  hashResetToken,
  generateSessionId,
  validatePasswordComplexity,
  validateEmail,
  verifyRecaptcha,
  signSessionJwt,
  verifySessionJwt
};
