const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const {
  getProducts,
  getBestsellerProduct,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');

router.get('/', getProducts);
router.post('/', requireAuth, requireAdmin, createProduct);
router.get('/bestseller', getBestsellerProduct);
router.get('/:id', getProductById);
router.put('/:id', requireAuth, requireAdmin, updateProduct);
router.delete('/:id', requireAuth, requireAdmin, deleteProduct);

module.exports = router;
