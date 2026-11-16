process.env.NODE_ENV = 'test';
const app = require('../server');
const { PrismaClient } = require('@prisma/client');
const OTPAuth = require('otpauth');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const PORT = 3098;
let server;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  server = app.listen(PORT);
  console.log(`\n==================================================`);
  console.log(`RUNNING FULL RBAC, ABAC, AND MFA (TOTP) TEST SUITE`);
  console.log(`==================================================\n`);

  try {
    // ----------------------------------------------------
    // STEP 1: CLEAN UP VERIFICATION
    // ----------------------------------------------------
    console.log('--- Step 1: Clean Up Verification ---');
    const deadFiles = [
      'routes/adminChefs.js',
      'routes/adminDishes.js',
      'routes/adminIngredients.js',
      'routes/customer.js',
      'views',
      'test/audit-layout.js',
      'test/verify.js'
    ];
    for (const f of deadFiles) {
      const exists = fs.existsSync(path.join(__dirname, '..', f));
      assert(!exists, `Dead file/folder removed: ${f}`);
    }

    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assert(pkg.dependencies.otpauth === '9.6.0', 'otpauth is pinned to 9.6.0');
    assert(pkg.dependencies.qrcode === '1.5.4', 'qrcode is pinned to 1.5.4');
    assert(!pkg.dependencies.otplib, 'otplib is NOT installed');
    assert(!pkg.dependencies.speakeasy, 'speakeasy is NOT installed');
    assert(!pkg.dependencies.ejs, 'ejs is removed');

    const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
    assert(!schema.includes('model Session'), 'Session model is removed from Prisma schema');
    assert(schema.includes('enum Role'), 'Role enum exists in Prisma schema');
    assert(schema.includes('enum Status'), 'Status enum exists in Prisma schema');
    assert(schema.includes('chefId'), 'User.chefId relation exists in Prisma schema');

    // ----------------------------------------------------
    // STEP 2: PUBLIC / UNAUTHENTICATED ACCESS
    // ----------------------------------------------------
    console.log('\n--- Step 2: Public / Unauthenticated Access ---');
    const resDishes = await fetch(`http://localhost:${PORT}/api/dishes`);
    assert(resDishes.status === 200, 'Public GET /api/dishes returns 200');
    const dishesData = await resDishes.json();
    const dishItems = dishesData.data?.items || dishesData.data;
    assert(dishesData.ok && Array.isArray(dishItems), 'Public GET /api/dishes returns dish list');

    const resChefsUnauth = await fetch(`http://localhost:${PORT}/api/chefs`);
    assert(resChefsUnauth.status === 401, 'Unauthenticated GET /api/chefs returns 401 (only dishes are public)');

    const resIngUnauth = await fetch(`http://localhost:${PORT}/api/ingredients`);
    assert(resIngUnauth.status === 401, 'Unauthenticated GET /api/ingredients returns 401 (only dishes are public)');

    // Unauthenticated create dish
    const resUnauthPost = await fetch(`http://localhost:${PORT}/api/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker Dish', price: 99, category: 'Main Course' })
    });
    assert(resUnauthPost.status === 401, 'Unauthenticated POST /api/dishes returns 401');
    const unauthData = await resUnauthPost.json();
    assert(unauthData.error && unauthData.error.code === 'UNAUTHENTICATED', 'Returns UNAUTHENTICATED error code');
    assert(unauthData.error.message.includes('sign in'), 'Returns natural language error message');

    // ----------------------------------------------------
    // STEP 3: VIEWER LOGIN & RBAC RESTRICTIONS
    // ----------------------------------------------------
    console.log('\n--- Step 3: Viewer Login & RBAC Restrictions ---');
    const resViewerLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'viewer@gmail.com', password: 'Viewer123!' })
    });
    assert(resViewerLogin.status === 200, 'Viewer login returns 200');
    const viewerLoginData = await resViewerLogin.json();
    assert(viewerLoginData.ok && !viewerLoginData.mfaRequired, 'Viewer logs in directly without MFA initially');
    const viewerCookie = resViewerLogin.headers.get('set-cookie');
    assert(viewerCookie && viewerCookie.includes('auth_token='), 'Viewer receives auth_token cookie');

    // Viewer can view dishes
    const resViewerDishes = await fetch(`http://localhost:${PORT}/api/dishes`, {
      headers: { Cookie: viewerCookie }
    });
    assert(resViewerDishes.status === 200, 'Viewer can view /api/dishes');

    // Viewer CANNOT create dish (403 FORBIDDEN)
    const resViewerPost = await fetch(`http://localhost:${PORT}/api/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: viewerCookie },
      body: JSON.stringify({ name: 'Viewer Dish', price: 20, category: 'Main Course' })
    });
    assert(resViewerPost.status === 403, 'Viewer POST /api/dishes returns 403 FORBIDDEN');
    const viewerPostData = await resViewerPost.json();
    assert(viewerPostData.error && viewerPostData.error.code === 'FORBIDDEN', 'Error code is FORBIDDEN');
    assert(viewerPostData.error.message.includes('permission'), 'Natural language error message for forbidden action');

    // Viewer CANNOT access admin users
    const resViewerAdmin = await fetch(`http://localhost:${PORT}/api/admin/users`, {
      headers: { Cookie: viewerCookie }
    });
    assert(resViewerAdmin.status === 403, 'Viewer GET /api/admin/users returns 403 FORBIDDEN');

    // ----------------------------------------------------
    // STEP 4: TOTP MFA (CHEF LOGIN, RECOVERY CODE, TOTP)
    // ----------------------------------------------------
    console.log('\n--- Step 4: Chef Login, Recovery Code, & TOTP ---');
    // Ensure Chef failed attempts are reset
    await prisma.user.update({
      where: { email: 'chef@gmail.com' },
      data: { mfaFailedAttempts: 0, recoveryCodeAttempts: 0, mfaLockedUntil: null, failedLoginAttempts: 0, lockoutUntil: null }
    });

    const resChefLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'chef@gmail.com', password: 'Chef123!' })
    });
    assert(resChefLogin.status === 200, 'Chef login phase 1 returns 200');
    const chefLoginData = await resChefLogin.json();
    assert(chefLoginData.ok && chefLoginData.mfaRequired === true, 'Chef login requires MFA');
    assert(typeof chefLoginData.mfaToken === 'string', 'Chef receives temporary mfaToken');

    // Test invalid TOTP
    const resInvalidTotp = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: chefLoginData.mfaToken, code: '000000' })
    });
    assert(resInvalidTotp.status === 400, 'Invalid TOTP returns 400');
    const invalidTotpData = await resInvalidTotp.json();
    assert(invalidTotpData.error.code === 'INVALID_TOTP', 'Error code is INVALID_TOTP');

    // Test valid recovery code verification
    const resRecoveryVerify = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: chefLoginData.mfaToken, code: 'A1B2-C3D4', isRecoveryCode: true })
    });
    assert(resRecoveryVerify.status === 200, 'Valid recovery code successfully authenticates');
    const recoveryVerifyData = await resRecoveryVerify.json();
    assert(recoveryVerifyData.ok && recoveryVerifyData.user.role === 'CHEF', 'User authenticated as CHEF');
    const chefCookieFromRecovery = resRecoveryVerify.headers.get('set-cookie');
    assert(chefCookieFromRecovery.includes('auth_token='), 'Chef receives session cookie');

    // Test recovery code single-use disablement
    const resChefLogin2 = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'chef@gmail.com', password: 'Chef123!' })
    });
    const chefLoginData2 = await resChefLogin2.json();
    const resReuseRecovery = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: chefLoginData2.mfaToken, code: 'A1B2-C3D4', isRecoveryCode: true })
    });
    assert(resReuseRecovery.status === 400, 'Used recovery code is disabled and cannot be reused');

    // Test valid TOTP using otpauth:9.6.0
    const chefTotp = new OTPAuth.TOTP({
      issuer: 'BHT Diner',
      label: 'chef@gmail.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
    });
    const validChefCode = chefTotp.generate();

    const resValidTotp = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: chefLoginData2.mfaToken, code: validChefCode })
    });
    assert(resValidTotp.status === 200, 'Valid TOTP code successfully authenticates');
    const chefCookie = resValidTotp.headers.get('set-cookie');
    assert(chefCookie.includes('auth_token='), 'Chef receives session cookie via TOTP');

    // ----------------------------------------------------
    // STEP 5: CHEF ABAC ENFORCEMENT
    // ----------------------------------------------------
    console.log('\n--- Step 5: Chef ABAC Enforcement ---');
    // Chef can see all views
    const resChefDishes = await fetch(`http://localhost:${PORT}/api/dishes`, {
      headers: { Cookie: chefCookie }
    });
    assert(resChefDishes.status === 200, 'Chef can view all dishes');

    // Fetch chef Marco's dishes and chef Isabella/Kenji's dishes
    const chefUserRecord = await prisma.user.findUnique({
      where: { email: 'chef@gmail.com' },
      include: { chef: true }
    });
    const chefMarcoId = chefUserRecord.chefId; // 1

    const otherChef = await prisma.chef.findFirst({
      where: { id: { not: chefMarcoId } }
    });

    // 1. Chef creates dish with own chefId
    const resChefCreateOwn = await fetch(`http://localhost:${PORT}/api/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: chefCookie },
      body: JSON.stringify({
        name: `Chef Marco Special ${Date.now()}`,
        description: 'Delicious homemade pasta',
        price: 24.5,
        category: 'Main Course',
        chefId: chefMarcoId
      })
    });
    assert(resChefCreateOwn.status === 200, 'Chef can create dish with own chefId');
    const createdDishData = await resChefCreateOwn.json();
    const createdDishId = createdDishData.data.id;

    // 2. Chef CANNOT create dish with someone else's chefId
    const resChefCreateOther = await fetch(`http://localhost:${PORT}/api/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: chefCookie },
      body: JSON.stringify({
        name: `Illegal Dish ${Date.now()}`,
        price: 30,
        category: 'Main Course',
        chefId: otherChef.id
      })
    });
    assert(resChefCreateOther.status === 403, 'Chef CANNOT create dish with another chefId (403)');
    const chefCreateOtherData = await resChefCreateOther.json();
    assert(chefCreateOtherData.error.message.includes('own chef profile'), 'Chef create policy message verified');

    // 3. Chef CAN update their own dish
    const resChefUpdateOwn = await fetch(`http://localhost:${PORT}/api/dishes/${createdDishId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: chefCookie },
      body: JSON.stringify({
        name: `Chef Marco Special Updated`,
        price: 26.0,
        category: 'Main Course',
        chefId: chefMarcoId
      })
    });
    assert(resChefUpdateOwn.status === 200, 'Chef can update dish cooked by them');

    // 4. Chef CANNOT steal or transfer dish (change chefId on update)
    const resChefTransfer = await fetch(`http://localhost:${PORT}/api/dishes/${createdDishId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: chefCookie },
      body: JSON.stringify({
        name: `Chef Marco Special Transferred`,
        price: 26.0,
        category: 'Main Course',
        chefId: otherChef.id
      })
    });
    assert(resChefTransfer.status === 403, 'Chef CANNOT change chefId on update (403)');

    // 5. Chef CANNOT update another chef's dish
    // Find or create a dish belonging to otherChef
    const otherDish = await prisma.dish.findFirst({
      where: { chefId: otherChef.id }
    });
    if (otherDish) {
      const resChefUpdateOther = await fetch(`http://localhost:${PORT}/api/dishes/${otherDish.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: chefCookie },
        body: JSON.stringify({
          name: 'Tampered Dish',
          price: 50,
          category: otherDish.category
        })
      });
      assert(resChefUpdateOther.status === 403, 'Chef CANNOT edit dish they do not cook (403)');
    }

    // 6. Chef CANNOT delete dishes (only ADMIN)
    const resChefDelete = await fetch(`http://localhost:${PORT}/api/dishes/${createdDishId}`, {
      method: 'DELETE',
      headers: { Cookie: chefCookie }
    });
    assert(resChefDelete.status === 403, 'Chef CANNOT delete dishes (403 FORBIDDEN)');
    const chefDeleteData = await resChefDelete.json();
    assert(chefDeleteData.error.message.includes('administrators'), 'Natural language error message: only administrators can delete dishes');

    // ----------------------------------------------------
    // STEP 6: ADMIN LOGIN & ABAC ENFORCEMENT
    // ----------------------------------------------------
    console.log('\n--- Step 6: Admin Login & ABAC Enforcement ---');
    await prisma.user.update({
      where: { email: 'admin@gmail.com' },
      data: { mfaFailedAttempts: 0, recoveryCodeAttempts: 0, mfaLockedUntil: null, failedLoginAttempts: 0, lockoutUntil: null }
    });

    const resAdminLogin = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@gmail.com', password: 'Admin123!' })
    });
    assert(resAdminLogin.status === 200, 'Admin login phase 1 returns 200');
    const adminLoginData = await resAdminLogin.json();

    const adminTotp = new OTPAuth.TOTP({
      issuer: 'BHT Diner',
      label: 'admin@gmail.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP')
    });
    const resAdminVerify = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: adminLoginData.mfaToken, code: adminTotp.generate() })
    });
    assert(resAdminVerify.status === 200, 'Admin MFA verification returns 200');
    const adminCookie = resAdminVerify.headers.get('set-cookie');

    // Admin can delete any dish (e.g. the one created in step 5)
    const resAdminDelete = await fetch(`http://localhost:${PORT}/api/dishes/${createdDishId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    assert(resAdminDelete.status === 200, 'Admin CAN delete dishes');

    // Admin ABAC 1: Admin cannot change their own role
    const adminUserRecord = await prisma.user.findUnique({ where: { email: 'admin@gmail.com' } });
    const resAdminSelfDemote = await fetch(`http://localhost:${PORT}/api/admin/users/${adminUserRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ role: 'VIEWER' })
    });
    assert(resAdminSelfDemote.status === 403, 'Admin cannot change their own role (403)');
    const selfDemoteData = await resAdminSelfDemote.json();
    assert(selfDemoteData.error.message.includes('alter their own role'), 'Self-demotion error message confirmed');

    // Admin ABAC 2: Admin cannot assign a chefId already linked to another user
    const viewerRecord = await prisma.user.findUnique({ where: { email: 'viewer@gmail.com' } });
    const resDuplicateChefAssign = await fetch(`http://localhost:${PORT}/api/admin/users/${viewerRecord.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ chefId: chefMarcoId }) // Chef Marco is already linked to chef@gmail.com!
    });
    assert(resDuplicateChefAssign.status === 403, 'Admin cannot assign already linked chefId (403)');
    const duplicateChefData = await resDuplicateChefAssign.json();
    assert(duplicateChefData.error.message.includes('already linked'), 'Duplicate chef assignment policy error confirmed');

    // ----------------------------------------------------
    // STEP 7: VIEWER OPTIONAL MFA FLOW & CLOCK DRIFT
    // ----------------------------------------------------
    console.log('\n--- Step 7: Viewer Optional MFA Flow & Clock Drift ---');
    // Viewer requests setup
    const resViewerMfaSetup = await fetch(`http://localhost:${PORT}/api/auth/mfa/setup`, {
      method: 'POST',
      headers: { Cookie: viewerCookie }
    });
    assert(resViewerMfaSetup.status === 200, 'Viewer can request MFA setup');
    const mfaSetupData = await resViewerMfaSetup.json();
    assert(mfaSetupData.ok && mfaSetupData.secret && mfaSetupData.qrCode, 'Setup returns QR code and secret');
    assert(Array.isArray(mfaSetupData.recoveryCodes) && mfaSetupData.recoveryCodes.length === 10, 'Setup generates exactly 10 recovery codes');

    // Viewer confirms setup with valid TOTP
    const viewerTotp = new OTPAuth.TOTP({
      issuer: 'BHT Diner',
      label: 'viewer@gmail.com',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(mfaSetupData.secret)
    });
    const resViewerConfirm = await fetch(`http://localhost:${PORT}/api/auth/mfa/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: viewerCookie },
      body: JSON.stringify({ code: viewerTotp.generate() })
    });
    assert(resViewerConfirm.status === 200, 'Viewer confirms MFA setup with TOTP code');

    // Check user record in DB: mfaEnabled is now true, drift is recorded
    const updatedViewer = await prisma.user.findUnique({ where: { email: 'viewer@gmail.com' } });
    assert(updatedViewer.mfaEnabled === true, 'Viewer mfaEnabled is now true');
    assert(typeof updatedViewer.mfaDrift === 'number', 'Viewer mfaDrift is saved');

    // Viewer logs in again -> Now requires MFA!
    const resViewerLoginMfa = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'viewer@gmail.com', password: 'Viewer123!' })
    });
    const viewerLoginMfaData = await resViewerLoginMfa.json();
    assert(viewerLoginMfaData.mfaRequired === true, 'Viewer now requires MFA upon login');

    // Viewer disables MFA
    const resViewerDisable = await fetch(`http://localhost:${PORT}/api/auth/mfa/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: viewerCookie },
      body: JSON.stringify({ code: viewerTotp.generate() })
    });
    assert(resViewerDisable.status === 200, 'Viewer disables MFA');
    const viewerDisabled = await prisma.user.findUnique({ where: { email: 'viewer@gmail.com' } });
    assert(viewerDisabled.mfaEnabled === false, 'Viewer mfaEnabled is now false');

    // ----------------------------------------------------
    // STEP 8: MFA LOCKOUT (3 FAILED TRIES -> 5 MIN LOCKOUT)
    // ----------------------------------------------------
    console.log('\n--- Step 8: MFA Lockout (3 Failed Tries -> 5 Min Lockout) ---');
    // Login as admin phase 1 to get token
    const resAdminLoginForLock = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@gmail.com', password: 'Admin123!' })
    });
    const adminLockToken = (await resAdminLoginForLock.json()).mfaToken;

    // Fail 1
    const f1 = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: adminLockToken, code: '111111' })
    });
    assert(f1.status === 400, 'Failed MFA try 1 returns 400');

    // Fail 2
    const f2 = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: adminLockToken, code: '222222' })
    });
    assert(f2.status === 400, 'Failed MFA try 2 returns 400');

    // Fail 3 -> Must trigger 5-minute lockout (429)
    const f3 = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: adminLockToken, code: '333333' })
    });
    assert(f3.status === 429, 'Failed MFA try 3 returns 429 MFA_LOCKED');
    const f3Data = await f3.json();
    assert(f3Data.error.code === 'MFA_LOCKED', 'Error code is MFA_LOCKED');
    assert(f3Data.error.message.includes('5 minutes'), 'Lockout message mentions 5 minutes');

    // Immediate attempt is still locked
    const f4 = await fetch(`http://localhost:${PORT}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: adminLockToken, code: adminTotp.generate() })
    });
    assert(f4.status === 429, 'Admin is locked out even with valid code during lockout period');

    // Other account (Viewer) is NOT locked out (scope is per-account)
    const resViewerUnimpacted = await fetch(`http://localhost:${PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'viewer@gmail.com', password: 'Viewer123!' })
    });
    assert(resViewerUnimpacted.status === 200, 'Viewer account login is unaffected by admin lockout (per-account scope)');

    // Reset admin lockout for clean state
    await prisma.user.update({
      where: { email: 'admin@gmail.com' },
      data: { mfaFailedAttempts: 0, mfaLockedUntil: null }
    });

    console.log('\n🎉 ALL RBAC, ABAC, AND TOTP MFA TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('\n❌ Test run failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTests();
