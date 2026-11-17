import webpush from 'web-push';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/run-check') {
      const force = url.searchParams.get('force') === 'true';
      const profile = url.searchParams.get('profile') === 'test' ? 'test' : 'her';
      await checkAndSend(env, { force, profile });
      return new Response('ran check for profile "' + profile + '"' + (force ? ' (forced)' : '') + ' — see wrangler tail or Observability for what happened');
    }
    return new Response('hydro-push-worker is running');
  },

  async scheduled(event, env, ctx) {
    // cron always runs against her real profile only — never the test sandbox
    ctx.waitUntil(checkAndSend(env, { profile: 'her' }));
  }
};

async function checkAndSend(env, opts) {
  const force = opts && opts.force;
  const profile = (opts && opts.profile) || 'her';
  const base = env.FIREBASE_DB_URL.replace(/\/$/, '') + '/profiles/' + profile;

  const [settingsRes, entriesRes, subRes] = await Promise.all([
    fetch(base + '/settings.json'),
    fetch(base + '/entries.json'),
    fetch(base + '/pushSubscription.json')
  ]);

  const settings = (await settingsRes.json()) || {};
  const entriesObj = (await entriesRes.json()) || {};
  const subscription = await subRes.json();

  if (!subscription || !subscription.endpoint) {
    console.log('no push subscription saved yet');
    return;
  }

  const { dateStr: todayLocal, minutes: curMinutes } = localNow(settings.timezone);

  if (settings.muteDate === todayLocal) {
    console.log('muted today');
    return;
  }

  if (isQuietNow(settings.quietStart, settings.quietEnd, curMinutes)) {
    console.log('quiet hours');
    return;
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC, env.VAPID_PRIVATE);

  // these three are independent — all get a chance to fire in the same run
  await maybeSendWaterReminder(env, base, settings, entriesObj, subscription, force);
  await maybeSendEatReminder(env, base, settings, subscription, force);
  await maybeSendEndOfDaySummary(base, settings, entriesObj, subscription, force, todayLocal, curMinutes);
}

async function maybeSendWaterReminder(env, base, settings, entriesObj, subscription, force) {
  const entries = Object.values(entriesObj);
  const waterEntries = entries
    .filter((e) => e.type === 'water')
    .sort((a, b) => a.ts.localeCompare(b.ts));
  const lastWater = waterEntries[waterEntries.length - 1];
  const hoursSinceWater = lastWater
    ? (Date.now() - new Date(lastWater.ts).getTime()) / 3600000
    : 99;

  if (hoursSinceWater < 1.5 && !force) {
    console.log('logged recently, no water reminder needed');
    return;
  }

  const lastReminderAt = settings.lastReminderAt
    ? new Date(settings.lastReminderAt).getTime()
    : 0;
  if (Date.now() - lastReminderAt < 1.5 * 3600000 && !force) {
    console.log('reminded too recently (water)');
    return;
  }

  const messages =
    settings.messages && settings.messages.length
      ? settings.messages
      : ['drink some water 💧'];
  const text = messages[Math.floor(Math.random() * messages.length)];

  const sent = await sendPush(base, subscription, { title: '💧', body: text }, 'water reminder');
  if (sent) {
    await fetch(base + '/settings.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastReminderAt: new Date().toISOString() })
    });
  }
}

async function maybeSendEatReminder(env, base, settings, subscription, force) {
  if (!settings.eatReminderPending || !settings.eatReminderAt) {
    return;
  }
  const due = new Date(settings.eatReminderAt).getTime() <= Date.now();
  if (!due && !force) {
    console.log('eat reminder scheduled but not due yet');
    return;
  }

  const sent = await sendPush(
    base,
    subscription,
    { title: '🍽️', body: 'did you end up eating something?' },
    'eat reminder'
  );
  if (sent) {
    await fetch(base + '/settings.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eatReminderPending: false })
    });
  }
}

async function maybeSendEndOfDaySummary(base, settings, entriesObj, subscription, force, todayLocal, curMinutes) {
  // trigger 15 minutes before quiet hours start (must be >= the 15-min cron interval,
  // or it can land in a gap between ticks and never fire at all — see incident notes).
  // Default to 22:00 (the app's own default quietStart) if she hasn't set one.
  let triggerMinutes = 22 * 60 - 15;
  if (settings.quietStart) {
    const [qh, qm] = settings.quietStart.split(':').map(Number);
    triggerMinutes = ((qh * 60 + qm) - 15 + 1440) % 1440;
  }
  if (curMinutes < triggerMinutes && !force) {
    console.log('end-of-day summary not due yet');
    return;
  }

  if (settings.eodNotifDate === todayLocal && !force) {
    console.log('end-of-day summary already sent today');
    return;
  }

  const goal = settings.goal || 8;
  const timezone = settings.timezone;
  const totals = buildDailyTotals(entriesObj, timezone);
  const todayTotal = totals[todayLocal] || 0;
  const goalReached = todayTotal >= goal;
  const priorStreak = computePriorStreak(totals, goal, todayLocal, timezone);
  const streakAtRisk = !goalReached && priorStreak > 0;

  let payload;
  if (goalReached) {
    payload = { title: '🎉', body: `goal hit today (${todayTotal}/${goal}), amazing job gozlerim!` };
  } else if (streakAtRisk) {
    payload = { title: '😔', body: `you're about to lose your ${priorStreak}-day streak, few glasses will keep it alive!` };
  } else if (todayTotal >= goal * 0.5) {
    payload = { title: '💧', body: `so close! ${todayTotal}/${goal} today, a few more sips and you ll be wet enough for today` };
  } else {
    payload = { title: '😔', body: `today was so dry (${todayTotal}/${goal}) let's make it a bit wetter` };
  }

  const label = goalReached ? 'end-of-day summary (goal hit)' : streakAtRisk ? 'end-of-day summary (streak at risk)' : 'end-of-day summary';
  const sent = await sendPush(base, subscription, payload, label);
  if (sent) {
    await fetch(base + '/settings.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eodNotifDate: todayLocal })
    });
  }
}

function buildDailyTotals(entriesObj, timezone) {
  const totals = {};
  for (const e of Object.values(entriesObj)) {
    if (e.type !== 'water') continue;
    const day = localDateOfTimestamp(e.ts, timezone);
    totals[day] = (totals[day] || 0) + (e.amount || 0);
  }
  return totals;
}

function computePriorStreak(totals, goal, todayLocal, timezone) {
  let streak = 0;
  let cursor = shiftDateStrByDays(todayLocal, -1, timezone);
  for (let i = 0; i < 365; i++) {
    if ((totals[cursor] || 0) >= goal) {
      streak++;
      cursor = shiftDateStrByDays(cursor, -1, timezone);
    } else {
      break;
    }
  }
  return streak;
}

function localDateOfTimestamp(ts, timezone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date(ts));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftDateStrByDays(dateStr, deltaDays, timezone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // anchor at noon UTC to dodge DST edge cases, then shift and reformat in target timezone
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  return localDateOfTimestamp(anchor.toISOString(), timezone);
}

async function sendPush(base, subscription, payload, label) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log(label + ' sent:', payload.body);
    return true;
  } catch (err) {
    console.error(label + ' failed', err.statusCode, err.body);
    if (err.statusCode === 404 || err.statusCode === 410) {
      // subscription is dead (revoked, uninstalled, etc.) — clear it
      await fetch(base + '/pushSubscription.json', { method: 'DELETE' });
    }
    return false;
  }
}

function isQuietNow(quietStart, quietEnd, curMinutes) {
  if (!quietStart || !quietEnd) return false;
  const [sh, sm] = quietStart.split(':').map(Number);
  const [eh, em] = quietEnd.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return curMinutes >= start && curMinutes < end;
  return curMinutes >= start || curMinutes < end; // wraps past midnight
}

function localNow(timezone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const minutes = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    return { dateStr, minutes };
  } catch (e) {
    // fall back to UTC if the timezone string is missing/invalid
    const now = new Date();
    return {
      dateStr: now.toISOString().slice(0, 10),
      minutes: now.getUTCHours() * 60 + now.getUTCMinutes()
    };
  }
}
