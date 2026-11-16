const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const {
  RECAPTCHA_SITE_KEY,
  generate5DigitSalt,
  hashPassword,
  verifyPassword,
  generate6DigitOtp,
  generateResetToken,
  hashResetToken,
  validatePasswordComplexity,
  validateEmail,
  verifyRecaptcha,
  signSessionJwt,
  signMfaPendingJwt,
  signMfaSetupJwt,
  verifyMfaPendingJwt,
  verifyMfaSetupJwt,
  verifySessionJwt,
  generateCsrfToken
} = require('../lib/security');
const {
  generateMfaSecret,
  createTotpInstance,
  createTotpFromUser,
  encryptSecret,
  consumeTotpStep,
  generateQrCodeDataUrl,
  generateRecoveryCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  verifyInitialToken,
  verifyTokenWithDrift
} = require('../lib/mfa');
const { sendActivationOtpEmail, sendPasswordResetEmail } = require('../lib/mailer');
const { requireAuth, requireGuest } = require('../lib/authMiddleware');

// In-memory rate limiting map for POST /forget (2 minutes cooldown per target)
const forgetRateLimitMap = new Map();

// Helper to sanitize user object for safety (whitelist)
function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    chefId: user.chefId ?? null,
    mfaEnabled: Boolean(user.mfaEnabled)
  };
}

// GET /api/auth/me - Returns current logged in user
router.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({
    ok: true,
    user: sanitizeUser(req.user),
    csrfToken: req.authClaims ? generateCsrfToken(req.authClaims) : null
  });
});

// GET /api/auth/config - Expose public config like reCAPTCHA site key
router.get('/api/auth/config', (req, res) => {
  return res.json({
    ok: true,
    recaptchaSiteKey: RECAPTCHA_SITE_KEY
  });
});

// ==========================================
// 1. REGISTRATION
// ==========================================
const handleRegister = async (req, res) => {
  const { username, email, password, confirmPassword, role } = req.body;
  const recaptchaResponse = req.body['g-recaptcha-response'] || req.body.recaptchaToken;

  const renderValidationError = (message) => {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message
      }
    });
  };

  try {
    // 1. Verify Google reCAPTCHA
    const isHuman = await verifyRecaptcha(recaptchaResponse, req.ip);
    if (!isHuman) {
      return renderValidationError('Please complete the security check to continue.');
    }

    // 2. Validate Username
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return renderValidationError('Username must be at least 3 characters in length.');
    }
    const cleanUsername = username.trim();

    // 3. Validate Email
    if (!validateEmail(email)) {
      return renderValidationError('Please provide a valid Gmail address (ending with @gmail.com).');
    }
    const cleanEmail = email.trim().toLowerCase();

    // 4. Validate Password Complexity
    if (!validatePasswordComplexity(password)) {
      return renderValidationError(
        'Password must be at least 8 characters and include at least 1 uppercase letter, 1 number, and 1 special symbol (!, @, #, $, %, ^, &, *, <, >, .).'
      );
    }

    // 5. Validate Password Confirmation
    if (password !== confirmPassword) {
      return renderValidationError('The entered passwords do not match. Please retype them carefully.');
    }

    // 6. Check for duplicate Username or Email
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanUsername },
          { email: cleanEmail }
        ]
      }
    });

    if (existingUser) {
      if (existingUser.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return renderValidationError('This username is already taken. Please choose another username.');
      }
      return renderValidationError('An account with this email address already exists.');
    }

    // 7. Hash password using bcrypt incorporating a random 5-digit salt string
    const salt = generate5DigitSalt();
    const passwordHash = await hashPassword(password, salt);

    // 8. Create user in database: always role VIEWER, mfaSecret null, mfaEnabled false
    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        salt,
        role: 'VIEWER',
        status: 'PENDING',
        mfaSecret: null,
        mfaEnabled: false
      }
    });

    // 9. Generate 6-digit OTP and create ActivationChallenge
    const otp = generate6DigitOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    await prisma.activationChallenge.upsert({
      where: { userId: newUser.id },
      update: {
        purpose: 'account_activation',
        otp,
        expiresAt,
        attempts: 0,
        lockedUntil: null,
        lastSentAt: new Date(),
        usedAt: null
      },
      create: {
        userId: newUser.id,
        purpose: 'account_activation',
        otp,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date()
      }
    });

    // 10. Send OTP email
    await sendActivationOtpEmail(cleanEmail, otp);

    return res.status(200).json({
      ok: true,
      message: 'Account created. Please activate with the verification code sent to your email.',
      email: cleanEmail
    });
  } catch (err) {
    console.error('Registration processing error:', err.message);
    return renderValidationError('An unexpected problem occurred while creating your account. Please try again.');
  }
};

router.post('/api/auth/register', handleRegister);

// ==========================================
// 2. ACTIVATION
// ==========================================
const handleActivation = async (req, res) => {
  const { email, otp, mfaCode } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  const renderOtpError = (message, remainingAttempts = 3) => {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'ACTIVATION_FAILED',
        message,
        remainingAttempts
      }
    });
  };

  try {
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { activationChallenge: true }
    });

    if (!user || !user.activationChallenge) {
      return renderOtpError('The activation code is incorrect or has expired. Please check and try again.', 3);
    }

    const challenge = user.activationChallenge;

    // Check if account activation is locked
    if (challenge.lockedUntil && new Date() < new Date(challenge.lockedUntil)) {
      return res.status(429).json({
        ok: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: "You've failed OTP activation too many times. Please wait 5 minutes before retrying."
        }
      });
    }

    // Check expiration (2 minutes)
    const isExpired = new Date() > new Date(challenge.expiresAt);
    const isCorrect = challenge.otp === cleanOtp;

    if (isExpired || !isCorrect) {
      const newAttempts = (challenge.attempts || 0) + 1;
      let lockedUntil = challenge.lockedUntil;

      if (newAttempts >= 3) {
        lockedUntil = new Date(Date.now() + 5 * 60 * 1000); // Lock for 5 minutes
      }

      await prisma.activationChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: newAttempts,
          lockedUntil
        }
      });

      const remainingAttempts = Math.max(0, 3 - newAttempts);
      if (newAttempts >= 3) {
        return renderOtpError(
          "You have reached the maximum number of attempts. Please request a new activation code.",
          0
        );
      }

      return renderOtpError(
        'The activation code is incorrect or has expired. Please check and try again.',
        remainingAttempts
      );
    }

    // If user is CHEF or ADMIN and MFA is configured, calculate clock drift if mfaCode was supplied
    let detectedDrift = 0;
    if (user.mfaSecret && mfaCode) {
      const totp = createTotpFromUser(user);
      const initResult = verifyInitialToken(totp, mfaCode);
      if (initResult.valid) {
        detectedDrift = initResult.driftSeconds;
      }
    }

    // Correct OTP: set status to ACTIVE, NO auto login
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          mfaDrift: detectedDrift
        }
      }),
      prisma.activationChallenge.update({
        where: { id: challenge.id },
        data: {
          usedAt: new Date(),
          attempts: 0,
          lockedUntil: null
        }
      })
    ]);

    return res.status(200).json({
      ok: true,
      message: 'Account activated successfully! Please sign in.'
    });
  } catch (err) {
    console.error('Activation error:', err.message);
    return renderOtpError('An error occurred during activation. Please try again.');
  }
};

router.post('/api/auth/activation', handleActivation);

// POST /api/auth/activation/resend
const handleActivationResend = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { activationChallenge: true }
    });

    if (!user || !user.activationChallenge) {
      return res.status(200).json({ ok: true, message: 'A new activation code has been sent if the email exists.' });
    }

    const challenge = user.activationChallenge;

    if (challenge.lockedUntil && new Date() < new Date(challenge.lockedUntil)) {
      return res.status(429).json({
        ok: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: "You've failed OTP activation too many times. Please wait 5 minutes before retrying."
        }
      });
    }

    // 1-minute cooldown enforcement
    if (challenge.lastSentAt) {
      const elapsedMs = Date.now() - new Date(challenge.lastSentAt).getTime();
      if (elapsedMs < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        return res.status(400).json({
          ok: false,
          error: {
            code: 'COOLDOWN_ACTIVE',
            message: `Please wait ${remainingSeconds} seconds before requesting a new code.`
          }
        });
      }
    }

    // Generate fresh OTP
    const newOtp = generate6DigitOtp();
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    await prisma.activationChallenge.update({
      where: { id: challenge.id },
      data: {
        otp: newOtp,
        expiresAt,
        attempts: 0,
        lockedUntil: null,
        lastSentAt: new Date()
      }
    });

    await sendActivationOtpEmail(cleanEmail, newOtp);

    return res.status(200).json({ ok: true, message: 'A fresh activation code has been sent to your email.' });
  } catch (err) {
    console.error('Error in resending OTP:', err.message);
    return res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Unable to resend activation code.' } });
  }
};

router.post('/api/auth/activation/resend', handleActivationResend);

// ==========================================
// 3. LOGIN & BRUTE FORCE PROTECTION + MFA
// ==========================================
const handleLogin = async (req, res) => {
  const { identifier, password } = req.body;
  const recaptchaResponse = req.body['g-recaptcha-response'] || req.body.recaptchaToken;
  const cleanId = (identifier || '').trim();

  const vagueErrorMessage = 'Please check your details and try retyping your Email/Username and Password.';

  const renderLoginError = (requiresCaptcha = false, customMessage = null) => {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: customMessage || vagueErrorMessage
      },
      requireCaptcha: requiresCaptcha
    });
  };

  try {
    if (!cleanId || !password) {
      return renderLoginError(false);
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanId },
          { email: cleanId.toLowerCase() }
        ]
      },
      include: {
        chef: true
      }
    });

    if (!user) {
      return renderLoginError(false);
    }

    const now = new Date();

    // Check account lockout (5 failed password attempts -> 3 minutes lockout)
    if (user.lockoutUntil && now < new Date(user.lockoutUntil)) {
      return res.status(429).json({
        ok: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Your account has been temporarily paused due to several unsuccessful attempts. Please wait 3 minutes before retrying.'
        }
      });
    }

    // 5-minute failure window
    let failedAttempts = user.failedLoginAttempts || 0;
    if (user.lastFailedLoginAt) {
      const windowElapsedMs = now.getTime() - new Date(user.lastFailedLoginAt).getTime();
      if (windowElapsedMs > 5 * 60 * 1000) {
        failedAttempts = 0;
      }
    }

    // CAPTCHA required after 3 failed attempts
    const isCaptchaRequired = failedAttempts >= 3;
    if (isCaptchaRequired) {
      const isHuman = await verifyRecaptcha(recaptchaResponse, req.ip);
      if (!isHuman) {
        return renderLoginError(true, 'Please complete the security check to continue.');
      }
    }

    // Verify Password
    const isPasswordValid = await verifyPassword(password, user.salt, user.passwordHash);

    if (!isPasswordValid) {
      const updatedAttempts = failedAttempts + 1;
      let newLockoutUntil = null;

      if (updatedAttempts >= 5) {
        newLockoutUntil = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes lockout
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: updatedAttempts,
          lastFailedLoginAt: now,
          lockoutUntil: newLockoutUntil
        }
      });

      if (updatedAttempts >= 5) {
        return res.status(429).json({
          ok: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Your account has been temporarily paused due to several unsuccessful attempts. Please wait 3 minutes before retrying.'
          }
        });
      }

      return renderLoginError(updatedAttempts >= 3);
    }

    // If account is still pending, prompt activation
    if (user.status === 'PENDING' || user.status === 'pending') {
      return res.status(403).json({
        ok: false,
        requireActivation: true,
        email: user.email,
        error: {
          code: 'ACTIVATION_REQUIRED',
          message: 'Please activate your account before continuing.'
        }
      });
    }

    // Reset failed password attempts on successful password check
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastFailedLoginAt: null
      }
    });

    // ========================================================
    // MFA ENFORCEMENT CHECK
    // Mandatory for CHEF & ADMIN, or if user enabled MFA
    // ========================================================
    const isChefOrAdmin = user.role === 'CHEF' || user.role === 'ADMIN';

    // 1. If CHEF/ADMIN has mfaEnabled === false, require setup
    if (isChefOrAdmin && !user.mfaEnabled) {
      if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
        const remainingMinutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
        return res.status(429).json({
          ok: false,
          error: {
            code: 'MFA_LOCKED',
            message: `Too many unsuccessful verification attempts. Please wait ${remainingMinutes} minute(s) before trying again.`
          }
        });
      }

      const mfaToken = await signMfaSetupJwt(user);
      return res.status(200).json({
        ok: true,
        mfaSetupRequired: true,
        mfaToken,
        message: 'Two-factor authentication setup is required for this account.'
      });
    }

    // 2. If MFA is enabled, require code verification
    if (user.mfaEnabled) {
      // Check if MFA is temporarily locked out
      if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
        const remainingMinutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
        return res.status(429).json({
          ok: false,
          error: {
            code: 'MFA_LOCKED',
            message: `Too many unsuccessful verification attempts. Please wait ${remainingMinutes} minute(s) before trying again.`
          }
        });
      }

      // Generate temporary short-lived MFA pending token
      const mfaToken = await signMfaPendingJwt(user);
      return res.status(200).json({
        ok: true,
        mfaRequired: true,
        mfaToken,
        message: 'Multi-factor authentication required. Please enter your 6-digit code or a recovery code.'
      });
    }

    // No MFA required: issue session JWT
    const jwtToken = await signSessionJwt(user);
    const claims = await verifySessionJwt(jwtToken);

    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    return res.status(200).json({
      ok: true,
      user: sanitizeUser(user),
      csrfToken: generateCsrfToken(claims)
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return renderLoginError(false);
  }
};

router.post('/api/auth/login', handleLogin);

// ==========================================
// 4. MFA VERIFICATION (Login Phase 2)
// ==========================================
router.post('/api/auth/mfa/verify', async (req, res) => {
  const { mfaToken, code, isRecoveryCode } = req.body;

  if (!mfaToken) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Missing verification session. Please sign in again.' }
    });
  }

  const payload = await verifyMfaPendingJwt(mfaToken);
  if (!payload || !payload.userId) {
    return res.status(401).json({
      ok: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your verification session has expired. Please sign in again.' }
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { recoveryCodes: true, chef: true }
  });

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'User not found. Please sign in again.' }
    });
  }

  const now = new Date();

  // Check MFA lockout (3 failed attempts -> 5 minutes lockout)
  if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
    const remainingMinutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
    return res.status(429).json({
      ok: false,
      error: {
        code: 'MFA_LOCKED',
        message: `Too many unsuccessful verification attempts. Please wait ${remainingMinutes} minute(s) before trying again.`
      }
    });
  }

  const cleanCode = (code || '').trim();
  if (!cleanCode) {
    return res.status(400).json({
      ok: false,
      error: { code: 'CODE_REQUIRED', message: 'Please enter your verification code.' }
    });
  }

  // --- PATH A: RECOVERY CODE ---
  if (isRecoveryCode) {
    const matchingRecord = await verifyRecoveryCode(cleanCode, user.recoveryCodes);

    if (!matchingRecord) {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          recoveryCodeAttempts: { increment: 1 }
        },
        select: {
          recoveryCodeAttempts: true
        }
      });

      const attempts = updatedUser.recoveryCodeAttempts;

      if (attempts >= 3) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            mfaLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
            recoveryCodeAttempts: 0
          }
        });

        return res.status(429).json({
          ok: false,
          error: {
            code: 'MFA_LOCKED',
            message: 'You have entered an invalid recovery code 3 times. Please wait 5 minutes before trying again.'
          }
        });
      }

      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_RECOVERY_CODE',
          message: `The recovery code entered is incorrect. You have ${3 - attempts} attempt(s) remaining.`
        }
      });
    }

    // Success with recovery code: mark used and reset counters
    await prisma.$transaction([
      prisma.recoveryCode.update({
        where: { id: matchingRecord.id },
        data: { usedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          recoveryCodeAttempts: 0,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null
        }
      })
    ]);

    // Issue session JWT
    const jwtToken = await signSessionJwt(user);
    const claims = await verifySessionJwt(jwtToken);

    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    return res.status(200).json({
      ok: true,
      user: sanitizeUser(user),
      csrfToken: generateCsrfToken(claims),
      message: 'Verified successfully using recovery code.'
    });
  }

  // --- PATH B: TOTP CODE ---
  if (!user.mfaSecret) {
    return res.status(400).json({
      ok: false,
      error: { code: 'MFA_NOT_CONFIGURED', message: 'Multi-factor authentication is not configured for this account.' }
    });
  }

  const totp = createTotpFromUser(user);
  const matchedStep = verifyTokenWithDrift(totp, cleanCode, user.mfaDrift || 0, user.mfaLastUsedStep);
  // Atomically mark this 30s step as used; a parallel request with the same code loses the race.
  const isValidTotp = matchedStep !== null && await consumeTotpStep(prisma, user.id, matchedStep);

if (!isValidTotp) {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: { increment: 1 }
      },
      select: {
        mfaFailedAttempts: true
      }
    });

    const attempts = updatedUser.mfaFailedAttempts;

    if (attempts >= 3) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
          mfaFailedAttempts: 0
        }
      });

      return res.status(429).json({
        ok: false,
        error: {
          code: 'MFA_LOCKED',
          message: 'You have entered an invalid verification code 3 times. Please wait 5 minutes before trying again.'
        }
      });
    }

    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_TOTP',
        message: `The 6-digit verification code is incorrect. You have ${3 - attempts} attempt(s) remaining.`
      }
    });
  }

  // Reset MFA failed tracking
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaFailedAttempts: 0,
      recoveryCodeAttempts: 0,
      mfaLockedUntil: null
    }
  });

  // Issue session JWT
  const jwtToken = await signSessionJwt(user);
  const claims = await verifySessionJwt(jwtToken);

  res.cookie('auth_token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000
  });

  return res.status(200).json({
    ok: true,
    user: sanitizeUser(user),
    csrfToken: generateCsrfToken(claims),
    message: 'Signed in successfully.'
  });
});

// ==========================================
// 4b. PENDING MFA SETUP (For newly upgraded/logged-in Chef or Admin)
// ==========================================

// POST /api/auth/mfa/setup-pending - Generate QR code and secret using temporary mfa_setup token
router.post('/api/auth/mfa/setup-pending', async (req, res) => {
  const { mfaToken } = req.body;
  if (!mfaToken) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Missing setup token. Please sign in again.' }
    });
  }

  const payload = await verifyMfaSetupJwt(mfaToken);
  if (!payload || !payload.userId) {
    return res.status(401).json({
      ok: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your setup session has expired. Please sign in again.' }
    });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'User not found. Please sign in again.' }
    });
  }

  if (user.mfaEnabled) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'MFA_ALREADY_ENABLED',
        message: 'Multi-factor authentication is already set up for this account. Please sign in normally.'
      }
    });
  }

  const now = new Date();
  if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
    const remainingMinutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
    return res.status(429).json({
      ok: false,
      error: {
        code: 'MFA_LOCKED',
        message: `Too many unsuccessful verification attempts. Please wait ${remainingMinutes} minute(s) before trying again.`
      }
    });
  }

  const secret = generateMfaSecret();
  const totp = createTotpInstance(secret, user.email);
  const qrCodeDataUrl = await generateQrCodeDataUrl(totp);

  return res.status(200).json({
    ok: true,
    secret,
    qrCode: qrCodeDataUrl
  });
});

// POST /api/auth/mfa/confirm-pending - Confirm setup, issue 10 recovery codes and session cookie
router.post('/api/auth/mfa/confirm-pending', async (req, res) => {
  const { mfaToken, secret, code } = req.body;
  if (!mfaToken || !secret || !code) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'mfaToken, secret, and verification code are required.' }
    });
  }

  const payload = await verifyMfaSetupJwt(mfaToken);
  if (!payload || !payload.userId) {
    return res.status(401).json({
      ok: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your setup session has expired. Please sign in again.' }
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { chef: true }
  });
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'User not found. Please sign in again.' }
    });
  }

  if (user.mfaEnabled) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'MFA_ALREADY_ENABLED',
        message: 'Multi-factor authentication is already set up for this account. Please sign in normally.'
      }
    });
  }

  const now = new Date();
  if (user.mfaLockedUntil && now < new Date(user.mfaLockedUntil)) {
    const remainingMinutes = Math.max(1, Math.ceil((new Date(user.mfaLockedUntil).getTime() - now.getTime()) / 60000));
    return res.status(429).json({
      ok: false,
      error: {
        code: 'MFA_LOCKED',
        message: `Too many unsuccessful verification attempts. Please wait ${remainingMinutes} minute(s) before trying again.`
      }
    });
  }

  const cleanCode = (code || '').trim();
  const totp = createTotpInstance(secret, user.email);
  const initResult = verifyInitialToken(totp, cleanCode);

  if (!initResult.valid) {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: { increment: 1 }
      },
      select: {
        mfaFailedAttempts: true
      }
    });

    const attempts = updatedUser.mfaFailedAttempts;

    if (attempts >= 3) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
          mfaFailedAttempts: 0
        }
      });

      return res.status(429).json({
        ok: false,
        error: {
          code: 'MFA_LOCKED',
          message: 'You have entered an invalid verification code 3 times. Please wait 5 minutes before trying again.'
        }
      });
    }

    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_CODE',
        message: `The verification code entered does not match. You have ${3 - attempts} attempt(s) remaining.`
      }
    });
  }

  // Code is valid: generate 10 recovery codes
  const plainCodes = generateRecoveryCodes(10);
  const hashedCodes = await hashRecoveryCodes(plainCodes);

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.recoveryCode.createMany({
      data: hashedCodes.map(codeHash => ({ userId: user.id, codeHash }))
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: encryptSecret(secret),
        mfaEnabled: true,
        mfaDrift: initResult.driftSeconds,
        mfaLastUsedStep: initResult.step,
        mfaFailedAttempts: 0,
        recoveryCodeAttempts: 0,
        mfaLockedUntil: null
      }
    })
  ]);

  const activeUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { chef: true }
  });

  const jwtToken = await signSessionJwt(activeUser);
  const claims = await verifySessionJwt(jwtToken);

  res.cookie('auth_token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000
  });

  return res.status(200).json({
    ok: true,
    user: sanitizeUser(activeUser),
    csrfToken: generateCsrfToken(claims),
    recoveryCodes: plainCodes,
    message: 'Multi-factor authentication successfully enabled. Please store your recovery codes securely.'
  });
});

// ==========================================
// 5. VIEWER MFA TOGGLE (Turn On / Off)
// ==========================================

// POST /api/auth/mfa/setup - Start MFA setup for logged in VIEWER
router.post('/api/auth/mfa/setup', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
  }

  const secret = generateMfaSecret();
  const totp = createTotpInstance(secret, user.email);
  const qrCodeDataUrl = await generateQrCodeDataUrl(totp);

  return res.status(200).json({
    ok: true,
    secret,
    qrCode: qrCodeDataUrl
  });
});

// POST /api/auth/mfa/confirm - Verify code, calculate clock drift, save secret and issue 10 recovery codes
router.post('/api/auth/mfa/confirm', requireAuth, async (req, res) => {
  const { secret, code } = req.body;
  if (!secret || !code) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Secret and verification code are required.' }
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
  }

  // 409 if MFA is already enabled
  if (user.mfaEnabled) {
    return res.status(409).json({
      ok: false,
      error: {
        code: 'MFA_ALREADY_ENABLED',
        message: 'Multi-factor authentication is already enabled for this account.'
      }
    });
  }

  const totp = createTotpInstance(secret, user.email);
  const initResult = verifyInitialToken(totp, code);

  if (!initResult.valid) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_CODE', message: 'The verification code entered does not match. Please verify your authenticator app.' }
    });
  }

  // Generate 10 recovery codes
  const plainCodes = generateRecoveryCodes(10);
  const hashedCodes = await hashRecoveryCodes(plainCodes);

  // Update user in transaction: remove any existing recovery codes, save new secret & drift
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.recoveryCode.createMany({
      data: hashedCodes.map(codeHash => ({ userId: user.id, codeHash }))
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: encryptSecret(secret),
        mfaEnabled: true,
        mfaDrift: initResult.driftSeconds,
        mfaLastUsedStep: initResult.step,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null
      }
    })
  ]);

  return res.status(200).json({
    ok: true,
    recoveryCodes: plainCodes,
    message: 'Multi-factor authentication successfully enabled! Please copy and securely store your 10 recovery codes.'
  });
});

// POST /api/auth/mfa/disable - Disable MFA for logged in VIEWER (requires password + TOTP or recovery code)
router.post('/api/auth/mfa/disable', requireAuth, async (req, res) => {
  const { password, code, isRecoveryCode } = req.body;
  if (!password || !code) {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Password and a verification code or recovery code are required to disable multi-factor authentication.' }
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { recoveryCodes: true }
  });

  if (!user) {
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } });
  }

  // Only VIEWERS can disable MFA. Chefs and Admins must maintain it enabled.
  if (user.role === 'CHEF' || user.role === 'ADMIN') {
    return res.status(403).json({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Chefs and Administrators must maintain multi-factor authentication enabled for account security.'
      }
    });
  }

  // 1. Verify password
  const isPasswordValid = await verifyPassword(password, user.salt, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_PASSWORD', message: 'The password entered is incorrect.' }
    });
  }

  // 2. Verify TOTP or recovery code
  const cleanCode = (code || '').trim();
  let codeVerified = false;

  if (isRecoveryCode || cleanCode.includes('-')) {
    const matchingRecord = await verifyRecoveryCode(cleanCode, user.recoveryCodes);
    if (matchingRecord) {
      codeVerified = true;
      await prisma.recoveryCode.update({
        where: { id: matchingRecord.id },
        data: { usedAt: new Date() }
      });
    }
  }

  if (!codeVerified && user.mfaSecret) {
    const totp = createTotpFromUser(user);
    const matchedStep = verifyTokenWithDrift(totp, cleanCode, user.mfaDrift || 0, user.mfaLastUsedStep);
    if (matchedStep !== null && await consumeTotpStep(prisma, user.id, matchedStep)) {
      codeVerified = true;
    }
  }

  if (!codeVerified) {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_CODE', message: 'The verification code or recovery code entered is incorrect.' }
    });
  }

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: null,
        mfaLastUsedStep: null,
        mfaEnabled: false,
        mfaDrift: 0,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
        recoveryCodeAttempts: 0
      }
    })
  ]);

  return res.status(200).json({
    ok: true,
    message: 'Multi-factor authentication has been disabled for your account.'
  });
});

// ==========================================
// 6. LOGOUT
// ==========================================
router.post('/api/auth/logout', async (req, res) => {
  res.clearCookie('auth_token');
  return res.status(200).json({ ok: true, message: 'Logged out successfully.' });
});

// ==========================================
// 7. FORGET PASSWORD (does NOT disable MFA!)
// ==========================================
router.post('/api/auth/forget', async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  const successMessage =
    'If your email is registered with us, we have sent instructions to reset your password. Please check your inbox.';

  try {
    if (!cleanEmail) {
      return res.status(400).json({ ok: false, error: { code: 'EMAIL_REQUIRED', message: 'Please enter your Gmail address.' } });
    }

    // Rate limit of 2 minutes
    const lastRequestTime = forgetRateLimitMap.get(cleanEmail);
    const now = Date.now();
    if (lastRequestTime && now - lastRequestTime < 2 * 60 * 1000) {
      const waitSeconds = Math.ceil((2 * 60 * 1000 - (now - lastRequestTime)) / 1000);
      return res.status(429).json({
        ok: false,
        error: { code: 'RATE_LIMITED', message: `Please wait ${waitSeconds} seconds before submitting another password reset request.` }
      });
    }
    forgetRateLimitMap.set(cleanEmail, now);

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (user) {
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await prisma.passwordChallenge.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt
        }
      });

      const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const resetUrl = `${clientOrigin}/reset?token=${encodeURIComponent(rawToken)}`;

      await sendPasswordResetEmail(cleanEmail, resetUrl);
    }

    return res.status(200).json({ ok: true, message: successMessage });
  } catch (err) {
    console.error('Forget password error:', err.message);
    return res.status(200).json({ ok: true, message: successMessage });
  }
});

// ==========================================
// 8. RESET PASSWORD (MFA remains intact!)
// ==========================================
router.post('/api/auth/reset', async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  const renderResetError = (message) => {
    return res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION_FAILED', message }
    });
  };

  try {
    if (!token) {
      return renderResetError('Missing password reset token.');
    }

    const tokenHash = hashResetToken(token);
    const challenge = await prisma.passwordChallenge.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!challenge || !challenge.user) {
      return renderResetError('This password reset token has expired or is invalid. Please request a new one.');
    }

    if (!validatePasswordComplexity(password)) {
      return renderResetError(
        'Password must be at least 8 characters and include at least 1 uppercase letter, 1 number, and 1 special symbol (!, @, #, $, %, ^, &, *, <, >, .).'
      );
    }

    if (password !== confirmPassword) {
      return renderResetError('Passwords do not match. Please retype them carefully.');
    }

    const newSalt = generate5DigitSalt();
    const newPasswordHash = await hashPassword(password, newSalt);

    // Updates password, but PRESERVES MFA settings and recovery codes
    await prisma.$transaction([
      prisma.user.update({
        where: { id: challenge.userId },
        data: {
          passwordHash: newPasswordHash,
          salt: newSalt,
          failedLoginAttempts: 0,
          lockoutUntil: null
        }
      }),
      prisma.passwordChallenge.update({
        where: { id: challenge.id },
        data: {
          usedAt: new Date()
        }
      })
    ]);

    return res.status(200).json({
      ok: true,
      message: 'Password updated successfully! Please sign in with your new password.'
    });
  } catch (err) {
    console.error('Reset POST error:', err.message);
    return renderResetError('An error occurred while resetting your password. Please try again.');
  }
});

router.sanitizeUser = sanitizeUser;
module.exports = router;
