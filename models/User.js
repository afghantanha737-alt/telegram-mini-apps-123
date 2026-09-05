const mongoose = require('mongoose');
const crypto = require('crypto');


// ============================================================
// User Schema
// ============================================================

const UserSchema = new mongoose.Schema(
  {
    // --------------------------------------------------------
    // Telegram Identity
    // --------------------------------------------------------

    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },

    username: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },

    firstName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },

    lastName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100
    },


    // --------------------------------------------------------
    // Points
    // --------------------------------------------------------

    points: {
      type: Number,
      default: 0,
      min: 0
    },


    // --------------------------------------------------------
    // Referral
    // --------------------------------------------------------

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },

    invitedCount: {
      type: Number,
      default: 0,
      min: 0
    },


    // --------------------------------------------------------
    // Wallet
    // --------------------------------------------------------

    walletAddress: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200
    },


    // --------------------------------------------------------
    // Daily Check-in
    // --------------------------------------------------------

    lastCheckIn: {
      type: Date,
      default: null,
      index: true
    },

    streak: {
      type: Number,
      default: 0,
      min: 0
    },

    totalCheckins: {
      type: Number,
      default: 0,
      min: 0
    },


    // --------------------------------------------------------
    // Lucky Spin
    // --------------------------------------------------------

    spinChances: {
      type: Number,
      default: 0,
      min: 0
    },


    // --------------------------------------------------------
    // Security / Verification
    // --------------------------------------------------------

    captchaPassed: {
      type: Boolean,
      default: false
    },

    termsAccepted: {
      type: Boolean,
      default: false
    },


    // --------------------------------------------------------
    // Account State
    // --------------------------------------------------------

    isBanned: {
      type: Boolean,
      default: false,
      index: true
    },

    banReason: {
      type: String,
      default: '',
      maxlength: 500
    },

    lastSeenAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: true,

    /*
     * از ذخیره فیلدهای ناشناخته در User جلوگیری می‌کند.
     */
    strict: true
  }
);


// ============================================================
// Referral Code Generator
// ============================================================

function generateReferralCode() {
  return crypto
    .randomBytes(6)
    .toString('hex')
    .toUpperCase();
}


// ============================================================
// Before Validation
// ============================================================

UserSchema.pre(
  'validate',
  async function (next) {
    try {
      /*
       * اگر کاربر جدید است و referralCode ندارد،
       * یک کد تصادفی امن تولید می‌کنیم.
       */

      if (
        this.isNew &&
        !this.referralCode
      ) {
        let code;
        let exists = true;

        /*
         * احتمال collision بسیار پایین است،
         * ولی همچنان uniqueness را بررسی می‌کنیم.
         */

        while (exists) {
          code = generateReferralCode();

          exists =
            await mongoose.models.User.exists({
              referralCode: code
            });
        }

        this.referralCode = code;
      }

      next();

    } catch (error) {
      next(error);
    }
  }
);


// ============================================================
// Normalize Telegram Data
// ============================================================

UserSchema.methods.updateTelegramProfile =
  function (telegramUser) {
    if (!telegramUser) {
      return this;
    }

    if (telegramUser.username !== undefined) {
      this.username =
        String(
          telegramUser.username || ''
        )
          .trim()
          .slice(0, 100);
    }

    if (telegramUser.first_name !== undefined) {
      this.firstName =
        String(
          telegramUser.first_name || ''
        )
          .trim()
          .slice(0, 100);
    }

    if (telegramUser.last_name !== undefined) {
      this.lastName =
        String(
          telegramUser.last_name || ''
        )
          .trim()
          .slice(0, 100);
    }

    this.lastSeenAt = new Date();

    return this;
  };


// ============================================================
// Safe Public Object
// ============================================================

UserSchema.methods.toPublicJSON =
  function () {
    return {
      id: this._id,

      telegramId:
        this.telegramId,

      username:
        this.username || '',

      firstName:
        this.firstName || '',

      lastName:
        this.lastName || '',

      points:
        Math.max(
          0,
          Number(this.points) || 0
        ),

      referralCode:
        this.referralCode || '',

      invitedCount:
        Math.max(
          0,
          Number(this.invitedCount) || 0
        ),

      streak:
        Math.max(
          0,
          Number(this.streak) || 0
        ),

      totalCheckins:
        Math.max(
          0,
          Number(this.totalCheckins) || 0
        ),

      spinChances:
        Math.max(
          0,
          Number(this.spinChances) || 0
        ),

      isBanned:
        Boolean(this.isBanned)
    };
  };


// ============================================================
// Indexes
// ============================================================

UserSchema.index({
  points: -1,
  createdAt: 1
});

UserSchema.index({
  referredBy: 1
});


// ============================================================
// Model
// ============================================================

module.exports =
  mongoose.model(
    'User',
    UserSchema
  );