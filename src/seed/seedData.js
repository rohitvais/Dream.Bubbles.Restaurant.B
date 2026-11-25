require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Outlet = require('../models/Outlet');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const connectDB = require('../config/db');

const seedDatabase = async () => {
  try {
    await connectDB();
    console.log('🔄 Connected to database for seeding...');

    // Clear existing collections
    await Outlet.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});
    await Inventory.deleteMany({});
    await Order.deleteMany({});
    console.log('🧹 Cleaned existing database collections');

    // 1. Seed Outlets
    const outletsData = [
      {
        name: 'Dream Bubbles - Bandra West',
        code: 'DB-BND-01',
        address: 'Shop 4, Silver Beach Promenade, Carter Road, Bandra West',
        city: 'Mumbai',
        phone: '+919820123456',
        whatsappNumber: '919820123456',
        location: { lat: 19.0607, lng: 72.8258 },
        openingHours: '10:00 AM - 11:30 PM',
        isActive: true,
        rating: 4.9,
        imageUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
        tags: ['Outdoor Seating', 'Pet Friendly', 'Free WiFi'],
      },
      {
        name: 'Dream Bubbles - Lower Parel',
        code: 'DB-LP-02',
        address: 'Ground Floor, Phoenix Palladium Mall, Senapati Bapat Marg, Lower Parel',
        city: 'Mumbai',
        phone: '+919820789012',
        whatsappNumber: '919820789012',
        location: { lat: 18.9953, lng: 72.8258 },
        openingHours: '11:00 AM - 11:00 PM',
        isActive: true,
        rating: 4.8,
        imageUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        tags: ['Mall Access', 'Air Conditioned', 'Quick Pickup'],
      },
      {
        name: 'Dream Bubbles - Powai Lakeview',
        code: 'DB-POW-03',
        address: 'Central Avenue, Hiranandani Gardens, Near Galleria, Powai',
        city: 'Mumbai',
        phone: '+919820345678',
        whatsappNumber: '919820345678',
        location: { lat: 19.1176, lng: 72.906 },
        openingHours: '10:30 AM - 12:00 AM',
        isActive: true,
        rating: 4.7,
        imageUrl: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80',
        tags: ['Late Night Open', 'Board Games', 'Cozy Vibes'],
      },
      {
        name: 'Dream Bubbles - Andheri Lokhandwala',
        code: 'DB-AND-04',
        address: 'Shop 12, Main Market, Lokhandwala Complex, Andheri West',
        city: 'Mumbai',
        phone: '+919820987654',
        whatsappNumber: '919820987654',
        location: { lat: 19.1415, lng: 72.8268 },
        openingHours: '11:00 AM - 11:30 PM',
        isActive: true,
        rating: 4.8,
        imageUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=800&q=80',
        tags: ['High Energy', 'Instagram Corner', 'Fast Delivery'],
      },
    ];

    const outletsWithMaps = outletsData.map((o) => ({
      ...o,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${o.location.lat},${o.location.lng}`,
    }));
    const createdOutlets = await Outlet.insertMany(outletsWithMaps);
    console.log(`✅ Seeded ${createdOutlets.length} Outlets`);

    // 2. Seed Categories
    const categoriesData = [
      {
        name: 'Signature Chicken Items',
        slug: 'signature-Chicken Items',
        description: 'Handcrafted brown sugar pearls simmered in rich creamy milk',
        icon: '🧋',
        image: 'https://images.unsplash.com/photo-1558857563-b37cf5a7304f?auto=format&fit=crop&w=400&q=80',
        displayOrder: 1,
        isActive: true,
      },
      {
        name: 'Fruit Teas & Sparklers',
        slug: 'fruit-teas-sparklers',
        description: 'Brewed jasmine and oolong tea infused with real tropical fruits',
        icon: '🍓',
        image: 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?auto=format&fit=crop&w=400&q=80',
        displayOrder: 2,
        isActive: true,
      },
      {
        name: 'Cheese Foam Classics',
        slug: 'cheese-foam-classics',
        description: 'Silky smooth Himalayan sea-salt cream cheese foam over fresh tea',
        icon: '🧀',
        image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=400&q=80',
        displayOrder: 3,
        isActive: true,
      },
      {
        name: 'Crispy Cafe Bites',
        slug: 'crispy-cafe-bites',
        description: 'Tantalizing Indian street bites and golden crispy snacks',
        icon: '🍟',
        image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=400&q=80',
        displayOrder: 4,
        isActive: true,
      },
      {
        name: 'Bubble Waffles & Desserts',
        slug: 'bubble-waffles-desserts',
        description: 'Warm Hong-Kong style egg waffles topped with gelato and Chicken Items',
        icon: '🧇',
        image: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=400&q=80',
        displayOrder: 5,
        isActive: true,
      },
    ];

    const categoriesWithSort = categoriesData.map((c) => ({
      ...c,
      sortOrder: c.displayOrder,
      imageUrl: c.image || '',
      deletedAt: null,
    }));
    const createdCategories = await Category.insertMany(categoriesWithSort);
    console.log(`✅ Seeded ${createdCategories.length} Categories`);

    const catMap = {};
    createdCategories.forEach((c) => {
      catMap[c.slug] = c._id;
    });

    // 3. Seed Products
    const productsData = [
      // Signature Chicken Items
      {
        name: 'Tiger Brown Sugar Chicken Items Milk',
        category: catMap['signature-Chicken Items'],
        description: 'Fresh organic milk with molten brown sugar swirls, warm chewy tapioca pearls, and torched crème brûlée top.',
        price: 249,
        image: 'https://images.unsplash.com/photo-1558857563-b37cf5a7304f?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Bestseller', 'Chef Choice', 'Sweet Tooth'],
        calories: '320 kcal',
        isAvailable: true,
      },
      {
        name: 'Royal Roasted Oolong Milk Tea',
        category: catMap['signature-Chicken Items'],
        description: 'Slow-roasted charcoal Taiwanese oolong tea blended with creamy milk and silky herbal grass jelly.',
        price: 229,
        image: 'https://images.unsplash.com/photo-1541658016709-82535e94bc69?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: false,
        tags: ['Aromatic', 'Medium Sweet'],
        calories: '240 kcal',
        isAvailable: true,
      },
      {
        name: 'Taro Coconut Cloud Chicken Items',
        category: catMap['signature-Chicken Items'],
        description: 'Real purple taro puree with coconut cream milk, sago pearls, and golden honey Chicken Items.',
        price: 259,
        image: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Creamy', 'Vibrant Purple'],
        calories: '290 kcal',
        isAvailable: true,
      },
      {
        name: 'Uji Matcha Chicken Items Supreme',
        category: catMap['signature-Chicken Items'],
        description: 'Ceremonial grade Japanese Uji matcha whisked fresh to order, layered over oat milk with tapioca pearls.',
        price: 269,
        image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Antioxidant', 'Japanese Matcha'],
        calories: '210 kcal',
        isAvailable: true,
      },

      // Fruit Teas
      {
        name: 'Passionfruit Mango Sparkler',
        category: catMap['fruit-teas-sparklers'],
        description: 'Sun-ripened Alphonso mango chunks, tart passionfruit seeds, sparkling soda, and popping mango bubbles.',
        price: 219,
        image: 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Refreshing', 'Popping Chicken Items'],
        calories: '160 kcal',
        isAvailable: true,
      },
      {
        name: 'Lychee Rose Blossom Tea',
        category: catMap['fruit-teas-sparklers'],
        description: 'Fragrant pink rose infused green tea with juicy whole lychees and natural crystal coconut jelly.',
        price: 229,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: false,
        tags: ['Floral', 'Low Calorie'],
        calories: '140 kcal',
        isAvailable: true,
      },
      {
        name: 'Grapefruit Jasmine Breeze',
        category: catMap['fruit-teas-sparklers'],
        description: 'Freshly squeezed red grapefruit pulp, cold-brewed four seasons jasmine tea, and aloe vera cubes.',
        price: 209,
        image: 'https://images.unsplash.com/photo-1534353436294-0dbd4bdac845?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: false,
        tags: ['Citrus Punch', 'Detox'],
        calories: '130 kcal',
        isAvailable: true,
      },

      // Cheese Foam Classics
      {
        name: 'Salted Caramel Oolong Macchiato',
        category: catMap['cheese-foam-classics'],
        description: 'Robust dark roast oolong crowned with a thick layer of salted caramel whipped cream cheese.',
        price: 259,
        image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Sweet & Savory', 'Silky Foam'],
        calories: '310 kcal',
        isAvailable: true,
      },
      {
        name: 'Strawberry Velvet Cheese Tea',
        category: catMap['cheese-foam-classics'],
        description: 'Freshly crushed Mahabaleshwar strawberries blended into green tea, layered with velvet cheese foam.',
        price: 279,
        image: 'https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: false,
        tags: ['Seasonal Berries', 'Creamy'],
        calories: '280 kcal',
        isAvailable: true,
      },

      // Crispy Cafe Bites
      {
        name: 'Korean Crunchy Garlic Popcorn Bites',
        category: catMap['crispy-cafe-bites'],
        description: 'Crispy bite-sized cauliflower poppers tossed in sweet gochujang chili glaze and toasted sesame.',
        price: 199,
        image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Spicy', 'Crispy Snack'],
        calories: '340 kcal',
        isAvailable: true,
      },
      {
        name: 'Truffle & Herb Loaded Fries',
        category: catMap['crispy-cafe-bites'],
        description: 'Golden skin-on potato fries tossed in Italian black truffle oil, rosemary, and smoked cheddar drizzle.',
        price: 219,
        image: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: false,
        tags: ['Gourmet', 'Crowd Favorite'],
        calories: '390 kcal',
        isAvailable: true,
      },

      // Bubble Waffles & Desserts
      {
        name: 'Hong Kong Egg Waffle with Chicken Items & Ice Cream',
        category: catMap['bubble-waffles-desserts'],
        description: 'Freshly baked bubble waffle rolled with vanilla bean gelato, chocolate fudge, and warm brown sugar Chicken Items.',
        price: 289,
        image: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?auto=format&fit=crop&w=600&q=80',
        isVeg: true,
        isBestseller: true,
        tags: ['Signature Dessert', 'Decadent'],
        calories: '480 kcal',
        isAvailable: true,
      },
    ];

    const productsWithUrl = productsData.map((p) => ({
      ...p,
      imageUrl: p.imageUrl || p.image || '',
    }));
    const createdProducts = await Product.insertMany(productsWithUrl);
    console.log(`✅ Seeded ${createdProducts.length} Products`);

    // 4. Seed Inventory for each Outlet
    const inventoryDocs = [];
    createdOutlets.forEach((outlet, oIdx) => {
      createdProducts.forEach((product, pIdx) => {
        // Vary stock to show normal, low stock, and out of stock cases
        let stock = 45;
        let isOut = false;
        if (oIdx === 0 && pIdx === 2) {
          stock = 4; // Low stock
        } else if (oIdx === 1 && pIdx === 0) {
          stock = 0; // Out of stock
          isOut = true;
        } else if (oIdx === 2 && pIdx === 3) {
          stock = 7; // Low stock
        } else {
          stock = 30 + Math.floor(Math.random() * 50);
        }

        inventoryDocs.push({
          outlet: outlet._id,
          product: product._id,
          stockQuantity: stock,
          lowStockThreshold: 10,
          isOutOfStock: isOut,
          lastRestockedAt: new Date(Date.now() - Math.random() * 86400000 * 2),
        });
      });
    });

    await Inventory.insertMany(inventoryDocs);
    console.log(`✅ Seeded ${inventoryDocs.length} Inventory items`);

    // 5. Seed Demo Orders for Orders Management & Dashboard
    const sampleOrders = [
      {
        orderNumber: 'DB-8921',
        outlet: createdOutlets[0]._id,
        customerName: 'Aarav Mehta',
        customerPhone: '+919811223344',
        customerAddress: 'Flat 402, Sea Breeze Apts, Carter Road, Bandra West',
        orderType: 'Delivery',
        items: [
          {
            product: createdProducts[0]._id,
            name: createdProducts[0].name,
            price: createdProducts[0].price,
            quantity: 2,
            sweetness: '50%',
            ice: 'Less Ice',
            subtotal: 498,
          },
          {
            product: createdProducts[9]._id,
            name: createdProducts[9].name,
            price: createdProducts[9].price,
            quantity: 1,
            sweetness: 'N/A',
            ice: 'N/A',
            subtotal: 199,
          },
        ],
        itemCount: 3,
        totalAmount: 737,
        deliveryFee: 40,
        specialInstructions: 'Please deliver hot, extra napkins.',
        status: 'Preparing',
        channel: 'WhatsApp',
      },
      {
        orderNumber: 'DB-8922',
        outlet: createdOutlets[0]._id,
        customerName: 'Priya Sharma',
        customerPhone: '+919822334455',
        customerAddress: '',
        orderType: 'Takeaway',
        items: [
          {
            product: createdProducts[3]._id,
            name: createdProducts[3].name,
            price: createdProducts[3].price,
            quantity: 1,
            sweetness: '30%',
            ice: 'Regular Ice',
            subtotal: 269,
          },
          {
            product: createdProducts[4]._id,
            name: createdProducts[4].name,
            price: createdProducts[4].price,
            quantity: 1,
            sweetness: '70%',
            ice: 'Less Ice',
            subtotal: 219,
          },
        ],
        itemCount: 2,
        totalAmount: 488,
        deliveryFee: 0,
        specialInstructions: 'Will pick up in 15 mins.',
        status: 'Confirmed',
        channel: 'WhatsApp',
      },
      {
        orderNumber: 'DB-8923',
        outlet: createdOutlets[1]._id,
        customerName: 'Karan Kapoor',
        customerPhone: '+919833445566',
        customerAddress: 'Tower 2, Floor 14, Palladium Residences',
        orderType: 'Delivery',
        items: [
          {
            product: createdProducts[7]._id,
            name: createdProducts[7].name,
            price: createdProducts[7].price,
            quantity: 2,
            sweetness: '50%',
            ice: 'Regular Ice',
            subtotal: 518,
          },
        ],
        itemCount: 2,
        totalAmount: 558,
        deliveryFee: 40,
        specialInstructions: 'Gate code 4022',
        status: 'Delivered',
        channel: 'Call',
      },
      {
        orderNumber: 'DB-8924',
        outlet: createdOutlets[2]._id,
        customerName: 'Sneha Patel',
        customerPhone: '+919844556677',
        customerAddress: 'Hiranandani Gardens, Powai',
        orderType: 'Takeaway',
        items: [
          {
            product: createdProducts[11]._id,
            name: createdProducts[11].name,
            price: createdProducts[11].price,
            quantity: 1,
            sweetness: '100%',
            ice: 'No Ice',
            subtotal: 289,
          },
        ],
        itemCount: 1,
        totalAmount: 289,
        deliveryFee: 0,
        specialInstructions: 'Extra chocolate fudge drizzle please.',
        status: 'Pending',
        channel: 'WhatsApp',
      },
    ];

    await Order.insertMany(sampleOrders);
    console.log(`✅ Seeded ${sampleOrders.length} sample Orders`);

    console.log('🎉 Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding error:', error);
    process.exit(1);
  }
};

seedDatabase();
