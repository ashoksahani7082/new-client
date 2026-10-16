# Telegram Inbox Lead Tracking

Vercel landing page + Telegram bot private messages + Redis REST/KV + Meta Pixel and CAPI.

## Files
- `index.html`: landing page and browser PageView.
- `api/telegram-link.js`: creates a unique Telegram deep link and stores click attribution in Redis.
- `api/telegram.js`: receives Telegram private messages and sends one Meta `Subscribe` event after a tracked user sends their first non-command text message.
- `api/setup-webhook.js`: protected endpoint to register Telegram webhook.

## Vercel environment variables
- `TELEGRAM_BOT_TOKEN`: secret from BotFather.
- `TELEGRAM_BOT_USERNAME`: bot username without @ (the endpoint also accepts @).
- `TELEGRAM_WEBHOOK_SECRET`: Telegram webhook secret token; use 1-256 chars from A-Z, a-z, 0-9, underscore, or hyphen.
- `WEBHOOK_SETUP_SECRET`: separate random secret used only to protect webhook setup.
- `APP_BASE_URL`: deployed HTTPS Vercel URL, e.g. https://your-project.vercel.app.
- `KV_REST_API_URL`: Redis/Upstash REST URL.
- `KV_REST_API_TOKEN`: Redis/Upstash REST token.
- `META_PIXEL_ID`: Pixel ID connected to the ad account.
- `META_CAPI_ACCESS_TOKEN`: Meta Conversions API token.
- `META_API_VERSION`: supported Graph API version, e.g. v23.0 if enabled for your app.

Never put tokens in frontend code or commit them to GitHub. Add all environment variables in Vercel Project Settings and redeploy.

## Setup
1. Connect this repository to Vercel as a project (if not already connected).
2. Add all environment variables above in Vercel.
3. Confirm the Pixel ID in `index.html` matches `META_PIXEL_ID`.
4. Deploy.
5. Open `https://YOUR-DEPLOYMENT/api/setup-webhook?key=YOUR_WEBHOOK_SETUP_SECRET` once.
6. Confirm the response says `ok: true`.
7. Open the landing page with Meta campaign parameters, click the Telegram button, send `/start` in the bot, then send a normal text message.
8. Check Vercel logs and Events Manager > Test Events.

## Event logic and limitations
- Browser event: `PageView` on page load.
- Server event: `Subscribe` after the first text message from a tracked Telegram user.
- Button clicks and `/start` do not count as leads.
- This does not count untracked or previously existing Telegram users as attributed leads. A Telegram user must open the tracked deep link and start the bot before messaging.
- Current deduplication is one lead per tracking token and Telegram user for 30 days. The webhook update ID also protects against Telegram retries.
- The event is sent to Meta with `action_source: chat`. Verify acceptance and event matching in Events Manager; Ads Manager attribution is not guaranteed.
- This sample only treats text messages as leads. Extend it deliberately if photo, voice, or other media-only messages should qualify.
