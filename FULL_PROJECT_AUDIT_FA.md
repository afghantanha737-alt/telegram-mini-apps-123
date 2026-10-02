# گزارش ممیزی کامل پروژه Gramup

**تاریخ ممیزی:** ۳۰ سپتامبر ۲۰۲۶  
**دامنه:** معماری، Backend، Database، منطق Points و مالی، Tasks، Referral، Streak، Reminder، Spin، Wallet، Withdrawal، Leaderboard، Admin Panel، UI/UX، Branding، صفحات عمومی، امنیت، کارایی، تست و وضعیت Deploy

---

## ۱. خلاصه اجرایی

پروژه از نظر شکل کلی، قابلیت‌های اصلی و تست‌های منطق خالص، پایه‌ی قابل‌قبولی دارد. بخش‌های مهمی مانند احراز هویت Telegram Mini App، بررسی عضویت اجباری، جلوگیری از claim تکراری تسک، جلوگیری از مصرف هم‌زمان موجودی، صفحات عمومی قوانین و پنل مدیریت نسبت به یک نمونه‌ی اولیه، به‌خوبی توسعه داده شده‌اند.

با این حال، پروژه هنوز برای مقیاس بزرگ یا عملیات مالی بدون اصلاح چند مورد مهم آماده نیست. مهم‌ترین مسئله این است که تغییر موجودی و ثبت Ledger در بسیاری از مسیرها داخل یک تراکنش اتمیک مشترک انجام نمی‌شوند و خطای Ledger عمداً نادیده گرفته می‌شود. در جایزه‌ی Leaderboard هفتگی، این موضوع می‌تواند در صورت خطای Ledger باعث پرداخت دوباره به کاربر شود. همچنین `referralSweep` در وضعیت فعلی می‌تواند Referralهایی را که به‌دلیل ریسک ضدتقلب مسدود شده‌اند، دوباره فعال کند.

### امتیاز کلی پیشنهادی

| حوزه | ارزیابی | توضیح کوتاه |
|---|---:|---|
| معماری کلی | ۷/۱۰ | ساده، قابل فهم و مناسب MVP؛ اما هنوز تک‌پردازه و بدون صف/تراکنش سراسری است |
| امنیت احراز هویت | ۷/۱۰ | HMAC تلگرام، محدودیت عمر initData و rate limit وجود دارد؛ hardening بیشتر لازم است |
| یکپارچگی مالی | ۴/۱۰ | موجودی‌ها atomic هستند، اما موجودی و Ledger اغلب atomic مشترک نیستند |
| ضدتقلب Referral | ۵/۱۰ | سیگنال ریسک و بررسی دستی وجود دارد، ولی sweep می‌تواند آن را دور بزند |
| UI/UX | ۷/۱۰ | ظاهر مدرن، برند منسجم و موبایل‌محور؛ اما پیچیدگی و کد CSS تکراری زیاد است |
| مستندات و اعتماد عمومی | ۶/۱۰ | صفحات رسمی ساخته شده‌اند، ولی برخی ادعاها از وضعیت واقعی سیستم قوی‌ترند |
| تست | ۷/۱۰ | تست‌های منطق مهم موفق‌اند؛ تست E2E، مالی و UI واقعی کم است |
| آمادگی Production | ۵/۱۰ | Deploy فعلی سالم است، اما قبل از افزایش کاربر باید ریسک‌های P0 رفع شوند |

> **نتیجه:** پروژه برای ادامه‌ی توسعه و تست کاربری مناسب است، اما پیش از تبلیغات گسترده، افزایش برداشت‌ها یا پرداخت خودکار، باید اصلاحات P0 این گزارش انجام شود.

---

## ۲. دامنه و موجودی بررسی‌شده

ساختار فعلی شامل موارد زیر است:

- **۹ route** اصلی API و webhook
- **۱۰ مدل MongoDB**
- **۲۵ utility/service**
- **۱۱ تست مستقل**
- **۱۴ فایل public** شامل Mini App، Admin Panel، Landing، Proof و صفحات عمومی
- Backend با **Node.js + Express + Mongoose**
- Frontend با **HTML/CSS/JavaScript بدون framework**
- احراز هویت از طریق Telegram WebApp `initData`
- نگهداری داده در MongoDB
- استقرار فعلی روی Render

اعتبارسنجی انجام‌شده:

- `npm test`: موفق؛ همه تست‌های موجود PASS شدند.
- `node --check` برای فایل‌های JavaScript: موفق.
- صفحات آنلاین: همه‌ی مسیرهای عمومی بررسی‌شده HTTP 200 برگرداندند.
- `/api/health`: MongoDB متصل و سرویس سالم.
- `/api/ready`: وضعیت `ready` و Bot پیکربندی‌شده.
- `npm audit --omit=dev`: **۹ آسیب‌پذیری production شامل ۲ critical و ۷ moderate** گزارش کرد.

---

# ۳. چیزهایی که خوب هستند و باید حفظ شوند

## ۳.۱ Backend و احراز هویت

1. **اعتبارسنجی HMAC تلگرام** در `utils/telegramAuth.js` بر اساس روش رسمی Telegram انجام می‌شود.
2. برای `initData` محدودیت عمر وجود دارد و مقدار پیش‌فرض ۲۴ ساعت است.
3. احراز هویت و بررسی عضویت اجباری در APIهای محافظت‌شده جدا و قابل تشخیص هستند.
4. در `membershipCore.js` منطق **fail-closed** رعایت شده است؛ یعنی اگر بررسی عضویت با خطای واقعی مواجه شود، سیستم به‌اشتباه کاربر را مجاز نمی‌کند.
5. نتیجه‌ی مثبت عضویت cache کوتاه‌مدت دارد و نتیجه‌ی منفی cache نمی‌شود؛ این تصمیم از نظر امنیتی مناسب است.
6. در سرور `X-Content-Type-Options`، `X-Frame-Options`، `Referrer-Policy` و خاموش‌کردن `x-powered-by` وجود دارد.
7. برای API عمومی و Admin rate limit جداگانه تعریف شده است.
8. برای پنل Admin session کوتاه‌مدت ایجاد شده و کلید اصلی در درخواست‌های بعدی تکرار نمی‌شود.

## ۳.۲ عملیات اتمیک موجودی

در چند مسیر، جلوگیری از race condition به‌درستی انجام شده است:

- Check-in روزانه با شرط `lastCheckIn`
- Spin پولی با شرط `points >= cost`
- Spin رایگان با شرط `spinChances > 0`
- Exchange با شرط موجودی کافی
- Withdrawal با شرط `gramBalance >= amount`
- رزرو ظرفیت Task با `findOneAndUpdate` و شرط ظرفیت
- جلوگیری از تکمیل دوباره‌ی Task با unique index روی `(user, task)`
- claim مرحله‌های Referral با شرط و index منطقی

این‌ها پایه‌ی خوبی هستند و نباید با refactor بعدی حذف شوند.

## ۳.۳ UI/UX و برندینگ

- ترکیب رنگ **بنفش، صورتی، سفید و طلایی** هویت بصری مشخصی ایجاد کرده است.
- لوگوی Gramup در صفحات اصلی و عمومی یکسان استفاده شده است.
- UI از ابتدا موبایل‌محور طراحی شده و برای Telegram Mini App مناسب است.
- Bottom navigation پنج‌بخشی برای Home، Tasks، Daily، Wallet و Profile مسیر اصلی را ساده می‌کند.
- کارت‌های جداگانه برای Taskها، وضعیت Done، پاداش و دکمه‌ی اقدام، قابل فهم هستند.
- Level/Badge، Streak، Referral و Weekly Leaderboard به‌صورت بصری قابل تشخیص‌اند.
- صفحه‌ی Proof of Payments و صفحات Terms، Privacy، Rewards، Withdrawal و Support برای اعتمادسازی و بررسی سرویس تبلیغاتی قدم خوبی هستند.
- صفحات عمومی بدون نیاز به Login باز می‌شوند و برای بررسی Moderation مناسب‌تر از نمایش مستقیم Mini App هستند.

## ۳.۴ مستندات و شفافیت

وجود صفحات عمومی زیر یک نقطه قوت مهم است:

- `/terms.html`
- `/privacy.html`
- `/rewards.html`
- `/withdrawal.html`
- `/support.html`
- `/proof.html`

همچنین متن‌های ضدتقلب، ممنوعیت Bot و Multiple Account، شرایط Referral و محدودیت برداشت در آن‌ها توضیح داده شده است. این بخش باید حفظ شود، اما لازم است با عملکرد واقعی سیستم کاملاً همسان شود.

---

# ۴. مسائل مهم و اصلاحات ضروری

## P0-A — یکپارچگی مالی و Ledger

### شواهد

در مسیرهای `points.js`، `tasks.js`، `referral.js` و بخش‌هایی از `admin.js` ابتدا موجودی User با `findByIdAndUpdate` تغییر می‌کند و سپس `recordLedger(...)` به‌صورت fire-and-forget صدا زده می‌شود:

```js
recordLedger({...}).catch(() => {});
```

در نتیجه:

1. اگر Ledger ثبت نشود، موجودی کاربر تغییر کرده ولی تاریخچه مالی ناقص می‌ماند.
2. Financial Audit اختلاف کاذب نشان می‌دهد.
3. Weekly Leaderboard که از Ledger محاسبه می‌شود ممکن است امتیاز واقعی را کمتر نشان دهد.
4. خطاهای مالی در لاگ اصلی قابل مشاهده نیستند یا از دست می‌روند.

### خطر جدی‌تر در جایزه Leaderboard

در پرداخت جایزه هفتگی، ترتیب فعلی چنین است:

1. موجودی User افزایش می‌یابد.
2. Ledger ثبت می‌شود.
3. Award به وضعیت `paid` می‌رود.

اگر مرحله ۲ شکست بخورد، Award به `failed` می‌رود اما مرحله ۱ قبلاً انجام شده است. با retry، دوباره موجودی User افزایش پیدا می‌کند. این یعنی **احتمال پرداخت دوباره‌ی جایزه**.

### خطر مشابه در Refund برداشت

در Reject/Cancel برداشت، ابتدا وضعیت برداشت تغییر می‌کند و بعد موجودی کاربر refund می‌شود. اگر refund یا Ledger آن شکست بخورد، برداشت ممکن است `rejected/cancelled` باشد اما مبلغ کاربر هنوز برنگشته باشد.

### اصلاح پیشنهادی

- برای تغییر User، ایجاد Ledger و تغییر وضعیت Award/Withdrawal از **MongoDB transaction با session** استفاده شود.
- اگر تراکنش MongoDB در محیط فعلی replica set ندارد، ابتدا روی MongoDB Atlas/Replica Set فعال شود.
- برای هر رویداد مالی `sourceId` یکتا و قطعی تعریف شود.
- retry فقط باید همان `sourceId` را idempotently تکمیل کند، نه اینکه دوباره `$inc` روی User بزند.
- خطای Ledger نباید swallow شود؛ باید با alert و retry queue ثبت شود.
- برای عملیات حساس یک Outbox/Jobs collection ایجاد شود.

**اولویت:** قبل از پرداخت خودکار یا افزایش جدی برداشت‌ها حتماً اصلاح شود.

---

## P0-B — دورزدن ضدتقلب در Referral Sweep

### شواهد

در `routes/tasks.js`، Referral پرریسک با این شرایط فعال نمی‌شود:

- `referralRiskScore >= 50`
- یا `referralRiskBlocked === true`

اما در `utils/referralSweep.js`، تمام کاربرانی که حداقل یک Task approved دارند، بدون درنظرگرفتن `referralRiskScore` یا `referralRiskBlocked` در `activeReferralIds` قرار می‌گیرند.

بنابراین این سناریو ممکن است رخ دهد:

1. Referral به‌دلیل same network hash امتیاز ریسک ۵۰ می‌گیرد.
2. مسیر عادی Tasks او را فعال نمی‌کند.
3. Sweep دوره‌ای او را فعال می‌کند.
4. `activeInvitedCount` بالا می‌رود.
5. دعوت‌کننده می‌تواند مرحله‌ی Referral را claim کند.

### اصلاح پیشنهادی

منطق تعیین active referral باید فقط در یک helper مشترک باشد و در هر دو مسیر استفاده شود:

```text
isEligibleActiveReferral(user) =
  hasApprovedTask
  AND referralRiskScore < threshold
  AND referralRiskBlocked !== true
  AND referrer is not banned
```

در Sweep باید:

- کاربر پرریسک حذف شود؛
- `activeReferralIds` با داده‌ی واقعی و فیلترشده بازسازی شود؛
- تغییرات manual review حفظ شود؛
- برای هر Sweep گزارش تعداد حذف‌شده و اضافه‌شده ثبت شود.

**اولویت:** بسیار بالا؛ چون مستقیماً روی پاداش Referral اثر دارد.

---

## P0-C — Manual Task در مدل وجود دارد اما جریان اجرا کامل نیست

در `models/Task.js` مقدار `verification` می‌تواند `telegram` یا `manual` باشد و `TaskCompletion` نیز `proofFileId` دارد. اما در مسیر claim در `routes/tasks.js`، برای همه Taskها این کار انجام می‌شود:

```js
checkChatMembership(task.chatId, u.telegramId)
```

یعنی مسیر `manual` به‌صورت جداگانه اجرا نمی‌شود و Upload/Review واقعی برای کاربر وجود ندارد. نتیجه‌ی احتمالی:

- Task manual بدون `chatId` با خطای تنظیمات مواجه می‌شود.
- Task manual نمی‌تواند Screenshot/Proof واقعی دریافت کند.
- وضعیت `pending` و بررسی Admin عملاً ناقص می‌ماند.

### دو انتخاب صحیح

1. اگر Manual Task لازم نیست، گزینه‌ی `manual` و فیلدهای مربوط به Proof حذف و فقط Telegram membership نگه داشته شود.
2. اگر لازم است، مسیر کامل اضافه شود:
   - upload امن فایل یا Telegram file ID؛
   - محدودیت حجم و نوع فایل؛
   - ایجاد Completion با `pending`؛
   - تب بررسی Proof در Admin؛
   - approve/reject اتمیک؛
   - پرداخت فقط هنگام approve؛
   - جلوگیری از پرداخت دوباره.

**اولویت:** بالا؛ چون مدل و UI وعده‌ی قابلیتی را می‌دهند که Backend کامل اجرا نمی‌کند.

---

## P0-D — آسیب‌پذیری‌های وابستگی

خروجی `npm audit --omit=dev`:

- ۲ مورد **critical**
- ۷ مورد **moderate**
- زنجیره‌هایی مانند `request`، `form-data`، `tough-cookie`، `qs` و نسخه‌ی `node-telegram-bot-api` درگیر هستند.

### پیشنهاد

- قبل از هر تغییر، `package-lock.json` نسخه‌ی production بررسی و commit شود.
- `node-telegram-bot-api` به نسخه‌ی maintained/سازگار ارتقا یابد یا در صورت نیاز کتابخانه‌ی رسمی/پایدارتر جایگزین شود.
- `npm audit fix --force` بدون تست اجرا نشود؛ چون ممکن است تغییر major بدهد.
- بعد از ارتقا این موارد تست شوند: webhook، ارسال پیام، `getChatMember`، broadcast، upload و approve برداشت.
- یک Dependency Scan در CI اضافه شود تا آسیب‌پذیری critical جلوی deploy را بگیرد.

---

# ۵. بررسی کامل قابلیت‌ها

## ۵.۱ Home و Progress برداشت

### نقاط خوب

- `withdrawalProgress` از موجودی GRAM و حداقل برداشت محاسبه می‌شود.
- Level و Badge از امتیاز Ledger محاسبه می‌شود.
- اطلاعات Home از API گرفته می‌شود و صرفاً hard-code نیست.

### نقاط قابل بهبود

- باید واضح نوشته شود که Progress بر اساس **GRAM قابل برداشت** است، نه مجموع Points.
- اگر rate یا حداقل برداشت تغییر کند، کاربر باید اثر آن را ببیند.
- بهتر است سه مقدار هم‌زمان نمایش داده شود: موجودی فعلی، حداقل لازم، مقدار باقی‌مانده.
- در صورت ناهماهنگی Ledger، Progress فعلی User ممکن است با تاریخچه اختلاف داشته باشد.

## ۵.۲ Daily Check-in و Streak

### خوب

- Check-in روزانه در برابر درخواست هم‌زمان محافظت شده است.
- Streak هفت‌روزه شانس Spin می‌دهد.
- پیام Streak at Risk به سه زبان وجود دارد.

### مشکل

Reminder هر ۱۰ دقیقه اجرا می‌شود ولی تنها در یک ساعت دقیق UTC پیام می‌دهد. روی Render Free که سرویس ممکن است Sleep شود، احتمال miss شدن همان ساعت وجود دارد.

### پیشنهاد

- Reminder را با job scheduler خارجی یا Trigger پایدار اجرا کنید.
- زمان‌بندی را به window تبدیل کنید؛ مثلاً اگر امروز ارسال نشده و از ساعت هدف گذشته، در اولین اجرای بعدی ارسال شود.
- timezone کاربر یا timezone عملیاتی سرویس را شفاف کنید.
- برای هر پیام، status ارسال موفق/ناموفق و دلیل خطا ذخیره شود.

## ۵.۳ Tasks و Special Task

### خوب

- Task منقضی‌شده نمایش داده نمی‌شود.
- ظرفیت با عملیات اتمیک رزرو می‌شود.
- Special Task در مرتب‌سازی اولویت دارد.
- deadline از API قابل انتقال به UI است.

### مشکل

`isSpecialOfDay` فقط Boolean است؛ تاریخ روز، timezone و تاریخ انتخاب Special ذخیره نمی‌شود. بنابراین:

- ممکن است چند Task هم‌زمان Special باشند.
- Special واقعی «امروز» قابل اثبات نیست.
- با گذشت روز، Task قبلی ممکن است همچنان Special باقی بماند.

### پیشنهاد

به‌جای Boolean تنها، این فیلدها اضافه شود:

```text
specialDate: YYYY-MM-DD
specialTimezone: UTC یا timezone عملیاتی
specialRank: عدد اولویت
```

در API فقط Task مربوط به روز جاری Special اعلام شود. همچنین در Admin برای Special قبلی هشدار و reset خودکار قرار گیرد.

## ۵.۴ Referral

### خوب

- سه مرحله‌ی ۱۰، ۲۰ و ۵۰ active invited users وجود دارد.
- Claim هر مرحله فقط یک‌بار انجام می‌شود.
- Progress به شکل مستقل برای هر Task رندر می‌شود.
- شرط active بودن دعوت‌شده به Task approved متصل شده است.

### ضعف‌ها

- مشکل sweep ضدتقلب که در بخش P0 توضیح داده شد.
- `referralBonusAwarded` پیش از اتمام کامل پرداخت True می‌شود؛ در صورت حذف referrer یا failure، ممکن است پاداش از دست برود.
- کد Referral با `Math.random()` ساخته می‌شود؛ برای شناسه‌ی عمومی بهتر است `crypto.randomBytes()` استفاده شود و در collision retry انجام شود.
- Referral stage reward و referral activation دو منطق مجزا دارند و باید از helper eligibility مشترک استفاده کنند.

## ۵.۵ Spin

### خوب

- Spin پولی فقط وقتی موجودی کافی است هزینه را کم می‌کند.
- وزن‌ها validate می‌شوند.
- تست بازده اقتصادی وجود دارد.
- میانگین بازده پیش‌فرض کمتر از هزینه‌ی Spin است.

### پیشنهاد

- نتیجه‌ی هر Spin باید در Ledger با شناسه‌ی یکتا ذخیره شود.
- برای audit، `paid/free` و وزن نسخه‌ی تنظیمات در رکورد ذخیره شود.
- سیاست تغییر وزن‌ها برای کاربر شفاف شود.

## ۵.۶ Wallet، Exchange و Withdrawal

### خوب

- Exchange دوطرفه شرط موجودی دارد.
- حداقل برداشت بررسی می‌شود.
- آدرس از نظر فرمت اولیه validate می‌شود.
- approve برداشت به Transaction Hash و بررسی TON متصل است.
- TxID تکراری برای برداشت دیگر ممنوع شده است.
- Timeline وضعیت برداشت برای کاربر نمایش داده می‌شود.

### مشکلات

- Validation آدرس فعلی یک regex عمومی است و اعتبار واقعی آدرس TON را تضمین نمی‌کند.
- مسیر refund در Reject/Cancel باید transaction-based شود.
- Record Ledger برای exchange و refund نباید fire-and-forget باشد.
- در UI باید کاملاً مشخص شود که GRAM، Points و ارز واقعی چه تفاوتی دارند.
- قبل از Submit نهایی، هشدار واضح درباره‌ی غیرقابل‌برگشت‌بودن انتقال بلاکچینی اضافه شود.

## ۵.۷ Transaction History و Proof

### خوب

- History شخصی cursor-based است.
- Proof عمومی نام و username کاربر را نشان نمی‌دهد.
- آدرس‌ها کوتاه می‌شوند.
- لینک Tonviewer برای TxHash وجود دارد.

### تناقض اعتماد عمومی

متن Proof می‌گوید هر پرداخت «واقعی و independently verifiable» است، اما API می‌تواند رکورد paid با `verified: false` یا حتی بدون TxHash داشته باشد و UI هم برای آن عبارت `Sent — manual review` نشان می‌دهد.

### پیشنهاد

سه وضعیت را از هم جدا کنید:

1. `paid + verified + txHash`: Verified on-chain
2. `paid + !verified`: Paid, pending public verification
3. بدون txHash: اصلاً در Proof عمومی نمایش داده نشود

متن Hero صفحه نیز باید از ادعای مطلق به متن دقیق‌تر تغییر کند.

## ۵.۸ Weekly Leaderboard

### خوب

- هفته بر اساس UTC از دوشنبه تا یکشنبه محاسبه می‌شود.
- امتیاز از Ledger مثبت و نوع‌های مشخص محاسبه می‌شود.
- جوایز از Settings قابل تنظیم است.
- Award دارای unique index روی `(weekKey, rank)` است.
- Admin می‌تواند هفته‌ی گذشته را مشاهده و پرداخت کند.

### مشکلات

- خطر double-pay در صورت شکست Ledger همان‌طور که در P0-A توضیح داده شد.
- policy تساوی شفاف نیست؛ مرتب‌سازی `_id` برای کاربر قابل فهم نیست.
- گزینه‌ی `force=true` برای پرداخت هفته‌ی جاری وجود دارد؛ برای production باید فقط در test environment فعال باشد یا نیازمند تأیید دومرحله‌ای باشد.
- reset هفتگی به‌صورت محاسباتی انجام می‌شود؛ بهتر است وضعیت هفته و زمان نهایی‌شدن نیز برای audit ذخیره شود.

## ۵.۹ Admin Panel

### خوب

- مدیریت Task، Withdrawal، Channels، Settings، کاربران، Referral Risk، Awards، Financial Audit و Ops Metrics وجود دارد.
- Pagination برای بخش‌های اصلی اضافه شده است.
- عملیات مالی مهم log می‌شوند.
- Session کوتاه‌مدت بهتر از ارسال مکرر کلید است.

### مشکلات

- فایل `public/admin.html` بسیار بزرگ و monolithic است؛ نگهداری و تست آن دشوار شده است.
- legacy `x-admin-key` هنوز فعال است. تا زمان حذف کامل، یک مسیر قدیمی برای حمل کلید اصلی باقی می‌ماند.
- Sessionها در memory پردازش ذخیره می‌شوند؛ با restart یا چند instance، رفتار پایدار نیست.
- عملیات مهم مانند پرداخت جایزه بهتر است نیازمند تأیید دومرحله‌ای یا حداقل confirmation با نمایش مبلغ کل باشد.

---

# ۶. امنیت Production

## موارد موجود

- HMAC Telegram
- expire برای initData
- rate limit
- security headers پایه
- Admin session
- فیلتر کاربران Block شده از پیام‌ها
- هش شبکه به‌جای ذخیره‌ی IP خام برای Referral Risk
- بررسی دستی Referral پرریسک

## مواردی که باید اصلاح شوند

### ۶.۱ CORS

در `server.js` اگر `ALLOWED_ORIGINS` خالی باشد، همه‌ی Originها مجاز می‌شوند. در production باید مقدار دقیق دامنه تنظیم شود، مثلاً فقط دامنه Render و دامنه‌های رسمی مورد نیاز.

### ۶.۲ CSP و XSS

Content Security Policy تعریف نشده است. با توجه به inline scriptها و inline handlerهای زیاد، اجرای CSP نیازمند refactor تدریجی است، اما دست‌کم باید گزارش‌گیری CSP و حذف تدریجی `onclick` اضافه شود.

### ۶.۳ Admin Session

برای یک instance فعلی قابل استفاده است، اما:

- با restart sessionها از بین می‌روند.
- با scale-out بین instanceها share نمی‌شوند.
- session token در `sessionStorage` است و در برابر XSS همان صفحه محافظت مطلق ندارد.

پیشنهاد: Cookie با `HttpOnly`, `Secure`, `SameSite=Strict` و در صورت scale استفاده از Redis/DB.

### ۶.۴ initData آینده

کد عمر initData را برای قدیمی‌بودن بررسی می‌کند، اما auth_date بیش از حد آینده را به‌طور صریح رد نمی‌کند. یک clock-skew محدود، مثلاً ۵ دقیقه، اضافه شود.

### ۶.۵ Rate limit در حافظه

rate limit فعلی:

- با restart پاک می‌شود.
- در چند instance قابل دورزدن است.
- برای تعداد IP زیاد در memory رشد می‌کند.

برای scale استفاده از Redis یا rate limiter مستقل مناسب‌تر است.

---

# ۷. کارایی و مقیاس‌پذیری

1. `referralSweep` روی همه‌ی Userها `find({})` انجام می‌دهد؛ با رشد دیتابیس کند می‌شود.
2. Financial Audit تا ۱۰هزار User را یک‌جا می‌خواند.
3. Broadcast همه‌ی کاربران را یک‌جا به memory می‌آورد.
4. Reminder نیز candidates را یک‌جا می‌خواند.
5. `GET /api/tasks` همه‌ی Completionهای کاربر را بدون pagination می‌گیرد.
6. Background intervalها در هر instance جدا اجرا می‌شوند و در scale ممکن است Reminder یا Sweep تکراری اجرا شود.
7. عملیات طولانی Telegram بهتر است وارد queue شود تا request اصلی منتظر نماند.

### پیشنهاد معماری

- ایجاد Job/Outbox collection
- lock توزیع‌شده برای Reminder و Sweep
- pagination/cursor برای broadcast و audit
- batchهای قابل resume
- index روی queryهای پرمصرف
- metrics برای زمان query و تعداد failure

---

# ۸. UI/UX و طراحی

## چیزهایی که حفظ شوند

- ظاهر کارت‌محور و موبایل‌محور
- رنگ اصلی بنفش و accent طلایی
- Bottom navigation
- Badgeهای Done، Reward و Level
- نمایش Progress و Streak
- سه زبان موجود
- صفحات عمومی با ظاهر مستقل و خوانا

## چیزهایی که بهتر شوند

### ۸.۱ پیچیدگی CSS

در `public/css/style.css` چند گروه selector دوباره تعریف شده‌اند؛ برای نمونه `taskList`, `taskItem`, `taskIcon`, `taskTitle`, `taskDesc`, `taskAction`, `profileItem` و `leaderboardItem` بیش از یک‌بار تعریف شده‌اند. این کار نتیجه‌ی بصری فعلی را خراب نمی‌کند، اما توسعه‌ی بعدی را پرریسک می‌کند.

پیشنهاد: CSS را به فایل‌های زیر تقسیم کنید:

```text
base.css
components.css
tasks.css
wallet.css
profile.css
public-pages.css
```

### ۸.۲ متن‌های قدیمی یا پرریسک

در i18n هنوز عبارت‌هایی مانند موارد زیر وجود دارد:

- `PREMIUM REWARDS`
- `converted into real coins`
- Deposit / واریز، در حالی که Deposit فعال نیست
- عبارت‌های بسیار قطعی درباره‌ی «واقعی» بودن درآمد یا پرداخت

این متن‌ها ممکن است برای کاربر یا تیم Moderation این تصور را بسازند که محصول وعده‌ی درآمد تضمینی یا سرویس مالی می‌دهد. متن‌ها باید دقیقاً با Terms و وضعیت واقعی پرداخت هماهنگ شوند.

### ۸.۳ زبان و دسترسی

- صفحات Terms، Privacy، Rewards، Withdrawal و Support فعلاً انگلیسی هستند و دکمه‌ی زبان آن‌ها به Landing برمی‌گردد، نه ترجمه‌ی همان صفحه.
- برای کاربران فارسی/پشتو بهتر است حداقل خلاصه‌ی همان صفحه یا نسخه‌ی ترجمه‌شده فراهم شود.
- برای دکمه‌های صرفاً آیکونی باید `aria-label` اضافه شود.
- focus state، contrast و اندازه‌ی فونت در موبایل واقعی تست شود.
- متن خطاهای مالی باید ساده‌تر و دقیق‌تر باشد.

### ۸.۴ مسیر کاربر واقعی

مسیر کلی قابل فهم است:

```text
Open app → Join required channels → Complete tasks → Earn points → Convert → Withdraw
```

اما دو نقطه می‌تواند کاربر را سردرگم کند:

1. تفاوت Points و GRAM در UI به اندازه‌ی کافی برجسته نیست.
2. Referral active، referral bonus ثابت ۵۰ امتیازی و Referral stages در چند جای مختلف با شرط‌های متفاوت نمایش داده می‌شوند.

پیشنهاد: در یک صفحه‌ی Reward Rules داخل اپ، جدول ساده‌ی زیر نمایش داده شود:

| نوع فعالیت | شرط | پاداش | زمان پرداخت |
|---|---|---:|---|
| Task | تأیید موفق | مقدار Task | فوری پس از تأیید |
| Referral active | حداقل فعالیت دعوت‌شده + عبور از بررسی | طبق تنظیمات | پس از تأیید |
| Referral stage | ۱۰/۲۰/۵۰ دعوت فعال | ۱۰۰/۲۵۰/۱۰۰۰ | Claim دستی |
| Weekly leaderboard | رتبه در پایان هفته | طبق Settings | پس از پایان هفته |

---

# ۹. صفحات عمومی و Ads/Moderation

## خوب

- URLهای عمومی کار می‌کنند و HTTP 200 می‌دهند.
- Terms، Privacy، Rewards، Withdrawal و Support لینک‌های متقابل دارند.
- متن ضدتقلب و عدم تضمین درآمد وجود دارد.
- Support هشدار خوبی درباره‌ی Seed Phrase و Private Key دارد.

## اصلاحات لازم

1. در Support یک راه تماس واقعی و صریح قرار گیرد؛ مثلاً لینک رسمی ربات یا username رسمی که از config خوانده می‌شود. متن «از گزینه‌ی support استفاده کنید» نباید به گزینه‌ای اشاره کند که در UI واقعاً وجود ندارد.
2. نام اپراتور/شرکت یا حداقل مسئول سرویس و کشور/حوزه‌ی حقوقی در Terms مشخص شود، اگر از نظر کسب‌وکار امکان دارد.
3. ادعای Proof فقط برای تراکنش‌های دارای TxHash و verification کامل نمایش داده شود.
4. Landing نباید بگوید تبدیل و برداشت «واقعی» همیشه در دسترس است؛ باید محدودیت منطقه، موجودی، بررسی دستی و availability را نیز در همان صفحه خلاصه کند.
5. متن صفحات عمومی باید با متن داخل Mini App یکسان باشد؛ به‌خصوص درباره‌ی Deposit، Real Coins و Withdrawal.
6. تاریخ آخرین به‌روزرسانی صفحات بعد از هر تغییر واقعی به‌روزرسانی شود.

---

# ۱۰. برنامه‌ی اصلاحات اولویت‌بندی‌شده

## فاز فوری — قبل از تبلیغات گسترده یا پرداخت خودکار

1. **تراکنش اتمیک User + Ledger + Award/Withdrawal**
2. **اصلاح Referral Sweep برای حذف Referral پرریسک و مسدودشده**
3. **رفع double-pay در Weekly Award retry**
4. **اصلاح refund برداشت در Reject/Cancel با transaction و idempotency**
5. **تصمیم نهایی درباره Manual Task و تکمیل upload/review آن یا حذف گزینه**
6. **ارتقای dependencyهای critical و تست کامل Telegram/TON**
7. **تنظیم `ALLOWED_ORIGINS` روی دامنه‌های دقیق production**

## فاز دوم — hardening و مقیاس

8. حذف legacy `x-admin-key` پس از یک دوره‌ی سازگاری
9. انتقال Admin session و rate limit به Cookie امن و Redis/DB در صورت scale
10. افزودن CSP و حذف inline event handlerها
11. تبدیل Reminder و Referral Sweep به Job پایدار با distributed lock
12. pagination/cursor برای Broadcast، Audit، Reminder و Task Completions
13. ذخیره‌ی رویدادهای مالی شکست‌خورده برای retry و alert
14. ثبت سیاست تساوی Leaderboard و حذف `force=true` از production
15. تبدیل Special Task از Boolean به تاریخ‌محور با timezone

## فاز سوم — UX و اعتماد

16. شفاف‌سازی تفاوت Points، GRAM، rate و minimum withdrawal
17. اصلاح متن‌های `PREMIUM`, `real coins`, `Deposit` و ادعاهای قطعی پرداخت
18. افزودن صفحه‌ی Reward Rules داخل Mini App
19. ترجمه‌ی صفحات عمومی به فارسی و پشتو یا حداقل ایجاد خلاصه‌ی چندزبانه
20. اضافه‌کردن Support username/link واقعی
21. refactor فایل CSS و جداکردن Admin HTML به ماژول‌های کوچک‌تر
22. تست accessibility، contrast، keyboard focus و موبایل‌های کوچک
23. اضافه‌کردن تست E2E برای login، membership gate، task claim، exchange، withdraw و admin award

---

# ۱۱. نتیجه نهایی

Gramup از نظر هویت بصری، دامنه‌ی قابلیت‌ها و پایه‌ی فنی، پروژه‌ای جدی‌تر از یک نمونه‌ی خام است. احراز هویت تلگرام، عضویت اجباری، Streak، Referral stage، Level، Spin، Wallet، Leaderboard، Admin Panel و صفحات عمومی در یک ساختار منسجم کنار هم قرار گرفته‌اند و تست‌های موجود نیز موفق هستند.

اما «موفق بودن تست‌های منطق خالص» به‌تنهایی به معنی آماده‌بودن سیستم برای پول و کاربر زیاد نیست. مهم‌ترین کار بعدی باید افزایش قابلیت جدید نباشد؛ بلکه باید **یکپارچگی مالی، idempotency، ضدتقلب Referral و مسیر کامل Manual Task** اصلاح شوند. بعد از آن، dependencyها، jobهای background و security hardening تکمیل شوند.

اگر این اولویت‌ها اجرا شوند، پروژه از وضعیت فعلی MVP پیشرفته به یک سرویس قابل‌اعتمادتر، قابل‌ممیزی‌تر و مناسب‌تر برای تبلیغات و رشد واقعی تبدیل خواهد شد.
