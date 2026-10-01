'use strict';

const User = require('../models/User');
const TaskCompletion = require('../models/TaskCompletion');
const PointsLedger = require('../models/PointsLedger');
const Withdrawal = require('../models/Withdrawal');
const { evaluateReferralEligibility } = require('./referralEligibility');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function countBurstReferrals(users) {
  const groups = new Map();
  for (const user of users) {
    const key = String(user.referredBy || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(new Date(user.createdAt).getTime());
  }
  const burstByUser = new Map();
  for (const times of groups.values()) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] > HOUR_MS) start += 1;
      const burst = end - start + 1;
      for (let i = start; i <= end; i += 1) burstByUser.set(times[i], Math.max(burstByUser.get(times[i]) || 0, burst));
    }
  }
  return burstByUser;
}

function classifyReferralUser({ user, completion, reward, withdrawal, sharedIpCount = 0, burstCount = 0, now = new Date() }) {
  const completions = Array.from({ length: completion.count || 0 }, (_, index) => ({
    status: 'approved',
    createdAt: completion.days?.length ? completion.days[index % completion.days.length] : user.createdAt
  }));
  const eligibility = evaluateReferralEligibility(user, completions, now);
  const ageMs = Math.max(0, now.getTime() - new Date(user.createdAt).getTime());
  let score = 0;
  const flags = [];

  if (user.referralRiskBlocked) { score += 60; flags.push('RISK_BLOCKED'); }
  else if (Number(user.referralRiskScore || 0) >= 50) { score += 40; flags.push('HIGH_RISK_SCORE'); }
  else if (Number(user.referralRiskScore || 0) >= 25) { score += 20; flags.push('ELEVATED_RISK_SCORE'); }
  if (completion.count < 3) { score += 15; flags.push('FEWER_THAN_3_APPROVED_TASKS'); }
  if ((completion.days || []).length < 2) { score += 15; flags.push('FEWER_THAN_2_ACTIVE_DAYS'); }
  if (ageMs < 7 * DAY_MS) { score += 15; flags.push('ACCOUNT_YOUNGER_THAN_7_DAYS'); }
  if (sharedIpCount >= 3) { score += 25; flags.push('SHARED_NETWORK_HASH'); }
  if (burstCount >= 5) { score += 20; flags.push('REFERRAL_BURST'); }
  if (withdrawal.count > 0 && !eligibility.eligible) { score += 20; flags.push('WITHDRAWAL_BEFORE_ELIGIBILITY'); }
  if (reward.amount > 0 && !eligibility.eligible) { score += 15; flags.push('REWARD_BEFORE_ELIGIBILITY'); }
  if (completion.count === 0) { score += 10; flags.push('NO_APPROVED_ACTIVITY'); }

  const status = score >= 60 ? 'high' : score >= 30 ? 'review' : 'low';
  return {
    userId: user._id,
    telegramId: user.telegramId,
    name: user.firstName || user.username || user.telegramId,
    referrerId: user.referredBy,
    status,
    score,
    flags,
    eligibility: {
      status: eligibility.status,
      approvedTaskCount: completion.count || 0,
      activeDayCount: (completion.days || []).length,
      waitDaysRemaining: eligibility.waitDaysRemaining,
      reasons: eligibility.reasons
    },
    referralReward: { amount: reward.amount || 0, count: reward.count || 0 },
    withdrawals: { count: withdrawal.count || 0, paid: withdrawal.paid || 0, pending: withdrawal.pending || 0, totalGram: withdrawal.totalGram || 0 },
    signals: { referralRiskScore: Number(user.referralRiskScore || 0), sharedIpCount, burstCount },
    auditedAt: now
  };
}

async function buildReferralAudit({ userId = null, limit = 500, now = new Date() } = {}) {
  const filter = { referredBy: { $ne: null } };
  if (userId) filter._id = userId;
  const users = await User.find(filter)
    .select('_id telegramId firstName username referredBy createdAt referralRiskScore referralRiskBlocked referralEligibilityStatus referralEligibleAt signupIpHash')
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 5000))
    .lean();
  if (!users.length) return { auditedAt: now, total: 0, summary: { high: 0, review: 0, low: 0 }, users: [] };

  const ids = users.map(user => user._id);
  const [completionRows, rewardRows, withdrawalRows] = await Promise.all([
    TaskCompletion.aggregate([
      { $match: { user: { $in: ids }, status: 'approved' } },
      { $group: { _id: '$user', count: { $sum: 1 }, days: { $addToSet: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'UTC' } } } } }
    ]),
    PointsLedger.find({ type: 'referral_bonus', sourceId: /^referral-bonus:/, amount: { $gt: 0 } })
      .select('sourceId amount')
      .lean(),
    Withdrawal.aggregate([
      { $match: { user: { $in: ids } } },
      { $group: { _id: '$user', count: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } }, pending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'approved', 'processing']] }, 1, 0] } }, totalGram: { $sum: '$cryptoAmount' } } }
    ])
  ]);
  const completionMap = new Map(completionRows.map(row => [String(row._id), row]));
  const invitedIdSet = new Set(ids.map(String));
  const rewardMap = new Map();
  for (const row of rewardRows) {
    const invitedId = String(row.sourceId || '').replace(/^referral-bonus:/, '');
    if (!invitedIdSet.has(invitedId)) continue;
    const current = rewardMap.get(invitedId) || { amount: 0, count: 0 };
    current.amount += Number(row.amount || 0);
    current.count += 1;
    rewardMap.set(invitedId, current);
  }
  const withdrawalMap = new Map(withdrawalRows.map(row => [String(row._id), row]));
  const ipCounts = new Map();
  for (const user of users) if (user.signupIpHash) ipCounts.set(user.signupIpHash, (ipCounts.get(user.signupIpHash) || 0) + 1);
  const burstByUser = countBurstReferrals(users);
  const records = users.map(user => {
    const completion = completionMap.get(String(user._id)) || { count: 0, days: [] };
    const reward = rewardMap.get(String(user._id)) || { amount: 0, count: 0 };
    const withdrawal = withdrawalMap.get(String(user._id)) || { count: 0, paid: 0, pending: 0, totalGram: 0 };
    return classifyReferralUser({
      user,
      completion,
      reward,
      withdrawal,
      sharedIpCount: user.signupIpHash ? ipCounts.get(user.signupIpHash) || 0 : 0,
      burstCount: burstByUser.get(new Date(user.createdAt).getTime()) || 0,
      now
    });
  });
  const summary = records.reduce((result, record) => { result[record.status] += 1; return result; }, { high: 0, review: 0, low: 0 });
  return { auditedAt: now, total: records.length, summary, users: records };
}

async function persistReferralAudit(report) {
  if (!report?.users?.length) return report;
  await User.bulkWrite(report.users.map(record => ({
    updateOne: {
      filter: { _id: record.userId },
      update: { $set: { referralAuditStatus: record.status, referralAuditScore: record.score, referralAuditFlags: record.flags, referralAuditedAt: record.auditedAt } }
    }
  })));
  return report;
}

module.exports = { buildReferralAudit, classifyReferralUser, persistReferralAudit };
