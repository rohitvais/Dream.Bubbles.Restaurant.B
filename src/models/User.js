const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide your email address'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Method to verify password using crypto
userSchema.methods.verifyPassword = function (enteredPassword) {
  const hash = crypto.createHash('sha256').update(enteredPassword).digest('hex');
  return this.passwordHash === hash;
};

// Static helper to hash password
userSchema.statics.hashPassword = function (plainPassword) {
  return crypto.createHash('sha256').update(plainPassword).digest('hex');
};

module.exports = mongoose.model('User', userSchema);
