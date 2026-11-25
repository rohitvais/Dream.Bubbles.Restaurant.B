const Order = require('../models/Order');
const Inventory = require('../models/Inventory');
const Outlet = require('../models/Outlet');
const { buildWhatsAppDigits } = require('../lib/geoUtils');

// Helper to generate unique order number like DB-8291
const generateOrderNumber = () => {
  const random4 = Math.floor(1000 + Math.random() * 9000);
  return `DB-${random4}`;
};

// GET /api/orders
// Query params: outletId, status, channel, search, limit
exports.getOrders = async (req, res) => {
  try {
    const { outletId, status, channel, search, limit = 50 } = req.query;
    let query = {};

    if (outletId && outletId !== 'all') {
      query.outlet = outletId;
    }
    if (status && status !== 'all') {
      query.status = status;
    }
    if (channel && channel !== 'all') {
      query.channel = channel;
    }
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
      ];
    }

    const orders = await Order.find(query)
      .populate('outlet', 'name city phone whatsappNumber address')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10));

    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/orders/:id
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      'outlet',
      'name city phone whatsappNumber address'
    );
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/orders
exports.createOrder = async (req, res) => {
  try {
    const {
      outletId,
      customerName,
      customerPhone,
      customerAddress,
      orderType,
      items,
      specialInstructions,
      channel = 'WhatsApp',
      deliveryFee = 0,
    } = req.body;

    if (!outletId || !customerName || !customerPhone || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Outlet, Customer Name, Phone, and at least one item are required.',
      });
    }

    const outlet = await Outlet.findById(outletId);
    if (!outlet) {
      return res.status(404).json({ success: false, message: 'Outlet not found' });
    }

    let calculatedTotal = 0;
    let totalItems = 0;
    const formattedItems = items.map((item) => {
      const subtotal = item.price * item.quantity;
      calculatedTotal += subtotal;
      totalItems += item.quantity;
      return {
        product: item.productId || item.product,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        sweetness: item.sweetness || '100%',
        ice: item.ice || 'Regular Ice',
        subtotal,
      };
    });

    calculatedTotal += Number(deliveryFee);

    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      outlet: outlet._id,
      customerName,
      customerPhone,
      customerAddress: customerAddress || '',
      orderType: orderType || 'Takeaway',
      items: formattedItems,
      itemCount: totalItems,
      totalAmount: calculatedTotal,
      deliveryFee,
      specialInstructions: specialInstructions || '',
      status: 'Pending',
      channel,
    });

    // Auto decrement inventory stock
    for (const item of formattedItems) {
      try {
        const inv = await Inventory.findOne({
          outlet: outlet._id,
          product: item.product,
        });
        if (inv) {
          inv.stockQuantity = Math.max(0, inv.stockQuantity - item.quantity);
          if (inv.stockQuantity === 0) {
            inv.isOutOfStock = true;
          }
          await inv.save();
        }
      } catch (stockErr) {
        console.error('Inventory stock decrement failed:', stockErr);
      }
    }

    // Build pre-formatted WhatsApp message for customer
    const itemsText = formattedItems
      .map(
        (i) =>
          `• ${i.quantity}x ${i.name} (₹${i.subtotal}) [${i.sweetness}, ${i.ice}]`
      )
      .join('\n');

    const whatsappMessage = `*🧋 DREAM BUBBLES - ORDER #${orderNumber}*
------------------------------
*Outlet:* ${outlet.name}
*Customer:* ${customerName}
*Phone:* ${customerPhone}
*Type:* ${orderType}${orderType === 'Delivery' && customerAddress ? `\n*Address:* ${customerAddress}` : ''}
------------------------------
*Items Ordered:*
${itemsText}
------------------------------
*Total Amount:* ₹${calculatedTotal}
${specialInstructions ? `*Notes:* ${specialInstructions}\n` : ''}------------------------------
_Please confirm my order. Thank you!_`;

    const encodedMsg = encodeURIComponent(whatsappMessage);
    const cleanWhatsApp = buildWhatsAppDigits(outlet.whatsappNumber);
    const whatsappUrl = `https://wa.me/${cleanWhatsApp}?text=${encodedMsg}`;

    const populatedOrder = await Order.findById(order._id).populate(
      'outlet',
      'name city phone whatsappNumber address'
    );

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: populatedOrder,
      whatsappUrl,
      whatsappMessage,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUT /api/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'Pending',
      'Confirmed',
      'Preparing',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // If order was cancelled and previous status wasn't cancelled, restore inventory
    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      for (const item of order.items) {
        await Inventory.findOneAndUpdate(
          { outlet: order.outlet, product: item.product },
          { $inc: { stockQuantity: item.quantity }, $set: { isOutOfStock: false } }
        );
      }
    }

    order.status = status;
    await order.save();

    const populated = await Order.findById(order._id).populate(
      'outlet',
      'name city phone whatsappNumber'
    );

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: populated,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// DELETE /api/orders/:id
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
