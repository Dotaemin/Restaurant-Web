const app = require('../server');

let server;
const PORT = 3099;

async function runVerification() {
  server = app.listen(PORT);
  console.log(`\n================================================================`);
  console.log(`🔍 B.H.T Diner Full-Text Search, Pagination & API Verification`);
  console.log(`================================================================`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    const BASE = `http://localhost:${PORT}`;

    // 1. CORS Headers Test
    const resCors = await fetch(`${BASE}/api/dishes`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    const allowOrigin = resCors.headers.get('access-control-allow-origin');
    assert(allowOrigin === 'http://localhost:5173', 'CORS allows exact origin http://localhost:5173 (not *)', `Received: ${allowOrigin}`);

    // 2. Customer GET /api/dishes - Response shape & default pagination
    const resDishes = await fetch(`${BASE}/api/dishes`);
    const dishesData = await resDishes.json();
    assert(resDishes.status === 200, 'Customer GET /api/dishes returns HTTP 200');
    assert(dishesData.ok === true, 'Customer GET /api/dishes has ok: true');
    assert(dishesData.error === null, 'Customer GET /api/dishes has error: null');
    assert(Array.isArray(dishesData.data?.items), 'Customer GET /api/dishes has data.items array');
    assert(dishesData.data?.items?.length === 12, 'Customer GET /api/dishes defaults to pageSize = 12', `Length: ${dishesData.data?.items?.length}`);
    assert(dishesData.data?.meta?.total === 1000, 'Customer GET /api/dishes meta.total === 1000', `Total: ${dishesData.data?.meta?.total}`);
    assert(dishesData.data?.meta?.page === 1, 'Customer GET /api/dishes meta.page === 1');
    assert(dishesData.data?.meta?.pageSize === 12, 'Customer GET /api/dishes meta.pageSize === 12');

    // 3. Customer GET /api/dishes?page=2
    const resDishesP2 = await fetch(`${BASE}/api/dishes?page=2`);
    const dishesP2Data = await resDishesP2.json();
    assert(dishesP2Data.ok === true && dishesP2Data.data?.items?.length === 12, 'GET /api/dishes?page=2 returns 12 items on page 2');
    assert(dishesP2Data.data?.meta?.page === 2, 'GET /api/dishes?page=2 meta.page === 2');

    // 4. Out of bounds page: GET /api/dishes?page=9999
    const resDishesOOB = await fetch(`${BASE}/api/dishes?page=9999`);
    const dishesOOBData = await resDishesOOB.json();
    assert(resDishesOOB.status === 200, 'Out of bounds page returns HTTP 200');
    assert(dishesOOBData.ok === true, 'Out of bounds page has ok: true');
    assert(Array.isArray(dishesOOBData.data?.items) && dishesOOBData.data?.items?.length === 0, 'Out of bounds page returns items: [] (empty array)');
    assert(dishesOOBData.data?.meta?.total === 1000, 'Out of bounds page retains meta.total === 1000');

    // 5. Invalid page input: GET /api/dishes?page=-5
    const resDishesInvalid = await fetch(`${BASE}/api/dishes?page=-5`);
    const dishesInvalidData = await resDishesInvalid.json();
    assert(resDishesInvalid.status === 200, 'Invalid page request returns HTTP 200');
    assert(dishesInvalidData.ok === false, 'Invalid page request has ok: false');
    assert(dishesInvalidData.error?.code === 'VALIDATION_FAILED', 'Invalid page request error code is VALIDATION_FAILED');
    assert(dishesInvalidData.error?.fields?.page, 'Invalid page request flags page in fields');

    // 6. Non-numeric page input: GET /api/dishes?page=abc
    const resDishesNonNumeric = await fetch(`${BASE}/api/dishes?page=abc`);
    const dishesNonNumericData = await resDishesNonNumeric.json();
    assert(resDishesNonNumeric.status === 200 && dishesNonNumericData.ok === false && dishesNonNumericData.error?.code === 'VALIDATION_FAILED', 'Non-numeric page returns HTTP 200 with VALIDATION_FAILED');

    // 7. Server-Side Postgres Full-Text Search: GET /api/dishes?search=phở
    const resSearch = await fetch(`${BASE}/api/dishes?search=phở`);
    const searchData = await resSearch.json();
    assert(searchData.ok === true, 'Postgres FTS search returns ok: true');
    assert(searchData.data?.items?.length > 0, `Postgres FTS search returns matching dishes (${searchData.data?.items?.length} returned)`);
    assert(searchData.data?.meta?.total > 0 && searchData.data?.meta?.total <= 1000, `Postgres FTS calculates total matching count (${searchData.data?.meta?.total})`);

    // 8. Admin GET /api/admin/dishes - Default pageSize = 20
    const resAdminDishes = await fetch(`${BASE}/api/admin/dishes`);
    const adminDishesData = await resAdminDishes.json();
    assert(resAdminDishes.status === 200, 'Admin GET /api/admin/dishes returns HTTP 200');
    assert(adminDishesData.ok === true, 'Admin GET /api/admin/dishes has ok: true');
    assert(adminDishesData.data?.items?.length === 20, `Admin GET /api/admin/dishes defaults to pageSize = 20 (got ${adminDishesData.data?.items?.length})`);
    assert(adminDishesData.data?.meta?.total === 1000, `Admin GET /api/admin/dishes meta.total === 1000 (got ${adminDishesData.data?.meta?.total})`);
    assert(adminDishesData.data?.meta?.pageSize === 20, 'Admin GET /api/admin/dishes meta.pageSize === 20');

    // 9. Admin GET /api/admin/chefs - Default pageSize = 20
    const resAdminChefs = await fetch(`${BASE}/api/admin/chefs`);
    const adminChefsData = await resAdminChefs.json();
    assert(resAdminChefs.status === 200, 'Admin GET /api/admin/chefs returns HTTP 200');
    assert(adminChefsData.ok === true, 'Admin GET /api/admin/chefs has ok: true');
    assert(adminChefsData.data?.items?.length === 20, `Admin GET /api/admin/chefs defaults to pageSize = 20 (got ${adminChefsData.data?.items?.length})`);
    assert(adminChefsData.data?.meta?.total === 50, `Admin GET /api/admin/chefs meta.total === 50 (got ${adminChefsData.data?.meta?.total})`);

    // 10. Admin GET /api/admin/ingredients - Default pageSize = 20
    const resAdminIngs = await fetch(`${BASE}/api/admin/ingredients`);
    const adminIngsData = await resAdminIngs.json();
    assert(resAdminIngs.status === 200, 'Admin GET /api/admin/ingredients returns HTTP 200');
    assert(adminIngsData.ok === true, 'Admin GET /api/admin/ingredients has ok: true');
    assert(adminIngsData.data?.items?.length === 20, `Admin GET /api/admin/ingredients defaults to pageSize = 20 (got ${adminIngsData.data?.items?.length})`);
    assert(adminIngsData.data?.meta?.total === 50, `Admin GET /api/admin/ingredients meta.total === 50 (got ${adminIngsData.data?.meta?.total})`);

    // 11. Single dish GET /api/dishes/:id
    const sampleDishId = dishesData.data?.items[0]?.id;
    const resSingleDish = await fetch(`${BASE}/api/dishes/${sampleDishId}`);
    const singleDishData = await resSingleDish.json();
    assert(resSingleDish.status === 200 && singleDishData.ok === true && singleDishData.data?.id === sampleDishId, `Single dish GET /api/dishes/${sampleDishId} returns dish data`);

    // 12. Invalid dish ID
    const resInvalidDish = await fetch(`${BASE}/api/dishes/999999`);
    const invalidDishData = await resInvalidDish.json();
    assert(resInvalidDish.status === 200 && invalidDishData.ok === false && invalidDishData.error?.code === 'NOT_FOUND', 'Invalid dish ID returns HTTP 200 with code NOT_FOUND');

    // 13. Technical 404 Route
    const res404 = await fetch(`${BASE}/api/non-existent-endpoint-test`);
    const json404 = await res404.json();
    assert(res404.status === 404, 'Technical invalid URL returns HTTP 404');
    assert(!('ok' in json404), 'Technical 404 does NOT contain "ok" attribute in body');

    console.log(`\n================================================================`);
    console.log(`Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`================================================================\n`);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runVerification();
