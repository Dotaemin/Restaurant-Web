process.env.NODE_ENV = 'test';
const http = require('http');
const assert = require('assert');
const app = require('../server');
const prisma = require('../lib/prisma');
const { signSessionJwt, signMfaPendingJwt, verifySessionJwt } = require('../lib/security');

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
  console.log('🧪 Starting Tests: Auth Security Refactoring & Hardening Verification');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Server listening on 127.0.0.1:${port}\n`);

  try {
    // -----------------------------------------------------------------
    // TEST 1: POST /api/auth/register with role: 'ADMIN' creates a VIEWER
    // -----------------------------------------------------------------
    console.log('[Test 1/3] POST /api/auth/register with role: "ADMIN" creates a VIEWER...');

    const timestamp = Date.now();
    const testUsername = `admin_probe_${timestamp}`;
    const testEmail = `admin_probe_${timestamp}@gmail.com`;

    // Ensure clean state
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
    console.log('\n[Test 2/3] An mfa_pending token in auth_token cookie gets 401 on /api/auth/me...');

    // Generate an mfa_pending token
    const mfaPendingToken = await signMfaPendingJwt(createdUser);

    // Call /api/auth/me with auth_token cookie = mfaPendingToken
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

    // Contrast with valid session token which must succeed
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
    assert.strictEqual(meWithValidSession.body.user.passwordHash, undefined, 'passwordHash must not leak');
    assert.strictEqual(meWithValidSession.body.user.salt, undefined, 'salt must not leak');

    console.log('  ✓ mfa_pending token was rejected with 401 UNAUTHENTICATED on /api/auth/me.');
    console.log('  ✓ Valid session token with type: "session" was accepted with 200 OK.');

    // Clean up created user
    await prisma.user.delete({ where: { id: createdUser.id } });

    // -----------------------------------------------------------------
    // TEST 3: After a lock expires, the user gets 3 fresh tries
    // -----------------------------------------------------------------
    console.log('\n[Test 3/3] After a lock expires, the user gets 3 fresh tries...');

    // Create a temporary test user with MFA configured
    const mfaTestUser = await prisma.user.create({
      data: {
        username: `mfa_lock_${timestamp}`,
        email: `mfa_lock_${timestamp}@gmail.com`,
        passwordHash: 'hash',
        salt: '12345',
        role: 'CHEF',
        status: 'ACTIVE',
        mfaSecret: 'JBSWY3DPEHPK3PXP', // Base32 test secret
        mfaEnabled: true,
        mfaFailedAttempts: 0,
        // Set an expired lockout timestamp in the past
        mfaLockedUntil: new Date(Date.now() - 5000)
      }
    });

    const mfaToken = await signMfaPendingJwt(mfaTestUser);

    // Try 1: Invalid code
    const try1 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });

    assert.strictEqual(try1.statusCode, 400, 'Try 1 must return 400');
    assert.strictEqual(try1.body.error.code, 'INVALID_TOTP', 'Try 1 error must be INVALID_TOTP');
    assert.ok(try1.body.error.message.includes('2 attempt(s) remaining'), 'Try 1 must report 2 attempts remaining');

    const userAfterTry1 = await prisma.user.findUnique({ where: { id: mfaTestUser.id } });
    assert.strictEqual(userAfterTry1.mfaFailedAttempts, 1, 'Counter must be 1 after try 1');

    // Try 2: Invalid code
    const try2 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });

    assert.strictEqual(try2.statusCode, 400, 'Try 2 must return 400');
    assert.strictEqual(try2.body.error.code, 'INVALID_TOTP', 'Try 2 error must be INVALID_TOTP');
    assert.ok(try2.body.error.message.includes('1 attempt(s) remaining'), 'Try 2 must report 1 attempt remaining');

    const userAfterTry2 = await prisma.user.findUnique({ where: { id: mfaTestUser.id } });
    assert.strictEqual(userAfterTry2.mfaFailedAttempts, 2, 'Counter must be 2 after try 2');

    // Try 3: Invalid code -> Reaches 3 -> Triggers lockout (429) & resets counter to 0
    const try3 = await makeRequest(server, {
      path: '/api/auth/mfa/verify',
      method: 'POST'
    }, {
      mfaToken,
      code: '000000'
    });

    assert.strictEqual(try3.statusCode, 429, 'Try 3 must return 429 MFA_LOCKED');
    assert.strictEqual(try3.body.error.code, 'MFA_LOCKED', 'Try 3 error must be MFA_LOCKED');

    const userAfterTry3 = await prisma.user.findUnique({ where: { id: mfaTestUser.id } });
    assert.strictEqual(userAfterTry3.mfaFailedAttempts, 0, 'Counter must be reset to 0 upon reaching 3');
    assert.ok(userAfterTry3.mfaLockedUntil && new Date(userAfterTry3.mfaLockedUntil) > new Date(), 'mfaLockedUntil must be set to a future date');

    console.log('  ✓ After lock expired, user received 3 fresh attempts (Try 1: 2 left, Try 2: 1 left, Try 3: 429 locked & reset).');

    // Clean up temporary user
    await prisma.user.delete({ where: { id: mfaTestUser.id } });

    console.log('\n=================================================================');
    console.log('🎉 ALL 3 SECURITY TESTS PASSED SUCCESSFULLY WITH 100% ASSERTIONS!');
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
