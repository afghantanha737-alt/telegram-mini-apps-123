'use strict';

/**
 * تسک‌های مرحله‌ای دعوت دوستان. شناسه‌ها عمداً ثابت‌اند تا claimها
 * بعد از دیپلوی‌های بعدی نیز قابل تشخیص و idempotent بمانند.
 */
const REFERRAL_REWARD_TASKS = Object.freeze([
  Object.freeze({ id: 'referral_10', requiredInvites: 10, rewardPoints: 100 }),
  Object.freeze({ id: 'referral_20', requiredInvites: 20, rewardPoints: 250 }),
  Object.freeze({ id: 'referral_50', requiredInvites: 50, rewardPoints: 1000 })
]);

function referralTaskId(value) {
  const id = String(value || '').trim();
  return REFERRAL_REWARD_TASKS.some(task => task.id === id) ? id : null;
}

function buildReferralTaskProgress(invitedCount, claims = []) {
  const count = Math.max(0, Number(invitedCount) || 0);
  const claimedIds = new Set((Array.isArray(claims) ? claims : []).map(claim => String(claim.taskId)));

  return REFERRAL_REWARD_TASKS.map(task => {
    const claimed = claimedIds.has(task.id);
    const remaining = Math.max(0, task.requiredInvites - count);
    return {
      ...task,
      invitedCount: count,
      remaining,
      unlocked: count >= task.requiredInvites,
      claimed,
      status: claimed ? 'claimed' : count >= task.requiredInvites ? 'claimable' : 'locked'
    };
  });
}

module.exports = { REFERRAL_REWARD_TASKS, referralTaskId, buildReferralTaskProgress };
