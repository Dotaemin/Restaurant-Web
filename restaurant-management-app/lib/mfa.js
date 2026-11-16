require('dotenv').config();
const OTPAuth = require('otpauth');
const qrcode = require('qrcode');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const TOTP_PERIOD = 30;

// ==========================================
// TOTP secret encryption at rest (AES-256-GCM)
// Stored format: v1:<iv>:<authTag>:<ciphertext>   (each part base64)
// ==========================================
function loadEncryptionKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MFA_ENCRYPTION_KEY is not set in .env. Generate one with: ' +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded.');
  }
  return key;
}

// Evaluated when this module is first required, so the server refuses to start without a valid key.
const ENCRYPTION_KEY = loadEncryptionKey();

function encryptSecret(plainBase32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainBase32), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(stored) {
  const [version, ivB64, tagB64, dataB64] = String(stored || '').split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Stored MFA secret is not in the expected encrypted format.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final()
  ]);
  return plain.toString('utf8');
}

/**
 * Generate a new Base32 secret for TOTP (plaintext: only for showing the QR / manual key once)
 */
function generateMfaSecret() {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/**
 * Build OTPAuth TOTP instance from a PLAINTEXT Base32 secret
 */
function createTotpInstance(secretBase32, email) {
  return new OTPAuth.TOTP({
    issuer: 'BHT Diner',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32)
  });
}

/**
 * Build OTPAuth TOTP instance from a user row (decrypts user.mfaSecret).
 * This is the ONLY place where a stored secret is decrypted.
 */
function createTotpFromUser(user) {
  return createTotpInstance(decryptSecret(user.mfaSecret), user.email);
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
 * Example format: "A7B29F-4D31C8"
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
 * Checks code in a 2-step window, calculates device clock drift in seconds,
 * and returns the matched time step (used to block replay of the setup code).
 */
function verifyInitialToken(totpInstance, token) {
  if (!token || typeof token !== 'string') return { valid: false, driftSeconds: 0, step: null };
  const cleanToken = token.trim();
  const delta = totpInstance.validate({ token: cleanToken, window: 2 });
  if (delta === null) {
    return { valid: false, driftSeconds: 0, step: null };
  }
  // delta is step offset (-2..2). 1 step = 30 seconds.
  const driftSeconds = delta * TOTP_PERIOD;
  const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD) + delta;
  return { valid: true, driftSeconds, step };
}

/**
 * Normal login verification:
 * Shifts server time by the user's saved drift, accepts +/-1 step, and rejects
 * any step <= lastUsedStep (replay protection).
 * Returns the matched step (a positive integer) or null.  NOTE: no longer returns a boolean.
 */
function verifyTokenWithDrift(totpInstance, token, driftSeconds = 0, lastUsedStep = null) {
  if (!token || typeof token !== 'string') return null;
  const effectiveTimestamp = Date.now() + (driftSeconds * 1000);
  const delta = totpInstance.validate({
    token: token.trim(),
    window: 1,
    timestamp: effectiveTimestamp
  });
  if (delta === null) return null;

  const step = Math.floor(effectiveTimestamp / 1000 / TOTP_PERIOD) + delta;
  if (lastUsedStep !== null && lastUsedStep !== undefined && step <= lastUsedStep) {
    return null; // this code (or an older one) was already used
  }
  return step;
}

/**
 * Atomically mark a time step as used. Returns true only for the request that wins the race,
 * so two parallel requests with the same code cannot both succeed.
 */
async function consumeTotpStep(prismaClient, userId, step) {
  const result = await prismaClient.user.updateMany({
    where: {
      id: userId,
      OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }]
    },
    data: { mfaLastUsedStep: step }
  });
  return result.count === 1;
}

/**
 * Step-up MFA check for sensitive admin actions (e.g. granting the ADMIN role).
 * Accepts a current TOTP code or an unused recovery code belonging to the ACTING user.
 * Same lockout as login: 3 wrong codes -> locked for 5 minutes.
 * Returns { ok: true } or { ok: false, status, code, message }.
 */
async function verifyStepUpMfa(prismaClient, userId, rawCode) {
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!code) {
    return {
      ok: false,
      status: 403,
      code: 'MFA_REQUIRED',
      message: 'Multi-factor authentication is required. Enter your authenticator code to confirm this change.'
    };
  }

  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    include: { recoveryCodes: true }
  });

  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    return {
      ok: false,
      status: 403,
      code: 'MFA_NOT_ENABLED',
      message: 'Enable multi-factor authentication on your own account before granting the Admin role.'
    };
  }

  const now = new Date();
  if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
    const minutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
    return {
      ok: false,
      status: 429,
      code: 'MFA_LOCKED',
      message: `Too many invalid codes. Please wait ${minutes} minute(s) before trying again.`
    };
  }

  let verified = false;

  if (code.includes('-')) {
    // Recovery code (format A7B29F-4D31C8)
    const record = await verifyRecoveryCode(code, user.recoveryCodes);
    if (record) {
      const marked = await prismaClient.recoveryCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      verified = marked.count === 1;
    }
  } else {
    // 6-digit TOTP code
    const totp = createTotpFromUser(user);
    const step = verifyTokenWithDrift(totp, code, user.mfaDrift || 0, user.mfaLastUsedStep);
    verified = step !== null && (await consumeTotpStep(prismaClient, user.id, step));
  }

  if (!verified) {
    const updated = await prismaClient.user.update({
      where: { id: user.id },
      data: { mfaFailedAttempts: { increment: 1 } },
      select: { mfaFailedAttempts: true }
    });

    if (updated.mfaFailedAttempts >= 3) {
      await prismaClient.user.update({
        where: { id: user.id },
        data: { mfaLockedUntil: new Date(Date.now() + 5 * 60 * 1000), mfaFailedAttempts: 0 }
      });
      return {
        ok: false,
        status: 429,
        code: 'MFA_LOCKED',
        message: 'Invalid code entered 3 times. Please wait 5 minutes before trying again.'
      };
    }

    return {
      ok: false,
      status: 400,
      code: 'INVALID_MFA_CODE',
      message: `The verification code is incorrect. You have ${3 - updated.mfaFailedAttempts} attempt(s) remaining.`
    };
  }

  await prismaClient.user.update({
    where: { id: user.id },
    data: { mfaFailedAttempts: 0, mfaLockedUntil: null }
  });
  return { ok: true };
}

module.exports = {
  verifyStepUpMfa,
  encryptSecret,
  decryptSecret,
  generateMfaSecret,
  createTotpInstance,
  createTotpFromUser,
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  verifyInitialToken,
  verifyTokenWithDrift,
  consumeTotpStep
};