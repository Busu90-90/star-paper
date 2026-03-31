/**
 * ============================================================
 * STAR PAPER — SUPABASE INTEGRATION LAYER
 * supabase.js — Load this BEFORE app.js in index.html
 *
 * <script src="supabase.js"></script>
 * <script src="app.js"></script>
 * ============================================================
 *
 * SETUP: Replace the two config values below with your own
 * from your Supabase project: Settings → API
 * ============================================================
 */

// ── CONFIG: Replace these with your Supabase project values ──────────────────
const SP_SUPABASE_URL  = 'https://fxcyocdwvjiyatqnaahg.supabase.co';
const SP_SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Y3lvY2R3dmppeWF0cW5hYWhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Nzg4NDEsImV4cCI6MjA4ODU1NDg0MX0.OTtDpyfA69rbVOTJkBh51pwj3wEkR1L04x4ouDkeWZ0';
const SP_SUPABASE_STORAGE_KEY = 'sp-starpaper-auth-v1';
const SP_SUPABASE_CONFIGURED =
  typeof SP_SUPABASE_URL === 'string' &&
  typeof SP_SUPABASE_KEY === 'string' &&
  SP_SUPABASE_URL.trim().length > 0 &&
  SP_SUPABASE_KEY.trim().length > 0 &&
  !SP_SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
  !SP_SUPABASE_KEY.includes('YOUR_ANON_PUBLIC_KEY');
// Cloud-only auth: when Supabase is configured, do NOT fall back to local auth.
// If you need offline/local-only mode, set this to true.
const SP_ALLOW_LOCAL_FALLBACK = false;
// Investor demo: enforce cloud-only records (no localStorage persistence for core data).
const SP_CLOUD_ONLY_MODE = true;
// Expose config so app.js can enforce cloud-only mode.
window.__spSupabaseConfigured = SP_SUPABASE_CONFIGURED;
window.__spAllowLocalFallback = SP_ALLOW_LOCAL_FALLBACK;
window.__spCloudOnly = SP_CLOUD_ONLY_MODE;
// ─────────────────────────────────────────────────────────────────────────────

// ── CURRENCY CONFIG ───────────────────────────────────────────────────────────
const SP_CURRENCIES = {
  UGX: { symbol: 'UGX', name: 'Uganda Shilling',   rate: 1 },
  KES: { symbol: 'KES', name: 'Kenya Shilling',     rate: 0.033 },
  TZS: { symbol: 'TZS', name: 'Tanzania Shilling',  rate: 0.083 },
  NGN: { symbol: '₦',   name: 'Nigerian Naira',     rate: 0.11  },
  ZAR: { symbol: 'R',   name: 'South African Rand', rate: 0.0006},
  USD: { symbol: '$',   name: 'US Dollar',          rate: 0.00026},
  GBP: { symbol: '£',   name: 'British Pound',      rate: 0.0002 },
  EUR: { symbol: '€',   name: 'Euro',               rate: 0.00023},
};

// ── BOOTSTRAP ─────────────────────────────────────────────────────────────────
(async function initStarPaperSupabase() {
  'use strict';

  if (!SP_SUPABASE_CONFIGURED) {
    console.warn('[StarPaper Supabase] Supabase config is not set. Running in localStorage mode.');
    return;
  }

  // Load Supabase JS SDK from CDN
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const { createClient } = window.supabase;
  const db = createClient(SP_SUPABASE_URL, SP_SUPABASE_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      // Stable storage key — all tabs share the same lock namespace.
      storageKey: SP_SUPABASE_STORAGE_KEY,
      // Disable the Web Locks API for auth token refresh coordination.
      // The navigator.locks "steal" mechanism causes AbortError when multiple
      // Supabase requests fire in rapid succession (e.g. Create Team flow).
      // With this disabled, GoTrue falls back to a simple in-memory mutex
      // which is sufficient for a single-page app with one auth client.
      // CRITICAL: must RETURN the promise from fn() — the SDK's internal
      // initializePromise depends on it. Discarding it deadlocks the SDK.
      lock: (name, acquireTimeout, fn) => Promise.resolve().then(fn),
    }
  });

  // ── STATE ───────────────────────────────────────────────────────────────────
  let _session  = null;
  let _profile  = null;
  let _activeTeamId = localStorage.getItem('sp_active_team') || null;
  let _activeTeamRole = null;
  let _currency = localStorage.getItem('sp_currency') || 'UGX';
  let _realtimeChannel = null;
  let _coreRealtimeChannel = null;
  let _coreRealtimeDebounce = null;
  let _syncBroadcast = null;
  let _bootstrapping = false;
  let _refreshInFlight = false;
  let _lastRefreshAt = 0;
  let _lastCloudSignature = null;

  // ── SERIAL DB QUEUE ──────────────────────────────────────────────────────────
  // Supabase JS v2 acquires a Web Lock for every auth-bearing request. Firing
  // multiple requests concurrently causes "AbortError: Lock broken by steal".
  // This queue serialises all DB calls so only ONE request is in-flight at a time.
  let _dbQueue = Promise.resolve();
  function dbSerial(fn) {
    _dbQueue = _dbQueue.then(() => fn()).catch(err => {
      // Swallow AbortErrors inside the queue — they are lock-release noise
      if (err?.name !== 'AbortError') throw err;
    });
    return _dbQueue;
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────────
  function log(...args)  { console.log('[StarPaper Supabase]', ...args); }
  function warn(...args) { console.warn('[StarPaper Supabase]', ...args); }

  function toastSafe(type, msg) {
    const fn = window['toast' + type];
    if (typeof fn === 'function') fn(msg);
  }

  const CORE_REALTIME_TABLES = [
    { table: 'bookings',        soloColumn: 'owner_id' },
    { table: 'expenses',        soloColumn: 'owner_id' },
    { table: 'other_income',    soloColumn: 'owner_id' },
    { table: 'artists',         soloColumn: 'owner_id' },
    { table: 'tasks',           soloColumn: 'user_id' },
    { table: 'revenue_goals',   soloColumn: 'user_id' },
    { table: 'bbf_entries',     soloColumn: 'user_id' },
    { table: 'closing_thoughts', soloColumn: 'user_id' },
  ];

  const SYNC_BROADCAST_KEY = 'sp_sync_ping';
  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  function computeCloudSignature(data) {
    if (!data || typeof data !== 'object') return '';
    const stamp = (items, fields) => {
      if (!Array.isArray(items) || items.length === 0) return '0:0';
      let max = 0;
      for (const item of items) {
        if (!item) continue;
        for (const field of fields) {
          const value = item[field];
          if (typeof value === 'number' && value > max) max = value;
          if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed) && parsed > max) max = parsed;
          }
        }
      }
      return `${items.length}:${max}`;
    };
    const signature = {
      bookings: stamp(data.bookings, ['updatedAt', 'createdAt']),
      expenses: stamp(data.expenses, ['updatedAt', 'createdAt']),
      otherIncome: stamp(data.otherIncome, ['updatedAt', 'createdAt']),
      artists: stamp(data.artists, ['updatedAt', 'createdAt']),
      tasks: stamp(data.tasks, ['updatedAt', 'createdAt']),
      revenueGoal: data.revenueGoal
        ? `${data.revenueGoal.period || ''}:${Number(data.revenueGoal.amount || 0)}`
        : '0',
      bbfEntries: stamp(data.bbfEntries, ['updatedAt']),
      closingThoughts: stamp(data.closingThoughts, ['updatedAt']),
      theme: data.theme || '',
    };
    try {
      return JSON.stringify(signature);
    } catch (_err) {
      return String(Date.now());
    }
  }

  function initLocalSyncBroadcast() {
    if (_syncBroadcast) return;
    if ('BroadcastChannel' in window) {
      _syncBroadcast = new BroadcastChannel('sp-sync');
      _syncBroadcast.onmessage = (event) => {
        if (!event?.data || event.data.type !== 'sync') return;
        if (!getOwnerId()) return;
        refreshCloudData({ silent: true, force: true, minIntervalMs: 0, reason: `broadcast:${event.data.reason || 'sync'}` });
      };
      return;
    }

    window.addEventListener('storage', (event) => {
      if (event.key !== SYNC_BROADCAST_KEY) return;
      if (!getOwnerId()) return;
      refreshCloudData({ silent: true, force: true, minIntervalMs: 0, reason: 'storage' });
    });
  }

  function broadcastLocalSync(reason) {
    if (!getOwnerId()) return;
    if (_syncBroadcast && typeof _syncBroadcast.postMessage === 'function') {
      _syncBroadcast.postMessage({ type: 'sync', reason: reason || 'save', ts: Date.now() });
      return;
    }
    try {
      localStorage.setItem(SYNC_BROADCAST_KEY, String(Date.now()));
    } catch (_err) {
      // no-op
    }
  }

  function scheduleRealtimeRefresh(reason) {
    if (_coreRealtimeDebounce) clearTimeout(_coreRealtimeDebounce);
    _coreRealtimeDebounce = setTimeout(() => {
      _coreRealtimeDebounce = null;
      refreshCloudData({ silent: true, force: true, minIntervalMs: 0, reason: reason || 'realtime' });
    }, 400);
  }

  function unsubscribeFromCoreRealtime() {
    if (_coreRealtimeChannel) {
      db.removeChannel(_coreRealtimeChannel);
      _coreRealtimeChannel = null;
    }
  }

  function subscribeToCoreRealtime() {
    const ownerId = getOwnerId();
    if (!ownerId) return;

    const scopeKey = _activeTeamId ? `team-${_activeTeamId}` : `user-${ownerId}`;
    const channelName = `sp-core-${scopeKey}`;
    unsubscribeFromCoreRealtime();

    const channel = db.channel(channelName);
    CORE_REALTIME_TABLES.forEach((entry) => {
      const filterColumn = _activeTeamId ? 'team_id' : entry.soloColumn;
      const filterValue = _activeTeamId || ownerId;
      if (!filterColumn || !filterValue) return;
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: entry.table, filter: `${filterColumn}=eq.${filterValue}` },
        () => scheduleRealtimeRefresh(`realtime:${entry.table}`)
      );
    });

    channel.subscribe((status) => {
      log('coreRealtime', status);
    });
    _coreRealtimeChannel = channel;
  }

  const TEAM_PROMPT_KEY = 'sp_team_select_prompted';
  function promptTeamSelectionIfNeeded(teams) {
    if (_activeTeamId) return;
    if (!Array.isArray(teams) || teams.length === 0) return;
    try {
      if (sessionStorage.getItem(TEAM_PROMPT_KEY) === '1') return;
      sessionStorage.setItem(TEAM_PROMPT_KEY, '1');
    } catch (_err) {
      // Non-fatal: if sessionStorage fails, still show the prompt once.
    }
    toastSafe('Info', 'You have a team workspace. Open Team to select it.');
  }

  function ensureAppBootReady() {
    return Boolean(window.__spAppBooted) ||
      (typeof window.showApp === 'function' && typeof window.loadUserData === 'function');
  }

  function scheduleAppBoot(maxWaitMs = 5000, intervalMs = 50) {
    if (window.__spAppBooted) return;
    const start = Date.now();
    const tick = () => {
      if (window.__spAppBooted) return;
      if (ensureAppBootReady()) {
        try {
          if (typeof window.loadUserData === 'function') {
            window.loadUserData();
          }
          if (typeof window.showApp === 'function' && !window.__spAppBooted) {
            window.showApp();
          }
          log('bootstrap.uiReady');
        } catch (err) {
          warn('Deferred app boot failed:', err);
        }
        return;
      }
      if (Date.now() - start >= maxWaitMs) {
        log('bootstrap.uiDeferredTimeout');
        return;
      }
      setTimeout(tick, intervalMs);
    };
    setTimeout(tick, 0);
  }

  function withTimeout(task, ms, label) {
    const promise = typeof task === 'function' ? task() : task;
    let timer = null;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
          err.name = 'TimeoutError';
          reject(err);
        }, ms);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function getOwnerId() {
    return _session?.user?.id || null;
  }

  async function ensureSupabaseSession(options = {}) {
    const silent = Boolean(options.silent);
    const clearIfMissing = options.clearIfMissing !== false;
    if (getOwnerId()) return _session;

    // Respect explicit logout until a fresh login occurs.
    if (localStorage.getItem('sp_logged_out') === '1') {
      return null;
    }

    let session = null;
    try {
      session = await getSession();
    } catch (_err) {
      session = null;
    }

    if (session?.user) return session;

    const hasLocalSession =
      localStorage.getItem('starPaper_session') === 'active' ||
      Boolean(window.currentUser);

    if (hasLocalSession && clearIfMissing) {
      if (!silent) {
        toastSafe('Warn', 'Your session expired. Please log in again.');
      }
      if (typeof window.clearAuthSessionState === 'function') {
        window.clearAuthSessionState();
      }
      if (typeof window.setActiveScreen === 'function') {
        window.setActiveScreen('landingScreen');
      }
    }

    return null;
  }

  function getContext() {
    // If user has an active team, scope data to team. Otherwise solo mode.
    return _activeTeamId
      ? { team_id: _activeTeamId, owner_id: null }
      : { team_id: null, owner_id: getOwnerId() };
  }

  function getActiveTeamRole() {
    return _activeTeamRole;
  }

  function setActiveTeamRole(role) {
    _activeTeamRole = role || null;
    if (typeof window.setTeamRole === 'function') {
      window.setTeamRole(_activeTeamRole);
    }
  }

  function applyScopeFilter(query, ownerColumn = 'owner_id') {
    if (_activeTeamId) return query.eq('team_id', _activeTeamId);
    return query.eq(ownerColumn, getOwnerId()).is('team_id', null);
  }

  function applyUserScopeFilter(query, userColumn = 'user_id') {
    if (_activeTeamId) return query.eq('team_id', _activeTeamId);
    return query.eq(userColumn, getOwnerId()).is('team_id', null);
  }

  // ── MIGRATION: import existing localStorage data on first login ─────────────
  async function migrateLocalStorageData() {
    const migrationKey = 'sp_migrated_' + getOwnerId();
    if (localStorage.getItem(migrationKey)) return;

    try {
      const managerData = JSON.parse(localStorage.getItem('starPaperManagerData') || '{}');
      const localArtists = JSON.parse(localStorage.getItem('starPaperArtists') || '[]');
      const localRevenueGoals = JSON.parse(localStorage.getItem('starPaperRevenueGoals') || '{}');
      const localBBF = JSON.parse(localStorage.getItem('starPaperBBF') || '{}');
      const localClosingThoughts = JSON.parse(localStorage.getItem('starPaperClosingThoughtsByPeriod') || '{}');

      // Find current user's manager ID by matching username
      const localUsers = JSON.parse(localStorage.getItem('starPaperUsers') || '[]');
      const localUser = Array.isArray(localUsers)
        ? localUsers.find(u => u.username === window.currentUser)
        : null;
      const managerId = localUser?.id || null;

      if (!managerId || !managerData[managerId]) {
        localStorage.setItem(migrationKey, '1');
        return;
      }

      const data = managerData[managerId];
      const ctx = getContext();
      const goalConflict = ctx.team_id ? 'team_id,period' : 'user_id,period';
      const tasksKey = `starPaperTasks:${managerId}`;
      const fallbackTasksKey = `starPaperTasks:${window.currentUser || ''}`;
      const localTasks = JSON.parse(
        localStorage.getItem(tasksKey) ||
        localStorage.getItem(fallbackTasksKey) ||
        localStorage.getItem('starPaperTasks') ||
        '[]'
      );

      // Migrate artists
      const artistMap = {};
      if (Array.isArray(localArtists)) {
        for (const a of localArtists) {
          if (!a || a.managerId !== managerId) continue;
          const { data: inserted } = await db.from('artists').upsert({
            legacy_id: String(a.id || ''),
            owner_id: getOwnerId(),
            team_id: ctx.team_id,
            name: a.name || '',
            email: a.email || '',
            phone: a.phone || '',
            specialty: a.specialty || '',
            bio: a.bio || '',
          }, { onConflict: 'legacy_id,owner_id', ignoreDuplicates: true }).select('id,legacy_id');
          if (inserted?.[0]) artistMap[a.id] = inserted[0].id;
        }
      }

      // Migrate bookings
      if (Array.isArray(data.bookings)) {
        const rows = data.bookings.map(b => ({
          legacy_id: String(b.id || ''),
          owner_id: getOwnerId(),
          team_id: ctx.team_id,
          artist_id: b.artistId ? (artistMap[b.artistId] || null) : null,
          artist_name: b.artist || '',
          event: b.event || '',
          date: b.date || null,
          fee: Number(b.fee) || 0,
          deposit: Number(b.deposit) || 0,
          balance: Number(b.balance) || 0,
          contact: b.contact || '',
          status: b.status || 'pending',
          notes: b.notes || '',
          location_type: b.locationType || 'uganda',
          location: b.location || '',
          mock_key: b.mockKey || null,
        }));
        if (rows.length) {
          await db.from('bookings').upsert(rows, { onConflict: 'legacy_id,owner_id', ignoreDuplicates: true });
        }
      }

      // Migrate expenses
      if (Array.isArray(data.expenses)) {
        const rows = data.expenses.map(e => ({
          legacy_id: String(e.id || ''),
          owner_id: getOwnerId(),
          team_id: ctx.team_id,
          description: e.description || '',
          amount: Number(e.amount) || 0,
          date: e.date || null,
          category: e.category || 'other',
          receipt: e.receipt || '',
          mock_key: e.mockKey || null,
        }));
        if (rows.length) {
          await db.from('expenses').upsert(rows, { onConflict: 'legacy_id,owner_id', ignoreDuplicates: true });
        }
      }

      // Migrate other income
      if (Array.isArray(data.otherIncome)) {
        const rows = data.otherIncome.map(i => ({
          legacy_id: String(i.id || ''),
          owner_id: getOwnerId(),
          team_id: ctx.team_id,
          source: i.source || '',
          amount: Number(i.amount) || 0,
          date: i.date || null,
          type: i.type || 'tips',
          payer: i.payer || '',
          method: i.method || 'cash',
          status: i.status || 'received',
          notes: i.notes || '',
          mock_key: i.mockKey || null,
        }));
        if (rows.length) {
          await db.from('other_income').upsert(rows, { onConflict: 'legacy_id,owner_id', ignoreDuplicates: true });
        }
      }

      // Migrate tasks
      if (Array.isArray(localTasks) && localTasks.length) {
        const rows = localTasks.map(t => ({
          id: String(t.id || ''),
          user_id: getOwnerId(),
          team_id: ctx.team_id,
          text: String(t.text || '').trim(),
          due_date: t.dueDate || t.due || null,
          completed: Boolean(t.completed || t.done),
          created_at: t.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })).filter(r => r.id && r.text);
        if (rows.length) {
          await db.from('tasks').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        }
      }

      // Migrate revenue goal
      const goalKey = String(managerId || window.currentUser || '');
      const goalValue = Number(localRevenueGoals?.[goalKey] || 0);
      if (Number.isFinite(goalValue) && goalValue > 0) {
        await db.from('revenue_goals').upsert([{
          user_id: getOwnerId(),
          team_id: ctx.team_id,
          amount: goalValue,
          period: 'monthly',
          updated_at: new Date().toISOString(),
        }], { onConflict: goalConflict, ignoreDuplicates: true });
      }

      // Migrate BBF entries
      if (localBBF && typeof localBBF === 'object') {
        const rows = Object.keys(localBBF).filter((key) => key.startsWith(`${goalKey}_`)).map((key) => ({
          user_id: getOwnerId(),
          team_id: ctx.team_id,
          period: key.replace(`${goalKey}_`, ''),
          amount: Number(localBBF[key]) || 0,
          updated_at: new Date().toISOString(),
        })).filter(r => r.period);
        if (rows.length) {
          await db.from('bbf_entries').upsert(rows, { onConflict: goalConflict, ignoreDuplicates: true });
        }
      }

      // Migrate closing thoughts
      const managerThoughts = localClosingThoughts?.[goalKey];
      if (managerThoughts && typeof managerThoughts === 'object') {
        const rows = Object.keys(managerThoughts).map((period) => ({
          user_id: getOwnerId(),
          team_id: ctx.team_id,
          period,
          content: String(managerThoughts[period] || ''),
          updated_at: new Date().toISOString(),
        })).filter(r => r.period && r.content);
        if (rows.length) {
          await db.from('closing_thoughts').upsert(rows, { onConflict: goalConflict, ignoreDuplicates: true });
        }
      }

      localStorage.setItem(migrationKey, '1');
      log('Local data migrated to Supabase successfully.');
      toastSafe('Success', '✅ Your local data has been securely saved to the cloud!');
    } catch (err) {
      warn('Migration failed (non-critical):', err);
    }
  }

  // ── ROW ↔ APP CONVERTERS ─────────────────────────────────────────────────────
  function rowToBooking(row) {
    return {
      id: row.id,
      event: row.event,
      artist: row.artist_name,
      artistId: row.artist_id,
      teamId: row.team_id,
      date: row.date,
      fee: Number(row.fee),
      deposit: Number(row.deposit),
      balance: Number(row.balance),
      contact: row.contact,
      status: row.status,
      notes: row.notes,
      locationType: row.location_type,
      location: row.location,
      mockKey: row.mock_key,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function bookingToRow(b, ownerId, teamId) {
    const cloudId = isCloudId(b.id) ? b.id : undefined;
    return {
      id: cloudId,                               // only set for Supabase UUID records
      legacy_id: String(b.id ?? ''),             // always preserve the original local ID
      owner_id: ownerId,
      team_id: teamId || null,
      artist_id: isCloudId(b.artistId) ? b.artistId : null,
      artist_name: b.artist || '',
      event: b.event || '',
      date: b.date || null,
      fee: Number(b.fee) || 0,
      deposit: Number(b.deposit) || 0,
      balance: Number(b.balance) || 0,
      contact: b.contact || '',
      status: b.status || 'pending',
      notes: b.notes || '',
      location_type: b.locationType || 'uganda',
      location: b.location || '',
      mock_key: b.mockKey || null,
    };
  }

  function rowToExpense(row) {
    return {
      id: row.id,
      description: row.description,
      amount: Number(row.amount),
      date: row.date,
      category: row.category,
      receipt: row.receipt || null,
      teamId: row.team_id,
      mockKey: row.mock_key,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function expenseToRow(e, ownerId, teamId) {
    const cloudId = isCloudId(e.id) ? e.id : undefined;
    return {
      id: cloudId,
      legacy_id: String(e.id ?? ''),
      owner_id: ownerId,
      team_id: teamId || null,
      description: e.description || '',
      amount: Number(e.amount) || 0,
      date: e.date || null,
      category: e.category || 'other',
      receipt: e.receipt || '',
      mock_key: e.mockKey || null,
    };
  }

  function rowToOtherIncome(row) {
    return {
      id: row.id,
      source: row.source,
      amount: Number(row.amount),
      date: row.date,
      type: row.type,
      payer: row.payer,
      method: row.method,
      status: row.status,
      notes: row.notes,
      teamId: row.team_id,
      mockKey: row.mock_key,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  function otherIncomeToRow(i, ownerId, teamId) {
    const cloudId = isCloudId(i.id) ? i.id : undefined;
    return {
      id: cloudId,
      legacy_id: String(i.id ?? ''),
      owner_id: ownerId,
      team_id: teamId || null,
      source: i.source || '',
      amount: Number(i.amount) || 0,
      date: i.date || null,
      type: i.type || 'tips',
      payer: i.payer || '',
      method: i.method || 'cash',
      status: i.status || 'received',
      notes: i.notes || '',
      mock_key: i.mockKey || null,
    };
  }

  function rowToArtist(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email || '',
      phone: row.phone || '',
      specialty: row.specialty || '',
      bio: row.bio || '',
      avatar: row.avatar || '',
      managerId: row.owner_id,
      teamId: row.team_id,
      createdAt: row.created_at,
    };
  }

  // â”€â”€ TASKS â€” rows â†” app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function rowToTask(row) {
    return {
      id: row.id,
      text: row.text,
      dueDate: row.due_date || '',
      completed: Boolean(row.completed),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }

  function taskToRow(task, ownerId, teamId) {
    const createdAt = task?.createdAt || new Date().toISOString();
    return {
      id: String(task?.id || ''),
      user_id: ownerId,
      team_id: teamId || null,
      text: String(task?.text || '').trim(),
      due_date: task?.dueDate || null,
      completed: Boolean(task?.completed),
      created_at: createdAt,
      updated_at: new Date().toISOString(),
    };
  }

  // â”€â”€ REVENUE GOALS â€” rows â†” app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function rowToRevenueGoal(row) {
    return {
      id: row.id,
      amount: Number(row.amount) || 0,
      period: row.period || 'monthly',
      updatedAt: row.updated_at || null,
    };
  }

  function revenueGoalToRow(goal, ownerId, teamId) {
    return {
      user_id: teamId ? null : ownerId,
      team_id: teamId || null,
      amount: Number(goal?.amount) || 0,
      period: goal?.period || 'monthly',
      updated_at: new Date().toISOString(),
    };
  }

  // â”€â”€ BBF â€” rows â†” app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function rowToBBF(row) {
    return {
      id: row.id,
      period: row.period,
      amount: Number(row.amount) || 0,
      updatedAt: row.updated_at || null,
    };
  }

  function bbfToRow(entry, ownerId, teamId) {
    return {
      user_id: teamId ? null : ownerId,
      team_id: teamId || null,
      period: entry?.period || '',
      amount: Number(entry?.amount) || 0,
      updated_at: new Date().toISOString(),
    };
  }

  // â”€â”€ Closing Thoughts â€” rows â†” app â”€â”€â”€â”€â”€â”€â”€
  function rowToClosingThought(row) {
    return {
      id: row.id,
      period: row.period,
      content: row.content || '',
      updatedAt: row.updated_at || null,
    };
  }

  function closingThoughtToRow(entry, ownerId, teamId) {
    return {
      user_id: teamId ? null : ownerId,
      team_id: teamId || null,
      period: entry?.period || '',
      content: String(entry?.content || ''),
      updated_at: new Date().toISOString(),
    };
  }

  // ── ID HELPERS ────────────────────────────────────────────────────────────────
  // A "cloud UUID" is a 36-char string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isCloudId(id) {
    return typeof id === 'string' && UUID_RE.test(id);
  }

  // ── CORE DATA API ────────────────────────────────────────────────────────────
  async function loadData() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;

    const filter = (q) => applyScopeFilter(q, 'owner_id');

    try {
      const timedQuery = async (label, query, timeoutMs) => {
        const started = nowMs();
        try {
          const res = await withTimeout(query, timeoutMs, label);
          log('loadData.timed', {
            label,
            ms: Math.round(nowMs() - started),
            ok: !res?.error,
            rows: Array.isArray(res?.data) ? res.data.length : 0,
          });
          if (res?.error) warn(`${label} load error:`, res.error);
          return res?.error ? null : res?.data || [];
        } catch (err) {
          warn(`${label} load timed out:`, err);
          log('loadData.timed', {
            label,
            ms: Math.round(nowMs() - started),
            ok: false,
            error: err?.message || 'unknown',
          });
          return null;
        }
      };

      // Sequential queries wrapped in lambdas — Supabase SDK Web Locks deadlock
      // on concurrent auth-bearing requests (see CLAUDE.md §12). Lambdas prevent
      // eager evaluation from starting all queries simultaneously.
      const bookingsRows = await timedQuery(
        'loadData.bookings',
        () => filter(db.from('bookings').select('*')).order('created_at', { ascending: false }),
        5000
      );
      const expensesRows = await timedQuery(
        'loadData.expenses',
        () => filter(db.from('expenses').select('*')).order('date', { ascending: false }),
        5000
      );
      const incomeRows = await timedQuery(
        'loadData.other_income',
        () => filter(db.from('other_income').select('*')).order('date', { ascending: false }),
        5000
      );
      const artistsRows = await timedQuery(
        'loadData.artists',
        () => filter(db.from('artists').select('*')).order('name'),
        5000
      );

      const payload = {};
      if (Array.isArray(bookingsRows)) payload.bookings = bookingsRows.map(rowToBooking);
      if (Array.isArray(expensesRows)) payload.expenses = expensesRows.map(rowToExpense);
      if (Array.isArray(incomeRows)) payload.otherIncome = incomeRows.map(rowToOtherIncome);
      if (Array.isArray(artistsRows)) payload.artists = artistsRows.map(rowToArtist);

      return Object.keys(payload).length ? payload : null;
    } catch (err) {
      warn('loadData failed:', err);
      return null;
    }
  }

  async function saveData({ bookings, expenses, otherIncome }) {
    const ownerId = getOwnerId();
    if (!ownerId) return;
    const ctx = getContext();

    // Helper: split records into those with cloud UUIDs vs. local legacy IDs
    // UUID records → upsert on 'id'.  Legacy records → upsert on 'legacy_id,owner_id'
    async function smartUpsert(table, items, toRow) {
      if (!items || !items.length) return [];
      const rows = items.map(item => toRow(item, ownerId, ctx.team_id));
      const uuidRows    = rows.filter(r => r.id !== undefined);
      const legacyRows  = rows.filter(r => r.id === undefined);
      const results = [];

      if (uuidRows.length) {
        const { data, error } = await db.from(table)
          .upsert(uuidRows, { onConflict: 'id', ignoreDuplicates: false })
          .select('id,legacy_id');
        if (error) warn(`${table} UUID upsert error:`, error);
        else if (data) results.push(...data);
      }
      if (legacyRows.length) {
        const { data, error } = await db.from(table)
          .upsert(legacyRows, { onConflict: 'legacy_id,owner_id', ignoreDuplicates: false })
          .select('id,legacy_id');
        if (error) warn(`${table} legacy upsert error:`, error);
        else if (data) results.push(...data);
      }
      return results;
    }

    try {
      // Sequential upserts — Supabase SDK Web Locks cause AbortError when
      // multiple auth-bearing requests run concurrently (see CLAUDE.md §12).
      const bRows = await smartUpsert('bookings',     bookings,    bookingToRow);
      const eRows = await smartUpsert('expenses',     expenses,    expenseToRow);
      const iRows = await smartUpsert('other_income', otherIncome, otherIncomeToRow);

      // CRITICAL: Back-fill Supabase-generated UUIDs into the live app arrays so
      // future saves hit the existing row (not create new duplicates).
      function patchIds(localArr, savedRows, windowKey) {
        if (!savedRows || !savedRows.length) return;
        const legacyMap = {};
        savedRows.forEach(r => { if (r.legacy_id) legacyMap[r.legacy_id] = r.id; });
        let changed = false;
        localArr.forEach(item => {
          if (!isCloudId(item.id) && legacyMap[String(item.id)]) {
            item.id = legacyMap[String(item.id)];
            changed = true;
          }
        });
        if (changed && windowKey && Array.isArray(window[windowKey])) {
          window[windowKey] = localArr;
        }
      }

      patchIds(bookings,    bRows, 'bookings');
      patchIds(expenses,    eRows, 'expenses');
      patchIds(otherIncome, iRows, 'otherIncome');

    } catch (err) {
      warn('saveData failed:', err);
    }
  }

  async function saveArtists(artists) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(artists)) return;
    const ctx = getContext();
    try {
      const rows = artists.map(a => ({
        id: isCloudId(a.id) ? a.id : undefined,
        legacy_id: String(a.id ?? ''),
        owner_id: ownerId,
        team_id: ctx.team_id || null,
        name: a.name || '',
        email: a.email || '',
        phone: a.phone || '',
        specialty: a.specialty || '',
        bio: a.bio || '',
        avatar: a.avatar || '',
      }));
      const uuidRows   = rows.filter(r => r.id !== undefined);
      const legacyRows = rows.filter(r => r.id === undefined);
      if (uuidRows.length) {
        const { error } = await db.from('artists').upsert(uuidRows, { onConflict: 'id' });
        if (error) warn('Artists UUID save error:', error);
      }
      if (legacyRows.length) {
        const { error } = await db.from('artists').upsert(legacyRows, { onConflict: 'legacy_id,owner_id' });
        if (error) warn('Artists legacy save error:', error);
      }
    } catch (err) {
      warn('saveArtists failed:', err);
    }
  }

  async function loadTasks() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    try {
      const { data, error } = await applyUserScopeFilter(
        db.from('tasks').select('*').order('created_at', { ascending: true }),
        'user_id'
      );
      if (error) { warn('Tasks load error:', error); return null; }
      return (data || []).map(rowToTask);
    } catch (err) {
      warn('Tasks load failed:', err);
      return null;
    }
  }

  async function saveTasks(tasks) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(tasks)) return;
    const ctx = getContext();
    const rows = tasks
      .map((task) => taskToRow(task, ownerId, ctx.team_id))
      .filter((row) => row.id && row.text);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('tasks').upsert(rows, { onConflict: 'id' });
      if (error) warn('Tasks save error:', error);
    } catch (err) {
      warn('Tasks save failed:', err);
    }
  }

  async function loadRevenueGoal() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    try {
      const { data, error } = await applyUserScopeFilter(
        db.from('revenue_goals').select('*').eq('period', 'monthly').limit(1),
        'user_id'
      );
      if (error) { warn('Revenue goal load error:', error); return null; }
      const row = (data || [])[0];
      return row ? rowToRevenueGoal(row) : null;
    } catch (err) {
      warn('Revenue goal load failed:', err);
      return null;
    }
  }

  async function saveRevenueGoal(goal) {
    const ownerId = getOwnerId();
    if (!ownerId || !goal) return;
    const ctx = getContext();
    try {
      const { error } = await db.from('revenue_goals').upsert(
        [revenueGoalToRow(goal, ownerId, ctx.team_id)],
        { onConflict: ctx.team_id ? 'team_id,period' : 'user_id,period' }
      );
      if (error) warn('Revenue goal save error:', error);
    } catch (err) {
      warn('Revenue goal save failed:', err);
    }
  }

  async function loadBBFEntries() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    try {
      const { data, error } = await applyUserScopeFilter(
        db.from('bbf_entries').select('*').order('period', { ascending: true }),
        'user_id'
      );
      if (error) { warn('BBF load error:', error); return null; }
      return (data || []).map(rowToBBF);
    } catch (err) {
      warn('BBF load failed:', err);
      return null;
    }
  }

  async function saveBBFEntries(entries) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(entries)) return;
    const ctx = getContext();
    const rows = entries
      .map((entry) => bbfToRow(entry, ownerId, ctx.team_id))
      .filter((row) => row.period);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('bbf_entries').upsert(
        rows,
        { onConflict: ctx.team_id ? 'team_id,period' : 'user_id,period' }
      );
      if (error) warn('BBF save error:', error);
    } catch (err) {
      warn('BBF save failed:', err);
    }
  }

  async function loadClosingThoughts() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    try {
      const { data, error } = await applyUserScopeFilter(
        db.from('closing_thoughts').select('*').order('updated_at', { ascending: true }),
        'user_id'
      );
      if (error) { warn('Closing thoughts load error:', error); return null; }
      return (data || []).map(rowToClosingThought);
    } catch (err) {
      warn('Closing thoughts load failed:', err);
      return null;
    }
  }

  async function saveClosingThoughts(entries) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(entries)) return;
    const ctx = getContext();
    const rows = entries
      .map((entry) => closingThoughtToRow(entry, ownerId, ctx.team_id))
      .filter((row) => row.period && row.content);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('closing_thoughts').upsert(
        rows,
        { onConflict: ctx.team_id ? 'team_id,period' : 'user_id,period' }
      );
      if (error) warn('Closing thoughts save error:', error);
    } catch (err) {
      warn('Closing thoughts save failed:', err);
    }
  }

  async function loadAllData() {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const profile = _profile || await getProfile();
    try {
      const timedLoad = async (label, fn, timeoutMs) => {
        const started = nowMs();
        try {
          const value = await withTimeout(fn, timeoutMs, label);
          log('loadAllData.timed', {
            label,
            ms: Math.round(nowMs() - started),
            ok: Boolean(value),
          });
          return { value, timedOut: false };
        } catch (err) {
          const timedOut = err?.name === 'TimeoutError';
          warn('loadAllData timed out:', label, err);
          log('loadAllData.timed', {
            label,
            ms: Math.round(nowMs() - started),
            ok: false,
            timedOut,
            error: err?.message || 'unknown',
          });
          return { value: null, timedOut };
        }
      };

      // Sequential loads — Supabase SDK Web Locks deadlock on concurrent
      // auth-bearing requests (see CLAUDE.md §12).
      const core             = await timedLoad('loadData',            () => loadData(),            7000);
      const tasks            = await timedLoad('loadTasks',           () => loadTasks(),           5000);
      const revenueGoal      = await timedLoad('loadRevenueGoal',     () => loadRevenueGoal(),     4000);
      const bbfEntries       = await timedLoad('loadBBFEntries',      () => loadBBFEntries(),      5000);
      const closingThoughts  = await timedLoad('loadClosingThoughts', () => loadClosingThoughts(), 5000);

      const payload = {};
      if (core.value && typeof core.value === 'object') Object.assign(payload, core.value);
      if (tasks.value) payload.tasks = tasks.value;
      if (revenueGoal.value) payload.revenueGoal = revenueGoal.value;
      if (bbfEntries.value) payload.bbfEntries = bbfEntries.value;
      if (closingThoughts.value) payload.closingThoughts = closingThoughts.value;
      if (profile?.preferred_theme) payload.theme = profile.preferred_theme;

      const allCriticalTimedOut = [core, tasks, revenueGoal, bbfEntries, closingThoughts].every(r => r.timedOut);
      const hasData = Object.keys(payload).length > 0;
      if (!hasData) {
        return allCriticalTimedOut ? { __meta: { allCriticalTimedOut: true } } : null;
      }

      payload.__meta = { allCriticalTimedOut };
      return payload;
    } catch (err) {
      warn('loadAllData failed:', err);
      return null;
    }
  }

  async function refreshCloudData(options = {}) {
    if (!getOwnerId()) {
      await ensureSupabaseSession({ silent: true, clearIfMissing: true });
    }
    if (!getOwnerId()) return null;
    if (_refreshInFlight) return null;
    const now = Date.now();
    const minIntervalMs = typeof options.minIntervalMs === 'number' ? options.minIntervalMs : 5000;
    if (!options.force && now - _lastRefreshAt < minIntervalMs) return null;

    _refreshInFlight = true;
    _lastRefreshAt = now;
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
    try {
      const fresh = await withTimeout(() => loadAllData(), timeoutMs, 'loadAllData[refresh]');
      const meta = fresh?.__meta || null;
      if (fresh && meta) delete fresh.__meta;
      if (fresh) {
        const signature = computeCloudSignature(fresh);
        if (signature && signature === _lastCloudSignature) {
          return fresh;
        }
        _lastCloudSignature = signature;
      } else if (window.__spCloudOnly) {
        return null;
      }

      if (fresh && window._SP_syncFromCloud) {
        window._SP_syncFromCloud(fresh);
      }
      const shouldSync = Boolean(fresh) || !window.__spCloudOnly;
      if (shouldSync && typeof window.loadUserData === 'function') {
        window.loadUserData();
      }
      if (shouldSync && window.__spAppBooted) {
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof window.renderBookings === 'function') window.renderBookings();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
        if (typeof window.renderArtists === 'function') window.renderArtists();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
        if (typeof window.renderTasks === 'function') window.renderTasks();
      }
      return fresh;
    } catch (err) {
      warn('refreshCloudData failed:', err);
      if (!options.silent) {
        toastSafe('Warn', 'Cloud data refresh failed. Check your connection and try again.');
      }
      return null;
    } finally {
      _refreshInFlight = false;
    }
  }

  async function saveAllData(payload = {}) {
    if (!getOwnerId()) {
      await ensureSupabaseSession({ silent: true, clearIfMissing: false });
    }
    const ownerId = getOwnerId();
    if (!ownerId) return;
    let didSave = false;
    const {
      bookings,
      expenses,
      otherIncome,
      artists,
      tasks,
      revenueGoal,
      bbfEntries,
      closingThoughts,
      theme,
    } = payload || {};

    if (Array.isArray(bookings) || Array.isArray(expenses) || Array.isArray(otherIncome)) {
      await saveData({
        bookings: Array.isArray(bookings) ? bookings : (window.bookings || []),
        expenses: Array.isArray(expenses) ? expenses : (window.expenses || []),
        otherIncome: Array.isArray(otherIncome) ? otherIncome : (window.otherIncome || []),
      });
      didSave = true;
    }
    if (Array.isArray(artists)) {
      await saveArtists(artists);
      didSave = true;
    }
    if (Array.isArray(tasks)) {
      await saveTasks(tasks);
      didSave = true;
    }
    if (revenueGoal) {
      await saveRevenueGoal(revenueGoal);
      didSave = true;
    }
    if (Array.isArray(bbfEntries)) {
      await saveBBFEntries(bbfEntries);
      didSave = true;
    }
    if (Array.isArray(closingThoughts)) {
      await saveClosingThoughts(closingThoughts);
      didSave = true;
    }
    if (theme) {
      await updateProfile({ preferred_theme: theme });
      didSave = true;
    }
    if (didSave) {
      broadcastLocalSync('saveAllData');
    }
  }

  async function deleteBooking(id) {
    if (!id) return;
    const base = db.from('bookings').delete();
    const isUuid = isCloudId(id);
    let query = isUuid ? base.eq('id', id) : base.eq('legacy_id', String(id));
    query = _activeTeamId
      ? query.eq('team_id', _activeTeamId)
      : query.eq('owner_id', getOwnerId()).is('team_id', null);
    const { error } = await query;
    if (error) warn('Delete booking error:', error);
  }

  async function deleteExpense(id) {
    if (!id) return;
    const base = db.from('expenses').delete();
    const isUuid = isCloudId(id);
    let query = isUuid ? base.eq('id', id) : base.eq('legacy_id', String(id));
    query = _activeTeamId
      ? query.eq('team_id', _activeTeamId)
      : query.eq('owner_id', getOwnerId()).is('team_id', null);
    const { error } = await query;
    if (error) warn('Delete expense error:', error);
  }

  async function deleteOtherIncome(id) {
    if (!id) return;
    const base = db.from('other_income').delete();
    const isUuid = isCloudId(id);
    let query = isUuid ? base.eq('id', id) : base.eq('legacy_id', String(id));
    query = _activeTeamId
      ? query.eq('team_id', _activeTeamId)
      : query.eq('owner_id', getOwnerId()).is('team_id', null);
    const { error } = await query;
    if (error) warn('Delete other income error:', error);
  }

  async function deleteArtist(id) {
    if (!id) return;
    const base = db.from('artists').delete();
    const isUuid = isCloudId(id);
    let query = isUuid ? base.eq('id', id) : base.eq('legacy_id', String(id));
    query = _activeTeamId
      ? query.eq('team_id', _activeTeamId)
      : query.eq('owner_id', getOwnerId()).is('team_id', null);
    const { error } = await query;
    if (error) warn('Delete artist error:', error);
  }

  async function deleteTask(id) {
    if (!id) return;
    let query = db.from('tasks').delete().eq('id', String(id));
    query = _activeTeamId
      ? query.eq('team_id', _activeTeamId)
      : query.eq('user_id', getOwnerId()).is('team_id', null);
    const { error } = await query;
    if (error) warn('Delete task error:', error);
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────────

  // Returns a valid http/https redirect URL regardless of environment.
  // On file:// (local double-click), window.location.origin is "null" — Supabase
  // would fall back to the Supabase dashboard Site URL (the live Netlify URL),
  // redirecting the user away from their local file. This helper always returns
  // a usable URL: the current http/https origin, or the production URL as fallback.
  // TODO: Replace with your live hosted URL when available.
  const SP_PRODUCTION_URL = 'https://star-paper.netlify.app';
  function getSafeRedirectUrl() {
    const origin = window.location.origin;
    const isValidOrigin = origin && origin !== 'null' && origin.startsWith('http');
    return isValidOrigin ? (origin + window.location.pathname).replace(/\/+$/, '/') : SP_PRODUCTION_URL;
  }

  // Warn clearly when running on file:// — OAuth cannot work, email/password can.
  if (window.location.protocol === 'file:') {
    console.warn(
      '[StarPaper] Running on file:// — Google OAuth will not work.\n' +
      'Use a local server instead: run `npx serve .` or use VS Code Live Server.\n' +
      'Email/password login works normally on http://localhost.'
    );
  }

  async function handleAuthRedirect() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || url.searchParams.get('refresh_token');
    const code = url.searchParams.get('code');

    // No OAuth params present — nothing to do.
    if (!accessToken && !refreshToken && !code) return;

    // Explicit OAuth callback always clears the "logged out" guard.
    localStorage.removeItem('sp_logged_out');

    try {
      let session = null;
      let exchangeError = null;

      if (accessToken && refreshToken && typeof db.auth.setSession === 'function') {
        const { data, error } = await db.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) { exchangeError = error; }
        else { session = data?.session || null; }

      } else if (code && typeof db.auth.exchangeCodeForSession === 'function') {
        const { data, error } = await db.auth.exchangeCodeForSession(code);
        if (error) { exchangeError = error; }
        else { session = data?.session || null; }
      }

      if (exchangeError) {
        warn('Auth redirect exchange failed:', exchangeError);
      }

      // If exchange didn't give us a session, try fetching the stored one.
      if (!session) {
        const { data, error } = await db.auth.getSession();
        if (error) { warn('Auth redirect session fallback failed:', error); }
        else { session = data?.session || null; }
      }

      if (session) {
        await bootstrapFromSupabaseSession(session, {
          remember: true,
          showWelcome: true,
          runMigration: true,
        });
      } else {
        // Exchange failed AND no stored session — clear the loader and show login
        // so the user isn't stranded on a blank page after a bad OAuth redirect.
        warn('Auth redirect: no valid session recovered — showing login.');
        if (typeof window.hideBootLoaderElement === 'function') window.hideBootLoaderElement();
        if (typeof window.showLoginForm === 'function') window.showLoginForm();
        if (typeof window.toastError === 'function') {
          window.toastError('Sign-in link expired or invalid. Please log in again.');
        }
      }

    } catch (err) {
      warn('Auth redirect handling failed:', err);
      // Safety net: always clear the loader even on unexpected throws.
      if (typeof window.hideBootLoaderElement === 'function') window.hideBootLoaderElement();
      if (!window.__spAppBooted && typeof window.showLoginForm === 'function') {
        window.showLoginForm();
      }
    } finally {
      // Always strip auth tokens from the URL regardless of outcome.
      url.hash = '';
      ['access_token', 'refresh_token', 'type', 'token_type', 'expires_in', 'code'].forEach((key) => {
        url.searchParams.delete(key);
      });
      const cleanUrl = url.pathname + url.search;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }

  async function isUsernameAvailable(username) {
    const normalized = String(username || '').trim();
    if (!normalized) return null;
    try {
      const { data, error } = await db.rpc('is_username_available', { p_username: normalized });
      if (error) {
        warn('Username availability check failed:', error);
        return null;
      }
      return Boolean(data);
    } catch (err) {
      warn('Username availability check error:', err);
      return null;
    }
  }

  async function lookupEmailForUsername(username) {
    const normalized = String(username || '').trim();
    if (!normalized) return null;
    try {
      const { data, error } = await db.rpc('get_email_for_username', { p_username: normalized });
      if (error) {
        warn('Username lookup failed:', error);
        return null;
      }
      return typeof data === 'string' && data.includes('@') ? data : null;
    } catch (err) {
      warn('Username lookup error:', err);
      return null;
    }
  }

  async function signUp(username, email, password, phone) {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        // Redirect back to the app after email confirmation
        emailRedirectTo: getSafeRedirectUrl(),
        data: { username, phone: phone || '' },
      }
    });
    if (error) throw error;

    // NOTE: The `handle_new_user` DB trigger automatically creates the profile
    // row on auth.users INSERT. We do NOT upsert here to avoid RLS violations
    // against unconfirmed users (auth.uid() === id check fails until confirmed).
    // If the session IS present (email confirmation disabled), profile was already
    // created by the trigger; we just patch the phone number if provided.
    if (data.user && data.session && phone) {
      await db.from('profiles')
        .update({ phone, username })
        .eq('id', data.user.id);
    }
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    _session = data.session;
    return data;
  }

  function deriveUsernameFromAuth(user, fallback = '') {
    const emailUser = String(user?.email || '').split('@')[0];
    const fallbackUser = String(fallback || '').includes('@')
      ? String(fallback || '').split('@')[0]
      : String(fallback || '');
    const candidates = [
      user?.user_metadata?.username,
      user?.user_metadata?.full_name,
      emailUser,
      fallbackUser,
      'Manager'
    ];
    for (const value of candidates) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
    return 'Manager';
  }

  async function ensureProfileRecord(user, usernameHint = '') {
    if (!user?.id) return null;

    // ── Step 1: try to fetch existing profile ───────────────────────────────
    const { data: existing, error: existingError } = await db.from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (existing) {
      _profile = existing;
      return existing;
    }

    // A real RLS or network error on SELECT — build a minimal in-memory profile
    // so downstream code (currency, theme) always has something to work with.
    if (existingError && existingError.code !== 'PGRST116') {
      warn('Profile SELECT error (non-fatal):', existingError);
      _profile = _profile || {
        id: user.id,
        username: deriveUsernameFromAuth(user, usernameHint),
        email: user.email || '',
        phone: user.user_metadata?.phone || '',
      };
      return _profile;
    }

    // ── Step 2: profile doesn't exist yet — upsert (DB trigger may race us) ─
    const username = deriveUsernameFromAuth(user, usernameHint);
    const upsertPayload = {
      id: user.id,
      username,
      email: user.email || '',
      phone: user.user_metadata?.phone || '',
    };

    const { data: created, error: upsertError } = await db.from('profiles')
      .upsert(upsertPayload, { onConflict: 'id', ignoreDuplicates: false })
      .select()
      .maybeSingle();

    if (!upsertError && created) {
      _profile = created;
      return _profile;
    }

    // ── Step 3: upsert failed (most likely the DB trigger beat us to it) ────
    // Do one final SELECT to recover the trigger-created row.
    if (upsertError) {
      warn('Profile upsert failed — attempting recovery SELECT:', upsertError);
      const { data: recovered } = await db.from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (recovered) {
        _profile = recovered;
        return _profile;
      }
    }

    // ── Step 4: absolute fallback — keep an in-memory shape so nothing breaks ─
    _profile = _profile || upsertPayload;
    return _profile;
  }

  function syncAuthIntoAppSession(username, profile, remember = true) {
    const normalized = String(username || '').trim();
    if (!normalized) return;
    const profileShape = {
      id: profile?.id || null,
      email: profile?.email || '',
      phone: profile?.phone || '',
    };

    if (typeof window.applyAuthSession === 'function') {
      window.applyAuthSession(normalized, {
        remember: Boolean(remember),
        profile: profileShape,
      });
      return;
    }

    // Ensure the local user registry exists for checkAuth() on fresh OAuth boots.
    try {
      const normalizeKey = (value) => String(value || '').trim().toLowerCase();
      const storedUsers = JSON.parse(localStorage.getItem('starPaperUsers') || '[]');
      const users = Array.isArray(storedUsers) ? storedUsers : [];
      const existing = users.find((u) => normalizeKey(u?.username) === normalizeKey(normalized));
      if (!existing) {
        const userId = profileShape.id ? `mgr_${profileShape.id}` : `mgr_${normalizeKey(normalized)}`;
        users.push({
          id: userId,
          username: normalized,
          email: profileShape.email || '',
          phone: profileShape.phone || '',
          bio: '',
          avatar: '',
          createdAt: new Date().toISOString(),
        });
      } else {
        existing.email = profileShape.email || existing.email || '';
        existing.phone = profileShape.phone || existing.phone || '';
      }
      localStorage.setItem('starPaperUsers', JSON.stringify(users));
    } catch (err) {
      warn('Local user registry update failed:', err);
    }

    localStorage.setItem('starPaperRemember', JSON.stringify(Boolean(remember)));
    localStorage.setItem('starPaperCurrentUser', JSON.stringify(Boolean(remember) ? normalized : null));
    localStorage.setItem('starPaper_session', JSON.stringify('active'));
    localStorage.setItem('starPaperSessionUser', JSON.stringify(normalized));
    window.currentUser = normalized;
  }

  async function bootstrapFromSupabaseSession(session, options = {}) {
    log('bootstrap.start');
    const activeSession = session || _session || await getSession();
    if (!activeSession?.user) return false;

    // Step C: A real authenticated user exists — clear the "explicitly logged out"
    // flag so that onAuthStateChange and checkAuth() can bootstrap normally from
    // this point forward. This is the only place we clear it, ensuring it always
    // takes effect on the very next successful login.
    localStorage.removeItem('sp_logged_out');

    _session = activeSession;
    log('bootstrap.session', { user: activeSession.user?.email || activeSession.user?.id });
    subscribeToCoreRealtime();

    const remember = options.remember !== undefined ? Boolean(options.remember) : true;
    const usernameHint = options.usernameHint || '';
    const fallbackProfile = { email: activeSession.user.email || '' };
    const username = deriveUsernameFromAuth(activeSession.user, usernameHint);
    syncAuthIntoAppSession(username, fallbackProfile, remember);
    scheduleAppBoot();

    if (typeof window.updateCurrentManagerContext === 'function') {
      try {
        window.updateCurrentManagerContext();
      } catch (err) {
        warn('updateCurrentManagerContext failed:', err);
      }
    }
    // Guard: only call showApp() once. If checkAuth() already booted the app
    // via a localStorage session, __spAppBooted is true and we skip this to
    // prevent a double-render. This is the safe path for returning users whose
    // localStorage session was written on a previous visit.
    if (typeof window.showApp === 'function' && !window.__spAppBooted) {
      window.showApp();
      log('bootstrap.uiReady');
    }
    if (options.showWelcome && typeof window.showWelcomeMessage === 'function') {
      window.showWelcomeMessage();
    }

    // Background work: profile + data load should never block UI.
    (async () => {
      // Lock out refreshCloudData while bootstrap loads data — concurrent
      // Supabase requests deadlock on the SDK's Web Lock (see CLAUDE.md §12).
      _refreshInFlight = true;
      let profile = null;
      try {
        profile = await withTimeout(
          () => ensureProfileRecord(activeSession.user, usernameHint),
          4000,
          'ensureProfileRecord'
        );
        log('bootstrap.profile.done', { ok: Boolean(profile) });
      } catch (err) {
        warn('Profile load failed or timed out:', err);
        log('bootstrap.profile.done', { ok: false, error: err?.message || 'unknown' });
      }

      if (profile?.preferred_currency) {
        applyCurrency(profile.preferred_currency);
      }
      if (profile?.preferred_theme && typeof window.applyTheme === 'function') {
        window.applyTheme(profile.preferred_theme, { persist: false });
      }

      let fresh = null;
      try {
        fresh = await withTimeout(() => loadAllData(), 30000, 'loadAllData');
        log('bootstrap.data.done', { ok: Boolean(fresh) });
      } catch (dataError) {
        warn('Cloud data bootstrap failed or timed out:', dataError);
        log('bootstrap.data.timeout', { step: 'loadAllData', error: dataError?.message || 'unknown' });
        // Non-blocking toast — do NOT re-throw; we must always continue to loadUserData.
        if (dataError?.name === 'TimeoutError') {
          toastSafe('Warn', 'Cloud data took too long. Showing local data now.');
          setTimeout(() => {
            refreshCloudData({ silent: true, force: true, minIntervalMs: 0 });
          }, 2500);
        }
      }

      // Bootstrap data load complete — unlock refreshCloudData for interval/focus.
      _refreshInFlight = false;

      // Always sync cloud data if we got it; otherwise loadUserData falls back
      // to localStorage automatically — this is the Single Source of Truth path.
      if (fresh) {
        const meta = fresh.__meta || null;
        if (meta?.allCriticalTimedOut) {
          toastSafe('Warn', 'Cloud data took too long. Showing local data now.');
          setTimeout(() => {
            refreshCloudData({ silent: true, force: true, minIntervalMs: 0 });
          }, 2500);
        }
        if (meta) delete fresh.__meta;
        if (window._SP_syncFromCloud) {
          window._SP_syncFromCloud(fresh);
        }
      }

      // CRITICAL: loadUserData MUST always be called — cloud or local —
      // so the app arrays (bookings, expenses, etc.) are never left empty.
      if (typeof window.loadUserData === 'function') {
        try {
          window.loadUserData();
        } catch (err) {
          warn('loadUserData failed:', err);
        }
      }

      // Only re-render views if the app shell is already visible.
      if (window.__spAppBooted) {
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof window.renderBookings === 'function') window.renderBookings();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
        if (typeof window.renderArtists === 'function') window.renderArtists();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
      }

      if (options.runMigration !== false) {
        setTimeout(() => migrateLocalStorageData(), 2000);
      }
      if (_activeTeamId) {
        try {
          const teams = await withTimeout(() => getMyTeams(), 5000, 'getMyTeams');
          const active = teams.find(t => t.id === _activeTeamId);
          setActiveTeamRole(active?.myRole || null);
        } catch (err) {
          warn('Active team role refresh failed:', err);
        }
      } else {
        setActiveTeamRole(null);
      }
    })();

    return true;
  }

  async function signInWithGoogle() {
    // If user explicitly logged out before, allow a fresh OAuth login.
    localStorage.removeItem('sp_logged_out');
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getSafeRedirectUrl() }
    });
    if (error) throw error;
  }

  // Declarative action bridge used by data-action="signInWithGoogle".
  window.signInWithGoogle = async function signInWithGoogleAction() {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (typeof window.toastError === 'function') {
        window.toastError(err?.message || 'Google sign-in failed.');
      }
    }
  };

  async function signOut() {
    await db.auth.signOut();
    _session = null;
    _profile = null;
    _activeTeamId = null;
    localStorage.removeItem('sp_active_team');
    setActiveTeamRole(null);
    unsubscribeFromCoreRealtime();
  }

  async function getSession() {
    const { data, error } = await db.auth.getSession();
    if (error) return null;
    _session = data.session;
    return data.session;
  }

  async function getProfile() {
    if (!getOwnerId()) return null;
    const { data, error } = await db.from('profiles').select('*').eq('id', getOwnerId()).single();
    if (error) return null;
    _profile = data;
    return data;
  }

  async function updateProfile(updates) {
    if (!getOwnerId()) return;
    const { error } = await db.from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', getOwnerId());
    if (error) warn('Profile update error:', error);
  }

  // Auth state listener
  db.auth.onAuthStateChange(async (event, session) => {
    // Guard: if the user explicitly logged out, do NOT re-bootstrap even if
    // the Supabase SDK fires INITIAL_SESSION with a stale token (e.g. because
    // the server-side revocation hasn't propagated yet). Clean up and bail out.
    if (localStorage.getItem('sp_logged_out') === '1') {
      if (event === 'SIGNED_IN' && session?.user) {
        // Fresh login should override the logout flag.
        localStorage.removeItem('sp_logged_out');
      } else {
        _session = null;
        if (session) {
          // A stale token survived — revoke it silently.
          db.auth.signOut().catch(() => {});
        }
        return;
      }
    }
 

    _session = session;
    if (session?.user) {
      subscribeToCoreRealtime();
    } else {
      unsubscribeFromCoreRealtime();
    }

    // Always keep _profile warm on any session event.
    if (session && !_profile) {
      try {
        _profile = await ensureProfileRecord(session.user);
      } catch (err) {
        warn('onAuthStateChange: ensureProfileRecord failed (non-fatal):', err);
      }
      if (_profile?.preferred_currency) {
        _currency = _profile.preferred_currency;
        applyCurrency(_currency);
      }
    }

    // Full bootstrap path: app not yet booted, not already in progress.
    const shouldBootstrap =
      Boolean(session) &&
      !window.__spAppBooted &&
      !_bootstrapping &&
      (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED');

    if (shouldBootstrap) {
      _bootstrapping = true;
      try {
        await bootstrapFromSupabaseSession(session, {
          remember: true,
          showWelcome: event === 'SIGNED_IN',
          runMigration: true,
        });
      } finally {
        _bootstrapping = false;
      }
      return;
    }

    // App is already booted (returning user with localStorage session) but a fresh
    // SIGNED_IN just fired — pull cloud data so the new-device scenario stays in sync.
    if (event === 'SIGNED_IN' && session && window.__spAppBooted && !_bootstrapping) {
      try {
        const fresh = await withTimeout(() => loadAllData(), 8000, 'loadAllData[reSync]');
        const meta = fresh?.__meta || null;
        if (fresh && meta) delete fresh.__meta;
        if (fresh && window._SP_syncFromCloud) {
          window._SP_syncFromCloud(fresh);
        }
        if (typeof window.loadUserData === 'function') window.loadUserData();
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof window.renderBookings === 'function') window.renderBookings();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
        if (typeof window.renderArtists === 'function') window.renderArtists();
      } catch (reSyncErr) {
        warn('onAuthStateChange re-sync failed (non-fatal):', reSyncErr);
      }
    }
  });

  // ── TEAMS ─────────────────────────────────────────────────────────────────────
  async function createTeam(name) {
    const ownerId = getOwnerId();
    if (!ownerId) throw new Error('Not logged in');

    // Use a single RPC call that inserts teams + team_members atomically.
    // This replaces two sequential db.from().insert() calls — halving the number
    // of Web Lock acquisitions and eliminating the "steal" race condition.
    const { data, error } = await db.rpc('create_team_with_member', {
      p_name:     name,
      p_owner_id: ownerId,
    });
    if (error) throw error;

    // RPC returns the teams row as JSON
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function getMyTeams() {
    if (!getOwnerId()) return [];
    const { data, error } = await db.from('team_members')
      .select('role, teams(id, name, invite_code, owner_id)')
      .eq('user_id', getOwnerId());
    if (error) { warn('getMyTeams error:', error); return []; }
    const teams = (data || []).map(row => ({ ...row.teams, myRole: row.role }));
    if (_activeTeamId) {
      const active = teams.find(t => t.id === _activeTeamId);
      setActiveTeamRole(active?.myRole || null);
    }
    return teams;
  }

  async function joinTeamByCode(inviteCode) {
    // Single RPC replaces SELECT teams + INSERT team_members — one lock acquisition,
    // one round-trip, atomic. Prevents the lock contention that caused the timeout.
    const { data, error } = await db.rpc('join_team_by_code', {
      p_invite_code: inviteCode.trim().toLowerCase(),
      p_user_id:     getOwnerId(),
    });
    if (error) throw new Error(error.message?.includes('Invalid invite code') ? 'Invalid invite code' : error.message);
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function getTeamMembers(teamId) {
    const { data, error } = await db.from('team_members')
      .select('user_id, role, joined_at, profiles(id, username, email, avatar)')
      .eq('team_id', teamId);
    if (error) { warn('getTeamMembers error:', error); return []; }
    return (data || []).map(row => ({
      ...row.profiles,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  }

  async function switchTeam(teamId) {
    _activeTeamId = teamId;
    localStorage.setItem('sp_active_team', teamId || '');
    if (_activeTeamId) {
      try {
        const teams = await getMyTeams();
        const active = teams.find(t => t.id === _activeTeamId);
        setActiveTeamRole(active?.myRole || null);
      } catch (err) {
        warn('switchTeam role refresh failed:', err);
      }
    } else {
      setActiveTeamRole(null);
    }
    subscribeToCoreRealtime();
    // Reload data in the app
    if (typeof window.loadUserData === 'function') {
      await reloadAppData();
    }
  }

  async function leaveTeam(teamId) {
    await db.from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', getOwnerId());
    if (_activeTeamId === teamId) {
      _activeTeamId = null;
      localStorage.removeItem('sp_active_team');
      setActiveTeamRole(null);
    }
  }

  async function updateTeamMemberRole(teamId, userId, role) {
    if (!teamId || !userId || !role) return;
    try {
      const { error } = await db.from('team_members')
        .update({ role })
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error) throw error;
      toastSafe('Success', 'Member role updated.');
      showTeamModal();
    } catch (err) {
      toastSafe('Error', err.message || 'Failed to update role.');
    }
  }

  async function removeTeamMember(teamId, userId) {
    if (!teamId || !userId) return;
    try {
      const { error } = await db.from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error) throw error;
      toastSafe('Success', 'Member removed.');
      showTeamModal();
    } catch (err) {
      toastSafe('Error', err.message || 'Failed to remove member.');
    }
  }

  async function migratePersonalDataToTeam(teamId) {
    if (!teamId) return;
    const ownerId = getOwnerId();
    if (!ownerId) return;
    const previousTeamId = _activeTeamId;
    _activeTeamId = null;
    const personalData = await loadAllData();
    _activeTeamId = teamId;
    localStorage.setItem('sp_active_team', teamId);
    setActiveTeamRole('owner');
    if (personalData) {
      await saveAllData(personalData);
    }
    if (typeof window.loadUserData === 'function') {
      await reloadAppData();
    }
    if (previousTeamId !== teamId && previousTeamId) {
      warn('Personal data migrated to team; previous team context replaced.');
    }
  }

  // ── TEAM CHAT ─────────────────────────────────────────────────────────────────
  async function loadMessages(teamId, limit = 50) {
    const { data, error } = await db.from('messages')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { warn('loadMessages error:', error); return []; }
    return (data || []).reverse();
  }

  async function sendMessage(teamId, content, msgType = 'text') {
    const profile = _profile || await getProfile();
    const { error } = await db.from('messages').insert({
      team_id: teamId,
      user_id: getOwnerId(),
      username: profile?.username || 'Manager',
      content,
      msg_type: msgType,
    });
    if (error) throw error;
  }

  function subscribeToTeamChat(teamId, onMessage) {
    if (_realtimeChannel) {
      db.removeChannel(_realtimeChannel);
    }
    _realtimeChannel = db.channel(`team-chat-${teamId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `team_id=eq.${teamId}`,
      }, payload => onMessage(payload.new))
      .subscribe();
    return _realtimeChannel;
  }

  function unsubscribeFromChat() {
    if (_realtimeChannel) {
      db.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }
  }

  // ── CURRENCY ─────────────────────────────────────────────────────────────────
  function applyCurrency(code) {
    const curr = SP_CURRENCIES[code];
    if (!curr) return;
    _currency = code;
    localStorage.setItem('sp_currency', code);

    // Update the displayed currency badge if it exists
    const badge = document.getElementById('spCurrencyBadge');
    if (badge) badge.textContent = curr.symbol;

    const toConverted = (ugxAmount) => (Number(ugxAmount) || 0) * curr.rate;
    const fractionDigits = curr.rate < 0.01 ? 2 : 0;
    const formatConverted = (ugxAmount) => {
      const converted = toConverted(ugxAmount);
      return `${curr.symbol} ${converted.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      })}`;
    };
    // Global formatters consumed by app.js.
    window.SP_formatCurrency = formatConverted;
    window.SP_formatCurrencyFull = formatConverted;

    // Re-render app if logged in
    if (typeof window.updateDashboard === 'function') {
      window.updateDashboard();
      if (typeof window.renderBookings === 'function')   window.renderBookings();
      if (typeof window.renderExpenses === 'function')   window.renderExpenses();
      if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
    }
  }

  async function setCurrency(code) {
    if (!SP_CURRENCIES[code]) return;
    applyCurrency(code);
    await updateProfile({ preferred_currency: code });
    toastSafe('Success', `Currency switched to ${SP_CURRENCIES[code].name}`);
  }

  // ── APP RELOAD HELPER ─────────────────────────────────────────────────────────
  async function reloadAppData() {
    const fresh = await loadAllData();
    if (!fresh) return;
    const meta = fresh.__meta || null;
    if (meta) delete fresh.__meta;

    // Inject data into app's global scope
    if (Array.isArray(fresh.bookings) && typeof window.bookings !== 'undefined') {
      window.bookings = fresh.bookings;
    }
    if (Array.isArray(fresh.expenses) && typeof window.expenses !== 'undefined') {
      window.expenses = fresh.expenses;
    }
    if (Array.isArray(fresh.otherIncome) && typeof window.otherIncome !== 'undefined') {
      window.otherIncome = fresh.otherIncome;
    }

    // Update internal module arrays via saveManagerData bridge
    if (window._SP_syncFromCloud) {
      window._SP_syncFromCloud(fresh);
    }

    // Trigger re-renders
    if (typeof window.updateDashboard === 'function')    window.updateDashboard();
    if (typeof window.renderBookings === 'function')     window.renderBookings();
    if (typeof window.renderExpenses === 'function')     window.renderExpenses();
    if (typeof window.renderOtherIncome === 'function')  window.renderOtherIncome();
    if (typeof window.renderArtists === 'function')      window.renderArtists();
  }

  // ── TEAM UI ─────────────────────────────────────────────────────────────────
  function buildTeamPanelHTML(teams, activeTeamId, members) {
    const membersHTML = members.map(m => `
      <div class="sp-team-member">
        <div class="sp-team-member-avatar">${(m.username || m.email || '?')[0].toUpperCase()}</div>
        <div class="sp-team-member-info">
          <div class="sp-team-member-name">${m.username || m.email}</div>
          <div class="sp-team-member-role">${m.role}</div>
        </div>
      </div>
    `).join('');

    const teamsHTML = teams.map(t => `
      <div class="sp-team-item ${t.id === activeTeamId ? 'sp-team-item--active' : ''}"
           onclick="window.SP.switchTeam('${t.id}')">
        <div class="sp-team-name">${t.name}</div>
        <div class="sp-team-role">${t.myRole}</div>
      </div>
    `).join('');

    return `
      <div class="sp-team-panel">
        <div class="sp-team-panel-header">
          <h3>Team Workspace</h3>
          <button class="sp-modal-close" onclick="document.getElementById('spTeamModal').style.display='none'">✕</button>
        </div>

        <div class="sp-team-section">
          <h4>My Teams</h4>
          ${teamsHTML || '<p class="sp-muted">No teams yet</p>'}
          <div class="sp-team-actions">
            <button class="action-btn" onclick="window.SP.showCreateTeamForm()">+ Create Team</button>
            <button class="action-btn" onclick="window.SP.showJoinTeamForm()"><i class="ph ph-link" aria-hidden="true"></i> Join by Code</button>
          </div>
        </div>

        ${activeTeamId ? `
        <div class="sp-team-section">
          <h4>Team Members</h4>
          ${membersHTML}
          <div class="sp-team-invite-code">
            <label>Invite Code</label>
            <div class="sp-team-code-row">
              <code id="spTeamInviteCode">${teams.find(t => t.id === activeTeamId)?.invite_code || '—'}</code>
              <button class="action-btn" onclick="window.SP.copyInviteCode()">Copy</button>
            </div>
            <p class="sp-muted">Share this code so others can join your team.</p>
          </div>
        </div>
        <div class="sp-team-section">
          <h4>Team Chat</h4>
          <div id="spTeamChatMessages" class="sp-chat-messages"></div>
          <div class="sp-chat-input-row">
            <input type="text" id="spChatInput" class="form-input" placeholder="Type a message…" 
                   onkeydown="if(event.key==='Enter')window.SP.sendChatMessage()">
            <button class="action-btn" onclick="window.SP.sendChatMessage()">Send</button>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Override team panel builder to include role management controls.
  function buildTeamPanelHTML(teams, activeTeamId, members) {
    const activeTeam = teams.find(t => t.id === activeTeamId);
    const isOwner = activeTeam && activeTeam.owner_id === getOwnerId();

    const membersHTML = members.length ? members.map(m => {
      const displayName = m.username || m.email || 'Member';
      const isSelf = m.userId && m.userId === getOwnerId();
      const canManageMember = isOwner && !isSelf && m.role !== 'owner';
      const roleControl = canManageMember
        ? `
            <select class="sp-team-role-select" onchange="window.SP.updateTeamMemberRole('${activeTeamId}','${m.userId}', this.value)">
              <option value="manager" ${m.role === 'manager' ? 'selected' : ''}>Manager</option>
              <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>
          `
        : `<div class="sp-team-member-role">${m.role}</div>`;
      const removeButton = canManageMember
        ? `<button class="action-btn action-btn--danger sp-team-remove-btn" onclick="window.SP.removeTeamMember('${activeTeamId}','${m.userId}')">Remove</button>`
        : '';
      return `
        <div class="sp-team-member">
          <div class="sp-team-member-avatar">${displayName[0].toUpperCase()}</div>
          <div class="sp-team-member-info">
            <div class="sp-team-member-name">${displayName}</div>
            ${roleControl}
          </div>
          ${removeButton}
        </div>
      `;
    }).join('') : '<p class="sp-muted">No members yet</p>';

    const teamsHTML = teams.map(t => `
      <div class="sp-team-item ${t.id === activeTeamId ? 'sp-team-item--active' : ''}"
           onclick="window.SP.switchTeam('${t.id}')">
        <div class="sp-team-name">${t.name}</div>
        <div class="sp-team-role">${t.myRole}</div>
      </div>
    `).join('');

    return `
      <div class="sp-team-panel">
        <div class="sp-team-panel-header">
          <h3>Team Workspace</h3>
          <button class="sp-modal-close" onclick="document.getElementById('spTeamModal').style.display='none'">âœ•</button>
        </div>

        <div class="sp-team-section">
          <h4>My Teams</h4>
          ${teamsHTML || '<p class="sp-muted">No teams yet</p>'}
          <div class="sp-team-actions">
            <button class="action-btn" onclick="window.SP.showCreateTeamForm()">+ Create Team</button>
            <button class="action-btn" onclick="window.SP.showJoinTeamForm()"><i class="ph ph-link" aria-hidden="true"></i> Join by Code</button>
          </div>
        </div>

        ${activeTeamId ? `
        <div class="sp-team-section">
          <h4>Team Members</h4>
          ${membersHTML}
          <div class="sp-team-invite-code">
            <label>Invite Code</label>
            <div class="sp-team-code-row">
              <code id="spTeamInviteCode">${activeTeam?.invite_code || '-'}</code>
              <button class="action-btn" onclick="window.SP.copyInviteCode()">Copy</button>
            </div>
            <p class="sp-muted">Share this code so others can join your team.</p>
          </div>
        </div>
        <div class="sp-team-section">
          <h4>Team Chat</h4>
          <div id="spTeamChatMessages" class="sp-chat-messages"></div>
          <div class="sp-chat-input-row">
            <input type="text" id="spChatInput" class="form-input" placeholder="Type a message..." 
                   onkeydown="if(event.key==='Enter')window.SP.sendChatMessage()">
            <button class="action-btn" onclick="window.SP.sendChatMessage()">Send</button>
          </div>
        </div>
        ` : ''}
      </div>
    `;
  }

  async function showTeamModal() {
    // Guard: must be logged in (retry session fetch once)
    if (!getOwnerId()) {
      await ensureSupabaseSession({ silent: false, clearIfMissing: true });
    }
    if (!getOwnerId()) {
      toastSafe('Info', 'Please log in to access Team features.');
      return;
    }

    let modal = document.getElementById('spTeamModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'spTeamModal';
      modal.className = 'sp-admin-modal';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="sp-modal-backdrop" onclick="this.parentElement.style.display='none'"></div>
        <div class="sp-modal-box" style="max-width:560px;padding:0;">
          <div id="spTeamPanelContent" style="padding:24px;">
            <div style="text-align:center;padding:24px;opacity:0.6;">Loading…</div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    // Show modal immediately with loading state
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Hard 8-second timeout — if the DB query hangs (e.g. recursive RLS),
    // we reject immediately so the user sees an error instead of infinite spin.
    const withTimeout = (promise, ms, label) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s — check Supabase RLS policies`)), ms)
        ),
      ]);

    try {
      const teams   = await withTimeout(getMyTeams(), 8000, 'getMyTeams');
      const active = teams.find(t => t.id === _activeTeamId);
      setActiveTeamRole(active?.myRole || null);
      const members = _activeTeamId
        ? await withTimeout(getTeamMembers(_activeTeamId), 8000, 'getTeamMembers')
        : [];

      document.getElementById('spTeamPanelContent').innerHTML =
        buildTeamPanelHTML(teams, _activeTeamId, members);

      // Load and subscribe to chat if team active
      if (_activeTeamId) {
        const msgs = await withTimeout(loadMessages(_activeTeamId), 8000, 'loadMessages');
        renderChatMessages(msgs);
        subscribeToTeamChat(_activeTeamId, (newMsg) => {
          const container = document.getElementById('spTeamChatMessages');
          if (container) {
            container.innerHTML += buildMessageHTML(newMsg);
            container.scrollTop = container.scrollHeight;
          }
        });
      }
    } catch (err) {
      warn('showTeamModal error:', err);
      const content = document.getElementById('spTeamPanelContent');
      if (content) {
        const isTimeout = err.message && err.message.includes('timed out');
        content.innerHTML = `
          <div class="sp-team-panel-header">
            <h3>Team Workspace</h3>
            <button class="sp-modal-close" onclick="document.getElementById('spTeamModal').style.display='none'">✕</button>
          </div>
          <p style="color:#ef4444;padding:16px 0;">
            ${isTimeout
              ? 'Team data took too long to load. Check your connection and try again.'
              : 'Failed to load team data. Check your connection and try again.'}
          </p>
        `;
      }
    }
  }

  function buildMessageHTML(msg) {
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isOwn = msg.user_id === getOwnerId();
    return `
      <div class="sp-chat-message ${isOwn ? 'sp-chat-message--own' : ''}">
        <div class="sp-chat-message-header">
          <span class="sp-chat-username">${msg.username}</span>
          <span class="sp-chat-time">${time}</span>
        </div>
        <div class="sp-chat-bubble">${msg.content}</div>
      </div>`;
  }

  function renderChatMessages(msgs) {
    const container = document.getElementById('spTeamChatMessages');
    if (!container) return;
    container.innerHTML = msgs.map(buildMessageHTML).join('');
    container.scrollTop = container.scrollHeight;
  }

  async function sendChatMessage() {
    if (!_activeTeamId) return;
    const input = document.getElementById('spChatInput');
    const content = input?.value?.trim();
    if (!content) return;
    input.value = '';
    try {
      await sendMessage(_activeTeamId, content);
    } catch (err) {
      toastSafe('Error', 'Failed to send message');
    }
  }

  async function showCreateTeamForm() {
    const name = prompt('Enter a name for your team:');
    if (!name?.trim()) return;
    try {
      // Await createTeam fully — the RPC lock must be released before showTeamModal
      // fires getMyTeams(), otherwise two lock acquisitions overlap and race.
      const team = await createTeam(name.trim());
      toastSafe('Success', `Team "${team.name}" created! Migrating your data...`);
      await migratePersonalDataToTeam(team.id);
      // Small yield so the JS event loop fully clears the previous lock state
      await new Promise(r => setTimeout(r, 80));
      showTeamModal();
    } catch (err) {
      if (err?.name !== 'AbortError') toastSafe('Error', err.message || 'Failed to create team');
    }
  }

  async function showJoinTeamForm() {
    const code = prompt('Enter your invite code:');
    if (!code?.trim()) return;
    try {
      const team = await joinTeamByCode(code.trim());
      toastSafe('Success', `Joined team "${team.name}"!`);
      // 500ms yield — lets Postgres fully commit the new team_members row
      // before getMyTeams() reads it back inside showTeamModal.
      await new Promise(r => setTimeout(r, 500));
      await switchTeam(team.id);
      showTeamModal();
    } catch (err) {
      if (err?.name !== 'AbortError') toastSafe('Error', err.message || 'Invalid invite code');
    }
  }

  function copyInviteCode() {
    const code = document.getElementById('spTeamInviteCode')?.textContent;
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => toastSafe('Success', 'Invite code copied!'));
  }

  // ── CURRENCY SWITCHER UI ──────────────────────────────────────────────────────
  function showCurrencySwitcher() {
    let modal = document.getElementById('spCurrencyModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'spCurrencyModal';
      modal.className = 'sp-admin-modal';
      modal.innerHTML = `
        <div class="sp-modal-backdrop" onclick="this.parentElement.style.display='none'"></div>
        <div class="sp-modal-box" style="max-width:380px;">
          <button class="sp-modal-close" onclick="document.getElementById('spCurrencyModal').style.display='none'">✕</button>
          <div style="padding:8px 0 16px;">
            <div class="sp-modal-title">Currency</div>
            <div class="sp-modal-subtitle">All figures will convert in real-time</div>
          </div>
          <div id="spCurrencyList" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;"></div>
        </div>`;
      document.body.appendChild(modal);
    }

    const list = document.getElementById('spCurrencyList');
    list.innerHTML = Object.entries(SP_CURRENCIES).map(([code, c]) => `
      <button class="action-btn ${_currency === code ? 'action-btn--active' : ''}"
              style="text-align:left;justify-content:flex-start;gap:12px;font-size:13px;"
              onclick="window.SP.setCurrency('${code}');document.getElementById('spCurrencyModal').style.display='none'">
        <strong>${c.symbol}</strong> ${c.name} <span style="margin-left:auto;opacity:.5">${code}</span>
      </button>
    `).join('');

    modal.style.display = 'flex';
  }

  // ── INJECT CURRENCY BUTTON INTO SIDEBAR ──────────────────────────────────────
  function injectDashboardCurrencyButton() {
    const cardHead = document.querySelector('#dashboard .dashboard-at-glance-card .mainstage-strip__head');
    if (!cardHead) return;

    let actions = document.getElementById('spAtGlanceActions');
    if (!actions) {
      actions = document.createElement('div');
      actions.id = 'spAtGlanceActions';
      actions.className = 'sp-at-glance-actions';
      const updatedEl = document.getElementById('mainstageLiveDate');
      if (updatedEl && updatedEl.parentElement === cardHead) {
        actions.appendChild(updatedEl);
      }
      cardHead.appendChild(actions);
    }

    if (!document.getElementById('spCurrencyBtnAtGlance')) {
      const btn = document.createElement('button');
      btn.id = 'spCurrencyBtnAtGlance';
      btn.className = 'action-btn sp-currency-at-glance-btn';
      btn.type = 'button';
      btn.title = 'Switch currency';
      btn.innerHTML = `<span id="spCurrencyBadge">${SP_CURRENCIES[_currency]?.symbol || 'UGX'}</span> Currency`;
      btn.onclick = () => window.SP.showCurrencySwitcher();
      actions.appendChild(btn);
    }
  }

  function injectSidebarButtons() {
    const logoutBtn = document.getElementById('sidebarLogoutBtn');
    const legacyCurrencyBtn = document.getElementById('spCurrencyBtn');
    if (legacyCurrencyBtn) {
      legacyCurrencyBtn.remove();
    }

    injectDashboardCurrencyButton();
    if (!logoutBtn) return;

    let stack = document.getElementById('spSidebarActionStack');
    if (!stack) {
      const logoutSection = document.querySelector('.sidebar-logout-section');
      if (!logoutSection || !logoutSection.parentElement) return;
      stack = document.createElement('div');
      stack.id = 'spSidebarActionStack';
      stack.className = 'sidebar-extra-actions';
      logoutSection.parentElement.insertBefore(stack, logoutSection);
    }

    if (!document.getElementById('spTeamBtn')) {
      const btn = document.createElement('button');
      btn.id = 'spTeamBtn';
      btn.className = 'sidebar-currency-btn';
      btn.title = 'Team workspace';
      btn.innerHTML = `<i class="ph ph-users-three" aria-hidden="true" style="font-size:16px;"></i> Team`;
      btn.onclick = () => window.SP.showTeamModal();
      stack.appendChild(btn);
    }
  }

  // ── PATCH APP LOGIN/SIGNUP TO SUPABASE ────────────────────────────────────────
  function patchAppAuth() {
    // Store reference to original functions as fallback
    const _origLogin = window.login;
    const _origSignup = window.signup;
    const _origLogout = window.logout;
    
    window.signInWithGoogle = async function supabaseGoogleSignIn() {
      if (window.__spGoogleSignInPending) return;
      window.__spGoogleSignInPending = true;
      setTimeout(() => {
        window.__spGoogleSignInPending = false;
      }, 10000);
      try {
        await signInWithGoogle();
        if (typeof window.toastInfo === 'function') {
          window.toastInfo('Continuing with Google...');
        }
      } catch (err) {
        window.__spGoogleSignInPending = false;
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('provider is not enabled') || msg.includes('provider disabled')) {
          if (typeof window.toastError === 'function') {
            window.toastError('Google sign-in is not enabled in Supabase Authentication Providers yet.');
          }
          return;
        }
        if (typeof window.toastError === 'function') {
          window.toastError(err?.message || 'Google sign-in failed.');
        }
      }
    };

    // ── SUPABASE LOGIN ──────────────────────────────────────────────────────────
    window.login = async function supabaseLogin() {
      const nameOrEmail = document.getElementById('loginName')?.value?.trim() || '';
      const password    = document.getElementById('loginPassword')?.value || '';

      if (!nameOrEmail || !password) {
        if (typeof window.toastError === 'function') window.toastError('Name and password are required.');
        return;
      }

      const setLoading = window.setLoginLoading || (() => {});
      setLoading(true);

      try {
        // If input looks like a username (no @), look up email from profile
        let email = nameOrEmail;
        if (!nameOrEmail.includes('@')) {
          const resolvedEmail = await lookupEmailForUsername(nameOrEmail);
          if (resolvedEmail) {
            email = resolvedEmail;
          }
          // No match — fall through with nameOrEmail; signIn will reject with a clear error.
        }

        const { data } = await signIn(email, password);
        // bootstrapFromSupabaseSession handles showApp + showWelcomeMessage internally.
        // Do NOT call them again here — that causes a double-render.
        const booted = await bootstrapFromSupabaseSession(data?.session, {
          usernameHint: nameOrEmail,
          remember: Boolean(document.getElementById('rememberMe')?.checked),
          showWelcome: true,
          runMigration: true,
        });
        if (!booted) {
          // Session was valid but bootstrap couldn't show the app — surface an error.
          throw new Error('Login failed: could not initialise session.');
        }
      } catch (err) {
        const errMsg = String(err?.message || '').toLowerCase();
        const shouldFallback =
          typeof _origLogin === 'function' &&
          (errMsg.includes('failed to fetch') ||
           errMsg.includes('network') ||
           errMsg.includes('invalid url') ||
           errMsg.includes('api key'));
        if (shouldFallback) {
          if (!SP_ALLOW_LOCAL_FALLBACK) {
            warn('Supabase login unavailable; local fallback disabled.', err);
            if (typeof window.toastError === 'function') {
              window.toastError('Cloud login unavailable. Please check your connection and try again.');
            }
            return;
          }
          warn('Supabase login unavailable. Falling back to local auth.', err);
          if (typeof window.toastWarn === 'function') {
            window.toastWarn('Cloud login unavailable. Using local login on this device.');
          }
          return _origLogin();
        }
        let msg = 'Invalid credentials. Please try again.';
        if (errMsg.includes('email not confirmed')) msg = 'Please check your email to confirm your account first.';
        if (errMsg.includes('invalid login credentials')) msg = 'Incorrect email or password.';
        if (typeof window.toastError === 'function') window.toastError(msg);
      } finally {
        // Guaranteed: spinner always stops, button always re-enables.
        setLoading(false);
      }
    };

    // ── SUPABASE SIGNUP ─────────────────────────────────────────────────────────
    window.signup = async function supabaseSignup() {
      const name  = document.getElementById('signupName')?.value?.trim() || '';
      const pw    = document.getElementById('signupPassword')?.value || '';
      const email = document.getElementById('signupEmail')?.value?.trim() || '';
      const phone = document.getElementById('signupPhone')?.value?.trim() || '';

      if (!name || !pw || !email) {
        if (typeof window.toastError === 'function') window.toastError('Name, email, and password are required.');
        return;
      }

      try {
        const available = await isUsernameAvailable(name);
        if (available === false) {
          if (typeof window.toastError === 'function') {
            window.toastError('That username is already taken. Please choose another.');
          }
          return;
        }
        const result = await signUp(name, email, pw, phone);
        if (result?.session) {
          await bootstrapFromSupabaseSession(result.session, {
            usernameHint: name,
            remember: true,
            showWelcome: true,
            runMigration: true,
          });
          if (typeof window.toastSuccess === 'function') {
            window.toastSuccess('Account created and signed in.');
          }
          return;
        }
        if (typeof window.toastSuccess === 'function') {
          window.toastSuccess('Account created! Check your email to confirm, then log in.');
        }
        if (typeof window.showLoginForm === 'function') window.showLoginForm();
      } catch (err) {
        const errMsg = String(err?.message || '').toLowerCase();
        const shouldFallback =
          typeof _origSignup === 'function' &&
          (errMsg.includes('failed to fetch') ||
           errMsg.includes('network') ||
           errMsg.includes('invalid url') ||
           errMsg.includes('api key'));
        if (shouldFallback) {
          if (!SP_ALLOW_LOCAL_FALLBACK) {
            warn('Supabase signup unavailable; local fallback disabled.', err);
            if (typeof window.toastError === 'function') {
              window.toastError('Cloud signup unavailable. Please check your connection and try again.');
            }
            return;
          }
          warn('Supabase signup unavailable. Falling back to local signup.', err);
          if (typeof window.toastWarn === 'function') {
            window.toastWarn('Cloud signup unavailable. Using local account mode.');
          }
          return _origSignup();
        }
        let msg = err.message?.includes('already registered')
          ? 'That email is already registered.'
          : err.message || 'Sign up failed. Please try again.';
        if (errMsg.includes('database error saving new user') || errMsg.includes('profiles_username_key')) {
          msg = 'That username is already taken. Please choose another.';
        }
        if (typeof window.toastError === 'function') window.toastError(msg);
      }
    };

    // ── SUPABASE LOGOUT ─────────────────────────────────────────────────────────
    window.logout = async function supabaseLogout() {
      // 1. Persist any unsaved work to localStorage first.
      if (typeof window.saveUserData === 'function') window.saveUserData();

      // 2. CRITICAL — Directly delete the Supabase SDK's own auth token from
      //    localStorage. The SDK stores it under a well-known key. This is
      //    synchronous and instant. Without this step, the SDK finds its own
      //    token on the next page load and fires onAuthStateChange('INITIAL_SESSION'),
      //    which re-boots the app even though the user logged out.
      const _projectRef = SP_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
      localStorage.removeItem('sb-' + _projectRef + '-auth-token');
      localStorage.removeItem('sb-' + _projectRef + '-auth-token-code-verifier');
      localStorage.removeItem(SP_SUPABASE_STORAGE_KEY);

      // 3. Set a persistent "explicitly logged out" flag.
      //    onAuthStateChange and checkAuth() both check this before bootstrapping.
      localStorage.setItem('sp_logged_out', '1');

      // 4. Clear all OUR session keys (starPaper_session, starPaperRemember, etc.)
      if (typeof window.clearAuthSessionState === 'function') {
        window.clearAuthSessionState();
      } else {
        window.currentUser = null;
        window.currentManagerId = null;
        localStorage.removeItem('starPaper_session');
        localStorage.removeItem('starPaperSessionUser');
        localStorage.removeItem('starPaperRemember');
        localStorage.removeItem('starPaperCurrentUser');
      }

      // 5. Reset runtime flag so a same-tab re-login works cleanly.
      window.__spAppBooted = false;
      _session = null;
      _profile = null;
      unsubscribeFromCoreRealtime();

      // 6. Show landing page immediately — user doesn't wait for any network call.
      if (typeof window.setActiveScreen === 'function') window.setActiveScreen('landingScreen');
      if (typeof window.toastInfo === 'function') window.toastInfo('Logged out');

      // 7. Revoke the server-side token in the background (best-effort).
      //    Even if this fails the user is fully logged out locally (steps 2–5 above).
      signOut().catch(() => {});
    };

    // ── PATCH saveUserData TO CLOUD-FIRST SYNC ──────────────────────────────────
    const _origSaveUserData = window.saveUserData;
    window.saveUserData = async function supabaseSaveUserData() {
      // 1. Persist to localStorage immediately for offline resilience
      if (typeof _origSaveUserData === 'function') _origSaveUserData();

      // 2. Sync to Supabase cloud. saveData() also back-fills cloud UUIDs into
      //    the live arrays so future saves are idempotent (no more duplicates).
      if (!getOwnerId()) {
        await ensureSupabaseSession({ silent: true, clearIfMissing: false });
      }
      if (getOwnerId()) {
        try {
          if (typeof window.SP_collectAllData === 'function') {
            await saveAllData(window.SP_collectAllData());
          } else if (Array.isArray(window.bookings)) {
            await saveData({
              bookings:    window.bookings    || [],
              expenses:    window.expenses    || [],
              otherIncome: window.otherIncome || [],
            });
            await saveArtists(window.artists || []);
          }
        } catch (cloudErr) {
          warn('Cloud sync failed (data safe in localStorage):', cloudErr);
        }
      }
    };

    log('App auth patched with Supabase');
  }

  // ── SYNC BRIDGE: allows supabase.js to inject data into app's closure ─────────
  // app.js needs to call window._SP_syncFromCloud(data) in loadUserData
  // We set this up after app loads
  function setupSyncBridge() {
    window._SP_cloudData = null;
    window._SP_syncFromCloud = function(data) {
      // Store for app to pick up
      window._SP_cloudData = data;
      // Directly update window-exposed arrays
      if (data.bookings) {
        window.bookings = data.bookings;
      }
      if (data.expenses) {
        window.expenses = data.expenses;
      }
      if (data.otherIncome) {
        window.otherIncome = data.otherIncome;
      }
      if (data.artists) {
        window.artists = data.artists;
      }
    };
  }

  // ── INIT ────────────────────────────────────────────────────────────────────────────
  function init() {
    setupSyncBridge();
    applyCurrency(_currency);
    initLocalSyncBroadcast();

    // handleAuthRedirect() and bootstrapFromStoredSession() must only run AFTER
    // app.js has fully executed — otherwise showApp/loadUserData don’t exist yet
    // and the OAuth callback lands on the landing page instead of the dashboard.
    // We defer everything that calls bootstrapFromSupabaseSession to DOMContentLoaded.
    const onAppReady = () => {
      // Order matters: exchange the OAuth code FIRST, then check for a stored session.
      // exchangeCodeForSession writes to Supabase internal storage;
      // the subsequent getSession() call reads it back.
      handleAuthRedirect().then(() => {
        bootstrapFromStoredSession();
      });

      setTimeout(patchAppAuth, 0);         // replace window.login/signup immediately
      setTimeout(injectSidebarButtons, 1200);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onAppReady, { once: true });
    } else {
      // DOMContentLoaded already fired (synchronous script load after app.js)
      setTimeout(onAppReady, 0);
    }

    window.addEventListener('online', () => {
      if (!getOwnerId()) return;
      if (typeof window.SP_collectAllData === 'function') {
        saveAllData(window.SP_collectAllData()).catch((err) => {
          warn('Online sync failed:', err);
        });
      }
    });

    const triggerCloudRefresh = (reason) => {
      if (!getOwnerId()) return;
      refreshCloudData({ silent: true, minIntervalMs: 5000, reason });
    };
    window.addEventListener('focus', () => triggerCloudRefresh('focus'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) triggerCloudRefresh('visibility');
    });
    if (!window.__spCloudRefreshInterval) {
      window.__spCloudRefreshInterval = setInterval(() => {
        triggerCloudRefresh('interval');
      }, 10000);
    }
  }

  // Separated from init() so it can be sequenced after handleAuthRedirect resolves.
  async function bootstrapFromStoredSession() {
    if (window.__spAppBooted || _bootstrapping) return;
    const session = await getSession();
    if (!session) return;
    _bootstrapping = true;
    try {
      const restored = await bootstrapFromSupabaseSession(session, {
        remember: true,
        showWelcome: false,
        runMigration: true,
      });
      if (restored) {
        log('Session restored for:', _profile?.username || session.user?.email || 'user');
      }
    } finally {
      _bootstrapping = false;
    }
  }


  // ── PUBLIC API ────────────────────────────────────────────────────────────────
  window.SP = {
    // Auth
    login:           (email, password) => signIn(email, password),
    signup:          signUp,
    logout:          signOut,
    getSession,
    getProfile,
    updateProfile,
    signInWithGoogle,
    bootstrap:       bootstrapFromSupabaseSession,

    // Data
    loadData,
    loadAllData,
    refreshCloudData,
    saveData,
    saveAllData,
    saveArtists,
    loadTasks,
    saveTasks,
    deleteBooking,
    deleteExpense,
    deleteOtherIncome,
    deleteArtist,
    deleteTask,
    reloadAppData,

    // Teams
    createTeam,
    getMyTeams,
    joinTeamByCode,
    getTeamMembers,
    switchTeam,
    leaveTeam,
    updateTeamMemberRole,
    removeTeamMember,
    migratePersonalDataToTeam,
    showTeamModal,
    showCreateTeamForm,
    showJoinTeamForm,
    copyInviteCode,

    // Chat
    loadMessages,
    sendMessage,
    sendChatMessage,
    subscribeToTeamChat,
    unsubscribeFromChat,

    // Currency
    setCurrency,
    showCurrencySwitcher,
    currencies: SP_CURRENCIES,
    getCurrentCurrency: () => _currency,

    // State (cached values)
    getSessionState: () => _session,
    getOwnerId,
    getActiveTeamId: () => _activeTeamId,
    getActiveTeamRole,
    getProfileState: () => _profile,

    // Raw client (for advanced use)
    client: db,
  };

  init();
  window.__spSupabaseReady = true;
  try {
    const readyEvent = typeof CustomEvent === 'function'
      ? new CustomEvent('sp-supabase-ready')
      : (() => {
          const evt = document.createEvent('Event');
          evt.initEvent('sp-supabase-ready', true, true);
          return evt;
        })();
    window.dispatchEvent(readyEvent);
  } catch (err) {
    // no-op: event dispatch is best-effort
  }
  log('Supabase integration loaded ✓');

})();

// ── SIDEBAR BUTTON STYLES (injected dynamically) ──────────────────────────────
(function injectTeamCurrencyStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .sidebar-currency-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 16px;
      background: transparent;
      border: 1px solid var(--border, rgba(255,255,255,.1));
      border-radius: 8px;
      color: var(--text-secondary, #aaa);
      font-size: 13px;
      cursor: pointer;
      margin-bottom: 6px;
      transition: background .15s, color .15s;
    }
    .sidebar-currency-btn:hover {
      background: var(--hover-bg, rgba(255,255,255,.06));
      color: var(--text-primary, #fff);
    }
    #spCurrencyBadge {
      font-weight: 700;
      color: var(--gold, #FFB300);
      min-width: 28px;
    }
    .sidebar-extra-actions {
      padding: 8px 4px 0;
    }
    body.sidebar--collapsed .sidebar-extra-actions {
      display: none;
    }
    body.sidebar--collapsed .sidebar:hover .sidebar-extra-actions {
      display: block;
    }
    .sp-at-glance-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }
    .sp-currency-at-glance-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      min-height: 34px;
      padding: 8px 12px;
      font-size: 12px;
      white-space: nowrap;
    }
    .sp-currency-at-glance-btn #spCurrencyBadge {
      min-width: 0;
    }
    @media (max-width: 1024px) {
      #dashboard .dashboard-at-glance-card .mainstage-strip__head {
        flex-wrap: wrap;
        align-items: flex-start;
      }
      .sp-at-glance-actions {
        width: 100%;
        justify-content: space-between;
        margin-top: 6px;
      }
      .sp-currency-at-glance-btn {
        margin-left: auto;
      }
    }
    /* Team panel */
    .sp-team-panel { display:flex; flex-direction:column; gap:16px; }
    .sp-team-panel-header { display:flex; justify-content:space-between; align-items:center; }
    .sp-team-panel-header h3 { margin:0; font-size:16px; }
    .sp-team-section h4 { font-size:12px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted,#888); margin:0 0 10px; }
    .sp-team-item { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.08)); cursor:pointer; margin-bottom:6px; }
    .sp-team-item--active { border-color:var(--gold,#FFB300); background:rgba(255,179,0,.05); }
    .sp-team-name { font-size:14px; font-weight:600; }
    .sp-team-role { font-size:11px; text-transform:uppercase; color:var(--text-muted,#888); }
    .sp-team-member { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border,rgba(255,255,255,.05)); }
    .sp-team-member-avatar { width:32px; height:32px; border-radius:50%; background:var(--gold,#FFB300); color:#000; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .sp-team-member-name { font-size:13px; font-weight:600; }
    .sp-team-member-role { font-size:11px; color:var(--text-muted,#888); text-transform:uppercase; }
    .sp-team-invite-code { margin-top:10px; }
    .sp-team-invite-code label { font-size:12px; text-transform:uppercase; color:var(--text-muted,#888); display:block; margin-bottom:6px; }
    .sp-team-code-row { display:flex; align-items:center; gap:8px; }
    .sp-team-code-row code { background:var(--surface,rgba(255,255,255,.05)); padding:6px 12px; border-radius:6px; font-size:16px; letter-spacing:.1em; font-family:monospace; }
    .sp-team-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    /* Chat */
    .sp-chat-messages { max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding:8px 0; border-top:1px solid var(--border,rgba(255,255,255,.08)); }
    .sp-chat-message { display:flex; flex-direction:column; gap:2px; max-width:88%; }
    .sp-chat-message--own { align-self:flex-end; }
    .sp-chat-message-header { display:flex; gap:8px; align-items:baseline; }
    .sp-chat-username { font-size:11px; font-weight:700; color:var(--gold,#FFB300); }
    .sp-chat-time { font-size:10px; color:var(--text-muted,#888); }
    .sp-chat-bubble { background:var(--surface,rgba(255,255,255,.06)); padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.4; }
    .sp-chat-message--own .sp-chat-bubble { background:rgba(255,179,0,.12); }
    .sp-chat-input-row { display:flex; gap:8px; margin-top:10px; }
    .sp-chat-input-row .form-input { flex:1; font-size:13px; }
    .sp-muted { font-size:12px; color:var(--text-muted,#888); margin:0; }
    .action-btn--active { background:var(--gold,#FFB300) !important; color:#000 !important; }
  `;
  document.head.appendChild(style);
})();
