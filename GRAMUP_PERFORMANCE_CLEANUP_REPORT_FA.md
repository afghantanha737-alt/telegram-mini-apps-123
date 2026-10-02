# گزارش بهینه‌سازی GramUp

**تاریخ بررسی:** ۱۴۰۵/۰۷/۱۰

## نتیجه کلی

مشکل اصلی Loading طولانی، منتظر ماندن هم‌زمان صفحات Home، Tasks و Profile برای API سنگین Referral بود. این وابستگی حذف شد و Referral اکنون فقط پس از نمایش اولیه صفحه و در صورت نیاز به‌صورت پس‌زمینه بارگذاری می‌شود.

## اصلاحات انجام‌شده

- در `public/js/app.js`:
  - Home و Tasks دیگر برای نمایش اولیه منتظر `/api/referral/me` نمی‌مانند.
  - Profile Menu دیگر Referral را بی‌دلیل بارگذاری نمی‌کند؛ فقط هنگام ورود به Referral آن را درخواست می‌کند.
  - داده‌های User و Tasks برای ۱۵ ثانیه در کلاینت cache می‌شوند تا رفت‌وبرگشت بین صفحات درخواست تکراری ایجاد نکند.
  - پس از خطای Referral، صفحه در Skeleton باقی نمی‌ماند و محتوای اصلی قابل استفاده است.
  - بعد از آماده شدن Referral، بخش‌های وابسته به‌صورت خودکار به‌روزرسانی می‌شوند.

- در پنل Admin:
  - فیلتر، ستون و کنترل‌های نمایشی `Risky Users` حذف شد.
  - مسیر مدیریتی دستی Referral Risk که دیگر در پنل مصرف‌کننده نداشت حذف شد.
  - نمایش اطلاعات Risk اضافی از پاسخ فهرست کاربران حذف شد.

- قابلیت مستقل و بلااستفاده Referral Audit حذف شد:
  - `public/referral-audit.html`
  - `utils/referralAudit.js`
  - `scripts/referral-audit.js`
  - `tests/referralAudit.test.js`
  - دستور `audit:referrals` از `package.json`
  - routeهای `/api/admin/referral-audit` و `/api/admin/referral-audit/run`
  - فیلدهای ذخیره‌سازی Audit غیرمصرف‌شده در `models/User.js`

## مواردی که حفظ شدند

- Telegram WebApp و Login
- Profile، Tasks، Daily Check-in و Spin Wheel
- Referral، محاسبه Eligibility و جلوگیری خودکار از پاداش نامعتبر
- Wallet، Deposit، Exchange، Withdraw و Transaction History
- Ledger، Balance Audit و کنترل‌های اصلی Admin
- عضویت اجباری کانال‌ها، اعتبارسنجی Telegram و کنترل‌های امنیتی
- ریسک خودکار Referral شامل `referralRiskScore`، `referralRiskFlags` و `referralRiskBlocked`؛ این بخش برای امنیت مالی حذف نشد.

## اعتبارسنجی

- `npm test`: موفق؛ تمام تست‌های پروژه Pass شدند.
- بررسی Syntax برای فایل‌های تغییرکرده: موفق.
- بررسی ارجاعات به قابلیت‌های حذف‌شده: بدون ارجاع باقی‌مانده.
- فایل‌های ضروری اصلی پس از اصلاح موجود و غیرخالی هستند.

## اثر مورد انتظار

نمای اولیه Home، Tasks و Profile سریع‌تر نمایش داده می‌شود؛ درخواست Referral دیگر مسیر رندر اولیه را مسدود نمی‌کند. رفت‌وبرگشت سریع بین صفحات نیز تا ۱۵ ثانیه از درخواست‌های تکراری User و Tasks جلوگیری می‌کند. در صورت خطای API Referral، کاربر همچنان می‌تواند از بخش‌های اصلی برنامه استفاده کند.

> اندازه‌گیری زمان واقعی با API و MongoDB متصل انجام نشد، بنابراین درصد بهبود عددی گزارش نمی‌شود؛ کاهش وابستگی‌های blocking و تعداد درخواست‌های تکراری در کد اعمال و با تست‌ها تأیید شده است.
