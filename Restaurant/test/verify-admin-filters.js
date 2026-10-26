const http = require('http');

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function verify() {
  process.env.NODE_ENV = 'test';
  const app = require('../server');
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://localhost:${port}`;

  console.log('Testing Admin Filtering & Sorting Endpoints...\n');

  try {
    // 1. Get first chef
    const chefsRes = await request(`${base}/api/admin/chefs?pageSize=5`);
    const chef = chefsRes.body.data.items[0];
    console.log(`Checking Chef ID ${chef.id} (${chef.name})...`);

    // 2. Query dishes filtered by chef
    const dishesByChefRes = await request(`${base}/api/admin/dishes?chefId=${chef.id}&pageSize=50`);
    const dishesByChef = dishesByChefRes.body.data.items;
    const totalChefDishes = dishesByChefRes.body.data.meta.total;

    console.log(`Found ${totalChefDishes} dishes cooked by Chef ${chef.name}`);
    if (totalChefDishes > 0 && dishesByChef.every(d => d.chefId === chef.id || d.chef?.id === chef.id)) {
      console.log('✅ PASS: All returned dishes belong to the filtered chef!');
    } else {
      console.error('❌ FAIL: Some dishes do not belong to the filtered chef!');
      process.exit(1);
    }

    // 3. Query dishes filtered by category
    const catRes = await request(`${base}/api/admin/dishes?category=Dessert`);
    const catDishes = catRes.body.data.items;
    if (catDishes.length > 0 && catDishes.every(d => d.category === 'Dessert')) {
      console.log(`✅ PASS: Category filter returned Dessert dishes (total: ${catRes.body.data.meta.total})`);
    } else {
      console.error('❌ FAIL: Category filter failed!');
      process.exit(1);
    }

    // 4. Query dishes sorted by price descending
    const sortRes = await request(`${base}/api/admin/dishes?sortBy=price&sortOrder=desc&pageSize=10`);
    const sortedDishes = sortRes.body.data.items;
    let priceDescOk = true;
    for (let i = 0; i < sortedDishes.length - 1; i++) {
      if (parseFloat(sortedDishes[i].price) < parseFloat(sortedDishes[i + 1].price)) {
        priceDescOk = false;
        break;
      }
    }
    if (priceDescOk) {
      console.log('✅ PASS: Dishes correctly sorted by price descending');
    } else {
      console.error('❌ FAIL: Dish price sorting failed');
      process.exit(1);
    }

    // 5. Query chefs filtered by specialty
    const chefSpecRes = await request(`${base}/api/admin/chefs?specialty=Món`);
    const matchingChefs = chefSpecRes.body.data.items;
    if (matchingChefs.length > 0 && matchingChefs.every(c => c.specialty.includes('Món'))) {
      console.log(`✅ PASS: Chef specialty filter works (${matchingChefs.length} returned)`);
    } else {
      console.error('❌ FAIL: Chef specialty filter failed');
      process.exit(1);
    }

    // 6. Query ingredients filtered by unit
    const ingUnitRes = await request(`${base}/api/admin/ingredients?unit=g`);
    const matchingIngs = ingUnitRes.body.data.items;
    if (matchingIngs.length > 0 && matchingIngs.every(i => i.unit === 'g')) {
      console.log(`✅ PASS: Ingredient unit filter works (total: ${ingUnitRes.body.data.meta.total})`);
    } else {
      console.error('❌ FAIL: Ingredient unit filter failed');
      process.exit(1);
    }

    console.log('\nAll Admin Filtering & Sorting checks passed successfully! 🎉');
  } finally {
    server.close();
  }
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
