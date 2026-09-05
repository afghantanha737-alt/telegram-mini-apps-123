const mongoose = require('mongoose');


// ============================================================
// Task Completion Schema
// ============================================================

const TaskCompletionSchema = new mongoose.Schema(
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
    // Task
    // --------------------------------------------------------

    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true
    },


    // --------------------------------------------------------
    // Completion
    // --------------------------------------------------------

    completedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: true,

    strict: true
  }
);


// ============================================================
// Critical Anti-Duplicate Index
// ============================================================

/*
 * یک کاربر نمی‌تواند یک Task مشخص را دوبار complete کند.
 *
 * این Index یکی از مهم‌ترین لایه‌های امنیتی سیستم Task است.
 */

TaskCompletionSchema.index(
  {
    userId: 1,
    taskId: 1
  },
  {
    unique: true
  }
);


// ============================================================
// Useful Query Index
// ============================================================

TaskCompletionSchema.index({
  userId: 1,
  completedAt: -1
});


// ============================================================
// Public Representation
// ============================================================

TaskCompletionSchema.methods.toPublicJSON =
  function () {
    return {
      id: this._id,

      taskId:
        this.taskId,

      completedAt:
        this.completedAt
    };
  };


// ============================================================
// Model
// ============================================================

module.exports =
  mongoose.model(
    'TaskCompletion',
    TaskCompletionSchema
  );