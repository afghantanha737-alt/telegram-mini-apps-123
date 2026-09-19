# AdsGram setup

The app uses one AdsGram Reward block. The server callback records one completed ad and awards the daily milestones:

- 5 ads: 10 points
- 15 ads: 10 points
- 30 ads: 20 points

## 1. Create the AdsGram block

In the AdsGram publisher dashboard:

1. Create or open a Reward/Rewarded block for this Mini App.
2. Copy the numeric block ID.
3. Set the block's Reward URL to the URL below, replacing `YOUR_DOMAIN` and `YOUR_SECRET`.

```text
https://YOUR_DOMAIN/api/ads/reward?userid=[userId]&token=YOUR_SECRET
```

`[userId]` must remain exactly as written. AdsGram replaces it with the Telegram user ID.

## 2. Add deployment variables

Use `.env.example` as the project's variable checklist. Add the real values to the server deployment settings, not to frontend files:

```env
ADSGRAM_BLOCK_ID=123
ADSGRAM_REWARD_SECRET=replace-with-a-long-random-secret
ADSGRAM_DEBUG=false
```

Use the same value for `ADSGRAM_REWARD_SECRET` and `YOUR_SECRET` in the Reward URL. Use a long random value and never publish it in GitHub, HTML, JavaScript, or screenshots.

The existing deployment must also continue to have its normal variables, especially `MONGO_URI` and `BOT_TOKEN`.

## 3. Redeploy and check configuration

After saving the variables, restart or redeploy the server. Open this URL in a browser:

```text
https://YOUR_DOMAIN/api/ads/config
```

The response should contain:

```json
{
  "success": true,
  "enabled": true,
  "blockId": "123"
}
```

The response must not contain the secret.

## 4. Test the live flow

1. Open the Mini App from Telegram.
2. Open the Daily tab.
3. Tap `Watch an ad` and watch the ad until it finishes.
4. Wait a few seconds for the AdsGram callback.
5. Confirm that today's counter increases by one.
6. Confirm that the first milestone awards 10 points on the fifth completed ad.

The server callback is the source of truth. Closing an ad early must not award points, and refreshing the app must not award the same ad twice.

AdsGram debug views do not trigger the Reward URL. `ADSGRAM_DEBUG=true` is useful only for checking the UI and does not grant points. Set it back to `false` for production.

## Notes

- The daily reset uses the same UTC day boundary as the existing daily check-in logic, which corresponds to 04:30 in Afghanistan.
- The reward callback uses a MongoDB transaction. MongoDB Atlas works; a standalone MongoDB server must support transactions through a replica set.
- If the UI says ads are not configured, check `ADSGRAM_BLOCK_ID` and restart the server.
- If ads play but the counter does not increase, check that the Reward URL is exact and that its secret matches `ADSGRAM_REWARD_SECRET` character-for-character.
