require('dotenv').config();
const prisma = require('../lib/prisma');

const ALLOWED_CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];
const ALLOWED_UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches'];

async function runCleanup() {
  console.log('--- Checking & Cleaning Database Entries ---');

  // 1. Check and Clean Ingredients
  // Constraints:
  // - Name not blank, not duplicate
  // - Unit must be one of ALLOWED_UNITS
  // Rule: When an ingredient is deleted, dishes containing that ingredient should also be deleted, chef stays.
  const allIngredients = await prisma.ingredient.findMany({
    orderBy: { id: 'asc' },
    include: { dishes: true }
  });

  const seenIngredientNames = new Set();
  const invalidIngredients = [];

  for (const ing of allIngredients) {
    const trimmedName = ing.name ? ing.name.trim().toLowerCase() : '';
    const trimmedUnit = ing.unit ? ing.unit.trim() : '';

    const isNameInvalid = !trimmedName;
    const isNameDuplicate = seenIngredientNames.has(trimmedName);
    const isUnitInvalid = !ALLOWED_UNITS.includes(trimmedUnit);

    if (isNameInvalid || isNameDuplicate || isUnitInvalid) {
      invalidIngredients.push({
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        reason: isNameInvalid
          ? 'Blank name'
          : isNameDuplicate
          ? 'Duplicate name'
          : `Invalid unit "${ing.unit}" (must be one of: ${ALLOWED_UNITS.join(', ')})`
      });
    } else {
      seenIngredientNames.add(trimmedName);
    }
  }

  for (const item of invalidIngredients) {
    console.log(`Deleting invalid ingredient #${item.id} (${item.name}, unit: ${item.unit}) - Reason: ${item.reason}`);
    // Cascade delete dishes using this ingredient
    await prisma.$transaction(async (tx) => {
      const dishesWithIng = await tx.dish.findMany({
        where: { ingredients: { some: { id: item.id } } },
        select: { id: true, name: true }
      });
      if (dishesWithIng.length > 0) {
        console.log(`  -> Cascade deleting ${dishesWithIng.length} dishes using ingredient #${item.id}:`, dishesWithIng.map(d => d.name));
        await tx.dish.deleteMany({
          where: { id: { in: dishesWithIng.map(d => d.id) } }
        });
      }
      await tx.ingredient.delete({ where: { id: item.id } });
    });
  }

  // 2. Check and Clean Chefs
  // Constraints:
  // - Name not blank, not duplicate
  // - Specialty not blank (can be duplicate)
  // Rule: When chef deleted, dishes cooked by chef deleted, ingredients stay.
  const allChefs = await prisma.chef.findMany({
    orderBy: { id: 'asc' },
    include: { dishes: true }
  });

  const seenChefNames = new Set();
  const invalidChefs = [];

  for (const chef of allChefs) {
    const trimmedName = chef.name ? chef.name.trim().toLowerCase() : '';
    const trimmedSpecialty = chef.specialty ? chef.specialty.trim() : '';

    const isNameInvalid = !trimmedName;
    const isNameDuplicate = seenChefNames.has(trimmedName);
    const isSpecialtyInvalid = !trimmedSpecialty;

    if (isNameInvalid || isNameDuplicate || isSpecialtyInvalid) {
      invalidChefs.push({
        id: chef.id,
        name: chef.name,
        specialty: chef.specialty,
        reason: isNameInvalid
          ? 'Blank name'
          : isNameDuplicate
          ? 'Duplicate name'
          : 'Blank specialty'
      });
    } else {
      seenChefNames.add(trimmedName);
    }
  }

  for (const chef of invalidChefs) {
    console.log(`Deleting invalid chef #${chef.id} (${chef.name}) - Reason: ${chef.reason}`);
    // Cascade delete dishes cooked by this chef
    await prisma.$transaction(async (tx) => {
      await tx.dish.deleteMany({ where: { chefId: chef.id } });
      await tx.chef.delete({ where: { id: chef.id } });
    });
  }

  // 3. Check and Clean Dishes
  // Constraints:
  // - Name not blank, not duplicate
  // - Price: not negative (>= 0)
  // - Category: one of ALLOWED_CATEGORIES
  // - Chef: valid existing chef
  // - Description: not blank
  // - Ingredients: at least 1 ingredient
  // Rule: When dish deleted, chef and ingredients stay.
  const allDishes = await prisma.dish.findMany({
    orderBy: { id: 'asc' },
    include: { chef: true, ingredients: true }
  });

  const seenDishNames = new Set();
  const invalidDishes = [];

  for (const dish of allDishes) {
    const trimmedName = dish.name ? dish.name.trim().toLowerCase() : '';
    const trimmedDesc = dish.description ? dish.description.trim() : '';

    const isNameInvalid = !trimmedName;
    const isNameDuplicate = seenDishNames.has(trimmedName);
    const isPriceNegative = typeof dish.price !== 'number' || isNaN(dish.price) || dish.price < 0;
    const isCategoryInvalid = !ALLOWED_CATEGORIES.includes(dish.category);
    const isChefMissing = !dish.chefId || !dish.chef;
    const isDescBlank = !trimmedDesc;
    const isIngredientsEmpty = !dish.ingredients || dish.ingredients.length === 0;

    if (
      isNameInvalid ||
      isNameDuplicate ||
      isPriceNegative ||
      isCategoryInvalid ||
      isChefMissing ||
      isDescBlank ||
      isIngredientsEmpty
    ) {
      const reasons = [];
      if (isNameInvalid) reasons.push('Blank name');
      if (isNameDuplicate) reasons.push('Duplicate name');
      if (isPriceNegative) reasons.push(`Negative or invalid price: ${dish.price}`);
      if (isCategoryInvalid) reasons.push(`Invalid category: ${dish.category}`);
      if (isChefMissing) reasons.push('Chef does not exist in DB');
      if (isDescBlank) reasons.push('Blank description');
      if (isIngredientsEmpty) reasons.push('No ingredients assigned');

      invalidDishes.push({
        id: dish.id,
        name: dish.name,
        reasons: reasons.join('; ')
      });
    } else {
      seenDishNames.add(trimmedName);
    }
  }

  for (const dish of invalidDishes) {
    console.log(`Deleting invalid dish #${dish.id} (${dish.name}) - Reasons: ${dish.reasons}`);
    await prisma.dish.delete({ where: { id: dish.id } });
  }

  console.log(`Cleanup complete! Removed: ${invalidIngredients.length} ingredients, ${invalidChefs.length} chefs, ${invalidDishes.length} dishes.`);
}

module.exports = runCleanup;

if (require.main === module) {
  runCleanup()
    .catch((err) => {
      console.error('Error during cleanup:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
