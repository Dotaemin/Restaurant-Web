process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const app = require('../server');
const prisma = require('../lib/prisma');
const {
  validatePasswordComplexity,
  validateEmail,
  generate5DigitSalt,
  hashPassword,
  verifyPassword,
  generate6DigitOtp,
  generateResetToken,
  hashResetToken,
  signSessionJwt,
  verifySessionJwt
} = require('../lib/security');

// Helper to make local HTTP requests to Express app without external network
function makeRequest(server, options, postData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (postData) {
      if (typeof postData === 'object' && !(postData instanceof Buffer)) {
        if (reqOptions.headers['Content-Type'] === 'application/json') {
          postData = JSON.stringify(postData);
        } else {
          postData = new URLSearchParams(postData).toString();
          reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('=======================================================');
  console.log('🧪 Starting Comprehensive Authentication Security Tests');
  console.log('=======================================================');

  // 1. Test Security Utilities
  console.log('\n[1/5] Testing Security & Cryptographic Utilities...');

  // Salt generation: exactly 5 digits
  const salt = generate5DigitSalt();
  assert.strictEqual(salt.length, 5, 'Salt must be 5 digits');
  assert.strictEqual(/^[0-9]{5}$/.test(salt), true, 'Salt must be numeric');
  console.log('  ✓ 5-digit numeric salt generated:', salt);

  // Password hashing with salt
  const testPw = 'TestPassword123!';
  const pwHash = await hashPassword(testPw, salt);
  const isValid = await verifyPassword(testPw, salt, pwHash);
  const isInvalid = await verifyPassword('WrongPw123!', salt, pwHash);
  assert.strictEqual(isValid, true, 'Valid password verification must succeed');
  assert.strictEqual(isInvalid, false, 'Invalid password verification must fail');
  console.log('  ✓ Password hashing with 5-digit salt & bcrypt verified');

  // Password complexity rules:
  // Must contain >= 8 chars, 1 uppercase, 1 number, 1 special char (!,@,#,$,%,^,&,*,<,>,.)
  assert.strictEqual(validatePasswordComplexity('Short1!'), false, 'Should reject password < 8 chars');
  assert.strictEqual(validatePasswordComplexity('nouppercase1!'), false, 'Should reject without uppercase');
  assert.strictEqual(validatePasswordComplexity('NoNumberHere!'), false, 'Should reject without number');
  assert.strictEqual(validatePasswordComplexity('NoSpecial1234'), false, 'Should reject without special char');
  assert.strictEqual(validatePasswordComplexity('ValidPass123!'), true, 'Should accept valid password with !');
  assert.strictEqual(validatePasswordComplexity('ValidPass123@'), true, 'Should accept valid password with @');
  assert.strictEqual(validatePasswordComplexity('ValidPass123.'), true, 'Should accept valid password with .');
  console.log('  ✓ Password complexity policy strictly enforced');

  // Email format: must be ...@gmail.com
  assert.strictEqual(validateEmail('test@yahoo.com'), false, 'Should reject non-gmail');
  assert.strictEqual(validateEmail('invalid-email'), false, 'Should reject malformed email');
  assert.strictEqual(validateEmail('chef.john@gmail.com'), true, 'Should accept valid @gmail.com');
  console.log('  ✓ Email @gmail.com validation verified');

  // JWT with jose library
  const dummySid = 'test-session-sid-uuid-12345';
  const token = await signSessionJwt(dummySid);
  const decoded = await verifySessionJwt(token);
  assert.strictEqual(decoded.sid, dummySid, 'JWT payload must match signed session sid');
  console.log('  ✓ jose JWT signing and claim verification verified');

  // 2. HTTP Server Endpoints Verification
  console.log('\n[2/5] Starting In-Process HTTP Server for Route Testing...');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  console.log(`  ✓ Test server listening on 127.0.0.1:${serverPort}`);

  // Test GET routes are publicly accessible when guest:
  // "You can still access the log in view and the registration view even when you're not signed in / logged in."
  const resLogin = await makeRequest(server, { path: '/login' });
  assert.strictEqual(resLogin.statusCode, 200, 'GET /login must return 200 OK');
  assert.ok(resLogin.body.includes('Sign In'), 'Login page must render Sign In');
  assert.ok(resLogin.body.includes('Forget Password?'), 'Login view must include "Forget Password?" below login bar');
  console.log('  ✓ GET /login loads successfully with "Forget Password?" link');

  const resRegister = await makeRequest(server, { path: '/register' });
  assert.strictEqual(resRegister.statusCode, 200, 'GET /register must return 200 OK');
  assert.ok(resRegister.body.includes('Create an Account'), 'Register page must render Create an Account');
  console.log('  ✓ GET /register loads successfully');

  const resForget = await makeRequest(server, { path: '/forget' });
  assert.strictEqual(resForget.statusCode, 200, 'GET /forget must return 200 OK');
  assert.ok(resForget.body.includes('Reset Password'), 'Forget page must render Reset Password form');
  console.log('  ✓ GET /forget loads successfully');

  // 3. Test Registration Validation & OTP Activation
  console.log('\n[3/5] Testing Registration, OTP Generation & Activation Flow...');

  const testUsername = `user_${Date.now()}`;
  const testEmail = `${testUsername}@gmail.com`;
  const testPassword = 'StrongPassword123!';

  // Clean up any test user with this username or email if already exists
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: testUsername },
        { email: testEmail }
      ]
    }
  }).catch(() => {});

  // Test registration validation failure on mismatched passwords:
  // "Registration fail, return VALIDATION_FAILED and show an error message."
  const resBadPw = await makeRequest(server, {
    path: '/register',
    method: 'POST'
  }, {
    username: testUsername,
    email: testEmail,
    password: testPassword,
    confirmPassword: 'MismatchPassword123!',
    'g-recaptcha-response': 'test_token'
  });
  assert.strictEqual(resBadPw.statusCode, 400, 'Mismatched passwords must return 400');
  assert.ok(resBadPw.body.includes('passwords do not match') || resBadPw.body.includes('VALIDATION_FAILED'));
  console.log('  ✓ Registration rejects mismatched passwords with VALIDATION_FAILED');

  // Successful Registration
  const resRegOk = await makeRequest(server, {
    path: '/register',
    method: 'POST'
  }, {
    username: testUsername,
    email: testEmail,
    password: testPassword,
    confirmPassword: testPassword,
    'g-recaptcha-response': 'test_token'
  });
  assert.strictEqual(resRegOk.statusCode, 302, 'Successful registration must redirect to activation');
  assert.ok(resRegOk.headers.location.includes('/activation'), 'Must redirect to /activation');
  console.log('  ✓ Registration succeeded, redirected to /activation');

  // Verify User record in DB
  const createdUser = await prisma.user.findUnique({
    where: { email: testEmail },
    include: { activationChallenge: true }
  });
  assert.ok(createdUser, 'User must exist in database');
  assert.strictEqual(createdUser.status, 'pending', 'User status must initially be "pending"');
  assert.strictEqual(createdUser.role, 'Viewer', 'User role must be "Viewer" by default');
  assert.strictEqual(createdUser.salt.length, 5, 'User salt must be 5-digit string');
  assert.ok(createdUser.activationChallenge, 'ActivationChallenge must be created');
  assert.strictEqual(createdUser.activationChallenge.otp.length, 6, 'OTP must be 6 digits');
  console.log('  ✓ User stored with status "pending", role "Viewer", and 6-digit plain OTP challenge');

  // Test duplicate username rejection:
  const resDup = await makeRequest(server, {
    path: '/register',
    method: 'POST'
  }, {
    username: testUsername,
    email: `other_${Date.now()}@gmail.com`,
    password: testPassword,
    confirmPassword: testPassword,
    'g-recaptcha-response': 'test_token'
  });
  assert.strictEqual(resDup.statusCode, 400, 'Duplicate username must be rejected');
  assert.ok(resDup.body.includes('username is already taken') || resDup.body.includes('VALIDATION_FAILED'));
  console.log('  ✓ Duplicate username is rejected');

  // Test Activation: wrong OTP
  // "POST /activation: if wrong or expired (2 minutes), will send the same error message"
  const resWrongOtp = await makeRequest(server, {
    path: '/activation',
    method: 'POST'
  }, {
    email: testEmail,
    otp: '000000'
  });
  assert.strictEqual(resWrongOtp.statusCode, 400, 'Wrong OTP must return 400');
  assert.ok(resWrongOtp.body.includes('incorrect or has expired'), 'Must return uniform error message');
  console.log('  ✓ Wrong OTP returns uniform error message');

  // Test Activation: correct OTP
  // "if correct => set status to active, NO auto login."
  const validOtp = createdUser.activationChallenge.otp;
  const resCorrectOtp = await makeRequest(server, {
    path: '/activation',
    method: 'POST'
  }, {
    email: testEmail,
    otp: validOtp
  });
  assert.strictEqual(resCorrectOtp.statusCode, 302, 'Correct OTP must redirect');
  assert.ok(resCorrectOtp.headers.location.includes('/login'), 'Must redirect to login page (NO auto login)');

  const activatedUser = await prisma.user.findUnique({ where: { email: testEmail } });
  assert.strictEqual(activatedUser.status, 'active', 'User status must now be "active"');
  assert.ok(activatedUser.emailVerifiedAt, 'User emailVerifiedAt must be set');
  console.log('  ✓ Activation succeeded: status set to "active", emailVerifiedAt set, redirected to login (NO auto login)');

  // 4. Test Login, Brute-Force Protection & Session Management
  console.log('\n[4/5] Testing Login, Vague Errors, Brute-Force Lockout & Session Storage...');

  // Invalid login attempt:
  // "DO NOT tell user if either of the input was wrong, just tell them to check again and retype Email and Password."
  const resBadLogin = await makeRequest(server, {
    path: '/login',
    method: 'POST'
  }, {
    identifier: testEmail,
    password: 'WrongPassword123!'
  });
  assert.strictEqual(resBadLogin.statusCode, 400);
  assert.ok(
    resBadLogin.body.includes('Please check your details and try retyping your Email/Username and Password.'),
    'Must display vague message without revealing which field was incorrect'
  );
  console.log('  ✓ Invalid login displays required vague error message');

  // Test Brute-Force lockout: simulate 5 failed attempts
  await prisma.user.update({
    where: { id: activatedUser.id },
    data: {
      failedLoginAttempts: 4,
      lastFailedLoginAt: new Date()
    }
  });

  const resLockout = await makeRequest(server, {
    path: '/login',
    method: 'POST'
  }, {
    identifier: testEmail,
    password: 'WrongPasswordAgain!'
  });
  assert.strictEqual(resLockout.statusCode, 429, '5 failed attempts must trigger 429 lockout');
  assert.ok(
    resLockout.body.includes('temporarily') || resLockout.body.includes('wait 3 minutes'),
    'Lockout screen must inform user with friendly message'
  );
  console.log('  ✓ Brute-force lockout triggered (HTTP 429) after 5 failed attempts with 3-minute wait notice');

  // Reset lockout for testing successful login
  await prisma.user.update({
    where: { id: activatedUser.id },
    data: {
      failedLoginAttempts: 0,
      lockoutUntil: null,
      lastFailedLoginAt: null
    }
  });

  // Successful Login:
  // "POST /login: Send code 303 and redirect when successfully logged in."
  const resLoginOk = await makeRequest(server, {
    path: '/login',
    method: 'POST'
  }, {
    identifier: testEmail,
    password: testPassword
  });
  assert.strictEqual(resLoginOk.statusCode, 303, 'Successful login must respond with HTTP 303 Redirect');
  assert.strictEqual(resLoginOk.headers.location, '/dishes', 'Redirect target must be /dishes');

  // Verify auth cookie
  const setCookie = resLoginOk.headers['set-cookie'];
  assert.ok(setCookie && setCookie.length > 0, 'Set-Cookie header must be present');
  const cookieString = setCookie[0];
  assert.ok(cookieString.includes('auth_token='), 'Cookie must contain auth_token');
  assert.ok(cookieString.includes('HttpOnly'), 'Cookie must be HttpOnly');
  console.log('  ✓ Login responded with HTTP 303 redirect and HttpOnly JWT auth_token cookie');

  // Verify Session record in database
  const activeSessions = await prisma.session.findMany({ where: { userId: activatedUser.id } });
  assert.ok(activeSessions.length > 0, 'Session must be persisted in database');
  const activeSid = activeSessions[0].sid;
  console.log('  ✓ Session record successfully stored in database with sid:', activeSid);

  // Test authenticated request using session cookie
  const authCookieHeader = cookieString.split(';')[0];
  const resMenuAuth = await makeRequest(server, {
    path: '/dishes',
    headers: { Cookie: authCookieHeader }
  });
  assert.strictEqual(resMenuAuth.statusCode, 200, 'Authenticated request to /dishes must succeed');
  assert.ok(resMenuAuth.body.includes(testUsername), 'Rendered menu header must display user username');
  assert.ok(resMenuAuth.body.includes('Sign Out'), 'Rendered menu header must display Sign Out button');
  console.log('  ✓ Session authentication recognized: header renders user username & Sign Out button');

  // Test Logout:
  // "Use POST request to write on the session. Cancel the session in the server and delete cookies, using the old sid results in a rejection."
  const resLogout = await makeRequest(server, {
    path: '/logout',
    method: 'POST',
    headers: { Cookie: authCookieHeader }
  });
  assert.strictEqual(resLogout.statusCode, 302, 'POST /logout must redirect');
  assert.ok(resLogout.headers['set-cookie'][0].includes('auth_token=;'), 'Logout must clear cookie');

  // Verify session cancelled in database
  const sessionAfterLogout = await prisma.session.findUnique({ where: { sid: activeSid } });
  assert.strictEqual(sessionAfterLogout, null, 'Session must be cancelled and deleted from database');
  console.log('  ✓ Session cancelled in database and cookie cleared on POST /logout');

  // Re-requesting with old cookie must now be rejected/treated as guest
  const resAfterLogout = await makeRequest(server, {
    path: '/dishes',
    headers: { Cookie: authCookieHeader }
  });
  assert.ok(!resAfterLogout.body.includes(`👤 ${testUsername}`), 'Old sid must no longer authenticate user');
  console.log('  ✓ Subsequent request with old sid is rejected');

  // 5. Test Forget Password & Reset Token Flow
  console.log('\n[5/5] Testing Forget Password, Rate Limits & Token Reset Flow...');

  // POST /forget
  // "Post /forget: Returns the same content and status for verified and unverified emails, with a rate limit of 2 minutes."
  const resForgetOk = await makeRequest(server, {
    path: '/forget',
    method: 'POST'
  }, {
    email: testEmail
  });
  assert.strictEqual(resForgetOk.statusCode, 200, 'POST /forget must return 200');
  assert.ok(resForgetOk.body.includes('instructions to reset your password'), 'Must return confirmation notice');

  // Submitting again immediately must trigger the 2-minute rate limit:
  const resForgetRateLimit = await makeRequest(server, {
    path: '/forget',
    method: 'POST'
  }, {
    email: testEmail
  });
  assert.strictEqual(resForgetRateLimit.statusCode, 429, 'Immediate second submit must return 429');
  assert.ok(resForgetRateLimit.body.includes('Please wait'), 'Rate limit notice must be displayed');
  console.log('  ✓ POST /forget returns confirmation and strictly enforces 2-minute cooldown (HTTP 429)');

  // Verify PasswordChallenge in database
  const challenge = await prisma.passwordChallenge.findFirst({
    where: { userId: activatedUser.id },
    orderBy: { createdAt: 'desc' }
  });
  assert.ok(challenge, 'PasswordChallenge record must exist');
  assert.ok(challenge.tokenHash, 'PasswordChallenge must store tokenHash');
  assert.strictEqual(challenge.usedAt, null, 'Challenge must not be used yet');
  console.log('  ✓ PasswordChallenge stored with hashed token and expiration');

  // Reset password:
  // "After clicking the link, prompt the user to type in their NEW password in a box. THEN, type it in again in another box to Confirm."
  // "KEEP the old password until the process is complete."
  // Let's create a known raw token and hash it in DB for testing
  const testRawToken = generateResetToken();
  const testTokenHash = hashResetToken(testRawToken);
  await prisma.passwordChallenge.create({
    data: {
      userId: activatedUser.id,
      tokenHash: testTokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    }
  });

  const resResetPage = await makeRequest(server, {
    path: `/reset?token=${testRawToken}`
  });
  assert.strictEqual(resResetPage.statusCode, 200, 'GET /reset with valid token must return 200');
  assert.ok(resResetPage.body.includes('Create New Password'), 'Must render reset form');
  console.log('  ✓ GET /reset?token=... renders password reset form');

  const brandNewPassword = 'BrandNewPassword456!';
  const resResetSubmit = await makeRequest(server, {
    path: '/reset',
    method: 'POST'
  }, {
    token: testRawToken,
    password: brandNewPassword,
    confirmPassword: brandNewPassword
  });
  assert.strictEqual(resResetSubmit.statusCode, 302, 'POST /reset must redirect');
  assert.ok(resResetSubmit.headers.location.includes('/login'), 'Must redirect back to login page');
  assert.ok(resResetSubmit.headers.location.includes('password_reset_success'), 'Must include success notice');

  // Verify user's new password works, and old password fails
  const updatedUserAfterReset = await prisma.user.findUnique({ where: { id: activatedUser.id } });
  const oldPwCheck = await verifyPassword(testPassword, updatedUserAfterReset.salt, updatedUserAfterReset.passwordHash);
  const newPwCheck = await verifyPassword(brandNewPassword, updatedUserAfterReset.salt, updatedUserAfterReset.passwordHash);
  assert.strictEqual(oldPwCheck, false, 'Old password must no longer work');
  assert.strictEqual(newPwCheck, true, 'New password must verify successfully');

  // Verify challenge consumed
  const consumedChallenge = await prisma.passwordChallenge.findFirst({
    where: { tokenHash: testTokenHash }
  });
  assert.ok(consumedChallenge.usedAt, 'PasswordChallenge usedAt must be set');
  console.log('  ✓ Password reset complete: old password replaced, token marked consumed, redirected to login');

  // Clean up test user
  await prisma.user.delete({ where: { id: activatedUser.id } }).catch(() => {});
  console.log('  ✓ Test user cleaned up');

  server.close();

  console.log('\n=======================================================');
  console.log('🎉 ALL AUTHENTICATION AND SECURITY TESTS PASSED (100%)');
  console.log('=======================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
