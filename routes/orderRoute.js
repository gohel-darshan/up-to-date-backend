const express = require('express');
const { body, validationResult } = require('express-validator');
const dbConnection = require('../utils/database');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const prisma = dbConnection.getInstance();

// Create Order
router.post('/', [
  authenticateUser,
  body('items').isArray({ min: 1 }),
  body('addressId').notEmpty(),
  body('paymentMethod').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { items, addressId, paymentMethod, notes } = req.body;

    // Verify address belongs to user
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId: req.userId }
    });

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId }
      });

      if (!product || !product.isActive) {
        return res.status(400).json({ 
          message: `Product ${item.productId} not found or inactive` 
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${product.name}` 
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
        size: item.size,
        color: item.color
      });
    }

    const shippingCost = subtotal >= 500 ? 0 : 50;
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100; // 18% GST
    const totalAmount = subtotal + shippingCost + taxAmount;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create order with transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: req.userId,
          addressId,
          totalAmount,
          shippingCost,
          taxAmount,
          paymentMethod,
          notes: notes || null,
          orderItems: {
            create: orderItems
          }
        },
        include: {
          orderItems: {
            include: {
              product: true
            }
          },
          address: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Update product stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
      }

      return newOrder;
    });

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Orders
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
                price: true
              }
            }
          }
        },
        address: true
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });

    const totalOrders = await prisma.order.count({
      where: { userId: req.userId }
    });

    res.json({
      orders,
      pagination: {
        total: totalOrders,
        pages: Math.ceil(totalOrders / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single Order
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { 
        id, 
        userId: req.userId 
      },
      include: {
        orderItems: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
                price: true,
                sku: true
              }
            }
          }
        },
        address: true
      }
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel Order (only if status is PENDING)
router.patch('/:id/cancel', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { 
        id, 
        userId: req.userId,
        status: 'PENDING'
      },
      include: {
        orderItems: true
      }
    });

    if (!order) {
      return res.status(404).json({ 
        message: 'Order not found or cannot be cancelled' 
      });
    }

    // Update order and restore stock
    await prisma.$transaction(async (tx) => {
      // Update order status
      await tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      // Restore product stock
      for (const item of order.orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });
      }
    });

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;