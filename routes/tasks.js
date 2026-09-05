const express = require('express');
const router = express.Router();

const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');

const verifyTelegramInitData =
  require('../utils/verifyTelegram');

const BOT_TOKEN = process.env.BOT_TOKEN;


// ============================================================
// Helpers
// ============================================================

function getInitData(req) {
  return req.body?.initData || req.query?.initData || '';
}


// ------------------------------------------------------------
// Telegram authentication
// Compatible with utils/verifyTelegram.js
// ------------------------------------------------------------

async function authenticateUser(req) {
  const initData = getInitData(req);

  if (!initData) {
    const error = new Error(
      'اطلاعات Telegram ارسال نشده است.'
    );

    error.status = 401;
    throw error;
  }

  const verification =
    verifyTelegramInitData(initData);

  if (
    !verification ||
    verification.valid !== true ||
    !verification.data
  ) {
    const error = new Error(
      verification?.error ||
      'اطلاعات Telegram نامعتبر است.'
    );

    error.status = 401;
    throw error;
  }

  const userRaw =
    verification.data.get('user');

  if (!userRaw) {
    const error = new Error(
      'اطلاعات کاربر Telegram وجود ندارد.'
    );

    error.status = 401;
    throw error;
  }

  let telegramUser;

  try {
    telegramUser = JSON.parse(userRaw);
  } catch (parseError) {
    const error = new Error(
      'اطلاعات کاربر Telegram قابل پردازش نیست.'
    );

    error.status = 401;
    throw error;
  }

  if (!telegramUser?.id) {
    const error = new Error(
      'شناسه کاربر Telegram نامعتبر است.'
    );

    error.status = 401;
    throw error;
  }

  const user = await User.findOne({
    telegramId: String(telegramUser.id)
  });

  if (!user) {
    const error = new Error(
      'کاربر پیدا نشد.'
    );

    error.status = 404;
    throw error;
  }

  // آخرین فعالیت کاربر
  User.updateOne(
    { _id: user._id },
    {
      $set: {
        lastSeenAt: new Date()
      }
    }
  ).catch((error) => {
    console.error(
      'Failed to update lastSeenAt:',
      error.message
    );
  });

  return {
    user,
    telegramUser,
    verification
  };
}


// ------------------------------------------------------------
// Telegram API
// ------------------------------------------------------------

async function telegramRequest(
  method,
  payload
) {
  if (!BOT_TOKEN) {
    throw new Error(
      'BOT_TOKEN تنظیم نشده است.'
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.description ||
      `Telegram API error: ${response.status}`
    );
  }

  return data.result;
}


// ============================================================
// GET /api/tasks
// ============================================================

router.get('/', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    const tasks =
      await Task.find({
        active: true
      })
        .sort({
          order: 1,
          createdAt: 1
        })
        .lean();

    const completions =
      await TaskCompletion.find({
        userId: user._id
      })
        .select(
          'taskId completedAt'
        )
        .lean();

    const completedMap =
      new Map(
        completions.map(item => [
          String(item.taskId),
          item
        ])
      );

    const result =
      tasks.map(task => {
        const completion =
          completedMap.get(
            String(task._id)
          );

        return {
          ...task,

          id: String(task._id),

          completed:
            Boolean(completion),

          completedAt:
            completion?.completedAt ||
            null
        };
      });

    res.json({
      success: true,

      tasks: result,

      completions:
        completions.map(item => ({
          taskId: String(item.taskId),

          completedAt:
            item.completedAt ||
            null
        }))
    });

  } catch (error) {
    console.error(
      'GET /api/tasks:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,

      message:
        error.message ||
        'خطا در دریافت تسک‌ها.'
    });
  }
});


// ============================================================
// POST /api/tasks/:id/complete
// ============================================================

router.post(
  '/:id/complete',
  async (req, res) => {
    let completion = null;

    try {
      const taskId =
        String(req.params.id || '').trim();

      if (!taskId) {
        return res.status(400).json({
          success: false,

          message:
            'شناسه تسک ارسال نشده است.'
        });
      }

      const {
        user,
        telegramUser
      } = await authenticateUser(req);

      // ------------------------------------------------------
      // Find active task
      // ------------------------------------------------------

      const task =
        await Task.findOne({
          _id: taskId,
          active: true
        });

      if (!task) {
        return res.status(404).json({
          success: false,

          message:
            'این تسک وجود ندارد یا غیرفعال شده است.'
        });
      }

      // ------------------------------------------------------
      // Fast duplicate check
      // ------------------------------------------------------

      const alreadyCompleted =
        await TaskCompletion.findOne({
          userId: user._id,
          taskId: task._id
        });

      if (alreadyCompleted) {
        return res.status(409).json({
          success: false,

          alreadyCompleted: true,

          message:
            'این تسک را قبلاً انجام داده‌اید.'
        });
      }


      // ------------------------------------------------------
      // Channel membership verification
      // ------------------------------------------------------

      if (
        task.type === 'channel' ||
        task.requireMembership === true
      ) {
        const channel =
          task.channelUsername ||
          task.channelId ||
          task.target;

        if (!channel) {
          return res.status(400).json({
            success: false,

            message:
              'تنظیمات کانال این تسک کامل نیست.'
          });
        }

        let member;

        try {
          member =
            await telegramRequest(
              'getChatMember',
              {
                chat_id: channel,

                user_id:
                  telegramUser.id
              }
            );

        } catch (telegramError) {
          console.error(
            'Channel membership check failed:',
            telegramError.message
          );

          return res.status(503).json({
            success: false,

            message:
              'فعلاً امکان بررسی عضویت در کانال وجود ندارد. کمی بعد دوباره تلاش کنید.'
          });
        }

        const validStatuses = [
          'creator',
          'administrator',
          'member'
        ];

        if (
          !member ||
          !validStatuses.includes(
            member.status
          )
        ) {
          return res.status(403).json({
            success: false,

            message:
              'برای دریافت پاداش، ابتدا باید در کانال عضو شوید.'
          });
        }
      }


      // ------------------------------------------------------
      // Validate reward
      // ------------------------------------------------------

      const reward =
        Number(task.reward) || 0;

      if (reward <= 0) {
        return res.status(400).json({
          success: false,

          message:
            'پاداش این تسک تنظیم نشده است.'
        });
      }


      // ------------------------------------------------------
      // Create completion
      // Unique index prevents duplicate completion.
      // ------------------------------------------------------

      try {
        completion =
          await TaskCompletion.create({
            userId: user._id,

            taskId: task._id,

            completedAt: new Date()
          });

      } catch (createError) {
        if (
          createError?.code === 11000
        ) {
          return res.status(409).json({
            success: false,

            alreadyCompleted: true,

            message:
              'این تسک را قبلاً انجام داده‌اید.'
          });
        }

        throw createError;
      }


      // ------------------------------------------------------
      // Reward user
      // ------------------------------------------------------

      const updatedUser =
        await User.findOneAndUpdate(
          {
            _id: user._id
          },

          {
            $inc: {
              points: reward
            },

            $set: {
              lastSeenAt: new Date()
            }
          },

          {
            new: true
          }
        );

      if (!updatedUser) {
        await TaskCompletion.deleteOne({
          _id: completion._id
        });

        completion = null;

        return res.status(404).json({
          success: false,

          message:
            'کاربر پیدا نشد.'
        });
      }


      // ------------------------------------------------------
      // Response
      // ------------------------------------------------------

      return res.json({
        success: true,

        message:
          '🎉 تسک با موفقیت انجام شد و پاداش دریافت کردی.',

        reward,

        points:
          Number(updatedUser.points) || 0,

        taskId:
          String(task._id),

        completedAt:
          completion.completedAt
      });

    } catch (error) {
      console.error(
        'POST /api/tasks/:id/complete:',
        error
      );

      /*
       * اگر completion ساخته شده ولی عملیات reward
       * شکست خورده، تلاش می‌کنیم رکورد completion
       * را حذف کنیم.
       */
      if (completion?._id) {
        try {
          await TaskCompletion.deleteOne({
            _id: completion._id
          });
        } catch (cleanupError) {
          console.error(
            'Task completion cleanup failed:',
            cleanupError
          );
        }
      }

      if (
        error?.name === 'CastError'
      ) {
        return res.status(400).json({
          success: false,

          message:
            'شناسه تسک نامعتبر است.'
        });
      }

      return res.status(
        error.status || 500
      ).json({
        success: false,

        message:
          error.message ||
          'خطا در انجام تسک.'
      });
    }
  }
);


// ============================================================
// Error Handler
// ============================================================

router.use(
  (error, req, res, next) => {
    console.error(
      'Tasks router error:',
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