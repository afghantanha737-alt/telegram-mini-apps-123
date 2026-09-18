require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { createRateLimiter } = require('./utils/rateLimit');
const PointsLedger = require('./models/PointsLedger');

const app = express();

/* =========================================================
   CONFIG
========================================================= */
const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not configured.');
  process.exit(1);
}
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not configured.');
  process.exit(1);
}

/* =========================================================
   SECURITY / MIDDLEWARE
========================================================= */
app.set('trust proxy', 1);

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true
  })
);

app.use(express.json({ limit: '150kb' }));
app.use(express.urlencoded({ extended: false, limit: '150kb' }));

/* =========================================================
   API RATE LIMIT
========================================================= */
app.use('/api', createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.'
}));

/* =========================================================
   STATIC FRONTEND
========================================================= */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

/* =========================================================
   API ROUTES
========================================================= */
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/points', require('./routes/points'));
app.use('/api/ads', require('./routes/ads'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/telegram', require('./routes/telegramWebhook'));

app.get('/api/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStatus = mongoState === 1 ? 'connected' : mongoState === 2 ? 'connecting' : 'disconnected';
  res.json({
    success: true,
    status: 'ok',
    service: 'telegram-mini-app',
    mongodb: mongoStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

/* =========================================================
   FRONTEND FALLBACK
========================================================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);

  if (err.message === 'CORS origin not allowed') {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

/* =========================================================
   DATABASE + START
========================================================= */
let server;

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ MongoDB connected');

    // پاک‌سازی ایندکس‌های قدیمی/ناسازگار که ممکن است از نسخه‌های قبلی
    // پروژه در دیتابیس باقی مانده باشند (مثلاً ایندکس روی فیلدهای
    // userId/taskId که در مدل فعلی وجود ندارند و باعث خطای duplicate
    // key کاذب می‌شوند).
    await cleanupStaleIndexes();

    // Make sure the ledger collection exists before the first MongoDB
    // transaction tries to insert a conversion or reward entry.
    try {
      await PointsLedger.createCollection();
    } catch (error) {
      if (error.code !== 48 && error.codeName !== 'NamespaceExists') throw error;
    }
    await cleanupLedgerIndexes();
    await PointsLedger.init();

    const backfillOpeningBalances = require('./utils/ledgerBackfill');
    await backfillOpeningBalances();

    const runReferralSweep = require('./utils/referralSweep');
    runReferralSweep().catch(error => console.error('Initial referral sweep failed:', error));
    setInterval(() => {
      runReferralSweep().catch(error => console.error('Scheduled referral sweep failed:', error));
    }, 15 * 60 * 1000);

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

async function cleanupStaleIndexes() {
  try {
    const collection = mongoose.connection.collection('taskcompletions');
    const indexes = await collection.indexes();

    // نام درست ایندکس فعلی که مدل باید داشته باشد
    const validIndexName = 'user_1_task_1';

    for (const index of indexes) {
      const isPrimaryKey = index.name === '_id_';
      const isValid = index.name === validIndexName;
      if (!isPrimaryKey && !isValid) {
        await collection.dropIndex(index.name);
        console.log(`🧹 Dropped stale index "${index.name}" from taskcompletions`);
      }
    }
  } catch (error) {
    // این عملیات صرفاً پاک‌سازی است؛ اگر کالکشن هنوز وجود ندارد یا خطای
    // بی‌ضرر دیگری رخ دهد، نباید جلوی بالا آمدن سرور را بگیرد.
    console.warn('Index cleanup skipped (non-fatal):', error.message);
  }
}

async function cleanupLedgerIndexes() {
  try {
    const collection = mongoose.connection.collection('pointsledgers');
    const indexes = await collection.indexes();

    for (const index of indexes) {
      if (index.name === '_id_') continue;

      const fields = Object.keys(index.key || {});
      const isSafeIdempotencyIndex =
        fields.length === 1 &&
        fields[0] === 'idempotencyKey' &&
        index.unique === true &&
        index.sparse === true;

      // Old deployments may have made operation/reference indexes unique.
      // A conversion intentionally creates two rows with shared references.
      if (index.unique && !isSafeIdempotencyIndex) {
        await collection.dropIndex(index.name);
        console.log(`🧹 Dropped unsafe ledger index "${index.name}"`);
      }
    }
  } catch (error) {
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) {
      console.warn('Ledger index cleanup skipped:', error.message);
    }
  }
}

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down...`);
  try {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.close(false);
    console.log('✅ Server shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Shutdown error:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', error => console.error('Unhandled Promise Rejection:', error));
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  shutdown('uncaughtException').catch(() => process.exit(1));
});

startServer();
