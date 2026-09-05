'use strict';

const User = require('../models/User');

async function runReferralSweep() {
  const counts = await User.aggregate([
    { $match: { referredBy: { $ne: null } } },
    { $group: { _id: '$referredBy', count: { $sum: 1 } } }
  ]);

  const countMap = new Map(counts.map(item => [String(item._id), item.count]));
  const users = await User.find({}, '_id invitedCount');
  const bulkOps = [];

  for (const user of users) {
    const actualCount = countMap.get(String(user._id)) || 0;
    if (actualCount !== user.invitedCount) {
      bulkOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: { $set: { invitedCount: actualCount } }
        }
      });
    }
  }

  if (bulkOps.length > 0) {
    await User.bulkWrite(bulkOps);
    console.log(`🔄 Referral sweep updated ${bulkOps.length} user(s).`);
  }
}

module.exports = runReferralSweep;