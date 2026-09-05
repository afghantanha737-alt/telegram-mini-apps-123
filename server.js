require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

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

const rateBuckets = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 120;

app.use('/api', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count > RATE_MAX_REQUESTS) {
    return res.status(429).json({ success: false, message: 'درخواست‌های شما بیش از حد مجاز است. کمی صبر کنید.' });
  }
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt + RATE_WINDOW_MS) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/points', require('./routes/points'));
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

let server;

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ MongoDB connected');

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