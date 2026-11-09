require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');

const { sessionMiddleware } = require('./lib/authMiddleware');

const authRouter = require('./routes/auth');
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

// Root health & API info endpoint (replaces SSR index)
app.get('/', (req, res) => {
  res.json({
    ok: true,
    name: 'B.H.T Diner API Server',
    status: 'online',
    message: 'Backend REST API server. Client web application is hosted at http://localhost:5173'
  });
});

// Authentication REST API Router (/api/auth/*)
app.use('/', authRouter);

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

// Catch-all 404 handler for invalid URLs
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized 500 error handler for unexpected server errors
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
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
    console.log(`📡  REST API Base URL:  http://localhost:${PORT}/api`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
