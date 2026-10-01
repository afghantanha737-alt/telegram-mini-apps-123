'use strict';

function numericAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function calculateReferralEarningsTotal({ initialInviteRewardPoints = 0, milestoneRewardPoints = 0, teamCommissionPoints = 0 } = {}) {
  return numericAmount(initialInviteRewardPoints) + numericAmount(milestoneRewardPoints) + numericAmount(teamCommissionPoints);
}

function buildReferralViewData({
  rates = [],
  descendants = [],
  earningsByLevel = [],
  earningsByFriend = [],
  rootUserId = null
} = {}) {
  const safeRates = Array.isArray(rates) ? rates.map(value => {
    const rate = Number(value);
    return Number.isFinite(rate) && rate >= 0 ? rate : 0;
  }) : [];
  const rootId = rootUserId == null ? '' : String(rootUserId);
  const friends = [];
  const friendsByLevel = new Map();
  const earnedByFriend = new Map();
  const earnedByLevel = new Map();

  for (const row of Array.isArray(earningsByFriend) ? earningsByFriend : []) {
    if (row?._id == null) continue;
    earnedByFriend.set(String(row._id), numericAmount(row.earnedPoints ?? row.total));
  }
  for (const row of Array.isArray(earningsByLevel) ? earningsByLevel : []) {
    const amount = numericAmount(row?.earnedPoints ?? row?.total);
    if (row?._id == null) {
      if (amount > 0) earnedByLevel.set('unassigned', (earnedByLevel.get('unassigned') || 0) + amount);
      continue;
    }
    const level = Number(row._id);
    if (!Number.isInteger(level) || level < 1) continue;
    earnedByLevel.set(String(level), (earnedByLevel.get(String(level)) || 0) + amount);
  }

  for (const user of Array.isArray(descendants) ? descendants : []) {
    const id = user?._id == null ? '' : String(user._id);
    if (id && rootId && id === rootId) continue;
    const depth = Number(user?.depth);
    const explicitLevel = Number(user?.level);
    const level = Number.isInteger(depth) && depth >= 0
      ? depth + 1
      : Number.isInteger(explicitLevel) && explicitLevel >= 1 ? explicitLevel : 0;
    if (!level) continue;

    friendsByLevel.set(level, (friendsByLevel.get(level) || 0) + 1);
    friends.push({
      firstName: String(user.firstName || ''),
      username: String(user.username || ''),
      level,
      createdAt: user.createdAt || null,
      earnedPoints: id ? (earnedByFriend.get(id) || 0) : 0
    });
  }

  const numericLevels = [
    ...safeRates.map((_, index) => index + 1),
    ...Array.from(friendsByLevel.keys()),
    ...Array.from(earnedByLevel.keys()).filter(key => key !== 'unassigned').map(Number)
  ].filter(level => Number.isInteger(level) && level > 0);
  const maxLevel = numericLevels.length ? Math.max(...numericLevels) : 0;
  const levelCounts = {};
  const earningsRows = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    const friendCount = friendsByLevel.get(level) || 0;
    const earnedPoints = earnedByLevel.get(String(level)) || 0;
    levelCounts[String(level)] = friendCount;
    earningsRows.push({
      level,
      friends: friendCount,
      commissionRatePercent: level <= safeRates.length ? safeRates[level - 1] : null,
      earnedPoints
    });
  }

  const unassignedPoints = earnedByLevel.get('unassigned') || 0;
  if (unassignedPoints > 0) {
    earningsRows.push({ level: null, friends: 0, commissionRatePercent: null, earnedPoints: unassignedPoints });
  }

  friends.sort((a, b) => {
    const dateDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    return Number.isFinite(dateDiff) && dateDiff ? dateDiff : a.level - b.level;
  });

  return {
    totalReferrals: friends.length,
    levelCounts,
    earningsByLevel: earningsRows,
    totalReferralCommissionPoints: earningsRows.reduce((sum, row) => sum + row.earnedPoints, 0),
    team: friends
  };
}

module.exports = { buildReferralViewData, calculateReferralEarningsTotal };
