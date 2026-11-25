const { z } = require('zod');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Outlet = require('../models/Outlet');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const { validateWithSchema } = require('../lib/validateRequest');
const {
  safeDeleteFile,
  applyProductImageFields,
  attachResolvedImageUrl,
  cleanupUploadAfterDbFailure,
  deletePreviousFileAfterSave,
} = require('../lib/imageLifecycle');

const productBodySchema = z.object({
  name: z
    .string({ required_error: 'Product name is required' })
    .trim()
    .min(2, 'Product name must be at least 2 characters')
    .max(120, 'Product name cannot exceed 120 characters'),
  category: z
    .string({ required_error: 'Please select a category' })
    .trim()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Please select a valid category'),
  description: z
    .string()
    .trim()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .default(''),
  price: z.coerce
    .number({ invalid_type_error: 'Price must be a valid number' })
    .min(1, 'Price must be at least ₹1')
    .max(100000, 'Price is too high'),
  prepTimeMinutes: z.coerce
    .number({ invalid_type_error: 'Prep time must be a valid number' })
    .int('Prep time must be a whole number of minutes')
    .min(1, 'Prep time must be at least 1 minute')
    .max(240, 'Prep time cannot exceed 240 minutes')
    .optional()
    .default(15),
  imageUrl: z.string().trim().optional(),
  image: z.string().trim().optional(),
  imageFileId: z.string().trim().nullable().optional(),
  calories: z.string().trim().max(40).optional().default(''),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  isVeg: z.boolean().optional().default(true),
  isBestseller: z.boolean().optional().default(false),
  isAvailable: z.boolean().optional().default(true),
  availableOutlets: z
    .array(
      z
        .string()
        .trim()
        .refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid outlet ID in availability')
    )
    .optional(),
});

const mergeOutletInventory = async (products, outletId) => {
  if (!outletId) {
    return products.map((p) => attachResolvedImageUrl(p.toObject ? p.toObject() : p));
  }

  const inventoryRecords = await Inventory.find({ outlet: outletId });
  const inventoryMap = new Map();
  inventoryRecords.forEach((inv) => {
    inventoryMap.set(inv.product.toString(), {
      stockQuantity: inv.stockQuantity,
      isOutOfStock: inv.isOutOfStock || inv.stockQuantity <= 0,
      lowStock: inv.stockQuantity <= inv.lowStockThreshold,
    });
  });

  return products.map((product) => {
    const plain = attachResolvedImageUrl(product.toObject ? product.toObject() : product);
    const invInfo = inventoryMap.get(plain._id.toString()) || {
      stockQuantity: 50,
      isOutOfStock: false,
      lowStock: false,
    };

    // If product has explicit availableOutlets list configured, enforce it per outlet
    const hasAllowlist = Array.isArray(plain.availableOutlets);
    const allowedAtOutlet =
      !hasAllowlist ||
      plain.availableOutlets.some((id) => String(id?._id || id) === String(outletId));

    return {
      ...plain,
      outletStock: allowedAtOutlet
        ? invInfo
        : { ...invInfo, isOutOfStock: true, stockQuantity: 0 },
    };
  });
};

const syncProductOutletInventory = async (productId, selectedOutletIds) => {
  const allOutlets = await Outlet.find({ deletedAt: null }).select('_id');
  if (allOutlets.length === 0) return;

  const hasExplicitList = Array.isArray(selectedOutletIds);
  const selectedSet = new Set((selectedOutletIds || []).map((id) => String(id)));

  for (const outlet of allOutlets) {
    const outletIdStr = outlet._id.toString();
    const isEnabledHere = hasExplicitList ? selectedSet.has(outletIdStr) : true;

    const existingInv = await Inventory.findOne({
      outlet: outlet._id,
      product: productId,
    });

    if (!existingInv) {
      await Inventory.create({
        outlet: outlet._id,
        product: productId,
        stockQuantity: isEnabledHere ? 50 : 0,
        lowStockThreshold: 10,
        isOutOfStock: !isEnabledHere,
      });
    } else if (hasExplicitList) {
      if (isEnabledHere && existingInv.isOutOfStock) {
        existingInv.isOutOfStock = false;
        if (existingInv.stockQuantity <= 0) existingInv.stockQuantity = 50;
        await existingInv.save();
      } else if (!isEnabledHere && !existingInv.isOutOfStock) {
        existingInv.isOutOfStock = true;
        await existingInv.save();
      }
    }
  }
};

// PUBLIC: GET /api/products
// Optional query params: category, search, veg, outletId
// Excludes soft-deleted items, unavailable items, and items in inactive/deleted categories.
exports.getProducts = async (req, res) => {
  try {
    const { category, search, veg, outletId } = req.query;

    const activeCategoryIds = await Category.find({
      isActive: true,
      deletedAt: null,
    }).distinct('_id');

    let query = {
      isAvailable: true,
      deletedAt: null,
      category: { $in: activeCategoryIds },
    };

    if (category && category !== 'all') {
      const isActiveCat = activeCategoryIds.some(
        (id) => id.toString() === String(category)
      );
      if (!isActiveCat) {
        return res.json({ success: true, count: 0, data: [] });
      }
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

    if (outletId) {
      const productsWithInventory = await mergeOutletInventory(products, outletId);
      return res.json({
        success: true,
        count: productsWithInventory.length,
        data: productsWithInventory,
      });
    }

    const normalized = products.map((p) => attachResolvedImageUrl(p.toObject()));
    res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUBLIC: GET /api/products/bestseller
exports.getBestsellerProduct = async (req, res) => {
  try {
    const { outletId } = req.query;

    if (outletId && !mongoose.Types.ObjectId.isValid(outletId)) {
      return res.status(400).json({ success: false, message: 'Invalid outletId' });
    }

    const activeCategoryIds = await Category.find({
      isActive: true,
      deletedAt: null,
    }).distinct('_id');

    const availableProducts = await Product.find({
      isAvailable: true,
      deletedAt: null,
      category: { $in: activeCategoryIds },
    })
      .populate('category', 'name slug icon')
      .sort({ createdAt: 1 });

    const productsWithStock = await mergeOutletInventory(availableProducts, outletId);
    const inStockProducts = productsWithStock.filter((p) =>
      outletId ? !p.outletStock?.isOutOfStock && p.outletStock?.stockQuantity > 0 : true
    );

    if (inStockProducts.length === 0) {
      return res.json({ success: true, data: null });
    }

    const inStockMap = new Map(inStockProducts.map((p) => [p._id.toString(), p]));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const matchStage = {
      status: { $ne: 'Cancelled' },
      createdAt: { $gte: thirtyDaysAgo },
    };
    if (outletId) {
      matchStage.outlet = new mongoose.Types.ObjectId(outletId);
    }

    const orderStats = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          orderCount: { $sum: '$items.quantity' },
        },
      },
      { $sort: { orderCount: -1 } },
    ]);

    let chosenProduct = null;
    let recentOrderCount = 0;

    for (const stat of orderStats) {
      if (!stat._id) continue;
      const candidate = inStockMap.get(stat._id.toString());
      if (candidate) {
        chosenProduct = candidate;
        recentOrderCount = stat.orderCount;
        break;
      }
    }

    if (!chosenProduct) {
      chosenProduct = inStockProducts.find((p) => p.isBestseller) || inStockProducts[0];
    }

    res.json({
      success: true,
      data: chosenProduct
        ? {
            ...attachResolvedImageUrl(chosenProduct),
            recentOrderCount,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUBLIC: GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, deletedAt: null }).populate(
      'category',
      'name slug icon'
    );
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: attachResolvedImageUrl(product.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: GET /api/admin/products
// Returns all non-deleted products with category and resolved outlet availability
exports.getAdminProducts = async (req, res) => {
  try {
    const [products, outlets, inventoryRecords] = await Promise.all([
      Product.find({ deletedAt: null })
        .populate('category', 'name slug isActive')
        .sort({ createdAt: -1 }),
      Outlet.find({ deletedAt: null }).select('_id name city isActive'),
      Inventory.find({}).select('product outlet isOutOfStock stockQuantity'),
    ]);

    const invByProduct = new Map();
    inventoryRecords.forEach((inv) => {
      const pid = inv.product?.toString();
      const oid = inv.outlet?.toString();
      if (!pid || !oid) return;
      if (!invByProduct.has(pid)) invByProduct.set(pid, []);
      invByProduct.get(pid).push({
        outletId: oid,
        inStock: !inv.isOutOfStock && inv.stockQuantity > 0,
      });
    });

    const allOutletIds = outlets.map((o) => o._id.toString());

    const normalized = products.map((product) => {
      const plain = attachResolvedImageUrl(product.toObject());

      let resolvedOutletIds;
      if (Array.isArray(plain.availableOutlets)) {
        resolvedOutletIds = plain.availableOutlets.map((id) => String(id?._id || id));
      } else {
        const invList = invByProduct.get(plain._id.toString()) || [];
        if (invList.length > 0) {
          resolvedOutletIds = invList.filter((i) => i.inStock).map((i) => i.outletId);
        } else {
          resolvedOutletIds = allOutletIds;
        }
      }

      return {
        ...plain,
        prepTimeMinutes: plain.prepTimeMinutes ?? 15,
        availableOutlets: resolvedOutletIds,
      };
    });

    res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: POST /api/admin/products
exports.createProduct = async (req, res) => {
  const imageFields = applyProductImageFields(req.body);
  try {
    const rawBody = {
      ...req.body,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags
        : typeof req.body?.tags === 'string'
        ? req.body.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    const parsed = validateWithSchema(productBodySchema, rawBody);
    if (!parsed.ok) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, null);
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const categoryExists = await Category.findOne({
      _id: parsed.data.category,
      deletedAt: null,
    });
    if (!categoryExists) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, null);
      return res.status(400).json({
        success: false,
        message: 'Selected category was not found.',
        errors: { category: 'Selected category was not found.' },
      });
    }

    const createPayload = {
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description,
      price: parsed.data.price,
      prepTimeMinutes: parsed.data.prepTimeMinutes,
      calories: parsed.data.calories,
      tags: parsed.data.tags,
      isVeg: parsed.data.isVeg,
      isBestseller: parsed.data.isBestseller,
      isAvailable: parsed.data.isAvailable,
      availableOutlets: parsed.data.availableOutlets,
      imageUrl: imageFields.imageUrl ?? '',
      image: imageFields.imageUrl ?? '',
      imageFileId: imageFields.imageFileId ?? null,
      deletedAt: null,
    };

    const product = await Product.create(createPayload);
    await syncProductOutletInventory(product._id, parsed.data.availableOutlets);

    const populated = await Product.findById(product._id).populate(
      'category',
      'name slug isActive'
    );
    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: attachResolvedImageUrl(populated.toObject()),
    });
  } catch (error) {
    await cleanupUploadAfterDbFailure(imageFields.imageFileId, null);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ADMIN: PUT /api/admin/products/:id
exports.updateProduct = async (req, res) => {
  const imageFields = applyProductImageFields(req.body);
  let oldFileId = null;

  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, null);
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const existing = await Product.findOne({ _id: req.params.id, deletedAt: null });
    if (!existing) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, null);
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    oldFileId = existing.imageFileId || null;

    // Fast path: inline availability quick-toggle from DataTable row
    const isAvailabilityToggleOnly =
      Object.keys(req.body).length === 1 &&
      Object.prototype.hasOwnProperty.call(req.body, 'isAvailable');

    if (isAvailabilityToggleOnly) {
      if (typeof req.body.isAvailable !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isAvailable must be a boolean',
          errors: { isAvailable: 'Invalid toggle value' },
        });
      }
      const toggled = await Product.findByIdAndUpdate(
        req.params.id,
        { isAvailable: req.body.isAvailable },
        { new: true }
      ).populate('category', 'name slug isActive');

      return res.json({
        success: true,
        message: 'Menu item availability updated',
        data: attachResolvedImageUrl(toggled.toObject()),
      });
    }

    const rawBody = {
      ...req.body,
      tags: Array.isArray(req.body?.tags)
        ? req.body.tags
        : typeof req.body?.tags === 'string'
        ? req.body.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    const parsed = validateWithSchema(productBodySchema, rawBody);
    if (!parsed.ok) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, oldFileId);
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const categoryExists = await Category.findOne({
      _id: parsed.data.category,
      deletedAt: null,
    });
    if (!categoryExists) {
      await cleanupUploadAfterDbFailure(imageFields.imageFileId, oldFileId);
      return res.status(400).json({
        success: false,
        message: 'Selected category was not found.',
        errors: { category: 'Selected category was not found.' },
      });
    }

    const updatePayload = {
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description,
      price: parsed.data.price,
      prepTimeMinutes: parsed.data.prepTimeMinutes,
      calories: parsed.data.calories,
      tags: parsed.data.tags,
      isVeg: parsed.data.isVeg,
      isBestseller: parsed.data.isBestseller,
      isAvailable: parsed.data.isAvailable,
    };

    if (Array.isArray(parsed.data.availableOutlets)) {
      updatePayload.availableOutlets = parsed.data.availableOutlets;
    }

    if (
      Object.prototype.hasOwnProperty.call(imageFields, 'imageUrl') ||
      Object.prototype.hasOwnProperty.call(imageFields, 'imageFileId')
    ) {
      updatePayload.imageUrl = imageFields.imageUrl ?? '';
      updatePayload.image = updatePayload.imageUrl;
      updatePayload.imageFileId = imageFields.imageFileId ?? null;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
      runValidators: true,
    }).populate('category', 'name slug isActive');

    if (Array.isArray(parsed.data.availableOutlets)) {
      await syncProductOutletInventory(product._id, parsed.data.availableOutlets);
    }

    await deletePreviousFileAfterSave(oldFileId, product.imageFileId || null);

    res.json({
      success: true,
      message: 'Menu item updated successfully',
      data: attachResolvedImageUrl(product.toObject()),
    });
  } catch (error) {
    await cleanupUploadAfterDbFailure(imageFields.imageFileId, oldFileId);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ADMIN: DELETE /api/admin/products/:id
// Soft-deletes record (deletedAt), removes inventory entries, and deletes VaisBucket image
exports.deleteProduct = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findOne({ _id: req.params.id, deletedAt: null });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    product.deletedAt = new Date();
    product.isAvailable = false;
    await product.save();

    await Inventory.deleteMany({ product: product._id });
    await safeDeleteFile(product.imageFileId, 'product-delete');

    res.json({
      success: true,
      message: `Menu item "${product.name}" deleted.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
