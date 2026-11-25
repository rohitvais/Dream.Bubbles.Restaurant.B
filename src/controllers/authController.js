const User = require('../models/User');
const crypto = require('crypto');

// Generate simple HMAC token
const generateToken = (userId, role) => {
  const payload = `${userId}:${role}:${Date.now()}`;
  const secret = process.env.JWT_SECRET || 'dream-bubbles-secure-token-key-2026';
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
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
  } catch (err) {
    console.error('Error seeding default users:', err.message);
  }
};

// Call on startup
seedDefaultUsers();

// @desc    Login user (admin or customer)
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
    });

    if (!user || !user.verifyPassword(password)) {
      // Fallback for hardcoded credentials if DB seed hasn't completed
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
          },
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your email and password.',
      });
    }

    const token = generateToken(user._id.toString(), user.role);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: err.message });
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
    });

    const token = generateToken(newUser._id.toString(), newUser.role);

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const rawToken = authHeader.split(' ')[1];
    const decoded = Buffer.from(rawToken, 'base64').toString('ascii');
    const parts = decoded.split(':');
    const userId = parts[0];

    const user = await User.findById(userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
