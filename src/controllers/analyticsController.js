const Order = require('../models/Order');
const Outlet = require('../models/Outlet');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

// GET /api/analytics/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const totalOutlets = await Outlet.countDocuments();
    const activeOutlets = await Outlet.countDocuments({ isActive: true });
    const totalProducts = await Product.countDocuments({ deletedAt: null });
    const totalOrders = await Order.countDocuments();

    // Total revenue from non-cancelled orders
    const revenueResult = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Status breakdown
    const statusCounts = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const statusMap = {
      Pending: 0,
      Confirmed: 0,
      Preparing: 0,
      'Out for Delivery': 0,
      Delivered: 0,
      Cancelled: 0,
    };
    statusCounts.forEach((s) => {
      if (statusMap[s._id] !== undefined) {
        statusMap[s._id] = s.count;
      }
    });

    // Low stock items count
    const lowStockCount = await Inventory.countDocuments({
      $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
    });

    // Recent orders
    const recentOrders = await Order.find()
      .populate('outlet', 'name city')
      .sort({ createdAt: -1 })
      .limit(6);

    // Outlet sales breakdown
    const outletSales = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: '$outlet',
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'outlets',
          localField: '_id',
          foreignField: '_id',
          as: 'outletInfo',
        },
      },
      { $unwind: '$outletInfo' },
      {
        $project: {
          outletName: '$outletInfo.name',
          city: '$outletInfo.city',
          revenue: 1,
          orderCount: 1,
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        activeOutlets,
        totalOutlets,
        totalProducts,
        lowStockCount,
        pendingOrders: statusMap.Pending,
        statusBreakdown: statusMap,
        recentOrders,
        outletSales,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
