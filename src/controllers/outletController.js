const { z } = require('zod');
const Outlet = require('../models/Outlet');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const { validateWithSchema } = require('../lib/validateRequest');
const {
  calculateDistanceKm,
  isValidCoordPair,
  resolveGoogleMapsLink,
  buildGoogleMapsSearchUrl,
  checkCityCoordinateDistance,
  normalizeIndianWhatsApp,
} = require('../lib/geoUtils');
const {
  safeDeleteFile,
  cleanupUploadAfterDbFailure,
  deletePreviousFileAfterSave,
} = require('../lib/imageLifecycle');

const resolveMapLinkSchema = z.object({
  mapsUrl: z
    .string({ required_error: 'Google Maps link is required.' })
    .trim()
    .min(1, 'Please paste a Google Maps share link.'),
  city: z.string().trim().optional(),
});

const normalizeOutletDoc = (outlet) => {
  const plain = outlet.toObject ? outlet.toObject() : { ...outlet };
  const lat = plain.location?.lat !== undefined && plain.location?.lat !== null ? Number(plain.location.lat) : null;
  const lng = plain.location?.lng !== undefined && plain.location?.lng !== null ? Number(plain.location.lng) : null;

  const hasValidLocation = isValidCoordPair(lat, lng);
  const resolvedMapsUrl =
    plain.mapsUrl || (hasValidLocation ? buildGoogleMapsSearchUrl(lat, lng) : '');

  return {
    ...plain,
    location: hasValidLocation ? { lat, lng } : { lat: null, lng: null },
    mapsUrl: resolvedMapsUrl,
  };
};

// POST /api/admin/outlets/resolve-map-link (admin only)
exports.resolveMapLink = async (req, res) => {
  try {
    const parsed = validateWithSchema(resolveMapLinkSchema, req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        message: parsed.message,
        errors: parsed.errors,
      });
    }

    const { mapsUrl, city } = parsed.data;
    const { lat, lng, resolvedUrl } = await resolveGoogleMapsLink(mapsUrl);
    const cityCheck = checkCityCoordinateDistance(city, lat, lng);

    return res.json({
      success: true,
      lat,
      lng,
      resolvedUrl,
      cityWarning: cityCheck?.warning || null,
    });
  } catch (error) {
    const msg =
      error.message ||
      "Couldn't read a location from this link. Copy the link from Google Maps' Share button.";
    return res.status(error.statusCode || 400).json({
      success: false,
      message: msg,
      errors: { mapsUrl: msg },
    });
  }
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
    const normalized = outlets.map(normalizeOutletDoc);
    res.json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/outlets/nearby?lat=...&lng=...&maxDistance=50
exports.getNearbyOutlets = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and Longitude are required to find nearby outlets',
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    const outlets = await Outlet.find({ isActive: true });

    const outletsWithDistance = outlets
      .map(normalizeOutletDoc)
      .filter((o) => isValidCoordPair(o.location?.lat, o.location?.lng))
      .map((outlet) => {
        const distance = calculateDistanceKm(
          userLat,
          userLng,
          outlet.location.lat,
          outlet.location.lng
        );
        return {
          ...outlet,
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
    res.json({ success: true, data: normalizeOutletDoc(outlet) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper: prepares location + WhatsApp normalization on create/update
async function prepareOutletWritePayload(body) {
  const payload = { ...body };

  if (Object.prototype.hasOwnProperty.call(body, 'whatsappNumber')) {
    payload.whatsappNumber = normalizeIndianWhatsApp(body.whatsappNumber);
  }

  // Handle Google Maps link + coordinates
  const hasMapsUrl = Object.prototype.hasOwnProperty.call(body, 'mapsUrl');
  const rawLat = body.lat !== undefined ? body.lat : body.location?.lat;
  const rawLng = body.lng !== undefined ? body.lng : body.location?.lng;
  let lat = rawLat !== undefined && rawLat !== null && rawLat !== '' ? Number(rawLat) : null;
  let lng = rawLng !== undefined && rawLng !== null && rawLng !== '' ? Number(rawLng) : null;

  if (hasMapsUrl && body.mapsUrl && !isValidCoordPair(lat, lng)) {
    const resolved = await resolveGoogleMapsLink(body.mapsUrl);
    lat = resolved.lat;
    lng = resolved.lng;
  }

  if (isValidCoordPair(lat, lng)) {
    payload.location = { lat, lng };
    if (!payload.mapsUrl) {
      payload.mapsUrl = buildGoogleMapsSearchUrl(lat, lng);
    }
  } else if (hasMapsUrl && !body.mapsUrl) {
    payload.location = { lat: null, lng: null };
    payload.mapsUrl = '';
  }

  delete payload.lat;
  delete payload.lng;
  return payload;
}

// POST /api/outlets
exports.createOutlet = async (req, res) => {
  const newFileId = req.body?.imageFileId || null;
  try {
    const payload = await prepareOutletWritePayload(req.body);
    if (!isValidCoordPair(payload.location?.lat, payload.location?.lng)) {
      await cleanupUploadAfterDbFailure(newFileId, null);
      return res.status(400).json({
        success: false,
        message: 'A valid Google Maps location link is required.',
        errors: {
          mapsUrl: "Couldn't read a location from this link. Copy the link from Google Maps' Share button.",
        },
      });
    }

    const outlet = await Outlet.create(payload);

    // Initialize inventory for this new outlet with all existing products
    const products = await Product.find({ isAvailable: true, deletedAt: null });
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
      data: normalizeOutletDoc(outlet),
    });
  } catch (error) {
    await cleanupUploadAfterDbFailure(newFileId, null);
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

// PUT /api/outlets/:id
exports.updateOutlet = async (req, res) => {
  const newFileId = req.body?.imageFileId || null;
  let oldFileId = null;

  try {
    const existing = await Outlet.findById(req.params.id);
    if (!existing) {
      await cleanupUploadAfterDbFailure(newFileId, null);
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }

    oldFileId = existing.imageFileId || null;
    const isStatusToggleOnly =
      Object.keys(req.body).length === 1 &&
      Object.prototype.hasOwnProperty.call(req.body, 'isActive');

    const payload = isStatusToggleOnly
      ? { isActive: req.body.isActive }
      : await prepareOutletWritePayload(req.body);

    const outlet = await Outlet.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    await deletePreviousFileAfterSave(oldFileId, outlet.imageFileId || null);

    res.json({
      success: true,
      message: 'Outlet updated successfully',
      data: normalizeOutletDoc(outlet),
    });
  } catch (error) {
    await cleanupUploadAfterDbFailure(newFileId, oldFileId);
    res.status(error.statusCode || 400).json({ success: false, message: error.message });
  }
};

// DELETE /api/outlets/:id
exports.deleteOutlet = async (req, res) => {
  try {
    const outlet = await Outlet.findByIdAndDelete(req.params.id);
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }
    await Inventory.deleteMany({ outlet: outlet._id });
    await safeDeleteFile(outlet.imageFileId, 'outlet-delete');

    res.json({ success: true, message: 'Outlet and related inventory deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
