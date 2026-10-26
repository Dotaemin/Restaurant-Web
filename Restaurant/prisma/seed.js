require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding restaurant database...');

  // 1. Create or Upsert Chefs (unique name)
  const chefMarco = await prisma.chef.upsert({
    where: { name: 'Chef Marco Bellini' },
    update: {},
    create: {
      name: 'Chef Marco Bellini',
      specialty: 'Italian Fine Dining & Handmade Pastas'
    }
  });

  const chefKenji = await prisma.chef.upsert({
    where: { name: 'Chef Kenji Tanaka' },
    update: {},
    create: {
      name: 'Chef Kenji Tanaka',
      specialty: 'Japanese Gastronomy & Robata Grill'
    }
  });

  const chefAmelie = await prisma.chef.upsert({
    where: { name: 'Chef Amélie Laurent' },
    update: {},
    create: {
      name: 'Chef Amélie Laurent',
      specialty: 'French Artisanal Desserts & Pastry'
    }
  });

  console.log('Chefs verified in Supabase:', [chefMarco.name, chefKenji.name, chefAmelie.name]);

  // 2. Create or Upsert Ingredients (unique name, allowed unit)
  const ingTomato = await prisma.ingredient.upsert({
    where: { name: 'San Marzano Tomatoes' },
    update: {},
    create: { name: 'San Marzano Tomatoes', unit: 'g' }
  });
  const ingMozzarella = await prisma.ingredient.upsert({
    where: { name: 'Mozzarella di Bufala' },
    update: {},
    create: { name: 'Mozzarella di Bufala', unit: 'g' }
  });
  const ingWagyu = await prisma.ingredient.upsert({
    where: { name: 'A5 Miyazaki Wagyu' },
    update: {},
    create: { name: 'A5 Miyazaki Wagyu', unit: 'g' }
  });
  const ingTruffle = await prisma.ingredient.upsert({
    where: { name: 'Black Winter Truffle' },
    update: {},
    create: { name: 'Black Winter Truffle', unit: 'g' }
  });
  const ingNoodles = await prisma.ingredient.upsert({
    where: { name: 'Handmade Udon Noodles' },
    update: {},
    create: { name: 'Handmade Udon Noodles', unit: 'g' }
  });
  const ingBasil = await prisma.ingredient.upsert({
    where: { name: 'Fresh Genovese Basil' },
    update: {},
    create: { name: 'Fresh Genovese Basil', unit: 'bunches' }
  });
  const ingDashi = await prisma.ingredient.upsert({
    where: { name: 'House Dashi Broth' },
    update: {},
    create: { name: 'House Dashi Broth', unit: 'ml' }
  });
  const ingChocolate = await prisma.ingredient.upsert({
    where: { name: 'Valrhona 70% Dark Chocolate' },
    update: {},
    create: { name: 'Valrhona 70% Dark Chocolate', unit: 'g' }
  });
  const ingCream = await prisma.ingredient.upsert({
    where: { name: 'Organic Heavy Cream' },
    update: {},
    create: { name: 'Organic Heavy Cream', unit: 'ml' }
  });
  const ingEggs = await prisma.ingredient.upsert({
    where: { name: 'Free-range Eggs' },
    update: {},
    create: { name: 'Free-range Eggs', unit: 'pcs' }
  });

  console.log('Ingredients verified in Supabase.');

  // 3. Create or Upsert Dishes (unique name, allowed category, price >= 0)
  await prisma.dish.upsert({
    where: { name: 'Margherita Pizza Classica' },
    update: {},
    create: {
      name: 'Margherita Pizza Classica',
      description: 'Traditional Neapolitan wood-fired pizza with crushed San Marzano tomatoes, buffalo mozzarella, and fragrant Genovese basil.',
      price: 18.5,
      category: 'Main Course',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=800&auto=format&fit=crop&q=80',
      chefId: chefMarco.id,
      ingredients: {
        connect: [{ id: ingTomato.id }, { id: ingMozzarella.id }, { id: ingBasil.id }]
      }
    }
  });

  await prisma.dish.upsert({
    where: { name: 'Black Truffle Tagliolini' },
    update: {},
    create: {
      name: 'Black Truffle Tagliolini',
      description: 'Handcrafted egg pasta swirled in French churned butter and topped with generous shavings of black winter truffle.',
      price: 34.0,
      category: 'Main Course',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281292?w=800&auto=format&fit=crop&q=80',
      chefId: chefMarco.id,
      ingredients: {
        connect: [{ id: ingTruffle.id }, { id: ingCream.id }, { id: ingEggs.id }]
      }
    }
  });

  await prisma.dish.upsert({
    where: { name: 'A5 Wagyu Robata Steak' },
    update: {},
    create: {
      name: 'A5 Wagyu Robata Steak',
      description: 'Prime cut A5 Miyazaki Wagyu grilled over Binchotan charcoal, served with smoked sea salt and dashi glaze.',
      price: 68.0,
      category: 'Main Course',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&auto=format&fit=crop&q=80',
      chefId: chefKenji.id,
      ingredients: {
        connect: [{ id: ingWagyu.id }, { id: ingDashi.id }]
      }
    }
  });

  await prisma.dish.upsert({
    where: { name: 'Smoked Dashi Udon' },
    update: {},
    create: {
      name: 'Smoked Dashi Udon',
      description: 'Silky artisanal udon in umami-rich smoked dashi broth, garnished with soft poached egg and scallions.',
      price: 22.0,
      category: 'Appetizer',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
      chefId: chefKenji.id,
      ingredients: {
        connect: [{ id: ingNoodles.id }, { id: ingDashi.id }, { id: ingEggs.id }]
      }
    }
  });

  await prisma.dish.upsert({
    where: { name: 'Valrhona Chocolate Molten Cake' },
    update: {},
    create: {
      name: 'Valrhona Chocolate Molten Cake',
      description: 'Warm French molten lava cake made with 70% Valrhona dark chocolate, served with Madagascar vanilla infused cream.',
      price: 16.0,
      category: 'Dessert',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=80',
      chefId: chefAmelie.id,
      ingredients: {
        connect: [{ id: ingChocolate.id }, { id: ingCream.id }, { id: ingEggs.id }]
      }
    }
  });

  await prisma.dish.upsert({
    where: { name: 'Heirloom Caprese Salad' },
    update: {},
    create: {
      name: 'Heirloom Caprese Salad',
      description: 'Organic sweet heirloom tomatoes paired with creamy buffalo mozzarella, micro-basil, and extra virgin olive oil.',
      price: 15.5,
      category: 'Appetizer',
      available: true,
      imageUrl: 'https://images.unsplash.com/photo-1592417817098-8f3d69109853?w=800&auto=format&fit=crop&q=80',
      chefId: chefMarco.id,
      ingredients: {
        connect: [{ id: ingTomato.id }, { id: ingMozzarella.id }, { id: ingBasil.id }]
      }
    }
  });

  console.log('Seed completed successfully in Supabase!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
