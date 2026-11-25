const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const {
  getAdminCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
} = require('../controllers/categoryController');

router.use(requireAuth, requireAdmin);

router.get('/', getAdminCategories);
router.post('/', createCategory);
router.put('/reorder', reorderCategories);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
