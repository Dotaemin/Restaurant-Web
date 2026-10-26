const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Customer home -> redirect to /dishes
router.get('/', (req, res) => {
  return res.redirect(303, '/dishes');
});

// GET /dishes - Customer menu list
router.get('/dishes', async (req, res, next) => {
  try {
    const category = req.query.category;
    const where = {};
    if (category && category !== 'All') {
      where.category = category;
    }

    const dishes = await prisma.dish.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        chef: true,
        ingredients: true
      }
    });

    const error = req.query.error;
    const msg = req.query.msg;

    res.render('customer/dishes', {
      title: 'Menu - B.H.T Diner',
      dishes,
      selectedCategory: category || 'All',
      error,
      msg
    });
  } catch (err) {
    console.error('Error fetching dishes:', err);
    res.render('customer/dishes', {
      title: 'Menu - B.H.T Diner',
      dishes: [],
      selectedCategory: 'All',
      error: 'db_connection_failed',
      errorMessage: err.message,
      msg: null
    });
  }
});

// GET /dishes/:id - Customer dish details
router.get('/dishes/:id', async (req, res, next) => {
  const rawId = req.params.id;
  const id = parseInt(rawId, 10);

  // Validate ID format (must be a valid integer)
  if (isNaN(id) || id <= 0) {
    return res.status(404).render('errors/404', {
      title: '404 - Invalid Dish ID',
      error: `Invalid dish ID "${rawId}". Dish ID must be a positive number.`,
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
        error: `Dish with ID #${id} was not found on our menu.`,
        backUrl: '/dishes'
      });
    }

    res.render('customer/dishDetail', {
      title: `${dish.name} - B.H.T Diner`,
      dish,
      error: null,
      msg: null
    });
  } catch (err) {
    console.error('Error fetching dish detail:', err);
    return res.status(404).render('errors/404', {
      title: '404 - Database Error',
      error: `Could not retrieve dish with ID #${id}. Error: ${err.message}`,
      backUrl: '/dishes'
    });
  }
});

module.exports = router;
