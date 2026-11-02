const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * Generates a random 5-digit string (e.g. "49201") used as custom salt.
 */
function generateSalt() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

/**
 * Hashes password combined with salt using bcrypt.
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<string>}
 */
async function hashPassword(password, salt) {
  return await bcrypt.hash(password + salt, 10);
}

/**
 * Verifies password against stored bcrypt hash using salt.
 * @param {string} password
 * @param {string} salt
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  return await bcrypt.compare(password + salt, hash);
}

/**
 * Validates password complexity:
 * - At least 8 characters in length
 * - At least 1 capitalized letter ([A-Z])
 * - At least 1 number ([0-9])
 * - At least 1 special character (!, @, #, $, %, ^, &, *, <, >, .)
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePasswordComplexity(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password cannot be blank.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters in length.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 uppercase letter (A-Z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 number (0-9).' };
  }
  if (!/[!@#$%^&*<>.]/.test(password)) {
    return { valid: false, message: 'Password must contain at least 1 special character (!, @, #, $, %, ^, &, *, <, >, .).' };
  }
  return { valid: true };
}

/**
 * Generates a 6-digit numeric OTP.
 * @returns {string}
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Securely hashes an OTP using SHA-256.
 * @param {string} otp
 * @returns {string}
 */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

/**
 * Verifies OTP against its stored hash.
 * @param {string} otp
 * @param {string} hash
 * @returns {boolean}
 */
function verifyOtp(otp, hash) {
  return hashOtp(otp) === hash;
}

/**
 * Generates a secure random 64-character hex reset token.
 * @returns {string}
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a reset token using SHA-256 for database storage.
 * @param {string} token
 * @returns {string}
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Generates a secure random session ID.
 * @returns {string}
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  generateSalt,
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  generateOtp,
  hashOtp,
  verifyOtp,
  generateResetToken,
  hashResetToken,
  generateSessionId
};
