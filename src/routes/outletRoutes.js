const express = require('express');
const router = express.Router();
const {
  getOutlets,
  getNearbyOutlets,
  getOutletById,
  createOutlet,
  updateOutlet,
  deleteOutlet,
} = require('../controllers/outletController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

router.get('/nearby', getNearbyOutlets);
router.route('/').get(getOutlets).post(requireAuth, requireAdmin, createOutlet);
router
  .route('/:id')
  .get(getOutletById)
  .put(requireAuth, requireAdmin, updateOutlet)
  .delete(requireAuth, requireAdmin, deleteOutlet);

module.exports = router;
