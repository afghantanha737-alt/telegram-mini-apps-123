# Referral Audit خودکار و غیرمخرب

این قابلیت کاربران دعوت‌شده را با چند سیگنال دسته‌بندی می‌کند و **هیچ Ban، کسر امتیاز، حذف کاربر یا رد خودکار Withdrawal انجام نمی‌دهد**.

## دسته‌بندی

- `low`: سیگنال کم‌خطر
- `review`: نیازمند بررسی Admin
- `high`: ریسک بالا و اولویت بررسی دستی

این دسته‌بندی به‌تنهایی اثبات قطعی تقلب نیست.

## API Admin

تمام endpointها به احراز هویت پنل Admin نیاز دارند.

### گزارش بدون ذخیره‌سازی

```text
GET /api/admin/referral-audit?status=high&minScore=30&limit=500
```

این endpoint گزارش تازه می‌سازد و چیزی را تغییر نمی‌دهد.

### ذخیره دسته‌بندی‌ها

```text
POST /api/admin/referral-audit/run
Content-Type: application/json

{}
```

یا برای یک کاربر:

```json
{"userId":"MONGO_USER_ID"}
```

این endpoint فقط فیلدهای Audit را روی User ذخیره می‌کند:

```text
referralAuditStatus
referralAuditScore
referralAuditFlags
referralAuditedAt
```

هیچ موجودی، Withdrawal، Referral Claim یا وضعیت Ban تغییر نمی‌کند.

## اجرای CLI روی سرور

حالت پیش‌فرض dry-run است:

```bash
npm run audit:referrals
```

خروجی JSON:

```bash
npm run audit:referrals -- --json --limit 1000
```

فقط کاربران high:

```bash
npm run audit:referrals -- --json | jq '.users[] | select(.status == "high")'
```

ذخیره دسته‌بندی‌ها فقط با دستور صریح:

```bash
npm run audit:referrals -- --apply --limit 5000
```

برای اجرای یک کاربر مشخص:

```bash
npm run audit:referrals -- --user-id MONGO_USER_ID --json
```

## سیگنال‌های مورد استفاده

- `referralRiskScore` و `referralRiskBlocked`
- کمتر از ۳ Task تأییدشده
- فعالیت در کمتر از ۲ روز متفاوت
- حساب جوان‌تر از ۷ روز
- چند حساب با یک `signupIpHash`
- Burst چند Referral از یک دعوت‌کننده در یک ساعت
- Withdrawal قبل از معتبرشدن Referral
- ثبت پاداش Referral قبل از تکمیل شرایط
- نداشتن هیچ Task تأییدشده

## روند پیشنهادی بررسی

1. ابتدا dry-run اجرا شود.
2. کاربران `high` و سپس `review` بررسی شوند.
3. سوابق Task، Referral، Ledger و Withdrawal با هم مقایسه شوند.
4. فقط پس از تأیید دستی، برای کسر امتیاز یا Reverse مالی اقدام جداگانه انجام شود.

## اعتبارسنجی

Syntax Check همه JavaScriptها و کل `npm test` با موفقیت اجرا شده است.
