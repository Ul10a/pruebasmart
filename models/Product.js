// models/Product.js

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:       { type: String,  required: true },
  price:      { type: Number,  required: true },
  promotion:  { type: String,  default: '' },
  promotion_enabled: { type: Boolean, default: false },
  available:  { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
