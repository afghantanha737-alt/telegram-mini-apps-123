'use strict';
const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Settings = require('../models/Settings');

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
  }
  next();
}

router.use(requireAdmin);

router.get('/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json({ success: true, tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, description, type, url, reward, requiresReview } = req.body || {};
  if (!title || !reward) {
    return res.status(400).json({ success: false, message: 'عنوان و مقدار پاداش الزامی است.' });
  }
  const task = await Task.create({ title, description, type, url, reward, requiresReview });
  res.json({ success: true, task });
});

router.put('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!task) return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
  res.json({ success: true, task });
});

router.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.get('/withdrawals', async (req, res) => {
  const status = req.query.status;
  const filter = status ? { status } : {};
  const list = await Withdrawal.find(filter)
    .populate('user', 'firstName username telegramId')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, withdrawals: list });
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  const w = await Withdrawal.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', adminNote: (req.body && req.body.note) || '' },
    { new: true }
  );
  if (!w) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });
  res.json({ success: true, withdrawal: w });
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);
  if (!withdrawal) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  if (withdrawal.status === 'pending') {
    await User.findByIdAndUpdate(withdrawal.user, { $inc: { points: withdrawal.pointsSpent } });
  }

  withdrawal.status = 'rejected';
  withdrawal.adminNote = (req.body && req.body.note) || '';
  await withdrawal.save();

  res.json({ success: true, withdrawal });
});

router.get('/users', async (req, res) => {
  const users = await User.find().select('-__v').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, users });
});

router.post('/users/:id/ban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: true }, { new: true });
  res.json({ success: true, user });
});

router.post('/users/:id/unban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: false }, { new: true });
  res.json({ success: true, user });
});

router.get('/settings', async (req, res) => {
  const settings = await Settings.getGlobal();
  res.json({ success: true, settings });
});

router.put('/settings', async (req, res) => {
  const settings = await Settings.getGlobal();
  Object.assign(settings, req.body || {});
  await settings.save();
  res.json({ success: true, settings });
});

module.exports = router;