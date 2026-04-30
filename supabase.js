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
const SP_SUPABASE_PKCE_KEY = `${SP_SUPABASE_STORAGE_KEY}-code-verifier`;
const SP_SUPABASE_PROJECT_REF = SP_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
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

const SP_TEAM_ROLE_PRESETS = {
  owner:   { label: 'Owner',   read: true, edit: true, finance: true, reports: true, admin: true },
  admin:   { label: 'Admin',   read: true, edit: true, finance: true, reports: true, admin: true },
  manager: { label: 'Editor',  read: true, edit: true, finance: false, reports: false, admin: false },
  editor:  { label: 'Editor',  read: true, edit: true, finance: false, reports: false, admin: false },
  finance: { label: 'Finance', read: true, edit: true, finance: true, reports: true, admin: false },
  reports: { label: 'Reports', read: true, edit: false, finance: false, reports: true, admin: false },
  viewer:  { label: 'Viewer',  read: true, edit: false, finance: false, reports: false, admin: false },
};

const SP_TEAM_ROLE_ORDER = ['viewer', 'editor', 'finance', 'reports', 'admin'];

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
      flowType:           'pkce',
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
  let _activeTeamId = null;
  let _activeTeamRole = null;
  let _activeTeamPermissions = null;
  let _currency = 'UGX'; // FIXED: currency comes from Supabase/profile data, not app-owned localStorage.
  let _realtimeChannel = null;
  let _coreRealtimeChannel = null;
  let _coreRealtimeDebounce = null;
  let _teamNotifyChannel = null;       // Persistent channel for messages + team_members
  let _syncBroadcast = null;
  let _bootstrapping = false;
  let _bootstrapPromise = null;
  let _refreshInFlight = false;
  let _saveInFlight = null;
  let _pendingSavePayload = null;
  let _lastRefreshAt = 0;
  let _lastCloudSignature = null;
  let _lastSavedSignature = null;       // For differential sync: skip saves when nothing changed
  let _workspaceResolved = false;
  let _workspaceRequiresSelection = false;
  let _workspaceResolutionPromise = null;
  let _localBootFallbackTimer = null;
  let _bootstrapSafetyTimer = null;
  let _authEventWorkTimer = null;
  let _lastBootstrapOutcome = null;
  let _teamContextCache = [];
  let _teamContextCacheAt = 0;
  let _teamContextRefreshPromise = null;
  let showTeamModal = null;

  // ── SYNC RELIABILITY: Retry Queue + Status Indicator ────────────────────────
  const RETRY_QUEUE_STORAGE_KEY = 'sp_retry_queue';
  const BOOT_CONTEXT_STORAGE_KEY = 'sp_boot_context';
  const APP_SHELL_BOOT_CONTEXT = 'app-shell';
  const AUTH_RETURN_BOOT_CONTEXT = 'auth-return';
  let _retryQueue = [];               // Array of { payload, attempts, lastAttempt }
  let _syncState = 'idle';            // 'idle' | 'syncing' | 'synced' | 'failed' | 'offline'
  let _retryTimer = null;
  let _lastSaveToastAt = 0;
  const MAX_RETRY_ATTEMPTS = 5;
  const SAVE_TOAST_THROTTLE_MS = 10000;
  window.__spAuthRedirectInProgress = false;
  window.__spSuppressStoredSessionBootstrap = false;

  function persistRetryQueue() {
    // FIXED: retry queue is memory-only in cloud-first mode; Supabase remains the source of truth.
    return;
    try {
      if (_retryQueue.length === 0) {
        localStorage.removeItem(RETRY_QUEUE_STORAGE_KEY);
      } else {
        void _retryQueue;
      }
    } catch (_err) { /* quota exceeded or private browsing — non-fatal */ }
  }

  function restoreRetryQueue() {
    // FIXED: no app-owned localStorage restore path for pending business data.
    return;
    try {
      const stored = null;
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _retryQueue = parsed;
        log('Restored', _retryQueue.length, 'pending saves from localStorage');
        updateSyncIndicator('failed');
        scheduleRetryQueue();
      }
    } catch (_err) { /* corrupted — start fresh */ }
  }

  function legacyUpdateSyncIndicator(state) {
    _syncState = state || _syncState;
    const el = document.getElementById('spSyncIcon');
    if (!el) return;
    const map = {
      idle:    { icon: 'ph-cloud',           color: '#888',    title: 'Cloud idle' },
      syncing: { icon: 'ph-cloud-arrow-up',  color: '#FFB300', title: 'Syncing to cloud...' },
      synced:  { icon: 'ph-cloud-check',     color: '#81c784', title: 'Saved to cloud' },
      failed:  { icon: 'ph-cloud-slash',     color: '#ef9a9a', title: 'Cloud sync failed — retrying' },
      offline: { icon: 'ph-cloud-x',         color: '#888',    title: 'Offline — changes saved locally' },
    };
    const cfg = map[_syncState] || map.idle;
    el.className = 'ph ' + cfg.icon + ' sp-sync-icon';
    el.style.color = cfg.color;
    el.parentElement.title = cfg.title;
    el.parentElement.setAttribute('aria-label', cfg.title);
    if (_syncState === 'syncing') {
      el.classList.add('sp-sync-pulse');
    } else {
      el.classList.remove('sp-sync-pulse');
    }
  }

  function enqueueSave(payload) {
    // Deduplicate: replace if a pending entry exists with 0 attempts
    const pendingIdx = _retryQueue.findIndex(e => e.attempts === 0);
    if (pendingIdx >= 0) {
      _retryQueue[pendingIdx] = { payload, attempts: 0, lastAttempt: 0 };
    } else {
      _retryQueue.push({ payload, attempts: 0, lastAttempt: 0 });
    }
    persistRetryQueue();
    updateSyncIndicator('failed');
    scheduleRetryQueue();
  }

  function scheduleRetryQueue() {
    if (_retryTimer) return;
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      processRetryQueue();
    }, 3000);
  }

  async function processRetryQueue() {
    if (!navigator.onLine) {
      updateSyncIndicator('offline');
      return;
    }
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) {
      scheduleRetryQueue();
      return;
    }
    if (_retryQueue.length === 0) return;

    const now = Date.now();
    const remaining = [];
    for (const entry of _retryQueue) {
      const backoff = Math.min(2000 * Math.pow(2, entry.attempts), 30000);
      if (now - entry.lastAttempt < backoff) {
        remaining.push(entry);
        continue;
      }
      try {
        updateSyncIndicator('syncing');
        await saveAllData(entry.payload);
      } catch (_err) {
        entry.attempts += 1;
        entry.lastAttempt = Date.now();
        if (entry.attempts < MAX_RETRY_ATTEMPTS) {
          remaining.push(entry);
        } else {
          warn('Retry queue: giving up after', MAX_RETRY_ATTEMPTS, 'attempts');
          toastSafe('Error', 'Some changes could not be saved to cloud. Please check your connection.');
        }
      }
    }
    _retryQueue = remaining;
    persistRetryQueue();
    if (_retryQueue.length > 0) {
      scheduleRetryQueue();
    }
  }

  function legacyShowSaveToast(isCloud) {
    const now = Date.now();
    if (now - _lastSaveToastAt < SAVE_TOAST_THROTTLE_MS) return;
    _lastSaveToastAt = now;
    if (isCloud) {
      toastSafe('Success', 'Saved to cloud');
    } else {
      toastSafe('Info', 'Reconnect to save your latest cloud changes.');
    }
  }

  // ── SERIAL DB QUEUE ──────────────────────────────────────────────────────────
  // Supabase JS v2 acquires a Web Lock for every auth-bearing request. Firing
  // multiple requests concurrently causes "AbortError: Lock broken by steal".
  // This queue serialises all DB calls so only ONE request is in-flight at a time.
  function updateSyncIndicator(state) {
    _syncState = state || _syncState;
    const el = document.getElementById('spSyncIcon');
    if (!el) return;
    const map = {
      idle:    { icon: 'ph-cloud',          color: '#888',    title: 'Cloud idle' },
      syncing: { icon: 'ph-cloud-arrow-up', color: '#FFB300', title: 'Syncing to cloud...' },
      synced:  { icon: 'ph-cloud-check',    color: '#81c784', title: 'Saved to cloud' },
      failed:  { icon: 'ph-cloud-slash',    color: '#ef9a9a', title: 'Cloud sync failed' },
      offline: { icon: 'ph-cloud-x',        color: '#888',    title: 'Offline — reconnect to save and refresh cloud data' },
    };
    const cfg = map[_syncState] || map.idle;
    el.className = 'ph ' + cfg.icon + ' sp-sync-icon';
    el.style.color = cfg.color;
    el.parentElement.title = cfg.title;
    el.parentElement.setAttribute('aria-label', cfg.title);
    if (_syncState === 'syncing') {
      el.classList.add('sp-sync-pulse');
    } else {
      el.classList.remove('sp-sync-pulse');
    }
  }

  function showSaveToast(isCloud) {
    const now = Date.now();
    if (now - _lastSaveToastAt < SAVE_TOAST_THROTTLE_MS) return;
    _lastSaveToastAt = now;
    if (isCloud) {
      toastSafe('Success', 'Saved to cloud');
    } else {
      toastSafe('Info', 'Reconnect to save your latest cloud changes.');
    }
  }

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

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function toastSafe(type, msg) {
    const fn = window['toast' + type];
    if (typeof fn === 'function') fn(msg);
  }

  const CORE_REALTIME_TABLES = [
    { table: 'bookings',        soloColumn: 'owner_id' },
    { table: 'expenses',        soloColumn: 'owner_id' },
    { table: 'other_income',    soloColumn: 'owner_id' },
    { table: 'artists',         soloColumn: 'owner_id' },
    { table: 'audience_metrics', soloColumn: 'owner_id' },
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
      audienceMetrics: stamp(data.audienceMetrics, ['updatedAt', 'createdAt']),
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
    // FIXED: no localStorage broadcast fallback in cloud-first mode.
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
    unsubscribeFromTeamNotifications();

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

    // ── Persistent team notifications: messages + team_members ──
    subscribeToTeamNotifications();
  }

  function unsubscribeFromTeamNotifications() {
    if (_teamNotifyChannel) {
      db.removeChannel(_teamNotifyChannel);
      _teamNotifyChannel = null;
    }
  }

  function subscribeToTeamNotifications() {
    unsubscribeFromTeamNotifications();
    if (!_activeTeamId) return;

    const channel = db.channel(`sp-team-notify-${_activeTeamId}`);

    // Messages: notify on new chat messages even when panel is closed
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `team_id=eq.${_activeTeamId}` },
      (payload) => {
        const msg = payload.new;
        // Don't notify for own messages
        if (msg && msg.user_id === getOwnerId()) return;
        const sender = escapeHTML(msg?.username || 'A teammate');
        toastSafe('Info', `New message from ${sender}`);
        // Increment badge on team nav if it exists
        const badge = document.getElementById('spTeamChatBadge');
        if (badge) {
          const count = (parseInt(badge.textContent, 10) || 0) + 1;
          badge.textContent = count;
          badge.style.display = 'inline-flex';
        }
        // If chat panel is open, append message
        const container = document.getElementById('spTeamChatMessages');
        if (container && typeof window.buildMessageHTML === 'function') {
          container.insertAdjacentHTML('beforeend', window.buildMessageHTML(msg));
          container.scrollTop = container.scrollHeight;
        }
      }
    );

    // Team members: notify on roster changes
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${_activeTeamId}` },
      () => {
        toastSafe('Info', 'Team roster updated');
        // If team panel is open, re-render members
        const membersContainer = document.getElementById('spTeamMembers');
        if (membersContainer && typeof getTeamMembers === 'function') {
          getTeamMembers(_activeTeamId).then((members) => {
            if (typeof window.renderTeamMembers === 'function') {
              window.renderTeamMembers(members);
            }
          }).catch(() => {});
        }
      }
    );

    channel.subscribe((status) => {
      log('teamNotify', status);
    });
    _teamNotifyChannel = channel;
  }

  const TEAM_PROMPT_KEY = 'sp_team_select_prompted';
  function promptTeamSelectionIfNeeded(teams) {
    if (_activeTeamId) return;
    if (!Array.isArray(teams) || teams.length < 2) return;
    let shouldToast = true;
    try {
      if (sessionStorage.getItem(TEAM_PROMPT_KEY) === '1') {
        shouldToast = false;
      } else {
        sessionStorage.setItem(TEAM_PROMPT_KEY, '1');
      }
    } catch (_err) {
      // Non-fatal: if sessionStorage fails, still show the prompt.
    }
    if (shouldToast) {
      toastSafe('Info', 'Choose a workspace to finish loading your data.');
    }
    setTimeout(() => {
      const modal = document.getElementById('spTeamModal');
      if (modal && modal.style.display !== 'none') return;
      showTeamModal().catch((err) => warn('Team chooser open failed:', err));
    }, 0);
  }

  function ensureAppBootReady() {
    return Boolean(window.__spAppBooted) ||
      (typeof window.showApp === 'function' && typeof window.loadUserData === 'function');
  }

  async function waitForAppBootReady(maxWaitMs = 5000, intervalMs = 50) {
    if (ensureAppBootReady()) return true;
    const started = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (ensureAppBootReady()) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= maxWaitMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  function scheduleAppBoot(maxWaitMs = 5000, intervalMs = 50) {
    return;
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

  function runBootstrapTask(task) {
    if (_bootstrapPromise) return _bootstrapPromise;
    _bootstrapping = true;
    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (_bootstrapPromise === promise) {
          _bootstrapping = false;
          _bootstrapPromise = null;
          window.__spSupabaseBootPromise = null;
        }
      });
    _bootstrapPromise = promise;
    window.__spSupabaseBootPromise = _bootstrapPromise;
    return _bootstrapPromise;
  }

  async function syncRealtimeAuthToken(session = _session) {
    try {
      if (session?.access_token && db?.realtime?.setAuth) {
        await db.realtime.setAuth(session.access_token);
      }
    } catch (err) {
      warn('Realtime auth update failed:', err);
    }
  }

  async function refreshSessionIfNeeded(options = {}) {
    const minTtlSeconds = typeof options.minTtlSeconds === 'number' ? options.minTtlSeconds : 90;
    const current = _session || await getSession();
    if (!current?.user) return null;

    const expiresAt = Number(current.expires_at || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const hasEnoughTtl = !expiresAt || (expiresAt - nowSeconds) > minTtlSeconds;
    if (hasEnoughTtl || typeof db.auth.refreshSession !== 'function' || !current.refresh_token) {
      await syncRealtimeAuthToken(current);
      return current;
    }

    const { data, error } = await db.auth.refreshSession({
      refresh_token: current.refresh_token,
    });
    if (error) throw error;

    _session = data?.session || current;
    await syncRealtimeAuthToken(_session);
    return _session;
  }

  function throwIfSupabaseError(label, error) {
    if (!error) return;
    const err = error instanceof Error
      ? error
      : new Error(error?.message || `${label} failed`);
    err.context = label;
    throw err;
  }

  function detectAuthCallbackState(href = window.location.href) {
    let url = null;
    try {
      url = new URL(href);
    } catch (_err) {
      return {
        hasCallbackParams: false,
        hasError: false,
      };
    }

    const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const readParam = (key) => hashParams.get(key) || url.searchParams.get(key) || '';
    const error = readParam('error');
    const errorCode = readParam('error_code');
    const errorDescription = readParam('error_description');
    const hasCallbackParams = Boolean(
      readParam('access_token') ||
      readParam('refresh_token') ||
      readParam('code') ||
      error ||
      errorCode ||
      errorDescription
    );

    return {
      hasCallbackParams,
      hasError: Boolean(error || errorCode || errorDescription),
    };
  }

  function clearSupabaseAuthArtifacts(options = {}) {
    const clearAppSession = options.clearAppSession !== false;
    try {
      localStorage.removeItem(`sb-${SP_SUPABASE_PROJECT_REF}-auth-token`);
      localStorage.removeItem(`sb-${SP_SUPABASE_PROJECT_REF}-auth-token-code-verifier`);
      localStorage.removeItem(SP_SUPABASE_STORAGE_KEY);
      localStorage.removeItem(SP_SUPABASE_PKCE_KEY);
    } catch (_err) {
      // Best-effort cleanup only.
    }

    if (typeof window.clearLegacyCloudDataKeys === 'function') {
      window.clearLegacyCloudDataKeys();
    }

    if (!clearAppSession) return;

    if (typeof window.clearAuthSessionState === 'function') {
      window.clearAuthSessionState();
      return;
    }

    localStorage.removeItem('starPaper_session');
    localStorage.removeItem('starPaperSessionUser');
    localStorage.removeItem('starPaperRemember');
    localStorage.removeItem('starPaperCurrentUser');
    window.currentUser = null;
    window.currentManagerId = null;
    window.__spAppBooted = false;
  }

  function setBootStateSafe(state, options = {}) {
    if (typeof window.setBootState === 'function') {
      window.setBootState(state, options);
    }
  }

  function beginBootTransitionSafe(reason = 'supabase-auth', state = 'loading-session', options = {}) {
    if (typeof window.beginBootTransition === 'function') {
      return window.beginBootTransition(reason, state, options);
    }
    setBootStateSafe(state, options);
    return typeof window.getBootTransitionId === 'function'
      ? window.getBootTransitionId()
      : null;
  }

  function getBootTransitionIdSafe() {
    return typeof window.getBootTransitionId === 'function'
      ? window.getBootTransitionId()
      : null;
  }

  function isBootTransitionCurrentSafe(flowId) {
    if (!flowId) return true;
    return typeof window.isCurrentBootTransition === 'function'
      ? window.isCurrentBootTransition(flowId)
      : true;
  }

  function commitBootTransitionSafe(target, options = {}) {
    if (options.flowId && !isBootTransitionCurrentSafe(options.flowId)) return false;
    if (typeof window.commitBootTransition === 'function') {
      return window.commitBootTransition(target, options);
    }
    if (typeof window.setActiveScreen === 'function') {
      window.setActiveScreen(target);
    }
    if (typeof window.hideBootLoaderWhenUiPainted === 'function') {
      window.hideBootLoaderWhenUiPainted({
        flowId: options.flowId,
        requireAppReady: target === 'appContainer',
        minDelayMs: options.minDelayMs ?? 180,
      });
    } else if (typeof window.hideBootLoaderElement === 'function') {
      window.hideBootLoaderElement({ force: true, flowId: options.flowId });
    }
    return true;
  }

  function isAppShellVisible() {
    if (typeof window.isAppShellVisible === 'function') {
      try { return Boolean(window.isAppShellVisible()); } catch (_err) {}
    }
    const app = document.getElementById('appContainer');
    if (!app) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(app) : null;
    const visible = app.classList.contains('screen-active') &&
      app.style.display !== 'none' &&
      (!style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0));
    if (!visible) return false;
    const rect = app.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clearBootOverlayOverVisibleApp(reason = 'app-visible') {
    if (!isAppShellVisible()) return false;
    clearLocalBootFallback();
    clearBootstrapSafetyTimer();
    window.__spBootRevealPending = false;
    window.__spAuthRedirectInProgress = false;
    if (!window.__spAppBooted) window.__spAppBooted = true;
    commitBootTransitionSafe('appContainer', {
      flowId: getBootTransitionIdSafe(),
      requireAppReady: true,
      minDelayMs: 0,
    });
    log('boot.overlay.dismissed', { reason });
    return true;
  }

  function isLocalDevOrigin() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  function clearLocalBootFallback() {
    if (_localBootFallbackTimer) {
      clearTimeout(_localBootFallbackTimer);
      _localBootFallbackTimer = null;
    }
  }

  function clearBootstrapSafetyTimer() {
    if (_bootstrapSafetyTimer) {
      clearTimeout(_bootstrapSafetyTimer);
      _bootstrapSafetyTimer = null;
    }
  }

  function abandonActiveBootstrapWork(reason = 'bootstrap-stalled') {
    clearLocalBootFallback();
    clearBootstrapSafetyTimer();
    _bootstrapping = false;
    _bootstrapPromise = null;
    _refreshInFlight = false;
    window.__spCloudBootstrapPending = false;
    window.__spSupabaseBootPromise = null;
    window.__spAuthRedirectInProgress = false;
    recordBootstrapTiming('bootstrap.abandoned', { reason });
  }

  function showStalledBootError(message, detail, reason = 'bootstrap-stalled') {
    abandonActiveBootstrapWork(reason);
    if (clearBootOverlayOverVisibleApp(reason)) return;
    beginBootTransitionSafe(reason, 'boot-error', {
      text: message || 'Session restore stalled',
      subtext: detail || 'Retry to reconnect to Star Paper, or log out and sign in again.',
      showActions: true,
    });
  }

  function deferAuthEventWork(label, work) {
    const timer = setTimeout(() => {
      if (_authEventWorkTimer === timer) _authEventWorkTimer = null;
      Promise.resolve()
        .then(work)
        .catch((err) => {
          warn(`${label} failed:`, err);
          captureSyncException(err, {
            operation: 'authEventWork',
            reason: label,
          });
          if (!window.__spAppBooted && !isAppShellVisible()) {
            showBootErrorState('Session restore needs attention', 'Retry to reconnect to Star Paper, or log out and sign in again.');
          }
        });
    }, 0);
    _authEventWorkTimer = timer;
  }

  function hasActiveBootstrapWork() {
    return Boolean(
      _bootstrapping ||
      _bootstrapPromise ||
      _refreshInFlight ||
      window.__spCloudBootstrapPending ||
      window.__spAuthRedirectInProgress ||
      window.__spSupabaseBootPromise
    );
  }

  function scheduleLocalSessionRestoreFallback(options = {}) {
    clearLocalBootFallback();
    const bootContext = options.bootContext || getStartupBootContext();
    const flowId = options.flowId || getBootTransitionIdSafe();
    const isAuthCallback = bootContext === 'auth-callback' || hasAuthCallbackInUrl();
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(3000, Number(options.timeoutMs))
      : (isAuthCallback ? 14000 : 9000);
    const hardTimeoutMs = Number.isFinite(options.hardTimeoutMs)
      ? Math.max(timeoutMs, Number(options.hardTimeoutMs))
      : Math.max(timeoutMs + 6000, isAuthCallback ? 18000 : 15000);
    const startedAt = nowMs();
    const tick = () => {
      _localBootFallbackTimer = null;
      if (flowId && !isBootTransitionCurrentSafe(flowId)) return;
      const loader = document.getElementById('appBootLoader');
      const state = loader?.dataset.state || '';
      const blockingStates = new Set(['booting-auth', 'loading-session', 'signing-in', 'booting-data', 'loading-app']);
      if (window.__spAppBooted || !blockingStates.has(state)) return;
      if (clearBootOverlayOverVisibleApp('session-restore-fallback')) return;
      if (hasActiveBootstrapWork()) {
        const elapsed = nowMs() - startedAt;
        if (elapsed < hardTimeoutMs) {
          log('session restore fallback deferred; bootstrap still owns boot UI', {
            bootContext,
            state,
            elapsed: Math.round(elapsed),
            hardTimeoutMs,
          });
          _localBootFallbackTimer = setTimeout(tick, 1000);
          return;
        }
        warn('Session restore hard timeout; abandoning stuck bootstrap owner.', {
          bootContext,
          state,
          elapsed: Math.round(elapsed),
        });
        showStalledBootError('Session restore stalled', 'Retry to reconnect to Star Paper, or log out and sign in again.', 'session-restore-hard-timeout');
        return;
      }
      warn('Session restore stalled; resolving boot UI safely.', { bootContext, state });
      window.__spAuthRedirectInProgress = false;
      if (bootContext === 'cold-start' && !hasStoredSupabaseSessionHint()) {
        window.__spSuppressStoredSessionBootstrap = true;
        showLandingScreen({ flowId, reason: 'session-restore-cold-start' });
        return;
      }
      showBootErrorState('Session restore stalled', 'Retry to reconnect to Star Paper, or log out and sign in again.');
    };
    _localBootFallbackTimer = setTimeout(tick, timeoutMs);
  }

  function hasLocalThemePreference() {
    try {
      const value = localStorage.getItem('starPaperTheme');
      return value === 'light' || value === 'dark';
    } catch (_err) {
      return false;
    }
  }

  function resetCloudSaveFlagsSafe(reason = 'supabase-screen') {
    try {
      if (typeof window.__spResetCloudSaveInFlightFlags === 'function') {
        window.__spResetCloudSaveInFlightFlags(reason);
        return;
      }
      window.__spCloudSaveInFlightCount = 0;
      window.__spCloudSaveInFlight = false;
      window.__spCloudSaveInFlightReason = reason;
    } catch (_err) {}
  }

  function showLoginScreen(options = {}) {
    clearLocalBootFallback();
    resetCloudSaveFlagsSafe('show-login');
    const flowId = options.flowId || beginBootTransitionSafe(options.reason || 'show-login', 'auth-required', {
      text: options.text,
      subtext: options.subtext,
    });
    if (typeof window.showLoginForm === 'function') {
      window.showLoginForm({ flowId });
      return;
    }
    commitBootTransitionSafe('loginScreen', { flowId, minDelayMs: 120 });
  }

  function showLandingScreen(options = {}) {
    const keepFallback = options.keepLoader === true;
    if (!keepFallback) {
      clearLocalBootFallback();
    }
    resetCloudSaveFlagsSafe('show-landing');
    const flowId = options.flowId || beginBootTransitionSafe(options.reason || 'show-landing', options.state || 'loading-session', {
      text: options.text,
      subtext: options.subtext,
    });
    if (typeof window.showLanding === 'function') {
      window.showLanding({ flowId, minDelayMs: options.minDelayMs ?? 120 });
      return;
    }
    try {
      if (typeof window.clearForms === 'function') window.clearForms();
    } catch (_err) {}
    commitBootTransitionSafe('landingScreen', { flowId, minDelayMs: options.minDelayMs ?? 120 });
  }

  function routeAuthenticatedUserToDashboard(reason = 'auth') {
    // Keep the historical function name for old call sites, but restore the user's
    // actual app view instead of forcing every authenticated return to Dashboard.
    if (!window.__spAppBooted && !isAppShellVisible()) {
      window.__spPendingPostBootRouteReason = reason;
      return;
    }
    const restore = typeof window.restorePostBootUiState === 'function'
      ? window.restorePostBootUiState
      : null;
    if (restore) {
      setTimeout(() => {
        try { restore(); } catch (err) { warn(`App route restore failed (${reason}):`, err); }
      }, 0);
    } else if (!window._spCurrentSection && typeof window.showSection === 'function') {
      setTimeout(() => {
        try { window.showSection('dashboard'); } catch (err) { warn(`Dashboard fallback route failed (${reason}):`, err); }
      }, 0);
    }
  }

  function renderAppDataViews(reason = 'cloud-sync') {
    // FIXED: when data arrives after the fast dashboard shell, refresh visible cloud-backed views immediately.
    try { if (typeof window.renderBookings === 'function') window.renderBookings(); } catch (err) { warn(`renderBookings failed (${reason}):`, err); }
    try { if (typeof window.renderExpenses === 'function') window.renderExpenses(); } catch (err) { warn(`renderExpenses failed (${reason}):`, err); }
    try { if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome(); } catch (err) { warn(`renderOtherIncome failed (${reason}):`, err); }
    try { if (typeof window.renderArtists === 'function') window.renderArtists(); } catch (err) { warn(`renderArtists failed (${reason}):`, err); }
    try { if (typeof window.renderTasks === 'function') window.renderTasks(); } catch (err) { warn(`renderTasks failed (${reason}):`, err); }
    try { if (typeof window.renderAudienceMetrics === 'function') window.renderAudienceMetrics(); } catch (err) { warn(`renderAudienceMetrics failed (${reason}):`, err); }
    try { if (typeof window.updateDashboard === 'function') window.updateDashboard(); } catch (err) { warn(`updateDashboard failed (${reason}):`, err); }
    try { if (typeof window.renderCalendar === 'function') window.renderCalendar(); } catch (err) { warn(`renderCalendar failed (${reason}):`, err); }
    try { if (typeof window.updateReportStatistics === 'function') window.updateReportStatistics(); } catch (err) { warn(`updateReportStatistics failed (${reason}):`, err); }
    try { if (typeof window.renderPerformanceMap === 'function') window.renderPerformanceMap(); } catch (err) { warn(`renderPerformanceMap failed (${reason}):`, err); }
  }

  function showAuthenticatedDashboardShell(reason = 'bootstrap-fast-shell', options = {}) {
    // Do not reveal an authenticated app shell with placeholder/empty data.
    // A refresh should show real cloud data or an explicit boot-error, never a
    // zero-data dashboard that looks like data loss.
    if (options.eager === true) {
      warn('Ignoring eager authenticated shell reveal until cloud data is confirmed.', { reason });
    }
    routeAuthenticatedUserToDashboard(reason);
    if (typeof window.setAppShellBootContext === 'function') {
      window.setAppShellBootContext();
    } else {
      try { sessionStorage.setItem(BOOT_CONTEXT_STORAGE_KEY, APP_SHELL_BOOT_CONTEXT); } catch (_err) {}
    }
    window.__spBootContext = 'app-refresh';
  }

  function showBootErrorState(message, detail) {
    clearLocalBootFallback();
    const normalizedMessage = String(message || '').toLowerCase();
    if (
      (normalizedMessage.includes('cloud sync') ||
        normalizedMessage.includes('session restore') ||
        normalizedMessage.includes('workspace refresh')) &&
      (clearBootOverlayOverVisibleApp('boot-error-suppressed') || window.__spAppBooted || isAppShellVisible())
    ) {
      commitBootTransitionSafe('appContainer', {
        flowId: getBootTransitionIdSafe(),
        requireAppReady: true,
        minDelayMs: 0,
      });
      return;
    }
    setBootStateSafe('boot-error', {
      text: message || 'Cloud sync needs attention',
      subtext: detail || 'We could not load your workspace. Retry or log out.',
      showActions: true,
    });
  }

  function hasAuthCallbackInUrl() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    return Boolean(
      hashParams.get('access_token') ||
      hashParams.get('refresh_token') ||
      url.searchParams.get('access_token') ||
      url.searchParams.get('refresh_token') ||
      url.searchParams.get('code') ||
      url.searchParams.get('error') ||
      url.searchParams.get('error_code') ||
      url.searchParams.get('error_description')
    );
  }

  function hasStoredSupabaseSessionHint() {
    if (!SP_SUPABASE_CONFIGURED) return false;
    if (localStorage.getItem('sp_logged_out') === '1') return false;
    return Boolean(localStorage.getItem(SP_SUPABASE_STORAGE_KEY));
  }

  function readBootContextMarker() {
    try {
      return sessionStorage.getItem(BOOT_CONTEXT_STORAGE_KEY) || '';
    } catch (_err) {
      return '';
    }
  }

  function getStartupBootContext() {
    if (typeof window.getStartupBootContext === 'function') {
      try {
        const context = String(window.getStartupBootContext() || '').trim();
        if (context) return context;
      } catch (_err) {}
    }
    if (hasAuthCallbackInUrl()) return 'auth-callback';
    const marker = readBootContextMarker();
    if (marker === AUTH_RETURN_BOOT_CONTEXT) return 'auth-callback';
    return marker === APP_SHELL_BOOT_CONTEXT ? 'app-refresh' : 'cold-start';
  }

  function captureSyncException(error, context = {}) {
    try {
      if (typeof window.Sentry === 'undefined' || typeof window.Sentry.captureException !== 'function') {
        return;
      }

      const err = error instanceof Error
        ? error
        : new Error(context.message || String(error || 'Star Paper sync error'));
      const sentry = window.Sentry;
      const extra = {
        operation: context.operation || 'unknown',
        reason: context.reason || null,
        event: context.event || null,
        ownerId: getOwnerId(),
        activeTeamId: _activeTeamId,
        workspace: _activeTeamId ? 'team' : 'personal',
        workspaceResolved: _workspaceResolved,
        workspaceRequiresSelection: _workspaceRequiresSelection,
        appBooted: Boolean(window.__spAppBooted),
        authRedirectInProgress: Boolean(window.__spAuthRedirectInProgress),
        suppressStoredSessionBootstrap: Boolean(window.__spSuppressStoredSessionBootstrap),
        syncState: _syncState,
        ...(context.extra || {}),
      };

      if (typeof sentry.withScope === 'function') {
        sentry.withScope((scope) => {
          scope.setTag('sp.operation', context.operation || 'unknown');
          scope.setTag('sp.workspace', _activeTeamId ? 'team' : 'personal');
          scope.setTag('sp.sync_state', _syncState || 'unknown');
          if (_activeTeamId) scope.setTag('sp.team_id', _activeTeamId);
          if (context.reason) scope.setTag('sp.reason', String(context.reason));
          if (getOwnerId()) scope.setUser({ id: getOwnerId() });
          Object.entries(extra).forEach(([key, value]) => {
            if (value === undefined) return;
            scope.setExtra(key, value);
          });
          sentry.captureException(err);
        });
        return;
      }

      sentry.captureException(err);
    } catch (_err) {
      // Sentry capture is best-effort only.
    }
  }

  function recordBootstrapTiming(event, extra = {}) {
    log(event, extra);
    try {
      const sentry = window.Sentry;
      if (!sentry || typeof sentry.captureMessage !== 'function') return;
      const payload = {
        ownerId: getOwnerId(),
        activeTeamId: _activeTeamId,
        appBooted: Boolean(window.__spAppBooted),
        bootstrapping: Boolean(_bootstrapping),
        refreshInFlight: Boolean(_refreshInFlight),
        ...(extra || {}),
      };
      if (typeof sentry.withScope === 'function') {
        sentry.withScope((scope) => {
          scope.setTag('sp.operation', 'bootstrap');
          scope.setTag('sp.bootstrap_event', event);
          if (payload.activeTeamId) scope.setTag('sp.team_id', payload.activeTeamId);
          if (payload.ownerId) scope.setUser({ id: payload.ownerId });
          Object.entries(payload).forEach(([key, value]) => {
            if (typeof value === 'undefined') return;
            scope.setExtra(key, value);
          });
          sentry.captureMessage(event, 'info');
        });
        return;
      }
      sentry.captureMessage(event);
    } catch (_err) {
      // Sentry timing is best-effort only.
    }
  }

  function resetWorkspaceState() {
    // Explicit purge of in-memory business state to close the data-leak window
    // between supabase.auth.signOut() and location.reload(). Mutating the live
    // arrays in-place (.length = 0) preserves any references currently captured
    // by render closures so they read empty data, not stale prior-user data.
    try {
      ['bookings', 'expenses', 'otherIncome', 'artists', 'tasks'].forEach((key) => {
        if (Array.isArray(window[key])) {
          window[key].length = 0;
        } else {
          window[key] = [];
        }
      });
      window.revenueGoals = {};
      window.bbfData = {};
      window.managerData = {};
      window._SP_cloudData = null;
      window.currentUser = null;
      window.currentManagerId = null;
      window.currentTeamRole = null;
      window.__spDataLoaded = false;
      resetCloudSaveFlagsSafe('workspace-reset');
    } catch (err) {
      try { window.Sentry && window.Sentry.captureException && window.Sentry.captureException(err); } catch (_e) {}
    }
    _teamContextCache = [];
    _teamContextCacheAt = 0;
    _teamContextRefreshPromise = null;
    _activeTeamId = null;
    _workspaceResolved = false;
    _workspaceRequiresSelection = false;
    _workspaceResolutionPromise = null;
    window.__spCloudBootstrapPending = false;
    window.__spWorkspaceSelectionRequired = false;
    try {
      sessionStorage.removeItem(TEAM_PROMPT_KEY);
    } catch (_err) {}
    setActiveTeamRole(null);
    unsubscribeFromCoreRealtime();
    unsubscribeFromTeamNotifications();
    const modal = document.getElementById('spTeamModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  const _initialAuthCallbackState = detectAuthCallbackState();
  if (_initialAuthCallbackState.hasCallbackParams) {
    window.__spAuthRedirectInProgress = true;
    if (_initialAuthCallbackState.hasError) {
      window.__spSuppressStoredSessionBootstrap = true;
    }
  }

  async function handleSignedOutSession(options = {}) {
    const flowId = options.flowId || getBootTransitionIdSafe();
    const explicitLogout = localStorage.getItem('sp_logged_out') === '1';
    const reason = options.reason || (explicitLogout ? 'explicit-logout' : 'session-missing');
    const destination = options.destination === 'landing' ? 'landing' : 'login';
    const suppressDiagnostics = Boolean(options.suppressDiagnostics);
    const shouldConfirmRestore = !explicitLogout && options.confirm !== false;

    if (shouldConfirmRestore) {
      try {
        let recoveredSession = await getSession();
        if (!recoveredSession?.user) {
          recoveredSession = await refreshSessionIfNeeded({ minTtlSeconds: 0 });
        }
        if (recoveredSession?.user) {
          _session = recoveredSession;
          await syncRealtimeAuthToken(recoveredSession);
          return {
            recovered: true,
            session: recoveredSession,
            reason: 'session-recovered',
          };
        }
      } catch (err) {
        warn('Session restore confirmation failed:', err);
        captureSyncException(err, {
          operation: 'startupSessionRestore',
          reason: 'confirm-failed',
          event: options.event,
          extra: {
            requestedReason: reason,
          },
        });
      }
    }

    _session = null;
    _profile = null;
    if (options.clearAuthArtifacts !== false) {
      clearSupabaseAuthArtifacts();
    }
    resetWorkspaceState();
    updateSyncIndicator(navigator.onLine ? 'idle' : 'offline');
    if (flowId && !isBootTransitionCurrentSafe(flowId)) {
      return { recovered: false, stale: true, reason };
    }

    if (destination === 'landing') {
      showLandingScreen({ flowId, reason });
    } else {
      showLoginScreen({ flowId, reason });
    }

    if (!explicitLogout && !suppressDiagnostics) {
      captureSyncException(
        options.error || new Error(options.message || 'Session could not be restored.'),
        {
          operation: 'startupSessionRestore',
          reason,
          event: options.event,
        }
      );
    }

    if (
      !explicitLogout &&
      !suppressDiagnostics &&
      destination !== 'landing' &&
      options.notify !== false &&
      typeof window.toastWarn === 'function'
    ) {
      window.toastWarn(options.message || 'Your session expired. Please log in again.');
    }

    return {
      recovered: false,
      reason,
    };
  }

  function getOwnerId() {
    return _session?.user?.id || null;
  }

  async function ensureSupabaseSession(options = {}) {
    const silent = Boolean(options.silent);
    const clearIfMissing = options.clearIfMissing !== false;
    if (getOwnerId()) {
      try {
        return await refreshSessionIfNeeded({ minTtlSeconds: 90 });
      } catch (err) {
        warn('Session refresh failed:', err);
      }
      return _session;
    }

    // Respect explicit logout until a fresh login occurs.
    if (localStorage.getItem('sp_logged_out') === '1') {
      return null;
    }

    let session = null;
    try {
      session = await refreshSessionIfNeeded({ minTtlSeconds: 90 });
    } catch (_err) {
      session = null;
    }

    if (session?.user) return session;

    if (clearIfMissing) {
      if (!silent) {
        toastSafe('Warn', 'Your session expired. Please log in again.');
      }
      await handleSignedOutSession({
        reason: 'session-missing',
        confirm: false,
        notify: false,
        message: 'Your session expired. Please log in again.',
      });
    }

    return null;
  }

  async function ensureTeamActionSession() {
    let session = await ensureSupabaseSession({ silent: true, clearIfMissing: false });
    if (session?.user) return session;

    try {
      const { data, error } = await db.auth.getSession();
      if (!error && data?.session?.user) {
        _session = data.session;
        try { localStorage.removeItem('sp_logged_out'); } catch (_err) {}
        return data.session;
      }
    } catch (err) {
      warn('Team session restore failed:', err);
    }

    return null;
  }

  function getContext() {
    // If user has an active team, scope data to team. Otherwise solo mode.
    return _activeTeamId
      ? { team_id: _activeTeamId, owner_id: null }
      : { team_id: null, owner_id: getOwnerId() };
  }

  function normalizeWorkspaceMeta(meta = {}) {
    const ownerId = meta.ownerId || meta.owner_id || getOwnerId() || null;
    const teamId = normalizeTeamId(meta.teamId || meta.team_id || _activeTeamId || null);
    return {
      ownerId,
      teamId,
      scopeKey: teamId ? `team:${teamId}` : (ownerId || ''),
      source: meta.source || 'runtime',
      resolvedAt: meta.resolvedAt || Date.now(),
    };
  }

  function getActiveWorkspaceMeta(source = 'runtime') {
    return normalizeWorkspaceMeta({ source });
  }

  function attachWorkspaceMeta(payload, source = 'cloud', meta = null) {
    if (!payload || typeof payload !== 'object') return payload;
    payload.__workspace = normalizeWorkspaceMeta(meta || { source });
    payload.__workspace.source = source;
    return payload;
  }

  function applyScopeFilterForMeta(query, ownerColumn = 'owner_id', meta = null) {
    const workspace = normalizeWorkspaceMeta(meta || {});
    if (workspace.teamId) return query.eq('team_id', workspace.teamId);
    return query.eq(ownerColumn, workspace.ownerId).is('team_id', null);
  }

  function logWorkspaceDiagnostics(label, meta = null, extra = {}) {
    const workspace = normalizeWorkspaceMeta(meta || {});
    log(label, {
      ownerId: workspace.ownerId,
      teamId: workspace.teamId,
      scopeKey: workspace.scopeKey,
      ...extra,
    });
  }

  function getActiveTeamRole() {
    return _activeTeamRole;
  }

  function normalizeTeamRole(role) {
    const normalized = String(role || 'viewer').trim().toLowerCase();
    if (normalized === 'manager') return 'editor';
    return SP_TEAM_ROLE_PRESETS[normalized] ? normalized : 'viewer';
  }

  function permissionsForRole(role, rawPermissions = null) {
    const roleKey = normalizeTeamRole(role);
    const legacyKey = String(role || '').trim().toLowerCase();
    const preset = SP_TEAM_ROLE_PRESETS[legacyKey] || SP_TEAM_ROLE_PRESETS[roleKey] || SP_TEAM_ROLE_PRESETS.viewer;
    const raw = rawPermissions && typeof rawPermissions === 'object' && !Array.isArray(rawPermissions)
      ? rawPermissions
      : {};
    return {
      read: raw.read !== undefined ? Boolean(raw.read) : Boolean(preset.read),
      edit: raw.edit !== undefined ? Boolean(raw.edit) : Boolean(preset.edit),
      finance: raw.finance !== undefined ? Boolean(raw.finance) : Boolean(preset.finance),
      reports: raw.reports !== undefined ? Boolean(raw.reports) : Boolean(preset.reports),
      admin: raw.admin !== undefined ? Boolean(raw.admin) : Boolean(preset.admin),
    };
  }

  function roleLabel(role) {
    const roleKey = normalizeTeamRole(role);
    return (SP_TEAM_ROLE_PRESETS[role] || SP_TEAM_ROLE_PRESETS[roleKey] || SP_TEAM_ROLE_PRESETS.viewer).label;
  }

  function normalizeTeamMember(row) {
    const profile = row?.profiles || {};
    const role = normalizeTeamRole(row?.role);
    const permissions = permissionsForRole(row?.role, row?.permissions);
    return {
      ...profile,
      userId: row?.user_id,
      role,
      roleLabel: roleLabel(row?.role),
      permissions,
      joinedAt: row?.joined_at,
    };
  }

  function isMissingRpcError(error, rpcName) {
    const msg = String(`${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`).toLowerCase();
    return msg.includes('could not find the function') ||
      msg.includes('function public.' + String(rpcName || '').toLowerCase()) ||
      msg.includes('pgrst202');
  }

  function normalizeTeamContextRow(row) {
    const role = normalizeTeamRole(row?.my_role || row?.role);
    const permissions = permissionsForRole(role, row?.my_permissions || row?.permissions);
    return {
      id: row?.id,
      name: row?.name,
      invite_code: row?.invite_code,
      owner_id: row?.owner_id,
      myRole: role,
      myRoleLabel: roleLabel(role),
      myPermissions: permissions,
    };
  }

  function cacheTeamContext(teams, source = 'unknown') {
    _teamContextCache = Array.isArray(teams)
      ? teams.map((team) => ({ ...team })).filter((team) => team.id)
      : [];
    _teamContextCacheAt = Date.now();
    log('team.context.cache', {
      source,
      count: _teamContextCache.length,
      activeTeamId: _activeTeamId,
    });
    if (_activeTeamId) {
      const active = _teamContextCache.find((team) => team.id === _activeTeamId);
      setActiveTeamRole(active?.myRole || null, active?.myPermissions || null);
    }
    return _teamContextCache;
  }

  function getCachedTeamContext(maxAgeMs = 5 * 60 * 1000) {
    if (!Array.isArray(_teamContextCache) || _teamContextCache.length === 0) return [];
    if (maxAgeMs !== Infinity && Date.now() - _teamContextCacheAt > maxAgeMs) return [];
    return _teamContextCache.map((team) => ({ ...team }));
  }

  function hasCachedTeamContext(maxAgeMs = 5 * 60 * 1000) {
    if (!_teamContextCacheAt) return false;
    return maxAgeMs === Infinity || Date.now() - _teamContextCacheAt <= maxAgeMs;
  }

  function normalizeTeamMemberContextRow(row) {
    return normalizeTeamMember({
      user_id: row?.user_id,
      role: row?.role,
      permissions: row?.permissions,
      joined_at: row?.joined_at,
      profiles: {
        id: row?.profile_id || row?.user_id,
        username: row?.username,
        email: row?.email,
        avatar: row?.avatar,
      },
    });
  }

  function getActiveTeamPermissions() {
    return _activeTeamPermissions || permissionsForRole(_activeTeamRole);
  }

  function setActiveTeamAccess(role, permissions) {
    const normalizedRole = role ? normalizeTeamRole(role) : null;
    _activeTeamRole = normalizedRole;
    _activeTeamPermissions = normalizedRole ? permissionsForRole(normalizedRole, permissions) : null;
    if (typeof window.setTeamAccess === 'function') {
      window.setTeamAccess(_activeTeamRole, _activeTeamPermissions);
    } else if (typeof window.setTeamRole === 'function') {
      window.setTeamRole(_activeTeamRole);
    }
  }

  function setActiveTeamRole(role, permissions) {
    _activeTeamRole = role || null;
    setActiveTeamAccess(_activeTeamRole, permissions);
  }

  function normalizeTeamId(teamId) {
    const normalized = String(teamId || '').trim();
    return normalized || null;
  }

  async function persistActiveTeam(teamId, options = {}) {
    const normalizedTeamId = normalizeTeamId(teamId);
    const persistRemote = options.persistRemote !== false;

    _activeTeamId = normalizedTeamId;
    _workspaceResolved = true;
    _workspaceRequiresSelection = false;
    window.__spWorkspaceSelectionRequired = false;
    try {
      sessionStorage.removeItem(TEAM_PROMPT_KEY);
    } catch (_err) {}

    if (options.role !== undefined) {
      setActiveTeamRole(options.role, options.permissions || null);
    } else if (!normalizedTeamId) {
      setActiveTeamRole(null);
    }

    const currentRemembered = normalizeTeamId(options.profile?.last_active_team_id || _profile?.last_active_team_id);
    if (persistRemote && getOwnerId() && currentRemembered !== normalizedTeamId) {
      try {
        await updateProfile({ last_active_team_id: normalizedTeamId }, { throwOnError: true });
      } catch (err) {
        warn('Persist active team failed:', err);
      }
    } else if (_profile && currentRemembered === normalizedTeamId) {
      _profile.last_active_team_id = normalizedTeamId;
    }

    return normalizedTeamId;
  }

  async function resolveActiveWorkspace(options = {}) {
    if (_workspaceResolutionPromise) return _workspaceResolutionPromise;

    _workspaceResolutionPromise = (async () => {
      if (!getOwnerId()) {
        return { teamId: null, teams: [], profile: _profile, needsSelection: false, source: 'signed-out' };
      }

      let profile = options.profile || _profile || null;
      if (!options.skipProfileFetch && (!profile || typeof profile.last_active_team_id === 'undefined')) {
        const loadedProfile = await getProfile();
        if (loadedProfile) profile = loadedProfile;
      }
      const hasProvidedTeams = Object.prototype.hasOwnProperty.call(options, 'teams');
      const teams = hasProvidedTeams
        ? (Array.isArray(options.teams) ? options.teams : null)
        : await getMyTeams({ nullOnError: true });
      const teamsResolved = Array.isArray(teams);
      const teamList = teamsResolved ? teams : [];
      if (teamsResolved) {
        cacheTeamContext(teamList, options.source || 'workspace-resolution');
      }
      const validTeamIds = new Set(teamList.map((team) => team.id));
      const rememberedTeamId = normalizeTeamId(profile?.last_active_team_id);
      const runtimeTeamId = normalizeTeamId(_activeTeamId);

      let selectedTeamId = null;
      let source = 'personal';
      let persistRemote = false;

      if (rememberedTeamId && (!teamsResolved || validTeamIds.has(rememberedTeamId))) {
        selectedTeamId = rememberedTeamId;
        source = teamsResolved ? 'profile' : 'profile-unverified';
      } else if (runtimeTeamId && (!teamsResolved || validTeamIds.has(runtimeTeamId))) {
        selectedTeamId = runtimeTeamId;
        source = teamsResolved ? 'runtime' : 'runtime-unverified';
      } else if (teamsResolved && teamList.length === 0) {
        selectedTeamId = null;
        source = 'personal';
        persistRemote = Boolean(rememberedTeamId);
      } else {
        selectedTeamId = null;
        source = 'personal';
        persistRemote = Boolean(rememberedTeamId);
      }

      const activeTeam = selectedTeamId ? teamList.find((team) => team.id === selectedTeamId) : null;
      try {
        await withTimeout(
          () => persistActiveTeam(selectedTeamId, {
            persistRemote: teamsResolved ? persistRemote : false,
            role: activeTeam?.myRole || null,
            permissions: activeTeam?.myPermissions || null,
            profile,
          }),
          options.persistTimeoutMs || 1500,
          'persistActiveTeam[bootstrap]'
        );
      } catch (err) {
        warn('Active workspace persistence delayed; continuing with resolved scope.', err);
      }

      return {
        teamId: selectedTeamId,
        teams: teamList,
        profile,
        needsSelection: false,
        source,
      };
    })().finally(() => {
      _workspaceResolutionPromise = null;
    });

    return _workspaceResolutionPromise;
  }

  async function ensureWorkspaceReady(options = {}) {
    if (!getOwnerId()) return false;
    if (_workspaceRequiresSelection) {
      if (options.promptOnSelection !== false) {
        const teams = Array.isArray(options.teams) ? options.teams : await getMyTeams();
        promptTeamSelectionIfNeeded(teams);
      }
      return false;
    }
    if (_workspaceResolved) return true;
    const resolution = await resolveActiveWorkspace(options);
    return !resolution?.needsSelection;
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
    // FIXED: legacy browser-storage import is disabled; Supabase is the only business-data source of truth.
    return { skipped: true, reason: 'cloud-first' };
  }
  function rowToBooking(row) {
    return {
      id: row.id,
      event: row.event,
      artist: row.artist_name,
      artistId: row.artist_id,
      teamId: row.team_id,
      date: row.date,
      capacity: Number(row.capacity) || 0,
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
    const cloudId = isCloudId(b.id) ? b.id : null;
    return {
      ...(cloudId ? { id: cloudId } : {}),      // only set for Supabase UUID records
      legacy_id: String(b.id ?? ''),             // always preserve the original local ID
      owner_id: ownerId,
      team_id: teamId || null,
      artist_id: isCloudId(b.artistId) ? b.artistId : null,
      artist_name: b.artist || '',
      event: b.event || '',
      date: b.date || null,
      capacity: Number(b.capacity) || 0,
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
    const cloudId = isCloudId(e.id) ? e.id : null;
    return {
      ...(cloudId ? { id: cloudId } : {}),
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
    const cloudId = isCloudId(i.id) ? i.id : null;
    return {
      ...(cloudId ? { id: cloudId } : {}),
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
      strategicGoal: row.strategic_goal || '',
      avatar: row.avatar || '',
      managerId: row.owner_id,
      teamId: row.team_id,
      createdAt: row.created_at,
    };
  }

  function rowToAudienceMetric(row) {
    return {
      id: row.id,
      artistId: row.artist_id,
      artist: row.artist_name || '',
      period: row.period,
      socialFollowers: Number(row.social_followers) || 0,
      spotifyListeners: Number(row.spotify_listeners) || 0,
      youtubeListeners: Number(row.youtube_listeners) || 0,
      teamId: row.team_id || null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  async function loadAudienceMetrics(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { data, error } = await applyScopeFilterForMeta(
        db.from('audience_metrics').select('*').order('period', { ascending: false }),
        'owner_id',
        workspaceMeta
      );
      if (error) { warn('Audience metrics load error:', error); return null; }
      return (data || []).map(rowToAudienceMetric);
    } catch (err) {
      warn('Audience metrics load failed:', err);
      return null;
    }
  }

  async function saveAudienceMetrics(entries, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(entries)) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const ctx = workspaceMeta.teamId
      ? { team_id: workspaceMeta.teamId, owner_id: null }
      : { team_id: null, owner_id: workspaceMeta.ownerId };
    const artistLookup = {};
    if (Array.isArray(window.artists)) {
      window.artists.forEach((a) => {
        if (!a || !a.name || !isCloudId(a.id)) return;
        artistLookup[String(a.name).trim().toLowerCase()] = a.id;
      });
    }
    const rows = entries.map((entry) => {
      const artistName = String(entry?.artist || '').trim();
      let artistId = isCloudId(entry?.artistId) ? entry.artistId : null;
      if (!artistId && artistName) {
        artistId = artistLookup[artistName.toLowerCase()] || null;
      }
      const cloudId = isCloudId(entry?.id) ? entry.id : null;
      return sanitizeUpsertRow({
        ...(cloudId ? { id: cloudId } : {}),
        legacy_id: String(entry?.id ?? ''),
        owner_id: ownerId,
        team_id: ctx.team_id || null,
        artist_id: artistId,
        artist_name: artistName || '',
        period: String(entry?.period || '').trim(),
        social_followers: Number(entry?.socialFollowers) || 0,
        spotify_listeners: Number(entry?.spotifyListeners) || 0,
        youtube_listeners: Number(entry?.youtubeListeners) || 0,
        updated_at: new Date().toISOString(),
      });
    }).filter(row => row.artist_id && row.period);
    if (rows.length === 0) return;
    try {
      await saveScopedRows('audience_metrics', rows, workspaceMeta, {
        lookupFields: ['artist_id', 'period'],
      });
    } catch (err) {
      warn('Audience metrics save failed:', err);
      throw err;
    }
  }

  // ── TASKS — rows ↔ app ─────────────────────────────
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

  // ── REVENUE GOALS — rows ↔ app ────────────────────
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

  // ── BBF — rows ↔ app ───────────────
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

  // ── Closing Thoughts — rows ↔ app ───────
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

  function sanitizeUpsertRow(row) {
    const sanitized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (typeof value === 'undefined') return;
      if (key === 'id' && !isCloudId(value)) return;
      sanitized[key] = value;
    });
    return sanitized;
  }

  function scopeMutationQuery(query, workspaceMeta, ownerColumn = 'owner_id') {
    const workspace = normalizeWorkspaceMeta(workspaceMeta || {});
    if (workspace.teamId) return query.eq('team_id', workspace.teamId);
    return query.eq(ownerColumn, workspace.ownerId).is('team_id', null);
  }

  async function findScopedRow(table, row, workspaceMeta, options = {}) {
    const ownerColumn = options.ownerColumn || 'owner_id';
    const lookupFields = Array.isArray(options.lookupFields) ? options.lookupFields : [];
    const selectors = [];
    const cloudId = isCloudId(row?.id) ? row.id : null;
    const legacyId = row?.legacy_id ? String(row.legacy_id) : '';
    if (cloudId) selectors.push({ id: cloudId });
    if (legacyId) selectors.push({ legacy_id: legacyId });
    if (lookupFields.length && lookupFields.every((field) => row?.[field] !== null && typeof row?.[field] !== 'undefined' && row?.[field] !== '')) {
      selectors.push(lookupFields.reduce((memo, field) => {
        memo[field] = row[field];
        return memo;
      }, {}));
    }

    for (const selector of selectors) {
      let query = db.from(table).select('id,legacy_id').limit(1);
      Object.entries(selector).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
      query = scopeMutationQuery(query, workspaceMeta, ownerColumn);
      const { data, error } = await query.maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data?.id) return data;
    }
    return null;
  }

  async function saveScopedRows(table, rows, workspaceMeta, options = {}) {
    const sanitizedRows = (Array.isArray(rows) ? rows : [])
      .map(sanitizeUpsertRow)
      .filter((row) => row && Object.keys(row).length > 0);
    if (!sanitizedRows.length) return [];

    const ownerColumn = options.ownerColumn || 'owner_id';
    const results = [];
    for (const row of sanitizedRows) {
      const existing = await findScopedRow(table, row, workspaceMeta, options);
      if (existing?.id) {
        const { id: _ignoredId, ...updateRow } = row;
        let query = db.from(table)
          .update(updateRow)
          .eq('id', existing.id)
          .select('id,legacy_id');
        query = scopeMutationQuery(query, workspaceMeta, ownerColumn);
        const { data, error } = await query.maybeSingle();
        throwIfSupabaseError(`${table} scoped update`, error);
        if (data) results.push(data);
      } else {
        const { data, error } = await db.from(table)
          .insert(row)
          .select('id,legacy_id')
          .maybeSingle();
        throwIfSupabaseError(`${table} scoped insert`, error);
        if (data) results.push(data);
      }
    }
    return results;
  }

  // ── CORE DATA API ────────────────────────────────────────────────────────────
  async function loadData(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    logWorkspaceDiagnostics('loadData.scope', workspaceMeta);

    const filter = (q) => applyScopeFilterForMeta(q, 'owner_id', workspaceMeta);

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
      const missingKeys = [];
      if (Array.isArray(bookingsRows)) payload.bookings = bookingsRows.map(rowToBooking);
      else missingKeys.push('bookings');
      if (Array.isArray(expensesRows)) payload.expenses = expensesRows.map(rowToExpense);
      else missingKeys.push('expenses');
      if (Array.isArray(incomeRows)) payload.otherIncome = incomeRows.map(rowToOtherIncome);
      else missingKeys.push('otherIncome');
      if (Array.isArray(artistsRows)) payload.artists = artistsRows.map(rowToArtist);
      else missingKeys.push('artists');

      if (Object.keys(payload).length) {
        if (missingKeys.length) {
          payload.__meta = {
            corePartial: true,
            missingKeys,
            source: 'loadData',
          };
        }
        attachWorkspaceMeta(payload, 'loadData', workspaceMeta);
        return payload;
      }
      return null;
    } catch (err) {
      warn('loadData failed:', err);
      return null;
    }
  }

  // FIXED: fast dashboard bootstrap pulls only the critical list data within the auth loader budget.
  async function loadCriticalDashboardDataFast(timeoutMs = 4500, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    logWorkspaceDiagnostics('bootstrap.fastData.scope', workspaceMeta);
    const filter = (q) => applyScopeFilterForMeta(q, 'owner_id', workspaceMeta);
    const started = nowMs();
    const loaders = [
      {
        key: 'bookings',
        label: 'loadCritical.bookings',
        query: () => filter(db.from('bookings').select('*')).order('created_at', { ascending: false }),
        map: (rows) => rows.map(rowToBooking),
      },
      {
        key: 'expenses',
        label: 'loadCritical.expenses',
        query: () => filter(db.from('expenses').select('*')).order('date', { ascending: false }),
        map: (rows) => rows.map(rowToExpense),
      },
      {
        key: 'otherIncome',
        label: 'loadCritical.other_income',
        query: () => filter(db.from('other_income').select('*')).order('date', { ascending: false }),
        map: (rows) => rows.map(rowToOtherIncome),
      },
      {
        key: 'artists',
        label: 'loadCritical.artists',
        query: () => filter(db.from('artists').select('*')).order('name'),
        map: (rows) => rows.map(rowToArtist),
      },
    ];

    try {
      const payload = {};
      const missingKeys = [];

      for (const loader of loaders) {
        const elapsed = nowMs() - started;
        const remaining = timeoutMs - elapsed;
        if (remaining < 350) {
          missingKeys.push(loader.key);
          log('bootstrap.fastData.skipped', {
            key: loader.key,
            remaining: Math.round(remaining),
          });
          continue;
        }

        const perQueryTimeout = Math.max(350, Math.min(1200, remaining));
        try {
          const res = await withTimeout(loader.query, perQueryTimeout, loader.label);
          if (res?.error) {
            warn(`${loader.label} load error:`, res.error);
            missingKeys.push(loader.key);
            continue;
          }
          const rows = Array.isArray(res?.data) ? res.data : [];
          payload[loader.key] = loader.map(rows);
          log('bootstrap.fastData.table', {
            key: loader.key,
            rows: rows.length,
            ms: Math.round(nowMs() - started),
          });
        } catch (err) {
          warn(`${loader.label} failed during fast bootstrap:`, err);
          missingKeys.push(loader.key);
        }
      }

      const returnedKeys = Object.keys(payload);
      if (returnedKeys.length) {
        payload.__meta = {
          partial: missingKeys.length > 0,
          missingKeys,
          source: 'fast-bootstrap',
        };
        attachWorkspaceMeta(payload, 'fast-bootstrap', workspaceMeta);
      }
      log('bootstrap.fastData.done', {
        ms: Math.round(nowMs() - started),
        keys: returnedKeys,
        missingKeys,
      });
      return returnedKeys.length ? payload : null;
    } catch (err) {
      warn('Fast dashboard data load failed:', err);
      log('bootstrap.fastData.failed', {
        ms: Math.round(nowMs() - started),
        error: err?.message || 'unknown',
      });
      return null;
    }
  }

  async function saveData({ bookings, expenses, otherIncome }, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const ctx = workspaceMeta.teamId
      ? { team_id: workspaceMeta.teamId, owner_id: null }
      : { team_id: null, owner_id: workspaceMeta.ownerId };
    logWorkspaceDiagnostics('saveData.scope', workspaceMeta, {
      bookings: Array.isArray(bookings) ? bookings.length : null,
      expenses: Array.isArray(expenses) ? expenses.length : null,
      otherIncome: Array.isArray(otherIncome) ? otherIncome.length : null,
    });

    // Explicit scoped save: select by id/legacy id in the resolved workspace,
    // then update or insert. This avoids relying on optional DB constraints.
    async function smartUpsert(table, items, toRow) {
      if (!items || !items.length) return [];
      const rows = items.map(item => sanitizeUpsertRow(toRow(item, ownerId, ctx.team_id)));
      return saveScopedRows(table, rows, workspaceMeta);
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
      throw err;
    }
  }

  async function saveArtistsData(artists, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(artists)) return [];
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const ctx = workspaceMeta.teamId
      ? { team_id: workspaceMeta.teamId, owner_id: null }
      : { team_id: null, owner_id: workspaceMeta.ownerId };
    try {
      const rows = artists.map(a => sanitizeUpsertRow({
        ...(isCloudId(a.id) ? { id: a.id } : {}),
        legacy_id: String(a.id ?? ''),
        owner_id: ownerId,
        team_id: ctx.team_id || null,
        name: a.name || '',
        email: a.email || '',
        phone: a.phone || '',
        specialty: a.specialty || '',
        bio: a.bio || '',
        strategic_goal: a.strategicGoal || '',
        avatar: a.avatar || '',
      }));
      const results = await saveScopedRows('artists', rows, workspaceMeta);

      if (results.length) {
        const legacyMap = {};
        results.forEach((row) => {
          if (row?.legacy_id) {
            legacyMap[String(row.legacy_id)] = row.id;
          }
        });

        let artistsChanged = false;
        artists.forEach((artist) => {
          if (!artist || isCloudId(artist.id)) return;
          const nextId = legacyMap[String(artist.id)];
          if (!nextId) return;
          artist.id = nextId;
          artistsChanged = true;
        });
        if (artistsChanged && Array.isArray(window.artists)) {
          window.artists = artists;
        }

        if (Array.isArray(window.bookings)) {
          window.bookings.forEach((booking) => {
            if (!booking || isCloudId(booking.artistId)) return;
            const nextArtistId = legacyMap[String(booking.artistId)];
            if (!nextArtistId) return;
            booking.artistId = nextArtistId;
          });
        }
      }

      return results;
    } catch (err) {
      warn('saveArtists failed:', err);
      throw err;
    }
  }

  function getStructuredSyncContext(extra = {}) {
    return {
      ownerId: getOwnerId() || null,
      activeTeamId: _activeTeamId || null,
      workspace: _activeTeamId ? 'team' : 'personal',
      syncState: _syncState,
      ...extra,
    };
  }

  function formatStructuredSyncMessage(step, err) {
    if (!navigator.onLine) {
      return 'You are offline. Reconnect and try again.';
    }

    const rawMessage = String(err?.message || '').trim();
    if (err?.code === '42P10' || /no unique or exclusion constraint matching the ON CONFLICT specification/i.test(rawMessage)) {
      return 'The live Supabase schema is missing the upsert constraint for this data. Re-run the latest schema.sql.';
    }
    if (err?.code === '42501' || /row-level security/i.test(rawMessage)) {
      return 'Supabase rejected this request because this workspace does not have permission for that action.';
    }
    if (rawMessage) {
      return rawMessage;
    }
    return `Cloud sync failed during ${step}.`;
  }

  function buildStructuredSyncResult(ok, options = {}) {
    return {
      ok: Boolean(ok),
      failedStep: ok ? null : (options.failedStep || null),
      message: options.message || (ok ? 'Saved to cloud.' : 'Cloud sync failed.'),
      context: getStructuredSyncContext(options.context || {}),
    };
  }

  function beginCloudSaveOperation() {
    if (typeof window === 'undefined') return;
    window.__spCloudSaveInFlightCount = (Number(window.__spCloudSaveInFlightCount) || 0) + 1;
    window.__spCloudSaveInFlight = true;
  }

  function endCloudSaveOperation() {
    if (typeof window === 'undefined') return;
    window.__spCloudSaveInFlightCount = Math.max(0, (Number(window.__spCloudSaveInFlightCount) || 1) - 1);
    window.__spCloudSaveInFlight = window.__spCloudSaveInFlightCount > 0;
  }

  function createStructuredSyncError(step, err, options = {}) {
    const message = options.message || formatStructuredSyncMessage(step, err);
    const syncError = err instanceof Error ? err : new Error(message);
    syncError.message = message;
    const syncResult = buildStructuredSyncResult(false, {
      failedStep: step,
      message,
      context: {
        operation: step,
        errorCode: err?.code || null,
        ...(options.context || {}),
      },
    });
    syncError.syncResult = syncResult;
    syncError.failedStep = step;
    syncError.context = syncResult.context;
    return syncError;
  }

  async function runStructuredSyncOperation(step, handler, options = {}) {
    try {
      if (!getOwnerId()) {
        await ensureSupabaseSession({ silent: true, clearIfMissing: false });
      }
    } catch (err) {
      const syncError = createStructuredSyncError(step, err, {
        context: {
          reason: 'session-refresh',
          ...(options.context || {}),
        },
      });
      captureSyncException(syncError, {
        operation: step,
        extra: options.extra || {},
      });
      updateSyncIndicator(navigator.onLine ? 'failed' : 'offline');
      return syncError.syncResult;
    }

    if (!getOwnerId()) {
      updateSyncIndicator(navigator.onLine ? 'failed' : 'offline');
      return buildStructuredSyncResult(false, {
        failedStep: step,
        message: 'No active cloud session. Please sign in again.',
        context: {
          operation: step,
          reason: 'no-session',
          ...(options.context || {}),
        },
      });
    }

    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) {
      updateSyncIndicator('failed');
      return buildStructuredSyncResult(false, {
        failedStep: step,
        message: 'Workspace resolution failed. Try again in a moment.',
        context: {
          operation: step,
          reason: 'workspace-unresolved',
          ...(options.context || {}),
        },
      });
    }

    updateSyncIndicator('syncing');
    beginCloudSaveOperation();
    try {
      await refreshSessionIfNeeded({ minTtlSeconds: 90 });
      await handler();
      broadcastLocalSync(step);
      updateSyncIndicator('synced');
      if (options.showToast !== false) {
        showSaveToast(true);
      }
      return buildStructuredSyncResult(true, {
        message: options.successMessage || 'Saved to cloud.',
        context: {
          operation: step,
          ...(options.context || {}),
        },
      });
    } catch (err) {
      const syncError = createStructuredSyncError(step, err, {
        context: options.context || {},
      });
      captureSyncException(syncError, {
        operation: step,
        extra: options.extra || {},
      });
      updateSyncIndicator(navigator.onLine ? 'failed' : 'offline');
      return syncError.syncResult;
    } finally {
      endCloudSaveOperation();
    }
  }

  function collectClientSavePayload(overrides = {}) {
    const base = typeof window.SP_collectAllData === 'function'
      ? window.SP_collectAllData()
      : {
        bookings: Array.isArray(window.bookings) ? window.bookings : [],
        expenses: Array.isArray(window.expenses) ? window.expenses : [],
        otherIncome: Array.isArray(window.otherIncome) ? window.otherIncome : [],
        artists: Array.isArray(window.artists) ? window.artists : [],
        audienceMetrics: Array.isArray(window.audienceMetrics) ? window.audienceMetrics : [],
      };
    return { ...base, ...overrides };
  }

  async function saveBookings(bookings) {
    return saveAllData(collectClientSavePayload({
      bookings: Array.isArray(bookings) ? bookings : [],
    }), { reason: 'saveBookings' });
  }

  async function saveExpenses(expenses) {
    return saveAllData(collectClientSavePayload({
      expenses: Array.isArray(expenses) ? expenses : [],
    }), { reason: 'saveExpenses' });
  }

  async function saveOtherIncome(otherIncome) {
    return saveAllData(collectClientSavePayload({
      otherIncome: Array.isArray(otherIncome) ? otherIncome : [],
    }), { reason: 'saveOtherIncome' });
  }

  async function saveArtists(artists) {
    return saveAllData(collectClientSavePayload({
      artists: Array.isArray(artists) ? artists : [],
    }), { reason: 'saveArtists' });
  }

  async function loadTasks(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { data, error } = await applyScopeFilterForMeta(
        db.from('tasks').select('*').order('created_at', { ascending: true }),
        'user_id',
        workspaceMeta
      );
      if (error) { warn('Tasks load error:', error); return null; }
      return (data || []).map(rowToTask);
    } catch (err) {
      warn('Tasks load failed:', err);
      return null;
    }
  }

  async function saveTasks(tasks, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(tasks)) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const rows = tasks
      .map((task) => taskToRow(task, ownerId, workspaceMeta.teamId))
      .filter((row) => row.id && row.text);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('tasks').upsert(rows, { onConflict: 'id' });
      throwIfSupabaseError('Tasks save', error);
    } catch (err) {
      warn('Tasks save failed:', err);
      throw err;
    }
  }

  async function loadRevenueGoal(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { data, error } = await applyScopeFilterForMeta(
        db.from('revenue_goals').select('*').eq('period', 'monthly').limit(1),
        'user_id',
        workspaceMeta
      );
      if (error) { warn('Revenue goal load error:', error); return null; }
      const row = (data || [])[0];
      return row ? rowToRevenueGoal(row) : null;
    } catch (err) {
      warn('Revenue goal load failed:', err);
      return null;
    }
  }

  async function saveRevenueGoal(goal, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !goal) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { error } = await db.from('revenue_goals').upsert(
        [revenueGoalToRow(goal, ownerId, workspaceMeta.teamId)],
        { onConflict: workspaceMeta.teamId ? 'team_id,period' : 'user_id,period' }
      );
      throwIfSupabaseError('Revenue goal save', error);
    } catch (err) {
      warn('Revenue goal save failed:', err);
      throw err;
    }
  }

  async function loadBBFEntries(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { data, error } = await applyScopeFilterForMeta(
        db.from('bbf_entries').select('*').order('period', { ascending: true }),
        'user_id',
        workspaceMeta
      );
      if (error) { warn('BBF load error:', error); return null; }
      return (data || []).map(rowToBBF);
    } catch (err) {
      warn('BBF load failed:', err);
      return null;
    }
  }

  async function saveBBFEntries(entries, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(entries)) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const rows = entries
      .map((entry) => bbfToRow(entry, ownerId, workspaceMeta.teamId))
      .filter((row) => row.period);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('bbf_entries').upsert(
        rows,
        { onConflict: workspaceMeta.teamId ? 'team_id,period' : 'user_id,period' }
      );
      throwIfSupabaseError('BBF save', error);
    } catch (err) {
      warn('BBF save failed:', err);
      throw err;
    }
  }

  async function loadClosingThoughts(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    try {
      const { data, error } = await applyScopeFilterForMeta(
        db.from('closing_thoughts').select('*').order('updated_at', { ascending: true }),
        'user_id',
        workspaceMeta
      );
      if (error) { warn('Closing thoughts load error:', error); return null; }
      return (data || []).map(rowToClosingThought);
    } catch (err) {
      warn('Closing thoughts load failed:', err);
      return null;
    }
  }

  async function saveClosingThoughts(entries, options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId || !Array.isArray(entries)) return;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const rows = entries
      .map((entry) => closingThoughtToRow(entry, ownerId, workspaceMeta.teamId))
      .filter((row) => row.period && row.content);
    if (rows.length === 0) return;
    try {
      const { error } = await db.from('closing_thoughts').upsert(
        rows,
        { onConflict: workspaceMeta.teamId ? 'team_id,period' : 'user_id,period' }
      );
      throwIfSupabaseError('Closing thoughts save', error);
    } catch (err) {
      warn('Closing thoughts save failed:', err);
      throw err;
    }
  }

  async function loadAllData(options = {}) {
    const ownerId = getOwnerId();
    if (!ownerId) return null;
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    logWorkspaceDiagnostics('loadAllData.scope', workspaceMeta, { reason: options.reason || 'loadAllData' });
    let profile = _profile || null;
    if (!profile && !options.skipProfileFetch) {
      try {
        profile = await withTimeout(
          () => getProfile(),
          typeof options.profileTimeoutMs === 'number' ? options.profileTimeoutMs : 2500,
          'getProfile[loadAllData]'
        );
      } catch (err) {
        warn('Profile lookup skipped during cloud data load:', err);
      }
    }
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
      const core             = await timedLoad('loadData',            () => loadData({ workspaceMeta }), 7000);
      const audienceMetrics  = await timedLoad('loadAudienceMetrics', () => loadAudienceMetrics({ workspaceMeta }), 5000);
      const tasks            = await timedLoad('loadTasks',           () => loadTasks({ workspaceMeta }),           5000);
      const revenueGoal      = await timedLoad('loadRevenueGoal',     () => loadRevenueGoal({ workspaceMeta }),     4000);
      const bbfEntries       = await timedLoad('loadBBFEntries',      () => loadBBFEntries({ workspaceMeta }),      5000);
      const closingThoughts  = await timedLoad('loadClosingThoughts', () => loadClosingThoughts({ workspaceMeta }), 5000);

      const payload = {};
      const coreMeta = core.value?.__meta || null;
      const coreKeys = ['bookings', 'expenses', 'otherIncome', 'artists'];
      const coreMissingKeys = core.value && typeof core.value === 'object'
        ? coreKeys.filter((key) => !Object.prototype.hasOwnProperty.call(core.value, key))
        : coreKeys;
      if (core.value && typeof core.value === 'object') Object.assign(payload, core.value);
      if (audienceMetrics.value) payload.audienceMetrics = audienceMetrics.value;
      if (tasks.value) payload.tasks = tasks.value;
      if (revenueGoal.value) payload.revenueGoal = revenueGoal.value;
      if (bbfEntries.value) payload.bbfEntries = bbfEntries.value;
      if (closingThoughts.value) payload.closingThoughts = closingThoughts.value;
      if (profile?.preferred_theme) payload.theme = profile.preferred_theme;

      const allCriticalTimedOut = [core, audienceMetrics, tasks, revenueGoal, bbfEntries, closingThoughts].every(r => r.timedOut);
      const hasData = Object.keys(payload).length > 0;
      if (!hasData) {
        return allCriticalTimedOut
          ? attachWorkspaceMeta({ __meta: { allCriticalTimedOut: true } }, options.reason || 'loadAllData-timeout', workspaceMeta)
          : null;
      }

      payload.__meta = {
        allCriticalTimedOut,
        corePartial: Boolean(coreMeta?.corePartial) || coreMissingKeys.length > 0,
        missingKeys: Array.from(new Set([...(coreMeta?.missingKeys || []), ...coreMissingKeys])),
      };
      attachWorkspaceMeta(payload, options.reason || 'loadAllData', workspaceMeta);
      return payload;
    } catch (err) {
      warn('loadAllData failed:', err);
      return null;
    }
  }

  async function loadAllDataWithRetry(options = {}) {
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
    const retries = typeof options.retries === 'number' ? options.retries : 1;
    const label = options.label || 'loadAllData';
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const fresh = await withTimeout(
          () => loadAllData({
            workspaceMeta: options.workspaceMeta,
            reason: label,
            skipProfileFetch: options.skipProfileFetch,
            profileTimeoutMs: options.profileTimeoutMs,
          }),
          timeoutMs,
          attempt === 0 ? label : `${label}[retry-${attempt}]`
        );
        if (fresh) {
          if (fresh.__meta?.corePartial) {
            lastError = new Error(`Core cloud data incomplete: ${(fresh.__meta.missingKeys || []).join(', ')}`);
            warn('loadAllDataWithRetry got partial core data:', fresh.__meta);
            if (attempt < retries) {
              continue;
            }
            throw lastError;
          }
          return fresh;
        }
      } catch (err) {
        lastError = err;
        warn('loadAllDataWithRetry failed:', err);
      }

      if (attempt < retries) {
        try {
          await refreshSessionIfNeeded({ minTtlSeconds: 0 });
        } catch (refreshErr) {
          warn('Session refresh before retry failed:', refreshErr);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  function parseBootstrapPayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_err) { return null; }
    }
    return raw && typeof raw === 'object' ? raw : null;
  }

  function mapBootstrapRows(rows, mapper) {
    return Array.isArray(rows) ? rows.map(mapper).filter(Boolean) : [];
  }

  function normalizeBootstrapRpcPayload(raw, activeSession) {
    const payload = parseBootstrapPayload(raw);
    if (!payload || typeof payload !== 'object') return null;
    const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    const workspaceRaw = payload.workspace && typeof payload.workspace === 'object'
      ? payload.workspace
      : {};
    const ownerId = workspaceRaw.ownerId || workspaceRaw.owner_id || activeSession?.user?.id || getOwnerId();
    const teamId = normalizeTeamId(workspaceRaw.teamId || workspaceRaw.team_id || null);
    const workspaceMeta = normalizeWorkspaceMeta({
      ownerId,
      teamId,
      source: 'bootstrap-rpc',
    });
    const missingKeys = Array.isArray(meta.missingKeys)
      ? meta.missingKeys
      : (Array.isArray(meta.missing_keys) ? meta.missing_keys : []);
    const fresh = {
      bookings: mapBootstrapRows(data.bookings, rowToBooking),
      expenses: mapBootstrapRows(data.expenses, rowToExpense),
      otherIncome: mapBootstrapRows(data.otherIncome || data.other_income, rowToOtherIncome),
      artists: mapBootstrapRows(data.artists, rowToArtist),
      audienceMetrics: mapBootstrapRows(data.audienceMetrics || data.audience_metrics, rowToAudienceMetric),
      tasks: mapBootstrapRows(data.tasks, rowToTask),
      bbfEntries: mapBootstrapRows(data.bbfEntries || data.bbf_entries, rowToBBF),
      closingThoughts: mapBootstrapRows(data.closingThoughts || data.closing_thoughts, rowToClosingThought),
    };
    if (data.revenueGoal || data.revenue_goal) {
      fresh.revenueGoal = rowToRevenueGoal(data.revenueGoal || data.revenue_goal);
    }
    fresh.__meta = {
      source: 'bootstrap-rpc',
      complete: meta.complete !== false,
      missingKeys,
      generatedAt: meta.generatedAt || meta.generated_at || null,
    };
    attachWorkspaceMeta(fresh, 'bootstrap-rpc', workspaceMeta);
    const teams = mapBootstrapRows(payload.teams, normalizeTeamContextRow);
    cacheTeamContext(teams, 'bootstrap-rpc');
    const activeTeam = teamId ? teams.find((team) => team.id === teamId) : null;
    return {
      profile: payload.profile || null,
      teams,
      workspaceMeta,
      teamId,
      role: workspaceRaw.role || activeTeam?.myRole || null,
      permissions: workspaceRaw.permissions || activeTeam?.myPermissions || null,
      fresh,
      meta: fresh.__meta,
    };
  }

  function applyBootstrapProfile(profile, activeSession, usernameHint, remember) {
    if (!profile) return;
    _profile = profile;
    if (profile.preferred_currency) {
      applyCurrency(profile.preferred_currency);
    }
    if (profile.preferred_theme && typeof window.applyTheme === 'function' && !hasLocalThemePreference()) {
      window.applyTheme(profile.preferred_theme, { persist: true, syncRemote: false });
    }
    const stableUsername = resolveSessionUsername(activeSession.user, profile, usernameHint);
    if (profile.username === 'Manager' && stableUsername && stableUsername !== 'Manager') {
      _profile = { ...profile, username: stableUsername };
    }
    syncAuthIntoAppSession(stableUsername, _profile, remember);
    if (typeof window.updateCurrentManagerContext === 'function') {
      try {
        window.updateCurrentManagerContext();
      } catch (err) {
        warn('updateCurrentManagerContext after bootstrap profile failed:', err);
      }
    }
  }

  async function loadBootstrapPayloadFromRpc(activeSession, options = {}) {
    const userId = activeSession?.user?.id;
    if (!userId || typeof db.rpc !== 'function') return null;
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 4500;
    const started = nowMs();
    recordBootstrapTiming('bootstrap.rpc.start', { timeoutMs });
    let result = null;
    try {
      const response = await withTimeout(
        () => db.rpc('get_bootstrap_payload', { uid: userId }),
        timeoutMs,
        'get_bootstrap_payload'
      );
      if (response?.error) {
        if (isMissingRpcError(response.error, 'get_bootstrap_payload')) {
          warn('Bootstrap RPC is not deployed yet; falling back to table bootstrap.');
          recordBootstrapTiming('bootstrap.rpc.missing', {
            ms: Math.round(nowMs() - started),
          });
          return null;
        }
        throwIfSupabaseError('get_bootstrap_payload', response.error);
      }
      result = normalizeBootstrapRpcPayload(response?.data, activeSession);
      recordBootstrapTiming('bootstrap.rpc.done', {
        ms: Math.round(nowMs() - started),
        ok: Boolean(result?.fresh),
        bookings: Array.isArray(result?.fresh?.bookings) ? result.fresh.bookings.length : null,
        expenses: Array.isArray(result?.fresh?.expenses) ? result.fresh.expenses.length : null,
        artists: Array.isArray(result?.fresh?.artists) ? result.fresh.artists.length : null,
        missingKeys: result?.meta?.missingKeys || [],
      });
      return result;
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError';
      recordBootstrapTiming(timedOut ? 'bootstrap.timeout' : 'bootstrap.rpc.failed', {
        ms: Math.round(nowMs() - started),
        error: err?.message || 'unknown',
      });
      if (timedOut || isMissingRpcError(err, 'get_bootstrap_payload')) return null;
      warn('Bootstrap RPC failed; falling back to table bootstrap:', err);
      return null;
    }
  }

  async function refreshCloudData(options = {}) {
    if (!getOwnerId()) {
      await ensureSupabaseSession({ silent: true, clearIfMissing: true });
    }
    if (!getOwnerId()) return null;
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) return null;
    if (_refreshInFlight) return null;
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    const now = Date.now();
    const minIntervalMs = typeof options.minIntervalMs === 'number' ? options.minIntervalMs : 5000;
    if (!options.force && now - _lastRefreshAt < minIntervalMs) return null;

    _refreshInFlight = true;
    _lastRefreshAt = now;
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
    try {
      logWorkspaceDiagnostics('refreshCloudData.scope', workspaceMeta, { reason: options.reason || 'refresh' });
      const fresh = await withTimeout(
        () => loadAllData({ workspaceMeta, reason: options.reason || 'refresh' }),
        timeoutMs,
        'loadAllData[refresh]'
      );
      const meta = fresh?.__meta || null;
      if (meta?.corePartial) {
        warn('refreshCloudData skipped partial core snapshot:', meta);
        return null;
      }
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
        window.loadUserData({ snapshot: fresh || undefined });
      }
      if (shouldSync && window.__spAppBooted) {
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof window.renderBookings === 'function') window.renderBookings();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
        if (typeof window.renderArtists === 'function') window.renderArtists();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
        if (typeof window.renderTasks === 'function') window.renderTasks();
        if (typeof window.renderAudienceMetrics === 'function') window.renderAudienceMetrics();
      }
      return fresh;
    } catch (err) {
      warn('refreshCloudData failed:', err);
      captureSyncException(err, {
        operation: 'refreshCloudData',
        reason: options.reason || 'refresh-failed',
        extra: {
          force: Boolean(options.force),
          silent: Boolean(options.silent),
          minIntervalMs: minIntervalMs,
        },
      });
      if (!options.silent) {
        toastSafe('Warn', 'Cloud data refresh failed. Check your connection and try again.');
      }
      return null;
    } finally {
      _refreshInFlight = false;
    }
  }

  function countPayloadItems(payload, key) {
    return Array.isArray(payload?.[key]) ? payload[key].length : null;
  }

  function countVerifiedItems(payload, key) {
    return Array.isArray(payload?.[key]) ? payload[key].length : 0;
  }

  async function verifySavedPayload(payload = {}, workspaceMeta = null) {
    const requiredKeys = ['bookings', 'expenses', 'otherIncome', 'artists', 'audienceMetrics'];
    const expected = requiredKeys.reduce((memo, key) => {
      const count = countPayloadItems(payload, key);
      if (Number.isFinite(count) && count > 0) memo[key] = count;
      return memo;
    }, {});
    if (!Object.keys(expected).length) return null;

    const verified = await loadAllDataWithRetry({
      timeoutMs: 12000,
      retries: 0,
      label: 'loadAllData[save-verify]',
      workspaceMeta,
    });
    const verifiedWorkspace = verified?.__workspace || null;
    const expectedScope = normalizeWorkspaceMeta(workspaceMeta || {}).scopeKey;
    if (verifiedWorkspace?.scopeKey && expectedScope && verifiedWorkspace.scopeKey !== expectedScope) {
      throw new Error('Cloud save verification returned a different workspace.');
    }
    for (const [key, expectedCount] of Object.entries(expected)) {
      const actualCount = countVerifiedItems(verified, key);
      if (actualCount < expectedCount) {
        throw new Error(`Cloud save verification failed for ${key}.`);
      }
    }
    return verified;
  }

  async function performSaveAllData(payload = {}, options = {}) {
    if (!getOwnerId()) {
      await ensureSupabaseSession({ silent: true, clearIfMissing: false });
    }
    const ownerId = getOwnerId();
    if (!ownerId) {
      return buildStructuredSyncResult(false, {
        failedStep: 'saveAllData',
        message: 'No active cloud session. Please sign in again.',
        context: {
          operation: 'saveAllData',
          reason: 'no-session',
        },
      });
    }
    if (!(await ensureWorkspaceReady({ promptOnSelection: false }))) {
      return buildStructuredSyncResult(false, {
        failedStep: 'saveAllData',
        message: 'Workspace resolution failed. Try again in a moment.',
        context: {
          operation: 'saveAllData',
          reason: 'workspace-unresolved',
        },
      });
    }

    await refreshSessionIfNeeded({ minTtlSeconds: 90 });
    const workspaceMeta = normalizeWorkspaceMeta(options.workspaceMeta || {});
    logWorkspaceDiagnostics('saveAllData.scope', workspaceMeta, { reason: options.reason || 'saveAllData' });

    const sig = computeCloudSignature(payload);

    updateSyncIndicator('syncing');
    let didSave = false;
    const {
      bookings,
      expenses,
      otherIncome,
      artists,
      audienceMetrics,
      tasks,
      revenueGoal,
      bbfEntries,
      closingThoughts,
      theme,
    } = payload || {};

    let failedStep = 'saveAllData';
    beginCloudSaveOperation();
    try {
      if (Array.isArray(bookings) || Array.isArray(expenses) || Array.isArray(otherIncome)) {
        failedStep = 'saveData';
        await saveData({
          bookings: Array.isArray(bookings) ? bookings : (window.bookings || []),
          expenses: Array.isArray(expenses) ? expenses : (window.expenses || []),
          otherIncome: Array.isArray(otherIncome) ? otherIncome : (window.otherIncome || []),
        }, { workspaceMeta });
        didSave = true;
      }
      if (Array.isArray(artists)) {
        failedStep = 'saveArtists';
        await saveArtistsData(artists, { workspaceMeta });
        didSave = true;
      }
      if (Array.isArray(audienceMetrics)) {
        failedStep = 'saveAudienceMetrics';
        await saveAudienceMetrics(audienceMetrics, { workspaceMeta });
        didSave = true;
      }
      if (Array.isArray(tasks)) {
        failedStep = 'saveTasks';
        await saveTasks(tasks, { workspaceMeta });
        didSave = true;
      }
      if (revenueGoal) {
        failedStep = 'saveRevenueGoal';
        await saveRevenueGoal(revenueGoal, { workspaceMeta });
        didSave = true;
      }
      if (Array.isArray(bbfEntries)) {
        failedStep = 'saveBBFEntries';
        await saveBBFEntries(bbfEntries, { workspaceMeta });
        didSave = true;
      }
      if (Array.isArray(closingThoughts)) {
        failedStep = 'saveClosingThoughts';
        await saveClosingThoughts(closingThoughts, { workspaceMeta });
        didSave = true;
      }
      if (theme) {
        failedStep = 'updateProfile';
        await updateProfile({ preferred_theme: theme });
        didSave = true;
      }
    } catch (err) {
      const syncError = createStructuredSyncError(failedStep, err, {
        context: {
          operation: 'saveAllData',
          bookingCount: Array.isArray(bookings) ? bookings.length : null,
          expenseCount: Array.isArray(expenses) ? expenses.length : null,
          otherIncomeCount: Array.isArray(otherIncome) ? otherIncome.length : null,
          artistCount: Array.isArray(artists) ? artists.length : null,
          taskCount: Array.isArray(tasks) ? tasks.length : null,
        },
      });
      captureSyncException(syncError, {
        operation: 'saveAllData',
        extra: {
          failedStep,
          bookingCount: Array.isArray(bookings) ? bookings.length : null,
          expenseCount: Array.isArray(expenses) ? expenses.length : null,
          otherIncomeCount: Array.isArray(otherIncome) ? otherIncome.length : null,
          artistCount: Array.isArray(artists) ? artists.length : null,
          taskCount: Array.isArray(tasks) ? tasks.length : null,
        },
      });
      updateSyncIndicator(navigator.onLine ? 'failed' : 'offline');
      throw syncError;
    } finally {
      endCloudSaveOperation();
    }

    if (didSave) {
      failedStep = 'saveVerify';
      let verifiedSnapshot = null;
      try {
        verifiedSnapshot = await verifySavedPayload(payload, workspaceMeta);
      } catch (verifyErr) {
        const syncError = createStructuredSyncError(failedStep, verifyErr, {
          context: {
            operation: 'saveAllData',
            reason: 'read-after-write-verification',
          },
        });
        captureSyncException(syncError, {
          operation: 'saveAllData',
          extra: {
            failedStep,
            reason: 'read-after-write-verification',
          },
        });
        updateSyncIndicator(navigator.onLine ? 'failed' : 'offline');
        throw syncError;
      }
      if (verifiedSnapshot) {
        if (typeof window._SP_syncFromCloud === 'function') {
          window._SP_syncFromCloud(verifiedSnapshot);
        }
        if (typeof window.loadUserData === 'function') {
          window.loadUserData({
            snapshot: verifiedSnapshot,
            source: 'save-verify',
          });
        }
        if (window.__spAppBooted) {
          renderAppDataViews('save-verify');
        }
      }
      _lastSavedSignature = sig;
      broadcastLocalSync('saveAllData');
      updateSyncIndicator('synced');
      showSaveToast(true);
      return buildStructuredSyncResult(true, {
        message: 'Saved to cloud.',
        context: {
          operation: 'saveAllData',
          didSave: true,
        },
      });
    }
    return buildStructuredSyncResult(true, {
      message: 'No cloud changes to save.',
      context: {
        operation: 'saveAllData',
        didSave: false,
      },
    });
  }

  async function saveAllData(payload = {}, options = {}) {
    _pendingSavePayload = payload || {};
    if (_saveInFlight) {
      return _saveInFlight;
    }

    _saveInFlight = (async () => {
      let lastResult = null;
      try {
        while (_pendingSavePayload) {
          const nextPayload = _pendingSavePayload;
          _pendingSavePayload = null;
          lastResult = await performSaveAllData(nextPayload, options);
        }
        return lastResult || buildStructuredSyncResult(true, {
          message: 'No cloud changes to save.',
          context: {
            operation: 'saveAllData',
            didSave: false,
          },
        });
      } finally {
        _saveInFlight = null;
      }
    })();

    return _saveInFlight;
  }

  async function runStructuredDelete(step, table, id) {
    return runStructuredSyncOperation(step, async () => {
      if (!id) {
        throw new Error('Missing record id.');
      }
      const base = db.from(table).delete();
      const isUuid = isCloudId(id);
      let query = isUuid ? base.eq('id', id) : base.eq('legacy_id', String(id));
      query = _activeTeamId
        ? query.eq('team_id', _activeTeamId)
        : query.eq('owner_id', getOwnerId()).is('team_id', null);
      const { error } = await query;
      throwIfSupabaseError(`${table} delete`, error);
    }, {
      showToast: false,
      successMessage: 'Deleted from cloud.',
      context: {
        table,
        recordId: id,
      },
    });
  }

  async function deleteBooking(id) {
    return runStructuredDelete('deleteBooking', 'bookings', id);
  }

  async function deleteExpense(id) {
    return runStructuredDelete('deleteExpense', 'expenses', id);
  }

  async function deleteOtherIncome(id) {
    return runStructuredDelete('deleteOtherIncome', 'other_income', id);
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
  // cannot round-trip OAuth back into the file. We return the current http/https
  // origin when available, or the production URL as an explicit fallback for
  // email confirmation links only.
  const SP_PRODUCTION_URL = 'https://star-paper.netlify.app';
  function getSafeRedirectUrl(options = {}) {
    const requireHttpOrigin = Boolean(options.requireHttpOrigin);
    const fallbackToProduction = options.fallbackToProduction !== false;
    const origin = window.location.origin;
    const isValidOrigin = origin && origin !== 'null' && origin.startsWith('http');
    if (isValidOrigin) {
      return new URL(window.location.pathname || '/', origin).toString();
    }
    if (requireHttpOrigin) return null;
    return fallbackToProduction ? SP_PRODUCTION_URL : null;
  }

  // Warn clearly when running on file:// — OAuth and email-confirm redirects need http(s).
  if (window.location.protocol === 'file:') {
    console.warn(
      '[StarPaper] Running on file:// — Google OAuth and email-confirm redirects will not work locally.\n' +
      'Use a local server instead: run `npx serve .` or use VS Code Live Server.\n' +
      'Email/password sign-in works normally on http://localhost.'
    );
  }

  async function handleAuthRedirect() {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
    const accessToken = hashParams.get('access_token') || url.searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || url.searchParams.get('refresh_token');
    const code = url.searchParams.get('code');
    const oauthError = hashParams.get('error') || url.searchParams.get('error');
    const oauthErrorCode = hashParams.get('error_code') || url.searchParams.get('error_code');
    const oauthErrorDescription = hashParams.get('error_description') || url.searchParams.get('error_description');
    const hadAuthCallback = Boolean(
      accessToken ||
      refreshToken ||
      code ||
      oauthError ||
      oauthErrorCode ||
      oauthErrorDescription
    );
    const finishWith = (status, overrides = {}) => ({
      hadAuthCallback,
      status,
      shouldBootstrapStoredSession: overrides.shouldBootstrapStoredSession !== false,
      ...overrides,
    });

    // No OAuth params present — nothing to do.
    if (!hadAuthCallback) {
      window.__spAuthRedirectInProgress = false;
      return finishWith('none');
    }

    window.__spAuthRedirectInProgress = true;
    const flowId = beginBootTransitionSafe('auth-redirect', 'loading-session');

    // Explicit OAuth callback always clears the "logged out" guard.
    localStorage.removeItem('sp_logged_out');

    try {
      if (oauthError || oauthErrorCode || oauthErrorDescription) {
        const errorMessage = oauthErrorDescription || oauthErrorCode || oauthError || 'Sign-in failed.';
        clearSupabaseAuthArtifacts();
        resetWorkspaceState();
        _session = null;
        _profile = null;
        window.__spSuppressStoredSessionBootstrap = true;
        showLoginScreen({ flowId, reason: 'auth-redirect-error' });
        if (typeof window.toastError === 'function') {
          window.toastError(errorMessage);
        }
        return finishWith('error', {
          error: errorMessage,
          shouldBootstrapStoredSession: false,
        });
      }

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

      if (!isBootTransitionCurrentSafe(flowId)) {
        return finishWith('stale', {
          shouldBootstrapStoredSession: false,
        });
      }

      if (session) {
        window.__spSuppressStoredSessionBootstrap = false;
        await runBootstrapTask(() => bootstrapFromSupabaseSession(session, {
          remember: true,
          showWelcome: true,
          flowId,
        }));
        return finishWith('success', {
          shouldBootstrapStoredSession: false,
        });
      } else {
        // Exchange failed AND no stored session — clear the loader and show login
        // so the user isn't stranded on a blank page after a bad OAuth redirect.
        warn('Auth redirect: no valid session recovered — showing login.');
        clearSupabaseAuthArtifacts();
        resetWorkspaceState();
        _session = null;
        _profile = null;
        window.__spSuppressStoredSessionBootstrap = true;
        showLoginScreen({ flowId, reason: 'auth-redirect-invalid' });
        if (typeof window.toastError === 'function') {
          window.toastError('Sign-in link expired or invalid. Please log in again.');
        }
        return finishWith('error', {
          error: exchangeError?.message || 'Sign-in link expired or invalid. Please log in again.',
          shouldBootstrapStoredSession: false,
        });
      }

    } catch (err) {
      warn('Auth redirect handling failed:', err);
      clearSupabaseAuthArtifacts();
      resetWorkspaceState();
      _session = null;
      _profile = null;
      window.__spSuppressStoredSessionBootstrap = true;
      showLoginScreen({ flowId, reason: 'auth-redirect-failed' });
      return finishWith('error', {
        error: err?.message || 'Sign-in failed. Please try again.',
        shouldBootstrapStoredSession: false,
      });
    } finally {
      // Always strip auth tokens from the URL regardless of outcome.
      url.hash = '';
      ['access_token', 'refresh_token', 'type', 'token_type', 'expires_in', 'code', 'error', 'error_code', 'error_description', 'state'].forEach((key) => {
        url.searchParams.delete(key);
      });
      const cleanUrl = url.pathname + url.search;
      window.history.replaceState({}, document.title, cleanUrl);
      window.__spAuthRedirectInProgress = false;
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
        emailRedirectTo: getSafeRedirectUrl({ fallbackToProduction: true }),
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
      username: profile?.username || normalized,
      email: profile?.email || '',
      phone: profile?.phone || '',
      bio: profile?.bio || '',
      avatar: profile?.avatar_url || profile?.avatar || '',
    };

    if (typeof window.applyAuthSession === 'function') {
      window.applyAuthSession(normalized, {
        remember: Boolean(remember),
        profile: profileShape,
      });
      return;
    }
    window.currentUser = normalized;
  }

  function resolveSessionUsername(user, profile, usernameHint = '') {
    const derived = deriveUsernameFromAuth(user, usernameHint);
    const profileName = String(profile?.username || '').trim();
    if (profileName && !(profileName === 'Manager' && derived && derived !== 'Manager')) {
      return profileName;
    }
    return derived || profileName || 'Manager';
  }

  async function bootstrapFromSupabaseSession(session, options = {}) {
    clearLocalBootFallback();
    const flowId = options.flowId || beginBootTransitionSafe('bootstrap-session', 'loading-session');
    const activeSession = session || _session || await getSession();
    if (!activeSession?.user) return false;
    const bootstrapStartedAt = nowMs();
    let bootstrapSucceeded = false;
    if (
      _lastBootstrapOutcome &&
      _lastBootstrapOutcome.ok === false &&
      _lastBootstrapOutcome.userId === activeSession.user.id &&
      options.allowRepeatBootstrap !== true &&
      nowMs() - _lastBootstrapOutcome.at < 15000
    ) {
      log('bootstrap.duplicate.skip', { flowId });
      return false;
    }
    log('bootstrap.start');
    if (!isBootTransitionCurrentSafe(flowId)) return false;
    setBootStateSafe('booting-data');

    // Step C: A real authenticated user exists — clear the "explicitly logged out"
    // flag so that onAuthStateChange and checkAuth() can bootstrap normally from
    // this point forward. This is the only place we clear it, ensuring it always
    // takes effect on the very next successful login.
    localStorage.removeItem('sp_logged_out');
    window.__spSuppressStoredSessionBootstrap = false;
    window.__spAuthRedirectInProgress = false;

    _session = activeSession;
    await syncRealtimeAuthToken(activeSession);
    log('bootstrap.session', { user: activeSession.user?.email || activeSession.user?.id });
    subscribeToCoreRealtime();

    const remember = options.remember !== undefined ? Boolean(options.remember) : true;
    const usernameHint = options.usernameHint || '';
    const fallbackProfile = { email: activeSession.user.email || '' };
    const username = deriveUsernameFromAuth(activeSession.user, usernameHint);
    syncAuthIntoAppSession(username, fallbackProfile, remember);

    if (typeof window.updateCurrentManagerContext === 'function') {
      try {
        window.updateCurrentManagerContext();
      } catch (err) {
        warn('updateCurrentManagerContext failed:', err);
      }
    }

    // AUTH FIXPACK 2 2026-04-27 (Fix 8): tightened from 1200ms to 800ms to hit
    // the user's <5s total budget. App helpers are usually ready by then.
    const appReady = await waitForAppBootReady(800);
    if (!isBootTransitionCurrentSafe(flowId)) return false;
    if (!appReady) {
      warn('App boot helpers were not ready before Supabase bootstrap; calling shell anyway.');
    }
    // AUTH FIXPACK 2026-04-26 (Fix 2): always attempt the fast dashboard shell. The function
    // self-guards each call with `typeof window.showApp === 'function'` etc., so a too-early
    // call is a no-op rather than an error. Earliest reveal = safest reveal.
    showAuthenticatedDashboardShell('bootstrap-fast-shell');

    // AUTH FIXPACK 2 2026-04-27 (Fix 8): explicit boot-state transition so the
    // loader text updates from "Signing in..." to "Syncing your workspace..."
    // while data is being fetched. The loader element itself stays on top via
    // sp-force-boot until line 2912 calls hideBootLoaderElement().
    setBootStateSafe('booting-data');

    _refreshInFlight = true;
    window.__spCloudBootstrapPending = true;

    // AUTH FIXPACK 2 2026-04-27 (Fix 3 update): hard 5.5s wallclock safety timer
    // (was 8s) — matches user's "<5s" expectation with 500ms slack. Eliminates the
    // "stuck on boot loader" failure mode even if every Supabase call hangs.
    clearBootstrapSafetyTimer();
    _bootstrapSafetyTimer = setTimeout(() => {
      if (!isBootTransitionCurrentSafe(flowId)) return;
      if (window.__spAppBooted) return; // happy path beat us — nothing to do.
      if (_refreshInFlight || window.__spCloudBootstrapPending || _bootstrapPromise) {
        warn('Bootstrap safety timeout found active cloud boot; abandoning stuck bootstrap owner.');
        showStalledBootError('Cloud sync took too long', 'Tap Retry to reload your workspace, or Log out.', 'bootstrap-safety-timeout');
        return;
      }
      warn('Bootstrap safety timeout fired with no active cloud boot; showing retryable boot error.');
      try {
        if (_session) {
          showBootErrorState('Cloud sync took too long', 'Tap Retry to reload your workspace, or Log out.');
        } else if (localStorage.getItem('sp_logged_out') === '1') {
          showLandingScreen({ flowId, reason: 'bootstrap-safety-logged-out' });
        } else {
          showLoginScreen({ flowId, reason: 'bootstrap-safety-no-session' });
        }
      } catch (recoveryErr) {
        warn('Safety-timeout recovery UI failed:', recoveryErr);
      }
    }, 15000);

    let profile = null;
    let profileResolved = false;
    let teams = [];
    let fresh = null;
    let shouldRunBackgroundRefresh = false;
    let workspaceMeta = null;
    try {
      const rpcBootstrap = await loadBootstrapPayloadFromRpc(activeSession, {
        timeoutMs: options.bootstrapRpcTimeoutMs || 4500,
      });

      if (rpcBootstrap?.fresh) {
        profile = rpcBootstrap.profile;
        profileResolved = Boolean(profile);
        teams = rpcBootstrap.teams;
        fresh = rpcBootstrap.fresh;
        workspaceMeta = rpcBootstrap.workspaceMeta;
        shouldRunBackgroundRefresh = rpcBootstrap.meta?.complete === false ||
          (Array.isArray(rpcBootstrap.meta?.missingKeys) && rpcBootstrap.meta.missingKeys.length > 0);
        applyBootstrapProfile(profile, activeSession, usernameHint, remember);
        await persistActiveTeam(rpcBootstrap.teamId, {
          persistRemote: false,
          role: rpcBootstrap.role,
          permissions: rpcBootstrap.permissions,
          profile,
        });
        logWorkspaceDiagnostics('bootstrap.workspace', workspaceMeta, { source: 'bootstrap-rpc' });
        subscribeToCoreRealtime();
      } else if (options.allowLegacyBootstrap === true) {
      try {
        // AUTH FIXPACK 2 2026-04-27 (Fix 8): tightened 1800ms → 1200ms toward <5s total budget.
        profile = await withTimeout(
          () => ensureProfileRecord(activeSession.user, usernameHint),
          3500,
          'ensureProfileRecord'
        );
        profileResolved = Boolean(profile);
        log('bootstrap.profile.done', { ok: Boolean(profile) });
      } catch (err) {
        warn('Profile load failed or timed out:', err);
        log('bootstrap.profile.done', { ok: false, error: err?.message || 'unknown' });
      }

      if (profile?.preferred_currency) {
        applyCurrency(profile.preferred_currency);
      }
      if (profile?.preferred_theme && typeof window.applyTheme === 'function' && !hasLocalThemePreference()) {
        window.applyTheme(profile.preferred_theme, { persist: true, syncRemote: false });
      }
      if (profile) {
        const stableUsername = resolveSessionUsername(activeSession.user, profile, usernameHint);
        if (profile.username === 'Manager' && stableUsername && stableUsername !== 'Manager') {
          profile = { ...profile, username: stableUsername };
          _profile = profile;
        }
        syncAuthIntoAppSession(stableUsername, profile, remember);
        if (typeof window.updateCurrentManagerContext === 'function') {
          try {
            window.updateCurrentManagerContext();
          } catch (err) {
            warn('updateCurrentManagerContext after profile failed:', err);
          }
        }
      }

      try {
        // AUTH FIXPACK 2 2026-04-27 (Fix 8): tightened 1800ms → 1200ms.
        teams = await withTimeout(() => getMyTeams({ nullOnError: true }), 2500, 'getMyTeams[bootstrap]');
      } catch (teamErr) {
        warn('Team membership load failed during bootstrap:', teamErr);
        teams = null;
      }

      const workspace = await resolveActiveWorkspace({
        profile,
        teams,
        promptOnSelection: false,
        skipProfileFetch: !profileResolved,
        persistTimeoutMs: 1500,
      });
      workspaceMeta = getActiveWorkspaceMeta(workspace?.source || 'bootstrap');
      logWorkspaceDiagnostics('bootstrap.workspace', workspaceMeta, { source: workspace?.source || 'unknown' });

      subscribeToCoreRealtime();

      try {
        // AUTH FIXPACK 2 2026-04-27 (Fix 8): tightened 4500ms → 2500ms to hit the
        // user's <5s total budget. Background refresh at line 2916 picks up any
        // late records, so this is a soft-deadline only.
        fresh = await loadCriticalDashboardDataFast(2500, { workspaceMeta });
        shouldRunBackgroundRefresh = true;
        log('bootstrap.data.fast.done', { ok: Boolean(fresh), source: workspace?.source || 'unknown' });
      } catch (dataError) {
        warn('Fast cloud data bootstrap failed:', dataError);
        log('bootstrap.data.fast.timeout', { step: 'loadCriticalDashboardDataFast', error: dataError?.message || 'unknown' });
        shouldRunBackgroundRefresh = true;
      }

      const fastMeta = fresh?.__meta || null;
      if (!fresh || fastMeta?.partial) {
        if (fastMeta && fresh) delete fresh.__meta;
        setBootStateSafe('booting-data', {
          text: 'Syncing cloud data...',
          subtext: 'Keeping your workspace intact while Star Paper fetches your records.'
        });
        try {
          fresh = await loadAllDataWithRetry({
            timeoutMs: 12000,
            retries: 0,
            label: 'loadAllData[bootstrap-required]',
            workspaceMeta,
            skipProfileFetch: !profileResolved,
            profileTimeoutMs: 2500,
          });
          shouldRunBackgroundRefresh = true;
          log('bootstrap.data.full.done', {
            ok: Boolean(fresh),
            reason: fastMeta?.partial ? 'fast-partial' : 'fast-empty',
          });
        } catch (fullDataError) {
          warn('Full cloud data bootstrap failed:', fullDataError);
          log('bootstrap.data.full.failed', {
            error: fullDataError?.message || 'unknown',
            reason: fastMeta?.partial ? 'fast-partial' : 'fast-empty',
          });
          fresh = null;
        }
      }
      }

      if (fresh) {
        const meta = fresh.__meta || null;
        if (meta?.allCriticalTimedOut) {
          showBootErrorState('Cloud data is still syncing', 'Retry to reload your workspace data, or log out and sign in again.');
          return false;
        }
        if (meta) delete fresh.__meta;
        if (window._SP_syncFromCloud) {
          window._SP_syncFromCloud(fresh);
        }
      }

      if (!fresh) {
        if (!isBootTransitionCurrentSafe(flowId)) return false;
        showBootErrorState('Cloud data is still syncing', 'Retry to reload your workspace data, or log out and sign in again.');
        return false;
      }

      if (typeof window.loadUserData === 'function') {
        try {
          window.loadUserData({
            snapshot: fresh,
            source: 'bootstrap',
          });
          if (window.__spAppBooted) {
            renderAppDataViews('bootstrap-fast-data'); // FIXED: background data paints into the already-visible dashboard shell.
          }
        } catch (err) {
          warn('loadUserData failed:', err);
        }
      }

      if (typeof window.showApp === 'function' && !window.__spAppBooted) {
        if (!isBootTransitionCurrentSafe(flowId)) return false;
        window.showApp();
        window.__spDataLoaded = true;
        recordBootstrapTiming('bootstrap.uiReady', {
          ms: Math.round(nowMs() - bootstrapStartedAt),
        });
      }
      if (typeof window.restorePostBootUiState === 'function') {
        try {
          window.restorePostBootUiState();
        } catch (err) {
          warn('restorePostBootUiState failed:', err);
        }
      }
      routeAuthenticatedUserToDashboard('bootstrap');
      if (options.showWelcome && typeof window.showWelcomeMessage === 'function') {
        window.showWelcomeMessage();
      }

      if (typeof window.setAppShellBootContext === 'function') {
        window.setAppShellBootContext();
      } else {
        try {
          sessionStorage.setItem(BOOT_CONTEXT_STORAGE_KEY, APP_SHELL_BOOT_CONTEXT);
        } catch (_err) {}
      }
      window.__spBootContext = 'app-refresh';

      if (typeof window.clearLegacyCloudDataKeys === 'function') {
        window.clearLegacyCloudDataKeys();
      }
      clearLocalBootFallback();
      clearBootstrapSafetyTimer();
      commitBootTransitionSafe('appContainer', {
        flowId,
        requireAppReady: true,
        minDelayMs: 260,
      });

      if (shouldRunBackgroundRefresh) {
        setTimeout(() => {
          refreshCloudData({
            silent: true,
            force: true,
            minIntervalMs: 0,
            timeoutMs: 30000,
            reason: 'post-fast-bootstrap',
            workspaceMeta,
          }).catch((err) => warn('Post-bootstrap cloud refresh failed:', err));
        }, 300);
      }

      if (window.__spAppBooted) {
        if (typeof window.updateDashboard === 'function') window.updateDashboard();
        if (typeof window.renderBookings === 'function') window.renderBookings();
        if (typeof window.renderExpenses === 'function') window.renderExpenses();
        if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
        if (typeof window.renderArtists === 'function') window.renderArtists();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
        if (typeof window.renderTasks === 'function') window.renderTasks();
        if (typeof window.renderAudienceMetrics === 'function') window.renderAudienceMetrics();
      }
      bootstrapSucceeded = true;
    } catch (err) {
      // AUTH FIXPACK 2026-04-26 (Fix 1): never strand the user on a loader if any await throws.
      // Inner try/catches around individual awaits (profile, teams, data) absorb most failures,
      // but resolveActiveWorkspace, subscribeToCoreRealtime, showApp, and routeAuthenticatedUserToDashboard
      // are uncaught at the inner level — this outer catch is the safety net.
      warn('bootstrapFromSupabaseSession failed:', err);
      log('bootstrap.error', { error: err?.message || 'unknown' });
      if (typeof window.Sentry?.captureException === 'function') {
        try { window.Sentry.captureException(err, { tags: { source: 'bootstrap' } }); } catch (_e) {}
      }
      try {
        if (_session) {
          // We had a session; keep the loader/error surface, not an empty app shell.
          showBootErrorState('Cloud sync needs attention', 'We couldn\'t fetch your data. Tap Retry to reload, or Log out.');
        } else if (localStorage.getItem('sp_logged_out') === '1') {
          showLandingScreen({ flowId, reason: 'bootstrap-error-logged-out' });
        } else {
          showLoginScreen({ flowId, reason: 'bootstrap-error-no-session' });
        }
      } catch (recoveryErr) {
        warn('Bootstrap recovery UI failed:', recoveryErr);
      }
      // Swallow — user-visible recovery is the contract. Caller treats this as a non-fatal completion.
      return false;
    } finally {
      if (isBootTransitionCurrentSafe(flowId)) {
        clearBootstrapSafetyTimer();
        _refreshInFlight = false;
        window.__spCloudBootstrapPending = false;
      } else {
        log('bootstrap.finally.stale', { flowId });
      }
      _lastBootstrapOutcome = {
        flowId,
        userId: activeSession.user.id,
        ok: bootstrapSucceeded,
        at: nowMs(),
        ms: Math.round(nowMs() - bootstrapStartedAt),
      };
    }

    return true;
  }

  async function signInWithGoogle() {
    // If user explicitly logged out before, allow a fresh OAuth login.
    localStorage.removeItem('sp_logged_out');
    window.__spSuppressStoredSessionBootstrap = false;
    window.__spAuthRedirectInProgress = false;
    // FIXED: Google OAuth always shows a prominent loader before leaving/returning.
    const flowId = beginBootTransitionSafe('google-sign-in', 'signing-in', {
      text: 'Signing in...',
      subtext: 'Opening Google securely...'
    });
    try {
      sessionStorage.setItem(BOOT_CONTEXT_STORAGE_KEY, AUTH_RETURN_BOOT_CONTEXT);
    } catch (_err) {}
    if (typeof window.setAuthReturnBootContext === 'function') {
      window.setAuthReturnBootContext();
    }
    const redirectTo = getSafeRedirectUrl({
      requireHttpOrigin: true,
      fallbackToProduction: false,
    });
    if (!redirectTo) {
      try {
        sessionStorage.removeItem(BOOT_CONTEXT_STORAGE_KEY);
      } catch (_err) {}
      const err = new Error('Google sign-in requires http://localhost or your deployed https:// URL. file:// cannot receive OAuth redirects.');
      err.flowId = flowId;
      throw err;
    }
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      }
    });
    if (error) {
      try {
        sessionStorage.removeItem(BOOT_CONTEXT_STORAGE_KEY);
      } catch (_err) {}
      error.flowId = flowId;
      throw error;
    }
  }

  // Declarative action bridge used by data-action="signInWithGoogle".
  window.signInWithGoogle = async function signInWithGoogleAction() {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (typeof window.toastError === 'function') {
        window.toastError(err?.message || 'Google sign-in failed.');
      }
      showLoginScreen({ flowId: err?.flowId, reason: 'google-sign-in-failed' });
    }
  };

  async function signOut() {
    await db.auth.signOut();
    _session = null;
    _profile = null;
  }

  async function getSession() {
    const { data, error } = await db.auth.getSession();
    if (error) return null;
    _session = data.session;
    await syncRealtimeAuthToken(_session);
    return data.session;
  }

  async function getProfile() {
    if (!getOwnerId()) return null;
    const { data, error } = await db.from('profiles').select('*').eq('id', getOwnerId()).single();
    if (error) return null;
    _profile = data;
    return data;
  }

  async function updateProfile(updates, options = {}) {
    if (!getOwnerId()) return;
    const nextUpdates = { ...updates, updated_at: new Date().toISOString() };
    const { error } = await db.from('profiles')
      .update(nextUpdates)
      .eq('id', getOwnerId());
    if (error) {
      warn('Profile update error:', error);
      if (options.throwOnError) {
        throw error;
      }
      return null;
    }
    _profile = {
      ...(_profile || { id: getOwnerId() }),
      ...nextUpdates,
    };
    return _profile;
  }

  async function saveAccountProfile(payload = {}) {
    return dbSerial(async () => {
      const ownerId = getOwnerId();
      if (!ownerId) {
        throw new Error('No active cloud session. Please sign in again.');
      }

      const session = _session || await getSession();
      const authUser = session?.user || null;
      if (!authUser) {
        throw new Error('Your session is not ready yet. Please try again.');
      }

      const currentProfile = _profile || await getProfile() || {};
      const nextUsername = String(payload.username || currentProfile.username || '').trim();
      if (!nextUsername) {
        throw new Error('Username is required.');
      }

      const currentUsername = String(currentProfile.username || '').trim();
      if (nextUsername !== currentUsername) {
        const available = await isUsernameAvailable(nextUsername);
        if (available !== true) {
          if (available === false) {
            throw new Error('That username is already in use.');
          }
          throw new Error('Could not verify username availability. Please try again.');
        }
      }

      const currentEmail = String(authUser.email || currentProfile.email || '').trim();
      const requestedEmail = String(payload.email || currentEmail || '').trim();
      const requestedPassword = String(payload.password || '');
      const nextPhone = String(payload.phone || '').trim();
      const nextBio = String(payload.bio || '').trim();
      const nextAvatar = String(payload.avatar || '').trim();

      let updatedAuthUser = authUser;
      let emailConfirmationPending = false;
      let pendingEmail = '';

      const authUpdates = {};
      if (requestedEmail && requestedEmail !== currentEmail) {
        authUpdates.email = requestedEmail;
      }
      if (requestedPassword) {
        authUpdates.password = requestedPassword;
      }

      if (Object.keys(authUpdates).length) {
        const { data, error } = await db.auth.updateUser(authUpdates);
        throwIfSupabaseError('Account auth update', error);
        updatedAuthUser = data?.user || updatedAuthUser;
        pendingEmail = String(updatedAuthUser?.new_email || '').trim();
        emailConfirmationPending = Boolean(
          authUpdates.email &&
          pendingEmail &&
          pendingEmail !== String(updatedAuthUser?.email || '').trim()
        );
        if (_session?.user) {
          _session = {
            ..._session,
            user: updatedAuthUser
          };
        }
      }

      const effectiveEmail = String(updatedAuthUser?.email || currentEmail || '').trim();
      await updateProfile({
        username: nextUsername,
        email: effectiveEmail,
        phone: nextPhone,
        bio: nextBio,
        avatar: nextAvatar
      }, { throwOnError: true });

      const freshProfile = await getProfile() || {
        ...currentProfile,
        username: nextUsername,
        email: effectiveEmail,
        phone: nextPhone,
        bio: nextBio,
        avatar: nextAvatar
      };

      return {
        ok: true,
        profile: freshProfile,
        emailConfirmationPending,
        pendingEmail,
        message: emailConfirmationPending
          ? `Profile updated. Confirm ${pendingEmail || requestedEmail} to finish the email change.`
          : 'Profile updated.'
      };
    });
  }

  // Auth state listener
  db.auth.onAuthStateChange((event, session) => {
    window.__spInitialAuthEventSeen = true;
    const authEventFlowId = getBootTransitionIdSafe();
    if (window.__spAuthRedirectInProgress && !window.__spAppBooted) {
      log('Deferring auth state event until redirect handling completes', { event });
      return;
    }

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
          setTimeout(() => db.auth.signOut().catch(() => {}), 0);
        }
        return;
      }
    }
 

    if (!session?.user) {
      const bootContext = getStartupBootContext();
      const restoringAppRefresh = !window.__spAppBooted &&
        event !== 'SIGNED_OUT' &&
        bootContext === 'app-refresh' &&
        localStorage.getItem('sp_logged_out') !== '1';
      if (restoringAppRefresh) {
        const flowId = authEventFlowId || beginBootTransitionSafe(`auth-event:${event}:restore`, 'loading-session');
        deferAuthEventWork(`auth-event:${event}:restore`, async () => {
          const recovered = await bootstrapInitialSession({
            bootContext: 'app-refresh',
            loggedOutScreen: 'login',
            sessionTimeoutMs: 5000,
            flowId,
          });
          if (!isBootTransitionCurrentSafe(flowId)) return;
          if (!recovered) {
            showBootErrorState('Session restore needs attention', 'Retry to reconnect to Star Paper, or log out and sign in again.');
          }
        });
        return;
      }
      const coldStartAnonymous = !window.__spAppBooted &&
        event !== 'SIGNED_OUT' &&
        bootContext === 'cold-start';
      deferAuthEventWork(`auth-event:${event}:signed-out`, async () => {
        const signedOutState = await handleSignedOutSession({
          notify: !coldStartAnonymous && event === 'SIGNED_OUT' && window.__spAppBooted,
          reason: event === 'SIGNED_OUT' ? 'signed-out-event' : 'missing-session-event',
          event,
          confirm: !coldStartAnonymous && localStorage.getItem('sp_logged_out') !== '1',
          destination: coldStartAnonymous ? 'landing' : 'login',
          clearAuthArtifacts: coldStartAnonymous ? false : undefined,
          suppressDiagnostics: coldStartAnonymous,
          flowId: authEventFlowId,
        });
        if (signedOutState?.recovered && signedOutState.session?.user) {
          const recoveredFlowId = authEventFlowId || beginBootTransitionSafe(`auth-event:${event}:recovered`, 'loading-session');
          await runBootstrapTask(() => bootstrapFromSupabaseSession(signedOutState.session, {
            remember: true,
            showWelcome: false,
            flowId: recoveredFlowId,
          }));
        }
      });
      return;
    }

    _session = session;
    if (session?.user) {
      syncRealtimeAuthToken(session).catch((err) => warn('onAuthStateChange: realtime token sync failed:', err));
      if (_workspaceResolved && !_workspaceRequiresSelection) {
        subscribeToCoreRealtime();
      }
    }

    // Always keep _profile warm on any session event.
    if (session && !_profile && window.__spAppBooted) {
      deferAuthEventWork(`auth-event:${event}:profile-warm`, async () => {
        try {
          _profile = await ensureProfileRecord(session.user);
        } catch (err) {
          warn('onAuthStateChange: ensureProfileRecord failed (non-fatal):', err);
        }
        if (_profile?.preferred_currency) {
          _currency = _profile.preferred_currency;
          applyCurrency(_currency);
        }
      });
    } else if (session && !_profile) {
      // FIXED: cold auth events do not block the fast dashboard shell on profile I/O.
      deferAuthEventWork(`auth-event:${event}:profile-warm-cold`, async () => {
        try {
          const profile = await ensureProfileRecord(session.user);
          _profile = _profile || profile;
          if (_profile?.preferred_currency) {
            _currency = _profile.preferred_currency;
            applyCurrency(_currency);
          }
        } catch (err) {
          warn('onAuthStateChange: background profile warm failed:', err);
        }
      });
    }

    // Full bootstrap path: app not yet booted, not already in progress.
    const shouldBootstrap =
      Boolean(session) &&
      !window.__spSuppressStoredSessionBootstrap &&
      !window.__spAppBooted &&
      !_bootstrapping &&
      (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED');

    if (shouldBootstrap) {
      const flowId = authEventFlowId || beginBootTransitionSafe(`auth-event:${event}:bootstrap`, 'loading-session');
      scheduleLocalSessionRestoreFallback({ bootContext: getStartupBootContext(), flowId });
      deferAuthEventWork(`auth-event:${event}:bootstrap`, async () => {
        if (!isBootTransitionCurrentSafe(flowId) || window.__spAppBooted || _bootstrapping) return;
        await runBootstrapTask(() => bootstrapFromSupabaseSession(session, {
          remember: true,
          showWelcome: event === 'SIGNED_IN',
          flowId,
        }));
      });
      return;
    }

    // App is already booted (returning user with localStorage session) but a fresh
    // SIGNED_IN just fired — pull cloud data so the new-device scenario stays in sync.
    if (event === 'SIGNED_IN' && session && window.__spAppBooted && !_bootstrapping) {
      deferAuthEventWork(`auth-event:${event}:resync`, async () => {
        try {
          await resolveActiveWorkspace({ promptOnSelection: false });
          if (_workspaceRequiresSelection) {
            promptTeamSelectionIfNeeded(await getMyTeams());
            return;
          }
          subscribeToCoreRealtime();
          await reloadForResolvedWorkspace({
            timeoutMs: 8000,
            silent: true,
            forceShowApp: false,
            runMigration: false,
          });
        } catch (reSyncErr) {
          warn('onAuthStateChange re-sync failed (non-fatal):', reSyncErr);
        }
      });
    }
  });

  // ── TEAMS ─────────────────────────────────────────────────────────────────────
  async function createTeam(name) {
    const session = await ensureTeamActionSession();
    const ownerId = session?.user?.id || getOwnerId();
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

  async function refreshTeamContextFromCloud(options = {}) {
    if (!getOwnerId()) return [];
    try {
      const { data, error } = await db.rpc('get_my_team_context', {
        uid: getOwnerId(),
      });
      if (!error && Array.isArray(data)) {
        return cacheTeamContext(data.map(normalizeTeamContextRow), 'get_my_team_context')
          .map((team) => ({ ...team }));
      }
      if (error && !isMissingRpcError(error, 'get_my_team_context')) {
        warn('getMyTeams RPC error, falling back to table query:', error);
      }
    } catch (rpcErr) {
      warn('getMyTeams RPC failed, falling back to table query:', rpcErr);
    }
    let data = null;
    let error = null;
    try {
      ({ data, error } = await db.from('team_members')
        .select('role, permissions, teams(id, name, invite_code, owner_id)')
        .eq('user_id', getOwnerId()));
      if (error && /permissions/i.test(error.message || '')) {
        ({ data, error } = await db.from('team_members')
          .select('role, teams(id, name, invite_code, owner_id)')
          .eq('user_id', getOwnerId()));
      }
    } catch (err) {
      warn('getMyTeams table query failed:', err);
      return options.nullOnError ? null : [];
    }
    if (error) {
      warn('getMyTeams error:', error);
      return options.nullOnError ? null : [];
    }
    const teams = (data || []).map(row => ({
      ...(row.teams || {}),
      myRole: normalizeTeamRole(row.role),
      myRoleLabel: roleLabel(row.role),
      myPermissions: permissionsForRole(row.role, row.permissions),
    })).filter((team) => team.id);
    return cacheTeamContext(teams, 'team_members-fallback')
      .map((team) => ({ ...team }));
  }

  function refreshTeamContextInBackground() {
    if (_teamContextRefreshPromise) return _teamContextRefreshPromise;
    _teamContextRefreshPromise = refreshTeamContextFromCloud({ nullOnError: true })
      .catch((err) => {
        warn('Background team context refresh failed:', err);
        return null;
      })
      .finally(() => {
        _teamContextRefreshPromise = null;
      });
    return _teamContextRefreshPromise;
  }

  async function getMyTeams(options = {}) {
    if (!getOwnerId()) return [];
    const maxAgeMs = Object.prototype.hasOwnProperty.call(options, 'cacheMaxAgeMs')
      ? options.cacheMaxAgeMs
      : 5 * 60 * 1000;
    const canUseCache = options.forceRefresh !== true &&
      options.cache !== false &&
      hasCachedTeamContext(maxAgeMs);
    if (canUseCache) {
      const cached = getCachedTeamContext(maxAgeMs);
      if (options.backgroundRefresh !== false) {
        refreshTeamContextInBackground();
      }
      return cached;
    }
    return refreshTeamContextFromCloud(options);
  }

  async function joinTeamByCode(inviteCode) {
    const session = await ensureTeamActionSession();
    if (!session?.user) {
      throw new Error('Your session is still loading. Please try again in a moment.');
    }
    // Single RPC replaces SELECT teams + INSERT team_members — one lock acquisition,
    // one round-trip, atomic. Prevents the lock contention that caused the timeout.
    const { data, error } = await db.rpc('join_team_by_code', {
      p_invite_code: inviteCode.trim().toLowerCase(),
      p_user_id:     session.user.id,
    });
    if (error) throw new Error(error.message?.includes('Invalid invite code') ? 'Invalid invite code' : error.message);
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async function getTeamMembers(teamId) {
    if (!teamId) return [];
    try {
      const { data, error } = await db.rpc('get_team_members_context', {
        p_team_id: teamId,
      });
      if (!error && Array.isArray(data)) {
        return data.map(normalizeTeamMemberContextRow);
      }
      if (error && !isMissingRpcError(error, 'get_team_members_context')) {
        warn('getTeamMembers RPC error, falling back to table query:', error);
      }
    } catch (rpcErr) {
      warn('getTeamMembers RPC failed, falling back to table query:', rpcErr);
    }
    let { data, error } = await db.from('team_members')
      .select('user_id, role, permissions, joined_at, profiles(id, username, email, avatar)')
      .eq('team_id', teamId);
    if (error && /permissions/i.test(error.message || '')) {
      ({ data, error } = await db.from('team_members')
        .select('user_id, role, joined_at, profiles(id, username, email, avatar)')
        .eq('team_id', teamId));
    }
    if (error) { warn('getTeamMembers error:', error); return []; }
    return (data || []).map(normalizeTeamMember);
  }

  async function switchTeam(teamId) {
    const normalizedTeamId = normalizeTeamId(teamId);
    let teams = [];
    try {
      teams = await getMyTeams();
    } catch (err) {
      warn('switchTeam role refresh failed:', err);
    }
    const active = normalizedTeamId ? teams.find((team) => team.id === normalizedTeamId) : null;
    await persistActiveTeam(normalizedTeamId, {
      persistRemote: true,
      role: active?.myRole || null,
      permissions: active?.myPermissions || null,
    });
    unsubscribeFromTeamNotifications();
    subscribeToCoreRealtime();
    broadcastLocalSync('workspace');

    const modal = document.getElementById('spTeamModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }

    await reloadForResolvedWorkspace({
      forceShowApp: true,
      runMigration: false,
    });
  }

  async function leaveTeam(teamId) {
    await db.from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', getOwnerId());
    if (_activeTeamId === teamId) {
      _workspaceResolved = false;
      const teams = await getMyTeams();
      const workspace = await resolveActiveWorkspace({
        teams,
        promptOnSelection: true,
      });
      if (workspace?.needsSelection) {
        return;
      }
      unsubscribeFromTeamNotifications();
      subscribeToCoreRealtime();
      await reloadForResolvedWorkspace({
        forceShowApp: true,
        runMigration: false,
        silent: true,
      });
    }
  }

  async function updateTeamMemberRole(teamId, userId, role) {
    if (!teamId || !userId || !role) return;
    const nextRole = normalizeTeamRole(role);
    const nextPermissions = permissionsForRole(nextRole);
    try {
      let { error } = await db.from('team_members')
        .update({ role: nextRole, permissions: nextPermissions })
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error && /permissions/i.test(error.message || '')) {
        ({ error } = await db.from('team_members')
          .update({ role: nextRole })
          .eq('team_id', teamId)
          .eq('user_id', userId));
      }
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
    await persistActiveTeam(teamId, { persistRemote: true, role: 'owner', permissions: permissionsForRole('owner') });
    if (personalData) {
      await saveAllData(personalData);
    }
    await reloadForResolvedWorkspace({ forceShowApp: true, runMigration: false });
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
  function syncCurrencyPreferenceUI() {
    const curr = SP_CURRENCIES[_currency] || SP_CURRENCIES.UGX;
    const badge = document.getElementById('spCurrencyBadge');
    if (badge) badge.textContent = curr.symbol;

    const name = document.getElementById('spCurrencyName');
    if (name) name.textContent = `${curr.name} (${_currency})`;

    const btn = document.getElementById('spSettingsCurrencyBtn');
    if (btn) btn.title = `Switch currency (${curr.name})`;
  }

  function applyCurrency(code) {
    const curr = SP_CURRENCIES[code];
    if (!curr) return;
    _currency = code;
    // FIXED: currency is kept in memory/profile sync only; no app-owned localStorage preference.

    syncCurrencyPreferenceUI();

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
  async function reloadForResolvedWorkspace(options = {}) {
    if (!(await ensureWorkspaceReady({ promptOnSelection: options.promptOnSelection !== false }))) {
      return null;
    }

    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
    let fresh = null;
    const workspaceMeta = getActiveWorkspaceMeta(options.label || 'workspace-reload');

    window.__spCloudBootstrapPending = true;
    _refreshInFlight = true;
    try {
      fresh = await loadAllDataWithRetry({
        timeoutMs,
        label: options.label || 'loadAllData[workspace]',
        retries: 1,
        workspaceMeta,
      });
    } catch (err) {
      warn('reloadForResolvedWorkspace failed:', err);
      if (!options.silent) {
        toastSafe('Warn', 'Cloud data refresh failed. Check your connection and try again.');
      }
    } finally {
      _refreshInFlight = false;
      window.__spCloudBootstrapPending = false;
    }

    const meta = fresh?.__meta || null;
    if (fresh && meta) delete fresh.__meta;

    if (!fresh && !window.__spAppBooted) {
      showBootErrorState('Workspace refresh failed', 'Retry to reconnect to the cloud and reload your latest data.');
      return null;
    }

    if (fresh && window._SP_syncFromCloud) {
      window._SP_syncFromCloud(fresh);
    }

    if (typeof window.loadUserData === 'function') {
      window.loadUserData({
        snapshot: fresh,
      });
    }

    if (typeof window.showApp === 'function' && !window.__spAppBooted && options.forceShowApp !== false) {
      window.showApp();
      log('workspace.uiReady');
    }
    if (typeof window.restorePostBootUiState === 'function') {
      try {
        window.restorePostBootUiState();
      } catch (err) {
        warn('restorePostBootUiState failed:', err);
      }
    }

    if (window.__spAppBooted) {
      if (typeof window.updateDashboard === 'function') window.updateDashboard();
      if (typeof window.renderBookings === 'function') window.renderBookings();
      if (typeof window.renderExpenses === 'function') window.renderExpenses();
      if (typeof window.renderOtherIncome === 'function') window.renderOtherIncome();
      if (typeof window.renderArtists === 'function') window.renderArtists();
      if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
      if (typeof window.renderTasks === 'function') window.renderTasks();
      if (typeof window.renderAudienceMetrics === 'function') window.renderAudienceMetrics();
    }

    if (options.showWelcome && typeof window.showWelcomeMessage === 'function') {
      window.showWelcomeMessage();
    }

    return fresh;
  }

  async function reloadAppData() {
    return reloadForResolvedWorkspace({
      forceShowApp: false,
      runMigration: false,
      silent: true,
    });
  }

  // ── TEAM UI ─────────────────────────────────────────────────────────────────
  function legacyTeamPanelMarkupRemoved(teams, activeTeamId, members) {
    const membersHTML = members.map(m => `
      <div class="sp-team-member">
        <div class="sp-team-member-avatar">${(m.username || m.email || '?')[0].toUpperCase()}</div>
        <div class="sp-team-member-info">
          <div class="sp-team-member-name">${m.username || m.email}</div>
          <div class="sp-team-member-role">${m.role}</div>
        </div>
      </div>
    `).join('');

    const personalWorkspaceHTML = `
      <div class="sp-team-item ${!activeTeamId ? 'sp-team-item--active' : ''}"
           onclick="window.SP.switchTeam('')">
        <div class="sp-team-name">Personal Workspace</div>
        <div class="sp-team-role">solo</div>
      </div>
    `;

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
          <button class="sp-modal-close" onclick="document.getElementById('spTeamModal').style.display='none'"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>

        <div class="sp-team-section">
          <h4>My Teams</h4>
          ${personalWorkspaceHTML}
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

  function buildTeamPermissionChips(permissions = {}) {
    const chips = [];
    if (permissions.read) chips.push('Read');
    if (permissions.edit) chips.push('Edit');
    if (permissions.finance) chips.push('Finance');
    if (permissions.reports) chips.push('Reports');
    if (permissions.admin) chips.push('Admin');
    return `<div class="sp-team-permissions">${chips.map(chip => `<span>${chip}</span>`).join('')}</div>`;
  }

  function buildTeamModalStateHTML(title, message, actions = '') {
    return `
      <div class="sp-team-panel">
        <div class="sp-team-panel-header">
          <h3>Team Workspace</h3>
          <button class="sp-modal-close" onclick="window.SP.closeTeamModal()"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>
        <div class="sp-team-empty-state">
          <div class="sp-team-empty-title">${escapeHTML(title)}</div>
          <p>${escapeHTML(message)}</p>
          ${actions}
        </div>
      </div>
    `;
  }

  function buildTeamPanelHTML(teams, activeTeamId, members, options = {}) {
    teams = Array.isArray(teams) ? teams : [];
    members = Array.isArray(members) ? members : [];
    const activeTeam = teams.find(t => t.id === activeTeamId);
    const activeAccess = activeTeam?.myPermissions || getActiveTeamPermissions();
    const isAdmin = Boolean(activeTeam && (activeTeam.owner_id === getOwnerId() || activeAccess.admin));
    const statusText = activeTeam
      ? `Logged in as ${activeTeam.myRoleLabel || roleLabel(activeTeam.myRole)} for ${activeTeam.name}`
      : teams.length
        ? 'Logged in on your personal workspace'
        : 'Logged in with no team yet';
    const personalWorkspaceHTML = `
      <div class="sp-team-item ${!activeTeamId ? 'sp-team-item--active' : ''}"
           onclick="window.SP.switchTeam('')">
        <div class="sp-team-name">Personal Workspace</div>
        <div class="sp-team-role">solo</div>
      </div>
    `;

    const inlineStatusHTML = options.statusMessage
      ? `<div class="sp-team-status-card sp-team-inline-status">
          <div class="sp-team-status-label">${escapeHTML(options.statusLabel || 'Team status')}</div>
          <div class="sp-team-status-title">${escapeHTML(options.statusMessage)}</div>
          ${options.statusDetail ? `<p class="sp-muted">${escapeHTML(options.statusDetail)}</p>` : ''}
        </div>`
      : '';

    const membersHTML = options.membersLoading
      ? '<p class="sp-muted">Loading members...</p>'
      : options.membersFailed
        ? `<div class="sp-team-empty-state">
            <div class="sp-team-empty-title">Members are still loading</div>
            <p>Team switching, creating, and joining still work. Retry member loading when your connection settles.</p>
            <div class="sp-team-actions">
              <button class="action-btn" onclick="window.SP.showTeamModal()">Retry</button>
            </div>
          </div>`
        : members.length ? members.map(m => {
      const displayName = m.username || m.email || 'Member';
      const isSelf = m.userId && m.userId === getOwnerId();
      const canManageMember = isAdmin && !isSelf && m.role !== 'owner';
      const roleControl = canManageMember
        ? `
            <select class="sp-team-role-select" onchange="window.SP.updateTeamMemberRole('${activeTeamId}','${m.userId}', this.value)">
              ${SP_TEAM_ROLE_ORDER.map(role => `
                <option value="${role}" ${m.role === role ? 'selected' : ''}>${roleLabel(role)}</option>
              `).join('')}
            </select>
          `
        : `<div class="sp-team-member-role">${m.roleLabel || roleLabel(m.role)}</div>`;
      const removeButton = canManageMember
        ? `<button class="action-btn action-btn--danger sp-team-remove-btn" onclick="window.SP.removeTeamMember('${activeTeamId}','${m.userId}')">Remove</button>`
        : '';
      return `
        <div class="sp-team-member">
          <div class="sp-team-member-avatar">${escapeHTML(displayName[0].toUpperCase())}</div>
          <div class="sp-team-member-info">
            <div class="sp-team-member-name">${escapeHTML(displayName)} ${isSelf ? '<span class="sp-team-self">(you)</span>' : ''}</div>
            ${roleControl}
            ${buildTeamPermissionChips(m.permissions)}
          </div>
          ${removeButton}
        </div>
      `;
    }).join('') : '<p class="sp-muted">No members yet</p>';

    const teamsHTML = teams.map(t => `
      <div class="sp-team-item ${t.id === activeTeamId ? 'sp-team-item--active' : ''}"
           onclick="window.SP.switchTeam('${t.id}')">
        <div>
          <div class="sp-team-name">${escapeHTML(t.name || 'Team')}</div>
          ${t.id === activeTeamId ? buildTeamPermissionChips(t.myPermissions) : ''}
        </div>
        <div class="sp-team-role">${escapeHTML(t.myRoleLabel || roleLabel(t.myRole))}</div>
      </div>
    `).join('');

    return `
      <div class="sp-team-panel">
        <div class="sp-team-panel-header">
          <h3>Team Workspace</h3>
          <button class="sp-modal-close" onclick="window.SP.closeTeamModal()"><i class="ph ph-x" aria-hidden="true"></i></button>
        </div>

        <div class="sp-team-status-card">
          <div class="sp-team-status-label">Current profile</div>
          <div class="sp-team-status-title">${escapeHTML(statusText)}</div>
          ${activeTeam ? buildTeamPermissionChips(activeAccess) : '<p class="sp-muted">Personal data stays private until you switch into a team.</p>'}
        </div>

        ${inlineStatusHTML}

        <div class="sp-team-section">
          <h4>My Teams</h4>
          ${personalWorkspaceHTML}
          ${teamsHTML || '<p class="sp-muted">No teams yet</p>'}
          <div class="sp-team-actions">
            <button class="action-btn" onclick="window.SP.showCreateTeamForm()">+ Create Team</button>
            <button class="action-btn" onclick="window.SP.showJoinTeamForm()"><i class="ph ph-link" aria-hidden="true"></i> Join by Code</button>
          </div>
        </div>

        ${activeTeamId ? `
        <div class="sp-team-section">
          <h4>Team Members</h4>
          <div id="spTeamMembers">${membersHTML}</div>
          <div class="sp-team-invite-code">
            <label>Invite Code</label>
            <div class="sp-team-code-row">
              <code id="spTeamInviteCode">${activeTeam?.invite_code || '-'}</code>
              ${isAdmin ? '<button class="action-btn" onclick="window.SP.copyInviteCode()">Copy</button>' : ''}
            </div>
            <p class="sp-muted">${isAdmin ? 'Share this code so others can join as read-only members.' : 'Only admins can share invite codes.'}</p>
          </div>
        </div>
        <div class="sp-team-section">
          <h4>Team Chat</h4>
          <div id="spTeamChatMessages" class="sp-chat-messages">${options.chatLoading ? '<p class="sp-muted">Loading chat...</p>' : ''}</div>
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

  function closeTeamModal() {
    const modal = document.getElementById('spTeamModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    unsubscribeFromChat();
  }

  function showLoginPrompt() {
    closeTeamModal();
    showLoginScreen({ reason: 'team-login-prompt' });
  }

  async function legacyTeamModalRemoved() {
    let modal = document.getElementById('spTeamModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'spTeamModal';
      modal.className = 'sp-admin-modal';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="sp-modal-backdrop" onclick="window.SP.closeTeamModal()"></div>
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
    const content = document.getElementById('spTeamPanelContent');
    if (content) {
      content.innerHTML = buildTeamModalStateHTML('Checking your session', 'One moment while Star Paper confirms your signed-in account.');
    }

    const session = getOwnerId()
      ? (_session || await ensureTeamActionSession())
      : await ensureTeamActionSession();

    if (!session?.user && !getOwnerId()) {
      if (content) {
        content.innerHTML = buildTeamModalStateHTML(
          'Sign in required',
          'You need an active account session before creating or joining a team.',
          '<div class="sp-team-actions"><button class="action-btn" onclick="window.SP.showLoginPrompt()">Log in</button></div>'
        );
      }
      return;
    }

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
      const teams   = [];
      const active = teams.find(t => t.id === _activeTeamId);
      setActiveTeamRole(active?.myRole || null, active?.myPermissions || null);
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
            container.insertAdjacentHTML('beforeend', buildMessageHTML(newMsg));
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
            <button class="sp-modal-close" onclick="document.getElementById('spTeamModal').style.display='none'"><i class="ph ph-x" aria-hidden="true"></i></button>
          </div>
          <p style="color:#ef4444;padding:16px 0;">
            ${isTimeout
              ? 'Team data is still loading. You can retry, create a team, or join by code.'
              : 'Failed to load team data. Check your connection and try again.'}
          </p>
        `;
      }
    }
  }

  showTeamModal = async function showTeamModal() {
    let modal = document.getElementById('spTeamModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'spTeamModal';
      modal.className = 'sp-admin-modal';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="sp-modal-backdrop" onclick="window.SP.closeTeamModal()"></div>
        <div class="sp-modal-box" style="max-width:560px;padding:0;">
          <div id="spTeamPanelContent" style="padding:24px;">
            <div style="text-align:center;padding:24px;opacity:0.6;">Loading...</div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const content = document.getElementById('spTeamPanelContent');
    if (content) {
      content.innerHTML = buildTeamModalStateHTML(
        'Checking your session',
        'One moment while Star Paper confirms your signed-in account.'
      );
    }

    let session = null;
    try {
      session = getOwnerId()
        ? (_session || await withTimeout(() => ensureTeamActionSession(), 7000, 'ensureTeamActionSession'))
        : await withTimeout(() => ensureTeamActionSession(), 7000, 'ensureTeamActionSession');
    } catch (err) {
      warn('Team session restore delayed:', err);
    }

    const ownerId = session?.user?.id || getOwnerId();
    if (!ownerId) {
      if (content) {
        content.innerHTML = buildTeamModalStateHTML(
          'Sign in required',
          'You need an active account session before creating or joining a team.',
          '<div class="sp-team-actions"><button class="action-btn" onclick="window.SP.showLoginPrompt()">Log in</button></div>'
        );
      }
      return;
    }

    if (session?.user) {
      _session = session;
      syncRealtimeAuthToken(session).catch((err) => warn('Team modal auth sync failed:', err));
    }

    let teams = getCachedTeamContext(Infinity);
    const renderTeamPanel = (nextTeams, members = [], panelOptions = {}) => {
      if (!content) return;
      const hasVisibleActiveTeam = Boolean(
        _activeTeamId && Array.isArray(nextTeams) && nextTeams.some((team) => team.id === _activeTeamId)
      );
      content.innerHTML = buildTeamPanelHTML(nextTeams, hasVisibleActiveTeam ? _activeTeamId : null, members, panelOptions);
    };

    renderTeamPanel(teams, [], {
      statusLabel: 'Signed in',
      statusMessage: hasCachedTeamContext(Infinity) ? 'Refreshing team list...' : 'Loading your team list...',
      statusDetail: 'Create Team and Join by Code are ready even if team data is slow.',
      membersLoading: Boolean(_activeTeamId && teams.some((team) => team.id === _activeTeamId)),
      chatLoading: Boolean(_activeTeamId && teams.some((team) => team.id === _activeTeamId)),
    });

    try {
      const refreshedTeams = await withTimeout(
        () => getMyTeams({ forceRefresh: true, backgroundRefresh: false }),
        5000,
        'getMyTeams'
      );
      if (Array.isArray(refreshedTeams)) {
        teams = refreshedTeams;
      }
    } catch (err) {
      warn('showTeamModal team list load delayed:', err);
      const schemaHint = err?.name === 'TimeoutError'
        ? 'If this repeats, apply the latest schema.sql RPC helpers in Supabase, then retry.'
        : 'Check your connection, then retry. Existing team actions remain available.';
      renderTeamPanel(teams, [], {
        statusLabel: 'Team list delayed',
        statusMessage: teams.length
          ? 'Using cached team access while Star Paper refreshes team data.'
          : 'Team data is still loading. Personal Workspace, Create Team, and Join by Code remain available.',
        statusDetail: schemaHint,
      });
    }

    const active = teams.find(t => t.id === _activeTeamId);
    setActiveTeamRole(active?.myRole || null, active?.myPermissions || null);
    const activeTeamVisible = Boolean(_activeTeamId && active);

    renderTeamPanel(teams, [], {
      membersLoading: activeTeamVisible,
      chatLoading: activeTeamVisible,
      statusMessage: teams.length ? '' : 'Create Team and Join by Code are ready.',
    });

    if (!activeTeamVisible) return;

    let members = [];
    let membersFailed = false;
    try {
      members = await withTimeout(() => getTeamMembers(_activeTeamId), 5000, 'getTeamMembers');
    } catch (err) {
      membersFailed = true;
      warn('showTeamModal members load delayed:', err);
    }

    renderTeamPanel(teams, members, {
      membersFailed,
      chatLoading: true,
      statusMessage: membersFailed
        ? 'Member details are still loading, but workspace switching and invite actions are available.'
        : '',
    });

    try {
      const msgs = await withTimeout(() => loadMessages(_activeTeamId), 5000, 'loadMessages');
      renderChatMessages(msgs);
      subscribeToTeamChat(_activeTeamId, (newMsg) => {
        const container = document.getElementById('spTeamChatMessages');
        if (container) {
          container.insertAdjacentHTML('beforeend', buildMessageHTML(newMsg));
          container.scrollTop = container.scrollHeight;
        }
      });
    } catch (err) {
      warn('showTeamModal chat load delayed:', err);
      const chatContainer = document.getElementById('spTeamChatMessages');
      if (chatContainer) {
        chatContainer.innerHTML = `
          <div class="sp-team-empty-state">
            <div class="sp-team-empty-title">Chat is still loading</div>
            <p>Team workspace actions are ready. Retry the modal if chat does not appear.</p>
            <div class="sp-team-actions">
              <button class="action-btn" onclick="window.SP.showTeamModal()">Retry</button>
            </div>
          </div>
        `;
      }
    }
  };

  function buildMessageHTML(msg) {
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isOwn = msg.user_id === getOwnerId();
    return `
      <div class="sp-chat-message ${isOwn ? 'sp-chat-message--own' : ''}">
        <div class="sp-chat-message-header">
          <span class="sp-chat-username">${escapeHTML(msg.username)}</span>
          <span class="sp-chat-time">${time}</span>
        </div>
        <div class="sp-chat-bubble">${escapeHTML(msg.content)}</div>
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
    const copyPersonalData = confirm('Copy your current personal workspace data into this team?\n\nOK = copy personal data into the team.\nCancel = start this team empty.');
    try {
      // Await createTeam fully — the RPC lock must be released before showTeamModal
      // fires getMyTeams(), otherwise two lock acquisitions overlap and race.
      const team = await createTeam(name.trim());
      if (copyPersonalData) {
        toastSafe('Success', `Team "${escapeHTML(team.name)}" created. Copying your personal data...`);
        await migratePersonalDataToTeam(team.id);
      } else {
        toastSafe('Success', `Team "${escapeHTML(team.name)}" created. Starting empty.`);
        await persistActiveTeam(team.id, {
          persistRemote: true,
          role: 'owner',
          permissions: permissionsForRole('owner'),
        });
        await reloadForResolvedWorkspace({ forceShowApp: true, runMigration: false });
      }
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
      toastSafe('Success', `Joined team "${escapeHTML(team.name)}"!`);
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
    syncCurrencyPreferenceUI();
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
      btn.className = 'sp-team-sidebar-btn';
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
          showLoginScreen({ flowId: err?.flowId, reason: 'google-provider-disabled' });
          return;
        }
        if (typeof window.toastError === 'function') {
          window.toastError(err?.message || 'Google sign-in failed.');
        }
        showLoginScreen({ flowId: err?.flowId, reason: 'google-sign-in-failed' });
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
      const flowId = beginBootTransitionSafe('password-sign-in', 'signing-in');

      try {
        window.__spSuppressStoredSessionBootstrap = false;
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
        if (!data?.session?.user) {
          throw new Error('Could not initialise session.');
        }
        // bootstrapFromSupabaseSession handles showApp + showWelcomeMessage internally.
        // Do NOT call them again here — that causes a double-render.
        const booted = await runBootstrapTask(() => bootstrapFromSupabaseSession(data?.session, {
          usernameHint: nameOrEmail,
          remember: Boolean(document.getElementById('rememberMe')?.checked),
          showWelcome: true,
          flowId,
        }));
        if (!booted) {
          if (!_session) showLoginScreen({ flowId, reason: 'password-sign-in-no-session' });
          return;
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
            showLoginScreen({ flowId, reason: 'password-sign-in-fallback-disabled' });
            return;
          }
          warn('Supabase login unavailable. Falling back to local auth.', err);
          if (typeof window.toastWarn === 'function') {
            window.toastWarn('Cloud login unavailable. Using local login on this device.');
          }
          commitBootTransitionSafe('loginScreen', { flowId, minDelayMs: 120 });
          return _origLogin();
        }
        let msg = 'Invalid credentials. Please try again.';
        if (errMsg.includes('email not confirmed')) msg = 'Please check your email to confirm your account first.';
        if (errMsg.includes('invalid login credentials')) msg = 'Incorrect email or password.';
        if (errMsg.includes('could not initialise session')) {
          msg = 'Sign-in succeeded, but your cloud data could not load. Use Retry or log out.';
        }
        if (typeof window.toastError === 'function') window.toastError(msg);
        showLoginScreen({ flowId, reason: 'password-sign-in-failed' });
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
        window.__spSuppressStoredSessionBootstrap = false;
        const available = await isUsernameAvailable(name);
        if (available === false) {
          if (typeof window.toastError === 'function') {
            window.toastError('That username is already taken. Please choose another.');
          }
          return;
        }
        const result = await signUp(name, email, pw, phone);
        if (result?.session) {
          const flowId = beginBootTransitionSafe('signup-session', 'signing-in');
          const booted = await runBootstrapTask(() => bootstrapFromSupabaseSession(result.session, {
            usernameHint: name,
            remember: true,
            showWelcome: true,
            flowId,
          }));
          if (!booted) {
            return;
          }
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
      const flowId = beginBootTransitionSafe('logout', 'signing-out');
      try {
        document.getElementById('sidebar')?.classList.remove('active');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
        document.body?.classList?.remove('sidebar-open');
        document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
      } catch (_err) {}

      // FIXED: flush unsaved work through the cloud path before clearing the session.
      // AUTH FIXPACK 2 2026-04-27 (Fix 9): bounded saveUserData to 1.2s. If the
      // cloud is hung, the user gets logged out anyway — the retry queue
      // (sp_retry_queue) preserves any in-flight payload across logout boundaries.
      if (typeof window.saveUserData === 'function') {
        try {
          await withTimeout(() => window.saveUserData(), 1200, 'logout-saveUserData');
        } catch (_err) {
          warn('Logout pre-save timed out or failed; continuing with logout.');
        }
      }

      // 2a. Tell the SDK to sign out (local scope so we don't wait on the network)
      //     so its in-memory state matches what we are about to do to localStorage.
      try {
        if (db && db.auth && typeof db.auth.signOut === 'function') {
          await withTimeout(() => db.auth.signOut({ scope: 'local' }), 800, 'logout-signOut');
        }
      } catch (_err) {
        // Best-effort: even if signOut hangs/fails, the artifact wipe below is the
        // authoritative step that prevents re-bootstrap.
      }

      // 2b. CRITICAL — Directly delete the Supabase SDK's own auth token from
      //    localStorage. The SDK stores it under a well-known key. This is
      //    synchronous and instant. Without this step, the SDK finds its own
      //    token on the next page load and fires onAuthStateChange('INITIAL_SESSION'),
      //    which re-boots the app even though the user logged out.
      clearSupabaseAuthArtifacts({ clearAppSession: false });

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
      window.__spSuppressStoredSessionBootstrap = false;
      window.__spAuthRedirectInProgress = false;
      _session = null;
      _profile = null;
      _retryQueue = [];
      persistRetryQueue();
      if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
      resetWorkspaceState();

      // 6. Show landing page immediately — user doesn't wait for any network call.
      if (typeof window.clearLegacyCloudDataKeys === 'function') {
        window.clearLegacyCloudDataKeys();
      }
      try {
        if (typeof window.clearAppShellBootContext === 'function') window.clearAppShellBootContext();
        if (window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      } catch (_err) {}
      showLandingScreen({ keepLoader: true, flowId, reason: 'logout-complete', minDelayMs: 350 }); // FIXED: mobile/desktop logout returns to landing with Supabase artifacts cleared.
      if (typeof window.toastInfo === 'function') window.toastInfo('Logged out');

      // AUTH FIXPACK 2 2026-04-27 (Fix 10): more lenient integrity check.
      // 350ms (was 200ms) gives CSS transitions time to settle. Only reload if the
      // landing screen is genuinely display:none — visibility transitions are too
      // jittery to rely on. Guard against double-reload via __spLogoutReloadAttempted.
      setTimeout(() => {
        if (window.__spLogoutReloadAttempted) return;
        try {
          const landing = document.getElementById('landingScreen');
          if (!landing) return; // No landing element → nothing to verify; let the user navigate.
          const cs = getComputedStyle(landing);
          if (cs.display === 'none') {
            window.__spLogoutReloadAttempted = true;
            warn('Logout integrity: landing is display:none after logout — forcing reload.');
            window.location.reload();
          }
        } catch (verifyErr) {
          // Critical: do NOT reload on a verification failure (would create reload loops
          // if any DOM API throws). Just log and continue.
          warn('Logout integrity check threw — leaving as-is to avoid reload loop.', verifyErr);
        }
      }, 350);

      // 7. Revoke the server-side token in the background (best-effort).
      //    Even if this fails the user is fully logged out locally (steps 2–5 above).
      signOut().catch(() => {});
    };

    // ── PATCH saveUserData TO CLOUD-FIRST SYNC ──────────────────────────────────
    const _origSaveUserData = window.saveUserData;
    window.saveUserData = async function supabaseSaveUserData() {
      // FIXED: no localStorage core-data fallback; saves wait for the cloud sync promise.
      let result = null;
      if (typeof _origSaveUserData === 'function') {
        result = await _origSaveUserData();
      }
      if (result) {
        return result;
      }
      if (window.__spLastCloudSyncPromise && typeof window.__spLastCloudSyncPromise.then === 'function') {
        return await window.__spLastCloudSyncPromise;
      }
      return { cloudSynced: false, skipped: true, queued: false };
    };

    log('App auth patched with Supabase');
  }

  // ── SYNC BRIDGE: allows supabase.js to inject data into app's closure ─────────
  // app.js registers the full _SP_syncFromCloud function in loadUserData() which
  // updates both closure-scoped vars AND window globals. We only initialise the
  // data slot here; the real bridge is set by app.js.
  function setupSyncBridge() {
    window._SP_cloudData = null;
    // Lightweight fallback — only used if bootstrapFromSupabaseSession fires
    // before app.js's loadUserData() has registered the full bridge.
    if (typeof window._SP_syncFromCloud !== 'function') {
      window._SP_syncFromCloud = function(data) {
        window._SP_cloudData = data;
        if (data.bookings)    window.bookings    = data.bookings;
        if (data.expenses)    window.expenses    = data.expenses;
        if (data.otherIncome) window.otherIncome = data.otherIncome;
        if (data.artists)     window.artists     = data.artists;
      };
    }
  }

  // ── INIT ────────────────────────────────────────────────────────────────────────────
  function bindAutoSync() {
    if (window.__spAutoSyncBound) return;
    window.__spAutoSyncBound = true;

    window.addEventListener('online', () => {
      if (!getOwnerId()) return;
      updateSyncIndicator('syncing');
      if (_retryQueue.length > 0) {
        processRetryQueue();
      } else if (typeof window.SP_collectAllData === 'function') {
        saveAllData(window.SP_collectAllData()).catch((err) => {
          warn('Online sync failed:', err);
          updateSyncIndicator('failed');
        });
      }
      refreshCloudData({ silent: true, force: true, minIntervalMs: 0, reason: 'online' }).catch((err) => {
        warn('Online refresh failed:', err);
      });
    });

    window.addEventListener('offline', () => {
      updateSyncIndicator('offline');
    });

    const triggerCloudRefresh = (reason) => {
      if (!getOwnerId()) return;
      refreshSessionIfNeeded({ minTtlSeconds: 90 })
        .catch((err) => warn('Session refresh before auto-sync failed:', err))
        .finally(() => {
          refreshCloudData({ silent: true, minIntervalMs: 1500, reason }).catch((err) => {
            warn('Auto-sync refresh failed:', err);
          });
        });
    };

    window.addEventListener('focus', () => triggerCloudRefresh('focus'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        triggerCloudRefresh('visibility');
      }
    });
    if (!window.__spCloudRefreshInterval) {
      window.__spCloudRefreshInterval = setInterval(() => {
        triggerCloudRefresh('interval');
      }, 10000);
    }
  }

  async function bootstrapInitialSession(options = {}) {
    const bootContext = options.bootContext || getStartupBootContext();
    const flowId = options.flowId || getBootTransitionIdSafe();
    if (_bootstrapPromise) {
      try {
        return await withTimeout(
          _bootstrapPromise,
          typeof options.inFlightTimeoutMs === 'number' ? options.inFlightTimeoutMs : 15000,
          'bootstrapInitialSession[inflight]'
        );
      } catch (err) {
        warn('Waiting for in-flight bootstrap failed:', err);
        showStalledBootError('Session restore stalled', 'Retry to reconnect to Star Paper, or log out and sign in again.', 'bootstrap-inflight-timeout');
        return false;
      }
    }
    if (window.__spAuthRedirectInProgress) return false;
    const quietIfNoSession = options.quietIfNoSession === true;
    const loggedOutScreen = options.loggedOutScreen || 'login';
    if (!quietIfNoSession) {
      const nextFlowId = flowId || beginBootTransitionSafe('initial-session', 'loading-session');
      if (flowId) setBootStateSafe('loading-session');
      options.flowId = nextFlowId;
      scheduleLocalSessionRestoreFallback({ bootContext, flowId: nextFlowId });
    }
    const activeFlowId = options.flowId || flowId;
    let session = null;
    try {
      session = await withTimeout(
        () => getSession(),
        typeof options.sessionTimeoutMs === 'number' ? options.sessionTimeoutMs : 3000, // FIXED: auth restore + shell route stays under 5s.
        'getSession[initial]'
      );
    } catch (err) {
      warn('Initial session restore failed:', err);
      if (quietIfNoSession && loggedOutScreen === 'landing') {
        showLandingScreen({ flowId: activeFlowId, reason: 'initial-session-timeout' });
      } else {
        showBootErrorState('Session restore took too long', 'Retry to reconnect to Star Paper, or log out and sign in again.');
      }
      return false;
    }
    if (!session?.user) {
      clearLocalBootFallback();
      if (bootContext === 'app-refresh' && hasStoredSupabaseSessionHint()) {
        showBootErrorState('Session restore needs attention', 'Retry to reconnect to Star Paper, or log out and sign in again.');
      } else if (loggedOutScreen === 'landing') {
        showLandingScreen({ flowId: activeFlowId, reason: 'initial-session-anonymous' });
      } else {
        showLoginScreen({ flowId: activeFlowId, reason: 'initial-session-anonymous' });
      }
      return false;
    }
    if (activeFlowId && !isBootTransitionCurrentSafe(activeFlowId)) return false;
    setBootStateSafe('loading-session');
    scheduleLocalSessionRestoreFallback({ bootContext, flowId: activeFlowId });
    return runBootstrapTask(() => bootstrapFromSupabaseSession(session, {
      remember: true,
      showWelcome: false,
      flowId: activeFlowId,
      allowRepeatBootstrap: options.allowRepeatBootstrap === true,
    }));
  }

  window.retryInitialCloudBootstrap = async function retryInitialCloudBootstrap() {
    try {
      abandonActiveBootstrapWork('manual-retry');
      const flowId = beginBootTransitionSafe('retry-initial-bootstrap', 'booting-data');
      await bootstrapInitialSession({ flowId, allowRepeatBootstrap: true });
    } catch (err) {
      warn('Retry bootstrap failed:', err);
      showBootErrorState('Retry failed', err?.message || 'Please check your connection and try again.');
    }
  };

  function init() {
    setupSyncBridge();
    applyCurrency(_currency);
    initLocalSyncBroadcast();
    restoreRetryQueue();
    bindAutoSync();
    const localMarker = readBootContextMarker();
    const localColdStart = isLocalDevOrigin() &&
      !hasAuthCallbackInUrl() &&
      localMarker !== APP_SHELL_BOOT_CONTEXT &&
      localMarker !== AUTH_RETURN_BOOT_CONTEXT &&
      !hasStoredSupabaseSessionHint();
    if (localColdStart) {
      window.__spSuppressStoredSessionBootstrap = true;
    }

    // handleAuthRedirect() and bootstrapFromStoredSession() must only run AFTER
    // app.js has fully executed — otherwise showApp/loadUserData don’t exist yet
    // and the OAuth callback lands on the landing page instead of the dashboard.
    // We defer everything that calls bootstrapFromSupabaseSession to DOMContentLoaded.
    const onAppReady = () => {
      const bootContext = getStartupBootContext();
      const shouldShowBootLoader = bootContext === 'auth-callback' || bootContext === 'app-refresh';
      if (localColdStart) {
        const flowId = beginBootTransitionSafe('local-cold-start', 'loading-session');
        setTimeout(() => showLandingScreen({ flowId, reason: 'local-cold-start' }), 0);
        setTimeout(patchAppAuth, 0);
        setTimeout(injectSidebarButtons, 1200);
        return;
      }
      // Order matters: exchange the OAuth code FIRST, then check for a stored session.
      // exchangeCodeForSession writes to Supabase internal storage;
      // the subsequent getSession() call reads it back.
      withTimeout(
        () => handleAuthRedirect(),
        bootContext === 'auth-callback' ? 14000 : 6000,
        'handleAuthRedirect'
      ).catch((err) => {
        warn('Auth redirect handling timed out:', err);
        window.__spAuthRedirectInProgress = false;
        if (bootContext === 'auth-callback') {
          showBootErrorState('Session restore stalled', 'Retry to reconnect to Star Paper, or log out and sign in again.');
          return { status: 'timeout', shouldBootstrapStoredSession: false };
        }
        return { status: 'timeout', shouldBootstrapStoredSession: true };
      }).then((result) => {
        if (result?.shouldBootstrapStoredSession === false) {
          return;
        }
        const fallbackFlowId = getBootTransitionIdSafe();
        setTimeout(() => {
          if (
            window.__spInitialAuthEventSeen ||
            _bootstrapPromise ||
            window.__spAppBooted ||
            window.__spAuthRedirectInProgress
          ) {
            return;
          }
          bootstrapInitialSession({
            quietIfNoSession: bootContext === 'cold-start',
            loggedOutScreen: bootContext === 'cold-start' ? 'landing' : 'login',
            bootContext,
            flowId: fallbackFlowId,
            sessionTimeoutMs: bootContext === 'app-refresh' ? 1800 : undefined,
          });
        }, bootContext === 'app-refresh' ? 150 : 300);
      });

      setTimeout(patchAppAuth, 0);         // replace window.login/signup immediately
      setTimeout(injectSidebarButtons, 1200);

      if (shouldShowBootLoader && typeof window.showBootLoaderElement === 'function') {
        window.showBootLoaderElement();
        scheduleLocalSessionRestoreFallback({ bootContext, flowId: getBootTransitionIdSafe() });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onAppReady, { once: true });
    } else {
      // DOMContentLoaded already fired (synchronous script load after app.js)
      setTimeout(onAppReady, 0);
    }

  }

  // Separated from init() so it can be sequenced after handleAuthRedirect resolves.
  async function bootstrapFromStoredSession() {
    return bootstrapInitialSession();
  }


  // ── PUBLIC API ────────────────────────────────────────────────────────────────
  async function inspectCloudScope() {
    const workspaceMeta = getActiveWorkspaceMeta('debug');
    const data = await loadAllData({
      workspaceMeta,
      reason: 'debug-cloud-scope',
    });
    const result = {
      workspace: workspaceMeta,
      meta: data?.__meta || null,
      counts: {
        bookings: Array.isArray(data?.bookings) ? data.bookings.length : null,
        expenses: Array.isArray(data?.expenses) ? data.expenses.length : null,
        otherIncome: Array.isArray(data?.otherIncome) ? data.otherIncome.length : null,
        artists: Array.isArray(data?.artists) ? data.artists.length : null,
        audienceMetrics: Array.isArray(data?.audienceMetrics) ? data.audienceMetrics.length : null,
        tasks: Array.isArray(data?.tasks) ? data.tasks.length : null,
      },
    };
    log('debug.cloudScope', result);
    return result;
  }
  window.SP_debugCloudScope = inspectCloudScope;

  window.SP = {
    // Auth
    login:           (email, password) => signIn(email, password),
    signup:          signUp,
    logout:          signOut,
    getSession,
    getProfile,
    updateProfile,
    saveAccountProfile,
    signInWithGoogle,
    bootstrap:       bootstrapFromSupabaseSession,
    bootstrapInitialSession,
    refreshSessionIfNeeded,
    resolveActiveWorkspace,
    persistActiveTeam,
    getActiveWorkspaceMeta,
    autoSync:        bindAutoSync,

    // Data
    loadData,
    loadAllData,
    refreshCloudData,
    saveData,
    saveBookings,
    saveExpenses,
    saveOtherIncome,
    saveAllData,
    queueCloudSync:  saveAllData,
    saveArtists,
    debugCloudScope: inspectCloudScope,
    enqueueSave,
    realtimeSubs:    subscribeToCoreRealtime,
    loadTasks,
    saveTasks,
    deleteBooking,
    deleteExpense,
    deleteOtherIncome,
    deleteArtist,
    deleteTask,
    reloadAppData,
    reloadForResolvedWorkspace,

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
    closeTeamModal,
    showLoginPrompt,
    showCreateTeamForm,
    showJoinTeamForm,
    copyInviteCode,
    teamRoles: SP_TEAM_ROLE_PRESETS,

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
    getActiveTeamPermissions,
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
    #spCurrencyBadge {
      font-weight: 700;
      color: var(--gold-amber, #d4a843);
      min-width: 28px;
    }
    #spCurrencyModal .sp-modal-box {
      border: 1px solid var(--sp-shell-border-strong, rgba(212,168,67,.3));
      border-radius: 24px;
      background: var(--sp-shell-panel, #14151c);
      color: var(--text-primary, #f5f1e8);
      box-shadow: 0 28px 80px rgba(0,0,0,.48);
    }
    #spCurrencyList .action-btn {
      border-radius: 16px;
      border-color: var(--sp-shell-border, rgba(58,61,82,.84));
      background: rgba(255,255,255,.035);
      color: var(--text-primary, #f5f1e8);
      font-weight: 750;
      justify-content: space-between;
    }
    #spCurrencyList .action-btn span {
      color: var(--text-primary, #f5f1e8);
    }
    #spCurrencyList .action-btn--active,
    #spCurrencyList .action-btn:hover {
      border-color: var(--sp-shell-border-strong, rgba(212,168,67,.3));
      background: rgba(212,168,67,.12);
      color: #ffe8a3;
    }
    body.light-theme #spCurrencyList .action-btn {
      color: #20160a;
      background: rgba(255,255,255,.92);
      border-color: rgba(120,94,33,.32);
    }
    body.light-theme #spCurrencyList .action-btn span {
      color: #20160a;
    }
    /* Team panel */
    .sp-team-panel { display:flex; flex-direction:column; gap:16px; }
    .sp-team-panel-header { display:flex; justify-content:space-between; align-items:center; }
    .sp-team-panel-header h3 { margin:0; font-size:16px; }
    .sp-team-section h4 { font-size:12px; text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted,#888); margin:0 0 10px; }
    .sp-team-item { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-radius:8px; border:1px solid var(--border,rgba(255,255,255,.08)); cursor:pointer; margin-bottom:6px; }
    .sp-team-item--active { border-color:var(--gold,#FFB300); background:rgba(255,179,0,.05); }
    .sp-team-name { font-size:14px; font-weight:700; color:var(--text-primary,#f5f1e8); }
    .sp-team-role { font-size:11px; text-transform:uppercase; color:var(--gold,#FFB300); }
    .sp-team-member { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border,rgba(255,255,255,.05)); }
    .sp-team-member-avatar { width:32px; height:32px; border-radius:50%; background:var(--gold,#FFB300); color:#000; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .sp-team-member-name { font-size:13px; font-weight:700; color:var(--text-primary,#f5f1e8); }
    .sp-team-member-role { font-size:11px; color:var(--text-muted,#888); text-transform:uppercase; }
    .sp-team-invite-code { margin-top:10px; }
    .sp-team-invite-code label { font-size:12px; text-transform:uppercase; color:var(--text-muted,#888); display:block; margin-bottom:6px; }
    .sp-team-code-row { display:flex; align-items:center; gap:8px; }
    .sp-team-code-row code { background:var(--surface,rgba(255,255,255,.05)); padding:6px 12px; border-radius:6px; font-size:16px; letter-spacing:.1em; font-family:monospace; }
    .sp-team-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .sp-team-status-card,
    .sp-team-empty-state {
      border:1px solid var(--sp-shell-border,rgba(58,61,82,.84));
      background:rgba(255,255,255,.045);
      border-radius:14px;
      padding:14px;
    }
    .sp-team-status-label { font-size:11px; text-transform:uppercase; color:var(--gold,#FFB300); letter-spacing:.07em; }
    .sp-team-status-title,
    .sp-team-empty-title { color:var(--text-primary,#f5f1e8); font-weight:800; margin-top:4px; }
    .sp-team-empty-state p { color:var(--text-secondary,#d9d0be); line-height:1.5; }
    .sp-team-permissions { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
    .sp-team-permissions span {
      border:1px solid rgba(212,168,67,.28);
      background:rgba(212,168,67,.1);
      color:#ffe8a3;
      border-radius:999px;
      padding:2px 7px;
      font-size:10px;
      font-weight:750;
    }
    .sp-team-self { color:var(--text-muted,#aaa); font-weight:600; }
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
