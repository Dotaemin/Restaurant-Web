const assert = require('assert');
const m = require('../lib/mfa');

const secret = m.generateMfaSecret();
const totp = m.createTotpInstance(secret, 'drift@test.com');

// Freeze the server clock in the middle of a 30s step so results are deterministic
const STEP = 59830000;
const FIXED = STEP * 30000 + 15000;
Date.now = () => FIXED;
// What an authenticator whose clock is off by `offsetSeconds` would display
const codeAt = (offsetSeconds) => totp.generate({ timestamp: FIXED + offsetSeconds * 1000 });

let n = 0;
const ok = (name, fn) => { fn(); console.log('  ✓', name); n++; };

console.log('QR setup (records drift, limit +/-30s)');
ok('device in sync -> drift 0',      () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(0)).driftSeconds, 0));
ok('device 30s ahead -> drift +30',  () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(30)).driftSeconds, 30));
ok('device 30s behind -> drift -30', () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(-30)).driftSeconds, -30));
ok('device 60s ahead is rejected',   () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(60)).valid, false));
ok('device 60s behind is rejected',  () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(-60)).valid, false));
ok('setup returns matched step',     () => assert.strictEqual(m.verifyInitialToken(totp, codeAt(30)).step, STEP + 1));

console.log('Login (previous/next code accepted, drift re-recorded)');
ok('saved 0: previous code accepted, records -30',  () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(-30), 0, null).driftSeconds, -30));
ok('saved 0: next code accepted, records +30',      () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(30), 0, null).driftSeconds, 30));
ok('saved 0: current code keeps drift 0',           () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(0), 0, null).driftSeconds, 0));
ok('saved +30, device unchanged: drift stays +30',  () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(30), 30, null).driftSeconds, 30));
ok('saved +30, device now in sync: records 0',      () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(0), 30, null).driftSeconds, 0));
ok('saved +30, device now +60 -> rejected (limit)', () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(60), 30, null), null));
ok('saved 0, device 60s off -> rejected',           () => assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(60), 0, null), null));
ok('wrong code -> null',                            () => assert.strictEqual(m.verifyTokenWithDrift(totp, '000000', 0, null), null));
ok('replay of same step rejected', () => {
  const r = m.verifyTokenWithDrift(totp, codeAt(0), 0, null);
  assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(0), 0, r.step), null);
});
ok('older step rejected after newer used', () => {
  const r = m.verifyTokenWithDrift(totp, codeAt(30), 0, null);
  assert.strictEqual(m.verifyTokenWithDrift(totp, codeAt(-30), 0, r.step), null);
});

console.log(`\nAll ${n} drift checks passed.`);