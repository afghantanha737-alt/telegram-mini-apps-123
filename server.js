require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

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

/* =========================================================
   SECURITY / MIDDLEWARE
========================================================= */

// اگر برنامه پشت Render / Railway / Nginx / Cloudflare باشد
app.set('trust proxy', 1);

// CORS
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Telegram Mini App / server-to-server requests
      // ممکن است Origin نداشته باشند.
      if (!origin) {
        return callback(null, true);
      }

      // اگر ALLOWED_ORIGINS تعریف نشده باشد،
      // برای حفظ compatibility درخواست را قبول می‌کنیم.
      if (allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true
  })
);

// محدود کردن حجم JSON برای جلوگیری از payloadهای غیرضروری
app.use(
  express.json({
    limit: '100kb'
  })
);

// جلوگیری از parsing فرم‌های بسیار بزرگ
app.use(
  express.urlencoded({
    extended: false,
    limit: '100kb'
  })
);

/* =========================================================
   STATIC FRONTEND
========================================================= */

app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
   API ROUTES
========================================================= */

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/points', require('./routes/points'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/telegram', require('./routes/telegramWebhook'));

/* =========================================================
   API HEALTH CHECK
========================================================= */

app.get('/api/health', (req, res) => {
  const mongoState = mongoose.connection.readyState;

  const mongoStatus =
    mongoState === 1
      ? 'connected'
      : mongoState === 2
        ? 'connecting'
        : 'disconnected';

  res.json({
    success: true,
    status: 'ok',
    service: 'telegram-mini-app',
    mongodb: mongoStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/* =========================================================
   API 404
========================================================= */

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

// برای routeهای frontend مثل:
// /app
// /wallet
// /profile
// و ...
//
// index.html را برمی‌گردانیم.
// APIها قبل از این بخش مدیریت شده‌اند.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  if (res.headersSent) {
    return next(err);
  }

  // خطای CORS
  if (err.message === 'CORS origin not allowed') {
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed'
    });
  }

  // خطای JSON خراب
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload'
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

/* =========================================================
   DATABASE
========================================================= */

let server;

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000
    });

    console.log('✅ MongoDB connected');

    /*
     * Referral sweep
     *
     * این job شمارنده Referralها را به صورت دوره‌ای
     * با داده واقعی دیتابیس هماهنگ می‌کند.
     */
    const runReferralSweep = require('./utils/referralSweep');

    // اجرای اولیه
    runReferralSweep().catch(error => {
      console.error('Initial referral sweep failed:', error);
    });

    // هر 15 دقیقه
    setInterval(() => {
      runReferralSweep().catch(error => {
        console.error('Scheduled referral sweep failed:', error);
      });
    }, 15 * 60 * 1000);

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down...`);

  try {
    if (server) {
      await new Promise(resolve => {
        server.close(() => resolve());
      });
    }

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

/* =========================================================
   UNHANDLED ERRORS
========================================================= */

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);

  /*
   * در خطای uncaught exception بهتر است process
   * اجازه دهد deployment platform آن را restart کند.
   */
  shutdown('uncaughtException').catch(() => {
    process.exit(1);
  });
});

/* =========================================================
   START
========================================================= */

startServer();