# راهنمای راه‌اندازی (قدم به قدم، فقط با گوشی)

## مرحله ۱ - آپلود فایل‌ها در گیت‌هاب
1. وارد ریپازیتوری `telegram-mini-apps-123` شو.
2. گزینه‌ی **Add file → Upload files** رو بزن.
3. همه‌ی فایل‌ها و پوشه‌های داخل این پروژه (server.js، package.json، پوشه‌های models، routes، utils، public) رو با همین ساختار آپلود کن.
   - نکته: موقع آپلود پوشه‌ها، گیت‌هاب موبایل معمولاً از تو می‌خواد فایل‌ها رو تک‌تک بکشی داخل باکس آپلود؛ اگر مرورگرت اجازه‌ی درگ‌اند‌دراپ پوشه نداد، هر فایل رو جدا آپلود کن و مسیرش رو دستی بنویس (مثلاً هنگام آپلود User.js اسمش رو بذار `models/User.js`).
4. پایین صفحه دکمه‌ی **Commit changes** رو بزن.

## مرحله ۲ - ساخت دیتابیس رایگان (MongoDB Atlas)
1. برو mongodb.com/cloud/atlas و ثبت‌نام کن (رایگان).
2. یک Cluster رایگان (M0) بساز.
3. توی بخش **Database Access** یک یوزر و پسورد بساز.
4. توی بخش **Network Access** گزینه‌ی Allow Access from Anywhere (0.0.0.0/0) رو بزن.
5. روی Cluster بزن **Connect → Drivers** و رشته‌ی اتصال (connection string) رو کپی کن. شبیه این است:
   `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/mydb`

## مرحله ۳ - ساخت سرویس در Render
1. برو render.com و با گیت‌هاب وارد شو.
2. New → Web Service رو بزن و ریپازیتوری `telegram-mini-apps-123` رو انتخاب کن.
3. تنظیمات:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. بخش **Environment** رو باز کن و این متغیرها رو اضافه کن:
   - `BOT_TOKEN` = توکن ربات از بات‌فادر
   - `MONGO_URI` = همون رشته‌ی اتصالی که از Atlas گرفتی
   - `ADMIN_SECRET` = یک رمز طولانی و تصادفی (خودت بساز)
   - `POINTS_TO_CRYPTO_RATE` = مثلا 1000
5. Deploy رو بزن. بعد از چند دقیقه یک آدرس مثل `https://telegram-mini-apps-123.onrender.com` بهت میده.

## مرحله ۴ - وصل کردن آدرس به ربات
1. توی بات‌فادر برو `/mybots` → ربات خودت → **Bot Settings → Menu Button** یا همون بخشی که مینی‌اپ رو ست کرده بودی.
2. آدرس Render رو (همون که در مرحله ۳ گرفتی) به عنوان URL مینی‌اپ ست کن.

## مرحله ۵ - اضافه کردن اولین تسک (از طریق پنل ادمین ساده)
چون پنل تصویری ادمین هنوز نساختیم، فعلاً از طریق یک درخواست HTTP تسک اضافه می‌کنیم. ساده‌ترین راه با گوشی: اپ‌های رایگان مثل **HTTP Shortcuts** یا حتی سایت reqbin.com.

درخواست باید این شکلی باشه:
- Method: POST
- URL: `https://آدرس-رندر-تو/api/admin/tasks`
- Header: `x-admin-secret: همون رمزی که در Render ست کردی`
- Header: `Content-Type: application/json`
- Body:
```json
{
  "title": "عضویت در کانال ما",
  "description": "توضیح کوتاه",
  "link": "https://t.me/yourchannel",
  "pointsReward": 20
}
```

## نکات مهم که باید بدونی
- الان بخش «برداشت» فقط یک **درخواست** ثبت می‌کنه؛ ارسال واقعی کریپتو هنوز وصل نشده. باید دستی از طریق `/api/admin/withdrawals` تاییدشون کنی، بعداً می‌تونیم به یک درگاه پرداخت کریپتو وصلش کنیم.
- توی فایل `public/js/app.js` جای `YOUR_BOT_USERNAME` باید یوزرنیم واقعی ربات رو بذاری تا لینک رفرال درست کار کنه.
- سرویس رایگان Render بعد از ۱۵ دقیقه بی‌فعالیتی می‌خوابه و اولین درخواست بعدش ۳۰-۶۰ ثانیه طول می‌کشه؛ برای شروع مشکلی نیست.
