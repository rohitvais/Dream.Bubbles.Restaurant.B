const express = require('express');
const router = express.Router();
const {
  getInventory,
  updateInventoryItem,
  batchUpdateInventory,
  syncInventory,
} = require('../controllers/inventoryController');
const { requireAuth, requireAdmin, requireOutletAccess } = require('../middleware/authMiddleware');

router.get('/', requireAuth, requireOutletAccess, getInventory);
router.post('/batch-update', requireAuth, requireOutletAccess, batchUpdateInventory);
router.post('/sync', requireAuth, requireAdmin, syncInventory);
router.put('/:id', requireAuth, requireOutletAccess, updateInventoryItem);

module.exports = router;
