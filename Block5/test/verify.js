process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = 'file:./dev.db';
require('dotenv').config();

const http = require('http');
const assert = require('assert');
const app = require('../server');
const prisma = require('../lib/prisma');
const runCleanup = require('../scripts/cleanup');

const PORT = 4055;
let server;
let adminSid = null;

function request(method, pathUrl, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    let postData = null;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BHT-Diner-Browser',
      ...extraHeaders
    };

    if (adminSid && !headers.Cookie && !('Cookie' in extraHeaders)) {
      headers.Cookie = `sid=${adminSid}`;
    }

    if (body) {
      if (typeof body === 'string') {
        postData = body;
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        const params = new URLSearchParams();
        for (const [key, val] of Object.entries(body)) {
          if (Array.isArray(val)) {
            val.forEach(v => params.append(key, v));
          } else {
            params.append(key, val);
          }
        }
        postData = params.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: 'localhost',
      port: PORT,
      path: pathUrl,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
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
  console.log('====================================================');
  console.log('🧪 Starting Restaurant Management Application Tests');
  console.log('====================================================');

  server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 600));

  try {
    // Setup Admin Test Session for Protected Routes
    let adminUser = await prisma.user.findFirst({ where: { role: 'Admin', status: 'active' } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          username: `verify_admin_${Date.now()}`,
          email: `verify_admin_${Date.now()}@gmail.com`,
          passwordHash: '$2b$10$abcdefghijklmnopqrstuu',
          salt: '12345',
          role: 'Admin',
          status: 'active',
          emailVerifiedAt: new Date()
        }
      });
    }
    adminSid = `verify_sid_${Date.now()}`;
    await prisma.session.create({
      data: {
        sid: adminSid,
        userId: adminUser.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    // 1. Root redirect check
    console.log('1. Testing GET / -> Redirect 303 to /dishes...');
    const rootRes = await request('GET', '/');
    assert.strictEqual(rootRes.statusCode, 303, `Expected 303, got ${rootRes.statusCode}`);
    assert.strictEqual(rootRes.headers.location, '/dishes');
    console.log('   ✓ GET / redirected with 303 to /dishes');

    // 2. Customer Menu List
    console.log('2. Testing GET /dishes...');
    const dishesRes = await request('GET', '/dishes');
    assert.strictEqual(dishesRes.statusCode, 200, `Expected 200, got ${dishesRes.statusCode}`);
    assert(dishesRes.body.includes('B.H.T Diner'), 'Body should include brand B.H.T Diner');
    assert(dishesRes.body.includes('dish-button'), 'Body should render dish-button blocks');
    assert(dishesRes.body.includes('category-pill'), 'Body should include category selection rounded rectangles');
    assert(!dishesRes.body.includes('<script src='), 'Strict SSR: Body should not include script tags');
    console.log('   ✓ GET /dishes renders cards with zero client scripts');

    // 3. Customer Dish Details
    const existingDish = await prisma.dish.findFirst();
    const targetDishId = existingDish ? existingDish.id : 1;
    console.log(`3. Testing GET /dishes/${targetDishId} (Valid ID)...`);
    const dish1Res = await request('GET', `/dishes/${targetDishId}`);
    assert.strictEqual(dish1Res.statusCode, 200, `Expected 200, got ${dish1Res.statusCode}`);
    assert(dish1Res.body.includes('spinning-cutlery'), 'Body should include knife and fork transition animation');
    assert(dish1Res.body.includes('page-pull-overlay'), 'Body should include page pull transition overlay');
    assert(dish1Res.body.includes('Ingredients'), 'Body should include Ingredients');
    console.log(`   ✓ GET /dishes/${targetDishId} renders detail page with knife & fork spinning pull transition`);

    // 4. Dedicated 404 Error Page: Non-existent Dish ID
    console.log('4. Testing 404 Error Page on GET /dishes/99999...');
    const notFoundRes = await request('GET', '/dishes/99999');
    assert.strictEqual(notFoundRes.statusCode, 404, `Expected 404, got ${notFoundRes.statusCode}`);
    assert(notFoundRes.body.includes('404'), '404 page should display 404');
    assert(notFoundRes.body.includes('Error Details:'), '404 page should show what the error is');
    assert(notFoundRes.body.includes('href="/dishes"'), '404 page must have button to /dishes in top left');
    assert(notFoundRes.body.includes('Back to Menu (/dishes)'), '404 page button text should direct to /dishes');
    assert(!notFoundRes.body.includes('Admin Panel'), '404 page must NOT have Admin Panel button');
    console.log('   ✓ 404 Error page rendered with error details, top-left button, and no Admin Panel button');

    // 5. Dedicated 404 Error Page: Invalid ID format and unknown route
    console.log('5. Testing 404 Error Page on GET /dishes/abc and unknown path...');
    const invalidIdRes = await request('GET', '/dishes/abc');
    assert.strictEqual(invalidIdRes.statusCode, 404, `Expected 404, got ${invalidIdRes.statusCode}`);
    assert(invalidIdRes.body.includes('Invalid dish ID') && invalidIdRes.body.includes('abc'), '404 page should show invalid ID message');

    const unknownRouteRes = await request('GET', '/some/nonexistent/page');
    assert.strictEqual(unknownRouteRes.statusCode, 404, 'Catch-all 404 should return 404');
    assert(unknownRouteRes.body.includes('/some/nonexistent/page') && unknownRouteRes.body.includes('was not found'), '404 page shows path not found');
    assert(unknownRouteRes.body.includes('href="/dishes"'), '404 page has button to /dishes');
    console.log('   ✓ 404 Error page verified for invalid IDs and unmapped paths');

    // Fetch existing chef & ingredients for dish tests
    const chefs = await prisma.chef.findMany({ take: 1 });
    assert(chefs.length > 0, 'Must have at least one chef in database');
    const chefId = chefs[0].id;

    const ingredients = await prisma.ingredient.findMany({ take: 2 });
    assert(ingredients.length > 0, 'Must have at least one ingredient');
    const ingredientId = ingredients[0].id;

    // 6. Admin Dish Creation (POST) - Valid Data
    console.log('6. Testing POST /admin/dishes with valid data -> Redirect 303...');
    const uniqueDishName = `Test Truffle Rigatoni ${Date.now()}`;
    const newDishRes = await request('POST', '/admin/dishes', {
      name: uniqueDishName,
      description: 'Artisanal egg pasta with fresh shaved black truffles',
      price: '0.00', // Test price 0.00 (non-negative)
      category: 'Main Course',
      available: 'on',
      imageUrl: 'https://images.unsplash.com/photo-1612874742237-6526221588e3',
      chefId: chefId.toString(),
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(newDishRes.statusCode, 303, `Expected 303 on successful creation, got ${newDishRes.statusCode}`);
    assert.strictEqual(newDishRes.headers.location, '/admin/dishes?msg=created');
    console.log('   ✓ POST /admin/dishes with valid data & non-negative price 0.00 succeeded with 303 redirect');

    const createdDish = await prisma.dish.findFirst({
      where: { name: uniqueDishName },
      include: { ingredients: true }
    });
    assert(createdDish, 'Dish should exist in database');

    // 7. Dedicated 400 Bad Request Page: Duplicate Dish Name
    console.log('7. Testing 400 Bad Request Page on Duplicate Dish Name...');
    const dupDishRes = await request(
      'POST',
      '/admin/dishes',
      {
        name: uniqueDishName, // Duplicate name!
        description: 'Another description',
        price: '20.00',
        category: 'Main Course',
        chefId: chefId.toString(),
        ingredientIds: [ingredientId.toString()]
      },
      { Referer: 'http://localhost:4055/admin/dishes' }
    );
    assert.strictEqual(dupDishRes.statusCode, 400, 'Duplicate dish name must return 400 status');
    assert(dupDishRes.body.includes('400'), 'Bad Request page displays 400');
    assert(dupDishRes.body.includes('Cause of Bad Request:'), 'Bad Request page shows cause');
    assert(dupDishRes.body.includes('Duplicate Dish Name'), 'Bad Request page explains duplicate dish name cause');
    assert(dupDishRes.body.includes('Back to Previous Page'), 'Bad Request page has button in top left corner');
    assert(dupDishRes.body.includes('href="http://localhost:4055/admin/dishes"'), 'Button redirects back to previous page');
    console.log('   ✓ 400 Bad Request page rendered with cause and top-left back button');

    // 8. 400 Bad Request: Negative Price
    console.log('8. Testing 400 Bad Request Page on Negative Price...');
    const negPriceRes = await request('POST', '/admin/dishes', {
      name: `Negative Price Dish ${Date.now()}`,
      description: 'Some description',
      price: '-10.50', // Negative!
      category: 'Main Course',
      chefId: chefId.toString(),
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(negPriceRes.statusCode, 400, 'Negative price must return 400');
    assert(negPriceRes.body.includes('Invalid Price: Price must not be a negative number'), 'Shows cause for negative price');
    console.log('   ✓ 400 Bad Request page shows cause for negative price');

    // 9. 400 Bad Request: Invalid Category
    console.log('9. Testing 400 Bad Request Page on Invalid Category...');
    const badCatRes = await request('POST', '/admin/dishes', {
      name: `Bad Category Dish ${Date.now()}`,
      description: 'Some description',
      price: '15.00',
      category: 'Fast Food', // Not one of Main Course, Appetizer, Dessert, Beverage
      chefId: chefId.toString(),
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(badCatRes.statusCode, 400, 'Invalid category must return 400');
    assert(badCatRes.body.includes('Invalid Category: Must be one of four categories'), 'Shows cause for invalid category');
    console.log('   ✓ 400 Bad Request page shows cause for invalid category');

    // 10. 400 Bad Request: Non-existent Chef
    console.log('10. Testing 400 Bad Request Page on Non-existent Chef...');
    const badChefRes = await request('POST', '/admin/dishes', {
      name: `Bad Chef Dish ${Date.now()}`,
      description: 'Some description',
      price: '15.00',
      category: 'Main Course',
      chefId: '99999', // Chef does not exist
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(badChefRes.statusCode, 400, 'Non-existent chef must return 400');
    assert(badChefRes.body.includes('Chef with ID #99999 was not found'), 'Shows cause for missing chef');
    console.log('   ✓ 400 Bad Request page shows cause for missing chef');

    // 11. 400 Bad Request: Blank Description
    console.log('11. Testing 400 Bad Request Page on Blank Description...');
    const blankDescRes = await request('POST', '/admin/dishes', {
      name: `Blank Desc Dish ${Date.now()}`,
      description: '   ', // Blank description!
      price: '15.00',
      category: 'Main Course',
      chefId: chefId.toString(),
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(blankDescRes.statusCode, 400, 'Blank description must return 400');
    assert(blankDescRes.body.includes('Dish description must not be left blank'), 'Shows cause for blank description');
    console.log('   ✓ 400 Bad Request page shows cause for blank description');

    // 12. 400 Bad Request: Missing Ingredients
    console.log('12. Testing 400 Bad Request Page on Missing Ingredients...');
    const noIngRes = await request('POST', '/admin/dishes', {
      name: `No Ingredients Dish ${Date.now()}`,
      description: 'Some description',
      price: '15.00',
      category: 'Main Course',
      chefId: chefId.toString()
      // ingredientIds omitted!
    });
    assert.strictEqual(noIngRes.statusCode, 400, 'Dish with no ingredients must return 400');
    assert(noIngRes.body.includes('At least one ingredient must be chosen'), 'Shows cause for missing ingredients');
    console.log('   ✓ 400 Bad Request page shows cause for missing ingredients');

    // 13. Admin Dish Update (PATCH via method-override)
    console.log(`13. Testing PATCH /admin/dishes/${createdDish.id} -> Redirect 303...`);
    const patchRes = await request('POST', `/admin/dishes/${createdDish.id}`, {
      _method: 'PATCH',
      name: createdDish.name, // Keeping own name is allowed
      description: 'Updated description for dish',
      price: '28.50',
      category: 'Appetizer',
      chefId: chefId.toString(),
      ingredientIds: [ingredientId.toString()]
    });
    assert.strictEqual(patchRes.statusCode, 303, `Expected 303 on patch, got ${patchRes.statusCode}`);
    console.log('   ✓ PATCH /admin/dishes/:id succeeded with 303 redirect');

    // 14. Admin Dish Delete (DELETE via method-override)
    console.log(`14. Testing DELETE /admin/dishes/${createdDish.id} -> Redirect 303...`);
    const deleteDishRes = await request('POST', `/admin/dishes/${createdDish.id}`, {
      _method: 'DELETE'
    });
    assert.strictEqual(deleteDishRes.statusCode, 303, `Expected 303 on deletion, got ${deleteDishRes.statusCode}`);
    const deletedCheck = await prisma.dish.findUnique({ where: { id: createdDish.id } });
    assert.strictEqual(deletedCheck, null, 'Dish should be deleted from DB');
    const chefStillExists = await prisma.chef.findUnique({ where: { id: chefId } });
    assert(chefStillExists, 'Chef who cooked the dish should remain');
    console.log('   ✓ DELETE /admin/dishes/:id deleted dish and preserved chef');

    // 15. Chef Validations: Duplicate Name -> 400 Bad Request Page
    console.log('15. Testing Chef Validations (Duplicate name, blank specialty)...');
    const uniqueChefName = `Chef Unique ${Date.now()}`;
    const validChefRes = await request('POST', '/admin/chefs', {
      name: uniqueChefName,
      specialty: 'Wood-fired culinary arts'
    });
    assert.strictEqual(validChefRes.statusCode, 303, 'Valid chef creation should redirect 303');

    const duplicateChefRes = await request(
      'POST',
      '/admin/chefs',
      {
        name: uniqueChefName, // Duplicate name!
        specialty: 'Other specialty'
      },
      { Referer: 'http://localhost:4055/admin/chefs' }
    );
    assert.strictEqual(duplicateChefRes.statusCode, 400, 'Duplicate chef name must return 400');
    assert(duplicateChefRes.body.includes('Duplicate Chef Name: A chef named'), 'Shows cause for duplicate chef name');
    assert(duplicateChefRes.body.includes('href="http://localhost:4055/admin/chefs"'), 'Back button points to previous page');
    console.log('   ✓ 400 Bad Request page rendered for duplicate chef name with back button');

    // Blank specialty -> 400
    const blankSpecRes = await request('POST', '/admin/chefs', {
      name: `Chef Blank Spec ${Date.now()}`,
      specialty: '   ' // Blank!
    });
    assert.strictEqual(blankSpecRes.statusCode, 400, 'Blank specialty must return 400');
    assert(blankSpecRes.body.includes('Chef specialty is required and cannot be left blank'), 'Shows cause for blank specialty');
    console.log('   ✓ 400 Bad Request page shows cause for blank chef specialty');

    // 16. Chef Cascade Deletion
    console.log('16. Testing Chef Cascade Deletion...');
    const tempChef = await prisma.chef.findFirst({ where: { name: uniqueChefName } });
    assert(tempChef, 'Temp chef must exist');

    const tempDish = await prisma.dish.create({
      data: {
        name: `Temp Dish for Chef ${Date.now()}`,
        description: 'Temporary dish description',
        price: 25.0,
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
        chefId: tempChef.id,
        ingredients: { connect: [{ id: ingredientId }] }
      }
    });

    const deleteChefRes = await request('POST', `/admin/chefs/${tempChef.id}`, { _method: 'DELETE' });
    assert.strictEqual(deleteChefRes.statusCode, 303, 'Chef delete should redirect 303');
    const dishCascadeCheck = await prisma.dish.findUnique({ where: { id: tempDish.id } });
    assert.strictEqual(dishCascadeCheck, null, 'Dish cooked by chef must be cascaded and deleted');
    const ingStillIntact = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    assert(ingStillIntact, 'Ingredient must remain intact when chef deleted');
    console.log('   ✓ Chef deletion cascaded to dish; ingredient remained intact');

    // 17. Ingredient Validations: Allowed Units & Duplicate Name
    console.log('17. Testing Ingredient Validations (Unique name, allowed units)...');
    const uniqueIngName = `Test Rosemary ${Date.now()}`;
    const validIngRes = await request('POST', '/admin/ingredients', {
      name: uniqueIngName,
      unit: 'bunches' // Valid unit from allowed list
    });
    assert.strictEqual(validIngRes.statusCode, 303, 'Valid ingredient creation should redirect 303');

    // Duplicate ingredient name -> 400 Bad Request Page
    const dupIngRes = await request(
      'POST',
      '/admin/ingredients',
      {
        name: uniqueIngName, // Duplicate!
        unit: 'g'
      },
      { Referer: 'http://localhost:4055/admin/ingredients' }
    );
    assert.strictEqual(dupIngRes.statusCode, 400, 'Duplicate ingredient name must return 400');
    assert(dupIngRes.body.includes('Duplicate Ingredient Name: An ingredient named'), 'Shows cause for duplicate ingredient');
    assert(dupIngRes.body.includes('href="http://localhost:4055/admin/ingredients"'), 'Back button points to previous page');
    console.log('   ✓ 400 Bad Request page rendered for duplicate ingredient name with back button');

    // Invalid unit (e.g. "bottles", not in kg, g, ml, l, tbsp, pcs, bunches) -> 400 Bad Request Page
    const badUnitRes = await request('POST', '/admin/ingredients', {
      name: `Invalid Unit Ing ${Date.now()}`,
      unit: 'bottles' // Invalid unit!
    });
    assert.strictEqual(badUnitRes.statusCode, 400, 'Invalid unit must return 400');
    assert(badUnitRes.body.includes('Invalid Unit of Measurement: Unit must be typed as one of:'), 'Shows cause for invalid unit');
    console.log('   ✓ 400 Bad Request page shows cause for invalid unit');

    // 18. Ingredient Cascade Dish Deletion
    console.log('18. Testing Ingredient Cascade Dish Deletion...');
    const tempIng = await prisma.ingredient.findFirst({ where: { name: uniqueIngName } });
    assert(tempIng, 'Temp ingredient must exist');

    const dishWithIng = await prisma.dish.create({
      data: {
        name: `Temp Dish for Ingredient ${Date.now()}`,
        description: 'Temporary dish description',
        price: 30.0,
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
        chefId: chefId,
        ingredients: { connect: [{ id: tempIng.id }] }
      }
    });

    const deleteIngRes = await request('POST', `/admin/ingredients/${tempIng.id}`, { _method: 'DELETE' });
    assert.strictEqual(deleteIngRes.statusCode, 303, 'Ingredient delete should redirect 303');
    const dishWithIngCheck = await prisma.dish.findUnique({ where: { id: dishWithIng.id } });
    assert.strictEqual(dishWithIngCheck, null, 'Dish containing deleted ingredient must also be deleted');
    const chefStillIntact2 = await prisma.chef.findUnique({ where: { id: chefId } });
    assert(chefStillIntact2, 'Chef must stay when ingredient is deleted');
    console.log('   ✓ Ingredient deletion cascaded to dish; chef remained intact');

    // 19. Test Database Cleanup Script
    console.log('19. Testing Database Cleanup Script...');
    await runCleanup();
    console.log('   ✓ Database cleanup executed cleanly');

    console.log('====================================================');
    console.log('🎉 ALL 19 ERROR PAGE & INTEGRATION TESTS PASSED! 🎉');
    console.log('====================================================');
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  if (server) server.close();
  process.exit(1);
});
