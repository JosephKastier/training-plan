require('dotenv').config();
const { queries } = require('./db');

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REDIRECT_URI = `https://${process.env.DOMAIN || 'run.kastier.de'}/auth/strava/callback`;
const STRAVA_VERIFY_TOKEN = process.env.STRAVA_VERIFY_TOKEN || 'training-plan-webhook-verify';

// Generate OAuth URL
function getAuthUrl() {
  return `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(STRAVA_REDIRECT_URI)}&approval_prompt=force&scope=activity:read`;
}

// Exchange auth code for tokens
async function exchangeToken(code) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (data.access_token) {
    queries.saveStravaTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete_id: data.athlete?.id
    });
  }
  return data;
}

// Get valid access token (refresh if expired)
async function getAccessToken() {
  const tokens = queries.getStravaTokens();
  if (!tokens) return null;

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Refresh token
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (data.access_token) {
    queries.saveStravaTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete_id: tokens.athlete_id
    });
    return data.access_token;
  }
  return null;
}

// Get activity by ID
async function getActivity(activityId) {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

// Get recent activities
async function getActivities(after, before, page = 1, perPage = 30) {
  const token = await getAccessToken();
  if (!token) return [];

  const params = new URLSearchParams({ page, per_page: perPage });
  if (after) params.set('after', after);
  if (before) params.set('before', before);

  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return [];
  return res.json();
}

// Convert moving_time (seconds) and distance (meters) to pace string "M:SS"
function calculatePace(movingTime, distanceMeters) {
  if (!distanceMeters || distanceMeters === 0) return null;
  const km = distanceMeters / 1000;
  const paceSeconds = movingTime / km;
  const mins = Math.floor(paceSeconds / 60);
  const secs = Math.round(paceSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper: get Monday of a given date's week
function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

// Helper: day abbreviation from date
function getDayAbbr(dateStr) {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return days[new Date(dateStr).getDay()];
}

// Sync a single activity to a run
function syncActivityToRun(activity) {
  // Get the date of the activity in YYYY-MM-DD format
  const activityDate = activity.start_date_local.split('T')[0];

  // Only sync runs (not rides, swims, etc.)
  if (activity.type !== 'Run' && activity.type !== 'TrailRun' && activity.type !== 'VirtualRun') {
    return null;
  }

  const actual_km = Math.round((activity.distance / 1000) * 100) / 100;
  const actual_pace = calculatePace(activity.moving_time, activity.distance);
  const avg_hr = activity.average_heartrate ? Math.round(activity.average_heartrate) : null;
  const polyline = activity.map?.summary_polyline || null;
  const photo_url = activity.photos?.primary?.urls?.['600'] || null;

  // Try direct date match first
  let run = queries.getRunByDate(activityDate);

  if (run) {
    // Direct match – save strava data
    queries.saveStravaData({
      run_id: run.id,
      strava_id: activity.id,
      actual_km, actual_pace, avg_hr,
      elapsed_time: activity.moving_time,
      polyline, photo_url
    });
    if (!run.done) queries.toggleDone(run.id, true);
    return { run, actual_km, actual_pace, avg_hr };
  }

  // No direct match – find week by looking at Monday of this date
  const monday = getMonday(activityDate);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sundayStr = sunday.toISOString().split('T')[0];

  // Get all runs in this date range
  const weekRuns = queries.getRunsByDateRange(monday, sundayStr);
  if (!weekRuns.length) return null;

  // Find an unmatched, non-skipped planned run (no strava_data entry yet)
  const allStrava = queries.getAllStravaData();
  const matchedRunIds = new Set(allStrava.map(s => s.run_id));

  const unmatchedRun = weekRuns.find(r => !matchedRunIds.has(r.id) && !r.skipped && !r.done);
  if (!unmatchedRun) return null;

  // Create a new run entry for the actual day
  const week = unmatchedRun.week;
  const newRun = queries.createRun({
    week,
    date: activityDate,
    day: getDayAbbr(activityDate),
    text: activity.name || `${actual_km} km Lauf`,
    pace: actual_pace,
    type: unmatchedRun.type,
    km: actual_km
  });

  const newRunId = newRun.lastInsertRowid;
  queries.toggleDone(newRunId, true);

  // Save strava data for new run
  queries.saveStravaData({
    run_id: newRunId,
    strava_id: activity.id,
    actual_km, actual_pace, avg_hr,
    elapsed_time: activity.moving_time,
    polyline, photo_url
  });

  // Mark the original planned run as skipped
  queries.markSkipped(unmatchedRun.id);

  return { run: { ...unmatchedRun, id: newRunId }, actual_km, actual_pace, avg_hr };
}

// Sync recent activities (for /sync command or initial sync)
async function syncRecentActivities(days = 30) {
  const now = Math.floor(Date.now() / 1000);
  const after = now - (days * 24 * 60 * 60);

  const activities = await getActivities(after, null, 1, 200);
  const results = [];

  for (const activity of activities) {
    const result = syncActivityToRun(activity);
    if (result) results.push(result);
  }

  return results;
}

// Handle webhook event
async function handleWebhookEvent(event) {
  // Only handle activity create/update events
  if (event.object_type !== 'activity') return;
  if (event.aspect_type !== 'create' && event.aspect_type !== 'update') return;

  const activity = await getActivity(event.object_id);
  if (activity) {
    syncActivityToRun(activity);
  }
}

// Webhook verification (GET request from Strava)
function verifyWebhook(query) {
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === STRAVA_VERIFY_TOKEN) {
    return { 'hub.challenge': query['hub.challenge'] };
  }
  return null;
}

// Create webhook subscription (run once)
async function createWebhookSubscription(callbackUrl) {
  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: STRAVA_VERIFY_TOKEN
    })
  });
  return res.json();
}

// Calculate accuracy between planned and actual
function calculateAccuracy(run, stravaData) {
  if (!stravaData) return null;

  let paceAccuracy = 'green';
  let kmAccuracy = 'green';

  // KM check
  const kmDiff = Math.abs(stravaData.actual_km - run.km) / run.km;
  if (kmDiff > 0.2) kmAccuracy = 'red';
  else if (kmDiff > 0.1) kmAccuracy = 'yellow';

  // Pace check – parse planned pace range (e.g. "5:30–6:00")
  if (run.pace && stravaData.actual_pace) {
    const paceRange = run.pace.match(/(\d+):(\d+)/g);
    if (paceRange && paceRange.length >= 1) {
      const actualParts = stravaData.actual_pace.split(':');
      const actualSeconds = parseInt(actualParts[0]) * 60 + parseInt(actualParts[1]);

      const fastParts = paceRange[0].split(':');
      const fastSeconds = parseInt(fastParts[0]) * 60 + parseInt(fastParts[1]);

      let slowSeconds = fastSeconds;
      if (paceRange.length >= 2) {
        const slowParts = paceRange[1].split(':');
        slowSeconds = parseInt(slowParts[0]) * 60 + parseInt(slowParts[1]);
      }

      // Ensure fast < slow
      const minPace = Math.min(fastSeconds, slowSeconds);
      const maxPace = Math.max(fastSeconds, slowSeconds);

      if (actualSeconds < minPace - 15 || actualSeconds > maxPace + 15) {
        paceAccuracy = 'red';
      } else if (actualSeconds < minPace || actualSeconds > maxPace) {
        paceAccuracy = 'yellow';
      }
    }
  }

  // Worst of both determines overall
  const levels = { green: 0, yellow: 1, red: 2 };
  const overall = levels[paceAccuracy] >= levels[kmAccuracy] ? paceAccuracy : kmAccuracy;

  return { paceAccuracy, kmAccuracy, overall };
}

module.exports = {
  getAuthUrl,
  exchangeToken,
  getAccessToken,
  getActivity,
  getActivities,
  syncActivityToRun,
  syncRecentActivities,
  handleWebhookEvent,
  verifyWebhook,
  createWebhookSubscription,
  calculateAccuracy,
  STRAVA_VERIFY_TOKEN
};
