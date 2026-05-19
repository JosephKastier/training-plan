const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'training.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week TEXT NOT NULL,
    date TEXT NOT NULL,
    day TEXT NOT NULL,
    text TEXT NOT NULL,
    pace TEXT,
    type TEXT NOT NULL,
    km REAL NOT NULL,
    done INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS strava_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    athlete_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS strava_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE,
    strava_id BIGINT UNIQUE,
    actual_km REAL,
    actual_pace TEXT,
    avg_hr INTEGER,
    elapsed_time INTEGER,
    polyline TEXT,
    photo_url TEXT,
    synced_at TEXT,
    UNIQUE(run_id)
  );
`);

// Migrate: add polyline and photo_url columns if missing
try { db.prepare('ALTER TABLE strava_data ADD COLUMN polyline TEXT').run(); } catch(e) {}
try { db.prepare('ALTER TABLE strava_data ADD COLUMN photo_url TEXT').run(); } catch(e) {}

// Query helpers
const queries = {
  getAllWeeks() {
    const rows = db.prepare('SELECT * FROM runs ORDER BY CAST(SUBSTR(week, 2) AS INTEGER), date, sort_order').all();
    const weeks = {};
    for (const row of rows) {
      if (!weeks[row.week]) weeks[row.week] = [];
      weeks[row.week].push(row);
    }
    return Object.entries(weeks).map(([week, runs]) => ({ week, runs }));
  },

  getRun(id) {
    return db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  },

  toggleDone(id, done) {
    return db.prepare('UPDATE runs SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
  },

  updateRun(id, fields) {
    const allowed = ['date', 'day', 'text', 'pace', 'type', 'km', 'week', 'done'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (updates.length === 0) return null;
    values.push(id);
    return db.prepare(`UPDATE runs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  },

  createRun({ week, date, day, text, pace, type, km }) {
    // Find the correct sort_order based on date position
    const nextRun = db.prepare('SELECT sort_order FROM runs WHERE date > ? ORDER BY date, sort_order LIMIT 1').get(date);
    if (nextRun) {
      // Shift all runs at or after this position
      db.prepare('UPDATE runs SET sort_order = sort_order + 1 WHERE sort_order >= ?').run(nextRun.sort_order);
      return db.prepare(
        'INSERT INTO runs (week, date, day, text, pace, type, km, done, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(week, date, day, text, pace || '', type, km, nextRun.sort_order);
    } else {
      const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM runs').get();
      return db.prepare(
        'INSERT INTO runs (week, date, day, text, pace, type, km, done, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(week, date, day, text, pace || '', type, km, (maxOrder?.m || 0) + 1);
    }
  },

  deleteRun(id) {
    return db.prepare('DELETE FROM runs WHERE id = ?').run(id);
  },

  swapRuns(id1, id2) {
    const run1 = db.prepare('SELECT sort_order FROM runs WHERE id = ?').get(id1);
    const run2 = db.prepare('SELECT sort_order FROM runs WHERE id = ?').get(id2);
    if (!run1 || !run2) return null;
    const swap = db.transaction(() => {
      db.prepare('UPDATE runs SET sort_order = ? WHERE id = ?').run(run2.sort_order, id1);
      db.prepare('UPDATE runs SET sort_order = ? WHERE id = ?').run(run1.sort_order, id2);
    });
    return swap();
  },

  getRunCount() {
    return db.prepare('SELECT COUNT(*) as total, SUM(done) as done FROM runs').get();
  },

  getNextRuns(limit = 7) {
    return db.prepare('SELECT * FROM runs WHERE done = 0 ORDER BY date LIMIT ?').all(limit);
  },

  // Strava tokens
  getStravaTokens() {
    return db.prepare('SELECT * FROM strava_tokens WHERE id = 1').get();
  },

  saveStravaTokens({ access_token, refresh_token, expires_at, athlete_id }) {
    return db.prepare(
      `INSERT OR REPLACE INTO strava_tokens (id, access_token, refresh_token, expires_at, athlete_id)
       VALUES (1, ?, ?, ?, ?)`
    ).run(access_token, refresh_token, expires_at, athlete_id || null);
  },

  // Strava data
  getStravaData(runId) {
    return db.prepare('SELECT * FROM strava_data WHERE run_id = ?').get(runId);
  },

  getAllStravaData() {
    return db.prepare('SELECT * FROM strava_data').all();
  },

  saveStravaData({ run_id, strava_id, actual_km, actual_pace, avg_hr, elapsed_time, polyline, photo_url }) {
    return db.prepare(
      `INSERT OR REPLACE INTO strava_data (run_id, strava_id, actual_km, actual_pace, avg_hr, elapsed_time, polyline, photo_url, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(run_id, strava_id, actual_km, actual_pace, avg_hr || null, elapsed_time || null, polyline || null, photo_url || null);
  },

  getRunByDate(date) {
    return db.prepare('SELECT * FROM runs WHERE date = ?').get(date);
  },

  getRunsByDateRange(startDate, endDate) {
    return db.prepare('SELECT * FROM runs WHERE date BETWEEN ? AND ? ORDER BY date').all(startDate, endDate);
  }
};

module.exports = { db, queries };
