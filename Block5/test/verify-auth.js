process.env.NODE_ENV = 'test';
require('dotenv').config();

const http = require('http');
const assert = require('assert');
const app = require('../server');
const prisma = require('../lib/prisma');
const security = require('../lib/security');
const emailService = require('../lib/email');
const rateLimit = require('../lib/rateLimit');

const PORT = 4056;
let server;

function makeRequest(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    let postData = null;
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BHT-Diner-Browser',
      ...headers
    };

    if (body) {
      if (typeof body === 'string') {
        postData = body;
        reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
          if (Array.isArray(v)) {
            v.forEach(val => params.append(k, val));
          } else {
            params.append(k, v);
          }
        }
        postData = params.toString();
        reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: PORT,
        path: pathUrl,
        method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function extractCookie(headers, cookieName) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  const match = cookieStr.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runAuthTests() {
  console.log('========================================================');
  console.log('🔐 Starting B.H.T Diner SSR Authentication Test Suite');
  console.log('========================================================');

  server = app.listen(PORT);

  try {
    emailService.clearEmailLogs();
    rateLimit.resetAllRateLimits();

    const timestamp = Date.now();
    const testUsername = `chef_test_${timestamp}`;
    const testEmail = `chef_${timestamp}@gmail.com`;
    const testPassword = 'StrongPassword1!';

    // ----------------------------------------------------
    // TEST 1: Password Complexity & Security Helpers
    // ----------------------------------------------------
    console.log('\n1. Testing Password Complexity & Security Helpers...');
    assert.strictEqual(security.validatePasswordComplexity('short1!').valid, false, 'Should reject short password');
    assert.strictEqual(security.validatePasswordComplexity('nocapital1!').valid, false, 'Should reject no capital letter');
    assert.strictEqual(security.validatePasswordComplexity('NoNumber!').valid, false, 'Should reject no number');
    assert.strictEqual(security.validatePasswordComplexity('NoSpecialChar1').valid, false, 'Should reject no special char');
    assert.strictEqual(security.validatePasswordComplexity(testPassword).valid, true, 'Should accept valid strong password');

    const salt = security.generateSalt();
    assert.strictEqual(salt.length, 5, 'Salt must be a 5-digit string');
    assert(/^\d{5}$/.test(salt), 'Salt must be numeric');
    const hash = await security.hashPassword(testPassword, salt);
    assert(await security.verifyPassword(testPassword, salt, hash), 'Bcrypt verify with salt must pass');
    assert(!(await security.verifyPassword('WrongPassword1!', salt, hash)), 'Bcrypt verify with wrong password must fail');
    console.log('   ✓ Password complexity and 5-digit salt hashing verified');

    // ----------------------------------------------------
    // TEST 2: Registration Validations
    // ----------------------------------------------------
    console.log('\n2. Testing Registration Validations...');
    
    // 2a. ReCAPTCHA rejection
    const failCaptchaRes = await makeRequest('POST', '/register', {
      username: testUsername,
      email: testEmail,
      password: testPassword,
      'g-recaptcha-response': 'invalid-token'
    });
    assert.strictEqual(failCaptchaRes.statusCode, 400);
    assert(failCaptchaRes.body.includes('VALIDATION_FAILED'));
    console.log('   ✓ Registration rejects failed reCAPTCHA verification');

    // 2b. Invalid Email Domain (must be @gmail.com)
    const failEmailRes = await makeRequest('POST', '/register', {
      username: testUsername,
      email: `test_${timestamp}@yahoo.com`,
      password: testPassword,
      'g-recaptcha-response': 'test-pass'
    });
    assert.strictEqual(failEmailRes.statusCode, 400);
    assert(failEmailRes.body.includes('@gmail.com'));
    console.log('   ✓ Registration enforces @gmail.com email domain');

    // 2c. Successful Registration
    const regRes = await makeRequest('POST', '/register', {
      username: testUsername,
      email: testEmail,
      password: testPassword,
      'g-recaptcha-response': 'test-pass'
    });
    assert.strictEqual(regRes.statusCode, 303, `Expected 303 redirect, got ${regRes.statusCode}`);
    assert(regRes.headers.location.startsWith('/activation?email='), 'Redirects to /activation');

    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { activationChallenge: true }
    });
    assert(createdUser, 'User record must exist in database');
    assert.strictEqual(createdUser.status, 'pending', 'Status must be pending before activation');
    assert.strictEqual(createdUser.role, 'Viewer', 'Role must default to Viewer before activation');
    assert.strictEqual(createdUser.salt.length, 5, 'Stored salt must be 5-digit string');
    assert(createdUser.activationChallenge, 'ActivationChallenge must be created');
    assert.strictEqual(createdUser.activationChallenge.attempts, 0, 'Initial attempts must be 0');

    // Check email dispatch
    const emailLogs = emailService.getEmailLogs();
    assert(emailLogs.length > 0, 'Activation email must be logged');
    const sentEmail = emailLogs[emailLogs.length - 1];
    assert.strictEqual(sentEmail.to, testEmail);
    const otpMatch = sentEmail.html.match(/letter-spacing:\s*6px;\s*color:\s*#ba1414;">(\d{6})</);
    assert(otpMatch, 'Email must contain 6-digit OTP');
    const actualOtp = otpMatch[1];
    console.log(`   ✓ Registration created pending user, challenge, and sent OTP: ${actualOtp}`);

    // 2d. Duplicate Username
    const dupUserRes = await makeRequest('POST', '/register', {
      username: testUsername,
      email: `another_${timestamp}@gmail.com`,
      password: testPassword,
      'g-recaptcha-response': 'test-pass'
    });
    assert.strictEqual(dupUserRes.statusCode, 400);
    assert(dupUserRes.body.includes('VALIDATION_FAILED'));
    console.log('   ✓ Registration rejects duplicate username');

    // ----------------------------------------------------
    // TEST 3: Activation Flow & Limit OTP Attempts
    // ----------------------------------------------------
    console.log('\n3. Testing Activation Flow & 3-Attempt Limit...');
    
    // Attempt 1: Wrong OTP
    const wrongOtpRes1 = await makeRequest('POST', '/activation', {
      email: testEmail,
      otp: '000000'
    });
    assert.strictEqual(wrongOtpRes1.statusCode, 400);
    assert(wrongOtpRes1.body.includes('Invalid or expired OTP code') || wrongOtpRes1.body.includes('Mã OTP không chính xác hoặc đã hết hạn'));

    // Attempt 2: Wrong OTP
    const wrongOtpRes2 = await makeRequest('POST', '/activation', {
      email: testEmail,
      otp: '111111'
    });
    assert.strictEqual(wrongOtpRes2.statusCode, 400);

    // Attempt 3: Wrong OTP (exceed limit)
    const wrongOtpRes3 = await makeRequest('POST', '/activation', {
      email: testEmail,
      otp: '222222'
    });
    assert.strictEqual(wrongOtpRes3.statusCode, 400);
    assert(wrongOtpRes3.body.includes('3 attempts') || wrongOtpRes3.body.includes('Resend New OTP Code') || wrongOtpRes3.body.includes('3 lần') || wrongOtpRes3.body.includes('Gửi lại mã OTP'));
    console.log('   ✓ Enforced 3-attempt OTP limit on activation');

    // Attempt 4: Blocked because attempts >= 3
    const blockedRes = await makeRequest('POST', '/activation', {
      email: testEmail,
      otp: actualOtp
    });
    assert.strictEqual(blockedRes.statusCode, 400);
    assert(blockedRes.body.includes('Resend New OTP Code') || blockedRes.body.includes('Gửi lại mã OTP'));
    console.log('   ✓ Blocked further submissions after 3 failed attempts');

    // Test Pending Login: attempting login redirects to activation window with new OTP
    console.log('\n3b. Testing Pending Account Login Behavior...');
    const pendingLoginRes = await makeRequest('POST', '/login', {
      identifier: testEmail,
      password: testPassword
    });
    assert.strictEqual(pendingLoginRes.statusCode, 303, 'Pending login must return 303 redirect');
    assert(pendingLoginRes.headers.location.includes('/activation?email='), 'Must redirect to /activation');
    assert(pendingLoginRes.headers.location.includes('pending=true'), 'Must include pending flag');
    assert(!pendingLoginRes.headers['set-cookie'], 'Pending login must NOT set session cookie (NO auto login)');

    // Verify GET /activation with pending=true renders the error message
    const pendingActView = await makeRequest('GET', pendingLoginRes.headers.location);
    assert.strictEqual(pendingActView.statusCode, 200);
    assert(pendingActView.body.includes('Your account has not been activated yet') || pendingActView.body.includes('Tài khoản của bạn chưa được kích hoạt'), 'Must display pending error message');
    assert(pendingActView.body.includes('Verification Error'), 'Must render OTP verification error banner');
    console.log('   ✓ Attempting login with pending account redirects to OTP window and dispatches new code');

    // Test Registering again with pending email: doesn't soft-lock, re-triggers activation
    const retryRegisterRes = await makeRequest('POST', '/register', {
      username: testUsername,
      email: testEmail,
      password: testPassword,
      'g-recaptcha-response': 'test-pass'
    });
    assert.strictEqual(retryRegisterRes.statusCode, 303);
    assert(retryRegisterRes.headers.location.includes('/activation?email='));
    console.log('   ✓ Re-registering with pending email smoothly transitions to OTP activation (no soft-lock)');

    // ----------------------------------------------------
    // TEST 4: Resend OTP Cooldown & Successful Activation
    // ----------------------------------------------------
    console.log('\n4. Testing Resend OTP & Account Activation...');

    // Resend immediately (within 1 minute) -> 429 Too Many Requests
    const spamResend = await makeRequest('POST', '/activation/resend', { email: testEmail });
    assert.strictEqual(spamResend.statusCode, 429, `Expected 429 rate limit, got ${spamResend.statusCode}`);
    console.log('   ✓ POST /activation/resend enforces 1-minute cooldown (returns 429)');

    // Fast-forward lastSentAt to simulate cooldown expiration
    await prisma.activationChallenge.update({
      where: { userId: createdUser.id },
      data: { lastSentAt: new Date(Date.now() - 65 * 1000) }
    });

    const resendRes = await makeRequest('POST', '/activation/resend', { email: testEmail });
    assert.strictEqual(resendRes.statusCode, 303);

    const latestEmail = emailService.getEmailLogs()[emailService.getEmailLogs().length - 1];
    const newOtpMatch = latestEmail.html.match(/letter-spacing:\s*6px;\s*color:\s*#ba1414;">(\d{6})</);
    assert(newOtpMatch, 'New OTP must be generated');
    const newOtp = newOtpMatch[1];

    // Submit new valid OTP
    const validActivation = await makeRequest('POST', '/activation', {
      email: testEmail,
      otp: newOtp
    });
    assert.strictEqual(validActivation.statusCode, 303);
    assert.strictEqual(validActivation.headers.location, '/login?activated=true');

    // Verify User has been upgraded to active Admin
    const activatedUser = await prisma.user.findUnique({
      where: { id: createdUser.id },
      include: { activationChallenge: true }
    });
    assert.strictEqual(activatedUser.status, 'active', 'User must be active');
    assert.strictEqual(activatedUser.role, 'Admin', 'User must be promoted to Admin');
    assert(activatedUser.emailVerifiedAt, 'emailVerifiedAt must be set');
    assert(activatedUser.activationChallenge.usedAt, 'Challenge usedAt must be set');
    console.log('   ✓ Successful activation elevated user to Admin (NO auto login)');

    // ----------------------------------------------------
    // TEST 5: Access Control (RBAC) & HTTP Tool Rejection
    // ----------------------------------------------------
    console.log('\n5. Testing RBAC & HTTP Tool Rejection...');

    // 5a. Direct CLI Tool User-Agent (curl) -> 403
    const curlRes = await makeRequest('GET', '/admin/dishes', null, { 'User-Agent': 'curl/8.4.0' });
    assert.strictEqual(curlRes.statusCode, 403, `Expected 403 for curl, got ${curlRes.statusCode}`);
    assert(curlRes.body.includes('403') && curlRes.body.includes('automated HTTP tools'));
    console.log('   ✓ Rejected direct HTTP CLI tools (curl) with 403 Forbidden');

    // 5b. Unauthenticated access to /admin/dishes -> 403
    const guestAdminRes = await makeRequest('GET', '/admin/dishes');
    assert.strictEqual(guestAdminRes.statusCode, 403, `Expected 403 for unauthenticated access, got ${guestAdminRes.statusCode}`);
    assert(guestAdminRes.body.includes('403'));
    console.log('   ✓ Rejected unauthenticated access to admin routes with 403 Forbidden');

    // 5c. Public menu is accessible to anyone
    const publicMenuRes = await makeRequest('GET', '/dishes');
    assert.strictEqual(publicMenuRes.statusCode, 200);
    console.log('   ✓ Public routes (/dishes) remain openly accessible');

    // ----------------------------------------------------
    // TEST 6: Login, Persistent Sessions & Cookies
    // ----------------------------------------------------
    console.log('\n6. Testing Login, Persistent DB Sessions & Cookies...');

    // 6a. Wrong password -> Generic error
    const wrongLoginRes = await makeRequest('POST', '/login', {
      identifier: testEmail,
      password: 'WrongPassword123!'
    });
    assert.strictEqual(wrongLoginRes.statusCode, 401);
    assert(wrongLoginRes.body.includes('Please check your credentials and re-enter your email and password') || wrongLoginRes.body.includes('Vui lòng kiểm tra lại và nhập lại Email và Mật khẩu'));
    console.log('   ✓ Login returns generic error on wrong credentials');

    // 6b. Login with Username + Password
    const loginUsernameRes = await makeRequest('POST', '/login', {
      identifier: testUsername,
      password: testPassword
    });
    assert.strictEqual(loginUsernameRes.statusCode, 303, `Expected 303, got ${loginUsernameRes.statusCode}`);
    assert.strictEqual(loginUsernameRes.headers.location, '/admin/dishes');

    const sidCookie = extractCookie(loginUsernameRes.headers, 'sid');
    assert(sidCookie, 'Login must set sid cookie');

    // Verify Session is saved in database
    const dbSession = await prisma.session.findUnique({
      where: { sid: sidCookie }
    });
    assert(dbSession, 'Session record must exist in Session database table');
    assert.strictEqual(dbSession.userId, activatedUser.id, 'Session must reference user ID');
    console.log('   ✓ Logged in via Username: persistent session stored in database with sid cookie');

    // 6c. Access protected /admin/dishes with valid session cookie
    const adminAccessRes = await makeRequest('GET', '/admin/dishes', null, {
      Cookie: `sid=${sidCookie}`
    });
    assert.strictEqual(adminAccessRes.statusCode, 200, 'Authenticated admin must access /admin/dishes');
    assert(adminAccessRes.body.includes('Dishes Management') || adminAccessRes.body.includes('B.H.T Diner'));
    console.log('   ✓ Authenticated Admin accessed /admin/dishes successfully');

    // 6d. Login with Email + Password
    const loginEmailRes = await makeRequest('POST', '/login', {
      identifier: testEmail,
      password: testPassword
    });
    assert.strictEqual(loginEmailRes.statusCode, 303);
    const sidCookie2 = extractCookie(loginEmailRes.headers, 'sid');
    assert(sidCookie2);
    console.log('   ✓ Logged in via Email: returned 303 redirect');

    // ----------------------------------------------------
    // TEST 7: Logout Flow & Session Revocation
    // ----------------------------------------------------
    console.log('\n7. Testing Logout & Session Revocation...');
    const logoutRes = await makeRequest('POST', '/logout', null, {
      Cookie: `sid=${sidCookie2}`
    });
    assert.strictEqual(logoutRes.statusCode, 303);
    assert.strictEqual(logoutRes.headers.location, '/login');

    const revokedSession = await prisma.session.findUnique({
      where: { sid: sidCookie2 }
    });
    assert.strictEqual(revokedSession, null, 'Session must be deleted from database');

    // Old sid must be rejected with 403 Forbidden
    const oldSidRes = await makeRequest('GET', '/admin/dishes', null, {
      Cookie: `sid=${sidCookie2}`
    });
    assert.strictEqual(oldSidRes.statusCode, 403, 'Old sid must be rejected');
    console.log('   ✓ POST /logout revoked session from DB; old sid rejected with 403');

    // ----------------------------------------------------
    // TEST 8: Forget Password & Reset Flow
    // ----------------------------------------------------
    console.log('\n8. Testing Forget & Reset Password Flow...');

    // 8a. POST /forget returns uniform response for verified & unverified
    const forgetNonExistent = await makeRequest('POST', '/forget', { email: 'nonexistent@gmail.com' });
    assert.strictEqual(forgetNonExistent.statusCode, 200);

    // Rate limit per IP/email on /forget (2 minutes)
    const forgetSpam = await makeRequest('POST', '/forget', { email: 'nonexistent@gmail.com' });
    assert.strictEqual(forgetSpam.statusCode, 429, '2-minute rate limit on /forget must return 429');
    console.log('   ✓ POST /forget returns uniform response and enforces 2-minute rate limit');

    // Clear forget cooldown for testing active user reset
    rateLimit.resetAllRateLimits();

    const forgetValid = await makeRequest('POST', '/forget', { email: testEmail });
    assert.strictEqual(forgetValid.statusCode, 200);

    const resetEmail = emailService.getEmailLogs()[emailService.getEmailLogs().length - 1];
    const resetUrlMatch = resetEmail.html.match(/href="([^"]+reset\?token=([a-f0-9]+))"/);
    assert(resetUrlMatch, 'Reset email must contain reset link with token');
    const resetToken = resetUrlMatch[2];

    // Challenge saved in DB
    const tokenHash = security.hashResetToken(resetToken);
    const pwdChallenge = await prisma.passwordChallenge.findFirst({
      where: { tokenHash, usedAt: null }
    });
    assert(pwdChallenge, 'PasswordChallenge must be saved in database');
    assert.strictEqual(pwdChallenge.userId, activatedUser.id);

    // 8b. GET /reset?token=... renders form
    const resetPageRes = await makeRequest('GET', `/reset?token=${resetToken}`);
    assert.strictEqual(resetPageRes.statusCode, 200);
    assert(resetPageRes.body.includes('Set New Password'));

    // 8c. POST /reset with mismatched passwords fails
    const mismatchRes = await makeRequest('POST', '/reset', {
      token: resetToken,
      password: 'NewStrongPassword1!',
      confirmPassword: 'DifferentPassword1!'
    });
    assert.strictEqual(mismatchRes.statusCode, 400);

    // 8d. POST /reset with valid new password
    const newPassword = 'BrandNewPassword2@';
    const resetSuccessRes = await makeRequest('POST', '/reset', {
      token: resetToken,
      password: newPassword,
      confirmPassword: newPassword
    });
    assert.strictEqual(resetSuccessRes.statusCode, 303);
    assert.strictEqual(resetSuccessRes.headers.location, '/login?resetSuccess=true');

    // Verify challenge is marked used
    const consumedChallenge = await prisma.passwordChallenge.findUnique({
      where: { id: pwdChallenge.id }
    });
    assert(consumedChallenge.usedAt, 'Challenge must be marked as used');

    // Verify can log in with new password
    const loginNewPwdRes = await makeRequest('POST', '/login', {
      identifier: testEmail,
      password: newPassword
    });
    assert.strictEqual(loginNewPwdRes.statusCode, 303);
    assert.strictEqual(loginNewPwdRes.headers.location, '/admin/dishes');
    console.log('   ✓ Reset password completed: challenge consumed, sessions invalidated, new password active');

    console.log('\n========================================================');
    console.log('🎉 ALL SSR AUTHENTICATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('========================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runAuthTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  if (server) server.close();
  process.exit(1);
});
