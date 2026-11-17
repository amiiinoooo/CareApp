# 💧 CareApp: Hydration Reminder Web App

A lightweight, installable web app (PWA) that helps you drink enough water every day. Log glasses in one tap, keep a streak going, and get gentle reminder notifications, even when the app is closed.

Built with plain **HTML, CSS and JavaScript**: no framework, no build step.

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
| Offline | Local storage cache |

## Project structure

```
index.html   # the whole app: UI, styles and logic
sw.js        # service worker: shows push notifications and handles clicks
test.html    # sandbox build that reads/writes a separate test profile
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
- Real-time sync and offline-first caching with Firebase
- Designing a small, mobile-first UI
