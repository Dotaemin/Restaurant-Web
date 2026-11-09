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
  verifySessionJwt,
  generateCsrfToken
} = require('../lib/security');
const { sendActivationOtpEmail, sendPasswordResetEmail } = require('../lib/mailer');
const { requireGuest } = require('../lib/authMiddleware');

// In-memory rate limiting map for POST /forget (2 minutes cooldown per target)
const forgetRateLimitMap = new Map();

// Helper to sanitize user object for safety
function sanitizeUser(user) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.passwordHash;
  delete safe.salt;
  return safe;
}

// Helper to determine if incoming request expects JSON response
function isJsonRequest(req) {
  return true;
}

// GET /api/auth/me - Returns current logged in user (or null)
router.get('/api/auth/me', (req, res) => {
  return res.json({
    ok: true,
    user: req.user ? sanitizeUser(req.user) : null,
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



// POST /register and POST /api/auth/register
const handleRegister = async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  const recaptchaResponse = req.body['g-recaptcha-response'] || req.body.recaptchaToken;
  const formData = { username: username || '', email: email || '' };

  const renderValidationError = (message) => {
    if (isJsonRequest(req)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message
        }
      });
    }
    return res.status(400).render('auth/register', {
      title: 'Register - B.H.T Diner',
      error: 'VALIDATION_FAILED',
      errorMessage: message,
      formData,
      recaptchaSiteKey: RECAPTCHA_SITE_KEY
    });
  };

  try {
    // 1. Verify Google reCAPTCHA at server BEFORE hashing password, creating account, or sending OTP
    const isHuman = await verifyRecaptcha(recaptchaResponse, req.ip);
    if (!isHuman) {
      return renderValidationError('Please verify that you are not a robot before proceeding.');
    }

    // 2. Validate Username
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return renderValidationError('Username must be at least 3 characters in length.');
    }
    const cleanUsername = username.trim();

    // 3. Validate Email (must end with @gmail.com)
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

    // 8. Create user in database (status: "pending", role: "Viewer")
    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        salt,
        role: 'Viewer',
        status: 'pending'
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

    // 10. Send OTP through Google Gmail SMTP using Nodemailer
    await sendActivationOtpEmail(cleanEmail, otp);

    if (isJsonRequest(req)) {
      return res.status(200).json({
        ok: true,
        message: 'Account created. Please activate with the OTP code sent to your email.',
        email: cleanEmail
      });
    }

    return res.redirect(`/activation?email=${encodeURIComponent(cleanEmail)}&msg=otp_sent`);
  } catch (err) {
    console.error('Registration processing error:', err.message);
    return renderValidationError('An unexpected problem occurred while creating your account. Please try again.');
  }
};

router.post('/register', requireGuest, handleRegister);
router.post('/api/auth/register', handleRegister);

// ==========================================
// 2. ACTIVATION
// ==========================================



// POST /activation and POST /api/auth/activation
const handleActivation = async (req, res) => {
  const { email, otp } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanOtp = (otp || '').trim();

  const renderOtpError = (message, remainingAttempts = 3) => {
    if (isJsonRequest(req)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ACTIVATION_FAILED',
          message,
          remainingAttempts
        }
      });
    }
    return res.status(400).render('auth/activation', {
      title: 'Account Activation - B.H.T Diner',
      email: cleanEmail,
      error: 'activation_failed',
      errorMessage: message,
      msg: null,
      remainingAttempts
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
      if (isJsonRequest(req)) {
        return res.status(429).json({
          ok: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: "You've failed OTP activation too many times. Please wait 5 minutes before retrying."
          }
        });
      }
      return res.status(429).render('errors/429', {
        title: 'Too Many Attempts',
        message: "You've failed OTP activation too many times. Please wait 5 minutes before retrying."
      });
    }

    // Check expiration (2 minutes)
    const isExpired = new Date() > new Date(challenge.expiresAt);
    const isCorrect = challenge.otp === cleanOtp;

    if (isExpired || !isCorrect) {
      const newAttempts = (challenge.attempts || 0) + 1;
      let lockedUntil = challenge.lockedUntil;

      // Limit OTP input: 3 times
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

    // Correct OTP: set status to active, NO auto login
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'active',
          emailVerifiedAt: new Date()
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

    if (isJsonRequest(req)) {
      return res.status(200).json({
        ok: true,
        message: 'Account activated successfully! Please sign in.'
      });
    }

    return res.redirect('/login?msg=activated');
  } catch (err) {
    console.error('Activation error:', err.message);
    return renderOtpError('An error occurred during activation. Please try again.');
  }
};

router.post('/activation', handleActivation);
router.post('/api/auth/activation', handleActivation);

// POST /activation/resend and POST /api/auth/activation/resend
const handleActivationResend = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { activationChallenge: true }
    });

    if (!user || !user.activationChallenge) {
      if (isJsonRequest(req)) {
        return res.status(200).json({ ok: true, message: 'A new activation code has been sent if the email exists.' });
      }
      return res.redirect(`/activation?email=${encodeURIComponent(cleanEmail)}&msg=code_resent`);
    }

    const challenge = user.activationChallenge;

    if (challenge.lockedUntil && new Date() < new Date(challenge.lockedUntil)) {
      const lockMsg = "You've failed OTP activation too many times. Please wait 5 minutes before retrying.";
      if (isJsonRequest(req)) {
        return res.status(429).json({ ok: false, error: { code: 'TOO_MANY_ATTEMPTS', message: lockMsg } });
      }
      return res.status(429).render('errors/429', { title: 'Too Many Attempts', message: lockMsg });
    }

    // 1-minute cooldown enforcement
    if (challenge.lastSentAt) {
      const elapsedMs = Date.now() - new Date(challenge.lastSentAt).getTime();
      if (elapsedMs < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        const cooldownMsg = `Please wait ${remainingSeconds} seconds before requesting a new code.`;
        if (isJsonRequest(req)) {
          return res.status(400).json({ ok: false, error: { code: 'COOLDOWN_ACTIVE', message: cooldownMsg } });
        }
        return res.status(400).render('auth/activation', {
          title: 'Account Activation - B.H.T Diner',
          email: cleanEmail,
          error: 'cooldown_active',
          errorMessage: cooldownMsg,
          msg: null,
          remainingAttempts: Math.max(0, 3 - (challenge.attempts || 0))
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

    if (isJsonRequest(req)) {
      return res.status(200).json({ ok: true, message: 'A fresh activation code has been sent to your email.' });
    }

    return res.redirect(`/activation?email=${encodeURIComponent(cleanEmail)}&msg=code_resent`);
  } catch (err) {
    console.error('Error in resending OTP:', err.message);
    if (isJsonRequest(req)) {
      return res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: 'Unable to resend activation code.' } });
    }
    return res.redirect(`/activation?email=${encodeURIComponent(cleanEmail)}&error=resend_failed`);
  }
};

router.post('/activation/resend', handleActivationResend);
router.post('/api/auth/activation/resend', handleActivationResend);

// ==========================================
// 3. LOGIN & BRUTE FORCE PROTECTION
// ==========================================



// POST /login and POST /api/auth/login
const handleLogin = async (req, res) => {
  const { identifier, password } = req.body;
  const recaptchaResponse = req.body['g-recaptcha-response'] || req.body.recaptchaToken;
  const cleanId = (identifier || '').trim();

  const vagueErrorMessage = 'Please check your details and try retyping your Email/Username and Password.';

  const renderLoginError = (requiresCaptcha = false, customMessage = null) => {
    if (isJsonRequest(req)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: customMessage || vagueErrorMessage
        },
        requireCaptcha: requiresCaptcha
      });
    }
    return res.status(400).render('auth/login', {
      title: 'Sign In - B.H.T Diner',
      error: 'invalid_credentials',
      errorMessage: customMessage || vagueErrorMessage,
      msg: null,
      requireCaptcha: requiresCaptcha,
      recaptchaSiteKey: RECAPTCHA_SITE_KEY
    });
  };

  try {
    if (!cleanId || !password) {
      return renderLoginError(false);
    }

    // Look up target account by Username OR Email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanId },
          { email: cleanId.toLowerCase() }
        ]
      }
    });

    if (!user) {
      return renderLoginError(false);
    }

    const now = new Date();

    // Check account lockout (5 failed attempts -> 3 minutes lockout)
    if (user.lockoutUntil && now < new Date(user.lockoutUntil)) {
      const lockMsg = 'Your account has been temporarily paused due to several unsuccessful attempts. Please wait 3 minutes before retrying.';
      if (isJsonRequest(req)) {
        return res.status(429).json({ ok: false, error: { code: 'ACCOUNT_LOCKED', message: lockMsg } });
      }
      return res.status(429).render('errors/429', {
        title: 'Account Temporarily Locked',
        message: lockMsg
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
        const lockMsg = 'Your account has been temporarily paused due to several unsuccessful attempts. Please wait 3 minutes before retrying.';
        if (isJsonRequest(req)) {
          return res.status(429).json({ ok: false, error: { code: 'ACCOUNT_LOCKED', message: lockMsg } });
        }
        return res.status(429).render('errors/429', {
          title: 'Account Temporarily Locked',
          message: lockMsg
        });
      }

      return renderLoginError(updatedAttempts >= 3);
    }

    // If account is still pending, prompt activation
    if (user.status === 'pending') {
      if (isJsonRequest(req)) {
        return res.status(403).json({
          ok: false,
          error: {
            code: 'ACTIVATION_REQUIRED',
            message: 'Please activate your account before logging in.'
          },
          email: user.email
        });
      }
      return res.redirect(`/activation?email=${encodeURIComponent(user.email)}&msg=activation_required`);
    }

    // Reset failed login tracking on success
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastFailedLoginAt: null
      }
    });

    const jwtToken = await signSessionJwt(user);
    const claims = await verifySessionJwt(jwtToken);  
  
    // Set cookie
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000
    });

    if (isJsonRequest(req)) {
      return res.status(200).json({
        ok: true,
        user: sanitizeUser(user),
        csrfToken: generateCsrfToken(claims)
      });
    }

    // "POST /login: Send code 303 and redirect when successfully logged in."
    return res.redirect(303, '/dishes');
  } catch (err) {
    console.error('Login error:', err.message);
    return renderLoginError(false);
  }
};

router.post('/login', requireGuest, handleLogin);
router.post('/api/auth/login', handleLogin);

// ==========================================
// 4. LOGOUT
// ==========================================

const handleLogout = async (req, res) => {
  // Stateless: nothing to delete server-side, just clear the cookie.
  res.clearCookie('auth_token');

  if (isJsonRequest(req)) {
    return res.status(200).json({ ok: true, message: 'Logged out successfully.' });
  }
  return res.redirect('/login?msg=logged_out');
};

router.post('/logout', handleLogout);
router.post('/api/auth/logout', handleLogout);

// ==========================================
// 5. FORGET PASSWORD & RESET TOKEN
// ==========================================



// POST /forget and POST /api/auth/forget
const handleForget = async (req, res) => {
  const { email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  const successMessage =
    'If your email is registered with us, we have sent instructions to reset your password. Please check your inbox.';

  try {
    if (!cleanEmail) {
      if (isJsonRequest(req)) {
        return res.status(400).json({ ok: false, error: { code: 'EMAIL_REQUIRED', message: 'Please enter your Gmail address.' } });
      }
      return res.status(400).render('auth/forget', {
        title: 'Forget Password - B.H.T Diner',
        error: 'email_required',
        errorMessage: 'Please enter your Gmail address.',
        msg: null
      });
    }

    // Rate limit of 2 minutes
    const lastRequestTime = forgetRateLimitMap.get(cleanEmail);
    const now = Date.now();
    if (lastRequestTime && now - lastRequestTime < 2 * 60 * 1000) {
      const waitSeconds = Math.ceil((2 * 60 * 1000 - (now - lastRequestTime)) / 1000);
      const rateLimitMsg = `Please wait ${waitSeconds} seconds before submitting another password reset request.`;
      if (isJsonRequest(req)) {
        return res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: rateLimitMsg } });
      }
      return res.status(429).render('auth/forget', {
        title: 'Forget Password - B.H.T Diner',
        error: 'rate_limited',
        errorMessage: rateLimitMsg,
        msg: null
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

      // Target reset URL pointing to port 5173 if requested from frontend client, or host
      const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
      const resetUrl = `${clientOrigin}/reset?token=${encodeURIComponent(rawToken)}`;

      await sendPasswordResetEmail(cleanEmail, resetUrl);
    }

    if (isJsonRequest(req)) {
      return res.status(200).json({ ok: true, message: successMessage });
    }

    return res.render('auth/forget', {
      title: 'Forget Password - B.H.T Diner',
      error: null,
      msg: 'reset_dispatched',
      errorMessage: null,
      infoNotice: successMessage
    });
  } catch (err) {
    console.error('Forget password error:', err.message);
    if (isJsonRequest(req)) {
      return res.status(200).json({ ok: true, message: successMessage });
    }
    return res.render('auth/forget', {
      title: 'Forget Password - B.H.T Diner',
      error: null,
      msg: 'reset_dispatched',
      errorMessage: null,
      infoNotice: successMessage
    });
  }
};

router.post('/forget', handleForget);
router.post('/api/auth/forget', handleForget);



// POST /reset and POST /api/auth/reset
const handleReset = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  const renderResetError = (message) => {
    if (isJsonRequest(req)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message }
      });
    }
    return res.status(400).render('auth/reset', {
      title: 'Set New Password - B.H.T Diner',
      token,
      error: 'validation_failed',
      errorMessage: message
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

    // Keep old password until process is complete!
    const newSalt = generate5DigitSalt();
    const newPasswordHash = await hashPassword(password, newSalt);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: challenge.userId },
        data: {
          passwordHash: newPasswordHash,
          salt: newSalt
        }
      }),
      prisma.passwordChallenge.update({
        where: { id: challenge.id },
        data: {
          usedAt: new Date()
        }
      })
    ]);

    if (isJsonRequest(req)) {
      return res.status(200).json({
        ok: true,
        message: 'Password updated successfully! Please sign in with your new password.'
      });
    }

    return res.redirect('/login?msg=password_reset_success');
  } catch (err) {
    console.error('Reset POST error:', err.message);
    return renderResetError('An error occurred while resetting your password. Please try again.');
  }
};

router.post('/reset', handleReset);
router.post('/api/auth/reset', handleReset);

module.exports = router;
