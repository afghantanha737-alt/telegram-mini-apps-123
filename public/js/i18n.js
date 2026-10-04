GRAMUP VIP PURCHASE ERROR — DEBUG AND FIX ONLY

The VIP UI design is now correct. DO NOT change the design.

CURRENT PROBLEM:
When a user clicks "Buy" on a VIP plan and confirms the purchase, the purchase fails.

The app displays an error similar to:

"تنظیمات یا شناسه پلان VIP معتبر نیست"

The VIP purchase must work correctly.

TASK:

Find the exact reason why the selected VIP Plan ID/configuration is considered invalid during purchase.

Check the complete purchase flow:

1. VIP plan displayed in the UI
2. Plan ID passed when clicking Buy
3. Selected plan state
4. Purchase request/API payload
5. Backend VIP plan lookup
6. Database/configuration lookup
7. Validation of the VIP Plan ID
8. Purchase confirmation response

Identify the actual mismatch or missing configuration.

IMPORTANT:
Do NOT guess the solution.

First trace the existing code and determine exactly where the invalid Plan ID/configuration error is generated.

Then fix ONLY the cause of this purchase error.

STRICT RULES:

DO NOT change:

- VIP UI design
- VIP card design
- Colors
- Layout
- Typography
- Navigation
- Home
- Tasks
- Spin
- Wallet
- Profile
- Referral
- Transaction History
- Admin Panel
- Reward calculations
- Daily rewards
- Principal return logic

Do NOT change VIP prices or rewards.

Do NOT create a new VIP purchase system.

Use the existing purchase system and fix only the broken Plan ID/configuration connection.

After fixing, verify that:

- VIP 1 can be selected correctly
- VIP 2 can be selected correctly
- VIP 3 can be selected correctly
- The correct Points price is charged
- The correct VIP plan is activated
- Existing VIP functionality remains unchanged

IMPORTANT FILE RULE:

Modify only the minimum necessary file(s) required to fix the actual error.

Do not refactor unrelated code.

FINAL RESPONSE:

Tell me:

1. The exact cause of the error.
2. The exact file(s) that were modified.
3. The complete final content of every modified file.

Do NOT return snippets.

Do NOT change anything unrelated to the VIP purchase error.