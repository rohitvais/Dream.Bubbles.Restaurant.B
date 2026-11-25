const express = require('express');
const router = express.Router();
const Outlet = require('../models/Outlet');
const { requireAuth, requireOutletAccess } = require('../middleware/authMiddleware');

router.use(requireAuth, requireOutletAccess);

/**
 * GET /api/outlet/context
 * Returns the active outlet scoped by req.scopedOutletId (server-enforced).
 * Admins also receive the list of all active outlets for switching views.
 */
router.get('/context', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let availableOutlets = [];
    let activeOutlet = null;

    if (isAdmin) {
      availableOutlets = await Outlet.find({ isActive: true })
        .select('_id name city code address openingHours isActive')
        .sort({ name: 1 });

      if (req.scopedOutletId) {
        activeOutlet =
          availableOutlets.find((o) => String(o._id) === req.scopedOutletId) ||
          (await Outlet.findById(req.scopedOutletId).select(
            '_id name city code address openingHours isActive'
          ));
      } else {
        activeOutlet = availableOutlets[0] || null;
      }
    } else {
      activeOutlet = await Outlet.findById(req.scopedOutletId).select(
        '_id name city code address openingHours isActive'
      );
      if (!activeOutlet) {
        return res.status(404).json({
          success: false,
          message: 'Assigned outlet not found.',
        });
      }
      availableOutlets = [activeOutlet];
    }

    return res.json({
      success: true,
      data: {
        activeOutlet,
        availableOutlets,
        canSwitchOutlet: isAdmin,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
