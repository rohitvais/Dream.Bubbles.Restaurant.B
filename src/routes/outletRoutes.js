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

router.get('/nearby', getNearbyOutlets);
router.route('/').get(getOutlets).post(createOutlet);
router.route('/:id').get(getOutletById).put(updateOutlet).delete(deleteOutlet);

module.exports = router;
