const Inventory = require('../models/Inventory');
const Outlet = require('../models/Outlet');
const Product = require('../models/Product');

// GET /api/inventory
// Query params: outletId (admin only), lowStockOnly
exports.getInventory = async (req, res) => {
  try {
    const { lowStockOnly, search } = req.query;
    let query = {};

    // Always enforce server-side outlet scoping from authMiddleware
    if (req.scopedOutletId) {
      query.outlet = req.scopedOutletId;
    }

    let records = await Inventory.find(query)
      .populate('outlet', 'name city phone whatsappNumber')
      .populate({
        path: 'product',
        populate: { path: 'category', select: 'name' },
      });

    // Filter out null or soft-deleted products/outlets
    records = records.filter(
      (r) => r.product && !r.product.deletedAt && r.outlet && !r.outlet.deletedAt
    );

    if (lowStockOnly === 'true') {
      records = records.filter(
        (r) => r.isOutOfStock || r.stockQuantity <= r.lowStockThreshold
      );
    }

    if (search) {
      const s = search.toLowerCase();
      records = records.filter(
        (r) =>
          r.product.name.toLowerCase().includes(s) ||
          r.outlet.name.toLowerCase().includes(s)
      );
    }

    res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/inventory/:id
exports.updateInventoryItem = async (req, res) => {
  try {
    const existing = await Inventory.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    if (req.user?.role !== 'admin' && String(existing.outlet) !== req.scopedOutletId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only update inventory for your assigned outlet.',
      });
    }

    const { stockQuantity, lowStockThreshold, isOutOfStock } = req.body;
    const updateData = {};

    if (stockQuantity !== undefined) {
      updateData.stockQuantity = Math.max(0, parseInt(stockQuantity, 10));
      updateData.isOutOfStock = updateData.stockQuantity === 0;
    }
    if (lowStockThreshold !== undefined) {
      updateData.lowStockThreshold = Math.max(0, parseInt(lowStockThreshold, 10));
    }
    if (isOutOfStock !== undefined) {
      updateData.isOutOfStock = isOutOfStock;
    }
    updateData.lastRestockedAt = Date.now();

    const record = await Inventory.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    })
      .populate('outlet', 'name city')
      .populate('product', 'name price');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    res.json({ success: true, message: 'Inventory updated successfully', data: record });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// POST /api/inventory/batch-update
// Accepts: { updates: [ { id, stockQuantity, isOutOfStock }, ... ] }
exports.batchUpdateInventory = async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid updates array' });
    }

    if (req.user?.role !== 'admin') {
      const ids = updates.map((u) => u.id).filter(Boolean);
      const docs = await Inventory.find({ _id: { $in: ids } }).select('outlet');
      const unauthorized = docs.some((d) => String(d.outlet) !== req.scopedOutletId);
      if (unauthorized) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Batch update contains items outside your assigned outlet.',
        });
      }
    }

    const promises = updates.map((item) => {
      const data = {};
      if (item.stockQuantity !== undefined) {
        data.stockQuantity = Math.max(0, item.stockQuantity);
        data.isOutOfStock = data.stockQuantity === 0;
      }
      if (item.isOutOfStock !== undefined) {
        data.isOutOfStock = item.isOutOfStock;
      }
      return Inventory.findByIdAndUpdate(item.id, data, { new: true });
    });

    await Promise.all(promises);
    res.json({ success: true, message: `Successfully updated ${updates.length} items` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// POST /api/inventory/sync
// Ensures every active product has an inventory record for every active outlet
exports.syncInventory = async (req, res) => {
  try {
    const outlets = await Outlet.find({ isActive: true });
    const products = await Product.find({ isAvailable: true, deletedAt: null });
    let createdCount = 0;

    for (const outlet of outlets) {
      for (const product of products) {
        const exists = await Inventory.findOne({ outlet: outlet._id, product: product._id });
        if (!exists) {
          await Inventory.create({
            outlet: outlet._id,
            product: product._id,
            stockQuantity: 50,
            lowStockThreshold: 10,
            isOutOfStock: false,
          });
          createdCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Inventory sync complete. Created ${createdCount} missing records.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
