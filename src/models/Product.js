const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: 0,
    },
    image: {
      type: String,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    imageFileId: {
      type: String,
      trim: true,
      default: null,
    },
    isVeg: {
      type: Boolean,
      default: true,
    },
    isBestseller: {
      type: Boolean,
      default: false,
    },
    tags: [String], // e.g., ["Bestseller", "New", "Chef's Special"]
    calories: {
      type: String,
      default: '220 kcal',
    },
    prepTimeMinutes: {
      type: Number,
      min: 1,
      default: 15,
    },
    availableOutlets: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Outlet',
        },
      ],
      default: undefined,
    },
    sweetnessLevels: {
      type: [String],
      default: ['0%', '30%', '50%', '70%', '100%'],
    },
    iceLevels: {
      type: [String],
      default: ['No Ice', 'Less Ice', 'Regular Ice'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
