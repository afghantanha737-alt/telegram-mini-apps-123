'use strict';
const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  adminId: { type: String, required: true },
  actor: { type: String, required: true, default: 'ادمین' },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'admin_session_expiry' });
module.exports = mongoose.model('AdminSession', adminSessionSchema);
