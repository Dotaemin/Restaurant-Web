const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const ALLOWED_UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches'];

const getBackUrl = (req, fallback = '/admin/ingredients') => {
  return req.get('Referrer') || fallback;
};

// GET /admin/ingredients - Tabular display of ingredients + Add Ingredient form
router.get('/ingredients', async (req, res, next) => {
  try {
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { id: 'asc' },
      include: {
        dishes: {
          select: { id: true, name: true }
        }
      }
    });

    res.render('admin/ingredients', {
      title: 'Admin: Manage Ingredients',
      ingredients,
      allowedUnits: ALLOWED_UNITS,
      error: req.query.error,
      msg: req.query.msg,
      editId: req.query.edit ? parseInt(req.query.edit, 10) : null,
      activeTab: 'ingredients'
    });
  } catch (err) {
    console.error('Error in GET /admin/ingredients:', err);
    res.render('admin/ingredients', {
      title: 'Admin: Manage Ingredients',
      ingredients: [],
      allowedUnits: ALLOWED_UNITS,
      error: 'db_connection_failed',
      errorMessage: err.message,
      msg: null,
      editId: null,
      activeTab: 'ingredients'
    });
  }
});

// POST /admin/ingredients - Create ingredient (PRG: 303 on success, 400 on invalid)
router.post('/ingredients', async (req, res, next) => {
  const backUrl = getBackUrl(req, '/admin/ingredients');
  try {
    const { name, unit } = req.body;

    // 1. Validate Name (must not be blank, must not be duplicate)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredient Name Required',
        cause: 'Ingredient name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const existingIngredients = await prisma.ingredient.findMany({ select: { name: true } });
    if (existingIngredients.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Ingredient Name',
        cause: `Duplicate Ingredient Name: An ingredient named "${trimmedName}" is already in the database. Ingredient names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Unit of measurement (Must be one of: kg, g, ml, l, tbsp, pcs, bunches)
    const trimmedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
    if (!trimmedUnit || !ALLOWED_UNITS.includes(trimmedUnit)) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Measurement Unit',
        cause: `Invalid Unit of Measurement: Unit must be typed as one of: ${ALLOWED_UNITS.join(', ')} (received: "${unit}").`,
        backUrl
      });
    }

    await prisma.ingredient.create({
      data: {
        name: trimmedName,
        unit: trimmedUnit
      }
    });

    return res.redirect(303, '/admin/ingredients?msg=created');
  } catch (err) {
    console.error('Error creating ingredient:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Server Error',
      cause: `Failed to create ingredient: ${err.message}`,
      backUrl
    });
  }
});

// PATCH /admin/ingredients/:id - Update ingredient (PRG: 303 on success, 400 on invalid, 404 on not found)
router.patch('/ingredients/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  const backUrl = getBackUrl(req, '/admin/ingredients');

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Ingredient ID',
      error: `Invalid ingredient ID "${rawId}". Ingredient ID must be a positive integer.`,
      backUrl: '/dishes'
    });
  }

  try {
    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).render('errors/404', {
        title: '404 - Ingredient Not Found',
        error: `Ingredient with ID #${id} was not found in the database.`,
        backUrl: '/dishes'
      });
    }

    const { name, unit } = req.body;

    // 1. Validate Name (must not be blank, must not duplicate another ingredient)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Ingredient Name Required',
        cause: 'Ingredient name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const otherIngredients = await prisma.ingredient.findMany({
      where: { NOT: { id } },
      select: { name: true }
    });
    if (otherIngredients.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Ingredient Name',
        cause: `Duplicate Ingredient Name: Another ingredient is already named "${trimmedName}". Ingredient names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Unit of measurement (Must be one of: kg, g, ml, l, tbsp, pcs, bunches)
    const trimmedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
    if (!trimmedUnit || !ALLOWED_UNITS.includes(trimmedUnit)) {
      return res.status(400).render('errors/400', {
        title: '400 - Invalid Measurement Unit',
        cause: `Invalid Unit of Measurement: Unit must be typed as one of: ${ALLOWED_UNITS.join(', ')} (received: "${unit}").`,
        backUrl
      });
    }

    await prisma.ingredient.update({
      where: { id },
      data: {
        name: trimmedName,
        unit: trimmedUnit
      }
    });

    return res.redirect(303, '/admin/ingredients?msg=updated');
  } catch (err) {
    console.error('Error updating ingredient:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Update Failed',
      cause: `Failed to update ingredient: ${err.message}`,
      backUrl
    });
  }
});

// DELETE /admin/ingredients/:id - Delete ingredient
router.delete('/ingredients/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Ingredient ID',
      error: `Invalid ingredient ID "${rawId}" for deletion.`,
      backUrl: '/dishes'
    });
  }

  try {
    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).render('errors/404', {
        title: '404 - Ingredient Not Found',
        error: `Ingredient with ID #${id} was not found for deletion.`,
        backUrl: '/dishes'
      });
    }

    // Transaction to delete all dishes containing this ingredient, then delete the ingredient
    await prisma.$transaction(async (tx) => {
      // 1. Find all dishes that contain this ingredient
      const dishesWithIngredient = await tx.dish.findMany({
        where: {
          ingredients: {
            some: { id }
          }
        },
        select: { id: true }
      });

      // 2. Delete those dishes
      if (dishesWithIngredient.length > 0) {
        await tx.dish.deleteMany({
          where: {
            id: { in: dishesWithIngredient.map(d => d.id) }
          }
        });
      }

      // 3. Delete the ingredient
      await tx.ingredient.delete({
        where: { id }
      });
    });

    return res.redirect(303, '/admin/ingredients?msg=deleted');
  } catch (err) {
    console.error('Error deleting ingredient:', err);
    return res.status(404).render('errors/404', {
      title: '404 - Delete Failed',
      error: `Failed to delete ingredient: ${err.message}`,
      backUrl: '/dishes'
    });
  }
});

module.exports = router;
