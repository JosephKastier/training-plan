require('dotenv').config();
const express = require('express');
const path = require('path');
const { queries } = require('./db');
const { authMiddleware } = require('./auth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth for API routes
app.use('/api', authMiddleware);

// Login check
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.AUTH_PASSWORD || 'changeme')) {
    return res.json({ token: password });
  }
  return res.status(401).json({ error: 'Wrong password' });
});

// Get all weeks
app.get('/api/weeks', (req, res) => {
  res.json(queries.getAllWeeks());
});

// Get progress
app.get('/api/progress', (req, res) => {
  res.json(queries.getRunCount());
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
