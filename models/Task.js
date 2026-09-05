const mongoose = require('mongoose');


// ============================================================
// Task Schema
// ============================================================

const TaskSchema = new mongoose.Schema(
  {
    // --------------------------------------------------------
    // Basic Information
    // --------------------------------------------------------

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },


    // --------------------------------------------------------
    // Task Type
    // --------------------------------------------------------

    type: {
      type: String,
      enum: [
        'channel',
        'link',
        'social',
        'other'
      ],
      default: 'link',
      index: true
    },


    // --------------------------------------------------------
    // Target
    // --------------------------------------------------------

    /*
     * لینک مقصد Task.
     *
     * مثال:
     * https://t.me/example
     */

    target: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },

    /*
     * برای Taskهای Channel.
     *
     * می‌تواند username یا chat ID باشد.
     */

    channelUsername: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200
    },

    channelId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200
    },


    // --------------------------------------------------------
    // Reward
    // --------------------------------------------------------

    reward: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },


    // --------------------------------------------------------
    // Membership Verification
    // --------------------------------------------------------

    requireMembership: {
      type: Boolean,
      default: false,
      index: true
    },


    // --------------------------------------------------------
    // Status
    // --------------------------------------------------------

    active: {
      type: Boolean,
      default: true,
      index: true
    },


    // --------------------------------------------------------
    // Ordering
    // --------------------------------------------------------

    order: {
      type: Number,
      default: 0,
      index: true
    },


    // --------------------------------------------------------
    // Optional Metadata
    // --------------------------------------------------------

    icon: {
      type: String,
      default: '🎯',
      trim: true,
      maxlength: 20
    },

    category: {
      type: String,
      default: 'general',
      trim: true,
      maxlength: 50
    }
  },
  {
    timestamps: true,

    strict: true
  }
);


// ============================================================
// Indexes
// ============================================================

/*
 * برای نمایش سریع Taskهای فعال به ترتیب.
 */

TaskSchema.index({
  active: 1,
  order: 1,
  createdAt: 1
});


/*
 * برای فیلتر کردن Taskهای کانال.
 */

TaskSchema.index({
  type: 1,
  active: 1
});


// ============================================================
// Validation
// ============================================================

TaskSchema.pre(
  'validate',
  function (next) {
    /*
     * Reward نباید منفی باشد.
     */

    if (
      !Number.isFinite(
        Number(this.reward)
      ) ||
      Number(this.reward) < 0
    ) {
      return next(
        new Error(
          'مقدار reward نامعتبر است.'
        )
      );
    }


    /*
     * اگر Task از نوع channel است،
     * حداقل یکی از شناسه‌های کانال باید وجود داشته باشد
     * وقتی membership verification فعال باشد.
     */

    if (
      this.requireMembership &&
      this.type === 'channel' &&
      !this.channelUsername &&
      !this.channelId &&
      !this.target
    ) {
      return next(
        new Error(
          'برای Task کانال، شناسه یا آدرس کانال لازم است.'
        )
      );
    }


    next();
  }
);


// ============================================================
// Public JSON
// ============================================================

TaskSchema.methods.toPublicJSON =
  function () {
    return {
      id: this._id,

      title:
        this.title,

      description:
        this.description || '',

      type:
        this.type,

      target:
        this.target || '',

      channelUsername:
        this.channelUsername || '',

      reward:
        Math.max(
          0,
          Number(this.reward) || 0
        ),

      requireMembership:
        Boolean(
          this.requireMembership
        ),

      active:
        Boolean(this.active),

      order:
        Number(this.order) || 0,

      icon:
        this.icon || '🎯',

      category:
        this.category || 'general'
    };
  };


// ============================================================
// Model
// ============================================================

module.exports =
  mongoose.model(
    'Task',
    TaskSchema
  );