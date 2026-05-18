const { createApp, ref, computed, onMounted } = Vue;

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
      const first = dates[0].split('-');
      const last = dates[dates.length - 1].split('-');
      return `${first[2]}.${first[1]}. – ${last[2]}.${last[1]}.`;
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
    const filters = [
      { type: 'race', label: 'Race' },
      { type: 'easy', label: 'Locker' },
      { type: 'long', label: 'Long' },
      { type: 'int', label: 'Intervalle' },
    ];

    function toggleFilter(type) {
      activeFilter.value = activeFilter.value === type ? null : type;
    }

    function filteredRuns(wk) {
      if (!activeFilter.value) return wk.runs;
      return wk.runs.filter(r => r.type === activeFilter.value);
    }

    function filterCount(type) {
      return weeks.value.reduce((sum, wk) => sum + wk.runs.filter(r => r.type === type).length, 0);
    }
    let touchStartY = 0;

    onMounted(() => {
      if (token.value) loadAndCollapse();

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
      login, toggleRun, toggleWeek, weekKm, weekDone, weekDateRange,
      formatDate, typeLabel, totalCount, doneCount, progressPercent
    };
  }
}).mount('#app');
