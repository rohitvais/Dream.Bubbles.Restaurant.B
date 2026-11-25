const mongoose = require('mongoose');
const crypto = require('crypto');

const OUTLET_ROLES = ['outlet_manager', 'outlet_staff'];
const ALL_ROLES = ['customer', 'admin', 'outlet_manager', 'outlet_staff'];

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
      enum: ALL_ROLES,
      default: 'customer',
    },
    outletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Outlet',
      default: null,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure outlet users are always linked to exactly one outlet, and non-outlet users have null outletId
userSchema.pre('validate', function (next) {
  if (OUTLET_ROLES.includes(this.role)) {
    if (!this.outletId) {
      return next(new Error('Outlet users must be assigned to an outlet (outletId is required).'));
    }
  } else {
    this.outletId = null;
  }
  next();
});

// Method to verify password using crypto
userSchema.methods.verifyPassword = function (enteredPassword) {
  const hash = crypto.createHash('sha256').update(enteredPassword).digest('hex');
  return this.passwordHash === hash;
};

// Static helper to hash password
userSchema.statics.hashPassword = function (plainPassword) {
  return crypto.createHash('sha256').update(plainPassword).digest('hex');
};

userSchema.statics.OUTLET_ROLES = OUTLET_ROLES;
userSchema.statics.ALL_ROLES = ALL_ROLES;

module.exports = mongoose.model('User', userSchema);
