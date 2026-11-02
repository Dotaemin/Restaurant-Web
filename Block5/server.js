require('dotenv').config();
const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');

const { blockHttpTools, sessionMiddleware, requireAdmin } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const customerRouter = require('./routes/customer');
const adminDishesRouter = require('./routes/adminDishes');
const adminChefsRouter = require('./routes/adminChefs');
const adminIngredientsRouter = require('./routes/adminIngredients');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets (compiled Tailwind CSS, images) - Zero JavaScript files
app.use(express.static(path.join(__dirname, 'public')));

// Parse cookies & URL-encoded bodies for HTML forms
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Check server middleware: Reject any direct calls using HTTP tools
app.use(blockHttpTools);

// Session middleware: Load persistent database session
app.use(sessionMiddleware);

// Method override for PUT, PATCH, DELETE from standard HTML forms
app.use(methodOverride('_method'));
app.use(methodOverride((req) => {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

// Mount Auth Routes (Login, Register, Activation, Forget, Reset, Logout)
app.use('/', authRouter);

// Customer Routes (Public)
app.use('/', customerRouter);

// URL aliases for singular paths (Protected)
app.get('/admin/chef', requireAdmin, (req, res) => res.redirect(303, '/admin/chefs'));
app.get('/admin/ingredient', requireAdmin, (req, res) => res.redirect(303, '/admin/ingredients'));
app.get('/admin/dish', requireAdmin, (req, res) => res.redirect(303, '/admin/dishes'));

// Mount Protected Admin Routers
app.use('/admin', requireAdmin, adminDishesRouter);
app.use('/admin', requireAdmin, adminChefsRouter);
app.use('/admin', requireAdmin, adminIngredientsRouter);

// Catch-all 404 handler (shows dedicated 404 error page)
app.use((req, res) => {
  return res.status(404).render('errors/404', {
    title: '404 - Page Not Found',
    error: `The requested path "${req.originalUrl}" was not found on this server.`,
    backUrl: '/dishes'
  });
});

// Centralized error handler (shows dedicated 400 error page)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  return res.status(400).render('errors/400', {
    title: '400 - Bad Request',
    cause: err.message || 'An unexpected error occurred while processing your request.',
    backUrl: req.get('Referrer') || '/dishes'
  });
});

// Only start listening if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🍽️  B.H.T Diner Server running on http://localhost:${PORT}`);
    console.log(`📋  Customer Menu: http://localhost:${PORT}/dishes`);
    console.log(`⚙️   Admin Dishes:  http://localhost:${PORT}/admin/dishes`);
    console.log(`👨‍🍳  Admin Chefs:   http://localhost:${PORT}/admin/chefs`);
    console.log(`🧂  Admin Ingredients: http://localhost:${PORT}/admin/ingredients`);
    console.log(`🔑  Login:         http://localhost:${PORT}/login`);
    console.log(`📝  Register:      http://localhost:${PORT}/register`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
