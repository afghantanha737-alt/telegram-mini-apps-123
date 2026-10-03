'use strict';

const mongoose = require('mongoose');

const latestPostEngagementStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  openedAt: { type: Date, required: true }
}, { timestamps: true });

// One outstanding Open→Check authorization per user and per recurring task.
latestPostEngagementStateSchema.index({ user: 1, task: 1 }, { unique: true });

module.exports = mongoose.model('LatestPostEngagementState', latestPostEngagementStateSchema);
