const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const security = require('../lib/security');
const recaptcha = require('../lib/recaptcha');
const rateLimit = require('../lib/rateLimit');
const emailService = require('../lib/email');

// ==========================================
// 1. REGISTRATION
// ==========================================

// GET /register
router.get('/register', (req, res) => {
  return res.render('auth/register', {
    title: 'Register Account',
    recaptchaSiteKey: recaptcha.getSiteKey(),
    error: null,
    old: {}
  });
});

// POST /register
router.post('/register', async (req, res) => {
  const { username, email, password, 'g-recaptcha-response': captchaToken } = req.body;
  const clientIp = rateLimit.getClientIp(req);
  const old = { username: username || '', email: email || '' };

  // 1. Verify CAPTCHA at the server before hashing or creating user
  const captchaResult = await recaptcha.verifyRecaptcha(captchaToken, clientIp);
  if (!captchaResult.success) {
    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: ' + (captchaResult.message || 'CAPTCHA verification failed.'),
      old
    });
  }

  // 2. Validate Username
  const cleanUsername = (username || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanUsername) {
    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: Username cannot be blank.',
      old
    });
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username: cleanUsername }
  });
  if (existingUsername) {
    if (existingUsername.status === 'pending' && existingUsername.email === cleanEmail) {
      // User retry while pending: send fresh OTP and redirect to activation
      const newOtp = security.generateOtp();
      const newOtpHash = security.hashOtp(newOtp);
      await prisma.activationChallenge.upsert({
        where: { userId: existingUsername.id },
        update: {
          otpHash: newOtpHash,
          expiresAt: new Date(Date.now() + 2 * 60 * 1000),
          attempts: 0,
          lastSentAt: new Date()
        },
        create: {
          userId: existingUsername.id,
          purpose: 'account_activation',
          otpHash: newOtpHash,
          expiresAt: new Date(Date.now() + 2 * 60 * 1000),
          attempts: 0,
          lastSentAt: new Date()
        }
      });
      await emailService.sendActivationOtp(cleanEmail, newOtp);
      return res.redirect(303, `/activation?email=${encodeURIComponent(cleanEmail)}&pending=true`);
    }

    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: Username is already taken.',
      old
    });
  }

  // 3. Validate Email
  if (!cleanEmail || !cleanEmail.endsWith('@gmail.com')) {
    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: Email must end with @gmail.com.',
      old
    });
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: cleanEmail }
  });
  if (existingEmail) {
    if (existingEmail.status === 'pending') {
      // User retry with pending email: send fresh OTP and redirect to activation
      const newOtp = security.generateOtp();
      const newOtpHash = security.hashOtp(newOtp);
      await prisma.activationChallenge.upsert({
        where: { userId: existingEmail.id },
        update: {
          otpHash: newOtpHash,
          expiresAt: new Date(Date.now() + 2 * 60 * 1000),
          attempts: 0,
          lastSentAt: new Date()
        },
        create: {
          userId: existingEmail.id,
          purpose: 'account_activation',
          otpHash: newOtpHash,
          expiresAt: new Date(Date.now() + 2 * 60 * 1000),
          attempts: 0,
          lastSentAt: new Date()
        }
      });
      await emailService.sendActivationOtp(cleanEmail, newOtp);
      return res.redirect(303, `/activation?email=${encodeURIComponent(cleanEmail)}&pending=true`);
    }

    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: Email is already registered.',
      old
    });
  }

  // 4. Validate Password Complexity
  const pwdValidation = security.validatePasswordComplexity(password);
  if (!pwdValidation.valid) {
    return res.status(400).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: ' + pwdValidation.message,
      old
    });
  }

  try {
    // 5. Generate Salt & Hash Password
    const salt = security.generateSalt();
    const passwordHash = await security.hashPassword(password, salt);

    // 6. Create User in "pending" status, role "Viewer"
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        email: cleanEmail,
        passwordHash,
        salt,
        role: 'Viewer',
        status: 'pending',
        emailVerifiedAt: null
      }
    });

    // 7. Generate 6-digit OTP & Create ActivationChallenge
    const otp = security.generateOtp();
    const otpHash = security.hashOtp(otp);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    await prisma.activationChallenge.create({
      data: {
        userId: user.id,
        purpose: 'account_activation',
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date()
      }
    });

    // 8. Dispatch OTP via Email
    await emailService.sendActivationOtp(cleanEmail, otp);

    // 9. Redirect 303 to Activation view
    return res.redirect(303, `/activation?email=${encodeURIComponent(cleanEmail)}`);
  } catch (err) {
    console.error('Registration server error:', err.message);
    return res.status(500).render('auth/register', {
      title: 'Register Account',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      error: 'VALIDATION_FAILED: Không thể tạo tài khoản vào lúc này. Vui lòng thử lại sau.',
      old
    });
  }
});

// ==========================================
// 2. ACTIVATION
// ==========================================

// GET /activation
router.get('/activation', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  let error = null;
  if (req.query.pending) {
    error = 'Tài khoản của bạn chưa được kích hoạt. Mã OTP xác thực đã được gửi đến email của bạn. Vui lòng nhập mã để kích hoạt tài khoản.';
  }
  return res.render('auth/activation', {
    title: 'Activate Account',
    email,
    error,
    info: req.query.resent ? 'Mã OTP mới đã được gửi đến email của bạn.' : null,
    canResend: false
  });
});

// POST /activation
router.post('/activation', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const otp = (req.body.otp || '').trim();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { activationChallenge: true }
  });

  if (!user || !user.activationChallenge) {
    return res.status(400).render('auth/activation', {
      title: 'Activate Account',
      email,
      error: 'Mã OTP không chính xác hoặc đã hết hạn. Vui lòng kiểm tra lại.',
      info: null,
      canResend: true
    });
  }

  if (user.status === 'active') {
    return res.redirect(303, '/login?activated=true');
  }

  const challenge = user.activationChallenge;

  // Limit OTP input: 3 times
  if (challenge.attempts >= 3) {
    return res.status(400).render('auth/activation', {
      title: 'Activate Account',
      email,
      error: 'Bạn đã nhập sai quá số lần quy định (3 lần). Vui lòng nhấn "Gửi lại mã OTP" để nhận mã mới.',
      info: null,
      canResend: true
    });
  }

  const isExpired = new Date() > new Date(challenge.expiresAt);
  const isMatch = security.verifyOtp(otp, challenge.otpHash);

  // If wrong or expired, increment attempt and return identical error message
  if (isExpired || !isMatch) {
    const nextAttempts = challenge.attempts + 1;
    await prisma.activationChallenge.update({
      where: { id: challenge.id },
      data: { attempts: nextAttempts }
    });

    const isLockedNow = nextAttempts >= 3;
    return res.status(400).render('auth/activation', {
      title: 'Activate Account',
      email,
      error: isLockedNow
        ? 'Bạn đã nhập sai quá số lần quy định (3 lần). Vui lòng nhấn "Gửi lại mã OTP" để nhận mã mới.'
        : 'Mã OTP không chính xác hoặc đã hết hạn. Vui lòng kiểm tra lại.',
      info: null,
      canResend: isLockedNow || isExpired
    });
  }

  // OTP is correct! Elevate to Admin, set active status, record verification
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'active',
        role: 'Admin',
        emailVerifiedAt: new Date()
      }
    }),
    prisma.activationChallenge.update({
      where: { id: challenge.id },
      data: {
        usedAt: new Date()
      }
    })
  ]);

  // NO auto login => redirect to /login
  return res.redirect(303, '/login?activated=true');
});

// POST /activation/resend
router.post('/activation/resend', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { activationChallenge: true }
  });

  if (!user || !user.activationChallenge || user.status === 'active') {
    return res.redirect(303, '/login');
  }

  const challenge = user.activationChallenge;

  // 1 minute cooldown check
  if (challenge.lastSentAt) {
    const elapsedMs = Date.now() - new Date(challenge.lastSentAt).getTime();
    if (elapsedMs < 60 * 1000) {
      return res.status(429).render('errors/429', {
        title: '429 - Too Many Requests',
        cause: `Vui lòng chờ ít nhất 1 phút trước khi yêu cầu gửi lại mã OTP (còn ${Math.ceil((60000 - elapsedMs) / 1000)} giây).`,
        backUrl: `/activation?email=${encodeURIComponent(email)}`
      });
    }
  }

  // Generate new OTP & refresh challenge
  const newOtp = security.generateOtp();
  const newOtpHash = security.hashOtp(newOtp);

  await prisma.activationChallenge.update({
    where: { id: challenge.id },
    data: {
      otpHash: newOtpHash,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      attempts: 0,
      lastSentAt: new Date()
    }
  });

  await emailService.sendActivationOtp(email, newOtp);

  return res.redirect(303, `/activation?email=${encodeURIComponent(email)}&resent=true`);
});

// ==========================================
// 3. LOGIN & LOGOUT
// ==========================================

// GET /login
router.get('/login', (req, res) => {
  const clientIp = rateLimit.getClientIp(req);
  const status = rateLimit.getLoginStatus(clientIp);

  if (status.locked) {
    return res.status(429).render('errors/429', {
      title: '429 - Account Locked',
      cause: 'Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 5 phút.',
      backUrl: '/dishes'
    });
  }

  return res.render('auth/login', {
    title: 'Log In',
    recaptchaSiteKey: recaptcha.getSiteKey(),
    captchaRequired: status.captchaRequired,
    error: null,
    info: req.query.activated
      ? 'Kích hoạt tài khoản thành công! Vui lòng đăng nhập.'
      : req.query.resetSuccess
      ? 'Đổi mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.'
      : null,
    old: {}
  });
});

// POST /login
router.post('/login', async (req, res) => {
  const { identifier, password, 'g-recaptcha-response': captchaToken } = req.body;
  const clientIp = rateLimit.getClientIp(req);
  const status = rateLimit.getLoginStatus(clientIp);

  // 1. Lockout check (5 failed attempts within 5 minutes)
  if (status.locked) {
    return res.status(429).render('errors/429', {
      title: '429 - Account Locked',
      cause: 'Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 5 phút.',
      backUrl: '/dishes'
    });
  }

  // 2. CAPTCHA verification if >= 3 failed attempts
  if (status.captchaRequired) {
    const captchaResult = await recaptcha.verifyRecaptcha(captchaToken, clientIp);
    if (!captchaResult.success) {
      rateLimit.recordLoginFailure(clientIp);
      return res.status(400).render('auth/login', {
        title: 'Log In',
        recaptchaSiteKey: recaptcha.getSiteKey(),
        captchaRequired: true,
        error: captchaResult.message || 'Xác minh CAPTCHA không thành công.',
        info: null,
        old: { identifier }
      });
    }
  }

  const cleanIdentifier = (identifier || '').trim();
  const cleanPassword = password || '';

  // Generic error to prevent enumeration/timing leak
  const genericError = 'Vui lòng kiểm tra lại và nhập lại Email và Mật khẩu.';

  // 3. Find user by Username OR Email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: cleanIdentifier },
        { email: cleanIdentifier.toLowerCase() }
      ]
    }
  });

  if (!user) {
    const updatedStatus = rateLimit.recordLoginFailure(clientIp);
    if (updatedStatus.locked) {
      return res.status(429).render('errors/429', {
        title: '429 - Account Locked',
        cause: 'Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 5 phút.',
        backUrl: '/dishes'
      });
    }
    return res.status(401).render('auth/login', {
      title: 'Log In',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      captchaRequired: updatedStatus.captchaRequired,
      error: genericError,
      info: null,
      old: { identifier }
    });
  }

  // 4. Handle Pending accounts: send fresh OTP and open OTP verification window
  if (user.status === 'pending') {
    const newOtp = security.generateOtp();
    const newOtpHash = security.hashOtp(newOtp);

    await prisma.activationChallenge.upsert({
      where: { userId: user.id },
      update: {
        otpHash: newOtpHash,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        attempts: 0,
        lastSentAt: new Date()
      },
      create: {
        userId: user.id,
        purpose: 'account_activation',
        otpHash: newOtpHash,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
        attempts: 0,
        lastSentAt: new Date()
      }
    });

    await emailService.sendActivationOtp(user.email, newOtp);

    // Redirect to the OTP verification window just like .../register
    return res.redirect(303, `/activation?email=${encodeURIComponent(user.email)}&pending=true`);
  }

  // 5. Verify Password
  const isMatch = await security.verifyPassword(cleanPassword, user.salt, user.passwordHash);
  if (!isMatch) {
    const updatedStatus = rateLimit.recordLoginFailure(clientIp);
    if (updatedStatus.locked) {
      return res.status(429).render('errors/429', {
        title: '429 - Account Locked',
        cause: 'Bạn đã đăng nhập sai quá 5 lần. Vui lòng thử lại sau 5 phút.',
        backUrl: '/dishes'
      });
    }
    return res.status(401).render('auth/login', {
      title: 'Log In',
      recaptchaSiteKey: recaptcha.getSiteKey(),
      captchaRequired: updatedStatus.captchaRequired,
      error: genericError,
      info: null,
      old: { identifier }
    });
  }

  // 6. Login Success: Reset failures & create DB session
  rateLimit.clearLoginFailures(clientIp);

  const sid = security.generateSessionId();
  const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.create({
    data: {
      sid,
      userId: user.id,
      expiresAt: sessionExpiresAt
    }
  });

  // Set persistent session cookie (no plaintext user ID)
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  // Send code 303 and redirect
  return res.redirect(303, '/admin/dishes');
});

// POST /logout
router.post('/logout', async (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) {
    await prisma.session.delete({ where: { sid } }).catch(() => {});
  }
  res.clearCookie('sid');
  return res.redirect(303, '/login');
});

// ==========================================
// 4. FORGET PASSWORD & RESET
// ==========================================

// GET /forget
router.get('/forget', (req, res) => {
  return res.render('auth/forget', {
    title: 'Forget Password',
    error: null,
    info: null
  });
});

// POST /forget
router.post('/forget', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const clientIp = rateLimit.getClientIp(req);
  const rateLimitKey = `${clientIp}_${email}`;

  // 2 minutes rate limit
  const rl = rateLimit.checkForgetRateLimit(rateLimitKey);
  if (!rl.allowed) {
    return res.status(429).render('errors/429', {
      title: '429 - Rate Limit Exceeded',
      cause: `Vui lòng chờ ${rl.remainingSec} giây trước khi gửi lại yêu cầu đặt lại mật khẩu.`,
      backUrl: '/forget'
    });
  }

  rateLimit.recordForgetRequest(rateLimitKey);

  // Return the SAME content & status for verified and unverified emails
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (user && user.status === 'active') {
    const token = security.generateResetToken();
    const tokenHash = security.hashResetToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.passwordChallenge.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    const resetUrl = `${req.protocol}://${req.get('host')}/reset?token=${token}`;
    await emailService.sendPasswordResetLink(email, resetUrl);
  }

  return res.render('auth/forget', {
    title: 'Forget Password',
    error: null,
    info: 'Nếu tài khoản tồn tại và đã kích hoạt, hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư đến.'
  });
});

// GET /reset
router.get('/reset', async (req, res) => {
  const token = (req.query.token || '').trim();
  if (!token) {
    return res.redirect(303, '/forget');
  }

  const tokenHash = security.hashResetToken(token);
  const challenge = await prisma.passwordChallenge.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!challenge) {
    return res.render('auth/forget', {
      title: 'Forget Password',
      error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',
      info: null
    });
  }

  return res.render('auth/reset', {
    title: 'Reset Password',
    token,
    error: null
  });
});

// POST /reset
router.post('/reset', async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) {
    return res.redirect(303, '/forget');
  }

  const tokenHash = security.hashResetToken(token);
  const challenge = await prisma.passwordChallenge.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!challenge) {
    return res.render('auth/forget', {
      title: 'Forget Password',
      error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',
      info: null
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).render('auth/reset', {
      title: 'Reset Password',
      token,
      error: 'Xác nhận mật khẩu không trùng khớp.'
    });
  }

  const pwdValidation = security.validatePasswordComplexity(password);
  if (!pwdValidation.valid) {
    return res.status(400).render('auth/reset', {
      title: 'Reset Password',
      token,
      error: pwdValidation.message
    });
  }

  // KEEP old password until process is complete
  const newSalt = security.generateSalt();
  const newPasswordHash = await security.hashPassword(password, newSalt);

  await prisma.$transaction([
    // Update user password and salt
    prisma.user.update({
      where: { id: challenge.userId },
      data: {
        passwordHash: newPasswordHash,
        salt: newSalt
      }
    }),
    // Mark challenge as used
    prisma.passwordChallenge.update({
      where: { id: challenge.id },
      data: {
        usedAt: new Date()
      }
    }),
    // Invalidate all active sessions for this user
    prisma.session.deleteMany({
      where: { userId: challenge.userId }
    })
  ]);

  // Redirect back to login prompting user to re-login
  return res.redirect(303, '/login?resetSuccess=true');
});

module.exports = router;
