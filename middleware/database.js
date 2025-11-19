const dbConnection = require('../utils/database');

// Middleware to ensure database connection
const ensureDbConnection = async (req, res, next) => {
  try {
    const isHealthy = await dbConnection.healthCheck();
    
    if (!isHealthy) {
      return res.status(503).json({
        message: 'Database temporarily unavailable. Please try again.',
        code: 'DB_CONNECTION_ERROR'
      });
    }
    
    next();
  } catch (error) {
    console.error('Database connection middleware error:', error);
    return res.status(503).json({
      message: 'Database connection failed. Please try again later.',
      code: 'DB_CONNECTION_ERROR'
    });
  }
};

// Middleware to handle Prisma errors
const handlePrismaErrors = (error, req, res, next) => {
  console.error('Prisma error:', error);

  // Connection errors
  if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1008') {
    return res.status(503).json({
      message: 'Database connection error. Please try again.',
      code: 'DB_CONNECTION_ERROR'
    });
  }

  // Unique constraint violation
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'field';
    return res.status(409).json({
      message: `${field} already exists`,
      code: 'DUPLICATE_ENTRY'
    });
  }

  // Record not found
  if (error.code === 'P2025') {
    return res.status(404).json({
      message: 'Record not found',
      code: 'NOT_FOUND'
    });
  }

  // Foreign key constraint violation
  if (error.code === 'P2003') {
    return res.status(400).json({
      message: 'Invalid reference to related record',
      code: 'FOREIGN_KEY_ERROR'
    });
  }

  // Timeout errors
  if (error.code === 'P1008' || error.message?.includes('timeout')) {
    return res.status(408).json({
      message: 'Database operation timed out. Please try again.',
      code: 'DB_TIMEOUT'
    });
  }

  // Default server error
  return res.status(500).json({
    message: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
};

module.exports = {
  ensureDbConnection,
  handlePrismaErrors
};