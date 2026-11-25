const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const {
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');

router.use(requireAuth, requireAdmin);

router.get('/', getAdminProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
