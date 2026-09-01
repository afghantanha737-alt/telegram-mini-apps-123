const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');
const checkAndAwardReferral = require('../utils/referralCheck');

function generateCaptcha() {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  return { question: `${a} + ${b}`, answer: a + b };
}

// POST /api/auth/enter
// body: { initData, startParam }  (startParam = آیدی عددی دعوت‌کننده، اگر وجود داشته باشد)
router.post('/enter', async (req, res) => {
  try {
    const { initData, startParam } = req.body;
    const botToken = process.env.BOT_TOKEN;

    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser) {
      return res.status(401).json({ error: 'تایید هویت تلگرام ناموفق بود' });
    }

    let user = await User.findOne({ telegramId: String(tgUser.id) });

    if (!user) {
      const captcha = generateCaptcha();
      user = await User.create({
        telegramId: String(tgUser.id),
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        referralCode: String(tgUser.id),
        referredBy: startParam || null,
        captchaExpected: captcha.answer
      });
      return res.json({ user, captchaPassed: false, captchaQuestion: captcha.question });
    }

    // کاربر قبلا وجود داشته: اگه هنوز کپچا رو حل نکرده، دوباره سوال بده
    if (!user.captchaPassed) {
      const captcha = generateCaptcha();
      user.captchaExpected = captcha.answer;
      await user.save();
      return res.json({ user, captchaPassed: false, captchaQuestion: captcha.question });
    }

    // اگه کپچا رو رد کرده، ببین شرایط پرداخت پاداش رفرال (اگه رفرالی داشته) فراهم شده یا نه
    await checkAndAwardReferral(user);

    res.json({ user, captchaPassed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// POST /api/auth/captcha   body: { initData, answer }
router.post('/captcha', async (req, res) => {
  try {
    const { initData, answer } = req.body;
    const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
    if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

    const user = await User.findOne({ telegramId: String(tgUser.id) });
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

    if (Number(answer) === user.captchaExpected) {
      user.captchaPassed = true;
      user.captchaExpected = null;
      await user.save();
      return res.json({ success: true });
    }

    // جواب اشتباه بود، یه سوال جدید بساز
    const captcha = generateCaptcha();
    user.captchaExpected = captcha.answer;
    await user.save();
    res.json({ success: false, captchaQuestion: captcha.question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;