const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const fs = require('fs');
const path = require('path');
const dbConnection = require('./utils/database');
const { ensureDbConnection, handlePrismaErrors } = require('./middleware/database');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Database connection middleware for API routes
app.use('/api', ensureDbConnection);

// Load routes asynchronously
const loadRoutes = async () => {
  const routesPath = path.join(__dirname, 'routes');
  const files = fs.readdirSync(routesPath);

  for (const file of files) {
    if (file.endsWith('Route.js')) {
      const route = require(`./routes/${file}`);
      
      // Map routes based on filename
      switch (file) {
        case 'authRoute.js':
          app.use('/api/auth', route);
          break;
        case 'adminRoute.js':
          app.use('/api/admin', route);
          break;
        case 'productsRoute.js':
          app.use('/api/products', route);
          break;
        case 'categoriesRoute.js':
          app.use('/api/categories', route);
          app.use('/api/admin/categories', route);
          break;
        case 'ordersRoute.js':
          app.use('/api/orders', route);
          break;
        case 'usersRoute.js':
          app.use('/api/users', route);
          break;
        case 'userRoute.js':
          app.use('/api/user', route);
          break;
        case 'orderRoute.js':
          app.use('/api/orders', route);
          break;
      }
    }
  }
};

// Initialize routes
loadRoutes();

// Health check with database status
app.get('/api/health', async (req, res) => {
  try {
    const dbHealthy = await dbConnection.healthCheck();
    const connectionStatus = dbConnection.getConnectionStatus();
    
    res.json({ 
      status: dbHealthy ? 'OK' : 'Degraded', 
      database: {
        connected: dbHealthy,
        status: dbHealthy ? 'Connected' : 'Disconnected',
        retries: connectionStatus.retries,
        maxRetries: connectionStatus.maxRetries
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      },
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'Error', 
      database: {
        connected: false,
        status: 'Error',
        error: error.message
      },
      timestamp: new Date().toISOString() 
    });
  }
});

// Prisma error handling middleware
app.use(handlePrismaErrors);

// General error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    code: 'INTERNAL_ERROR',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Initialize database connection
const initializeServer = async () => {
  try {
    // Test database connection
    await dbConnection.testConnection();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Admin Dashboard: http://localhost:${PORT}/api/admin`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await dbConnection.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await dbConnection.disconnect();
  process.exit(0);
});

// Start server
initializeServer();

module.exports = { app, loadRoutes };