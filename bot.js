require('dotenv').config();
const { Bot } = require('grammy');
const { parseInput } = require('./llm');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

const API_BASE = process.env.API_BASE || `http://app:${process.env.PORT || 3100}`;
const AUTH = process.env.AUTH_PASSWORD || 'changeme';

// Calculate week from date (W1 starts 2026-04-21)
function calcWeek(dateStr) {
  const start = new Date('2026-04-21');
  const date = new Date(dateStr);
  const diffDays = Math.floor((date - start) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7) + 1;
  if (weekNum < 1 || weekNum > 22) return `W${Math.max(1, Math.min(22, weekNum))}`;
  return `W${weekNum}`;
}

// Calculate day of week from date
function calcDay(dateStr) {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const date = new Date(dateStr);
  return days[date.getUTCDay()];
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH}`,
      ...(opts.headers || {})
    }
  });
  return res.json();
}

// Only allow your own chat
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function authCheck(ctx, next) {
  if (ALLOWED_CHAT_ID && String(ctx.chat.id) !== ALLOWED_CHAT_ID) {
    return ctx.reply('Nicht autorisiert.');
  }
  return next();
}

bot.use(authCheck);

// /start
bot.command('start', (ctx) => {
  ctx.reply(
    '🏃 Trainingsplan Bot\n\n' +
    'Befehle:\n' +
    '/plan – Nächste anstehende Läufe\n' +
    '/progress – Fortschritt anzeigen\n' +
    '/sync – Strava-Aktivitäten synchronisieren\n' +
    '/delete DD.MM. – Lauf löschen\n' +
    '/myid – Deine Chat-ID anzeigen\n\n' +
    'ℹ️ Der „gelaufen"-Status kommt automatisch aus Strava – kein manuelles Abhaken nötig.\n\n' +
    'Oder schreib einfach natürliche Sprache:\n' +
    '"19.5. Halbmarathon Stuttgart"\n' +
    '"Nächsten Dienstag 8km locker"'
  );
});

// /myid
bot.command('myid', (ctx) => {
  ctx.reply(`Deine Chat-ID: ${ctx.chat.id}`);
});

// /plan – show next upcoming (planned) runs
bot.command('plan', async (ctx) => {
  const weeks = await api('/api/weeks');
  const allRuns = weeks.flatMap(w => w.runs).filter(r => r.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  if (allRuns.length === 0) return ctx.reply('🎉 Keine anstehenden Läufe!');

  const lines = allRuns.map(r => {
    const d = r.date.split('-');
    return `${d[2]}.${d[1]}. ${r.day} – ${r.text} (${r.km}km) [${r.type}]`;
  });
  ctx.reply('📅 Nächste Läufe:\n\n' + lines.join('\n'));
});

// /progress – derived from the Strava-driven status (same source as the web app)
bot.command('progress', async (ctx) => {
  const weeks = await api('/api/weeks');
  const runs = weeks.flatMap(w => w.runs);
  const done = runs.filter(r => r.status === 'done').length;
  const total = runs.filter(r => r.status !== 'skipped').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  ctx.reply(`📊 Fortschritt: ${done}/${total} gelaufen (${pct}%)`);
});

// /sync – manually sync Strava activities
bot.command('sync', async (ctx) => {
  await ctx.reply('🔄 Synchronisiere Strava-Aktivitäten...');
  try {
    const result = await api('/api/strava/sync', { method: 'POST' });
    if (result.error) return ctx.reply(`❌ Fehler: ${result.error}`);
    if (result.synced === 0) return ctx.reply('Keine neuen Aktivitäten gefunden.');
    const lines = result.results.map(r => `✅ ${r.run.date} – ${r.actual_km}km @ ${r.actual_pace}/km${r.avg_hr ? ` | ❤️ ${r.avg_hr}` : ''}`);
    ctx.reply(`🔄 ${result.synced} Aktivität(en) synchronisiert:\n\n${lines.join('\n')}`);
  } catch (err) {
    ctx.reply(`❌ Sync fehlgeschlagen: ${err.message}`);
  }
});

// /delete <datum> – Lauf an einem Datum löschen
bot.command('delete', async (ctx) => {
  const input = ctx.message.text.replace('/delete', '').trim();
  if (!input) return ctx.reply('Bitte Datum angeben, z.B. /delete 20.05.');

  // Parse date (DD.MM. or DD.MM.YYYY)
  const match = input.match(/(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
  if (!match) return ctx.reply('Datum nicht erkannt. Format: DD.MM. oder DD.MM.YYYY');

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const year = match[3] || '2026';
  const dateStr = `${year}-${month}-${day}`;

  const weeks = await api('/api/weeks');
  const found = weeks.flatMap(w => w.runs).filter(r => r.date === dateStr);

  if (found.length === 0) return ctx.reply(`❌ Kein Lauf am ${day}.${month}.${year} gefunden.`);

  if (found.length === 1) {
    await api(`/api/runs/${found[0].id}`, { method: 'DELETE' });
    return ctx.reply(`🗑️ Gelöscht: ${found[0].text} (${found[0].km}km) am ${day}.${month}.`);
  }

  // Multiple runs on that date – list them
  const lines = found.map((r, i) => `${i + 1}. ${r.text} (${r.km}km) [${r.type}]`);
  ctx.reply(`Mehrere Läufe am ${day}.${month}.:\n\n${lines.join('\n')}\n\nSchreib /delete${day}.${month}. nochmal mit dem Laufnamen, oder lösche über die Web-App.`);
});

// Natural language input → Groq
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;

  await ctx.reply('🤔 Verarbeite...');

  const parsed = await parseInput(text);

  if (parsed.error) {
    return ctx.reply(`❌ Fehler: ${parsed.error}\n${parsed.raw || ''}`);
  }

  if (parsed.action === 'add') {
    const week = calcWeek(parsed.date);
    const day = calcDay(parsed.date);
    await api('/api/runs', {
      method: 'POST',
      body: JSON.stringify({
        week,
        date: parsed.date,
        day,
        text: parsed.text,
        pace: parsed.pace || '',
        type: parsed.type,
        km: parsed.km
      })
    });
    const d = parsed.date.split('-');
    return ctx.reply(
      `✅ Eingetragen:\n` +
      `📅 ${d[2]}.${d[1]}.${d[0]} (${day})\n` +
      `🏃 ${parsed.text}\n` +
      `📏 ${parsed.km} km | ${parsed.pace}\n` +
      `🏷️ ${parsed.type}`
    );
  }

  if (parsed.action === 'delete') {
    // Find run by date
    const weeks = await api('/api/weeks');
    let found = null;
    for (const wk of weeks) {
      for (const run of wk.runs) {
        if (run.date === parsed.date) { found = run; break; }
      }
      if (found) break;
    }
    if (found) {
      await api(`/api/runs/${found.id}`, { method: 'DELETE' });
      return ctx.reply(`🗑️ Gelöscht: ${found.text} am ${found.date}`);
    }
    return ctx.reply('❌ Kein Lauf an diesem Datum gefunden.');
  }

  if (parsed.action === 'update') {
    const weeks = await api('/api/weeks');
    let found = null;
    for (const wk of weeks) {
      for (const run of wk.runs) {
        if (run.date === parsed.date) { found = run; break; }
      }
      if (found) break;
    }
    if (!found) return ctx.reply('❌ Kein Lauf an diesem Datum gefunden.');

    const updates = {};
    if (parsed.text) updates.text = parsed.text;
    if (parsed.type) updates.type = parsed.type;
    if (parsed.km) updates.km = parsed.km;
    if (parsed.pace) updates.pace = parsed.pace;

    await api(`/api/runs/${found.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    const d = parsed.date.split('-');
    return ctx.reply(
      `✏️ Aktualisiert (${d[2]}.${d[1]}.):\n` +
      `🏃 ${parsed.text || found.text}\n` +
      `📏 ${parsed.km || found.km} km | ${parsed.type || found.type}`
    );
  }

  ctx.reply(`🤷 Konnte Aktion "${parsed.action}" nicht ausführen. Versuche es anders.`);
});

bot.start();
console.log('Telegram bot running...');
