'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { buildReferralAudit, persistReferralAudit } = require('../utils/referralAudit');

function hasFlag(name) {
  return process.argv.includes(name);
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const report = await buildReferralAudit({ userId: arg('--user-id'), limit: arg('--limit', 500) });
    if (hasFlag('--apply')) await persistReferralAudit(report);

    const output = {
      mode: hasFlag('--apply') ? 'classified_only' : 'dry_run',
      total: report.total,
      summary: report.summary,
      users: report.users
    };
    if (hasFlag('--json')) console.log(JSON.stringify(output, null, 2));
    else {
      console.log(`Referral Audit: ${output.mode}`);
      console.log(`Total=${report.total} | High=${report.summary.high} | Review=${report.summary.review} | Low=${report.summary.low}`);
      for (const user of report.users) {
        console.log(`${user.status.toUpperCase()} score=${user.score} user=${user.telegramId} reward=${user.referralReward.amount} flags=${user.flags.join(',') || 'none'}`);
      }
      if (!hasFlag('--apply')) console.log('Dry-run فقط بود؛ برای ذخیره دسته‌بندی‌ها آگاهانه --apply را اضافه کنید.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`Referral audit failed: ${error.message}`);
  process.exitCode = 1;
});
