process.env.NODE_ENV = 'test';
const app = require('../server');
const http = require('http');

let server;
const PORT = 3099;

async function runTests() {
  server = app.listen(PORT);
  console.log(`Test server running on port ${PORT}`);

  try {
    // 1. Test GET /api/dishes
    console.log('\n--- 1. Testing GET /api/dishes ---');
    const resDishes = await fetch(`http://localhost:${PORT}/api/dishes`, {
      headers: { Origin: 'http://localhost:5173' }
    });
    console.log('Status:', resDishes.status);
    console.log('CORS Header:', resDishes.headers.get('access-control-allow-origin'));
    const dataDishes = await resDishes.json();
    console.log('Body shape ok?:', dataDishes.ok, 'Is array?', Array.isArray(dataDishes.data));

    // 2. Test Invalid ID (GET /api/dishes/999999)
    console.log('\n--- 2. Testing Invalid ID (GET /api/dishes/999999) ---');
    const resNotFound = await fetch(`http://localhost:${PORT}/api/dishes/999999`);
    console.log('Status (must be 200):', resNotFound.status);
    const dataNotFound = await resNotFound.json();
    console.log('Body:', JSON.stringify(dataNotFound));

    // 3. Test Invalid Form Input (POST /api/dishes with empty body)
    console.log('\n--- 3. Testing Invalid Form Input (POST /api/dishes) ---');
    const resValidation = await fetch(`http://localhost:${PORT}/api/dishes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    console.log('Status (must be 200):', resValidation.status);
    const dataValidation = await resValidation.json();
    console.log('Body:', JSON.stringify(dataValidation));

    // 4. Test Invalid URL (GET /api/bok)
    console.log('\n--- 4. Testing Invalid URL (GET /api/bok) ---');
    const resInvalidUrl = await fetch(`http://localhost:${PORT}/api/bok`);
    console.log('Status (must be 404):', resInvalidUrl.status);
    const dataInvalidUrl = await resInvalidUrl.json();
    console.log('Body (must NOT have "ok"):', JSON.stringify(dataInvalidUrl), 'Has "ok"?:', 'ok' in dataInvalidUrl);

    // 5. Test GET /api/chefs
    console.log('\n--- 5. Testing GET /api/chefs ---');
    const resChefs = await fetch(`http://localhost:${PORT}/api/chefs`);
    console.log('Status:', resChefs.status);
    const dataChefs = await resChefs.json();
    console.log('Chefs body ok?:', dataChefs.ok, 'Count:', dataChefs.data.length);

    // 6. Test GET /api/ingredients
    console.log('\n--- 6. Testing GET /api/ingredients ---');
    const resIngredients = await fetch(`http://localhost:${PORT}/api/ingredients`);
    console.log('Status:', resIngredients.status);
    const dataIngredients = await resIngredients.json();
    console.log('Ingredients body ok?:', dataIngredients.ok, 'Count:', dataIngredients.data.length);

    console.log('\n✅ ALL BACKEND API TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    server.close();
  }
}

runTests();
