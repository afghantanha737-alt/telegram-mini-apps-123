const mongoose = require('mongoose');


// ============================================================
// Withdrawal Schema
// ============================================================

const WithdrawalSchema = new mongoose.Schema(
  {
    // --------------------------------------------------------
    // User
    // --------------------------------------------------------

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },


    // --------------------------------------------------------
    // Withdrawal Amount
    // --------------------------------------------------------

    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator(value) {
          return (
            Number.isFinite(value) &&
            Number.isInteger(value) &&
            value > 0
          );
        },

        message:
          'مقدار برداشت باید یک عدد صحیح بیشتر از صفر باشد.'
      }
    },


    // --------------------------------------------------------
    // Wallet
    // --------------------------------------------------------

    walletAddress: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 200
    },


    // --------------------------------------------------------
    // Status
    // --------------------------------------------------------

    status: {
      type: String,

      enum: [
        'pending',
        'approved',
        'rejected'
      ],

      default: 'pending',

      index: true
    },


    // --------------------------------------------------------
    // Admin Telegram Message
    // --------------------------------------------------------

    adminMessageId: {
      type: Number,
      default: null
    },

    adminChatId: {
      type: String,
      default: null
    },


    // --------------------------------------------------------
    // Processing
    // --------------------------------------------------------

    processedAt: {
      type: Date,
      default: null
    },


    // --------------------------------------------------------
    // Optional Admin Note
    // --------------------------------------------------------

    adminNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
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
 * برای پیدا کردن سریع درخواست‌های Pending یک کاربر.
 */

WithdrawalSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1
});


/*
 * برای پنل/Admin و پردازش درخواست‌های جدید.
 */

WithdrawalSchema.index({
  status: 1,
  createdAt: -1
});


// ============================================================
// State Validation
// ============================================================

WithdrawalSchema.pre(
  'save',
  function (next) {
    /*
     * اگر درخواست پردازش شده است،
     * processedAt باید وجود داشته باشد.
     */

    if (
      (
        this.status === 'approved' ||
        this.status === 'rejected'
      ) &&
      !this.processedAt
    ) {
      this.processedAt = new Date();
    }


    /*
     * درخواست Pending نباید processedAt داشته باشد.
     */

    if (
      this.status === 'pending'
    ) {
      this.processedAt = null;
    }


    next();
  }
);


// ============================================================
// Public JSON
// ============================================================

WithdrawalSchema.methods.toPublicJSON =
  function () {
    return {
      id:
        this._id,

      amount:
        Math.max(
          0,
          Number(this.amount) || 0
        ),

      walletAddress:
        this.walletAddress,

      status:
        this.status,

      createdAt:
        this.createdAt,

      processedAt:
        this.processedAt
    };
  };


// ============================================================
// Model
// ============================================================

module.exports =
  mongoose.model(
    'Withdrawal',
    WithdrawalSchema
  );