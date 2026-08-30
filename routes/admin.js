const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');

// همه‌ی مسیرهای ادمین باید هدر x-admin-secret برابر با ADMIN_SECRET داشته باشند
function checkAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'دسترسی غیرمجاز' });
  }
  next();
}

router.use(checkAdmin);

// POST /api/admin/tasks   body: { title, description, link, pointsReward, verifyChannel }
router.post('/tasks', async (req, res) => {
  const { title, description, link, pointsReward, verifyChannel } = req.body;
  if (!title || !pointsReward) return res.status(400).json({ error: 'عنوان و پوینت الزامی است' });

  const task = await Task.create({ title, description, link, pointsReward, verifyChannel });
  res.json({ task });
});

// GET /api/admin/tasks  - لیست همه تسک‌ها
router.get('/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json({ tasks });
});

// PATCH /api/admin/tasks/:id  body: { active: false }  برای غیرفعال کردن تسک
router.patch('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ task });
});

// GET /api/admin/withdrawals?status=pending
router.get('/withdrawals', async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const withdrawals = await Withdrawal.find(filter).sort({ createdAt: -1 });
  res.json({ withdrawals });
});

// POST /api/admin/withdrawals/:id/approve
router.post('/withdrawals/:id/approve', async (req, res) => {
  const w = await Withdrawal.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', processedAt: new Date() },
    { new: true }
  );
  res.json({ withdrawal: w });
});

// POST /api/admin/withdrawals/:id/reject
router.post('/withdrawals/:id/reject', async (req, res) => {
  const w = await Withdrawal.findByIdAndUpdate(
    req.params.id,
    { status: 'rejected', processedAt: new Date() },
    { new: true }
  );
  // اگر رد شد، پوینت‌ها را به کاربر برگردان
  if (w) {
    const User = require('../models/User');
    await User.findOneAndUpdate({ telegramId: w.userId }, { $inc: { points: w.pointsAmount } });
  }
  res.json({ withdrawal: w });
});

module.exports = router;