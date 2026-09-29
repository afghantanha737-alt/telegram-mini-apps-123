'use strict';
const crypto = require('crypto');

function hashNetworkIdentifier(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  const secret = process.env.REFERRAL_RISK_SECRET || process.env.BOT_TOKEN || 'referral-risk-secret';
  return crypto.createHmac('sha256', secret).update(input).digest('hex');
}

function assessReferralRisk({ referrer, signupIpHash }) {
  const flags = [];
  let score = 0;
  if (referrer?.signupIpHash && signupIpHash && referrer.signupIpHash === signupIpHash) {
    flags.push('same_network_hash');
    score += 50;
  }
  if (referrer && referrer.isBanned) {
    flags.push('banned_referrer');
    score += 100;
  }
  return { score, flags, blocked: score >= 100 };
}

module.exports = { hashNetworkIdentifier, assessReferralRisk };
