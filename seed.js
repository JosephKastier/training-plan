/**
 * Seed script – imports the 69 training runs from the original HTML plan.
 * Run once: node seed.js
 */
const { db, queries } = require('./db');

const runs = [
  // W1 (39 km)
  { week: 'W1', date: '2026-04-21', day: 'Di', text: 'VO2max: 6×800m @ 4:15–4:20 + WU/CD', pace: '4:15–4:25', type: 'int', km: 10 },
  { week: 'W1', date: '2026-04-23', day: 'Do', text: '10 km locker + 5 Steigerungen', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W1', date: '2026-04-25', day: 'Sa', text: 'Parkrun locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W1', date: '2026-04-26', day: 'So', text: 'Long Run 14 km', pace: '5:30–6:00', type: 'long', km: 14 },

  // W2 (33 km)
  { week: 'W2', date: '2026-04-28', day: 'Di', text: 'VO2max: 5×1000m @ 4:20 + WU/CD', pace: '4:15–4:25', type: 'int', km: 11 },
  { week: 'W2', date: '2026-04-30', day: 'Do', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W2', date: '2026-05-02', day: 'Sa', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W2', date: '2026-05-03', day: 'So', text: 'Badische Meile 8.9 km', pace: '4:30–4:35', type: 'race', km: 9 },

  // W3 (28 km)
  { week: 'W3', date: '2026-05-05', day: 'Di', text: '6 km Recovery', pace: '5:30–6:00', type: 'easy', km: 6 },
  { week: 'W3', date: '2026-05-07', day: 'Do', text: 'B2Run Karlsruhe 5.6 km', pace: '4:30–4:35', type: 'race', km: 6 },
  { week: 'W3', date: '2026-05-10', day: 'So', text: 'Long Run 16 km', pace: '5:30–6:00', type: 'long', km: 16 },

  // W4 (42 km)
  { week: 'W4', date: '2026-05-12', day: 'Di', text: 'Schwelle: 4×1000m @ HM Pace', pace: '4:45–4:50', type: 'int', km: 8 },
  { week: 'W4', date: '2026-05-14', day: 'Do', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W4', date: '2026-05-16', day: 'Sa', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W4', date: '2026-05-17', day: 'So', text: 'Halbmarathon Basel (Pacing)', pace: '5:35', type: 'race', km: 21 },

  // W5 (36 km)
  { week: 'W5', date: '2026-05-19', day: 'Di', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W5', date: '2026-05-21', day: 'Do', text: '10 km locker + Strides', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W5', date: '2026-05-24', day: 'So', text: 'Long Run 18 km', pace: '5:30–6:00', type: 'long', km: 18 },

  // W6 (41 km)
  { week: 'W6', date: '2026-05-26', day: 'Di', text: 'VO2max: 5×1000m', pace: '4:15–4:25', type: 'int', km: 11 },
  { week: 'W6', date: '2026-05-28', day: 'Do', text: '10 km locker', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W6', date: '2026-05-31', day: 'So', text: 'Long Run 20 km', pace: '5:30–6:00', type: 'long', km: 20 },

  // W7 (38 km)
  { week: 'W7', date: '2026-06-02', day: 'Di', text: 'Schwelle: 10 km mit 6 km @ HM', pace: '4:45–4:50', type: 'tempo', km: 10 },
  { week: 'W7', date: '2026-06-04', day: 'Do', text: '10 km locker', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W7', date: '2026-06-07', day: 'So', text: 'Long Run 18 km', pace: '5:30–6:00', type: 'long', km: 18 },

  // W8 (26 km)
  { week: 'W8', date: '2026-06-09', day: 'Di', text: '6 km locker', pace: '5:30–6:00', type: 'easy', km: 6 },
  { week: 'W8', date: '2026-06-12', day: 'Fr', text: 'Ettlinger Altstadtlauf 10 km', pace: '4:30–4:35', type: 'race', km: 10 },
  { week: 'W8', date: '2026-06-14', day: 'So', text: 'Feuerwehr Lauf Karlsruhe 10 km', pace: '4:30–4:35', type: 'race', km: 10 },

  // W9 (25 km)
  { week: 'W9', date: '2026-06-16', day: 'Di', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W9', date: '2026-06-19', day: 'Fr', text: 'Heel Lauf Baden-Baden 10 km', pace: '4:30–4:35', type: 'race', km: 10 },
  { week: 'W9', date: '2026-06-21', day: 'So', text: 'KSC Schlossparklauf 9.6 km', pace: '4:30–4:35', type: 'race', km: 10 },

  // W10 (34 km)
  { week: 'W10', date: '2026-06-23', day: 'Di', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W10', date: '2026-06-25', day: 'Do', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W10', date: '2026-06-28', day: 'So', text: 'Hella Halbmarathon Hamburg', pace: '4:45–4:50', type: 'race', km: 21 },

  // W11 (40 km)
  { week: 'W11', date: '2026-06-30', day: 'Di', text: 'VO2max: 6×800m', pace: '4:15–4:25', type: 'int', km: 10 },
  { week: 'W11', date: '2026-07-02', day: 'Do', text: '10 km locker', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W11', date: '2026-07-05', day: 'So', text: 'Long Run 20 km', pace: '5:30–6:00', type: 'long', km: 20 },

  // W12 (30 km)
  { week: 'W12', date: '2026-07-07', day: 'Di', text: 'Schwelle: 8 km TDL', pace: '4:45–4:50', type: 'tempo', km: 8 },
  { week: 'W12', date: '2026-07-09', day: 'Do', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W12', date: '2026-07-12', day: 'So', text: 'Strahlenburgtrail 13.6 km', pace: '5:30–6:00', type: 'race', km: 14 },

  // W13 (26 km)
  { week: 'W13', date: '2026-07-14', day: 'Di', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W13', date: '2026-07-16', day: 'Do', text: 'VO2max: 6×1000m', pace: '4:15–4:25', type: 'int', km: 11 },
  { week: 'W13', date: '2026-07-18', day: 'So', text: 'CityCup Bretten 10 km', pace: '4:30–4:35', type: 'race', km: 10 },

  // W14 (40 km)
  { week: 'W14', date: '2026-07-21', day: 'Di', text: '10 km locker', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W14', date: '2026-07-23', day: 'Do', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W14', date: '2026-07-26', day: 'So', text: 'Long Run 22 km', pace: '5:30–6:00', type: 'long', km: 22 },

  // W15 (46 km)
  { week: 'W15', date: '2026-07-28', day: 'Di', text: 'Schwelle: 4×2000m', pace: '4:45–4:50', type: 'int', km: 12 },
  { week: 'W15', date: '2026-07-30', day: 'Do', text: '10 km locker', pace: '5:30–6:00', type: 'easy', km: 10 },
  { week: 'W15', date: '2026-08-02', day: 'So', text: 'Long Run 24 km', pace: '5:30–6:00', type: 'long', km: 24 },

  // W16 (48 km)
  { week: 'W16', date: '2026-08-04', day: 'Di', text: 'Schwelle: 10 km TDL', pace: '4:45–4:50', type: 'tempo', km: 10 },
  { week: 'W16', date: '2026-08-06', day: 'Do', text: '12 km locker', pace: '5:30–6:00', type: 'easy', km: 12 },
  { week: 'W16', date: '2026-08-09', day: 'So', text: 'Long Run 26 km', pace: '5:30–6:00', type: 'long', km: 26 },

  // W17 (32 km)
  { week: 'W17', date: '2026-08-11', day: 'Di', text: '6 km locker', pace: '5:30–6:00', type: 'easy', km: 6 },
  { week: 'W17', date: '2026-08-13', day: 'Do', text: '5 km locker', pace: '5:30–6:00', type: 'easy', km: 5 },
  { week: 'W17', date: '2026-08-16', day: 'So', text: 'Lußhardtlauf Halbmarathon', pace: '4:45–4:50', type: 'race', km: 21 },

  // W18 (48 km)
  { week: 'W18', date: '2026-08-18', day: 'Di', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W18', date: '2026-08-20', day: 'Do', text: '12 km inkl. 6 km @ MP', pace: '5:10–5:20', type: 'tempo', km: 12 },
  { week: 'W18', date: '2026-08-23', day: 'So', text: 'Long Run 28 km', pace: '5:30–6:00', type: 'long', km: 28 },

  // W19 (56 km)
  { week: 'W19', date: '2026-08-25', day: 'Di', text: 'Marathon: 5×2000m @ MP', pace: '5:10–5:20', type: 'tempo', km: 14 },
  { week: 'W19', date: '2026-08-27', day: 'Do', text: '12 km locker', pace: '5:30–6:00', type: 'easy', km: 12 },
  { week: 'W19', date: '2026-08-30', day: 'So', text: 'Long Run 30 km', pace: '5:30–6:00', type: 'long', km: 30 },

  // W20 (54 km)
  { week: 'W20', date: '2026-09-01', day: 'Di', text: '10 km mit Endbeschleunigung', pace: '5:10–5:20', type: 'tempo', km: 10 },
  { week: 'W20', date: '2026-09-03', day: 'Do', text: '12 km locker', pace: '5:30–6:00', type: 'easy', km: 12 },
  { week: 'W20', date: '2026-09-06', day: 'So', text: 'Long Run 32 km', pace: '5:30–6:00', type: 'long', km: 32 },

  // W21 (34 km)
  { week: 'W21', date: '2026-09-08', day: 'Di', text: '8 km locker', pace: '5:30–6:00', type: 'easy', km: 8 },
  { week: 'W21', date: '2026-09-10', day: 'Do', text: '6 km inkl. MP', pace: '5:10–5:20', type: 'tempo', km: 6 },
  { week: 'W21', date: '2026-09-13', day: 'So', text: 'Long Run 20 km', pace: '5:30–6:00', type: 'long', km: 20 },

  // W22 (52 km)
  { week: 'W22', date: '2026-09-15', day: 'Di', text: '6 km locker', pace: '5:30–6:00', type: 'easy', km: 6 },
  { week: 'W22', date: '2026-09-17', day: 'Do', text: '4 km locker', pace: '5:30–6:00', type: 'easy', km: 4 },
  { week: 'W22', date: '2026-09-20', day: 'So', text: 'Baden Marathon 42.2 km', pace: '5:10–5:20', type: 'race', km: 42 },
];

// Clear existing data and seed
db.exec('DELETE FROM runs');

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

const insert = db.prepare(
  'INSERT INTO runs (week, date, day, text, pace, type, km, done, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

const seedAll = db.transaction(() => {
  let order = 0;
  for (const run of runs) {
    order++;
    const done = run.date < today ? 1 : 0;
    insert.run(run.week, run.date, run.day, run.text, run.pace, run.type, run.km, done, order);
  }
});

seedAll();
console.log(`Seeded ${runs.length} runs into database.`);
