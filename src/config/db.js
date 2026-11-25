const mongoose = require('mongoose');
const Category = require('../models/Category');

const ensureCategoryIndexes = async () => {
  try {
    const indexes = await Category.collection.indexes();
    for (const idx of indexes) {
      if ((idx.name === 'name_1' || idx.name === 'slug_1') && !idx.partialFilterExpression) {
        await Category.collection.dropIndex(idx.name);
      }
    }
    await Category.syncIndexes();
  } catch (err) {
    // Ignore if collection does not exist yet
    if (err?.codeName !== 'NamespaceNotFound') {
      console.warn('Category index sync warning:', err.message);
    }
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
    await ensureCategoryIndexes();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
