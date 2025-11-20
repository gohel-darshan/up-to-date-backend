const express = require('express');
const { body, validationResult } = require('express-validator');
const dbConnection = require('../utils/database');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const prisma = dbConnection.getInstance();

// Get User Addresses
router.get('/addresses', authenticateUser, async (req, res) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.userId },
      orderBy: { isDefault: 'desc' }
    });

    res.json({ addresses });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add New Address
router.post('/addresses', [
  authenticateUser,
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('address1').notEmpty().trim(),
  body('city').notEmpty().trim(),
  body('state').notEmpty().trim(),
  body('postalCode').notEmpty().trim(),
  body('country').optional().trim(),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      firstName,
      lastName,
      company,
      address1,
      address2,
      city,
      state,
      postalCode,
      country,
      phone,
      isDefault
    } = req.body;

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const address = await prisma.address.create({
      data: {
        userId: req.userId,
        firstName,
        lastName,
        company: company || null,
        address1,
        address2: address2 || null,
        city,
        state,
        postalCode,
        country: country || 'India',
        phone: phone || null,
        isDefault: isDefault || false
      }
    });

    res.status(201).json({
      message: 'Address added successfully',
      address
    });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Address
router.put('/addresses/:id', [
  authenticateUser,
  body('firstName').optional().notEmpty().trim(),
  body('lastName').optional().notEmpty().trim(),
  body('address1').optional().notEmpty().trim(),
  body('city').optional().notEmpty().trim(),
  body('state').optional().notEmpty().trim(),
  body('postalCode').optional().notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: req.userId }
    });

    if (!existingAddress) {
      return res.status(404).json({ message: 'Address not found' });
    }

    // If setting as default, unset other defaults
    if (updateData.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data: updateData
    });

    res.json({
      message: 'Address updated successfully',
      address
    });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete Address
router.delete('/addresses/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: req.userId }
    });

    if (!existingAddress) {
      return res.status(404).json({ message: 'Address not found' });
    }

    await prisma.address.delete({
      where: { id }
    });

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Orders
router.get('/orders', authenticateUser, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      include: {
        orderItems: {
          include: {
            product: true
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
router.get('/orders/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, userId: req.userId },
      include: {
        orderItems: {
          include: {
            product: true
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

// Add to Wishlist
router.post('/wishlist/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if already in wishlist
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId: req.userId,
          productId
        }
      }
    });

    if (existingItem) {
      return res.status(400).json({ message: 'Product already in wishlist' });
    }

    await prisma.wishlistItem.create({
      data: {
        userId: req.userId,
        productId
      }
    });

    res.json({ message: 'Product added to wishlist' });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove from Wishlist
router.delete('/wishlist/:productId', authenticateUser, async (req, res) => {
  try {
    const { productId } = req.params;

    await prisma.wishlistItem.deleteMany({
      where: {
        userId: req.userId,
        productId
      }
    });

    res.json({ message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Wishlist
router.get('/wishlist', authenticateUser, async (req, res) => {
  try {
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: { userId: req.userId },
      include: {
        product: {
          include: {
            category: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ wishlist: wishlistItems });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;