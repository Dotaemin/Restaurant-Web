const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const ALLOWED_CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];

const getBackUrl = (req, fallback = '/admin/dishes') => {
  return req.get('Referrer') || fallback;
};

// GET /admin/dishes - Admin tabular view of all dishes + Add Dish form
router.get('/dishes', async (req, res, next) => {
  try {
    const dishes = await prisma.dish.findMany({
      orderBy: { id: 'asc' },
      include: {
        chef: true,
        ingredients: true
      }
    });

    const chefs = await prisma.chef.findMany({ orderBy: { name: 'asc' } });
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });

    res.render('admin/dishes', {
      title: 'Admin: Manage Dishes',
      dishes,
      chefs,
      ingredients,
      error: req.query.error,
      msg: req.query.msg,
      activeTab: 'dishes'
    });
  } catch (err) {
    console.error('Error in GET /admin/dishes:', err);
    res.render('admin/dishes', {
      title: 'Admin: Manage Dishes',
      dishes: [],
      chefs: [],
      ingredients: [],
      error: 'db_connection_failed',
      errorMessage: err.message,
      msg: null,
      activeTab: 'dishes'
    });
  }
});

// POST /admin/dishes - Create new dish (PRG pattern, redirect 303 on success, 400 on invalid)
router.post('/dishes', async (req, res, next) => {
  try {
    const { name, description, price, category, available, imageUrl, chefId, ingredientIds } = req.body;
    const backUrl = getBackUrl(req, '/admin/dishes');

    // 1. Validate Name (must not be blank, must not be duplicate)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Dish Name Required',
        cause: 'Dish Name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const existingDishes = await prisma.dish.findMany({ select: { name: true } });
    if (existingDishes.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Dish Name',
        cause: `Duplicate Dish Name: A dish named "${trimmedName}" is already in the database. Dish names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Price (must not be negative, no specified range)
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Dish Price',
        cause: `Invalid Price: Price must not be a negative number (received: "${price}").`,
        backUrl
      });
    }

    // 3. Validate Category (Must be one of four: Main Course, Appetizer, Dessert, Beverage)
    if (!category || typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category.trim())) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Dish Category',
        cause: `Invalid Category: Must be one of four categories: Main Course, Appetizer, Dessert, or Beverage (received: "${category}").`,
        backUrl
      });
    }

    // 4. Validate Chef (Must be one of the chefs in the database)
    const parsedChefId = parseInt(chefId, 10);
    if (isNaN(parsedChefId) || parsedChefId <= 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Selection Required',
        cause: 'Please select a chef from the database.',
        backUrl
      });
    }
    const chefExists = await prisma.chef.findUnique({ where: { id: parsedChefId } });
    if (!chefExists) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Not Found',
        cause: `Chef with ID #${parsedChefId} was not found in the database.`,
        backUrl
      });
    }

    // 5. Validate Description (Must not be left blank)
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Description Required',
        cause: 'Dish description must not be left blank.',
        backUrl
      });
    }

    // 6. Validate Ingredients (Must have at least one ingredient chosen, cannot be blank)
    let selectedIngredientIds = [];
    if (ingredientIds) {
      if (Array.isArray(ingredientIds)) {
        selectedIngredientIds = ingredientIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
      } else {
        const singleId = parseInt(ingredientIds, 10);
        if (!isNaN(singleId) && singleId > 0) selectedIngredientIds.push(singleId);
      }
    }

    if (selectedIngredientIds.length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredients Required',
        cause: 'Ingredients required: At least one ingredient must be chosen for the dish.',
        backUrl
      });
    }

    const existingIngredients = await prisma.ingredient.findMany({
      where: { id: { in: selectedIngredientIds } },
      select: { id: true }
    });
    if (existingIngredients.length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredients Not Found',
        cause: 'The selected ingredients do not exist in the database.',
        backUrl
      });
    }

    const defaultImage = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80';
    const finalImageUrl = imageUrl && imageUrl.trim().length > 0 ? imageUrl.trim() : defaultImage;

    await prisma.dish.create({
      data: {
        name: trimmedName,
        description: description.trim(),
        price: parsedPrice,
        category: category.trim(),
        available: available === 'on' || available === 'true' || available === true,
        imageUrl: finalImageUrl,
        chefId: parsedChefId,
        ingredients: {
          connect: existingIngredients.map(ing => ({ id: ing.id }))
        }
      }
    });

    return res.redirect(303, '/admin/dishes?msg=created');
  } catch (err) {
    console.error('Error creating dish:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Server Error',
      cause: `Failed to create dish: ${err.message}`,
      backUrl: getBackUrl(req, '/admin/dishes')
    });
  }
});

// GET /admin/dishes/:id - Admin view & edit details of a dish
router.get('/dishes/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Dish ID',
      error: `Invalid dish ID "${rawId}". Dish ID must be a positive integer.`,
      backUrl: '/dishes'
    });
  }

  try {
    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        chef: true,
        ingredients: true
      }
    });

    if (!dish) {
      return res.status(404).render('errors/404', {
        title: '404 - Dish Not Found',
        error: `Dish with ID #${id} was not found in the database.`,
        backUrl: '/dishes'
      });
    }

    const chefs = await prisma.chef.findMany({ orderBy: { name: 'asc' } });
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });

    res.render('admin/dishDetail', {
      title: `Admin: Edit ${dish.name}`,
      dish,
      chefs,
      ingredients,
      error: req.query.error,
      msg: req.query.msg,
      activeTab: 'dishes'
    });
  } catch (err) {
    console.error('Error in GET /admin/dishes/:id:', err);
    return res.status(404).render('errors/404', {
      title: '404 - Database Error',
      error: `Error retrieving dish details: ${err.message}`,
      backUrl: '/dishes'
    });
  }
});

// PATCH /admin/dishes/:id - Update dish details (PRG pattern, redirect 303 on success, 400 on invalid, 404 on not found)
router.patch('/dishes/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  const backUrl = getBackUrl(req, `/admin/dishes/${rawId}`);

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Dish ID',
      error: `Invalid dish ID "${rawId}". Dish ID must be a positive integer.`,
      backUrl: '/dishes'
    });
  }

  try {
    // Check if dish exists
    const existingDish = await prisma.dish.findUnique({ where: { id } });
    if (!existingDish) {
      return res.status(404).render('errors/404', {
        title: '404 - Dish Not Found',
        error: `Dish with ID #${id} does not exist in the database.`,
        backUrl: '/dishes'
      });
    }

    const { name, description, price, category, available, imageUrl, chefId, ingredientIds } = req.body;

    // 1. Validate Name (must not be blank, must not be duplicate with another dish)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Dish Name Required',
        cause: 'Dish Name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const otherDishes = await prisma.dish.findMany({
      where: { NOT: { id } },
      select: { name: true }
    });
    if (otherDishes.some(d => d.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Dish Name',
        cause: `Duplicate Dish Name: Another dish is already named "${trimmedName}". Dish names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Price (must not be negative, no specified range)
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Dish Price',
        cause: `Invalid Price: Price cannot be negative (received: "${price}").`,
        backUrl
      });
    }

    // 3. Validate Category (Must be one of four: Main Course, Appetizer, Dessert, Beverage)
    if (!category || typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category.trim())) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Dish Category',
        cause: `Invalid Category: Must be one of: Main Course, Appetizer, Dessert, or Beverage (received: "${category}").`,
        backUrl
      });
    }

    // 4. Validate Chef (Must be one of the chefs in the database)
    const parsedChefId = parseInt(chefId, 10);
    if (isNaN(parsedChefId) || parsedChefId <= 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Selection Required',
        cause: 'Please select a valid chef from the database.',
        backUrl
      });
    }
    const chefExists = await prisma.chef.findUnique({ where: { id: parsedChefId } });
    if (!chefExists) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Not Found',
        cause: `Chef with ID #${parsedChefId} was not found in the database.`,
        backUrl
      });
    }

    // 5. Validate Description (Must not be left blank)
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Description Required',
        cause: 'Dish description must not be left blank.',
        backUrl
      });
    }

    // 6. Validate Ingredients (Must have at least one ingredient chosen, cannot be blank)
    let selectedIngredientIds = [];
    if (ingredientIds) {
      if (Array.isArray(ingredientIds)) {
        selectedIngredientIds = ingredientIds.map(i => parseInt(i, 10)).filter(i => !isNaN(i) && i > 0);
      } else {
        const singleId = parseInt(ingredientIds, 10);
        if (!isNaN(singleId) && singleId > 0) selectedIngredientIds.push(singleId);
      }
    }

    if (selectedIngredientIds.length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredients Required',
        cause: 'Ingredients required: At least one ingredient must be chosen for the dish.',
        backUrl
      });
    }

    const existingIngredients = await prisma.ingredient.findMany({
      where: { id: { in: selectedIngredientIds } },
      select: { id: true }
    });
    if (existingIngredients.length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredients Not Found',
        cause: 'The selected ingredients do not exist in the database.',
        backUrl
      });
    }

    await prisma.dish.update({
      where: { id },
      data: {
        name: trimmedName,
        description: description.trim(),
        price: parsedPrice,
        category: category.trim(),
        available: available === 'on' || available === 'true' || available === true,
        imageUrl: imageUrl && imageUrl.trim().length > 0 ? imageUrl.trim() : existingDish.imageUrl,
        chefId: parsedChefId,
        ingredients: {
          set: existingIngredients.map(ing => ({ id: ing.id }))
        }
      }
    });

    return res.redirect(303, `/admin/dishes/${id}?msg=updated`);
  } catch (err) {
    console.error('Error updating dish:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Update Failed',
      cause: `Failed to update dish: ${err.message}`,
      backUrl
    });
  }
});

// DELETE /admin/dishes/:id - Delete dish (PRG pattern, redirect 303 on success, 404 on not found)
// "When a dish is deleted, the chef who cooked it should stay, the ingredients should also stay."
router.delete('/dishes/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Dish ID',
      error: `Invalid dish ID "${rawId}" for deletion.`,
      backUrl: '/dishes'
    });
  }

  try {
    const existing = await prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).render('errors/404', {
        title: '404 - Dish Not Found',
        error: `Dish with ID #${id} was not found for deletion.`,
        backUrl: '/dishes'
      });
    }

    await prisma.dish.delete({ where: { id } });

    return res.redirect(303, '/admin/dishes?msg=deleted');
  } catch (err) {
    console.error('Error deleting dish:', err);
    return res.status(404).render('errors/404', {
      title: '404 - Delete Failed',
      error: `Error deleting dish: ${err.message}`,
      backUrl: '/dishes'
    });
  }
});

module.exports = router;
