require('dotenv').config();
const express = require('express');
const path = require('path');
const { queries } = require('./db');
const { authMiddleware } = require('./auth');
const strava = require('./strava');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Strava OAuth (no auth required) ---
app.get('/auth/strava', (req, res) => {
  res.redirect(strava.getAuthUrl());
});

app.get('/auth/strava/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect('/?strava=error');
  }
  try {
    await strava.exchangeToken(code);
    // Trigger initial sync
    await strava.syncRecentActivities(60);
    res.redirect('/?strava=connected');
  } catch (err) {
    console.error('Strava OAuth error:', err);
    res.redirect('/?strava=error');
  }
});

// --- Strava Webhook (no auth required) ---
app.get('/webhook/strava', (req, res) => {
  const challenge = strava.verifyWebhook(req.query);
  if (challenge) return res.json(challenge);
  res.status(403).json({ error: 'Invalid verify token' });
});

app.post('/webhook/strava', async (req, res) => {
  // Respond immediately (Strava requires 200 within 2s)
  res.status(200).json({ ok: true });
  // Process async
  try {
    await strava.handleWebhookEvent(req.body);
  } catch (err) {
    console.error('Strava webhook error:', err);
  }
});

// --- Auth for API routes ---
app.use('/api', authMiddleware);

// Login check
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.AUTH_PASSWORD || 'changeme')) {
    return res.json({ token: password });
  }
  return res.status(401).json({ error: 'Wrong password' });
});

// Get all weeks (with strava data)
app.get('/api/weeks', (req, res) => {
  const weeks = queries.getAllWeeks();
  const allStrava = queries.getAllStravaData();
  const stravaMap = {};
  for (const s of allStrava) {
    stravaMap[s.run_id] = s;
  }
  // Attach strava data and accuracy to each run
  for (const week of weeks) {
    for (const run of week.runs) {
      const sd = stravaMap[run.id];
      if (sd) {
        run.strava = sd;
        run.accuracy = strava.calculateAccuracy(run, sd);
      }
    }
  }
  res.json(weeks);
});

// Get progress
app.get('/api/progress', (req, res) => {
  res.json(queries.getRunCount());
});

// Strava connection status
app.get('/api/strava/status', (req, res) => {
  const tokens = queries.getStravaTokens();
  res.json({ connected: !!tokens });
});

// Manual sync
app.post('/api/strava/sync', async (req, res) => {
  try {
    const results = await strava.syncRecentActivities(60);
    res.json({ synced: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle done
app.patch('/api/runs/:id', (req, res) => {
  const { id } = req.params;
  const result = queries.updateRun(Number(id), req.body);
  if (!result) return res.status(400).json({ error: 'Nothing to update' });
  res.json(queries.getRun(Number(id)));
});

// Create run
app.post('/api/runs', (req, res) => {
  const { week, date, day, text, pace, type, km } = req.body;
  if (!week || !date || !day || !text || !type || !km) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const result = queries.createRun({ week, date, day, text, pace, type, km });
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete run
app.delete('/api/runs/:id', (req, res) => {
  queries.deleteRun(Number(req.params.id));
  res.json({ ok: true });
});

// Swap runs
app.post('/api/runs/swap', (req, res) => {
  const { id1, id2 } = req.body;
  queries.swapRuns(id1, id2);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
