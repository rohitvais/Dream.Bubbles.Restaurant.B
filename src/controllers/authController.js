const crypto = require('crypto');
const User = require('../models/User');
const Outlet = require('../models/Outlet');

// Generate simple HMAC token
const generateToken = (userId, role) => {
  const payload = `${userId}:${role}:${Date.now()}`;
  const secret = process.env.JWT_SECRET || 'dream-bubbles-secure-token-key-2026';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
};

const formatUserResponse = (user) => {
  const populatedOutlet =
    user.outletId && typeof user.outletId === 'object' && user.outletId._id
      ? {
          _id: user.outletId._id,
          name: user.outletId.name,
          city: user.outletId.city,
          code: user.outletId.code,
        }
      : null;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    outletId: populatedOutlet ? populatedOutlet._id : user.outletId || null,
    outlet: populatedOutlet,
    mustChangePassword: Boolean(user.mustChangePassword),
    isActive: user.isActive !== false,
  };
};

// Seed default users if empty
const seedDefaultUsers = async () => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      await User.create({
        name: 'Operations Admin',
        email: 'admin@dreambubbles.com',
        phone: '+91 98765 43210',
        passwordHash: User.hashPassword('admin123'),
        role: 'admin',
      });
      console.log('✅ Default admin account created: admin@dreambubbles.com / admin123');
    }

    const customerCount = await User.countDocuments({ role: 'customer' });
    if (customerCount === 0) {
      await User.create({
        name: 'Demo Customer',
        email: 'customer@dreambubbles.com',
        phone: '+91 91234 56789',
        passwordHash: User.hashPassword('customer123'),
        role: 'customer',
      });
      console.log('✅ Default customer account created: customer@dreambubbles.com / customer123');
    }

    const outletUserCount = await User.countDocuments({
      role: { $in: ['outlet_manager', 'outlet_staff'] },
    });
    if (outletUserCount === 0) {
      const firstOutlet = await Outlet.findOne({ isActive: true }).sort({ createdAt: 1 });
      if (firstOutlet) {
        await User.create({
          name: 'Outlet Kitchen Manager',
          email: 'outlet@dreambubbles.com',
          phone: firstOutlet.phone || '+91 98765 00001',
          passwordHash: User.hashPassword('outlet123'),
          role: 'outlet_manager',
          outletId: firstOutlet._id,
        });
        console.log(
          `✅ Default outlet manager created: outlet@dreambubbles.com / outlet123 (${firstOutlet.name})`
        );
      }
    }
  } catch (err) {
    console.error('Error seeding default users:', err.message);
  }
};

// Call on startup (and allow re-checking if outlets are seeded later)
seedDefaultUsers();

// @desc    Login user (admin, outlet_manager, outlet_staff, or customer)
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const searchEmail = (identifier || email || '').trim().toLowerCase();

    if (!searchEmail || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email/identifier and password',
      });
    }

    // Find by email or phone
    const user = await User.findOne({
      $or: [{ email: searchEmail }, { phone: searchEmail }],
    }).populate('outletId', 'name city code');

    if (user && user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
    }

    if (!user || !user.verifyPassword(password)) {
      // Fallback for hardcoded demo credentials if DB seed hasn't completed
      if (searchEmail === 'admin@dreambubbles.com' && password === 'admin123') {
        const token = generateToken('fallback-admin', 'admin');
        return res.json({
          success: true,
          token,
          user: {
            _id: 'admin-fallback',
            name: 'Operations Admin',
            email: 'admin@dreambubbles.com',
            phone: '+91 98765 43210',
            role: 'admin',
            outletId: null,
          },
        });
      }

      if (searchEmail === 'customer@dreambubbles.com' && password === 'customer123') {
        const token = generateToken('fallback-customer', 'customer');
        return res.json({
          success: true,
          token,
          user: {
            _id: 'customer-fallback',
            name: 'Demo Customer',
            email: 'customer@dreambubbles.com',
            phone: '+91 91234 56789',
            role: 'customer',
            outletId: null,
          },
        });
      }

      if (searchEmail === 'outlet@dreambubbles.com' && password === 'outlet123') {
        const firstOutlet = await Outlet.findOne({ isActive: true }).select('_id name city code');
        const token = generateToken('fallback-outlet', 'outlet_manager');
        return res.json({
          success: true,
          token,
          user: {
            _id: 'outlet-fallback',
            name: 'Outlet Kitchen Manager',
            email: 'outlet@dreambubbles.com',
            phone: firstOutlet?.phone || '+91 98765 00001',
            role: 'outlet_manager',
            outletId: firstOutlet ? firstOutlet._id : null,
            outlet: firstOutlet || null,
          },
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your email and password.',
      });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id.toString(), user.role);

    return res.json({
      success: true,
      token,
      user: formatUserResponse(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Register a new customer account
// @route   POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: (phone || '').trim(),
      passwordHash: User.hashPassword(password),
      role: 'customer',
      outletId: null,
    });

    const token = generateToken(newUser._id.toString(), newUser.role);

    return res.status(201).json({
      success: true,
      token,
      user: formatUserResponse(newUser),
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get current authenticated user profile
// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    return res.json({
      success: true,
      user: formatUserResponse(req.user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
