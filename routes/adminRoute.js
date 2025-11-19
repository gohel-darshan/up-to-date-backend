const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const dbConnection = require('../utils/database');

const router = express.Router();
const prisma = dbConnection.getInstance();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Enhanced Dashboard Stats with Analytics
router.get('/dashboard/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalProducts,
      activeProducts,
      lowStockProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
      monthlyRevenue,
      recentOrders,
      topProducts,
      categoryStats,
      orderStatusStats,
      monthlyStats
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', isActive: true } }),
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { stock: { lte: 10 }, isActive: true } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { paymentStatus: 'PAID' }
      }),
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { 
          paymentStatus: 'PAID',
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      }),
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          orderItems: {
            include: { product: { select: { name: true, images: true } } }
          }
        }
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        _count: { productId: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10
      }),
      prisma.category.findMany({
        include: {
          _count: { select: { products: true } }
        }
      }),
      prisma.order.groupBy({
        by: ['status'],
        _count: { status: true }
      }),
      prisma.$queryRaw`
        SELECT 
          DATE_TRUNC('month', "createdAt") as month,
          COUNT(*)::int as orders,
          SUM("totalAmount")::float as revenue
        FROM orders 
        WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month DESC
      `
    ]);

    // Get product details for top products
    const topProductsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          select: { name: true, price: true, images: true, stock: true }
        });
        return {
          ...product,
          totalSold: item._sum.quantity,
          orderCount: item._count.productId,
          revenue: item._sum.quantity * product.price
        };
      })
    );

    // Calculate growth percentages (mock data for demo)
    const userGrowth = 12;
    const productGrowth = 5;
    const orderGrowth = 18;
    const revenueGrowth = 25;

    res.json({
      stats: {
        totalUsers,
        activeUsers,
        totalProducts,
        activeProducts,
        lowStockProducts,
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue._sum.totalAmount || 0,
        monthlyRevenue: monthlyRevenue._sum.totalAmount || 0,
        userGrowth,
        productGrowth,
        orderGrowth,
        revenueGrowth
      },
      recentOrders,
      topProducts: topProductsWithDetails,
      categoryStats,
      orderStatusStats,
      monthlyStats,
      alerts: {
        lowStock: lowStockProducts,
        pendingOrders: pendingOrders
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Users Management
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (role) where.role = role;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: { select: { orders: true } }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update User Status
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, isActive: true }
    });

    res.json({ message: 'User status updated', user });
  } catch (error) {
    console.error('User status update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Products Management
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, category, status } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (category) where.categoryId = category;
    if (status !== undefined) where.isActive = status === 'true';

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { name: true } },
          _count: { select: { orderItems: true, reviews: true } }
        }
      }),
      prisma.product.count({ where })
    ]);

    res.json({
      products,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Orders Management
router.get('/orders', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          orderItems: {
            include: { product: { select: { name: true, images: true } } }
          },
          address: true
        }
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      orders,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Order Status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } }
      }
    });

    res.json({ message: 'Order status updated', order });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single Order Details
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        address: true,
        orderItems: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                price: true,
                sku: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Order fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single User Details
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        addresses: true,
        orders: {
          include: {
            orderItems: {
              include: {
                product: { select: { name: true, images: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        reviews: {
          include: {
            product: { select: { name: true } }
          }
        },
        _count: {
          select: {
            orders: true,
            reviews: true,
            wishlist: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single Product Details
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        orderItems: {
          include: {
            order: {
              select: {
                orderNumber: true,
                createdAt: true,
                user: {
                  select: { firstName: true, lastName: true }
                }
              }
            }
          },
          orderBy: { order: { createdAt: 'desc' } }
        },
        reviews: {
          include: {
            user: {
              select: { firstName: true, lastName: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: {
          select: {
            orderItems: true,
            reviews: true,
            wishlistItems: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Calculate average rating
    const avgRating = product.reviews.length > 0 
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
      : 0;

    res.json({ ...product, avgRating });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Analytics Routes
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter;
    switch (period) {
      case '7d':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const salesData = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*)::int as orders,
        SUM("totalAmount")::float as revenue
      FROM orders 
      WHERE "createdAt" >= ${dateFilter} AND "paymentStatus" = 'PAID'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    res.json(salesData);
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk Actions
router.patch('/products/bulk-update', async (req, res) => {
  try {
    const { productIds, action, value } = req.body;
    
    let updateData = {};
    switch (action) {
      case 'activate':
        updateData = { isActive: true };
        break;
      case 'deactivate':
        updateData = { isActive: false };
        break;
      case 'updatePrice':
        updateData = { price: parseFloat(value) };
        break;
      case 'updateStock':
        updateData = { stock: parseInt(value) };
        break;
      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: updateData
    });

    res.json({ message: `${productIds.length} products updated successfully` });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;