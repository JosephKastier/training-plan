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
`);

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
  }
};

module.exports = { db, queries };
