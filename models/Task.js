'use strict';
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['channel', 'group', 'link', 'custom'],
      default: 'link'
    },
    url: { type: String, default: '' },
    reward: { type: Number, required: true, min: 0 },
    requiresReview: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);