(function publishStarPaperOfflineCache(global) {
  'use strict';

  // Read-only offline snapshot cache.
  //
  // Supabase stays the single source of truth for WRITES: this module never
  // feeds data back into the save path. It persists the last complete cloud
  // snapshot per workspace scope so a boot with no network can render the
  // user's data read-only (provisional hydration keeps saveUserData guarded)
  // behind an explicit "Offline — last synced" banner instead of a dead
  // retry screen. Kill switch: localStorage sp_offline_cache_off = '1'.

  const DB_NAME = 'sp-offline-cache';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const KILL_SWITCH_KEY = 'sp_offline_cache_off';
  const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
  const SAVE_DEBOUNCE_MS = 1500;

  const SNAPSHOT_DATA_KEYS = Object.freeze([
    'bookings',
    'expenses',
    'otherIncome',
    'artists',
    'audienceMetrics',
    'tasks',
    'revenueGoal',
    'bbfEntries',
    'closingThoughts',
    'theme',
  ]);

  const CORE_ARRAY_KEYS = Object.freeze(['bookings', 'expenses', 'otherIncome', 'artists']);

  let dbPromise = null;
  const pendingSaves = {};

  function isEnabled() {
    try {
      return localStorage.getItem(KILL_SWITCH_KEY) !== '1';
    } catch (_err) {
      return true;
    }
  }

  function isSupported() {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null && isEnabled();
    } catch (_err) {
      return false;
    }
  }

  // Mirrors app.js hasCompleteCoreCloudSnapshot: only snapshots carrying all
  // four core arrays are worth caching — partial payloads would render a
  // misleading half-empty workspace offline.
  function isCompleteCoreSnapshot(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return CORE_ARRAY_KEYS.every((key) => Array.isArray(payload[key]));
  }

  // Whitelist + JSON round-trip: strips __meta/__workspace bookkeeping,
  // functions, and prototype baggage so IndexedDB only ever stores plain
  // serializable workspace data.
  function sanitizeSnapshotPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const picked = {};
    for (const key of SNAPSHOT_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
        picked[key] = payload[key];
      }
    }
    if (!Object.keys(picked).length) return null;
    let serialized = '';
    try {
      serialized = JSON.stringify(picked);
    } catch (_err) {
      return null;
    }
    if (!serialized || serialized.length > MAX_SNAPSHOT_BYTES) return null;
    try {
      return JSON.parse(serialized);
    } catch (_err) {
      return null;
    }
  }

  // Boot hydration must match the runtime's active scope: app.js
  // applyCloudSnapshotToRuntime drops snapshots for inactive scopes, so
  // offering a mismatched record would silently no-op.
  function chooseBootSnapshot(records, activeScopeKey, ownerId) {
    if (!Array.isArray(records) || !records.length) return null;
    const wantedScope = String(activeScopeKey || '').trim();
    const wantedOwner = String(ownerId || '').trim();
    if (!wantedScope || !wantedOwner) return null;
    let best = null;
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      if (String(record.scopeKey || '') !== wantedScope) continue;
      if (String(record.ownerId || '') !== wantedOwner) continue;
      if (!isCompleteCoreSnapshot(record.payload)) continue;
      if (!best || Number(record.savedAt || 0) > Number(best.savedAt || 0)) {
        best = record;
      }
    }
    return best;
  }

  function formatSyncedAt(timestamp, now) {
    const savedAt = Number(timestamp);
    if (!Number.isFinite(savedAt) || savedAt <= 0) return 'a while ago';
    const reference = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const saved = new Date(savedAt);
    const ref = new Date(reference);
    const sameDay = saved.getFullYear() === ref.getFullYear()
      && saved.getMonth() === ref.getMonth()
      && saved.getDate() === ref.getDate();
    const time = saved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `today ${time}`;
    const date = saved.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${date}, ${time}`;
  }

  function openDb() {
    if (!isSupported()) return Promise.reject(new Error('offline cache unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'scopeKey' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try { db.close(); } catch (_err) {}
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('offline cache open failed'));
      request.onblocked = () => reject(new Error('offline cache open blocked'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function withStore(mode, work) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(STORE_NAME, mode);
      } catch (err) {
        reject(err);
        return;
      }
      const store = tx.objectStore(STORE_NAME);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('offline cache transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('offline cache transaction failed'));
      try {
        result = work(store);
      } catch (err) {
        reject(err);
      }
    }));
  }

  function readRequest(requestFactory) {
    return withStore('readonly', (store) => requestFactory(store)).catch(() => null);
  }

  function persistRecord(record) {
    return withStore('readwrite', (store) => { store.put(record); });
  }

  function saveSnapshot(scopeKey, payload, meta) {
    const key = String(scopeKey || '').trim();
    if (!key || !isSupported()) return Promise.resolve(false);
    const ownerId = String((meta && meta.ownerId) || '').trim();
    if (!ownerId) return Promise.resolve(false);
    if (!isCompleteCoreSnapshot(payload)) return Promise.resolve(false);
    const sanitized = sanitizeSnapshotPayload(payload);
    if (!sanitized || !isCompleteCoreSnapshot(sanitized)) return Promise.resolve(false);

    const record = { scopeKey: key, ownerId, savedAt: Date.now(), payload: sanitized };
    return new Promise((resolve) => {
      const pending = pendingSaves[key];
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolvers.forEach((fn) => fn(false));
      }
      const entry = { record, resolvers: [resolve], timer: 0 };
      entry.timer = setTimeout(() => {
        delete pendingSaves[key];
        persistRecord(entry.record)
          .then(() => entry.resolvers.forEach((fn) => fn(true)))
          .catch(() => entry.resolvers.forEach((fn) => fn(false)));
      }, SAVE_DEBOUNCE_MS);
      pendingSaves[key] = entry;
    });
  }

  function loadSnapshot(scopeKey) {
    const key = String(scopeKey || '').trim();
    if (!key || !isSupported()) return Promise.resolve(null);
    return readRequest((store) => store.get(key)).then((req) => {
      const record = req && req.result ? req.result : null;
      return record && isCompleteCoreSnapshot(record.payload) ? record : null;
    }).catch(() => null);
  }

  function loadAllSnapshots() {
    if (!isSupported()) return Promise.resolve([]);
    return readRequest((store) => store.getAll()).then((req) => {
      const rows = req && Array.isArray(req.result) ? req.result : [];
      return rows;
    }).catch(() => []);
  }

  function loadBootSnapshot(activeScopeKey, ownerId) {
    return loadAllSnapshots()
      .then((records) => chooseBootSnapshot(records, activeScopeKey, ownerId))
      .catch(() => null);
  }

  function clearAll() {
    Object.keys(pendingSaves).forEach((key) => {
      clearTimeout(pendingSaves[key].timer);
      pendingSaves[key].resolvers.forEach((fn) => fn(false));
      delete pendingSaves[key];
    });
    if (!isSupported()) return Promise.resolve(false);
    return withStore('readwrite', (store) => { store.clear(); })
      .then(() => true)
      .catch(() => false);
  }

  // ── Offline banner (read-only staleness label) ────────────────────────────
  // DOM built with createElement/textContent only: index.html CSP forbids
  // inline handlers and styles, and preflight budgets innerHTML at zero.

  function findBannerHost() {
    return document.querySelector('.main-content') || document.body || null;
  }

  function ensureBanner() {
    let banner = document.getElementById('spOfflineBanner');
    if (banner) return banner;
    const host = findBannerHost();
    if (!host) return null;
    banner = document.createElement('div');
    banner.id = 'spOfflineBanner';
    banner.className = 'sp-offline-banner';
    banner.setAttribute('role', 'status');
    banner.hidden = true;

    const icon = document.createElement('i');
    icon.className = 'ph ph-cloud-slash sp-offline-banner__icon';
    icon.setAttribute('aria-hidden', 'true');
    banner.appendChild(icon);

    const message = document.createElement('span');
    message.className = 'sp-offline-banner__text';
    banner.appendChild(message);

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'sp-offline-banner__refresh';
    refresh.textContent = 'Retry';
    refresh.addEventListener('click', () => {
      window.location.reload();
    });
    banner.appendChild(refresh);

    host.insertBefore(banner, host.firstChild);
    return banner;
  }

  function showOfflineBanner(savedAt) {
    const banner = ensureBanner();
    if (!banner) return;
    const message = banner.querySelector('.sp-offline-banner__text');
    if (message) {
      message.textContent = `Offline — showing data last synced ${formatSyncedAt(savedAt)}. Changes are paused until you reconnect.`;
    }
    banner.hidden = false;
    document.body.classList.add('sp-offline-cached');
  }

  function hideOfflineBanner() {
    const banner = document.getElementById('spOfflineBanner');
    if (banner) banner.hidden = true;
    if (document.body) document.body.classList.remove('sp-offline-cached');
  }

  global.SP_OFFLINE_CACHE = Object.freeze({
    isSupported,
    isCompleteCoreSnapshot,
    sanitizeSnapshotPayload,
    chooseBootSnapshot,
    formatSyncedAt,
    saveSnapshot,
    loadSnapshot,
    loadBootSnapshot,
    clearAll,
    showOfflineBanner,
    hideOfflineBanner,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));
