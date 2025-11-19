const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const dbConnection = require('../utils/database');

const prisma = dbConnection.getInstance();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@uptodateselection.com' },
    update: {},
    create: {
      email: 'admin@uptodateselection.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'SUPER_ADMIN'
    }
  });

  console.log('✅ Admin user created:', admin.email);

  // Create categories
  const categories = [
    {
      name: 'Shirt Fabrics',
      slug: 'shirt-fabrics',
      description: 'Premium cotton and linen fabrics for custom shirts'
    },
    {
      name: 'Pant Fabrics',
      slug: 'pant-fabrics',
      description: 'High-quality fabrics for tailored pants and trousers'
    },
    {
      name: 'Suit Fabrics',
      slug: 'suit-fabrics',
      description: 'Luxury wool and blend fabrics for formal suits'
    },
    {
      name: 'Kurta Fabrics',
      slug: 'kurta-fabrics',
      description: 'Traditional and contemporary fabrics for kurtas'
    },
    {
      name: 'Koti Fabrics',
      slug: 'koti-fabrics',
      description: 'Elegant fabrics for traditional kotis and waistcoats'
    }
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category
    });
  }

  console.log('✅ Categories created');

  // Create sample products
  const shirtCategory = await prisma.category.findUnique({ where: { slug: 'shirt-fabrics' } });
  const pantCategory = await prisma.category.findUnique({ where: { slug: 'pant-fabrics' } });
  const suitCategory = await prisma.category.findUnique({ where: { slug: 'suit-fabrics' } });

  const products = [
    {
      name: 'Premium Cotton Shirt Fabric - White',
      slug: 'premium-cotton-shirt-fabric-white',
      description: 'High-quality 100% cotton fabric perfect for formal shirts',
      price: 1200,
      salePrice: 999,
      sku: 'SHIRT-COT-WHT-001',
      stock: 50,
      images: ['/assets/mens-shirt-white.jpg'],
      colors: ['White', 'Light Blue', 'Cream'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      fabric: 'Cotton',
      pattern: 'Solid',
      occasion: 'Formal',
      categoryId: shirtCategory.id,
      featured: true
    },
    {
      name: 'Wool Blend Pant Fabric - Charcoal',
      slug: 'wool-blend-pant-fabric-charcoal',
      description: 'Premium wool blend fabric for tailored pants',
      price: 2500,
      sku: 'PANT-WOOL-CHAR-001',
      stock: 30,
      images: ['/assets/mens-pants-charcoal.jpg'],
      colors: ['Charcoal', 'Navy', 'Black'],
      sizes: ['28', '30', '32', '34', '36', '38', '40'],
      fabric: 'Wool Blend',
      pattern: 'Solid',
      occasion: 'Formal',
      categoryId: pantCategory.id,
      featured: true
    },
    {
      name: 'Luxury Suit Fabric - Navy Blue',
      slug: 'luxury-suit-fabric-navy-blue',
      description: 'Premium wool suit fabric for formal occasions',
      price: 8500,
      salePrice: 7500,
      sku: 'SUIT-WOOL-NAVY-001',
      stock: 15,
      images: ['/assets/mens-suit-navy.jpg'],
      colors: ['Navy', 'Charcoal', 'Black'],
      sizes: ['36', '38', '40', '42', '44', '46'],
      fabric: 'Pure Wool',
      pattern: 'Solid',
      occasion: 'Formal',
      categoryId: suitCategory.id,
      featured: true
    }
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: product
    });
  }

  console.log('✅ Sample products created');

  // Create sample customer
  const customerPassword = await bcrypt.hash('customer123', 12);
  
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      password: customerPassword,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+91 9876543210',
      role: 'CUSTOMER'
    }
  });

  console.log('✅ Sample customer created:', customer.email);

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });