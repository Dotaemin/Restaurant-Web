const OTPAuth = require('otpauth');
const qrcode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Generate a new Base32 secret for TOTP
 */
function generateMfaSecret() {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/**
 * Build OTPAuth TOTP instance
 */
function createTotpInstance(secretBase32, email) {
  return new OTPAuth.TOTP({
    issuer: 'BHT Diner',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

/**
 * Generate QR code data URL from TOTP instance
 */
async function generateQrCodeDataUrl(totpInstance) {
  const uri = totpInstance.toString();
  return await qrcode.toDataURL(uri);
}

/**
 * Generate 10 cryptographically random recovery codes
 * Example format: "A7B2-9F4D"
 */
function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const chunk1 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const chunk2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    codes.push(`${chunk1}-${chunk2}`);
  }
  return codes;
}

/**
 * Hash an array of recovery codes with bcrypt
 */
async function hashRecoveryCodes(plainCodes) {
  const hashed = [];
  for (const code of plainCodes) {
    const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const hash = await bcrypt.hash(clean, 10);
    hashed.push(hash);
  }
  return hashed;
}

/**
 * Verify a submitted recovery code against active hashed codes
 * Returns the matching recovery code record or null
 */
async function verifyRecoveryCode(plainCode, recoveryCodeRecords) {
  if (!plainCode || typeof plainCode !== 'string') return null;
  const clean = plainCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (const record of recoveryCodeRecords) {
    if (record.usedAt) continue; // Skip used codes
    const isMatch = await bcrypt.compare(clean, record.codeHash);
    if (isMatch) {
      return record;
    }
  }
  return null;
}

/**
 * Initial setup verification:
 * Checks code in a 2-step window and calculates device clock drift in seconds.
 */
function verifyInitialToken(totpInstance, token) {
  if (!token || typeof token !== 'string') return { valid: false, driftSeconds: 0 };
  const cleanToken = token.trim();
  const delta = totpInstance.validate({ token: cleanToken, window: 2 });
  if (delta === null) {
    return { valid: false, driftSeconds: 0 };
  }
  // delta is step offset (-2, -1, 0, 1, 2). 1 step = 30 seconds.
  const driftSeconds = delta * 30;
  return { valid: true, driftSeconds };
}

/**
 * Normal login verification:
 * Adjusts server time using user's saved mfaDrift offset.
 */
function verifyTokenWithDrift(totpInstance, token, driftSeconds = 0) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  const effectiveTimestamp = Date.now() + (driftSeconds * 1000);
  const delta = totpInstance.validate({
    token: cleanToken,
    window: 1,
    timestamp: effectiveTimestamp
  });
  return delta !== null;
}

module.exports = {
  generateMfaSecret,
  createTotpInstance,
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  verifyInitialToken,
  verifyTokenWithDrift
};
