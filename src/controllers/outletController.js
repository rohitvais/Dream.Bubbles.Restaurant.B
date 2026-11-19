const Outlet = require('../models/Outlet');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

// Calculate distance in km between two lat/lng coordinates (Haversine formula)
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Rounded to 1 decimal place
};

// GET /api/outlets
exports.getOutlets = async (req, res) => {
  try {
    const { active, search } = req.query;
    let query = {};
    if (active !== undefined) {
      query.isActive = active === 'true';
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }
    const outlets = await Outlet.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: outlets.length, data: outlets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/outlets/nearby?lat=...&lng=...&maxDistance=50
exports.getNearbyOutlets = async (req, res) => {
  try {
    const { lat, lng, maxDistance = 50 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and Longitude are required to find nearby outlets',
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    const outlets = await Outlet.find({ isActive: true });

    const outletsWithDistance = outlets.map((outlet) => {
      const distance = calculateDistanceKm(
        userLat,
        userLng,
        outlet.location.lat,
        outlet.location.lng
      );
      return {
        ...outlet.toObject(),
        distanceKm: distance,
      };
    });

    // Sort by nearest first
    outletsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      success: true,
      userLocation: { lat: userLat, lng: userLng },
      count: outletsWithDistance.length,
      data: outletsWithDistance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/outlets/:id
exports.getOutletById = async (req, res) => {
  try {
    const outlet = await Outlet.findById(req.params.id);
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }
    res.json({ success: true, data: outlet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/outlets
exports.createOutlet = async (req, res) => {
  try {
    const outlet = await Outlet.create(req.body);

    // Initialize inventory for this new outlet with all existing products
    const products = await Product.find({ isAvailable: true });
    if (products.length > 0) {
      const inventoryDocs = products.map((product) => ({
        outlet: outlet._id,
        product: product._id,
        stockQuantity: 50,
        lowStockThreshold: 10,
        isOutOfStock: false,
      }));
      await Inventory.insertMany(inventoryDocs);
    }

    res.status(201).json({
      success: true,
      message: 'Outlet created successfully and inventory initialized',
      data: outlet,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUT /api/outlets/:id
exports.updateOutlet = async (req, res) => {
  try {
    const outlet = await Outlet.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }
    res.json({ success: true, message: 'Outlet updated successfully', data: outlet });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE /api/outlets/:id
exports.deleteOutlet = async (req, res) => {
  try {
    const outlet = await Outlet.findByIdAndDelete(req.params.id);
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }
    // Delete related inventory
    await Inventory.deleteMany({ outlet: outlet._id });

    res.json({ success: true, message: 'Outlet and related inventory deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
