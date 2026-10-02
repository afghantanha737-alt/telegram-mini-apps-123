'use strict';

const mongoose = require('mongoose');

/**
 * اجرای عملیات حساس مالی در یک تراکنش MongoDB.
 * محیط production باید MongoDB Replica Set/Atlas داشته باشد.
 */
async function withMongoTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withMongoTransaction };
