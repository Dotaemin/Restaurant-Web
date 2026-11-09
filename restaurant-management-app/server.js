require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');

const { sessionMiddleware } = require('./lib/authMiddleware');

const authRouter = require('./routes/auth');
const customerRouter = require('./routes/customer');
const adminDishesRouter = require('./routes/adminDishes');
const adminChefsRouter = require('./routes/adminChefs');
const adminIngredientsRouter = require('./routes/adminIngredients');

const apiDishesRouter = require('./routes/api/dishes');
const apiChefsRouter = require('./routes/api/chefs');
const apiIngredientsRouter = require('./routes/api/ingredients');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup for server-side EJS rendering
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration - read origin strictly from environment / specs, never '*'
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-HTTP-Method-Override']
}));

// Cookie Parser & Request body parsers
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Method Override Middleware:
// Supports 'X-HTTP-Method-Override' header, '_method' query param, and '_method' body field
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(methodOverride('_method'));
app.use(methodOverride((req) => {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

// Global session authentication middleware (extracts user and session from JWT cookie)
app.use(sessionMiddleware);

// Web Application Routers (Auth, Customer SSR, Admin SSR)
app.use('/', authRouter);
app.use('/', customerRouter);
app.use('/admin', adminDishesRouter);
app.use('/admin', adminChefsRouter);
app.use('/admin', adminIngredientsRouter);

// Resource-Based REST API Routers
// Customer routes:
app.use('/api/dishes', apiDishesRouter);

// Admin routes:
app.use('/api/admin/dishes', apiDishesRouter);
app.use('/api/admin/chefs', apiChefsRouter);
app.use('/api/admin/ingredients', apiIngredientsRouter);

// Aliases for chefs & ingredients
app.use('/api/chefs', apiChefsRouter);
app.use('/api/ingredients', apiIngredientsRouter);

// Catch-all 404 handler for invalid URLs / technical route errors
app.use((req, res) => {
  if (!req.originalUrl.startsWith('/api') && req.accepts('html')) {
    return res.status(404).render('errors/404', {
      title: 'Page Not Found',
      error: `The page you requested "${req.originalUrl}" does not exist.`,
      backUrl: '/dishes'
    });
  }
  return res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized 500 error handler for database disconnections / technical errors
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  if (!req.originalUrl.startsWith('/api') && req.accepts('html')) {
    return res.status(500).render('errors/400', {
      title: 'Server Error',
      cause: 'An unexpected problem occurred. Please try again in a few moments.',
      backUrl: '/dishes'
    });
  }
  return res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected technical error occurred.'
  });
});

// Start listening if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🍽️  B.H.T Diner Server running on http://localhost:${PORT}`);
    console.log(`🔒  CORS Origin Allowed: ${allowedOrigin}`);
    console.log(`📋  Customer Dishes:  http://localhost:${PORT}/dishes`);
    console.log(`🔑  Sign In:          http://localhost:${PORT}/login`);
    console.log(`📝  Register:         http://localhost:${PORT}/register`);
    console.log(`⚙️   Admin Dishes:     http://localhost:${PORT}/admin/dishes`);
    console.log(`👨‍🍳  Admin Chefs:      http://localhost:${PORT}/admin/chefs`);
    console.log(`🧂  Admin Ingredients:http://localhost:${PORT}/admin/ingredients`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
