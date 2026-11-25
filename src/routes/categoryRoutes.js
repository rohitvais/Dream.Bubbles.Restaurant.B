const express = require('express');
const router = express.Router();
const { getCategories } = require('../controllers/categoryController');

// Public storefront route: active, non-deleted categories sorted by sortOrder
router.get('/', getCategories);

module.exports = router;
