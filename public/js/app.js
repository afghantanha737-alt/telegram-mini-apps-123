GRAMUP VIP PURCHASE — DEEP DEBUG

IMPORTANT:
The VIP UI is already correct. Do NOT change the UI design.

PROBLEM:
When I click Buy on ANY VIP plan and confirm the purchase, the app shows:

"تنظیمات یا شناسه پلان VIP معتبر نیست"

VIP 1, VIP 2, and VIP 3 ALL produce the same error.

A previous attempted fix did NOT solve the problem.

DO NOT create another random replacement file.

FIRST FIND THE REAL CAUSE.

Trace the complete purchase flow:

VIP card
→ selected VIP plan ID
→ Buy button
→ confirmation
→ frontend request
→ API endpoint
→ backend validation
→ VIP plan configuration
→ database/config
→ purchase transaction

Check specifically:

- What exact plan ID is sent for VIP 1, VIP 2, VIP 3?
- What exact plan ID does the backend expect?
- Where are VIP plans configured?
- Is the configuration loaded correctly?
- Is the frontend using the same IDs as the backend?
- Is the API endpoint correct?
- Is the request body correct?
- Is authentication/session data reaching the API?
- Is the backend returning the error before the purchase transaction?
- Is there a mismatch between numeric IDs and string IDs?
- Is the VIP configuration missing, disabled, or using different names?
- Is the recently uploaded file actually being used by the deployed application?

IMPORTANT:

Do NOT guess.

Locate the exact line/function that generates:

"تنظیمات یا شناسه پلان VIP معتبر نیست"

Then trace backward from that error until you find the actual invalid value or missing configuration.

Fix the ROOT CAUSE only.

Do NOT change:

- VIP prices
- VIP rewards
- Daily rewards
- 30-day duration
- Purchase business logic
- Claim logic
- Principal return
- Transaction History
- UI design
- Colors
- Layout
- Navigation
- Home
- Tasks
- Spin
- Wallet
- Profile
- Referral
- Admin Panel

Do NOT create a new VIP purchase system.

Use the existing system.

After fixing, verify all three plans:

VIP 1 → 1,000 Points
VIP 2 → 2,000 Points
VIP 3 → 3,000 Points

Each must send the correct plan ID and successfully reach the existing purchase logic.

If the problem is caused by a backend configuration, fix the backend configuration instead of changing the UI.

If the problem is caused by the frontend ID, fix the ID mapping.

If the problem is caused by API mismatch, fix the request/endpoint.

If the problem is caused by database/config data, identify and fix that exact configuration.

Do NOT stop after changing one frontend file.

FINAL RESPONSE:

Before giving me any file, report:

1. EXACT ROOT CAUSE
2. EXACT FILE AND FUNCTION WHERE THE PROBLEM EXISTS
3. WHAT VALUE/CONFIGURATION IS WRONG
4. WHAT WAS CHANGED TO FIX IT

Then provide the COMPLETE CONTENT of ONLY the file(s) that actually need modification.

Do not provide unrelated files.
Do not provide snippets.
Do not redesign anything.