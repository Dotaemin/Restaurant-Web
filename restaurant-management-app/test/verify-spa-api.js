const app = require('../server');
const fs = require('fs');
const path = require('path');

let server;
const PORT = 3098;

async function runComprehensiveVerification() {
  server = app.listen(PORT);
  console.log(`\n======================================================`);
  console.log(`🔍 B.H.T Diner Resource-Based REST API & SPA Verification`);
  console.log(`======================================================`);

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
    const resCors = await fetch(`http://localhost:${PORT}/api/dishes`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    const allowOrigin = resCors.headers.get('access-control-allow-origin');
    assert(allowOrigin === 'http://localhost:5173', 'CORS allows exact origin http://localhost:5173 (not *)', `Received: ${allowOrigin}`);

    // 2. Customer GET /api/dishes
    const dishesData = await resCors.json();
    assert(resCors.status === 200, 'Customer GET /api/dishes returns HTTP 200');
    assert(dishesData.ok === true && Array.isArray(dishesData.data?.items), 'Customer GET /api/dishes has { ok: true, data: { items: [...] } }');

    // 3. Customer GET /api/dishes/:invalidId
    const resDishNotFound = await fetch(`http://localhost:${PORT}/api/dishes/999999`);
    const dishNotFoundData = await resDishNotFound.json();
    assert(resDishNotFound.status === 200, 'GET /api/dishes/999999 returns HTTP 200');
    assert(dishNotFoundData.ok === false && dishNotFoundData.error?.code === 'NOT_FOUND', 'GET /api/dishes/999999 returns code "NOT_FOUND"');

    // 4. Admin GET /api/admin/dishes
    const resAdminDishes = await fetch(`http://localhost:${PORT}/api/admin/dishes`);
    const adminDishesData = await resAdminDishes.json();
    assert(resAdminDishes.status === 200, 'Admin GET /api/admin/dishes returns HTTP 200');
    assert(adminDishesData.ok === true && Array.isArray(adminDishesData.data?.items), 'Admin GET /api/admin/dishes returns data list');

    // 5. Admin POST /api/admin/dishes - Mandatory imageUrl validation check
    const resMissingImage = await fetch(`http://localhost:${PORT}/api/admin/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Missing Image Dish',
        price: '19.99',
        category: 'Main Course',
        chefId: 1,
        description: 'Test description',
        ingredientIds: [1],
        imageUrl: '' // Intentionally empty!
      })
    });
    const missingImageData = await resMissingImage.json();
    assert(resMissingImage.status === 200, 'POST /api/admin/dishes with missing imageUrl returns HTTP 200');
    assert(
      missingImageData.ok === false &&
      missingImageData.error?.code === 'VALIDATION_FAILED' &&
      missingImageData.error?.fields?.imageUrl,
      'POST /api/admin/dishes flags missing imageUrl as required'
    );

    // 6. Admin POST /api/admin/dishes - Create valid dish
    const resChefsPre = await fetch(`http://localhost:${PORT}/api/admin/chefs`);
    const chefsPreData = await resChefsPre.json();
    const realChefId = (chefsPreData.data?.items || chefsPreData.data)[0].id;

    const resIngsPre = await fetch(`http://localhost:${PORT}/api/admin/ingredients`);
    const ingsPreData = await resIngsPre.json();
    const realIngId = (ingsPreData.data?.items || ingsPreData.data)[0].id;

    const resCreateDish = await fetch(`http://localhost:${PORT}/api/admin/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Automated Test Dish ${Date.now()}`,
        price: '28.50',
        category: 'Main Course',
        chefId: realChefId,
        description: 'Delicious automated test ribeye',
        ingredientIds: [realIngId],
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c'
      })
    });
    const createDishData = await resCreateDish.json();
    assert(createDishData.ok === true && createDishData.data?.id, 'POST /api/admin/dishes creates dish successfully');
    const createdDishId = createDishData.data?.id;

    // 7. Admin Update with Method Override: PATCH (POST /api/admin/dishes/:id)
    const resUpdateOverride = await fetch(`http://localhost:${PORT}/api/admin/dishes/${createdDishId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HTTP-Method-Override': 'PATCH'
      },
      body: JSON.stringify({
        name: `Updated Ribeye ${Date.now()}`,
        price: '34.00',
        _method: 'PATCH'
      })
    });
    const updateOverrideData = await resUpdateOverride.json();
    assert(updateOverrideData.ok === true && parseFloat(updateOverrideData.data?.price) === 34, 'POST with X-HTTP-Method-Override: PATCH updates dish successfully');

    // 8. Admin Delete with Method Override: DELETE (POST /api/admin/dishes/:id)
    const resDeleteOverride = await fetch(`http://localhost:${PORT}/api/admin/dishes/${createdDishId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HTTP-Method-Override': 'DELETE'
      },
      body: JSON.stringify({
        _method: 'DELETE'
      })
    });
    const deleteOverrideData = await resDeleteOverride.json();
    assert(deleteOverrideData.ok === true, 'POST with X-HTTP-Method-Override: DELETE deletes dish successfully');

    // 9. Admin GET /api/admin/chefs
    const resChefs = await fetch(`${BASE}/api/admin/chefs`);
    const chefsData = await resChefs.json();
    assert(resChefs.status === 200, 'Admin GET /api/admin/chefs returns HTTP 200');
    assert(chefsData.ok === true && Array.isArray(chefsData.data?.items), 'Admin GET /api/admin/chefs returns { ok: true, data: { items: [...] } }');

    // 10. Admin POST /api/admin/chefs validation
    const resChefVal = await fetch(`${BASE}/api/admin/chefs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', specialty: '' })
    });
    const chefValData = await resChefVal.json();
    assert(resChefVal.status === 200, 'POST /api/admin/chefs empty body returns HTTP 200');
    assert(chefValData.ok === false && chefValData.error?.code === 'VALIDATION_FAILED', 'POST /api/admin/chefs returns VALIDATION_FAILED');

    // 11. Admin GET /api/admin/ingredients
    const resIngs = await fetch(`${BASE}/api/admin/ingredients`);
    const ingsData = await resIngs.json();
    assert(resIngs.status === 200, 'Admin GET /api/admin/ingredients returns HTTP 200');
    assert(ingsData.ok === true && Array.isArray(ingsData.data?.items), 'Admin GET /api/admin/ingredients returns { ok: true, data: { items: [...] } }');

    // 12. Admin POST /api/admin/ingredients validation (invalid unit)
    const resIngVal = await fetch(`http://localhost:${PORT}/api/admin/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Exotic Spice', unit: 'unsupported_unit' })
    });
    const ingValData = await resIngVal.json();
    assert(resIngVal.status === 200, 'POST /api/admin/ingredients invalid unit returns HTTP 200');
    assert(ingValData.ok === false && ingValData.error?.code === 'VALIDATION_FAILED' && ingValData.error?.fields?.unit, 'POST /api/admin/ingredients flags invalid unit in fields');

    // 13. Invalid URL Technical 404 Error (No "ok" property)
    const resTechnical404 = await fetch(`http://localhost:${PORT}/api/invalid-url-path`);
    const data404 = await resTechnical404.json();
    assert(resTechnical404.status === 404, 'Invalid URL returns HTTP 404');
    assert(!('ok' in data404), 'Technical 404 response does NOT contain "ok" attribute', JSON.stringify(data404));

    // 14. Client SPA Build Check
    const distIndex = path.join(__dirname, '../client/dist/index.html');
    assert(fs.existsSync(distIndex), 'Client React SPA built successfully and dist/index.html exists');

    console.log(`\n======================================================`);
    console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Unexpected test execution failure:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runComprehensiveVerification();
