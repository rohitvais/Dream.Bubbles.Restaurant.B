const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Outlet',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    stockQuantity: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: 0,
    },
    isOutOfStock: {
      type: Boolean,
      default: false,
    },
    lastRestockedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Unique compound index: each product has exactly one inventory entry per outlet
inventorySchema.index({ outlet: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', inventorySchema);
