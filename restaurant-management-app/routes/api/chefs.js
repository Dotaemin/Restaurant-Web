const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');

// GET /api/chefs & /api/admin/chefs
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, specialty, sortBy, sortOrder } = req.query;
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
    if (specialty && typeof specialty === 'string' && specialty.trim().length > 0) {
      where.specialty = { contains: specialty.trim(), mode: 'insensitive' };
    }

    let orderBy = { id: 'asc' };
    if (sortBy) {
      const direction = sortOrder === 'desc' ? 'desc' : 'asc';
      if (sortBy === 'name') orderBy = { name: direction };
      else if (sortBy === 'specialty') orderBy = { specialty: direction };
    }

    const total = await prisma.chef.count({ where });

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

    const chefs = await prisma.chef.findMany({
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
        items: chefs || [],
        meta: { total, page: currentPage, pageSize: limit }
      },
      error: null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/chefs/:id - Retrieve single chef by ID
router.get('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid chef ID "${rawId}". Chef ID must be a positive integer.`
        }
      });
    }

    const chef = await prisma.chef.findUnique({
      where: { id },
      include: {
        dishes: {
          select: { id: true, name: true, category: true, price: true, available: true }
        }
      }
    });

    if (!chef) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Chef with ID #${id} was not found.`
        }
      });
    }

    return res.status(200).json({
      ok: true,
      data: chef
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/chefs - Create chef
router.post('/', async (req, res, next) => {
  try {
    const { name, specialty } = req.body;
    const fields = {};

    // 1. Validate Name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      fields.name = 'Chef name is required and cannot be left blank.';
    } else {
      const trimmedName = name.trim();
      const existingChefs = await prisma.chef.findMany({ select: { name: true } });
      if (existingChefs.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        fields.name = `Duplicate Chef Name: A chef named "${trimmedName}" already exists. Chef names must be unique.`;
      }
    }

    // 2. Validate Specialty
    if (!specialty || typeof specialty !== 'string' || specialty.trim().length === 0) {
      fields.specialty = 'Chef specialty is required and cannot be left blank.';
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

    const newChef = await prisma.chef.create({
      data: {
        name: name.trim(),
        specialty: specialty.trim()
      },
      include: {
        dishes: {
          select: { id: true, name: true }
        }
      }
    });

    return res.status(200).json({
      ok: true,
      data: newChef
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/chefs/:id - Update chef
router.patch('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid chef ID "${rawId}".`
        }
      });
    }

    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Chef with ID #${id} was not found.`
        }
      });
    }

    const { name, specialty } = req.body;
    const fields = {};

    // 1. Validate Name
    if (name !== undefined) {
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        fields.name = 'Chef name is required and cannot be left blank.';
      } else {
        const trimmedName = name.trim();
        const otherChefs = await prisma.chef.findMany({
          where: { NOT: { id } },
          select: { name: true }
        });
        if (otherChefs.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
          fields.name = `Duplicate Chef Name: Another chef is already named "${trimmedName}". Chef names must be unique.`;
        }
      }
    }

    // 2. Validate Specialty
    if (specialty !== undefined && (!specialty || typeof specialty !== 'string' || specialty.trim().length === 0)) {
      fields.specialty = 'Chef specialty cannot be left blank.';
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
    if (specialty !== undefined) updateData.specialty = specialty.trim();

    const updatedChef = await prisma.chef.update({
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
      data: updatedChef
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/chefs/:id - Cascade delete chef's dishes, keep ingredients
router.delete('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = parseInt(rawId, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(200).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Invalid chef ID "${rawId}".`
        }
      });
    }

    const existing = await prisma.chef.findUnique({
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
          message: `Chef with ID #${id} was not found.`
        }
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete dishes cooked by this chef
      await tx.dish.deleteMany({
        where: { chefId: id }
      });
      // 2. Delete the chef
      await tx.chef.delete({
        where: { id }
      });
    });

    return res.status(200).json({
      ok: true,
      data: {
        id,
        deletedDishesCount: existing.dishes.length,
        message: `Chef "${existing.name}" and ${existing.dishes.length} associated dish(es) deleted successfully.`
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
