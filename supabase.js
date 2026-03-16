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
const SP_SUPABASE_KEY  = 'sb_publishable_lJxIHBfiSxl_6wOtp9LbCQ_vjxF6ZjF';
const SP_SUPABASE_CONFIGURED =
  typeof SP_SUPABASE_URL === 'string' &&
  typeof SP_SUPABASE_KEY === 'string' &&
  SP_SUPABASE_URL.trim().length > 0 &&
  SP_SUPABASE_KEY.trim().length > 0 &&
  !SP_SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
  !SP_SUPABASE_KEY.includes('YOUR_ANON_PUBLIC_KEY');
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
      storageKey: 'sp-starpaper-auth-v1',
      // Disable the Web Locks API for auth token refresh coordination.
      // The navigator.locks "steal" mechanism causes AbortError when multiple
      // Supabase requests fire in rapid succession (e.g. Create Team flow).
      // With this disabled, GoTrue falls back to a simple in-memory mutex
      // which is sufficient for a single-page app with one auth client.
      lock: (name, acquireTimeout, fn) => fn(),
    }
  });

  // ── STATE ───────────────────────────────────────────────────────────────────
  let _session  = null;
  let _profile  = null;
  let _activeTeamId = localStorage.getItem('sp_active_team') || null;
  let _currency = localStorage.getItem('sp_currency') || 'UGX';
  let _realtimeChannel = null;

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

  function getOwnerId() {
    return _session?.user?.id || null;
  }

  function getContext() {
    // If user has an active team, scope data to team. Otherwise solo mode.
    return _activeTeamId
      ? { team_id: _activeTeamId, owner_id: null }
      : { team_id: null, owner_id: getOwnerId() };
  }

  // ── MIGRATION: import existing localStorage data on first login ─────────────
  async function migrateLocalStorageData() {
    const migrationKey = 'sp_migrated_' + getOwnerId();
    if (localStorage.getItem(migrationKey)) return;

    try {
      const managerData = JSON.parse(localStorage.getItem('starPaperManagerData') || '{}');
      const localArtists = JSON.parse(localStorage.getItem('starPaperArtists') || '[]');

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
      createdAt: row.created_at,
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

    const ctx = getContext();
    const filter = ctx.team_id
      ? (q) => q.eq('team_id', ctx.team_id)
      : (q) => q.eq('owner_id', ownerId);

    try {
      const [bRes, eRes, iRes, aRes] = await Promise.all([
        filter(db.from('bookings').select('*')).order('created_at', { ascending: false }),
        filter(db.from('expenses').select('*')).order('date', { ascending: false }),
        filter(db.from('other_income').select('*')).order('date', { ascending: false }),
        filter(db.from('artists').select('*')).order('name'),
      ]);

      if (bRes.error) warn('Bookings load error:', bRes.error);
      if (eRes.error) warn('Expenses load error:', eRes.error);
      if (iRes.error) warn('Other income load error:', iRes.error);
      if (aRes.error) warn('Artists load error:', aRes.error);

      return {
        bookings:    (bRes.data || []).map(rowToBooking),
        expenses:    (eRes.data || []).map(rowToExpense),
        otherIncome: (iRes.data || []).map(rowToOtherIncome),
        artists:     (aRes.data || []).map(rowToArtist),
      };
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
      const [bRows, eRows, iRows] = await Promise.all([
        smartUpsert('bookings',     bookings,    bookingToRow),
        smartUpsert('expenses',     expenses,    expenseToRow),
        smartUpsert('other_income', otherIncome, otherIncomeToRow),
      ]);

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

  async function deleteBooking(id) {
    const { error } = await db.from('bookings').delete().eq('id', id).eq('owner_id', getOwnerId());
    if (error) warn('Delete booking error:', error);
  }

  async function deleteExpense(id) {
    const { error } = await db.from('expenses').delete().eq('id', id).eq('owner_id', getOwnerId());
    if (error) warn('Delete expense error:', error);
  }

  async function deleteOtherIncome(id) {
    const { error } = await db.from('other_income').delete().eq('id', id).eq('owner_id', getOwnerId());
    if (error) warn('Delete other income error:', error);
  }

  // ── AUTH ─────────────────────────────────────────────────────────────────────

  // Returns a valid http/https redirect URL regardless of environment.
  // On file:// (local double-click), window.location.origin is "null" — Supabase
  // would fall back to the Supabase dashboard Site URL (the live Netlify URL),
  // redirecting the user away from their local file. This helper always returns
  // a usable URL: the current http/https origin, or the production URL as fallback.
  const SP_PRODUCTION_URL = 'https://starpaper.netlify.app';
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
    const { data: existing, error: existingError } = await db.from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (!existingError && existing) {
      _profile = existing;
      return existing;
    }

    const username = deriveUsernameFromAuth(user, usernameHint);
    const upsertPayload = {
      id: user.id,
      username,
      email: user.email || '',
      phone: user.user_metadata?.phone || '',
    };
    const { data: created, error: upsertError } = await db.from('profiles')
      .upsert(upsertPayload)
      .select()
      .maybeSingle();
    if (upsertError) {
      warn('Profile upsert failed:', upsertError);
      return null;
    }
    _profile = created || upsertPayload;
    return _profile;
  }

  function syncAuthIntoAppSession(username, profile, remember = true) {
    const normalized = String(username || '').trim();
    if (!normalized) return;
    const profileShape = {
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

    localStorage.setItem('starPaperRemember', JSON.stringify(Boolean(remember)));
    localStorage.setItem('starPaperCurrentUser', JSON.stringify(Boolean(remember) ? normalized : null));
    localStorage.setItem('starPaper_session', JSON.stringify('active'));
    localStorage.setItem('starPaperSessionUser', JSON.stringify(normalized));
    window.currentUser = normalized;
  }

  async function bootstrapFromSupabaseSession(session, options = {}) {
    const activeSession = session || _session || await getSession();
    if (!activeSession?.user) return false;

    _session = activeSession;
    const profile = await ensureProfileRecord(activeSession.user, options.usernameHint || '');
    const username = profile?.username || deriveUsernameFromAuth(activeSession.user, options.usernameHint || '');
    const remember = options.remember !== undefined ? Boolean(options.remember) : true;
    syncAuthIntoAppSession(username, profile || { email: activeSession.user.email || '' }, remember);

    try {
      const fresh = await loadData();
      if (fresh && window._SP_syncFromCloud) {
        window._SP_syncFromCloud(fresh);
      }
      if (typeof window.loadUserData === 'function') {
        window.loadUserData();
      }
    } catch (dataError) {
      warn('Cloud data bootstrap failed:', dataError);
    }

    if (typeof window.updateCurrentManagerContext === 'function') {
      window.updateCurrentManagerContext();
    }
    if (typeof window.showApp === 'function') {
      window.showApp();
    }
    if (options.showWelcome && typeof window.showWelcomeMessage === 'function') {
      window.showWelcomeMessage();
    }
    if (profile?.preferred_currency) {
      applyCurrency(profile.preferred_currency);
    }
    if (options.runMigration !== false) {
      setTimeout(() => migrateLocalStorageData(), 2000);
    }
    return true;
  }

  async function signInWithGoogle() {
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
    _session = session;
    if (event === 'SIGNED_IN' && session) {
      _profile = await ensureProfileRecord(session.user);
      if (_profile?.preferred_currency) {
        _currency = _profile.preferred_currency;
        applyCurrency(_currency);
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
    const { data, error } = await db.from('team_members')
      .select('role, teams(id, name, invite_code, owner_id)')
      .eq('user_id', getOwnerId());
    if (error) { warn('getMyTeams error:', error); return []; }
    return (data || []).map(row => ({ ...row.teams, myRole: row.role }));
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
      .select('role, joined_at, profiles(username, email, avatar)')
      .eq('team_id', teamId);
    if (error) { warn('getTeamMembers error:', error); return []; }
    return (data || []).map(row => ({
      ...row.profiles,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  }

  async function switchTeam(teamId) {
    _activeTeamId = teamId;
    localStorage.setItem('sp_active_team', teamId || '');
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
    const fresh = await loadData();
    if (!fresh) return;

    // Inject data into app's global scope
    if (typeof window.bookings !== 'undefined') {
      window.bookings = fresh.bookings;
    }
    if (typeof window.expenses !== 'undefined') {
      window.expenses = fresh.expenses;
    }
    if (typeof window.otherIncome !== 'undefined') {
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

  async function showTeamModal() {
    // Guard: must be logged in
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
      toastSafe('Success', `Team "${team.name}" created!`);
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
      try {
        await signInWithGoogle();
        if (typeof window.toastInfo === 'function') {
          window.toastInfo('Continuing with Google...');
        }
      } catch (err) {
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
          const { data: profile } = await db.from('profiles')
            .select('email')
            .ilike('username', nameOrEmail)
            .single();
          if (profile?.email) {
            email = profile.email;
          } else {
            // Fallback: treat username as email
            email = nameOrEmail;
          }
        }

        const { data } = await signIn(email, password);
        const remember = document.getElementById('rememberMe')?.checked;
        const booted = await bootstrapFromSupabaseSession(data?.session, {
          usernameHint: nameOrEmail,
          remember: Boolean(remember),
          showWelcome: true,
          runMigration: true,
        });
        if (!booted) throw new Error('Login failed');

        setLoading(false);
      } catch (err) {
        setLoading(false);
        const errMsg = String(err?.message || '').toLowerCase();
        const shouldFallback =
          typeof _origLogin === 'function' &&
          (errMsg.includes('failed to fetch') ||
           errMsg.includes('network') ||
           errMsg.includes('invalid url') ||
           errMsg.includes('api key'));
        if (shouldFallback) {
          warn('Supabase login unavailable. Falling back to local auth.', err);
          if (typeof window.toastWarn === 'function') {
            window.toastWarn('Cloud login unavailable. Using local login on this device.');
          }
          return _origLogin();
        }
        let msg = 'Invalid credentials. Please try again.';
        if (err.message?.includes('Email not confirmed')) msg = 'Please check your email to confirm your account first.';
        if (typeof window.toastError === 'function') window.toastError(msg);
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
          warn('Supabase signup unavailable. Falling back to local signup.', err);
          if (typeof window.toastWarn === 'function') {
            window.toastWarn('Cloud signup unavailable. Using local account mode.');
          }
          return _origSignup();
        }
        const msg = err.message?.includes('already registered')
          ? 'That email is already registered.'
          : err.message || 'Sign up failed. Please try again.';
        if (typeof window.toastError === 'function') window.toastError(msg);
      }
    };

    // ── SUPABASE LOGOUT ─────────────────────────────────────────────────────────
    window.logout = async function supabaseLogout() {
      if (typeof window.saveUserData === 'function') window.saveUserData();
      try {
        await signOut();
      } catch (error) {
        warn('Supabase logout failed. Falling back to local logout.', error);
        if (typeof _origLogout === 'function') return _origLogout();
      }
      if (typeof window.clearAuthSessionState === 'function') {
        window.clearAuthSessionState();
      } else {
        window.currentUser = null;
        window.currentManagerId = null;
        localStorage.removeItem('starPaper_session');
        localStorage.removeItem('starPaperSessionUser');
      }
      if (typeof window.setActiveScreen === 'function') window.setActiveScreen('landingScreen');
      if (typeof window.toastInfo === 'function') window.toastInfo('Logged out');
    };

    // ── PATCH saveUserData TO CLOUD-FIRST SYNC ──────────────────────────────────
    const _origSaveUserData = window.saveUserData;
    window.saveUserData = async function supabaseSaveUserData() {
      // 1. Persist to localStorage immediately for offline resilience
      if (typeof _origSaveUserData === 'function') _origSaveUserData();

      // 2. Sync to Supabase cloud. saveData() also back-fills cloud UUIDs into
      //    the live arrays so future saves are idempotent (no more duplicates).
      if (getOwnerId() && Array.isArray(window.bookings)) {
        try {
          await saveData({
            bookings:    window.bookings    || [],
            expenses:    window.expenses    || [],
            otherIncome: window.otherIncome || [],
          });
          await saveArtists(window.artists || []);
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

  // ── INIT ──────────────────────────────────────────────────────────────────────
  function init() {
    setupSyncBridge();
    applyCurrency(_currency);

    // Patch auth after app.js has loaded its own functions
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(patchAppAuth, 100);
        setTimeout(injectSidebarButtons, 1500);
      });
    } else {
      setTimeout(patchAppAuth, 100);
      setTimeout(injectSidebarButtons, 1500);
    }

    // Check for existing session on page load
    window.addEventListener('load', async () => {
      const session = await getSession();
      if (session) {
        const restored = await bootstrapFromSupabaseSession(session, {
          remember: true,
          showWelcome: false,
          runMigration: true,
        });
        if (restored) {
          log('Session restored for:', _profile?.username || session.user?.email || 'user');
        }
      }
    });
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

    // Data
    loadData,
    saveData,
    saveArtists,
    deleteBooking,
    deleteExpense,
    deleteOtherIncome,
    reloadAppData,

    // Teams
    createTeam,
    getMyTeams,
    joinTeamByCode,
    getTeamMembers,
    switchTeam,
    leaveTeam,
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

    // State
    getSession: () => _session,
    getOwnerId,
    getActiveTeamId: () => _activeTeamId,
    getProfile: () => _profile,

    // Raw client (for advanced use)
    client: db,
  };

  init();
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

