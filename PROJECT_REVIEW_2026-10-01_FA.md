# بررسی فنی پروژه Gramup

**نسخهٔ بررسی‌شده:** آرشیو `telegram-mini-apps-123-main(4).zip`  
**تاریخ بررسی:** ۱ اکتبر ۲۰۲۶  
**دامنه:** معماری، امنیت، یکپارچگی موجودی، برداشت TON، Referral، پنل ادمین، UI، محتوا، وابستگی‌ها و آزمون‌ها

> این گزارش فقط حاصل بررسی همین آرشیو است. هیچ تغییری در کد تولید نشده و هیچ اتصال واقعی به MongoDB، Telegram یا شبکهٔ TON با دادهٔ عملیاتی انجام نشده است.

---

## خلاصهٔ اجرایی

پروژه یک **MVP پیشرفته و قابل‌فهم** برای Telegram Mini App است: Express/Mongoose در بک‌اند، HTML/CSS/JS بدون فریم‌ورک در فرانت‌اند، احراز هویت Telegram WebApp، دفترکل تراکنش‌ها (Ledger)، Referral چندسطحی، Task، Spin، برداشت دستی و پنل ادمین دارد.

نسبت به گزارش‌های قدیمی موجود در آرشیو، چند بهبود مهم در این نسخه واقعاً اعمال شده است:

- تغییر موجودی و Ledger در بیشتر مسیرهای اصلی داخل `withMongoTransaction` انجام می‌شود.
- تسویهٔ خودکار Leaderboard نسبت به نسخهٔ قدیمی idempotent‌تر شده است.
- Referral sweep شرط ریسک را لحاظ می‌کند.
- بررسی عمر `initData` تلگرام، از جمله تاریخ بیش‌ازحد آینده، وجود دارد.
- `npm audit --omit=dev` در تاریخ بررسی **۰ آسیب‌پذیری شناخته‌شده** برگرداند.

با این حال، برای استفاده‌ای که موجودی قابل برداشت یا پرداخت واقعی دارد، دو ایراد **P0** باید پیش از رشد کاربران یا افزایش برداشت‌ها برطرف شوند:

1. تکرار یک `Idempotency-Key` در Spin/Exchange می‌تواند تغییر موجودی را دوباره اعمال کند، در حالی که Ledger فقط یک ردیف ثبت می‌کند.
2. `txHash` برداشت در سطح دیتابیس یکتا نیست؛ بنابراین کنترل «این هش قبلاً استفاده نشده» در شرایط هم‌زمانی قابل دور زدن است.

**ارزیابی پیشنهادی فعلی:** مناسب برای توسعه و آزمون محدود؛ هنوز مناسبِ گسترش مالی/تبلیغات وسیع نیست تا زمانی که موارد P0 رفع و روی MongoDB Replica Set آزمون یکپارچه اجرا شود.

---

## معماری و موجودی بررسی‌شده

| بخش | وضعیت |
|---|---|
| Backend | Node.js، Express 4، Mongoose 8، MongoDB |
| Frontend | ۱۰ صفحه HTML و JavaScript بدون فریم‌ورک |
| ماژول‌های backend | ۵۴ فایل در `routes/`، `models/` و `utils/` |
| منطق سمت‌سرور | حدود ۶٬۲۴۳ خط JavaScript (بدون testها) |
| JavaScript عمومی | حدود ۳٬۳۳۴ خط؛ `app.js` بسیار بزرگ است |
| تست‌ها | ۱۸ فایل test مستقل |
| وابستگی‌های تولیدی | `express`، `mongoose`، `cors`، `dotenv`، `multer` |
| Git | در آرشیو پوشهٔ `.git` وجود ندارد؛ تاریخچه/branch قابل بررسی نبود |

مسیرهای کلیدی شامل `auth`، `tasks`، `points`، `referral`، `leaderboard`، `membership`، `admin` و `telegramWebhook` هستند. مدل‌های مهم نیز `User`، `PointsLedger`، `Withdrawal`، `TaskCompletion`، `WeeklyLeaderboardAward` و `BalanceAudit` هستند.

---

## اعتبارسنجی‌های انجام‌شده

| بررسی | نتیجه |
|---|---|
| `npm ci` | موفق؛ ۹۵ بسته نصب شد |
| `node --check` روی همهٔ فایل‌های JS پروژه | موفق |
| `npm test` | موفق؛ همهٔ ۱۸ اسکریپت تست PASS شدند |
| `npm audit --omit=dev` | ۰ low / ۰ moderate / ۰ high / ۰ critical |
| `npm ls --omit=dev --depth=0` | درخت وابستگی مستقیم سالم |
| بررسی دستی مسیرهای مالی، Referral، Admin، Telegram و UI | انجام شد |

### محدودیت اعتبارسنجی

- این sandbox سرویس `mongod` ندارد؛ بنابراین تراکنش‌های واقعی MongoDB، ایندکس‌های production و رقابت هم‌زمان با دیتابیس زنده آزمایش نشدند.
- برای صحت مالی، محیط production باید **MongoDB Atlas یا Replica Set** داشته باشد؛ تراکنش‌های Mongo روی standalone server کار نمی‌کنند.
- تماس واقعی با Telegram API، webhook و TonCenter انجام نشد، چون محیط/کلید production بررسی نشد.
- تست E2E مرورگر و تست یکپارچهٔ دیتابیس وجود ندارد؛ تست‌های فعلی عمدتاً منطق خالص و قراردادهای schema را پوشش می‌دهند.

---

## نقاط قوتی که باید حفظ شوند

1. **احراز هویت Telegram Mini App** با HMAC و `timingSafeEqual` پیاده شده و عمر `initData` کنترل می‌شود.
2. **Mandatory membership** به‌صورت fail-closed اجرا شده است؛ نتیجهٔ مثبت کوتاه‌مدت cache می‌شود، اما نتیجهٔ منفی cache نمی‌شود.
3. **حفاظت از race condition** در check-in، claim تسک، موجودی Spin، تبدیل و ثبت برداشت در بسیاری از مسیرها وجود دارد.
4. **User + Ledger + Refund** در مسیرهای مهم با Mongo transaction بسته‌بندی شده‌اند؛ این نسبت به نسخه‌های قدیمی پیشرفت مهمی است.
5. **Ledger با `sourceId` یکتا**، `BalanceAudit` و لاگ فعالیت ادمین پایهٔ مناسبی برای ممیزی ایجاد کرده‌اند.
6. **مسیرهای Referral** از مدل‌های رابطه‌ای و کمیسیون چندسطحی استفاده می‌کنند و Referral sweep اکنون ریسک را در eligibility لحاظ می‌کند.
7. **سیاست‌های عمومی** (Terms, Privacy, Rewards, Withdrawal) نسبتاً محتاطانه‌اند و وعدهٔ درآمد تضمینی نمی‌دهند.
8. CORS production در صورت خالی بودن `ALLOWED_ORIGINS` fail-closed است و security headerهای پایه تعریف شده‌اند.

---

## یافته‌های اولویت‌دار

| اولویت | موضوع | شواهد اصلی | اثر |
|---|---|---|---|
| **P0** | Idempotency ناقص در Spin و Exchange | `routes/points.js:158-200, 249-265, 297-313` و `utils/ledger.js:23-28` | موجودی می‌تواند بیش از یک‌بار تغییر کند، ولی Ledger تنها یک رویداد داشته باشد |
| **P0** | یکتا نبودن `txHash` برداشت در DB | `models/Withdrawal.js` و `routes/admin.js:565-587` | یک هش پرداخت در درخواست‌های هم‌زمان می‌تواند برای بیش از یک برداشت ثبت شود |
| **P1** | تأیید Jetton صرفاً با success تراکنش | `utils/tonVerify.js:100-108` و `routes/admin.js:555-560` | مبلغ، مقصد و Jetton master به‌صورت خودکار اثبات نمی‌شوند |
| **P1** | دو مسیر تسویهٔ Leaderboard با منطق متفاوت | `routes/admin.js:379-477` در برابر `utils/weeklyLeaderboardSettlement.js` | ریسک تفاوت رفتار، payout زودهنگام و عدم تطابق state در retryهای دستی |
| **P1** | Jobهای پس‌زمینه و Broadcast پایدار/توزیع‌شده نیستند | `server.js:205-225`، `utils/dailyReminder.js`، `routes/admin.js:1426-1480` | در restart، sleep یا multi-instance ارسال‌ها ممکن است جا بیفتند یا تکراری شوند |
| **P2** | انتقال credentialها در query / sessionStorage | `public/js/app.js:196-249`، `routes/telegramWebhook.js:221-236`، `public/admin.html:464-524` | افزایش سطح نشت در logها و ریسک XSS برای admin token |
| **P2** | تنظیم Task می‌تواند به حالت غیرقابل‌اجرا برسد | `models/Task.js:14-22`، `routes/tasks.js:100-102`، `routes/admin.js:256-323` | Task با `verifyType=manual` یا `chatId` ناقص به کاربر نمایش داده می‌شود، اما قابل completion نیست |
| **P2** | Financial Audit کامل و صفحه‌بندی‌شده نیست | `routes/admin.js:481-492` | فقط حداکثر ۱۰٬۰۰۰ User بررسی می‌شود و گزارش ممکن است در مقیاس بزرگ ناقص باشد |
| **P2** | زمان‌بندی Reminder با DST/نیم‌ساعت دقیق نیست | `utils/timezones.js:39-60` و `utils/dailyReminder.js:12-16` | ساعت محلی در DST تغییر نمی‌کند و timezoneهای نیم‌ساعتی تقریب زده می‌شوند |
| **P3** | Proof عمومی «verified» را با داشتن hash یکی گرفته است | `public/proof.html:146-186` و `/api/points/public-history` | پرداخت Jetton با تأیید دستی ممکن است برای کاربر بیش از حد قابل‌اتکا نمایش داده شود |
| **P3** | نگهداری UI دشوار است | `public/js/app.js`، `public/admin.html` و selectorهای تکراری CSS | ریسک regressions و هزینهٔ توسعهٔ بعدی بالا می‌رود |

### P0-1 — Idempotency در Spin و Exchange واقعاً کامل نیست

در `routes/points.js` مقدار `Idempotency-Key` به `sourceId` Ledger تبدیل می‌شود. اما هنگام تکرار همان key، `recordLedger` خطای unique را خطا نمی‌داند و ردیف موجود را با نتیجهٔ موفق برمی‌گرداند (`utils/ledger.js:23-28`). در عین حال caller قبلاً `$inc` روی User اجرا کرده و بررسی نمی‌کند که `ledgerResult.created` واقعاً `true` بوده است.

نمونهٔ اثر: یک کاربر می‌تواند یک Spin با همان کلید را تکرار کند. هر بار نتیجهٔ تصادفی جدید و تغییر موجودی اعمال می‌شود، اما حداقل یکی از Ledgerها duplicate تشخیص داده می‌شود. در نتیجه **موجودی و دفترکل از هم جدا می‌شوند**؛ در Spin این می‌تواند به سوءاستفادهٔ اقتصادی تبدیل شود.

**اصلاح پیشنهادی:**

- یک collection مستقل مانند `IdempotencyOperation` با unique index روی `{ user, endpoint, key }` اضافه شود.
- قبل از هر mutation، عملیات با state `processing` claim شود؛ درخواست تکراری response ذخیره‌شده را برگرداند.
- نتیجهٔ Spin فقط بعد از claim ساخته و همراه response ذخیره شود.
- اگر `recordLedgerRequired` duplicate برگرداند، mutation باید rollback شود، نه اینکه موفق تلقی شود.
- تست‌های parallel/replay برای Spin، هر دو جهت Exchange و Withdrawal اضافه شود.

### P0-2 — جلوگیری از TxHash تکراری باید با unique index دیتابیس انجام شود

اکنون مسیر approval ابتدا `findOne({ txHash ... })` می‌زند و سپس `findOneAndUpdate` می‌کند. این الگو در دو request هم‌زمان atomic نیست. مدل `Withdrawal` نیز unique index برای `txHash` ندارد.

**اصلاح پیشنهادی:**

- index یکتای partial/sparse برای hash غیرخالی تعریف شود (ترجیحاً روی hash نرمال‌شده).
- پیش از ساخت index، رکوردهای تکراری موجود با migration گزارش و رفع شوند.
- خطای duplicate-key (`E11000`) به پاسخ مشخص `DUPLICATE_TX` تبدیل شود.
- approval و تغییر state در transaction و با audit log قطعی ثبت شود.

### P1 — تأیید Jetton هنوز اثبات کامل on-chain نیست

برای توکن‌هایی غیر از TON، `verifyTonTransaction` فقط موفق‌بودن تراکنش را بررسی می‌کند؛ مقصد، مقدار و token contract را verify نمی‌کند. با `forceManualConfirm=true`، admin می‌تواند درخواست را `paid` کند.

**اصلاح پیشنهادی:** از API انتقال Jetton یا `@ton/core` برای decode BOC استفاده شود و `jetton master`، wallet مقصد، مقدار، hash و status دقیق assert شوند. تا آن زمان، پرداخت‌های manual باید در Proof عمومی با وضعیت **«ثبت‌شده؛ تأیید کامل on-chain ندارد»** نمایش داده شوند و بهتر است approval حساس نیازمند four-eyes/second confirmation باشد.

### P1 — عملیات زمان‌دار و Broadcast باید صف پایدار داشته باشند

Reminder، referral sweep و settlement با `setInterval` اجرا می‌شوند؛ هر instance آن‌ها را جداگانه اجرا می‌کند. Broadcast هم پس از ارسال پاسخ HTTP در حافظه ادامه پیدا می‌کند. restart یا scale-out باعث از دست‌رفتن یا تکرار کار می‌شود.

**اصلاح پیشنهادی:** outbox/job collection، lock توزیع‌شده، batch cursor قابل resume، status هر recipient و retry با backoff. این کار برای رشد کاربر و ارسال‌های جمعی ضروری است.

### P2 — حمل initData و session admin

- کلاینت `initData` را در query string همهٔ درخواست‌ها قرار می‌دهد؛ بهتر است با header اختصاصی ارسال شود تا در logهای URL باقی نماند.
- endpoint `GET /api/telegram/set-webhook?key=...` امکان ارسال کلید ادمین در URL دارد؛ به POST و admin session/header منتقل شود.
- session پنل در `sessionStorage` است؛ در صورت XSS قابل خواندن خواهد بود. مسیر بهتر: cookie با `HttpOnly`, `Secure`, `SameSite=Strict` و backend session store.
- CSP هنوز وجود ندارد؛ با توجه به inline handlerها، باید به‌تدریج refactor شود، نه اینکه صرفاً `unsafe-inline` اضافه شود.

### P2 — Task manual و validation

ساخت Task جدید عمداً `telegram` است؛ ولی update API اجازهٔ `verifyType=manual` می‌دهد، در حالی که endpoint کاربر Manual Task را صریحاً disabled برمی‌گرداند. همچنین validation قوی برای `chatId`/URL در Task update وجود ندارد.

**تصمیم لازم:** یا support Manual Task و فیلدهای Proof کامل حذف شوند، یا چرخهٔ upload امن، pending review، approve/reject و پرداخت اتمیک تکمیل شود. تا زمان تصمیم، تغییر `verifyType` از API نیز باید حذف یا server-side reject شود.

---

## کیفیت، محتوا و مقیاس‌پذیری

- UI اصلی موبایل‌محور و از نظر مسیر کاربر مناسب است، اما `app.js` حدود ۲٬۵۰۰ خط و `admin.html` حدود ۱٬۷۵۰ خط inline دارد.
- selectorهای کلیدی CSS مانند `taskItem`، `taskAction` و `profileItem` چندبار تعریف شده‌اند؛ refactor تدریجی به base/components/pages پیشنهاد می‌شود.
- Task ویژه صرفاً Boolean است و تاریخ/timezone ندارد؛ ممکن است چند Task هم‌زمان «Special of the Day» بمانند.
- `GET /api/referral/me` از `$graphLookup` استفاده می‌کند؛ برای referral tree بزرگ باید محدودیت و index/query budget در نظر گرفته شود.
- Financial audit و broadcast همهٔ داده را در حافظه می‌خوانند؛ در رشد کاربران به pagination/cursor نیاز دارند.
- صفحهٔ Support لینک مشخص `@botusername` یا handle پشتیبانی نشان نمی‌دهد؛ CTA از `/api/app-info` پر می‌شود، ولی روش تماسِ صریح بهتر است اضافه شود.
- متن‌های عمومی جدید عمدتاً محتاط‌اند، اما متن‌های قدیمی داخل `index.html` هنوز عبارت‌هایی مانند «کوین واقعی» و «هر پرداخت واقعی» دارند. متن‌های fallback باید با Terms و وضعیت تأیید Jetton همسان شوند.

---

## برنامهٔ اصلاح پیشنهادی

### فاز ۱ — پیش از هر رشد یا پرداخت بیشتر

1. پیاده‌سازی idempotency واقعی برای Spin، Exchange و Withdrawal.
2. افزودن unique partial index برای `Withdrawal.txHash` و migration ایمن.
3. تقویت تأیید Jetton و تفکیک صریح statusهای verified/manual/unverified در API و UI.
4. یکپارچه‌کردن پرداخت دستی Leaderboard با `settleWeek()` و محدودکردن `force` به محیط test.
5. اجرای integration test با MongoDB Replica Set و تست concurrent requests.

### فاز ۲ — hardening و عملیات قابل‌اعتماد

6. انتقال credentials از query string، حذف query-key در webhook setup و تبدیل admin session به cookie امن.
7. صف پایدار برای reminder/broadcast/settlement با distributed lock و retry.
8. pagination برای audit، broadcast و گزارش‌های admin.
9. اصلاح timezone reminder بر اساس زمان محلی در هر اجرای job، نه تبدیل یک‌باره به UTC.
10. قفل‌کردن Manual Task تا زمان تکمیل workflow یا پیاده‌سازی کامل آن.

### فاز ۳ — نگهداری و اعتماد کاربر

11. ماژولارکردن `app.js`، پنل ادمین و CSS.
12. افزودن E2E برای login، membership gate، Task claim، replay idempotency، Exchange، Withdrawal، approval و leaderboard.
13. همسان‌سازی واژه‌های «پرداخت»، «تأیید on-chain» و «دسترسی برداشت» در Mini App، Proof و صفحات عمومی.
14. افزودن contact handle رسمی و نسخهٔ ترجمه‌شده/کامل‌تر صفحات عمومی.

---

## نتیجه

پروژه پایهٔ فنی خوبی دارد و بسیاری از نقاط آسیب‌پذیر گزارش‌های قبلی در این snapshot بهتر شده‌اند. اما برای اینکه Ledger واقعاً منبع قابل‌اعتماد حقیقت مالی باشد، **idempotency دقیق** و **ممانعت دیتابیسی از TxHash تکراری** باید اولین اصلاحات باشند. پس از آن، تأیید Jetton، jobهای پایدار و تست integration مسیر درست برای رساندن Gramup از MVP به سرویس قابل‌اعتمادتر است.
