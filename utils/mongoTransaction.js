'use strict';

const mongoose = require('mongoose');
let transactionSupport = null;
let transactionFailure = '';

async function verifyMongoTransactionCapability() {
  let session;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    const supportedTopology = Boolean(hello.setName) || hello.msg === 'isdbgrid';
    if (!supportedTopology || !hello.logicalSessionTimeoutMinutes) {
      transactionSupport = false;
      transactionFailure = 'MongoDB is not a session-enabled replica set or sharded cluster.';
      return { supported: false, reason: transactionFailure };
    }

    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // A real read command inside a transaction validates transaction negotiation,
      // rather than inferring support from a successful TCP/database connection.
      await mongoose.connection.db.collection('users').findOne({}, { session });
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
    transactionSupport = true;
    transactionFailure = '';
    return { supported: true, reason: '' };
  } catch (error) {
    transactionSupport = false;
    transactionFailure = String(error?.message || error).slice(0, 300);
    return { supported: false, reason: transactionFailure };
  } finally {
    if (session) await session.endSession().catch(() => {});
  }
}

function getMongoTransactionStatus() {
  return { supported: transactionSupport === true, checked: transactionSupport !== null, reason: transactionFailure };
}

/** Execute the full financial mutation under one MongoDB transaction. */
async function withMongoTransaction(work) {
  if (transactionSupport === false) {
    const error = new Error('MongoDB transactions are unavailable; financial operation was not executed.');
    error.code = 'TRANSACTIONS_UNAVAILABLE';
    throw error;
  }
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

module.exports = { withMongoTransaction, verifyMongoTransactionCapability, getMongoTransactionStatus };
