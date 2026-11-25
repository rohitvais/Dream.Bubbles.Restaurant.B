require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/outlets', require('./routes/outletRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));

// Root / Health check
app.get('/', (req, res) => {
  res.json({
    name: 'Dream Bubbles API',
    status: 'online',
    version: '1.0.0',
    endpoints: [
      '/api/outlets',
      '/api/outlets/nearby',
      '/api/categories',
      '/api/products',
      '/api/inventory',
      '/api/orders',
      '/api/analytics/dashboard',
    ],
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Route Not Found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Server Internal Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Dream Bubbles Backend server running on port ${PORT}`);
});
