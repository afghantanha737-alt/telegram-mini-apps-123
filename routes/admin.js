const express = require('express');
const router = express.Router();

const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

/* =========================================================
   ADMIN AUTH
========================================================= */

function checkAdmin(req, res, next) {
  const configuredSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];

  if (!configuredSecret) {
    console.error('ADMIN_SECRET is not configured.');

    return res.status(500).json({
      success: false,
      error: 'Admin authentication is not configured'
    });
  }

  if (
    typeof providedSecret !== 'string' ||
    providedSecret.length === 0 ||
    providedSecret !== configuredSecret
  ) {
    return res.status(403).json({
      success: false,
      error: 'دسترسی غیرمجاز'
    });
  }

  next();
}

router.use(checkAdmin);

/* =========================================================
   HELPERS
========================================================= */

function isValidObjectId(id) {
  return /^[a-f\d]{24}$/i.test(String(id || ''));
}

function positiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function integerNumber(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0
    ? number
    : null;
}

/* =========================================================
   TASKS
========================================================= */

/**
 * POST /api/admin/tasks
 *
 * body:
 * {
 *   title,
 *   description,
 *   link,
 *   pointsReward,
 *   verifyChannel
 * }
 */
router.post('/tasks', async (req, res) => {
  try {
    const {
      title,
      description,
      link,
      pointsReward,
      verifyChannel
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    const cleanDescription = String(description || '').trim();
    const cleanLink = String(link || '').trim();
    const reward = positiveNumber(pointsReward);

    if (!cleanTitle || !reward) {
      return res.status(400).json({
        success: false,
        error: 'عنوان و پوینت الزامی است'
      });
    }

    if (cleanTitle.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'عنوان بیش از حد طولانی است'
      });
    }

    if (cleanDescription.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'توضیحات بیش از حد طولانی است'
      });
    }

    if (cleanLink.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'لینک بیش از حد طولانی است'
      });
    }

    const task = await Task.create({
      title: cleanTitle,
      description: cleanDescription,
      link: cleanLink,
      pointsReward: reward,
      verifyChannel: Boolean(verifyChannel)
    });

    return res.status(201).json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Admin create task error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در ایجاد تسک'
    });
  }
});

/**
 * GET /api/admin/tasks
 */
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await Task.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Admin get tasks error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت تسک‌ها'
    });
  }
});

/**
 * PATCH /api/admin/tasks/:id
 *
 * برای compatibility، body فعلی admin panel حفظ شده است.
 * فقط فیلدهای شناخته‌شده اجازه تغییر دارند.
 */
router.patch('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: 'شناسه تسک نامعتبر است'
      });
    }

    const allowedFields = [
      'title',
      'description',
      'link',
      'pointsReward',
      'verifyChannel',
      'active',
      'order',
      'icon',
      'category',
      'type',
      'target',
      'channelUsername',
      'channelId',
      'requireMembership'
    ];

    const update = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        update[field] = req.body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'هیچ فیلد قابل تغییری ارسال نشده است'
      });
    }

    if (update.title !== undefined) {
      update.title = String(update.title).trim();

      if (!update.title) {
        return res.status(400).json({
          success: false,
          error: 'عنوان نمی‌تواند خالی باشد'
        });
      }
    }

    if (update.description !== undefined) {
      update.description = String(update.description).trim();
    }

    if (update.link !== undefined) {
      update.link = String(update.link).trim();
    }

    if (update.pointsReward !== undefined) {
      const reward = positiveNumber(update.pointsReward);

      if (!reward) {
        return res.status(400).json({
          success: false,
          error: 'مقدار پاداش نامعتبر است'
        });
      }

      update.pointsReward = reward;
    }

    if (update.active !== undefined) {
      update.active = Boolean(update.active);
    }

    const task = await Task.findByIdAndUpdate(
      id,
      { $set: update },
      {
        new: true,
        runValidators: true
      }
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'تسک پیدا نشد'
      });
    }

    return res.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Admin update task error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در بروزرسانی تسک'
    });
  }
});

/* =========================================================
   WITHDRAWALS
========================================================= */

/**
 * GET /api/admin/withdrawals?status=pending
 */
router.get('/withdrawals', async (req, res) => {
  try {
    const allowedStatuses = [
      'pending',
      'approved',
      'rejected'
    ];

    const requestedStatus = String(req.query.status || '').trim();

    const filter =
      requestedStatus && allowedStatuses.includes(requestedStatus)
        ? { status: requestedStatus }
        : {};

    if (requestedStatus && !allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        error: 'وضعیت برداشت نامعتبر است'
      });
    }

    const withdrawals = await Withdrawal.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      withdrawals
    });
  } catch (error) {
    console.error('Admin get withdrawals error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت برداشت‌ها'
    });
  }
});

/**
 * POST /api/admin/withdrawals/:id/approve
 */
router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: 'شناسه برداشت نامعتبر است'
      });
    }

    /*
     * فقط pending قابل approve شدن است.
     *
     * این شرط جلوی approve دوباره یک withdrawal
     * که قبلاً rejected/approved شده را می‌گیرد.
     */
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        _id: id,
        status: 'pending'
      },
      {
        $set: {
          status: 'approved',
          processedAt: new Date()
        }
      },
      {
        new: true
      }
    );

    if (!withdrawal) {
      const existing = await Withdrawal.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'برداشت پیدا نشد'
        });
      }

      return res.status(409).json({
        success: false,
        error: 'این برداشت قبلاً پردازش شده است',
        withdrawal: existing
      });
    }

    return res.json({
      success: true,
      withdrawal
    });
  } catch (error) {
    console.error('Admin approve withdrawal error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در تأیید برداشت'
    });
  }
});

/**
 * POST /api/admin/withdrawals/:id/reject
 */
router.post('/withdrawals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: 'شناسه برداشت نامعتبر است'
      });
    }

    /*
     * ابتدا فقط یک withdrawal pending را به rejected تغییر می‌دهیم.
     *
     * شرط status=pending باعث می‌شود اگر دو درخواست همزمان
     * برای reject ارسال شد، refund دوبار انجام نشود.
     */
    const withdrawal = await Withdrawal.findOneAndUpdate(
      {
        _id: id,
        status: 'pending'
      },
      {
        $set: {
          status: 'rejected',
          processedAt: new Date(),
          adminNote: String(req.body?.note || '').trim().slice(0, 1000)
        }
      },
      {
        new: true
      }
    );

    if (!withdrawal) {
      const existing = await Withdrawal.findById(id);

      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'برداشت پیدا نشد'
        });
      }

      return res.status(409).json({
        success: false,
        error: 'این برداشت قبلاً پردازش شده است',
        withdrawal: existing
      });
    }

    /*
     * Refund
     *
     * در مدل Withdrawal مقدار اصلی برداشت در فیلد amount
     * ذخیره شده است.
     */
    const refundAmount = Number(withdrawal.amount);

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      console.error(
        'Invalid withdrawal amount during refund:',
        withdrawal._id
      );

      return res.status(500).json({
        success: false,
        error: 'مقدار برداشت نامعتبر است و Refund انجام نشد',
        withdrawal
      });
    }

    const user = await User.findOneAndUpdate(
      {
        telegramId: String(withdrawal.userId)
      },
      {
        $inc: {
          points: refundAmount
        }
      },
      {
        new: true
      }
    );

    if (!user) {
      /*
       * Withdrawal قبلاً rejected شده اما کاربر پیدا نشده.
       * این حالت نیازمند بررسی دستی است.
       */
      console.error(
        'Refund failed: user not found for withdrawal:',
        withdrawal._id
      );

      return res.status(500).json({
        success: false,
        error: 'کاربر برای بازگرداندن پوینت پیدا نشد',
        withdrawal
      });
    }

    return res.json({
      success: true,
      withdrawal,
      refundedPoints: refundAmount,
      userPoints: user.points
    });
  } catch (error) {
    console.error('Admin reject withdrawal error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در رد برداشت'
    });
  }
});

/* =========================================================
   USERS
========================================================= */

/**
 * GET /api/admin/users
 */
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .select(
        'telegramId firstName lastName username points referralCode referredBy invitedCount createdAt isBanned'
      )
      .lean();

    return res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Admin get users error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت کاربران'
    });
  }
});

/* =========================================================
   STATS
========================================================= */

/**
 * GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      totalPointsAgg,
      pendingCount,
      activeTasks,
      totalTasks,
      bannedUsers,
      totalWithdrawals
    ] = await Promise.all([
      User.countDocuments(),

      User.aggregate([
        {
          $group: {
            _id: null,
            sum: {
              $sum: {
                $ifNull: ['$points', 0]
              }
            }
          }
        }
      ]),

      Withdrawal.countDocuments({
        status: 'pending'
      }),

      Task.countDocuments({
        active: true
      }),

      Task.countDocuments(),

      User.countDocuments({
        isBanned: true
      }),

      Withdrawal.countDocuments()
    ]);

    return res.json({
      success: true,
      totalUsers,
      totalPointsInCirculation:
        Number(totalPointsAgg[0]?.sum || 0),
      pendingWithdrawals: pendingCount,
      activeTasks,
      totalTasks,
      bannedUsers,
      totalWithdrawals
    });
  } catch (error) {
    console.error('Admin stats error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت آمار'
    });
  }
});

/* =========================================================
   BROADCAST
========================================================= */

/**
 * POST /api/admin/broadcast
 *
 * body:
 * {
 *   message: "..."
 * }
 */
router.post('/broadcast', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'متن پیام الزامی است'
      });
    }

    if (message.length > 4096) {
      return res.status(400).json({
        success: false,
        error: 'متن پیام بیش از حد طولانی است'
      });
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        success: false,
        error: 'BOT_TOKEN تنظیم نشده است'
      });
    }

    const users = await User.find({
      telegramId: {
        $exists: true,
        $ne: null
      }
    })
      .select('telegramId')
      .lean();

    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: message,
              parse_mode: 'HTML'
            })
          }
        );

        const data = await response.json();

        if (data?.ok) {
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
      }

      /*
       * Telegram rate limiting.
       * کمی فاصله بین درخواست‌ها قرار می‌دهیم.
       */
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return res.json({
      success: true,
      total: users.length,
      sent: success,
      successCount: success,
      failed
    });
  } catch (error) {
    console.error('Admin broadcast error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در ارسال پیام همگانی'
    });
  }
});

/* =========================================================
   GRANT SPINS
========================================================= */

/**
 * POST /api/admin/grant-spins
 *
 * body:
 * {
 *   telegramId,
 *   amount
 * }
 */
router.post('/grant-spins', async (req, res) => {
  try {
    const telegramId = String(req.body?.telegramId || '').trim();
    const amount = integerNumber(req.body?.amount);

    if (!telegramId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'آیدی و مقدار الزامی است'
      });
    }

    if (amount > 1000) {
      return res.status(400).json({
        success: false,
        error: 'حداکثر مقدار اسپین 1000 است'
      });
    }

    const user = await User.findOneAndUpdate(
      {
        telegramId
      },
      {
        $inc: {
          spinChances: amount
        }
      },
      {
        new: true
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'کاربر پیدا نشد'
      });
    }

    return res.json({
      success: true,
      telegramId: user.telegramId,
      spinChances: user.spinChances
    });
  } catch (error) {
    console.error('Admin grant spins error:', error);

    return res.status(500).json({
      success: false,
      error: 'خطا در افزودن اسپین'
    });
  }
});

/* =========================================================
   EXPORT
========================================================= */

module.exports = router;