const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');

const ALLOWED_UNITS = ['kg', 'g', 'ml', 'l', 'tbsp', 'pcs', 'bunches'];

// GET /api/ingredients & /api/admin/ingredients
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, unit, sortBy, sortOrder } = req.query;
    const defaultPageSize = 20;

    let limit = defaultPageSize;
    if (pageSize !== undefined && pageSize !== null && pageSize !== '') {
      const parsedPageSize = parseInt(pageSize, 10);
      if (isNaN(parsedPageSize) || parsedPageSize <= 0 || String(parsedPageSize) !== String(pageSize).trim()) {
        return res.status(200).json({
          ok: false,
          data: {
            items: [],
            meta: { total: 0, page: 1, pageSize }
          },
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu không hợp lệ',
            fields: { pageSize: 'Kích thước trang phải là số nguyên dương' }
          }
        });
      }
      limit = Math.min(parsedPageSize, 100);
    }

    let currentPage = 1;
    if (page !== undefined && page !== null && page !== '') {
      const parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage <= 0 || String(parsedPage) !== String(page).trim()) {
        return res.status(200).json({
          ok: false,
          data: {
            items: [],
            meta: { total: 0, page, pageSize: limit }
          },
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Dữ liệu không hợp lệ',
            fields: { page: 'Số trang phải là số nguyên dương' }
          }
        });
      }
      currentPage = parsedPage;
    }

    const offset = (currentPage - 1) * limit;

    const where = {};
    if (unit && unit !== 'All') {
      where.unit = { equals: unit, mode: 'insensitive' };
    }

    let orderBy = { id: 'asc' };
    if (sortBy) {
      const direction = sortOrder === 'desc' ? 'desc' : 'asc';
      if (sortBy === 'name') orderBy = { name: direction };
    }

    const total = await prisma.ingredient.count({ where });

    if (offset >= total) {
      return res.status(200).json({
        ok: true,
        data: {
          items: [],
          meta: { total, page: currentPage, pageSize: limit }
        },
        error: null
      });
    }

    const ingredients = await prisma.ingredient.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy,
      include: {
        dishes: {
          select: { id: true, name: true, category: true, price: true, available: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: {
        items: ingredients || [],
        meta: { total, page: currentPage, pageSize: limit }
      },
      error: null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ingredients/:id - Retrieve single ingredient by ID
router.get('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid ingredient ID "${rawId}". Ingredient ID must be a positive integer.`
        }
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, category: true, price: true, available: true }
        }
      }
    });

    if (!ingredient) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Ingredient with ID #${id} was not found.`
        }
      });
    }

    return res.status(200).json({
      ok: true,
      data: ingredient
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ingredients - Create ingredient
router.post('/', async (req, res, next) => {
  try {
    const { name, unit } = req.body;
    const fields = {};

    // 1. Validate Name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      fields.name = 'Ingredient name is required and cannot be left blank.';
    } else {
      const trimmedName = name.trim();
      const existingIngredients = await prisma.ingredient.findMany({ select: { name: true } });
      if (existingIngredients.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
        fields.name = `Duplicate Ingredient Name: An ingredient named "${trimmedName}" already exists. Ingredient names must be unique.`;
      }
    }

    // 2. Validate Unit
    const trimmedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
    if (!trimmedUnit || !ALLOWED_UNITS.includes(trimmedUnit)) {
      fields.unit = `Invalid Unit of Measurement: Unit must be one of: ${ALLOWED_UNITS.join(', ')}.`;
    }

    if (Object.keys(fields).length > 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid form input. Please check the specified fields.',
          fields
        }
      });
    }

    const newIngredient = await prisma.ingredient.create({
      data: {
        name: name.trim(),
        unit: trimmedUnit
      },
      include: {
        dishes: {
          select: { id: true, name: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: newIngredient
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/ingredients/:id - Update ingredient
router.patch('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid ingredient ID "${rawId}".`
        }
      });
    }

    const existing = await prisma.ingredient.findUnique({ where: { id } });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Ingredient with ID #${id} was not found.`
        }
      });
    }

    const { name, unit } = req.body;
    const fields = {};

    // 1. Validate Name
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        fields.name = 'Ingredient name is required and cannot be left blank.';
      } else {
        const trimmedName = name.trim();
        const otherIngredients = await prisma.ingredient.findMany({
          where: { NOT: { id } },
          select: { name: true }
        });
        if (otherIngredients.some(i => i.name.toLowerCase() === trimmedName.toLowerCase())) {
          fields.name = `Duplicate Ingredient Name: Another ingredient is already named "${trimmedName}". Ingredient names must be unique.`;
        }
      }
    }

    // 2. Validate Unit
    let trimmedUnit = undefined;
    if (unit !== undefined) {
      trimmedUnit = typeof unit === 'string' ? unit.trim().toLowerCase() : '';
      if (!trimmedUnit || !ALLOWED_UNITS.includes(trimmedUnit)) {
        fields.unit = `Invalid Unit of Measurement: Unit must be one of: ${ALLOWED_UNITS.join(', ')}.`;
      }
    }

    if (Object.keys(fields).length > 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid form input. Please check the specified fields.',
          fields
        }
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (trimmedUnit !== undefined) updateData.unit = trimmedUnit;

    const updatedIngredient = await prisma.ingredient.update({
      where: { id },
      data: updateData,
      include: {
        dishes: {
          select: { id: true, name: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: updatedIngredient
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/ingredients/:id - Cascade delete dishes containing this ingredient, then delete ingredient
router.delete('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid ingredient ID "${rawId}".`
        }
      });
    }

    const existing = await prisma.ingredient.findUnique({
      where: { id },
      include: {
        dishes: { select: { id: true, name: true } }
      }
    });

    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Ingredient with ID #${id} was not found.`
        }
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Find all dishes containing this ingredient
      const dishesWithIngredient = await tx.dish.findMany({
        where: {
          ingredients: {
            some: { id }
          }
        },
        select: { id: true }
      });

      // 2. Cascade delete those dishes
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

    return res.status(200).json({
      ok: true,
      data: {
        id,
        deletedDishesCount: existing.dishes.length,
        message: `Ingredient "${existing.name}" and ${existing.dishes.length} associated dish(es) deleted successfully.`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
