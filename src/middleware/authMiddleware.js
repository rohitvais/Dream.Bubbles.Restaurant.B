const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Outlet = require('../models/Outlet');

const getSecret = () => process.env.JWT_SECRET || 'dream-bubbles-secure-token-key-2026';

const OUTLET_ROLES = ['outlet_manager', 'outlet_staff'];

/**
 * Verifies the Bearer HMAC token issued by /api/auth/login or /api/auth/register
 * and attaches the authenticated, active user to req.user.
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
      const user = await User.findById(userId)
        .select('-passwordHash')
        .populate('outletId', 'name city code isActive');
      if (!user || user.isActive === false) {
        return res.status(401).json({
          success: false,
          code: 'ACCOUNT_INACTIVE',
          message: 'User account not active.',
        });
      }
      req.user = user;
      return next();
    }

    if (userId === 'fallback-admin' || userId === 'fallback-customer') {
      req.user = { _id: userId, role: tokenRole, outletId: null, isActive: true };
      return next();
    }

    if (userId === 'fallback-outlet') {
      const firstOutlet = await Outlet.findOne({ isActive: true }).select('_id name city code');
      req.user = {
        _id: userId,
        role: tokenRole,
        outletId: firstOutlet ? firstOutlet._id : null,
        isActive: true,
      };
      return next();
    }

    return res.status(401).json({ success: false, message: 'Invalid authentication subject.' });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};

/**
 * Ensures the authenticated user holds one of the allowed roles (403 otherwise).
 */
exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: Requires role (${roles.join(' or ')}).`,
    });
  }

  return next();
};

/**
 * Convenience middleware for admin-only routes.
 */
exports.requireAdmin = exports.requireRole('admin');

/**
 * Scopes outlet access on the server:
 * - outlet_manager / outlet_staff: locked strictly to req.user.outletId. Never trusts a
 *   client-supplied outletId; rejects mismatched explicit outletId with 403 and exposes
 *   req.scopedOutletId for all downstream queries.
 * - admin: allowed across all outlets, or narrowed if outletId is supplied in query/body/params.
 */
exports.requireOutletAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
    });
  }

  const requestedOutletId =
    req.params?.outletId || req.query?.outletId || req.body?.outletId || null;

  if (req.user.role === 'admin') {
    req.scopedOutletId =
      requestedOutletId && requestedOutletId !== 'all' ? String(requestedOutletId) : null;
    return next();
  }

  if (OUTLET_ROLES.includes(req.user.role)) {
    const rawUserOutlet = req.user.outletId?._id || req.user.outletId;
    if (!rawUserOutlet) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: No outlet is assigned to your account.',
      });
    }

    const userOutletId = String(rawUserOutlet);

    if (
      requestedOutletId &&
      requestedOutletId !== 'all' &&
      String(requestedOutletId) !== userOutletId
    ) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only access data for your assigned outlet.',
      });
    }

    req.scopedOutletId = userOutletId;
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Forbidden: Outlet or Admin access required.',
  });
};
