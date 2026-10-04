'use strict';
const mongoose = require('mongoose');

const distributedJobLockSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  owner: { type: String, required: true },
  leaseUntil: { type: Date, required: true }
}, { versionKey: false, timestamps: true, collection: 'distributed_job_locks' });

distributedJobLockSchema.index({ leaseUntil: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('DistributedJobLock', distributedJobLockSchema);
