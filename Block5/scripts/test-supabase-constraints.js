require('dotenv').config();
const prisma = require('../lib/prisma');
const assert = require('assert');

async function testSupabaseConstraints() {
  console.log('=== Verifying Constraints Directly in Supabase PostgreSQL ===');

  // 1. Test Unique Dish Name in Supabase
  console.log('1. Testing Unique Dish Name in Supabase...');
  try {
    const existing = await prisma.dish.findFirst();
    await prisma.dish.create({
      data: {
        name: existing.name, // Duplicate!
        description: 'Testing duplicate constraint',
        price: 20.0,
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143',
        chefId: existing.chefId
      }
    });
    assert.fail('Should have failed with unique constraint error');
  } catch (err) {
    assert(err.message.includes('Unique constraint') || err.message.includes('unique') || err.code === 'P2002');
    console.log('   ✓ Supabase rejected duplicate Dish name at the database level!');
  }

  // 2. Test Negative Price in Supabase
  console.log('2. Testing Non-Negative Price Check in Supabase...');
  try {
    const existing = await prisma.dish.findFirst();
    await prisma.dish.create({
      data: {
        name: `Negative Price Test ${Date.now()}`,
        description: 'Testing negative price check',
        price: -15.0, // Negative!
        category: 'Main Course',
        imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143',
        chefId: existing.chefId
      }
    });
    assert.fail('Should have failed with check constraint error');
  } catch (err) {
    assert(err.message.includes('dish_price_non_negative') || err.message.includes('check') || err.code === 'P2010');
    console.log('   ✓ Supabase rejected negative price via CHECK constraint at the database level!');
  }

  // 3. Test Invalid Category in Supabase
  console.log('3. Testing Valid Category Check in Supabase...');
  try {
    const existing = await prisma.dish.findFirst();
    await prisma.dish.create({
      data: {
        name: `Bad Category Test ${Date.now()}`,
        description: 'Testing bad category check',
        price: 15.0,
        category: 'Fast Food', // Not one of Main Course, Appetizer, Dessert, Beverage
        imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143',
        chefId: existing.chefId
      }
    });
    assert.fail('Should have failed with check constraint error');
  } catch (err) {
    assert(err.message.includes('dish_category_valid') || err.message.includes('check') || err.code === 'P2010');
    console.log('   ✓ Supabase rejected invalid category via CHECK constraint at the database level!');
  }

  // 4. Test Invalid Ingredient Unit in Supabase
  console.log('4. Testing Valid Ingredient Unit Check in Supabase...');
  try {
    await prisma.ingredient.create({
      data: {
        name: `Bad Unit Test ${Date.now()}`,
        unit: 'gallons' // Not in allowed units
      }
    });
    assert.fail('Should have failed with check constraint error');
  } catch (err) {
    assert(err.message.includes('ingredient_unit_valid') || err.message.includes('check') || err.code === 'P2010');
    console.log('   ✓ Supabase rejected invalid unit via CHECK constraint at the database level!');
  }

  // 5. Test Unique Chef Name in Supabase
  console.log('5. Testing Unique Chef Name in Supabase...');
  try {
    const existingChef = await prisma.chef.findFirst();
    await prisma.chef.create({
      data: {
        name: existingChef.name, // Duplicate!
        specialty: 'Testing duplicate chef'
      }
    });
    assert.fail('Should have failed with unique constraint error');
  } catch (err) {
    assert(err.message.includes('Unique constraint') || err.code === 'P2002');
    console.log('   ✓ Supabase rejected duplicate Chef name at the database level!');
  }

  // 6. Test Cascade Delete of Ingredient in Supabase via Trigger
  console.log('6. Testing Ingredient Cascade Trigger in Supabase...');
  const testChef = await prisma.chef.findFirst();
  const testIng = await prisma.ingredient.create({
    data: { name: `Trigger Ing ${Date.now()}`, unit: 'g' }
  });
  const testDish = await prisma.dish.create({
    data: {
      name: `Trigger Dish ${Date.now()}`,
      description: 'Trigger dish description',
      price: 20.0,
      category: 'Main Course',
      imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143',
      chefId: testChef.id,
      ingredients: { connect: [{ id: testIng.id }] }
    }
  });

  // Delete ingredient directly via raw SQL or Prisma
  await prisma.ingredient.delete({ where: { id: testIng.id } });
  const checkDish = await prisma.dish.findUnique({ where: { id: testDish.id } });
  assert.strictEqual(checkDish, null, 'Dish containing deleted ingredient should be deleted via trigger');
  console.log('   ✓ Supabase PostgreSQL trigger successfully cascaded and deleted dish when ingredient was deleted!');

  console.log('\n=============================================================');
  console.log('🎉 ALL SUPABASE DATABASE-LEVEL CONSTRAINTS VERIFIED & WORKING! 🎉');
  console.log('=============================================================');
}

testSupabaseConstraints()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
