'use strict';

const User = require('../models/User');
const TaskCompletion = require('../models/TaskCompletion');
const { evaluateReferralEligibility } = require('./referralEligibility');

/**
 * شمارنده‌های Referral را با شرط امن جدید هماهنگ می‌کند:
 * ۳ تسک approved، حداقل ۲ روز متفاوت، گذشت ۷ روز و بدون ریسک مسدود.
 * این Sweep باعث می‌شود کاربران قدیمی که با شرط قبلی فعال شده بودند، دوباره بررسی شوند.
 */
async function runReferralSweep() {
  const invitedUsers = await User.find({ referredBy: { $ne: null } })
    .select('_id referredBy createdAt referralRiskScore referralRiskBlocked referralEligibilityStatus referralEligibleAt referralInitialRewardEligible')
    .lean();
  const ids = invitedUsers.map(user => user._id);
  const activity = ids.length === 0 ? [] : await TaskCompletion.aggregate([
    { $match: { user: { $in: ids }, status: 'approved' } },
    { $group: {
      _id: '$user',
      count: { $sum: 1 },
      days: { $addToSet: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'UTC' } } }
    } }
  ]);
  const activityMap = new Map(activity.map(item => [String(item._id), item]));
  const eligibleByReferrer = new Map();
  const invitedCountByReferrer = new Map();
  const inviteeOps = [];

  for (const user of invitedUsers) {
    const referrerKey = String(user.referredBy);
    invitedCountByReferrer.set(referrerKey, (invitedCountByReferrer.get(referrerKey) || 0) + 1);
    const item = activityMap.get(String(user._id));
    const completions = Array.from({ length: item?.count || 0 }, (_, index) => ({
      status: 'approved',
      createdAt: item?.days?.length ? item.days[index % item.days.length] : user.createdAt
    }));
    const eligibility = evaluateReferralEligibility(user, completions);
    inviteeOps.push({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            referralEligibilityStatus: eligibility.status,
            referralEligibilityReasons: eligibility.reasons,
            referralEligibleAt: eligibility.eligible ? eligibility.eligibleAt : null
          }
        }
      }
    });
    if (eligibility.eligible && !user.referralRiskBlocked) {
      if (!eligibleByReferrer.has(referrerKey)) eligibleByReferrer.set(referrerKey, []);
      eligibleByReferrer.get(referrerKey).push(user._id);
    }
  }

  if (inviteeOps.length > 0) await User.bulkWrite(inviteeOps);

  // Re-check one-time direct rewards that were held while either account was under review.
  // linkReferral uses the same atomic eligibility flag and deterministic Ledger IDs, so retries are safe.
  const pendingInitialRewards = invitedUsers.filter(user => user.referralInitialRewardEligible && user.referredBy);
  if (pendingInitialRewards.length > 0) {
    const { linkReferral } = require('./referralSystem');
    for (let offset = 0; offset < pendingInitialRewards.length; offset += 20) {
      const batch = pendingInitialRewards.slice(offset, offset + 20);
      const results = await Promise.allSettled(batch.map(user => linkReferral({
        referredUserId: user._id,
        referrerId: user.referredBy,
        source: 'eligibility_sweep'
      })));
      for (const result of results) {
        if (result.status === 'rejected') console.error('Pending referral reward retry failed:', result.reason?.message || result.reason);
      }
    }
  }

  const referrers = await User.find({ $or: [
    { referredBy: { $ne: null } },
    { invitedCount: { $gt: 0 } },
    { activeInvitedCount: { $gt: 0 } }
  ] }).select('_id invitedCount activeInvitedCount activeReferralIds').lean();
  const referrerOps = [];

  for (const referrer of referrers) {
    const actualInvitedCount = invitedCountByReferrer.get(String(referrer._id)) || 0;
    const actualActiveIds = eligibleByReferrer.get(String(referrer._id)) || [];
    const storedIds = (referrer.activeReferralIds || []).map(String).sort();
    const actualIds = actualActiveIds.map(String).sort();
    const changed = actualInvitedCount !== referrer.invitedCount
      || actualActiveIds.length !== referrer.activeInvitedCount
      || storedIds.length !== actualIds.length
      || storedIds.some((id, index) => id !== actualIds[index]);
    if (changed) {
      referrerOps.push({
        updateOne: {
          filter: { _id: referrer._id },
          update: {
            $set: {
              invitedCount: actualInvitedCount,
              activeInvitedCount: actualActiveIds.length,
              activeReferralIds: actualActiveIds
            }
          }
        }
      });
    }
  }

  if (referrerOps.length > 0) {
    await User.bulkWrite(referrerOps);
    console.log(`🔄 Referral sweep updated ${referrerOps.length} referrer(s).`);
  }
}

module.exports = runReferralSweep;
