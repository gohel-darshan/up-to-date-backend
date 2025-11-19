const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const dbConnection = require('../utils/database');

const router = express.Router();
const prisma = dbConnection.getInstance();

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      minPrice, 
      maxPrice, 
      sortBy = 'createdAt',
      sortOrder = 'desc',
      featured
    } = req.query;

    const skip = (page - 1) * limit;
    const where = { isActive: true };

    if (category) where.categoryId = category;
    if (featured !== undefined) where.featured = featured === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: parseInt(skip),
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder },
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { reviews: true } }
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

// Get single product (public)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug, isActive: true },
      include: {
        category: { select: { name: true, slug: true } },
        reviews: {
          include: {
            user: { select: { firstName: true, lastName: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create product (admin only)
router.post('/', authenticateToken, requireAdmin, [
  body('name').trim().isLength({ min: 1 }),
  body('price').isFloat({ min: 0 }),
  body('categoryId').isString(),
  body('sku').trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      description,
      price,
      salePrice,
      sku,
      stock,
      images,
      colors,
      sizes,
      fabric,
      pattern,
      occasion,
      categoryId,
      featured
    } = req.body;

    // Generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const product = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        price: parseFloat(price),
        salePrice: salePrice ? parseFloat(salePrice) : null,
        sku,
        stock: parseInt(stock) || 0,
        images: images || [],
        colors: colors || [],
        sizes: sizes || [],
        fabric,
        pattern,
        occasion,
        categoryId,
        featured: featured || false
      },
      include: {
        category: { select: { name: true } }
      }
    });

    res.status(201).json({ message: 'Product created successfully', product });
  } catch (error) {
    console.error('Product creation error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'SKU or slug already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update product (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.name) {
      updateData.slug = updateData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { name: true } }
      }
    });

    res.json({ message: 'Product updated successfully', product });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.product.delete({ where: { id } });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;