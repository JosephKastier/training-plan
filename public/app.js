const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

createApp({
  setup() {
    const token = ref(localStorage.getItem('tp_token') || '');
    const password = ref('');
    const loginError = ref('');
    const weeks = ref([]);
    const collapsed = ref({});

    const typeLabels = { easy: 'Locker', tempo: 'Tempo', int: 'Intervalle', long: 'Long', race: 'Race' };

    async function api(path, opts = {}) {
      const res = await fetch(path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.value}`,
          ...(opts.headers || {})
        }
      });
      if (res.status === 401) {
        token.value = '';
        localStorage.removeItem('tp_token');
        return null;
      }
      return res.json();
    }

    async function login() {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.value })
      });
      if (res.ok) {
        const data = await res.json();
        token.value = data.token;
        localStorage.setItem('tp_token', data.token);
        loginError.value = '';
        loadAndCollapse();
      } else {
        loginError.value = 'Falsches Passwort';
      }
    }

    async function loadData() {
      const data = await api('/api/weeks');
      if (data) weeks.value = data;
    }

    async function toggleRun(run) {
      run.done = run.done ? 0 : 1;
      await api(`/api/runs/${run.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: run.done })
      });
    }

    function toggleWeek(week) {
      collapsed.value[week] = !collapsed.value[week];
    }

    function weekDateRange(wk) {
      if (!wk.runs.length) return '';
      const dates = wk.runs.map(r => r.date).sort();
      // Find Monday of that week
      const first = new Date(dates[0]);
      const dayOfWeek = first.getDay(); // 0=Sun, 1=Mon...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(first);
      monday.setDate(first.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const m = monday;
      const s = sunday;
      return `${String(m.getDate()).padStart(2,'0')}.${String(m.getMonth()+1).padStart(2,'0')}. – ${String(s.getDate()).padStart(2,'0')}.${String(s.getMonth()+1).padStart(2,'0')}.`;
    }

    function weekKm(wk) {
      return wk.runs.reduce((sum, r) => sum + r.km, 0);
    }

    function weekDone(wk) {
      return wk.runs.filter(r => r.done).length;
    }

    function formatDate(dateStr) {
      const [y, m, d] = dateStr.split('-');
      return `${d}.${m}.`;
    }

    function typeLabel(type) {
      return typeLabels[type] || type;
    }

    const totalCount = computed(() => weeks.value.reduce((s, w) => s + w.runs.length, 0));
    const doneCount = computed(() => weeks.value.reduce((s, w) => s + w.runs.filter(r => r.done).length, 0));
    const progressPercent = computed(() => totalCount.value ? Math.round(doneCount.value / totalCount.value * 100) : 0);

    async function loadAndCollapse() {
      await loadData();
      // Auto-collapse weeks where all runs are done
      const newCollapsed = {};
      for (const wk of weeks.value) {
        newCollapsed[wk.week] = wk.runs.length > 0 && wk.runs.every(r => r.done);
      }
      collapsed.value = newCollapsed;
    }

    const pulling = ref(false);
    const activeFilter = ref(null);
    const expandedRun = ref(null);
    const stravaConnected = ref(false);
    const filters = [
      { type: 'race', label: 'Race' },
      { type: 'easy', label: 'Locker' },
      { type: 'long', label: 'Long' },
      { type: 'int', label: 'Intervalle' },
      { type: 'tempo', label: 'Tempo' },
    ];

    function toggleFilter(type) {
      activeFilter.value = activeFilter.value === type ? null : type;
      // When filter is active, expand all weeks; when deactivated, re-collapse done weeks
      if (activeFilter.value) {
        const newCollapsed = {};
        for (const wk of weeks.value) {
          newCollapsed[wk.week] = false;
        }
        collapsed.value = newCollapsed;
      } else {
        const newCollapsed = {};
        for (const wk of weeks.value) {
          newCollapsed[wk.week] = wk.runs.length > 0 && wk.runs.every(r => r.done);
        }
        collapsed.value = newCollapsed;
      }
    }

    function filteredRuns(wk) {
      if (!activeFilter.value) return wk.runs;
      return wk.runs.filter(r => r.type === activeFilter.value);
    }

    function filterCount(type) {
      return weeks.value.reduce((sum, wk) => sum + wk.runs.filter(r => r.type === type).length, 0);
    }
    function toggleStrava(run) {
      if (run.strava) {
        if (expandedRun.value === run.id) {
          // Closing: destroy map
          if (mapInstances[run.id]) {
            mapInstances[run.id].remove();
            delete mapInstances[run.id];
          }
          expandedRun.value = null;
        } else {
          // Close previous map if any
          if (expandedRun.value && mapInstances[expandedRun.value]) {
            mapInstances[expandedRun.value].remove();
            delete mapInstances[expandedRun.value];
          }
          expandedRun.value = run.id;
          if (run.strava.polyline) {
            nextTick(() => renderMap(run.id, run.strava.polyline));
          }
        }
      }
    }

    const mapInstances = {};
    function renderMap(runId, polyline) {
      const el = document.getElementById('map-' + runId);
      if (!el || mapInstances[runId]) return;
      const coords = decodePolyline(polyline);
      if (!coords.length) return;
      const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      const line = L.polyline(coords, { color: '#3b82f6', weight: 3 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [10, 10] });
      mapInstances[runId] = map;
    }

    function decodePolyline(encoded) {
      const coords = [];
      let i = 0, lat = 0, lng = 0;
      while (i < encoded.length) {
        let b, shift = 0, result = 0;
        do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);
        shift = 0; result = 0;
        do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        coords.push([lat / 1e5, lng / 1e5]);
      }
      return coords;
    }

    async function checkStrava() {
      const data = await api('/api/strava/status');
      if (data) stravaConnected.value = data.connected;
    }

    let touchStartY = 0;

    onMounted(() => {
      if (token.value) {
        loadAndCollapse();
        checkStrava();
      }

      // Reload data when app comes back to foreground
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && token.value) loadData();
      });

      // Pull to refresh
      document.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      });
      document.addEventListener('touchmove', (e) => {
        if (window.scrollY === 0 && e.touches[0].clientY - touchStartY > 60) {
          pulling.value = true;
        }
      });
      document.addEventListener('touchend', async () => {
        if (pulling.value) {
          await loadData();
          pulling.value = false;
        }
      });
    });

    return {
      token, password, loginError, weeks, collapsed, pulling,
      activeFilter, filters, toggleFilter, filteredRuns, filterCount,
      expandedRun, stravaConnected, toggleStrava,
      login, toggleRun, toggleWeek, weekKm, weekDone, weekDateRange,
      formatDate, typeLabel, totalCount, doneCount, progressPercent
    };
  }
}).mount('#app');
