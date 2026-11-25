const { z } = require('zod');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const { validateWithSchema } = require('../lib/validateRequest');

const slugify = (val) =>
  String(val || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCategoryDoc = (doc, itemCount = undefined) => {
  const plain = doc.toObject ? doc.toObject() : { ...doc };
  delete plain.image;
  delete plain.imageUrl;
  delete plain.imageFileId;

  const sortOrder =
    plain.sortOrder !== undefined && plain.sortOrder !== null
      ? plain.sortOrder
      : plain.displayOrder ?? 0;

  const normalized = {
    ...plain,
    sortOrder,
  };

  if (itemCount !== undefined) {
    normalized.itemCount = itemCount;
  }

  return normalized;
};

const categoryBodySchema = z.object({
  name: z
    .string({ required_error: 'Category name is required' })
    .trim()
    .min(2, 'Category name must be at least 2 characters')
    .max(80, 'Category name cannot exceed 80 characters'),
  slug: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? slugify(v) : '')),
  description: z
    .string()
    .trim()
    .max(400, 'Description cannot exceed 400 characters')
    .optional()
    .default(''),
  sortOrder: z.coerce
    .number({ invalid_type_error: 'Sort order must be a valid number' })
    .int('Sort order must be a whole number')
    .min(0, 'Sort order must be 0 or greater')
    .optional(),
  isActive: z.boolean().optional().default(true),
});

const reorderSchema = z.object({
  orderedIds: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one category ID is required to reorder'),
});

// PUBLIC: GET /api/categories (active, non-deleted only, ordered by sortOrder)
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({
      isActive: true,
      deletedAt: null,
    }).select('-image -imageUrl -imageFileId');

    const normalized = categories
      .map((cat) => normalizeCategoryDoc(cat))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: GET /api/admin/categories (all non-deleted with itemCount)
exports.getAdminCategories = async (req, res) => {
  try {
    const [categories, productCounts] = await Promise.all([
      Category.find({ deletedAt: null }).select('-image -imageUrl -imageFileId'),
      Product.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map();
    productCounts.forEach((entry) => {
      if (entry._id) countMap.set(entry._id.toString(), entry.count);
    });

    const normalized = categories
      .map((cat) => normalizeCategoryDoc(cat, countMap.get(cat._id.toString()) || 0))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: POST /api/admin/categories
exports.createCategory = async (req, res) => {
  try {
    const parsed = validateWithSchema(categoryBodySchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const data = parsed.data;
    const generatedSlug = data.slug || slugify(data.name);
    if (!generatedSlug) {
      return res.status(400).json({
        success: false,
        message: 'Slug could not be generated from category name.',
        errors: { slug: 'Enter a valid URL slug using letters and numbers.' },
      });
    }

    const duplicate = await Category.findOne({
      deletedAt: null,
      $or: [
        { name: new RegExp(`^${escapeRegex(data.name)}$`, 'i') },
        { slug: generatedSlug },
      ],
    });

    if (duplicate) {
      const isNameDup = duplicate.name.toLowerCase() === data.name.toLowerCase();
      const errors = isNameDup
        ? { name: 'A category with this name already exists.' }
        : { slug: 'This slug is already used by another category.' };
      return res.status(400).json({
        success: false,
        message: Object.values(errors)[0],
        errors,
      });
    }

    let nextSortOrder = data.sortOrder;
    if (nextSortOrder === undefined) {
      const existingCats = await Category.find({ deletedAt: null });
      const maxSort = existingCats.reduce(
        (max, c) => Math.max(max, c.sortOrder ?? c.displayOrder ?? 0),
        0
      );
      nextSortOrder = existingCats.length === 0 ? 1 : maxSort + 1;
    }

    const category = await Category.create({
      name: data.name,
      slug: generatedSlug,
      description: data.description,
      sortOrder: nextSortOrder,
      displayOrder: nextSortOrder,
      isActive: data.isActive,
      deletedAt: null,
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: normalizeCategoryDoc(category, 0),
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ADMIN: PUT /api/admin/categories/reorder
exports.reorderCategories = async (req, res) => {
  try {
    const parsed = validateWithSchema(reorderSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const { orderedIds } = parsed.data;
    const validIds = orderedIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== orderedIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more category IDs are invalid.',
      });
    }

    const ops = validIds.map((id, idx) => ({
      updateOne: {
        filter: { _id: id, deletedAt: null },
        update: { $set: { sortOrder: idx + 1, displayOrder: idx + 1 } },
      },
    }));

    if (ops.length > 0) {
      await Category.bulkWrite(ops);
    }

    res.json({ success: true, message: 'Category sort order updated.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ADMIN: PUT /api/admin/categories/:id
exports.updateCategory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const existing = await Category.findOne({ _id: req.params.id, deletedAt: null }).select(
      '-image -imageUrl -imageFileId'
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Allow partial updates (e.g. inline isActive toggle) when body omits other fields
    const isPartialToggleOnly =
      Object.keys(req.body).length === 1 &&
      Object.prototype.hasOwnProperty.call(req.body, 'isActive');

    if (isPartialToggleOnly) {
      if (typeof req.body.isActive !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'isActive must be a boolean',
          errors: { isActive: 'Invalid toggle value' },
        });
      }
      const toggled = await Category.findByIdAndUpdate(
        req.params.id,
        { isActive: req.body.isActive },
        { new: true }
      ).select('-image -imageUrl -imageFileId');
      const count = await Product.countDocuments({ category: toggled._id, deletedAt: null });
      return res.json({
        success: true,
        message: 'Category status updated',
        data: normalizeCategoryDoc(toggled, count),
      });
    }

    const parsed = validateWithSchema(categoryBodySchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const data = parsed.data;
    const resolvedSlug = data.slug || slugify(data.name);

    const duplicate = await Category.findOne({
      _id: { $ne: req.params.id },
      deletedAt: null,
      $or: [
        { name: new RegExp(`^${escapeRegex(data.name)}$`, 'i') },
        { slug: resolvedSlug },
      ],
    });

    if (duplicate) {
      const isNameDup = duplicate.name.toLowerCase() === data.name.toLowerCase();
      const errors = isNameDup
        ? { name: 'Another category already uses this name.' }
        : { slug: 'Another category already uses this slug.' };
      return res.status(400).json({
        success: false,
        message: Object.values(errors)[0],
        errors,
      });
    }

    const nextSortOrder =
      data.sortOrder !== undefined
        ? data.sortOrder
        : existing.sortOrder ?? existing.displayOrder ?? 0;

    const updatePayload = {
      name: data.name,
      slug: resolvedSlug,
      description: data.description,
      sortOrder: nextSortOrder,
      displayOrder: nextSortOrder,
      isActive: data.isActive,
    };

    const updated = await Category.findByIdAndUpdate(req.params.id, updatePayload, {
      new: true,
      runValidators: true,
    }).select('-image -imageUrl -imageFileId');

    const count = await Product.countDocuments({ category: updated._id, deletedAt: null });

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: normalizeCategoryDoc(updated, count),
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// ADMIN: DELETE /api/admin/categories/:id
// Blocks deletion when items exist unless body.reassignToCategoryId or query.reassignToCategoryId is provided.
// Uses soft delete (deletedAt).
exports.deleteCategory = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const category = await Category.findOne({ _id: req.params.id, deletedAt: null }).select(
      '-image -imageUrl -imageFileId'
    );
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const itemCount = await Product.countDocuments({
      category: category._id,
      deletedAt: null,
    });

    const reassignTargetId =
      req.body?.reassignToCategoryId || req.query?.reassignToCategoryId || null;

    if (itemCount > 0) {
      if (!reassignTargetId) {
        return res.status(400).json({
          success: false,
          code: 'CATEGORY_HAS_ITEMS',
          itemCount,
          message: `Move or delete the ${itemCount} item${itemCount === 1 ? '' : 's'} in this category first.`,
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(reassignTargetId) ||
        String(reassignTargetId) === String(category._id)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Please choose a valid different target category for item reassignment.',
        });
      }

      const targetCategory = await Category.findOne({
        _id: reassignTargetId,
        deletedAt: null,
      });

      if (!targetCategory) {
        return res.status(404).json({
          success: false,
          message: 'Target category for reassignment was not found.',
        });
      }

      await Product.updateMany(
        { category: category._id, deletedAt: null },
        { $set: { category: targetCategory._id } }
      );
    }

    category.deletedAt = new Date();
    category.isActive = false;
    await category.save();

    res.json({
      success: true,
      message:
        itemCount > 0
          ? `Moved ${itemCount} item(s) and deleted category "${category.name}".`
          : `Category "${category.name}" deleted.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
