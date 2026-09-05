const express = require('express');
const router = express.Router();

const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');


// ============================================================
// Helpers
// ============================================================

function getInitData(req) {
  return req.body?.initData || req.query?.initData || '';
}


async function authenticateUser(req) {
  const initData = getInitData(req);

  if (!initData) {
    const error = new Error(
      'اطلاعات Telegram ارسال نشده است.'
    );

    error.status = 401;
    throw error;
  }

  const telegramUser =
    verifyTelegramInitData(initData);

  if (!telegramUser || !telegramUser.id) {
    const error = new Error(
      'اطلاعات Telegram نامعتبر است.'
    );

    error.status = 401;
    throw error;
  }

  const user =
    await User.findOne({
      telegramId: String(telegramUser.id)
    });

  if (!user) {
    const error = new Error(
      'کاربر پیدا نشد.'
    );

    error.status = 404;
    throw error;
  }

  return {
    user,
    telegramUser
  };
}


// ============================================================
// GET /api/leaderboard/top
// ============================================================

router.get('/top', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    /*
     * فقط اطلاعات عمومی لازم برای Leaderboard
     * ارسال می‌شود.
     *
     * اطلاعات حساس User هرگز از API خارج نمی‌شود.
     */

    const topUsers =
      await User.find({})
        .sort({
          points: -1,
          createdAt: 1
        })
        .limit(10)
        .select(
          'telegramId firstName username points'
        )
        .lean();

    const leaderboard =
      topUsers.map((item, index) => ({
        rank: index + 1,

        telegramId:
          String(item.telegramId),

        firstName:
          item.firstName ||
          item.username ||
          'کاربر',

        username:
          item.username || '',

        points:
          Math.max(
            0,
            Number(item.points) || 0
          ),

        isMe:
          String(item.telegramId) ===
          String(user.telegramId)
      }));


    // --------------------------------------------------------
    // My rank
    // --------------------------------------------------------

    /*
     * تعداد کاربرانی که امتیازشان بیشتر از
     * کاربر فعلی است.
     *
     * در صورت مساوی بودن امتیاز، کاربری که
     * زودتر ثبت شده رتبه بالاتری دارد.
     */

    const myPoints =
      Math.max(
        0,
        Number(user.points) || 0
      );

    const usersAbove =
      await User.countDocuments({
        $or: [
          {
            points: {
              $gt: myPoints
            }
          },
          {
            points: myPoints,
            createdAt: {
              $lt: user.createdAt
            }
          }
        ]
      });

    const myRank =
      usersAbove + 1;


    res.json({
      success: true,

      leaderboard,

      myRank,

      myPoints
    });

  } catch (error) {
    console.error(
      'GET /api/leaderboard/top:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در دریافت رتبه‌بندی.'
    });
  }
});


// ============================================================
// GET /api/leaderboard/me
// ============================================================

router.get('/me', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    const myPoints =
      Math.max(
        0,
        Number(user.points) || 0
      );

    const usersAbove =
      await User.countDocuments({
        $or: [
          {
            points: {
              $gt: myPoints
            }
          },
          {
            points: myPoints,
            createdAt: {
              $lt: user.createdAt
            }
          }
        ]
      });

    const myRank =
      usersAbove + 1;

    res.json({
      success: true,

      rank: myRank,

      points: myPoints,

      firstName:
        user.firstName ||
        'کاربر'
    });

  } catch (error) {
    console.error(
      'GET /api/leaderboard/me:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در دریافت رتبه شما.'
    });
  }
});


// ============================================================
// Error Handler
// ============================================================

router.use(
  (error, req, res, next) => {
    console.error(
      'Leaderboard router error:',
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      message:
        'خطای داخلی سرور.'
    });
  }
);


module.exports = router;