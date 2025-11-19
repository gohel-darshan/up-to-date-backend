const { PrismaClient } = require('@prisma/client');

class DatabaseConnection {
  constructor() {
    this.prisma = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
  }

  getInstance() {
    if (!this.prisma) {
      this.prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        },
        errorFormat: 'pretty'
      });

      // Handle connection events - removed beforeExit as it's not supported in Prisma 5.0+
      // Connection status will be managed through our health checks

      // Auto-reconnect on connection loss
      this.setupAutoReconnect();
    }
    return this.prisma;
  }

  async testConnection() {
    try {
      await this.prisma.$connect();
      await this.prisma.$queryRaw`SELECT 1`;
      this.isConnected = true;
      this.connectionRetries = 0;
      console.log('✅ Database connected successfully');
      return true;
    } catch (error) {
      this.isConnected = false;
      console.error('❌ Database connection failed:', error.message);
      
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        console.log(`🔄 Retrying connection... (${this.connectionRetries}/${this.maxRetries})`);
        await this.delay(2000 * this.connectionRetries); // Exponential backoff
        return this.testConnection();
      }
      
      throw error;
    }
  }

  async disconnect() {
    if (this.prisma) {
      try {
        await this.prisma.$disconnect();
        this.isConnected = false;
        console.log('🔌 Database disconnected gracefully');
      } catch (error) {
        console.error('Error during disconnect:', error.message);
      } finally {
        this.prisma = null;
      }
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        await this.testConnection();
      }
      
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database health check failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  setupAutoReconnect() {
    // Check connection every 30 seconds
    setInterval(async () => {
      if (!this.isConnected) {
        try {
          await this.testConnection();
        } catch (error) {
          console.error('Auto-reconnect failed:', error.message);
        }
      }
    }, 30000);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      retries: this.connectionRetries,
      maxRetries: this.maxRetries
    };
  }
}

// Create singleton instance
const dbConnection = new DatabaseConnection();

// Export the singleton instance
module.exports = dbConnection;