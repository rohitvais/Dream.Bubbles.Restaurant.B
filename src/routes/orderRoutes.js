const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  deleteOrder,
} = require('../controllers/orderController');
const { requireAuth, requireAdmin, requireOutletAccess } = require('../middleware/authMiddleware');

router.route('/').get(requireAuth, requireOutletAccess, getOrders).post(createOrder);
router.route('/:id').get(getOrderById).delete(requireAuth, requireAdmin, deleteOrder);
router.put('/:id/status', requireAuth, requireOutletAccess, updateOrderStatus);

module.exports = router;
