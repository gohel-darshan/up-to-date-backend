const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const dbConnection = require('../utils/database');

const router = express.Router();
const prisma = dbConnection.getInstance();

// Get all categories (public)
router.get('/', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true } }
      }
    });

    res.json(categories);
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create category (admin only)
router.post('/', authenticateToken, requireAdmin, [
  body('name').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, image } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        image
      }
    });

    res.status(201).json({ message: 'Category created successfully', category });
  } catch (error) {
    console.error('Category creation error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Category name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update category (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, image } = req.body;
    
    const updateData = { description, image };
    if (name) {
      updateData.name = name;
      updateData.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData
    });

    res.json({ message: 'Category updated successfully', category });
  } catch (error) {
    console.error('Category update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.category.delete({ where: { id } });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Category deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;