const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');

// GET /api/tasks?initData=...
// لیست تسک‌های فعال به همراه وضعیت انجام‌شده/نشده برای این کاربر
router.get('/', async (req, res) => {
  try {
    const { initData } = req.query;
    const botToken = process.env.BOT_TOKEN;
    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

    const tasks = await Task.find({ active: true }).sort({ createdAt: -1 });
    const completions = await TaskCompletion.find({ userId: String(tgUser.id) });
    const completedIds = new Set(completions.map(c => String(c.taskId)));

    const result = tasks.map(t => ({
      _id: t._id,
      title: t.title,
      description: t.description,
      link: t.link,
      pointsReward: t.pointsReward,
      completed: completedIds.has(String(t._id))
    }));

    res.json({ tasks: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

// بررسی می‌کنه کاربر واقعا عضو کانال/گروه مشخص‌شده هست یا نه
// ربات باید ادمین همون کانال باشه تا این بررسی جواب بده
async function checkChannelMembership(channelUsername, telegramUserId) {
  const botToken = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channelUsername)}&user_id=${telegramUserId}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) return false;
    const status = data.result.status; // creator, administrator, member, restricted, left, kicked
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (err) {
    console.error('خطا در بررسی عضویت:', err.message);
    return false;
  }
}

// POST /api/tasks/:id/complete
// body: { initData }
router.post('/:id/complete', async (req, res) => {
  try {
    const { initData } = req.body;
    const botToken = process.env.BOT_TOKEN;
    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

    const task = await Task.findById(req.params.id);
    if (!task || !task.active) return res.status(404).json({ error: 'تسک پیدا نشد' });

    const already = await TaskCompletion.findOne({ userId: String(tgUser.id), taskId: task._id });
    if (already) return res.status(400).json({ error: 'این تسک قبلا انجام شده' });

    // اگه تسک نیاز به بررسی عضویت داشت، اول عضویت واقعی رو چک کن
    if (task.verifyChannel) {
      const isMember = await checkChannelMembership(task.verifyChannel, tgUser.id);
      if (!isMember) {
        return res.status(400).json({ error: 'هنوز عضو کانال/گروه نشدی، اول عضو شو بعد دوباره امتحان کن' });
      }
    }

    await TaskCompletion.create({
      userId: String(tgUser.id),
      taskId: task._id,
      pointsAwarded: task.pointsReward
    });

    const user = await User.findOneAndUpdate(
      { telegramId: String(tgUser.id) },
      { $inc: { points: task.pointsReward } },
      { new: true }
    );

    res.json({ success: true, points: user.points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;