require('dotenv').config();
const express = require('express');
const cors = require('cors');
const methodOverride = require('method-override');

const apiDishesRouter = require('./routes/api/dishes');
const apiChefsRouter = require('./routes/api/chefs');
const apiIngredientsRouter = require('./routes/api/ingredients');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - read origin strictly from environment / specs, never '*'
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-HTTP-Method-Override']
}));

// Parse JSON and URL-encoded request bodies
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
// Note: Per spec, technical 404 response body does NOT have "ok"
app.use((req, res) => {
  return res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized 500 error handler for database disconnections / technical errors
// Note: Per spec, technical 500 response body does NOT have "ok"
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected technical error occurred.'
  });
});

// Start listening if not running in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🍽️  B.H.T Diner API Server running on http://localhost:${PORT}`);
    console.log(`🔒  CORS Origin Allowed: ${allowedOrigin}`);
    console.log(`📋  Customer Dishes:  http://localhost:${PORT}/api/dishes`);
    console.log(`⚙️   Admin Dishes:     http://localhost:${PORT}/api/admin/dishes`);
    console.log(`👨‍🍳  Admin Chefs:      http://localhost:${PORT}/api/admin/chefs`);
    console.log(`🧂  Admin Ingredients:http://localhost:${PORT}/api/admin/ingredients`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
