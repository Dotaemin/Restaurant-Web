process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const OTPAuth = require('otpauth');
const app = require('../server');
const prisma = require('../lib/prisma');
const {
  signSessionJwt,
  signMfaPendingJwt,
  signMfaSetupJwt,
  verifyMfaSetupJwt,
  verifySessionJwt,
  generateCsrfToken,
  generate5DigitSalt,
  hashPassword
} = require('../lib/security');

// Helper to make HTTP requests
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
        postData = JSON.stringify(postData);
        reqOptions.headers['Content-Type'] = 'application/json';
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch (_) {
          parsed = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
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
  console.log('=================================================================');
  console.log('🧪 Starting Tests: Comprehensive Auth & MFA Hardening Suite');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Server listening on 127.0.0.1:${port}\n`);

  try {
    const timestamp = Date.now();

    // -----------------------------------------------------------------
    // TEST 1: POST /api/auth/register with role: 'ADMIN' creates a VIEWER
    // -----------------------------------------------------------------
    console.log('[Test 1/7] POST /api/auth/register with role: "ADMIN" creates a VIEWER...');

    const testUsername = `admin_probe_${timestamp}`;
    const testEmail = `admin_probe_${timestamp}@gmail.com`;

    await prisma.user.deleteMany({
      where: {
        OR: [
          { username: testUsername },
          { email: testEmail }
        ]
      }
    });

    const regResponse = await makeRequest(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, {
      username: testUsername,
      email: testEmail,
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      role: 'ADMIN',
      recaptchaToken: 'test_token'
    });

    assert.strictEqual(regResponse.statusCode, 200, 'Registration must return status 200');
    assert.strictEqual(regResponse.body.ok, true, 'Registration response must have ok: true');
    assert.strictEqual(regResponse.body.mfaSetup, undefined, 'Registration response must NOT contain mfaSetup');

    const createdUser = await prisma.user.findUnique({
      where: { email: testEmail },
      include: { recoveryCodes: true }
    });

    assert.ok(createdUser, 'User must exist in database');
    assert.strictEqual(createdUser.role, 'VIEWER', 'User role must be VIEWER regardless of role in request');
    assert.strictEqual(createdUser.mfaSecret, null, 'User mfaSecret must be null');
    assert.strictEqual(createdUser.mfaEnabled, false, 'User mfaEnabled must be false');
    assert.strictEqual(createdUser.recoveryCodes.length, 0, 'User must have no recovery codes');

    console.log('  ✓ Role "ADMIN" was ignored and user created as VIEWER with no MFA setup or recovery codes.');

    // -----------------------------------------------------------------
    // TEST 2: An mfa_pending token in the auth_token cookie gets 401 on /api/auth/me
    // -----------------------------------------------------------------
    console.log('\n[Test 2/7] An mfa_pending token in auth_token cookie gets 401 on /api/auth/me...');

    const mfaPendingToken = await signMfaPendingJwt(createdUser);

    const meWithMfaPending = await makeRequest(server, {
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Cookie: `auth_token=${mfaPendingToken}`
      }
    });

    assert.strictEqual(meWithMfaPending.statusCode, 401, 'mfa_pending token on /api/auth/me must return 401');
    assert.strictEqual(meWithMfaPending.body.ok, false, 'Response ok must be false');
    assert.strictEqual(meWithMfaPending.body.error.code, 'UNAUTHENTICATED', 'Error code must be UNAUTHENTICATED');

    const validSessionToken = await signSessionJwt(createdUser);
    const meWithValidSession = await makeRequest(server, {
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        Cookie: `auth_token=${validSessionToken}`
      }
    });

    assert.strictEqual(meWithValidSession.statusCode, 200, 'Valid session token on /api/auth/me must return 200');
    assert.strictEqual(meWithValidSession.body.ok, true, 'Response ok must be true');
    assert.strictEqual(meWithValidSession.body.user.role, 'VIEWER', 'Returned user role must be VIEWER');

    console.log('  ✓ mfa_pending token rejected with 401 UNAUTHENTICATED; valid session accepted.');

    await prisma.user.delete({ where: { id: createdUser.id } });

    // -----------------------------------------------------------------
    // TEST 3: After a lock expires, the user gets 3 fresh tries
    // -----------------------------------------------------------------
    console.log('\n[Test 3/7] After a lock expires, the user gets 3 fresh tries...');

    const mfaTestUser = await prisma.user.create({
      data: {
        username: `mfa_lock_${timestamp}`,
        email: `mfa_lock_${timestamp}@gmail.com`,
        passwordHash: 'hash',
        salt: '12345',
        role: 'CHEF',
        status: 'ACTIVE',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaEnabled: true,
        mfaFailedAttempts: 0,
        mfaLockedUntil: new Date(Date.now() - 5000)
      }
    });

    const mfaToken = await signMfaPendingJwt(mfaTestUser);

    const try1 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });
    assert.strictEqual(try1.statusCode, 400, 'Try 1 must return 400');
    assert.ok(try1.body.error.message.includes('2 attempt(s) remaining'), 'Try 1 reports 2 remaining');

    const try2 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });
    assert.strictEqual(try2.statusCode, 400, 'Try 2 must return 400');
    assert.ok(try2.body.error.message.includes('1 attempt(s) remaining'), 'Try 2 reports 1 remaining');

    const try3 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });
    assert.strictEqual(try3.statusCode, 429, 'Try 3 must return 429 MFA_LOCKED');

    const userAfterTry3 = await prisma.user.findUnique({ where: { id: mfaTestUser.id } });
    assert.strictEqual(userAfterTry3.mfaFailedAttempts, 0, 'Counter must be reset to 0 upon reaching 3');
    assert.ok(userAfterTry3.mfaLockedUntil && new Date(userAfterTry3.mfaLockedUntil) > new Date());

    console.log('  ✓ User received 3 fresh tries after lock expiration; lockout reset counter to 0.');
    await prisma.user.delete({ where: { id: mfaTestUser.id } });

    // -----------------------------------------------------------------
    // TEST 4: Chef/Admin with mfaEnabled === false triggers mfaSetupRequired
    // -----------------------------------------------------------------
    console.log('\n[Test 4/7] Chef/Admin login with mfaEnabled === false returns mfaSetupRequired & mfaToken (type: mfa_setup)...');

    const chefSalt = generate5DigitSalt();
    const chefHash = await hashPassword('ChefPass123!', chefSalt);
    const chefNoMfa = await prisma.user.create({
      data: {
        username: `chef_nomfa_${timestamp}`,
        email: `chef_nomfa_${timestamp}@gmail.com`,
        passwordHash: chefHash,
        salt: chefSalt,
        role: 'CHEF',
        status: 'ACTIVE',
        mfaEnabled: false,
        mfaSecret: null
      }
    });

    const loginRes = await makeRequest(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, {
      identifier: chefNoMfa.email,
      password: 'ChefPass123!',
      recaptchaToken: 'test_token'
    });

    assert.strictEqual(loginRes.statusCode, 200, 'Login must return 200');
    assert.strictEqual(loginRes.body.ok, true);
    assert.strictEqual(loginRes.body.mfaSetupRequired, true, 'Must return mfaSetupRequired: true');
    assert.ok(typeof loginRes.body.mfaToken === 'string', 'Must return mfaToken string');

    // Verify mfaToken has type: 'mfa_setup'
    const setupClaims = await verifyMfaSetupJwt(loginRes.body.mfaToken);
    assert.ok(setupClaims, 'Token must verify as mfa_setup');
    assert.strictEqual(setupClaims.type, 'mfa_setup');

    // Verify mfa_setup token CANNOT be used as session
    const meWithSetupToken = await makeRequest(server, {
      path: '/api/auth/me',
      method: 'GET',
      headers: { Cookie: `auth_token=${loginRes.body.mfaToken}` }
    });
    assert.strictEqual(meWithSetupToken.statusCode, 401, 'mfa_setup token must NOT work as session');

    console.log('  ✓ mfaSetupRequired returned with type: "mfa_setup" token; token cannot access session endpoints.');

    // -----------------------------------------------------------------
    // TEST 5: POST /api/auth/mfa/setup-pending and confirm-pending
    // -----------------------------------------------------------------
    console.log('\n[Test 5/7] POST /api/auth/mfa/setup-pending & confirm-pending with atomic lockout & recovery codes...');

    const setupPendingRes = await makeRequest(server, {
      path: '/api/auth/mfa/setup-pending',
      method: 'POST'
    }, {
      mfaToken: loginRes.body.mfaToken
    });

    assert.strictEqual(setupPendingRes.statusCode, 200, 'setup-pending must return 200');
    assert.ok(typeof setupPendingRes.body.secret === 'string', 'setup-pending returns secret');
    assert.ok(typeof setupPendingRes.body.qrCode === 'string', 'setup-pending returns qrCode data URL');

    const generatedSecret = setupPendingRes.body.secret;

    // Test invalid code attempt on confirm-pending (failed attempts tracked)
    const badConfirm = await makeRequest(server, {
      path: '/api/auth/mfa/confirm-pending',
      method: 'POST'
    }, {
      mfaToken: loginRes.body.mfaToken,
      secret: generatedSecret,
      code: '000000'
    });
    assert.strictEqual(badConfirm.statusCode, 400, 'Invalid code returns 400');
    assert.ok(badConfirm.body.error.message.includes('2 attempt(s) remaining'));

    // Generate valid TOTP using otpauth
    const totp = new OTPAuth.TOTP({
      issuer: 'BHT Diner',
      label: chefNoMfa.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(generatedSecret)
    });
    const validTotpCode = totp.generate();

    const goodConfirm = await makeRequest(server, {
      path: '/api/auth/mfa/confirm-pending',
      method: 'POST'
    }, {
      mfaToken: loginRes.body.mfaToken,
      secret: generatedSecret,
      code: validTotpCode
    });

    assert.strictEqual(goodConfirm.statusCode, 200, 'confirm-pending with valid code returns 200');
    assert.strictEqual(goodConfirm.body.ok, true);
    assert.strictEqual(goodConfirm.body.recoveryCodes.length, 10, 'Must return 10 recovery codes');
    assert.ok(goodConfirm.headers['set-cookie'], 'Must issue auth_token cookie');

    const chefInDb = await prisma.user.findUnique({
      where: { id: chefNoMfa.id },
      include: { recoveryCodes: true }
    });
    assert.strictEqual(chefInDb.mfaEnabled, true, 'User mfaEnabled must now be true');
    assert.strictEqual(chefInDb.recoveryCodes.length, 10, '10 recovery codes stored in DB');

    console.log('  ✓ setup-pending generated QR & secret; confirm-pending validated TOTP, saved secret & issued 10 recovery codes.');

    // -----------------------------------------------------------------
    // TEST 6: /mfa/confirm returns 409 if already enabled; /mfa/disable requires password + code
    // -----------------------------------------------------------------
    console.log('\n[Test 6/7] /mfa/confirm returns 409 if MFA enabled; /mfa/disable requires password + code...');

    // Create active viewer with MFA enabled
    const viewerSalt = generate5DigitSalt();
    const viewerHash = await hashPassword('ViewerPass123!', viewerSalt);
    const viewerWithMfa = await prisma.user.create({
      data: {
        username: `viewer_mfa_${timestamp}`,
        email: `viewer_mfa_${timestamp}@gmail.com`,
        passwordHash: viewerHash,
        salt: viewerSalt,
        role: 'VIEWER',
        status: 'ACTIVE',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        mfaEnabled: true
      }
    });

    const viewerSessionToken = await signSessionJwt(viewerWithMfa);
    const viewerClaims = await verifySessionJwt(viewerSessionToken);
    const viewerCsrf = generateCsrfToken(viewerClaims);
    const viewerHeaders = {
      Cookie: `auth_token=${viewerSessionToken}`,
      'X-CSRF-Token': viewerCsrf
    };

    // Test /mfa/confirm when already enabled -> 409
    const confirmAlreadyEnabled = await makeRequest(server, {
      path: '/api/auth/mfa/confirm',
      method: 'POST',
      headers: viewerHeaders
    }, {
      secret: 'JBSWY3DPEHPK3PXP',
      code: '123456'
    });
    assert.strictEqual(confirmAlreadyEnabled.statusCode, 409, '/mfa/confirm must return 409 when MFA already enabled');
    assert.strictEqual(confirmAlreadyEnabled.body.error.code, 'MFA_ALREADY_ENABLED');

    // Test /mfa/disable without password or code -> 400
    const disableNoParams = await makeRequest(server, {
      path: '/api/auth/mfa/disable',
      method: 'POST',
      headers: viewerHeaders
    }, {});
    assert.strictEqual(disableNoParams.statusCode, 400, 'Disable without credentials returns 400');

    // Test /mfa/disable with wrong password -> 400
    const disableBadPw = await makeRequest(server, {
      path: '/api/auth/mfa/disable',
      method: 'POST',
      headers: viewerHeaders
    }, {
      password: 'WrongPassword!',
      code: '123456'
    });
    assert.strictEqual(disableBadPw.statusCode, 400, 'Disable with bad password returns 400');
    assert.strictEqual(disableBadPw.body.error.code, 'INVALID_PASSWORD');

    // Generate valid TOTP for viewer
    const viewerTotp = new OTPAuth.TOTP({
      issuer: 'BHT Diner',
      label: viewerWithMfa.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
    });

    // Test /mfa/disable with correct password and correct TOTP code
    const disableSuccess = await makeRequest(server, {
      path: '/api/auth/mfa/disable',
      method: 'POST',
      headers: viewerHeaders
    }, {
      password: 'ViewerPass123!',
      code: viewerTotp.generate()
    });
    assert.strictEqual(disableSuccess.statusCode, 200, 'Disable with valid credentials returns 200');
    assert.strictEqual(disableSuccess.body.ok, true);

    const viewerAfterDisable = await prisma.user.findUnique({ where: { id: viewerWithMfa.id } });
    assert.strictEqual(viewerAfterDisable.mfaEnabled, false, 'Viewer mfaEnabled is now false');
    assert.strictEqual(viewerAfterDisable.mfaSecret, null, 'Viewer mfaSecret is null');

    console.log('  ✓ /mfa/confirm returned 409; /mfa/disable verified password + TOTP before disabling.');

    // -----------------------------------------------------------------
    // TEST 7: POST /api/admin/users/:id/mfa-reset
    // -----------------------------------------------------------------
    console.log('\n[Test 7/7] POST /api/admin/users/:id/mfa-reset clears secret, enabled, drift, counters, recovery codes...');

    // Find or create admin user for auth
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    assert.ok(adminUser, 'Admin user must exist in database');

    const adminSessionToken = await signSessionJwt(adminUser);
    const adminClaims = await verifySessionJwt(adminSessionToken);
    const adminCsrf = generateCsrfToken(adminClaims);
    const adminHeaders = {
      Cookie: `auth_token=${adminSessionToken}`,
      'X-CSRF-Token': adminCsrf
    };

    // Reset chefNoMfa (which was activated with MFA in Test 5)
    const resetRes = await makeRequest(server, {
      path: `/api/admin/users/${chefNoMfa.id}/mfa-reset`,
      method: 'POST',
      headers: adminHeaders
    }, {});

    assert.strictEqual(resetRes.statusCode, 200, 'MFA reset returns 200');
    assert.strictEqual(resetRes.body.ok, true);

    const chefAfterReset = await prisma.user.findUnique({
      where: { id: chefNoMfa.id },
      include: { recoveryCodes: true }
    });

    assert.strictEqual(chefAfterReset.mfaSecret, null, 'mfaSecret is cleared to null');
    assert.strictEqual(chefAfterReset.mfaEnabled, false, 'mfaEnabled is set to false');
    assert.strictEqual(chefAfterReset.mfaDrift, 0, 'mfaDrift is reset to 0');
    assert.strictEqual(chefAfterReset.mfaFailedAttempts, 0, 'mfaFailedAttempts is reset to 0');
    assert.strictEqual(chefAfterReset.mfaLockedUntil, null, 'mfaLockedUntil is null');
    assert.strictEqual(chefAfterReset.recoveryCodeAttempts, 0, 'recoveryCodeAttempts is 0');
    assert.strictEqual(chefAfterReset.recoveryCodes.length, 0, 'All recovery codes deleted');

    // Verify non-admin cannot call mfa-reset (403 FORBIDDEN)
    const unauthReset = await makeRequest(server, {
      path: `/api/admin/users/${chefNoMfa.id}/mfa-reset`,
      method: 'POST',
      headers: viewerHeaders
    }, {});
    assert.strictEqual(unauthReset.statusCode, 403, 'Non-admin receives 403 FORBIDDEN');

    console.log('  ✓ Admin successfully reset target user MFA; non-admin blocked with 403 FORBIDDEN.');

    // Clean up test users
    await prisma.user.delete({ where: { id: viewerWithMfa.id } });
    await prisma.user.delete({ where: { id: chefNoMfa.id } });

    console.log('\n=================================================================');
    console.log('🎉 ALL 7 ADVANCED AUTH & MFA TESTS PASSED WITH 100% SUCCESS!');
    console.log('=================================================================\n');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
