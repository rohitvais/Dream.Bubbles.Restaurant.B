const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { resolveMapLink } = require('../controllers/outletController');

router.use(requireAuth, requireAdmin);

router.post('/resolve-map-link', resolveMapLink);

module.exports = router;
