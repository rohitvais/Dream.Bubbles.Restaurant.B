const express = require('express');
const router = express.Router();
const {
  getInventory,
  updateInventoryItem,
  batchUpdateInventory,
  syncInventory,
} = require('../controllers/inventoryController');

router.get('/', getInventory);
router.post('/batch-update', batchUpdateInventory);
router.post('/sync', syncInventory);
router.put('/:id', updateInventoryItem);

module.exports = router;
