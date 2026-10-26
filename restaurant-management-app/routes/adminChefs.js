const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

const getBackUrl = (req, fallback = '/admin/chefs') => {
  return req.get('Referrer') || fallback;
};

// GET /admin/chefs - Tabular display of chefs + Add Chef form
router.get('/chefs', async (req, res, next) => {
  try {
    const chefs = await prisma.chef.findMany({
      orderBy: { id: 'asc' },
      include: {
        dishes: {
          select: { id: true, name: true }
        }
      }
    });

    res.render('admin/chefs', {
      title: 'Admin: Manage Chefs',
      chefs,
      error: req.query.error,
      msg: req.query.msg,
      editId: req.query.edit ? parseInt(req.query.edit, 10) : null,
      activeTab: 'chefs'
    });
  } catch (err) {
    console.error('Error in GET /admin/chefs:', err);
    res.render('admin/chefs', {
      title: 'Admin: Manage Chefs',
      chefs: [],
      error: 'db_connection_failed',
      errorMessage: err.message,
      msg: null,
      editId: null,
      activeTab: 'chefs'
    });
  }
});

// POST /admin/chefs - Create chef (PRG: 303 on success, 400 on invalid)
router.post('/chefs', async (req, res, next) => {
  const backUrl = getBackUrl(req, '/admin/chefs');
  try {
    const { name, specialty } = req.body;

    // 1. Validate Name (must not be blank, must not be duplicate)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Name Required',
        cause: 'Chef name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const existingChefs = await prisma.chef.findMany({ select: { name: true } });
    if (existingChefs.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Chef Name',
        cause: `Duplicate Chef Name: A chef named "${trimmedName}" is already in the database. Chef names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Specialty (can be duplicate, must not be blank)
    if (!specialty || typeof specialty !== 'string' || specialty.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Specialty Required',
        cause: 'Chef specialty is required and cannot be left blank.',
        backUrl
      });
    }

    await prisma.chef.create({
      data: {
        name: trimmedName,
        specialty: specialty.trim()
      }
    });

    return res.redirect(303, '/admin/chefs?msg=created');
  } catch (err) {
    console.error('Error creating chef:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Server Error',
      cause: `Failed to create chef: ${err.message}`,
      backUrl
    });
  }
});

// PATCH /admin/chefs/:id - Update chef (PRG: 303 on success, 400 on invalid, 404 on not found)
router.patch('/chefs/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);
  const backUrl = getBackUrl(req, '/admin/chefs');

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Chef ID',
      error: `Invalid chef ID "${rawId}". Chef ID must be a positive integer.`,
      backUrl: '/dishes'
    });
  }

  try {
    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).render('errors/404', {
        title: '404 - Chef Not Found',
        error: `Chef with ID #${id} was not found in the database.`,
        backUrl: '/dishes'
      });
    }

    const { name, specialty } = req.body;

    // 1. Validate Name (must not be blank, must not duplicate another chef)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Chef Name Required',
        cause: 'Chef name is required and cannot be left blank.',
        backUrl
      });
    }
    const trimmedName = name.trim();
    const otherChefs = await prisma.chef.findMany({
      where: { NOT: { id } },
      select: { name: true }
    });
    if (otherChefs.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).render('errors/400', {
        title: '400 - Duplicate Chef Name',
        cause: `Duplicate Chef Name: Another chef is already named "${trimmedName}". Chef names must be unique.`,
        backUrl
      });
    }

    // 2. Validate Specialty (can be duplicate, must not be blank)
    if (!specialty || typeof specialty !== 'string' || specialty.trim().length === 0) {
      return res.status(400).render('errors/400', {
        title: '400 - Specialty Required',
        cause: 'Chef specialty is required and cannot be left blank.',
        backUrl
      });
    }

    await prisma.chef.update({
      where: { id },
      data: {
        name: trimmedName,
        specialty: specialty.trim()
      }
    });

    return res.redirect(303, '/admin/chefs?msg=updated');
  } catch (err) {
    console.error('Error updating chef:', err);
    return res.status(400).render('errors/400', {
      title: '400 - Update Failed',
      cause: `Failed to update chef: ${err.message}`,
      backUrl
    });
  }
});

// DELETE /admin/chefs/:id - Delete chef
// Rule: "When a chef is deleted, the dish the chef cooks should be deleted as well, the ingredients should stay."
router.delete('/chefs/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);

  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Chef ID',
      error: `Invalid chef ID "${rawId}" for deletion.`,
      backUrl: '/dishes'
    });
  }

  try {
    const existing = await prisma.chef.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).render('errors/404', {
        title: '404 - Chef Not Found',
        error: `Chef with ID #${id} was not found for deletion.`,
        backUrl: '/dishes'
      });
    }

    // Execute in transaction to guarantee cascade delete of chef's dishes
    await prisma.$transaction(async (tx) => {
      // 1. Delete all dishes cooked by this chef
      await tx.dish.deleteMany({
        where: { chefId: id }
      });
      // 2. Delete the chef
      await tx.chef.delete({
        where: { id }
      });
    });

    return res.redirect(303, '/admin/chefs?msg=deleted');
  } catch (err) {
    console.error('Error deleting chef:', err);
    return res.status(404).render('errors/404', {
      title: '404 - Delete Failed',
      error: `Failed to delete chef: ${err.message}`,
      backUrl: '/dishes'
    });
  }
});

module.exports = router;
