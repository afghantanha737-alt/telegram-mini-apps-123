# TADS setup

The app uses a TADS Fullscreen widget as an optional rewarded ad. TADS sends a server webhook after the user views the fullscreen ad, and the server awards the daily milestones:

- 5 ads: 10 points
- 15 ads: 10 points
- 30 ads: 20 points

## Widget settings

Use these settings in TADS:

- Type: `FULLSCREEN BANNER`
- Ads amount in widget: `1`
- Webhook method: `POST`
- Webhook URL:

```text
https://telegram-mini-app12345.onrender.com/api/ads/tads-webhook?token=YOUR_TADS_WEBHOOK_SECRET
```

The webhook secret must be a long random value using URL-safe letters and numbers only. Use the same value in Render as `TADS_WEBHOOK_SECRET`. Do not put the secret in frontend code.

## Render variables

```env
TADS_WIDGET_ID=your-widget-id
TADS_WEBHOOK_SECRET=your-long-random-secret
TADS_DEBUG=false
```

`TADS_WIDGET_ID` is provided after the widget is created. The widget must be created after the updated server and frontend files are deployed.
