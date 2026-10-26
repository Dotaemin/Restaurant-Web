require('dotenv').config();
const prisma = require('../lib/prisma');

async function applySupabaseConstraints() {
  console.log('=== Applying Database Constraints to Supabase PostgreSQL ===');

  try {
    // 1. Dish Price Non-Negative Check Constraint
    console.log('1. Applying CHECK constraint: Dish.price >= 0...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'dish_price_non_negative'
        ) THEN
          ALTER TABLE "Dish" ADD CONSTRAINT "dish_price_non_negative" CHECK (price >= 0);
        END IF;
      END $$;
    `);
    console.log('   ✓ Dish price non-negative constraint applied.');

    // 2. Dish Category Valid Values Check Constraint
    console.log('2. Applying CHECK constraint: Dish.category IN (Main Course, Appetizer, Dessert, Beverage)...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'dish_category_valid'
        ) THEN
          ALTER TABLE "Dish" ADD CONSTRAINT "dish_category_valid" 
          CHECK (category IN ('Main Course', 'Appetizer', 'Dessert', 'Beverage'));
        END IF;
      END $$;
    `);
    console.log('   ✓ Dish category check constraint applied.');

    // 3. Dish Description Not Blank Check Constraint
    console.log('3. Applying CHECK constraint: length(trim(Dish.description)) > 0...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'dish_description_not_blank'
        ) THEN
          ALTER TABLE "Dish" ADD CONSTRAINT "dish_description_not_blank" 
          CHECK (length(trim(description)) > 0);
        END IF;
      END $$;
    `);
    console.log('   ✓ Dish description not blank constraint applied.');

    // 4. Chef Specialty Not Blank Check Constraint
    console.log('4. Applying CHECK constraint: length(trim(Chef.specialty)) > 0...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chef_specialty_not_blank'
        ) THEN
          ALTER TABLE "Chef" ADD CONSTRAINT "chef_specialty_not_blank" 
          CHECK (length(trim(specialty)) > 0);
        END IF;
      END $$;
    `);
    console.log('   ✓ Chef specialty not blank constraint applied.');

    // 5. Ingredient Unit Check Constraint
    console.log('5. Applying CHECK constraint: Ingredient.unit IN (kg, g, ml, l, tbsp, pcs, bunches)...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ingredient_unit_valid'
        ) THEN
          ALTER TABLE "Ingredient" ADD CONSTRAINT "ingredient_unit_valid" 
          CHECK (unit IN ('kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches'));
        END IF;
      END $$;
    `);
    console.log('   ✓ Ingredient unit check constraint applied.');

    // 6. PostgreSQL Trigger: Cascade delete dishes when an ingredient is deleted
    console.log('6. Applying Trigger: Cascade delete dishes on ingredient deletion...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION delete_dishes_on_ingredient_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        DELETE FROM "Dish"
        WHERE id IN (
          SELECT "A" FROM "_DishIngredients" WHERE "B" = OLD.id
        );
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_delete_dishes_on_ingredient_delete'
        ) THEN
          CREATE TRIGGER trg_delete_dishes_on_ingredient_delete
          BEFORE DELETE ON "Ingredient"
          FOR EACH ROW
          EXECUTE FUNCTION delete_dishes_on_ingredient_delete();
        END IF;
      END $$;
    `);
    console.log('   ✓ Cascade trigger on ingredient deletion applied.');

    console.log('\n=============================================================');
    console.log('🎉 ALL SUPABASE POSTGRESQL CONSTRAINTS SUCCESSFULLY APPLIED! 🎉');
    console.log('=============================================================');
  } catch (error) {
    console.error('Error applying Supabase constraints:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applySupabaseConstraints();
