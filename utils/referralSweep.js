'use strict';

const User = require('../models/User');
const TaskCompletion = require('../models/TaskCompletion');

/**
 * شمارنده‌های ریفرال را با داده‌های واقعی دیتابیس هماهنگ می‌کند.
 * activeInvitedCount فقط کاربرانی را شامل می‌شود که حداقل یک تسک approved دارند.
 */
async function runReferralSweep() {
  const counts = await User.aggregate([
    { $match: { referredBy: { $ne: null } } },
    { $group: { _id: '$referredBy', count: { $sum: 1 } } }
  ]);

  const countMap = new Map(counts.map(item => [String(item._id), item.count]));
  const activeUsers = await TaskCompletion.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: '$user' } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.referredBy': { $ne: null } } },
    { $group: { _id: '$user.referredBy', ids: { $addToSet: '$_id' } } }
  ]);
  const activeMap = new Map(activeUsers.map(item => [String(item._id), item.ids]));
  const users = await User.find({}, '_id invitedCount activeInvitedCount activeReferralIds');
  const bulkOps = [];

  for (const user of users) {
    const actualCount = countMap.get(String(user._id)) || 0;
    const actualActiveIds = activeMap.get(String(user._id)) || [];
    const actualActiveCount = actualActiveIds.length;
    const storedActiveIds = (user.activeReferralIds || []).map(id => String(id)).sort();
    const actualActiveIdStrings = actualActiveIds.map(id => String(id)).sort();
    const activeIdsChanged = storedActiveIds.length !== actualActiveIdStrings.length
      || storedActiveIds.some((id, index) => id !== actualActiveIdStrings[index]);
    if (actualCount !== user.invitedCount || actualActiveCount !== user.activeInvitedCount || activeIdsChanged) {
      bulkOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              invitedCount: actualCount,
              activeInvitedCount: actualActiveCount,
              activeReferralIds: actualActiveIds
            }
          }
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
