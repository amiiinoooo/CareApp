# 💧 CareApp: Hydration Reminder Web App

A lightweight, installable web app (PWA) that helps you drink enough water every day. Log glasses in one tap, keep a streak going, and get gentle reminder notifications, even when the app is closed.

Built with plain **HTML, CSS and JavaScript**: no framework, no build step.

### 🔗 [Live demo](https://amiiinoooo.github.io/CareApp/test.html)

The demo runs on a separate **test profile**, so feel free to log water, change settings and play around.

## Features

- **One-tap logging**: +1 / +2 glasses or a custom amount, with progress toward a daily goal (default 8 glasses)
- **Streak calendar**: monthly view of the days the goal was met, with per-day details
- **Daily log**: browse, add (backfill) or delete entries for any day
- **Push reminders**: delivered through a service worker (`sw.js`), so they work even when the app is closed
- **Quiet hours & mute**: no reminders at night, or for the rest of the day
- **Custom reminder messages**: write your own rotating messages shown in notifications
- **Meal & mood check-ins**: quick "did you eat today?" and mood prompts
- **Real-time cloud sync** with Firebase Realtime Database, plus a local cache for offline use
- **Export**: download the whole log as a backup file
- **Installable**: add to Home Screen on iOS/Android for a native-app feel

## Tech stack

| Part | Technology |
|---|---|
| UI | HTML5, CSS3, vanilla JavaScript |
| Data & sync | Firebase Realtime Database |
| Notifications | Service Worker + Web Push (VAPID) |
| Push server | Cloudflare Worker (cron every 15 min) + `web-push` |
| Offline | Local storage cache |

## Project structure

```
index.html          # the whole app: UI, styles and logic
sw.js               # service worker: shows push notifications and handles clicks
test.html           # demo build that reads/writes a separate test profile
worker/             # push-notification server (Cloudflare Worker)
  src/index.js      # every 15 min: checks progress & quiet hours, sends Web Push reminders
  wrangler.toml     # worker config + cron trigger
```

## Push server

Reminders are sent by a small **Cloudflare Worker** that runs on a cron schedule. Each run reads the user's settings and today's log from Firebase, respects quiet hours and "mute today", and sends a Web Push notification when it's time to drink.

Secrets are never stored in the code; they're set as Worker secrets:

```bash
cd worker
npm install
npx wrangler secret put FIREBASE_DB_URL
npx wrangler secret put VAPID_PUBLIC
npx wrangler secret put VAPID_PRIVATE
npx wrangler secret put VAPID_SUBJECT
npx wrangler deploy
```

## Run locally

Service workers need to be served over HTTP (not opened as a file):

```bash
git clone https://github.com/amiiinoooo/CareApp.git
cd CareApp
python -m http.server 8000
```

Then open <http://localhost:8000/test.html> to try it with the sandbox profile.

To use your own backend, replace the `firebaseConfig` object in `index.html` with your Firebase project's config.

## What I learned

- Building a Progressive Web App without a framework
- Service workers and the Web Push API
- Serverless scheduled jobs with Cloudflare Workers
- Real-time sync and offline-first caching with Firebase
- Designing a small, mobile-first UI
