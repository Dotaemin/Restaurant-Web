const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');

const ALLOWED_CATEGORIES = ['Main Course', 'Appetizer', 'Dessert', 'Beverage'];

// GET /api/dishes (Customer) & /api/admin/dishes (Admin)
router.get('/', async (req, res, next) => {
  try {
    const { category, search, page, pageSize, chefId, ingredientId, available, status, sortBy, sortOrder } = req.query;
    const isAdmin = req.baseUrl.includes('/admin');

    // 1. Determine and Validate pageSize
    const defaultPageSize = isAdmin ? 20 : 12;
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

    // 2. Determine and Validate page
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

    // 3. Handle Server-Side Postgres Full-Text Search (User search)
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchTerm = search.trim();
      const hasCategory = category && category !== 'All';

      let countResult;
      let idRows;

      if (hasCategory) {
        countResult = await prisma.$queryRaw`
          SELECT COUNT(*)::int as count 
          FROM "Dish"
          WHERE to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", '')) @@ plainto_tsquery('simple', ${searchTerm})
            AND category = ${category}
        `;
        const total = countResult[0]?.count || 0;

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

        idRows = await prisma.$queryRaw`
          SELECT id 
          FROM "Dish"
          WHERE to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", '')) @@ plainto_tsquery('simple', ${searchTerm})
            AND category = ${category}
          ORDER BY id ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        countResult = await prisma.$queryRaw`
          SELECT COUNT(*)::int as count 
          FROM "Dish"
          WHERE to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", '')) @@ plainto_tsquery('simple', ${searchTerm})
        `;
        const total = countResult[0]?.count || 0;

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

        idRows = await prisma.$queryRaw`
          SELECT id 
          FROM "Dish"
          WHERE to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", '')) @@ plainto_tsquery('simple', ${searchTerm})
          ORDER BY id ASC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      const total = countResult[0]?.count || 0;
      const ids = idRows.map(r => r.id);

      const dishes = await prisma.dish.findMany({
        where: { id: { in: ids } },
        orderBy: { id: 'asc' },
        include: {
          chef: true,
          ingredients: true
        }
      });

      const idMap = new Map(dishes.map(d => [d.id, d]));
      const sortedDishes = ids.map(id => idMap.get(id)).filter(Boolean);

      return res.status(200).json({
        ok: true,
        data: {
          items: sortedDishes,
          meta: { total, page: currentPage, pageSize: limit }
        },
        error: null
      });
    }

    // 4. Standard Non-Search Query (with optional category, chef, ingredient, status filters & sorting)
    const where = {};
    if (category && category !== 'All') {
      where.category = category;
    }
    if (chefId && chefId !== 'All') {
      const parsedChefId = parseInt(chefId, 10);
      if (!isNaN(parsedChefId)) {
        where.chefId = parsedChefId;
      }
    }
    if (ingredientId && ingredientId !== 'All') {
      const parsedIngId = parseInt(ingredientId, 10);
      if (!isNaN(parsedIngId)) {
        where.ingredients = { some: { id: parsedIngId } };
      }
    }
    if (available !== undefined && available !== null && available !== 'All') {
      if (available === 'true' || available === true || status === 'available') {
        where.available = true;
      } else if (available === 'false' || available === false || status === 'soldout') {
        where.available = false;
      }
    } else if (status && status !== 'All') {
      if (status === 'available') where.available = true;
      if (status === 'soldout') where.available = false;
    }

    let orderBy = { id: 'asc' };
    if (sortBy) {
      const direction = sortOrder === 'desc' ? 'desc' : 'asc';
      if (sortBy === 'name') orderBy = { name: direction };
      else if (sortBy === 'price') orderBy = { price: direction };
      else if (sortBy === 'category') orderBy = { category: direction };
      else if (sortBy === 'chef') orderBy = { chef: { name: direction } };
    }

    const total = await prisma.dish.count({ where });

    // Out of bounds check
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

    const dishes = await prisma.dish.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy,
      include: {
        chef: true,
        ingredients: true
      }
    });

    return res.status(200).json({
      ok: true,
      data: {
        items: dishes || [],
        meta: { total, page: currentPage, pageSize: limit }
      },
      error: null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dishes/:id - Retrieve single dish by ID
router.get('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid dish ID "${rawId}". Dish ID must be a positive integer.`
        }
      });
    }

    const dish = await prisma.dish.findUnique({
      where: { id },
      include: {
        chef: true,
        ingredients: true
      }
    });

    if (!dish) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Dish with ID #${id} was not found.`
        }
      });
    }

    return res.status(200).json({
      ok: true,
      data: dish
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/dishes - Create a new dish
router.post('/', async (req, res, next) => {
  try {
    const { name, description, price, category, available, imageUrl, chefId, ingredientIds } = req.body;
    const fields = {};

    // 1. Validate Name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      fields.name = 'Dish name is required and cannot be left blank.';
    } else {
      const trimmedName = name.trim();
      const existingDish = await prisma.dish.findFirst({
        where: { name: { equals: trimmedName } }
      });
      if (existingDish) {
        fields.name = `A dish named "${trimmedName}" already exists. Name must be unique.`;
      }
    }

    // 2. Validate Price
    const parsedPrice = parseFloat(price);
    if (price === undefined || price === null || price === '' || isNaN(parsedPrice)) {
      fields.price = 'Price is required and must be a valid number.';
    } else if (parsedPrice < 0) {
      fields.price = 'Price must not be a negative number.';
    }

    // 3. Validate Category
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      fields.category = `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`;
    }

    // 4. Validate Chef
    const parsedChefId = parseInt(chefId, 10);
    if (!chefId || isNaN(parsedChefId)) {
      fields.chefId = 'A valid chef selection is required.';
    } else {
      const chefExists = await prisma.chef.findUnique({ where: { id: parsedChefId } });
      if (!chefExists) {
        fields.chefId = `Chef with ID #${parsedChefId} was not found.`;
      }
    }

    // 5. Validate Description
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      fields.description = 'Dish description is required and cannot be left blank.';
    }

    // 6. Validate Ingredients
    let formattedIngIds = [];
    if (Array.isArray(ingredientIds)) {
      formattedIngIds = ingredientIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    } else if (ingredientIds) {
      const singleId = parseInt(ingredientIds, 10);
      if (!isNaN(singleId)) formattedIngIds.push(singleId);
    }

    if (formattedIngIds.length === 0) {
      fields.ingredientIds = 'At least one ingredient must be chosen for the dish.';
    }

    // 7. Validate Image URL (Required)
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
      fields.imageUrl = 'Dish image URL is required and cannot be left blank.';
    }

    // Return validation errors if any
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

    const finalImageUrl = imageUrl.trim();

    // Create Dish Record in database
    const newDish = await prisma.dish.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        category,
        available: available === true || available === 'on' || available === 'true',
        imageUrl: finalImageUrl,
        chefId: parsedChefId,
        ingredients: {
          connect: formattedIngIds.map(id => ({ id }))
        }
      },
      include: {
        chef: true,
        ingredients: true
      }
    });

    return res.status(200).json({
      ok: true,
      data: newDish
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/dishes/:id - Update existing dish
router.patch('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid dish ID "${rawId}".`
        }
      });
    }

    const existingDish = await prisma.dish.findUnique({
      where: { id },
      include: { ingredients: true }
    });

    if (!existingDish) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Dish with ID #${id} was not found.`
        }
      });
    }

    const { name, description, price, category, available, imageUrl, chefId, ingredientIds } = req.body;
    const fields = {};

    // 1. Validate Name (unique except current dish)
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        fields.name = 'Dish name is required and cannot be left blank.';
      } else {
        const trimmedName = name.trim();
        const duplicate = await prisma.dish.findFirst({
          where: {
            name: { equals: trimmedName },
            id: { not: id }
          }
        });
        if (duplicate) {
          fields.name = `A dish named "${trimmedName}" already exists. Name must be unique.`;
        }
      }
    }

    // 2. Validate Price
    let parsedPrice = existingDish.price;
    if (price !== undefined) {
      parsedPrice = parseFloat(price);
      if (price === null || price === '' || isNaN(parsedPrice)) {
        fields.price = 'Price must be a valid number.';
      } else if (parsedPrice < 0) {
        fields.price = 'Price must not be a negative number.';
      }
    }

    // 3. Validate Category
    if (category !== undefined && !ALLOWED_CATEGORIES.includes(category)) {
      fields.category = `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`;
    }

    // 4. Validate Chef
    let parsedChefId = existingDish.chefId;
    if (chefId !== undefined) {
      parsedChefId = parseInt(chefId, 10);
      if (isNaN(parsedChefId)) {
        fields.chefId = 'A valid chef selection is required.';
      } else {
        const chefExists = await prisma.chef.findUnique({ where: { id: parsedChefId } });
        if (!chefExists) {
          fields.chefId = `Chef with ID #${parsedChefId} was not found.`;
        }
      }
    }

    // 5. Validate Description
    if (description !== undefined && (!description || description.trim().length === 0)) {
      fields.description = 'Dish description cannot be left blank.';
    }

    // 6. Validate Ingredients
    let formattedIngIds = undefined;
    if (ingredientIds !== undefined) {
      if (Array.isArray(ingredientIds)) {
        formattedIngIds = ingredientIds.map(i => parseInt(i, 10)).filter(i => !isNaN(i));
      } else if (ingredientIds) {
        const singleId = parseInt(ingredientIds, 10);
        if (!isNaN(singleId)) formattedIngIds = [singleId];
      } else {
        formattedIngIds = [];
      }

      if (formattedIngIds.length === 0) {
        fields.ingredientIds = 'At least one ingredient must be chosen for the dish.';
      }
    }

    // 7. Validate Image URL
    if (imageUrl !== undefined) {
      if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
        fields.imageUrl = 'Dish image URL cannot be left blank.';
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

    // Prepare update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (price !== undefined) updateData.price = parsedPrice;
    if (category !== undefined) updateData.category = category;
    if (available !== undefined) updateData.available = available === true || available === 'on' || available === 'true';
    if (imageUrl !== undefined && imageUrl.trim().length > 0) updateData.imageUrl = imageUrl.trim();
    if (chefId !== undefined) updateData.chefId = parsedChefId;

    if (formattedIngIds !== undefined) {
      updateData.ingredients = {
        set: formattedIngIds.map(iId => ({ id: iId }))
      };
    }

    const updatedDish = await prisma.dish.update({
      where: { id },
      data: updateData,
      include: {
        chef: true,
        ingredients: true
      }
    });

    return res.status(200).json({
      ok: true,
      data: updatedDish
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/dishes/:id - Delete dish (Chef and ingredients remain)
router.delete('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid dish ID "${rawId}".`
        }
      });
    }

    const existingDish = await prisma.dish.findUnique({ where: { id } });
    if (!existingDish) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Dish with ID #${id} was not found.`
        }
      });
    }

    await prisma.dish.delete({ where: { id } });

    return res.status(200).json({
      ok: true,
      data: {
        id,
        message: `Dish "${existingDish.name}" deleted successfully.`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
