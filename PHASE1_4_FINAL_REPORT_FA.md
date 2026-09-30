# گزارش نهایی اجرای مرحله‌های ۱ تا ۴ Gramup

**تاریخ:** ۳۰ سپتامبر ۲۰۲۶  
**وضعیت:** تکمیل شد و تست شد

## خلاصه

چهار مرحله‌ی اصلاحی روی همان نسخه‌ی پروژه اجرا شد. قابلیت‌های فعلی حفظ شده‌اند؛ تمرکز اصلی روی یکپارچگی مالی، جلوگیری از پرداخت تکراری، ضدتقلب Referral، امنیت، وابستگی‌ها، متن‌های اعتمادسازی و شفاف‌سازی Manual Task بوده است.

## مرحله ۱ — امنیت مالی و Ledger

- عملیات مهم زیر داخل تراکنش MongoDB قرار گرفتند:
  - Claim تسک و افزایش Points
  - Check-in روزانه و Streak
  - Spin پولی/رایگان و پاداش آن
  - تبدیل Points به GRAM و برعکس
  - ثبت درخواست برداشت و کسر GRAM
  - رد یا لغو برداشت و Refund
  - پرداخت جایزه Weekly Leaderboard
  - Claim مرحله‌های Referral
- ثبت Ledger در این مسیرها دیگر خطا را بی‌صدا نادیده نمی‌گیرد؛ اگر Ledger ثبت نشود، تراکنش هم Rollback می‌شود.
- برای رویدادهای حساس `sourceId` یکتا اضافه/استفاده شد تا Retry باعث ثبت دوباره‌ی تاریخچه نشود.
- پرداخت‌های قدیمی Leaderboard که قبلاً Ledger آن‌ها ثبت شده است، هنگام Retry دوباره به موجودی اضافه نمی‌شوند.
- Refund رد/لغو برداشت با یک `sourceId` یکتا ثبت می‌شود.

## مرحله ۲ — ضدتقلب Referral و Leaderboard

- Referralهای دارای `referralRiskBlocked=true` یا امتیاز ریسک ۵۰ به بالا، در Sweep دوباره فعال نمی‌شوند.
- Block کردن دستی Referral، کاربر را از `activeReferralIds` دعوت‌کننده نیز حذف می‌کند.
- فعال‌شدن Referral و پاداش Referral در یک تراکنش انجام می‌شود.
- پاداش Referral مرحله‌ای در یک تراکنش با Claim ثبت می‌شود.
- جایزه Leaderboard فقط پس از موفقیت هم‌زمان افزایش موجودی، ثبت Ledger و تغییر وضعیت Award به `paid` نهایی می‌شود.

## مرحله ۳ — تست و کنترل عملیاتی

- وابستگی قدیمی `node-telegram-bot-api` حذف شد؛ این وابستگی زنجیره‌ی `request/form-data/qs/tough-cookie/uuid` را وارد پروژه می‌کرد.
- کلاینت مستقیم Telegram Bot API با `fetch` جایگزین شد و متدهای مورد استفاده حفظ شدند:
  - sendMessage
  - sendPhoto
  - copyMessage
  - answerCallbackQuery
  - setWebhook
  - getChat
  - getMe
  - getChatMember
- `npm audit --omit=dev` اکنون **۰ آسیب‌پذیری** گزارش می‌کند.
- احراز هویت Telegram با `timingSafeEqual` و رد `initData` دارای timestamp آینده‌ی غیرعادی سخت‌سازی شد.
- در production، CORS بدون `ALLOWED_ORIGINS` دیگر به‌صورت عمومی باز نیست.
- `Permissions-Policy` و هدرهای امنیتی موجود حفظ و تکمیل شدند.
- Manual Task ناقص ساخته نمی‌شود؛ مسیر فعلی فقط Telegram membership verification است و برای Task قدیمی با `verifyType=manual` پیام واضح `MANUAL_TASK_DISABLED` برمی‌گرداند.

## مرحله ۴ — UX، متن‌ها و اعتمادسازی

- متن‌های قطعی مثل «درآمد تضمینی»، «GRAM واقعی» و ادعاهای مطلق پرداخت در Landing و رابط کاربر به متن دقیق‌تر تبدیل شدند.
- متن‌ها اکنون روشن می‌کنند که تبدیل/برداشت به نرخ، حداقل، احراز صلاحیت، بررسی و موجودی عملیاتی وابسته است.
- متن صفحات عمومی Reward و Landing با وضعیت واقعی Manual Task هماهنگ شد.
- عنوان رابط از `PREMIUM REWARDS` به `TASK & LOYALTY` تغییر کرد.
- صفحه‌ی عمومی پرداخت‌ها به‌جای ادعای پرداخت قطعی، وضعیت پرداخت‌های تکمیل‌شده و لینک Explorer در صورت وجود را توضیح می‌دهد.

## فایل‌های اصلی تغییرکرده

### Backend و مدل‌ها

- `server.js`
- `package.json`
- `package-lock.json`
- `.env.example`
- `models/Task.js`
- `routes/admin.js`
- `routes/points.js`
- `routes/referral.js`
- `routes/tasks.js`
- `utils/bot.js`
- `utils/ledger.js`
- `utils/mongoTransaction.js` — جدید
- `utils/withdrawalFinance.js` — جدید
- `utils/referralSweep.js`
- `utils/telegramAuth.js`

### رابط کاربر و صفحات عمومی

- `public/admin.html`
- `public/js/i18n.js`
- `public/landing.html`
- `public/rewards.html`

### تست

- `tests/phase1-4.test.js` — جدید

## تست‌های انجام‌شده

- Syntax check همه‌ی فایل‌های JavaScript: موفق
- Module load برای helperهای جدید: موفق
- `npm test`: موفق، همه‌ی تست‌ها PASS
- `npm audit --omit=dev`: موفق، ۰ آسیب‌پذیری
- تست قرارداد حذف وابستگی قدیمی و رد `initData` آینده: موفق

## تنظیمات لازم در Render

این متغیرها را بررسی کنید:

```env
NODE_ENV=production
REFERRAL_RISK_SECRET=یک-مقدار-تصادفی-طولانی-و-ثابت
ALLOW_LEGACY_ADMIN_KEY=false
INIT_DATA_MAX_AGE=86400
INIT_DATA_FUTURE_SKEW=120
ALLOWED_ORIGINS=https://telegram-mini-app12345.onrender.com
```

`MONGO_URI` باید به MongoDB Atlas یا Replica Set متصل باشد؛ چون عملیات مالی جدید از Transaction MongoDB استفاده می‌کند. اگر MongoDB شما standalone باشد، عملیات مالی با خطای تراکنش متوقف می‌شود تا موجودی بدون Ledger تغییر نکند.

## روش Deploy

1. فایل ZIP نهایی را روی Render در همان سرویس Upload کنید.
2. متغیرهای بالا را در Environment بررسی کنید.
3. Deploy را اجرا کنید.
4. در Logs باید این موارد را ببینید:
   - `MongoDB connected`
   - `Server running on port ...`
   - `Your service is live`
5. این آدرس‌ها را بررسی کنید:
   - `/api/health`
   - `/api/ready`
   - `/landing.html`
   - `/terms.html`
   - `/privacy.html`
   - `/rewards.html`
   - `/withdrawal.html`
   - `/support.html`
6. بعد از Deploy، برای پنل ادمین یک‌بار Logout/Login انجام دهید تا Session جدید ساخته شود.

## نکته مهم درباره Manual Task

در این نسخه Manual Task عمداً فعال نشده است، چون نسخه‌ی قبلی Upload/Storage/Review کامل نداشت. بنابراین در پنل فقط Taskهای عضویت Telegram بسازید. فعال‌کردن Manual Task بدون ذخیره‌سازی امن Proof و workflow تأیید ادمین می‌تواند دوباره باعث پاداش اشتباه شود.

## نتیجه نهایی

نسخه‌ی اصلاح‌شده برای Upload آماده است. مهم‌ترین ریسک‌های مالی و وابستگی‌های آسیب‌پذیر اصلاح شده‌اند و تست‌های محلی موفق هستند. پس از Deploy، ابتدا یک Check-in، یک Task، یک Exchange آزمایشی و یک درخواست برداشت آزمایشی با مقدار کم بررسی شود؛ سپس استفاده‌ی عمومی را ادامه دهید.
