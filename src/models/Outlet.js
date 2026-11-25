const mongoose = require('mongoose');

const outletSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Outlet name is required'],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required for direct customer calls'],
      trim: true,
    },
    whatsappNumber: {
      type: String,
      required: [true, 'WhatsApp number is required for WhatsApp ordering'],
      trim: true,
    },
    location: {
      lat: {
        type: Number,
        min: -90,
        max: 90,
        default: null,
      },
      lng: {
        type: Number,
        min: -180,
        max: 180,
        default: null,
      },
    },
    mapsUrl: {
      type: String,
      trim: true,
      default: '',
    },
    openingHours: {
      type: String,
      default: '10:00 AM - 11:00 PM',
    },
    isActive: {
      type: Boolean,
      default: true,
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
    rating: {
      type: Number,
      default: 4.8,
    },
    tags: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Outlet', outletSchema);
