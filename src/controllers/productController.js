const Product = require('../models/Product');
const Outlet = require('../models/Outlet');
const Inventory = require('../models/Inventory');

// GET /api/products
// Optional query params: category, search, veg, outletId
exports.getProducts = async (req, res) => {
  try {
    const { category, search, veg, outletId } = req.query;
    let query = { isAvailable: true };

    if (category && category !== 'all') {
      query.category = category;
    }
    if (veg !== undefined && veg !== '') {
      query.isVeg = veg === 'true';
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } },
      ];
    }

    const products = await Product.find(query).populate('category', 'name slug icon');

    // If an outletId is provided, merge stock status from Inventory
    if (outletId) {
      const inventoryRecords = await Inventory.find({ outlet: outletId });
      const inventoryMap = new Map();
      inventoryRecords.forEach((inv) => {
        inventoryMap.set(inv.product.toString(), {
          stockQuantity: inv.stockQuantity,
          isOutOfStock: inv.isOutOfStock || inv.stockQuantity <= 0,
          lowStock: inv.stockQuantity <= inv.lowStockThreshold,
        });
      });

      const productsWithInventory = products.map((product) => {
        const invInfo = inventoryMap.get(product._id.toString()) || {
          stockQuantity: 50,
          isOutOfStock: false,
          lowStock: false,
        };
        return {
          ...product.toObject(),
          outletStock: invInfo,
        };
      });

      return res.json({
        success: true,
        count: productsWithInventory.length,
        data: productsWithInventory,
      });
    }

    res.json({ success: true, count: products.length, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug icon');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);

    // Create inventory entries for this product across all existing outlets
    const outlets = await Outlet.find();
    if (outlets.length > 0) {
      const invDocs = outlets.map((outlet) => ({
        outlet: outlet._id,
        product: product._id,
        stockQuantity: 50,
        lowStockThreshold: 10,
        isOutOfStock: false,
      }));
      await Inventory.insertMany(invDocs);
    }

    const populated = await Product.findById(product._id).populate('category', 'name slug');
    res.status(201).json({
      success: true,
      message: 'Product created and inventory seeded',
      data: populated,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('category', 'name slug');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    await Inventory.deleteMany({ product: product._id });
    res.json({ success: true, message: 'Product and inventory records deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
