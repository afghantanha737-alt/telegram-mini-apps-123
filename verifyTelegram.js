const crypto = require('crypto');

// این تابع initData ای که مینی‌اپ از تلگرام می‌گیرد را تایید می‌کند
// تا مطمئن شویم درخواست واقعا از طرف تلگرام و همان کاربر است
function verifyTelegramInitData(initData, botToken) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...urlParams.entries()].sort()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) {
    return null; // جعلی است
  }

  const userJson = urlParams.get('user');
  if (!userJson) return null;

  return JSON.parse(userJson); // { id, username, first_name, ... }
}

module.exports = verifyTelegramInitData;
