const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

const getSecret = () => process.env.JWT_SECRET || 'dream-bubbles-secure-token-key-2026';

/**
 * Verifies the Bearer HMAC token issued by /api/auth/login or /api/auth/register
 * and attaches the authenticated user to req.user.
 */
exports.requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please sign in.',
      });
    }

    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is missing.',
      });
    }

    let decoded;
    try {
      decoded = Buffer.from(rawToken, 'base64').toString('utf8');
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid token encoding.' });
    }

    const parts = decoded.split(':');
    if (parts.length !== 4) {
      return res.status(401).json({ success: false, message: 'Malformed authentication token.' });
    }

    const [userId, tokenRole, issuedAt, providedSig] = parts;
    const payload = `${userId}:${tokenRole}:${issuedAt}`;
    const expectedSig = crypto
      .createHmac('sha256', getSecret())
      .update(payload)
      .digest('hex');

    const providedBuf = Buffer.from(providedSig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (
      providedBuf.length === 0 ||
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return res.status(401).json({ success: false, message: 'Invalid authentication token.' });
    }

    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select('-passwordHash');
      if (!user || user.isActive === false) {
        return res.status(401).json({ success: false, message: 'User account not active.' });
      }
      req.user = user;
      return next();
    }

    if (userId === 'fallback-admin' || userId === 'fallback-customer') {
      req.user = { _id: userId, role: tokenRole };
      return next();
    }

    return res.status(401).json({ success: false, message: 'Invalid authentication subject.' });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};

/**
 * Ensures the authenticated user has the 'admin' role (returns 403 otherwise).
 */
exports.requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Admin access required.',
    });
  }

  return next();
};
