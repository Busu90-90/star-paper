/**
 * Star Paper - Crew chat. One page where the team talks: General and Strategy
 * channels, a discussion per show, and one-to-one direct messages. Messages
 * live in public.messages (channel, recipient_id, reply_to, mentions,
 * edited_at); read markers live in public.message_reads. Direct messages are
 * private to the two people at the database level (RLS), so realtime only
 * delivers them to those two. DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const PAGE = 400;
    const GROUP_GAP_MS = 5 * 60 * 1000;
    const SHOW_WINDOW_PAST = 30;
    const SHOW_WINDOW_AHEAD = 120;
    const CHANNELS = [
        { key: 'general', name: 'General', icon: 'ph-hash', blurb: 'Everything for the whole crew.' },
        { key: 'strategy', name: 'Strategy', icon: 'ph-strategy', blurb: 'Plans, targets and ideas for growing the roster.' },
    ];
    const ACTIVE_KEY = 'starPaperCrewConversation';

    const $ = (id) => document.getElementById(id);
    const sp = () => window.SP || null;
    const arr = (name) => (Array.isArray(window[name]) ? window[name] : []);

    const state = {
        teamId: null,
        me: null,
        members: [],
        messages: new Map(),
        reads: {},
        active: null,
        replyTo: null,
        editing: null,
        confirmDelete: null,
        showPins: false,
        loading: false,
        loaded: false,
        error: '',
        hasOlder: false,
        channel: null,
        mention: null,
        listOpenOnPhone: true,
        // Channel boards: which post has its reply box open, and which reply it answers.
        thread: null,
        threadReplyTo: null,
        expanded: new Set(),
        // Direct messages: how far the other person has read, who is online, who is typing.
        partnerRead: {},
        online: new Set(),
        typing: {},
        // Voice notes: the recording in progress, and the shared player.
        rec: null,
        speed: 1,
    };

    const VOICE_BUCKET = 'crew-voice';
    const VOICE_MAX_MS = 5 * 60 * 1000;
    const VOICE_BARS = 40;
    const isDm = (key) => String(key || '').startsWith('dm:');
    const isVoice = (m) => m?.attachment_meta?.kind === 'audio' && !!m.attachment_path;

    function fmtDuration(seconds) {
        const s = Math.max(0, Math.round(Number(seconds) || 0));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    // One-line stand-in for a message in lists, quotes and notifications.
    function previewText(m) {
        if (!m) return '';
        if (isVoice(m)) return `Voice message (${fmtDuration(m.attachment_meta.duration)})`;
        return String(m.content || '');
    }

    // The post a reply belongs to: walk up reply_to until a message with no parent.
    function rootOf(m) {
        let cur = m;
        for (let i = 0; i < 25 && cur?.reply_to; i += 1) {
            const parent = state.messages.get(cur.reply_to);
            if (!parent) break;
            cur = parent;
        }
        return cur;
    }

    function timeAgo(t) {
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 60) return 'Just now';
        if (s < 3600) return `${Math.floor(s / 60)}m`;
        if (s < 86400) return `${Math.floor(s / 3600)}h`;
        if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
        return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    // ── Small DOM helpers ────────────────────────────────────────────────
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        const i = el('i', `ph ${String(name).replace(/^ph\s+/, '')}`);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function button(className, label, opts = {}) {
        const b = el('button', className);
        b.type = 'button';
        if (opts.icon) b.appendChild(icon(opts.icon));
        if (label) b.appendChild(el('span', opts.labelClass || '', label));
        if (opts.title) { b.title = opts.title; b.setAttribute('aria-label', opts.title); }
        if (opts.data) Object.entries(opts.data).forEach(([k, v]) => b.setAttribute(`data-${k}`, v));
        return b;
    }

    // Opens the shared emoji picker (app.pickers.js) for the field with this id.
    function emojiButton(fieldId) {
        const b = button('cr-tool cr-emoji-btn', '', { icon: 'ph ph-smiley', title: 'Add emoji', data: { 'sp-emoji-for': fieldId } });
        b.setAttribute('aria-haspopup', 'dialog');
        b.setAttribute('aria-expanded', 'false');
        return b;
    }

    function hue(seed) {
        let h = 0;
        String(seed || '').split('').forEach((c) => { h = (h * 31 + c.charCodeAt(0)) % 6; });
        return h;
    }

    function avatar(name, seed, size) {
        const a = el('span', `cr-avatar cr-avatar--${size || 'md'} cr-avatar--h${hue(seed || name)}`);
        a.setAttribute('aria-hidden', 'true');
        const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
        a.textContent = initials || '?';
        return a;
    }

    // ── Dates ────────────────────────────────────────────────────────────
    const ts = (m) => new Date(m?.created_at || 0).getTime() || 0;
    const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

    function dayLabel(t) {
        const d = new Date(t);
        const today = new Date();
        const yday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        if (dayKey(t) === dayKey(today.getTime())) return 'Today';
        if (dayKey(t) === dayKey(yday.getTime())) return 'Yesterday';
        return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    }

    const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    function shortWhen(t) {
        if (!t) return '';
        return dayKey(t) === dayKey(Date.now()) ? clock(t) : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    function parseDate(value) {
        const f = window.SPHome?.fmt?.parseDate;
        if (f) return f(value);
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // ── People ───────────────────────────────────────────────────────────
    function memberName(userId, fallback) {
        if (userId && userId === state.me) return 'You';
        const m = state.members.find((x) => x.userId === userId);
        return m?.username || m?.email?.split('@')[0] || fallback || 'Teammate';
    }

    function myName() {
        const p = sp()?.getProfileState?.();
        return p?.username || p?.full_name || 'Manager';
    }

    const others = () => state.members.filter((m) => m.userId && m.userId !== state.me);

    // ── Conversations ────────────────────────────────────────────────────
    function keyOf(m) {
        if (m.channel === 'dm') return `dm:${m.user_id === state.me ? m.recipient_id : m.user_id}`;
        return m.channel || 'general';
    }

    function bookingFor(key) {
        if (!key || !key.startsWith('show:')) return null;
        const id = key.slice(5);
        return arr('bookings').find((b) => String(b.id) === id) || null;
    }

    function conversationTitle(key) {
        if (!key) return '';
        const ch = CHANNELS.find((c) => c.key === key);
        if (ch) return ch.name;
        if (key.startsWith('dm:')) return memberName(key.slice(3));
        const b = bookingFor(key);
        return b ? b.event || 'Show' : 'Show (removed)';
    }

    function messagesIn(key) {
        const out = [];
        state.messages.forEach((m) => { if (keyOf(m) === key) out.push(m); });
        return out.sort((a, b) => ts(a) - ts(b));
    }

    function summary() {
        const by = new Map();
        state.messages.forEach((m) => {
            const key = keyOf(m);
            const s = by.get(key) || { last: null, unread: 0, mention: false, count: 0 };
            s.count += 1;
            if (!s.last || ts(m) > ts(s.last)) s.last = m;
            const readAt = state.reads[key] || 0;
            if (m.user_id !== state.me && ts(m) > readAt) {
                s.unread += 1;
                if (Array.isArray(m.mentions) && m.mentions.includes(state.me)) s.mention = true;
            }
            by.set(key, s);
        });
        return by;
    }

    function totalUnread(sum) {
        let n = 0;
        (sum || summary()).forEach((s, key) => { if (key !== state.active || document.hidden || !isOpen()) n += s.unread; });
        return n;
    }

    function showList(sum) {
        const now = Date.now();
        const day = 86400000;
        const seen = new Set();
        const rows = [];
        arr('bookings').forEach((b) => {
            if (String(b?.status || '').toLowerCase() === 'cancelled') return;
            const d = parseDate(b.date);
            if (!d) return;
            const key = `show:${b.id}`;
            const diff = (d.getTime() - now) / day;
            if (diff < -SHOW_WINDOW_PAST - 1 && !sum.has(key)) return;
            if (diff > SHOW_WINDOW_AHEAD && !sum.has(key)) return;
            seen.add(key);
            rows.push({ key, booking: b, date: d, upcoming: diff > -1 });
        });
        sum.forEach((s, key) => {
            if (key.startsWith('show:') && !seen.has(key)) rows.push({ key, booking: null, date: null, upcoming: false });
        });
        // Upcoming shows soonest first, then past shows most recent first.
        return rows.sort((a, b) => {
            if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
            const ad = a.date ? a.date.getTime() : 0;
            const bd = b.date ? b.date.getTime() : 0;
            return a.upcoming ? ad - bd : bd - ad;
        });
    }

    // ── Data ─────────────────────────────────────────────────────────────
    function db() { return sp()?.client || null; }

    function ingest(rows) {
        (rows || []).forEach((m) => {
            if (!m || !m.id) return;
            if (state.teamId && m.team_id && m.team_id !== state.teamId) return;
            // Direct messages to other people never reach us from the server; this
            // guard only matters for local test data.
            if (m.channel === 'dm' && m.user_id !== state.me && m.recipient_id !== state.me) return;
            const prev = state.messages.get(m.id) || {};
            state.messages.set(m.id, { ...prev, ...m, channel: m.channel || 'general', created_at: m.created_at || prev.created_at || new Date().toISOString() });
        });
    }

    async function loadAll() {
        const client = db();
        if (!client || !state.teamId) return;
        state.loading = true;
        state.error = '';
        render();
        try {
            const [msgRes, readRes, members, teams, partnerRes] = await Promise.all([
                client.from('messages').select('*').eq('team_id', state.teamId).order('created_at', { ascending: false }).limit(PAGE),
                client.from('message_reads').select('channel_key,last_read_at').eq('team_id', state.teamId).eq('user_id', state.me),
                sp().getTeamMembers ? sp().getTeamMembers(state.teamId) : Promise.resolve([]),
                sp().getMyTeams ? sp().getMyTeams({ nullOnError: true }).catch(() => null) : Promise.resolve(null),
                // How far each person has read their direct messages with me (blue ticks).
                Promise.resolve(client.from('message_reads').select('user_id,last_read_at').eq('team_id', state.teamId).eq('channel_key', `dm:${state.me}`)).catch(() => ({ data: [] })),
            ]);
            state.teamName = (Array.isArray(teams) ? teams : []).find((t) => t.id === state.teamId)?.name || '';
            if (msgRes.error) throw msgRes.error;
            state.messages.clear();
            ingest(msgRes.data);
            state.hasOlder = (msgRes.data || []).length >= PAGE;
            state.reads = {};
            (readRes.data || []).forEach((r) => {
                const t = new Date(r.last_read_at).getTime() || 0;
                if (t > (state.reads[r.channel_key] || 0)) state.reads[r.channel_key] = t;
            });
            state.partnerRead = {};
            (partnerRes?.data || []).forEach((r) => notePartnerRead(r));
            state.members = Array.isArray(members) ? members : [];
            state.loaded = true;
        } catch (err) {
            state.error = 'Messages could not load. Check your connection and try again.';
            console.warn('[crew] load failed', err);
        } finally {
            state.loading = false;
        }
        let at = 0;
        if (isOpen()) {
            const sum = summary();
            if (!state.active) {
                state.active = restoreActive(sum);
                state.newMark = { key: state.active, at: state.reads[state.active] || 0 };
            }
            at = noteRead(state.active);
        }
        render();
        if (at) markRead(state.active, at);
    }

    async function loadOlder() {
        const client = db();
        if (!client || !state.teamId) return;
        let oldest = null;
        state.messages.forEach((m) => { if (!oldest || ts(m) < ts(oldest)) oldest = m; });
        if (!oldest) return;
        const { data, error } = await client.from('messages').select('*').eq('team_id', state.teamId)
            .lt('created_at', oldest.created_at).order('created_at', { ascending: false }).limit(PAGE);
        if (error) { toast('Error', 'Older messages could not load.'); return; }
        ingest(data);
        state.hasOlder = (data || []).length >= PAGE;
        render({ keepScroll: true });
    }

    // Marks a conversation read locally; returns the timestamp to save, or 0 if nothing changed.
    function noteRead(key) {
        if (!key) return 0;
        const last = messagesIn(key).pop();
        if (state.reads[key] && state.reads[key] >= (last ? ts(last) : 0)) return 0;
        const at = Math.max(Date.now(), last ? ts(last) : 0);
        state.reads[key] = at;
        return at;
    }

    async function markRead(key, knownAt) {
        const at = knownAt || noteRead(key);
        updateBadges();
        if (!at) return;
        const client = db();
        if (!client || !state.teamId || !state.me) return;
        try {
            await client.from('message_reads').upsert({
                user_id: state.me,
                team_id: state.teamId,
                channel_key: key,
                last_read_at: new Date(at).toISOString(),
            }, { onConflict: 'user_id,team_id,channel_key' });
        } catch (err) {
            console.warn('[crew] read marker not saved', err);
        }
    }

    function mentionsIn(text) {
        const ids = [];
        const lower = String(text || '').toLowerCase();
        state.members.forEach((m) => {
            const name = String(m.username || '').trim();
            if (!name || !m.userId || m.userId === state.me) return;
            if (lower.includes(`@${name.toLowerCase()}`)) ids.push(m.userId);
        });
        return ids;
    }

    // Sends to the open conversation. opts.replyTo answers a post or message;
    // opts.attachment carries a voice note that is already uploaded.
    async function send(text, opts = {}) {
        const client = db();
        const key = state.active;
        if (!client || !state.teamId || !key || !text) return false;
        const replyTo = opts.replyTo !== undefined ? opts.replyTo : (state.replyTo || null);
        const row = {
            team_id: state.teamId,
            user_id: state.me,
            username: myName(),
            content: text,
            msg_type: 'text',
            channel: isDm(key) ? 'dm' : key,
            recipient_id: isDm(key) ? key.slice(3) : null,
            reply_to: replyTo || null,
            mentions: opts.attachment ? [] : mentionsIn(text),
        };
        if (opts.attachment) {
            row.attachment_path = opts.attachment.path;
            row.attachment_meta = opts.attachment.meta;
        }
        const { data, error } = await client.from('messages').insert(row).select();
        if (error) { toast('Error', 'Message not sent. Try again.'); return false; }
        ingest(Array.isArray(data) && data.length ? data : [{ ...row, id: `local-${Date.now()}` }]);
        if (opts.replyTo === undefined) state.replyTo = null;
        state.reads[key] = Date.now();
        if (isDm(key)) render({ toBottom: true });
        else render({ keepScroll: !!replyTo, toTop: !replyTo });
        markRead(key);
        return true;
    }

    // Storage folder for a conversation; direct messages carry both ids so only
    // those two people pass the bucket policy.
    function voiceFolder(key) {
        if (isDm(key)) return `dm-${[state.me, key.slice(3)].sort().join('_')}`;
        if (key.startsWith('show:')) return `show-${key.slice(5)}`;
        return key;
    }

    async function sendVoice(blob, meta, replyTo) {
        const client = db();
        const key = state.active;
        if (!client?.storage || !state.teamId || !key) return false;
        const mime = String(meta.mime || blob.type || 'audio/webm').split(';')[0];
        const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('mpeg') ? 'mp3' : 'webm';
        const id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const path = `${state.teamId}/${voiceFolder(key)}/${id}.${ext}`;
        toast('Info', 'Sending voice note…');
        const { error } = await client.storage.from(VOICE_BUCKET).upload(path, blob, { contentType: mime, upsert: false });
        if (error) { toast('Error', 'Voice note not sent. Check your connection and try again.'); return false; }
        const ok = await send('Voice message', { replyTo: replyTo || null, attachment: { path, meta: { ...meta, mime } } });
        if (!ok) client.storage.from(VOICE_BUCKET).remove([path]).catch(() => null);
        return ok;
    }

    async function saveEdit(id, text) {
        const client = db();
        const msg = state.messages.get(id);
        if (!client || !msg || !text) return false;
        if (text === msg.content) return true;
        const { data, error } = await client.from('messages').update({ content: text }).eq('id', id).select();
        if (error) { toast('Error', 'Edit not saved. Try again.'); return false; }
        ingest(Array.isArray(data) && data.length ? data : [{ ...msg, content: text, edited_at: new Date().toISOString() }]);
        return true;
    }

    async function remove(id) {
        const client = db();
        if (!client) return;
        const msg = state.messages.get(id);
        const { error } = await client.from('messages').delete().eq('id', id);
        if (error) { toast('Error', 'Message not deleted. Try again.'); return; }
        if (isVoice(msg) && client.storage) client.storage.from(VOICE_BUCKET).remove([msg.attachment_path]).catch(() => null);
        if (player.id === id) stopPlayback();
        state.messages.delete(id);
        state.confirmDelete = null;
        render({ keepScroll: true });
    }

    async function togglePin(id) {
        const client = db();
        const msg = state.messages.get(id);
        if (!client || !msg) return;
        const next = !msg.pinned;
        const { error } = await client.rpc('set_message_pinned', { p_message_id: id, p_pinned: next });
        if (error) { toast('Error', 'Pin not saved. Try again.'); return; }
        state.messages.set(id, { ...msg, pinned: next });
        render({ keepScroll: true });
    }

    function subscribe() {
        const client = db();
        unsubscribe();
        if (!client || !state.teamId || typeof client.channel !== 'function') return;
        try {
            const ch = client.channel(`sp-crew-${state.teamId}`, { config: { presence: { key: state.me }, broadcast: { self: false } } });
            state.channel = ch
                .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `team_id=eq.${state.teamId}` }, onChange)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads', filter: `channel_key=eq.dm:${state.me}` }, (payload) => {
                    if (payload?.new && notePartnerRead(payload.new)) render({ keepScroll: true });
                })
                .on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(payload))
                .on('presence', { event: 'sync' }, () => {
                    try { state.online = new Set(Object.keys(ch.presenceState() || {})); } catch (_e) { state.online = new Set(); }
                    updateLiveStatus();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') ch.track({ user_id: state.me, at: Date.now() }).catch?.(() => null);
                });
        } catch (err) {
            console.warn('[crew] live updates unavailable', err);
        }
    }

    function unsubscribe() {
        if (state.channel && db()) {
            try { db().removeChannel(state.channel); } catch (_e) { /* already gone */ }
        }
        state.channel = null;
    }

    function notePartnerRead(row) {
        if (!row?.user_id || row.channel_key !== `dm:${state.me}` || (row.team_id && row.team_id !== state.teamId)) return false;
        const t = new Date(row.last_read_at).getTime() || 0;
        const key = `dm:${row.user_id}`;
        if (t <= (state.partnerRead[key] || 0)) return false;
        state.partnerRead[key] = t;
        return true;
    }

    // ── Typing and online status (realtime broadcast and presence; nothing is stored) ──
    let typingSentAt = 0;
    function sendTyping() {
        const key = state.active;
        if (!isDm(key) || !state.channel || Date.now() - typingSentAt < 2500) return;
        typingSentAt = Date.now();
        try { state.channel.send({ type: 'broadcast', event: 'typing', payload: { from: state.me, to: key.slice(3) } }); } catch (_e) { /* offline */ }
    }

    function onTyping(p) {
        if (!p || p.to !== state.me || !p.from) return;
        const key = `dm:${p.from}`;
        state.typing[key] = Date.now() + 4000;
        updateLiveStatus();
        setTimeout(updateLiveStatus, 4200);
    }

    const isTyping = (key) => (state.typing[key] || 0) > Date.now();

    function liveStatus(key) {
        if (!isDm(key)) return '';
        if (isTyping(key)) return 'typing…';
        return state.online.has(key.slice(3)) ? 'online' : '';
    }

    // Updates the header line and the typing bubble without redrawing the chat.
    function updateLiveStatus() {
        const key = state.active;
        const sub = $('crMainSub');
        if (sub && isDm(key)) {
            const live = liveStatus(key);
            sub.textContent = live || sub.dataset.base || '';
            sub.classList.toggle('is-live', !!live);
        }
        const list = $('crMessages');
        const bubble = $('crTyping');
        if (list && isDm(key)) {
            if (isTyping(key) && !bubble) {
                const atBottom = nearBottom();
                list.appendChild(typingBubble());
                if (atBottom) list.scrollTop = list.scrollHeight;
            } else if (!isTyping(key) && bubble) {
                bubble.remove();
            }
        }
        document.querySelectorAll('[data-cr-online]').forEach((dot) => {
            dot.hidden = !state.online.has(dot.getAttribute('data-cr-online'));
        });
    }

    function typingBubble() {
        const row = el('div', 'cr-b cr-b--typing');
        row.id = 'crTyping';
        const b = el('div', 'cr-bubble has-tail');
        b.setAttribute('aria-label', `${conversationTitle(state.active)} is typing`);
        for (let i = 0; i < 3; i += 1) b.appendChild(el('span', 'cr-dot'));
        row.appendChild(b);
        return row;
    }

    function onChange(payload) {
        const type = payload?.eventType;
        if (type === 'DELETE') {
            const id = payload.old?.id;
            if (id) state.messages.delete(id);
            render({ keepScroll: true });
            return;
        }
        const m = payload?.new;
        if (!m?.id) return;
        const isNew = type === 'INSERT' && !state.messages.has(m.id);
        ingest([m]);
        const key = keyOf(m);
        const viewing = isOpen() && !document.hidden && state.active === key;
        if (viewing) {
            const atBottom = isDm(key) && nearBottom();
            const at = noteRead(key);
            render({ keepScroll: !atBottom });
            if (at) markRead(key, at);
        } else {
            render({ keepScroll: true });
        }
        if (isNew && m.user_id !== state.me && !viewing) notify(m, key);
    }

    function notify(m, key) {
        const who = m.username || memberName(m.user_id);
        const where = key.startsWith('dm:') ? 'sent you a message' : `in ${conversationTitle(key)}`;
        const mentioned = Array.isArray(m.mentions) && m.mentions.includes(state.me);
        const text = mentioned ? `${who} mentioned you ${key.startsWith('dm:') ? '' : `in ${conversationTitle(key)}`}`.trim() : `${who} ${where}`;
        toast('Info', `${text}: ${previewText(m).slice(0, 80)}`);
        document.dispatchEvent(new CustomEvent('sp:notify', { detail: { kind: 'message', text, action: 'openChat', actionId: key } }));
    }

    function toast(type, msg) {
        const fn = window[`toast${type}`];
        if (typeof fn === 'function') fn(msg);
    }

    // ── Rendering ────────────────────────────────────────────────────────
    const isOpen = () => $('crew')?.classList.contains('active') === true;

    function nearBottom() {
        const list = $('crMessages');
        return !list || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    }

    function updateBadges(sum) {
        const n = totalUnread(sum);
        ['crewBadgeNav', 'crewBadgeSheet', 'crewBadgeBottom'].forEach((id) => {
            const b = $(id);
            if (!b) return;
            b.textContent = n > 99 ? '99+' : String(n);
            b.hidden = n === 0;
        });
    }

    function convoButton(key, title, sub, s, lead) {
        const b = el('button', `cr-convo${key === state.active ? ' is-active' : ''}${s?.unread ? ' is-unread' : ''}`);
        b.type = 'button';
        b.setAttribute('data-cr-open', key);
        if (key === state.active) b.setAttribute('aria-current', 'true');
        b.appendChild(lead);
        const text = el('span', 'cr-convo__text');
        const top = el('span', 'cr-convo__top');
        top.append(el('span', 'cr-convo__name', title));
        if (s?.last) top.appendChild(el('span', 'cr-convo__when', shortWhen(ts(s.last))));
        text.appendChild(top);
        const bottom = el('span', 'cr-convo__bottom');
        let preview = sub;
        if (s?.last) {
            const who = s.last.user_id === state.me ? 'You' : (s.last.username || memberName(s.last.user_id)).split(' ')[0];
            preview = key.startsWith('dm:') && s.last.user_id !== state.me ? previewText(s.last) : `${who}: ${previewText(s.last)}`;
        }
        bottom.appendChild(el('span', 'cr-convo__preview', preview || ''));
        if (s?.mention) bottom.appendChild(el('span', 'cr-convo__at', '@'));
        if (s?.unread) {
            const u = el('span', 'cr-convo__unread', s.unread > 99 ? '99+' : String(s.unread));
            u.setAttribute('aria-label', `${s.unread} unread`);
            bottom.appendChild(u);
        }
        text.appendChild(bottom);
        b.appendChild(text);
        return b;
    }

    function renderSidebar(sum) {
        const side = el('aside', 'cr-side');
        side.setAttribute('aria-label', 'Conversations');
        const head = el('div', 'cr-side__head');
        head.append(el('h2', 'cr-side__title', 'Crew chat'));
        if (state.teamName) head.appendChild(el('p', 'cr-side__sub', state.teamName));
        side.appendChild(head);

        const groups = el('div', 'cr-side__scroll');
        const chans = el('div', 'cr-group');
        chans.appendChild(el('p', 'cr-group__label', 'Channels'));
        CHANNELS.forEach((c) => {
            const lead = el('span', 'cr-convo__icon');
            lead.appendChild(icon(`ph ${c.icon}`));
            chans.appendChild(convoButton(c.key, c.name, c.blurb, sum.get(c.key), lead));
        });
        groups.appendChild(chans);

        const dms = el('div', 'cr-group');
        dms.appendChild(el('p', 'cr-group__label', 'Direct messages'));
        const people = others();
        if (!people.length) dms.appendChild(el('p', 'cr-group__empty', 'Invite people to your team to message them one to one.'));
        people
            .map((m) => ({ m, s: sum.get(`dm:${m.userId}`) }))
            .sort((a, b) => (b.s?.last ? ts(b.s.last) : 0) - (a.s?.last ? ts(a.s.last) : 0) || String(a.m.username).localeCompare(String(b.m.username)))
            .forEach(({ m, s }) => {
                dms.appendChild(convoButton(`dm:${m.userId}`, memberName(m.userId), m.roleLabel || 'Crew', s, avatar(memberName(m.userId), m.userId, 'sm')));
            });
        groups.appendChild(dms);

        const shows = el('div', 'cr-group');
        shows.appendChild(el('p', 'cr-group__label', 'Shows'));
        const rows = showList(sum);
        if (!rows.length) shows.appendChild(el('p', 'cr-group__empty', 'Shows from the last month and the next four appear here.'));
        rows.forEach((r) => {
            const lead = el('span', 'cr-convo__date');
            if (r.date) {
                lead.append(el('span', 'cr-convo__day', String(r.date.getDate())), el('span', 'cr-convo__mon', r.date.toLocaleDateString('en-US', { month: 'short' })));
            } else {
                lead.appendChild(icon('ph ph-microphone-stage'));
            }
            if (!r.upcoming) lead.classList.add('is-past');
            const sub = r.booking ? [r.booking.artist || r.booking.artist_name, r.booking.location].filter(Boolean).join(' · ') : 'Booking removed';
            shows.appendChild(convoButton(r.key, conversationTitle(r.key), sub, sum.get(r.key), lead));
        });
        groups.appendChild(shows);
        side.appendChild(groups);
        return side;
    }

    function payWords(b) {
        const fee = Math.round(Number(b?.fee) || 0);
        const balance = Math.round(Number(b?.balance) || 0);
        const deposit = Math.round(Number(b?.deposit) || 0);
        if (fee > 0 && balance <= 0) return { text: 'Paid', tone: 'good' };
        if (deposit > 0 || (fee > 0 && balance < fee)) return { text: 'Part paid', tone: 'warn' };
        return { text: 'Unpaid', tone: 'bad' };
    }

    function renderShowStrip(key) {
        const b = bookingFor(key);
        const strip = el('div', 'cr-show');
        if (!b) {
            strip.appendChild(el('span', 'cr-show__item', 'This booking was removed. The discussion is kept.'));
            return strip;
        }
        const d = parseDate(b.date);
        const ugx = window.SPHome?.fmt?.ugx || ((n) => `UGX ${Math.round(Number(n) || 0).toLocaleString()}`);
        const pay = payWords(b);
        const items = [
            ['ph-calendar-blank', d ? d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'],
            ['ph-microphone-stage', b.artist || b.artist_name || 'No artist'],
            ['ph-map-pin', b.location || 'No venue'],
            ['ph-money', ugx(b.fee)],
        ];
        items.forEach(([ic, text]) => {
            const it = el('span', 'cr-show__item');
            it.append(icon(`ph ${ic}`), el('span', '', text));
            strip.appendChild(it);
        });
        strip.appendChild(el('span', `cr-pill cr-pill--${pay.tone}`, pay.text));
        const go = button('cr-link', 'Open in Schedule', { data: { action: 'showSection', section: 'bookings' } });
        strip.appendChild(go);
        return strip;
    }

    function linkify(parent, text) {
        const names = state.members.map((m) => String(m.username || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
        const pattern = /(https?:\/\/[^\s<]+)|@([^\s@]+(?:\s[^\s@]+)?)/g;
        let last = 0;
        let match;
        while ((match = pattern.exec(text))) {
            if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
            if (match[1]) {
                const a = el('a', 'cr-msg__link', match[1]);
                a.href = match[1];
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                parent.appendChild(a);
                last = match.index + match[0].length;
            } else {
                const rest = text.slice(match.index + 1);
                const name = names.find((n) => rest.toLowerCase().startsWith(n.toLowerCase()));
                if (name) {
                    const member = state.members.find((m) => String(m.username || '').trim() === name);
                    parent.appendChild(el('span', `cr-mention${member?.userId === state.me ? ' is-me' : ''}`, `@${rest.slice(0, name.length)}`));
                    last = match.index + 1 + name.length;
                } else {
                    parent.appendChild(document.createTextNode('@'));
                    last = match.index + 1;
                }
                pattern.lastIndex = last;
            }
        }
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    }

    function quote(id, cls) {
        const q = state.messages.get(id);
        const box = el('button', cls || 'cr-quote');
        box.type = 'button';
        box.setAttribute('data-cr-jump', id);
        if (!q) {
            box.appendChild(el('span', 'cr-quote__text', 'Original message was deleted'));
            box.disabled = true;
            return box;
        }
        const text = el('span', 'cr-quote__text');
        if (isVoice(q)) text.appendChild(icon('ph ph-microphone'));
        text.appendChild(document.createTextNode(previewText(q)));
        box.append(el('span', 'cr-quote__who', q.user_id === state.me ? 'You' : (q.username || memberName(q.user_id))), text);
        return box;
    }

    // ── Voice notes: player ──────────────────────────────────────────────
    const player = { audio: null, id: null, urls: new Map() };

    function voicePlayer(m) {
        const meta = m.attachment_meta || {};
        const box = el('div', `cr-voice${player.id === m.id && player.audio && !player.audio.paused ? ' is-playing' : ''}`);
        box.setAttribute('data-cr-voice', m.id);
        const play = button('cr-voice__play', '', { icon: player.id === m.id && player.audio && !player.audio.paused ? 'ph ph-pause' : 'ph ph-play', title: 'Play voice message', data: { 'cr-play': m.id } });
        const wave = el('div', 'cr-voice__wave');
        wave.setAttribute('data-cr-seek', m.id);
        wave.setAttribute('role', 'slider');
        wave.setAttribute('aria-label', 'Voice message position');
        wave.setAttribute('aria-valuemin', '0');
        wave.setAttribute('aria-valuemax', String(Math.round(meta.duration || 0)));
        wave.tabIndex = 0;
        const peaks = Array.isArray(meta.peaks) && meta.peaks.length ? meta.peaks : Array.from({ length: VOICE_BARS }, () => 0.3);
        const layers = [el('div', 'cr-voice__bars'), el('div', 'cr-voice__bars cr-voice__bars--done')];
        layers.forEach((layer) => {
            peaks.forEach((p) => {
                const bar = el('span', 'cr-voice__bar');
                bar.style.setProperty('--h', String(Math.max(0.12, Math.min(1, Number(p) || 0))));
                layer.appendChild(bar);
            });
            wave.appendChild(layer);
        });
        const progress = player.id === m.id && player.audio ? (player.audio.currentTime / (meta.duration || player.audio.duration || 1)) : 0;
        box.style.setProperty('--p', String(Math.max(0, Math.min(1, progress || 0))));
        const time = el('span', 'cr-voice__time', fmtDuration(player.id === m.id && player.audio && player.audio.currentTime ? player.audio.currentTime : meta.duration));
        const speed = button('cr-voice__speed', `${state.speed}×`, { title: 'Playback speed', data: { 'cr-speed': '1' } });
        box.append(play, wave, time, speed);
        return box;
    }

    async function voiceUrl(m) {
        const cached = player.urls.get(m.attachment_path);
        if (cached && cached.until > Date.now()) return cached.url;
        const { data, error } = await db().storage.from(VOICE_BUCKET).createSignedUrl(m.attachment_path, 3600);
        if (error || !data?.signedUrl) throw error || new Error('No voice URL');
        player.urls.set(m.attachment_path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
        return data.signedUrl;
    }

    function paintPlayer(id) {
        const box = document.querySelector(`[data-cr-voice="${id}"]`);
        const m = state.messages.get(id);
        if (!box || !m) return;
        const a = player.audio;
        const playing = player.id === id && a && !a.paused;
        const dur = Number(m.attachment_meta?.duration) || (a && Number.isFinite(a.duration) ? a.duration : 0) || 1;
        const t = player.id === id && a ? a.currentTime : 0;
        box.style.setProperty('--p', String(Math.max(0, Math.min(1, t / dur))));
        box.classList.toggle('is-playing', playing);
        const ic = box.querySelector('.cr-voice__play .ph');
        if (ic) ic.className = `ph ${playing ? 'ph-pause' : 'ph-play'}`;
        const time = box.querySelector('.cr-voice__time');
        if (time) time.textContent = fmtDuration(t > 0 ? t : m.attachment_meta?.duration);
    }

    function stopPlayback() {
        const prev = player.id;
        if (player.audio) player.audio.pause();
        player.id = null;
        if (prev) paintPlayer(prev);
    }

    async function togglePlay(id, seekTo) {
        const m = state.messages.get(id);
        if (!isVoice(m)) return;
        if (!player.audio) {
            player.audio = new Audio();
            player.audio.preload = 'auto';
            player.audio.addEventListener('timeupdate', () => player.id && paintPlayer(player.id));
            player.audio.addEventListener('pause', () => player.id && paintPlayer(player.id));
            player.audio.addEventListener('play', () => player.id && paintPlayer(player.id));
            player.audio.addEventListener('ended', () => {
                const done = player.id;
                player.audio.currentTime = 0;
                player.id = null;
                if (done) paintPlayer(done);
                playNextVoice(done);
            });
        }
        const a = player.audio;
        if (player.id === id && seekTo === undefined) {
            if (a.paused) a.play().catch(() => null); else a.pause();
            return;
        }
        const prev = player.id;
        a.pause();
        player.id = id;
        if (prev && prev !== id) paintPlayer(prev);
        try {
            const url = await voiceUrl(m);
            if (a.src !== url) a.src = url;
            a.playbackRate = state.speed;
            if (seekTo !== undefined) {
                const dur = Number(m.attachment_meta?.duration) || 0;
                const apply = () => { try { a.currentTime = Math.max(0, Math.min(dur, seekTo * dur)); } catch (_e) { /* not seekable yet */ } };
                if (a.readyState >= 1) apply(); else a.addEventListener('loadedmetadata', apply, { once: true });
            }
            await a.play();
        } catch (_err) {
            player.id = null;
            paintPlayer(id);
            toast('Error', 'Voice message could not play. Check your connection.');
        }
    }

    // Like WhatsApp: when a voice note ends, the next one in the chat plays.
    function playNextVoice(id) {
        const m = state.messages.get(id);
        if (!m) return;
        const next = messagesIn(keyOf(m)).find((x) => ts(x) > ts(m) && isVoice(x) && x.user_id === m.user_id);
        if (next && ts(next) - ts(m) < 10 * 60 * 1000) togglePlay(next.id);
    }

    // ── Voice notes: recorder ────────────────────────────────────────────
    async function startRecording(target) {
        if (state.rec) return;
        if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
            toast('Error', 'This browser cannot record voice notes.');
            return;
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        } catch (_err) {
            toast('Error', 'Allow microphone access to record a voice note.');
            return;
        }
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
            .find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
        let recorder;
        try {
            recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
        } catch (_err) {
            stream.getTracks().forEach((t) => t.stop());
            toast('Error', 'This browser cannot record voice notes.');
            return;
        }
        const rec = { target, recorder, stream, chunks: [], levels: [], started: Date.now(), mime: recorder.mimeType || mime || 'audio/webm' };
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
            try {
                rec.ctx = new AC();
                const src = rec.ctx.createMediaStreamSource(stream);
                rec.analyser = rec.ctx.createAnalyser();
                rec.analyser.fftSize = 512;
                src.connect(rec.analyser);
                rec.buf = new Uint8Array(rec.analyser.fftSize);
            } catch (_e) { rec.ctx = null; }
        }
        rec.timer = setInterval(() => tickRecording(rec), 100);
        state.rec = rec;
        stopPlayback();
        recorder.start(250);
        render({ keepScroll: true });
    }

    function tickRecording(rec) {
        let level = 0.2 + Math.random() * 0.2;
        if (rec.analyser) {
            rec.analyser.getByteTimeDomainData(rec.buf);
            let sum = 0;
            for (let i = 0; i < rec.buf.length; i += 1) { const v = (rec.buf[i] - 128) / 128; sum += v * v; }
            level = Math.min(1, Math.sqrt(sum / rec.buf.length) * 4);
        }
        rec.levels.push(level);
        const elapsed = Date.now() - rec.started;
        const time = $('crRecTime');
        if (time) time.textContent = fmtDuration(elapsed / 1000);
        const wave = $('crRecWave');
        if (wave) {
            const bar = el('span', 'cr-rec__bar');
            bar.style.setProperty('--h', String(Math.max(0.1, level)));
            wave.appendChild(bar);
            while (wave.childElementCount > 60) wave.firstElementChild.remove();
        }
        if (elapsed >= VOICE_MAX_MS) finishRecording(true);
    }

    function finishRecording(sendIt) {
        const rec = state.rec;
        if (!rec) return;
        state.rec = null;
        clearInterval(rec.timer);
        const seconds = (Date.now() - rec.started) / 1000;
        const done = () => {
            rec.stream.getTracks().forEach((t) => t.stop());
            if (rec.ctx) rec.ctx.close().catch(() => null);
            if (!sendIt) return;
            if (seconds < 1) { toast('Info', 'Voice note too short. Hold on a little longer.'); return; }
            const blob = new Blob(rec.chunks, { type: rec.mime });
            const step = rec.levels.length / VOICE_BARS;
            const raw = Array.from({ length: VOICE_BARS }, (_, i) => {
                const slice = rec.levels.slice(Math.floor(i * step), Math.max(Math.floor(i * step) + 1, Math.floor((i + 1) * step)));
                return slice.length ? Math.max(...slice) : 0;
            });
            const top = Math.max(0.05, ...raw);
            const peaks = raw.map((v) => Math.round((v / top) * 100) / 100);
            const replyTo = rec.target === 'main' ? (isDm(state.active) ? state.replyTo : null) : (state.threadReplyTo || rec.target);
            sendVoice(blob, { kind: 'audio', duration: Math.round(seconds * 10) / 10, peaks, mime: rec.mime }, replyTo).then((ok) => {
                if (ok && rec.target === 'main') state.replyTo = null;
                if (ok && rec.target !== 'main') state.expanded.add(rec.target);
                render({ keepScroll: !isDm(state.active) || rec.target !== 'main', toBottom: isDm(state.active) });
            });
        };
        if (rec.recorder.state !== 'inactive') {
            rec.recorder.addEventListener('stop', done, { once: true });
            try { rec.recorder.stop(); } catch (_e) { done(); }
        } else {
            done();
        }
        render({ keepScroll: true });
    }

    function recordingBar() {
        const bar = el('div', 'cr-rec');
        bar.setAttribute('role', 'status');
        bar.append(
            button('cr-tool cr-tool--danger cr-rec__cancel', '', { icon: 'ph ph-trash', title: 'Discard voice note', data: { 'cr-rec-cancel': '1' } }),
            el('span', 'cr-rec__dot'),
        );
        const time = el('span', 'cr-rec__time', fmtDuration((Date.now() - (state.rec?.started || Date.now())) / 1000));
        time.id = 'crRecTime';
        const wave = el('span', 'cr-rec__wave');
        wave.id = 'crRecWave';
        (state.rec?.levels || []).slice(-60).forEach((level) => {
            const b = el('span', 'cr-rec__bar');
            b.style.setProperty('--h', String(Math.max(0.1, level)));
            wave.appendChild(b);
        });
        const send = button('cr-send', '', { icon: 'ph ph-paper-plane-right', title: 'Send voice note', data: { 'cr-rec-send': '1' } });
        bar.append(time, wave, send);
        return bar;
    }

    // Mic when the box is empty, send arrow once there is text (WhatsApp style).
    function sendOrMic(target, hasText) {
        const wrap = el('span', `cr-sendwrap${hasText ? ' has-text' : ''}`);
        const sendBtn = el('button', 'cr-send cr-send--text');
        sendBtn.type = 'submit';
        sendBtn.setAttribute('aria-label', 'Send');
        sendBtn.appendChild(icon('ph ph-paper-plane-right'));
        const mic = button('cr-send cr-send--mic', '', { icon: 'ph ph-microphone', title: 'Record a voice note', data: { 'cr-mic': target } });
        wrap.append(sendBtn, mic);
        return wrap;
    }

    // ── Shared message pieces ────────────────────────────────────────────
    function messageText(m) {
        if (isVoice(m)) return voicePlayer(m);
        const text = el('div', 'cr-msg__text');
        linkify(text, String(m.content || ''));
        if (m.edited_at) text.appendChild(el('span', 'cr-msg__edited', ' (edited)'));
        return text;
    }

    function editForm(m) {
        const form = el('form', 'cr-edit');
        form.setAttribute('data-cr-edit-form', m.id);
        const ta = el('textarea', 'cr-input cr-edit__input');
        ta.value = m.content || '';
        ta.rows = Math.min(8, String(m.content || '').split('\n').length + 1);
        ta.setAttribute('aria-label', 'Edit message');
        ta.id = 'crEditInput';
        const actions = el('div', 'cr-edit__actions');
        actions.append(emojiButton('crEditInput'), el('span', 'cr-hint', 'Enter to save, Esc to cancel'), button('cr-btn cr-btn--ghost', 'Cancel', { data: { 'cr-cancel-edit': '1' } }));
        const save = el('button', 'cr-btn cr-btn--primary', 'Save');
        save.type = 'submit';
        actions.appendChild(save);
        form.append(ta, actions);
        return form;
    }

    function deleteConfirm(m) {
        const c = el('div', 'cr-confirm');
        c.append(el('span', '', 'Delete this message for everyone?'), button('cr-btn cr-btn--ghost', 'Keep', { data: { 'cr-cancel-delete': '1' } }), button('cr-btn cr-btn--danger', 'Delete', { data: { 'cr-delete-yes': m.id } }));
        return c;
    }

    function toolsFor(m, withReply) {
        const own = m.user_id === state.me;
        const tools = el('div', 'cr-msg__tools');
        tools.setAttribute('role', 'toolbar');
        tools.setAttribute('aria-label', 'Message actions');
        if (withReply) tools.appendChild(button('cr-tool', '', { icon: 'ph ph-arrow-bend-up-left', title: 'Reply', data: { 'cr-reply': m.id } }));
        tools.appendChild(button('cr-tool', '', { icon: m.pinned ? 'ph ph-push-pin-slash' : 'ph ph-push-pin', title: m.pinned ? 'Unpin' : 'Pin', data: { 'cr-pin': m.id } }));
        if (own && !isVoice(m)) tools.appendChild(button('cr-tool', '', { icon: 'ph ph-pencil-simple', title: 'Edit', data: { 'cr-edit': m.id } }));
        if (own) tools.appendChild(button('cr-tool cr-tool--danger', '', { icon: 'ph ph-trash', title: 'Delete', data: { 'cr-delete': m.id } }));
        return tools;
    }

    const whoOf = (m) => (m.user_id === state.me ? 'You' : (m.username || memberName(m.user_id)));
    const isMention = (m) => Array.isArray(m.mentions) && m.mentions.includes(state.me);

    // ── Channel boards: posts with threaded replies (Facebook / Quora style) ──
    function renderBoard(key, msgs, newSince) {
        const list = el('div', 'cr-messages cr-board');
        list.id = 'crMessages';
        list.setAttribute('aria-label', `Posts in ${conversationTitle(key)}`);
        const repliesBy = new Map();
        const roots = [];
        msgs.forEach((m) => {
            const root = rootOf(m);
            if (root.id === m.id) { roots.push(m); return; }
            if (!repliesBy.has(root.id)) repliesBy.set(root.id, []);
            repliesBy.get(root.id).push(m);
        });
        // Freshest conversation first: a new reply lifts its post to the top.
        const activity = (r) => Math.max(ts(r), ...(repliesBy.get(r.id) || []).map(ts));
        roots.sort((a, b) => activity(b) - activity(a));
        if (!roots.length) {
            const empty = el('div', 'cr-empty');
            empty.appendChild(icon('ph ph-chats-circle'));
            empty.appendChild(el('p', 'cr-empty__title', `No posts in ${conversationTitle(key)} yet`));
            empty.appendChild(el('p', 'cr-empty__sub', key.startsWith('show:') ? 'Share the rider, set times, travel plans and anything the crew needs for this show.' : 'Start a post above. Replies stay together under each post.'));
            list.appendChild(empty);
        }
        roots.forEach((r) => list.appendChild(renderPost(r, repliesBy.get(r.id) || [], newSince)));
        if (state.hasOlder) list.appendChild(button('cr-older', 'Load older posts', { data: { 'cr-older': '1' } }));
        return list;
    }

    function renderPost(m, replies, newSince) {
        const own = m.user_id === state.me;
        const fresh = newSince && ts(m) > newSince && !own;
        const post = el('article', `cr-post${m.pinned ? ' is-pinned' : ''}${isMention(m) ? ' is-mention' : ''}${fresh ? ' is-new' : ''}`);
        post.id = `cr-msg-${m.id}`;
        post.setAttribute('data-cr-msg', m.id);
        post.tabIndex = -1;
        const head = el('header', 'cr-post__head');
        head.appendChild(avatar(own ? myName() : (m.username || memberName(m.user_id)), m.user_id, 'md'));
        const who = el('div', 'cr-post__who');
        who.appendChild(el('span', 'cr-post__name', whoOf(m)));
        const meta = el('span', 'cr-post__meta');
        const time = el('time', '', timeAgo(ts(m)));
        time.setAttribute('datetime', m.created_at);
        time.title = new Date(ts(m)).toLocaleString('en-GB');
        meta.appendChild(time);
        if (m.edited_at) meta.appendChild(el('span', '', ' · edited'));
        if (m.pinned) { const pin = el('span', 'cr-msg__pinned'); pin.append(icon('ph ph-push-pin'), el('span', '', 'Pinned')); meta.appendChild(pin); }
        if (fresh) meta.appendChild(el('span', 'cr-new', 'New'));
        who.appendChild(meta);
        head.appendChild(who);
        if (state.editing !== m.id) head.appendChild(toolsFor(m, false));
        post.appendChild(head);

        const body = el('div', 'cr-post__body');
        body.appendChild(state.editing === m.id ? editForm(m) : messageText(m));
        if (state.confirmDelete === m.id) body.appendChild(deleteConfirm(m));
        post.appendChild(body);

        const bar = el('div', 'cr-post__bar');
        const replyBtn = button('cr-post__act', 'Reply', { icon: 'ph ph-chat-circle', data: { 'cr-reply': m.id } });
        bar.appendChild(replyBtn);
        if (replies.length) {
            const people = [...new Set(replies.map((x) => x.user_id))].slice(0, 3);
            const faces = el('span', 'cr-post__faces');
            people.forEach((uid) => faces.appendChild(avatar(uid === state.me ? myName() : memberName(uid), uid, 'xs')));
            const toggle = button('cr-post__count', `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`, { data: { 'cr-expand': m.id } });
            toggle.prepend(faces);
            bar.appendChild(toggle);
        }
        post.appendChild(bar);

        const hasThreadUi = replies.length || state.thread === m.id;
        if (hasThreadUi) {
            const thread = el('div', 'cr-thread');
            const expanded = state.expanded.has(m.id) || replies.length <= 2;
            const shown = expanded ? replies : replies.slice(-2);
            if (!expanded) thread.appendChild(button('cr-thread__more', `View ${replies.length - 2} earlier ${replies.length - 2 === 1 ? 'reply' : 'replies'}`, { icon: 'ph ph-arrow-elbow-down-right', data: { 'cr-expand': m.id } }));
            shown.forEach((c) => thread.appendChild(renderComment(c, m, newSince)));
            if (state.thread === m.id) thread.appendChild(replyBox(m));
            post.appendChild(thread);
        }
        return post;
    }

    function renderComment(c, root, newSince) {
        const own = c.user_id === state.me;
        const fresh = newSince && ts(c) > newSince && !own;
        const row = el('div', `cr-comment${isMention(c) ? ' is-mention' : ''}${fresh ? ' is-new' : ''}`);
        row.id = `cr-msg-${c.id}`;
        row.setAttribute('data-cr-msg', c.id);
        row.tabIndex = -1;
        row.appendChild(avatar(own ? myName() : (c.username || memberName(c.user_id)), c.user_id, 'sm'));
        const main = el('div', 'cr-comment__main');
        if (state.editing === c.id) {
            main.appendChild(editForm(c));
        } else {
            const bubble = el('div', 'cr-comment__bubble');
            const name = el('span', 'cr-comment__name', whoOf(c));
            bubble.appendChild(name);
            if (c.reply_to && c.reply_to !== root.id) {
                const parent = state.messages.get(c.reply_to);
                if (parent) {
                    const to = el('button', 'cr-comment__to');
                    to.type = 'button';
                    to.setAttribute('data-cr-jump', parent.id);
                    to.append(icon('ph ph-arrow-bend-up-left'), el('span', '', whoOf(parent)));
                    bubble.appendChild(to);
                }
            }
            bubble.appendChild(messageText(c));
            main.appendChild(bubble);
            const meta = el('div', 'cr-comment__meta');
            const time = el('time', '', timeAgo(ts(c)));
            time.setAttribute('datetime', c.created_at);
            time.title = new Date(ts(c)).toLocaleString('en-GB');
            meta.appendChild(time);
            if (c.pinned) meta.appendChild(el('span', 'cr-msg__pinned', 'Pinned'));
            meta.appendChild(button('cr-comment__act', 'Reply', { data: { 'cr-reply': c.id } }));
            meta.appendChild(button('cr-comment__act', c.pinned ? 'Unpin' : 'Pin', { data: { 'cr-pin': c.id } }));
            if (own && !isVoice(c)) meta.appendChild(button('cr-comment__act', 'Edit', { data: { 'cr-edit': c.id } }));
            if (own) meta.appendChild(button('cr-comment__act cr-comment__act--danger', 'Delete', { data: { 'cr-delete': c.id } }));
            if (fresh) meta.appendChild(el('span', 'cr-new', 'New'));
            main.appendChild(meta);
        }
        if (state.confirmDelete === c.id) main.appendChild(deleteConfirm(c));
        row.appendChild(main);
        return row;
    }

    function replyBox(root) {
        const form = el('form', 'cr-replybox');
        form.setAttribute('data-cr-reply-form', root.id);
        form.appendChild(avatar(myName(), state.me, 'sm'));
        if (state.rec && state.rec.target === root.id) {
            form.appendChild(recordingBar());
            return form;
        }
        const field = el('div', 'cr-replybox__field');
        const ta = el('textarea', 'cr-input cr-replybox__input');
        ta.id = 'crReplyInput';
        ta.rows = 1;
        ta.maxLength = 4000;
        const target = state.threadReplyTo ? state.messages.get(state.threadReplyTo) : null;
        ta.placeholder = target && target.id !== root.id ? `Reply to ${whoOf(target)}…` : 'Write a reply…';
        ta.setAttribute('aria-label', 'Reply');
        ta.value = state.replyDraft || '';
        field.append(ta, emojiButton('crReplyInput'));
        form.append(field, sendOrMic(root.id, !!ta.value.trim()));
        return form;
    }

    // ── Direct messages: chat bubbles (WhatsApp style) ───────────────────
    function ticks(m, key) {
        const span = el('span', 'cr-ticks');
        if (String(m.id).startsWith('local-')) { span.appendChild(icon('ph ph-clock')); span.title = 'Sending'; return span; }
        const read = (state.partnerRead[key] || 0) >= ts(m);
        span.appendChild(icon(read ? 'ph ph-checks' : 'ph ph-check'));
        span.classList.toggle('is-read', read);
        span.title = read ? 'Read' : 'Sent';
        span.setAttribute('aria-label', span.title);
        return span;
    }

    function renderDm(key, msgs, newSince) {
        const list = el('div', 'cr-messages cr-dm');
        list.id = 'crMessages';
        list.setAttribute('role', 'log');
        list.setAttribute('aria-live', 'polite');
        list.setAttribute('aria-label', `Messages with ${conversationTitle(key)}`);
        if (state.hasOlder) list.appendChild(button('cr-older', 'Load older messages', { data: { 'cr-older': '1' } }));
        if (!msgs.length) {
            const empty = el('div', 'cr-empty');
            empty.appendChild(icon('ph ph-lock-simple'));
            empty.appendChild(el('p', 'cr-empty__title', `Start a conversation with ${memberName(key.slice(3))}`));
            empty.appendChild(el('p', 'cr-empty__sub', 'Only the two of you can see these messages. Send a text or hold the mic for a voice note.'));
            list.appendChild(empty);
        }
        const unread = newSince ? msgs.filter((m) => ts(m) > newSince && m.user_id !== state.me).length : 0;
        let prev = null;
        let bannerShown = false;
        msgs.forEach((m, i) => {
            const t = ts(m);
            if (!prev || dayKey(ts(prev)) !== dayKey(t)) {
                const sep = el('div', 'cr-daypill');
                sep.appendChild(el('span', '', dayLabel(t)));
                list.appendChild(sep);
                prev = null;
            }
            if (!bannerShown && unread && t > newSince && m.user_id !== state.me) {
                list.appendChild(el('div', 'cr-unreadbar', `${unread} unread message${unread === 1 ? '' : 's'}`));
                bannerShown = true;
                prev = null;
            }
            const own = m.user_id === state.me;
            const next = msgs[i + 1];
            const first = !prev || prev.user_id !== m.user_id || t - ts(prev) > GROUP_GAP_MS;
            const last = !next || next.user_id !== m.user_id || ts(next) - t > GROUP_GAP_MS || dayKey(ts(next)) !== dayKey(t);
            const row = el('div', `cr-b${own ? ' is-own' : ''}${first ? ' is-first' : ''}${last ? ' is-last' : ''}${m.pinned ? ' is-pinned' : ''}`);
            row.id = `cr-msg-${m.id}`;
            row.setAttribute('data-cr-msg', m.id);
            row.tabIndex = -1;
            const bubble = el('div', `cr-bubble${first ? ' has-tail' : ''}${isVoice(m) ? ' is-voice' : ''}`);
            bubble.setAttribute('data-cr-swipe', m.id);
            if (m.reply_to) bubble.appendChild(quote(m.reply_to, 'cr-quote cr-quote--bubble'));
            if (state.editing === m.id) {
                bubble.appendChild(editForm(m));
            } else {
                bubble.appendChild(messageText(m));
                const meta = el('span', 'cr-bubble__meta');
                if (m.pinned) meta.appendChild(icon('ph ph-push-pin'));
                const time = el('time', '', clock(t));
                time.setAttribute('datetime', m.created_at);
                meta.appendChild(time);
                if (own) meta.appendChild(ticks(m, key));
                bubble.appendChild(meta);
            }
            if (state.confirmDelete === m.id) bubble.appendChild(deleteConfirm(m));
            row.appendChild(bubble);
            if (state.editing !== m.id) row.appendChild(toolsFor(m, true));
            list.appendChild(row);
            prev = m;
        });
        if (isTyping(key)) list.appendChild(typingBubble());
        return list;
    }

    function renderConversation() {
        const key = state.active;
        const dm = isDm(key);
        const main = el('section', `cr-main${dm ? ' is-dm' : ' is-board'}`);
        main.setAttribute('aria-label', conversationTitle(key));

        const head = el('header', 'cr-main__head');
        head.appendChild(button('cr-back', '', { icon: 'ph ph-caret-left', title: 'All conversations', data: { 'cr-back': '1' } }));
        const ch = CHANNELS.find((c) => c.key === key);
        let lead;
        if (ch) { lead = el('span', 'cr-convo__icon cr-convo__icon--lg'); lead.appendChild(icon(`ph ${ch.icon}`)); }
        else if (dm) {
            lead = el('span', 'cr-avatarwrap');
            lead.appendChild(avatar(memberName(key.slice(3)), key.slice(3), 'md'));
            const dot = el('span', 'cr-online');
            dot.setAttribute('data-cr-online', key.slice(3));
            dot.hidden = !state.online.has(key.slice(3));
            lead.appendChild(dot);
        } else { lead = el('span', 'cr-convo__icon cr-convo__icon--lg'); lead.appendChild(icon('ph ph-microphone-stage')); }
        const titles = el('div', 'cr-main__titles');
        titles.appendChild(el('h3', 'cr-main__title', conversationTitle(key)));
        let sub = '';
        if (ch) sub = ch.blurb;
        else if (dm) {
            const m = state.members.find((x) => x.userId === key.slice(3));
            sub = `Private between you and ${memberName(key.slice(3))}${m?.roleLabel ? ` · ${m.roleLabel}` : ''}`;
        } else sub = 'Show discussion for the whole crew';
        const subEl = el('p', 'cr-main__sub', liveStatus(key) || sub);
        subEl.id = 'crMainSub';
        subEl.dataset.base = sub;
        if (liveStatus(key)) subEl.classList.add('is-live');
        titles.appendChild(subEl);
        head.append(lead, titles);
        const pins = messagesIn(key).filter((m) => m.pinned);
        const pinBtn = button(`cr-btn cr-btn--ghost cr-pins-btn${state.showPins ? ' is-on' : ''}`, pins.length ? `Pinned ${pins.length}` : 'Pinned', { icon: 'ph ph-push-pin', data: { 'cr-toggle-pins': '1' } });
        pinBtn.setAttribute('aria-pressed', state.showPins ? 'true' : 'false');
        head.appendChild(pinBtn);
        main.appendChild(head);

        if (key.startsWith('show:')) main.appendChild(renderShowStrip(key));

        if (state.showPins) {
            const panel = el('div', 'cr-pins');
            if (!pins.length) panel.appendChild(el('p', 'cr-pins__empty', 'Nothing pinned yet. Pin a message to keep it at hand here.'));
            pins.slice().reverse().forEach((p) => panel.appendChild(quote(p.id, 'cr-quote cr-quote--pin')));
            main.appendChild(panel);
        }

        const msgs = messagesIn(key);
        const newSince = state.newMark?.key === key ? state.newMark.at : 0;
        if (dm) {
            main.appendChild(renderDm(key, msgs, newSince));
            main.appendChild(renderComposer(key));
        } else {
            main.appendChild(renderComposer(key));
            main.appendChild(renderBoard(key, msgs, newSince));
        }
        return main;
    }

    function renderComposer(key) {
        const dm = isDm(key);
        const form = el('form', `cr-compose${dm ? '' : ' cr-compose--post'}`);
        form.id = 'crCompose';
        if (dm && state.replyTo) {
            const bar = el('div', 'cr-compose__reply');
            const q = state.messages.get(state.replyTo);
            const label = el('span', 'cr-compose__reply-text');
            label.append(icon('ph ph-arrow-bend-up-left'), el('span', '', `Replying to ${q ? (q.user_id === state.me ? 'yourself' : (q.username || memberName(q.user_id))) : 'a message'}: `), el('span', 'cr-compose__reply-quote', previewText(q)));
            bar.append(label, button('cr-tool', '', { icon: 'ph ph-x', title: 'Cancel reply', data: { 'cr-cancel-reply': '1' } }));
            form.appendChild(bar);
        }
        if (state.rec && state.rec.target === 'main') {
            form.appendChild(recordingBar());
            return form;
        }
        const row = el('div', 'cr-compose__row');
        const ta = el('textarea', 'cr-input');
        ta.id = 'crInput';
        ta.rows = 1;
        ta.maxLength = 4000;
        ta.placeholder = dm ? `Message ${memberName(key.slice(3))}` : `Start a post in ${conversationTitle(key)}…`;
        ta.setAttribute('aria-label', dm ? 'Message' : 'New post');
        ta.value = state.drafts?.[key] || '';
        if (!dm) row.appendChild(avatar(myName(), state.me, 'md'));
        row.append(emojiButton('crInput'), ta, sendOrMic('main', !!ta.value.trim()));
        form.appendChild(row);
        const pop = el('div', 'cr-mentions');
        pop.id = 'crMentions';
        pop.hidden = true;
        pop.setAttribute('role', 'listbox');
        form.appendChild(pop);
        form.appendChild(el('p', 'cr-hint cr-compose__hint', dm
            ? 'Enter to send, Shift+Enter for a new line. Tap the mic for a voice note.'
            : (others().length ? 'Posts go to the whole crew. Replies stay under each post. @ to mention someone.' : 'Posts go to the whole crew. Replies stay under each post.')));
        return form;
    }

    function renderNoTeam() {
        const box = el('div', 'cr-noteam card');
        box.appendChild(icon('ph ph-users-three'));
        box.appendChild(el('h2', 'cr-noteam__title', 'Crew chat works inside a team'));
        box.appendChild(el('p', 'cr-noteam__sub', 'Create a team for your crew, or join one with an invite code. Everyone in the team can then talk in channels, discuss each show and message each other one to one.'));
        const actions = el('div', 'cr-noteam__actions');
        actions.append(button('btn-primary', 'Create a team', { icon: 'ph ph-plus', data: { 'cr-team': 'create' } }), button('action-btn', 'Join with a code', { icon: 'ph ph-key', data: { 'cr-team': 'join' } }));
        box.appendChild(actions);
        return box;
    }

    function render(opts = {}) {
        const root = $('crewRoot');
        if (!root) return;
        const sum = summary();
        updateBadges(sum);
        if (!isOpen() && !opts.force) return;

        const prevList = $('crMessages');
        const prevScroll = prevList ? prevList.scrollTop : 0;
        const prevHeight = prevList ? prevList.scrollHeight : 0;
        const focusId = document.activeElement?.id;
        const input = $('crInput');
        if (input && state.active) {
            state.drafts = state.drafts || {};
            state.drafts[state.active] = input.value;
        }
        const selStart = input?.selectionStart;
        const replyInput = $('crReplyInput');
        if (replyInput && !opts.focusReply) state.replyDraft = replyInput.value;
        const replySel = replyInput?.selectionStart;

        if (!state.teamId) {
            root.replaceChildren(renderNoTeam());
            root.classList.remove('is-ready');
            return;
        }
        if (!state.loaded) {
            const box = el('div', 'cr-loading card');
            box.appendChild(el('p', '', state.error || 'Loading crew chat…'));
            if (state.error) box.appendChild(button('action-btn', 'Try again', { data: { 'cr-retry': '1' } }));
            root.replaceChildren(box);
            return;
        }
        if (!state.active) {
            state.active = restoreActive(sum);
            state.newMark = { key: state.active, at: state.reads[state.active] || 0 };
        }
        root.classList.add('is-ready');
        root.classList.toggle('is-list', state.listOpenOnPhone);
        root.replaceChildren(renderSidebar(sum), renderConversation());

        // Chats read bottom-up like WhatsApp; boards read top-down with the
        // freshest post first.
        const list = $('crMessages');
        if (list) {
            const dm = isDm(state.active);
            if (opts.keepScroll && prevList && !opts.toBottom && !opts.toTop) list.scrollTop = prevScroll + (opts.prepend && dm ? list.scrollHeight - prevHeight : 0);
            else if (dm) list.scrollTop = list.scrollHeight;
            else list.scrollTop = 0;
        }
        const nextInput = $('crInput');
        if (nextInput) {
            autosize(nextInput);
            if (focusId === 'crInput') {
                nextInput.focus({ preventScroll: true });
                if (typeof selStart === 'number') nextInput.setSelectionRange(selStart, selStart);
            }
        }
        const nextReply = $('crReplyInput');
        if (nextReply) {
            autosize(nextReply);
            if (focusId === 'crReplyInput' || opts.focusReply) {
                nextReply.focus({ preventScroll: true });
                const at = typeof replySel === 'number' && !opts.focusReply ? replySel : nextReply.value.length;
                nextReply.setSelectionRange(at, at);
                if (opts.focusReply) nextReply.closest('.cr-replybox')?.scrollIntoView({ block: 'nearest' });
            }
        }
        const edit = $('crEditInput');
        if (edit) {
            edit.focus({ preventScroll: true });
            edit.setSelectionRange(edit.value.length, edit.value.length);
            edit.closest('[data-cr-msg]')?.scrollIntoView({ block: 'nearest' });
        }
        root.querySelector('.cr-confirm')?.scrollIntoView({ block: 'nearest' });
    }

    function restoreActive(sum) {
        let saved = null;
        try { saved = localStorage.getItem(`${ACTIVE_KEY}:${state.teamId}`); } catch (_e) { /* storage blocked */ }
        if (saved && (CHANNELS.some((c) => c.key === saved) || sum.has(saved) || bookingFor(saved) || (saved.startsWith('dm:') && others().some((m) => `dm:${m.userId}` === saved)))) return saved;
        return 'general';
    }

    function openConversation(key) {
        if (!key) return;
        const input = $('crInput');
        if (input && state.active) { state.drafts = state.drafts || {}; state.drafts[state.active] = input.value; }
        state.newMark = { key, at: state.reads[key] || 0 };
        state.active = key;
        state.replyTo = null;
        state.editing = null;
        state.confirmDelete = null;
        state.showPins = false;
        state.listOpenOnPhone = false;
        state.thread = null;
        state.threadReplyTo = null;
        state.replyDraft = '';
        state.expanded = new Set();
        if (state.rec) finishRecording(false);
        try { localStorage.setItem(`${ACTIVE_KEY}:${state.teamId}`, key); } catch (_e) { /* storage blocked */ }
        const at = noteRead(key);
        render();
        if (at) markRead(key, at);
        const nextInput = $('crInput');
        if (nextInput && window.matchMedia?.('(min-width: 900px)').matches) nextInput.focus({ preventScroll: true });
    }

    function autosize(ta) {
        ta.style.setProperty('height', 'auto');
        ta.style.setProperty('height', `${Math.min(ta.scrollHeight, 180)}px`);
    }

    // ── Mentions popup ───────────────────────────────────────────────────
    function updateMentionPopup(ta) {
        const pop = $('crMentions');
        if (!pop) return;
        const before = ta.value.slice(0, ta.selectionStart);
        const m = before.match(/(^|\s)@([^\s@]*)$/);
        const people = others();
        if (!m || !people.length) { pop.hidden = true; state.mention = null; return; }
        const q = m[2].toLowerCase();
        const hits = people.filter((p) => String(p.username || '').toLowerCase().startsWith(q) || String(p.username || '').toLowerCase().includes(q)).slice(0, 6);
        if (!hits.length) { pop.hidden = true; state.mention = null; return; }
        state.mention = { start: before.length - m[2].length - 1, hits, index: Math.min(state.mention?.index || 0, hits.length - 1) };
        pop.replaceChildren();
        hits.forEach((p, i) => {
            const opt = button(`cr-mentions__opt${i === state.mention.index ? ' is-on' : ''}`, '', { data: { 'cr-mention': p.userId } });
            opt.setAttribute('role', 'option');
            opt.setAttribute('aria-selected', i === state.mention.index ? 'true' : 'false');
            opt.append(avatar(p.username, p.userId, 'xs'), el('span', '', p.username || p.email), el('span', 'cr-mentions__role', p.roleLabel || ''));
            pop.appendChild(opt);
        });
        pop.hidden = false;
    }

    function insertMention(userId) {
        const ta = $('crInput');
        const p = state.members.find((m) => m.userId === userId);
        if (!ta || !p || !state.mention) return;
        const start = state.mention.start;
        const end = ta.selectionStart;
        const insert = `@${p.username} `;
        ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
        const caret = start + insert.length;
        ta.setSelectionRange(caret, caret);
        state.mention = null;
        const pop = $('crMentions');
        if (pop) pop.hidden = true;
        ta.focus();
        autosize(ta);
    }

    // Direct messages quote the message in the composer (WhatsApp). Boards open
    // a reply box under the post; replying to a comment tags its author.
    function startReply(id) {
        const m = state.messages.get(id);
        state.editing = null;
        if (isDm(state.active) || !m) {
            state.replyTo = id;
            render({ keepScroll: true });
            $('crInput')?.focus();
            return;
        }
        const root = rootOf(m);
        const fresh = state.thread !== root.id;
        state.thread = root.id;
        state.threadReplyTo = m.id !== root.id ? m.id : null;
        if (fresh) state.replyDraft = '';
        const tag = m.id !== root.id && m.user_id !== state.me ? `@${m.username || memberName(m.user_id)} ` : '';
        if (tag && !String(state.replyDraft || '').includes(tag.trim())) state.replyDraft = `${tag}${state.replyDraft || ''}`;
        state.expanded.add(root.id);
        render({ keepScroll: true, focusReply: true });
    }

    function closeThreadBox() {
        state.thread = null;
        state.threadReplyTo = null;
        state.replyDraft = '';
        render({ keepScroll: true });
    }

    // Swipe a chat bubble right to reply, like WhatsApp on a phone.
    let swipe = null;
    document.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        const b = event.target.closest?.('[data-cr-swipe]');
        if (!b || event.target.closest('button, a, textarea, [data-cr-seek]')) return;
        swipe = { el: b, id: b.dataset.crSwipe, x: event.clientX, y: event.clientY, dx: 0, live: false };
    }, { passive: true });
    document.addEventListener('pointermove', (event) => {
        if (!swipe) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        if (!swipe.live) {
            if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
            if (dx < 10) return;
            swipe.live = true;
        }
        swipe.dx = Math.max(0, Math.min(96, dx));
        swipe.el.style.setProperty('--dx', `${swipe.dx}px`);
        swipe.el.classList.add('is-swiping');
        swipe.el.classList.toggle('is-armed', swipe.dx >= 64);
    }, { passive: true });
    const endSwipe = () => {
        if (!swipe) return;
        const s = swipe;
        swipe = null;
        s.el.classList.remove('is-swiping', 'is-armed');
        s.el.style.removeProperty('--dx');
        if (s.dx >= 64) startReply(s.id);
    };
    document.addEventListener('pointerup', endSwipe);
    document.addEventListener('pointercancel', endSwipe);

    // ── Events ───────────────────────────────────────────────────────────
    document.addEventListener('click', (event) => {
        const root = $('crewRoot');
        if (!root || !root.contains(event.target)) return;
        const seek = event.target.closest('[data-cr-seek]');
        if (seek) {
            const r = seek.getBoundingClientRect();
            return togglePlay(seek.dataset.crSeek, Math.max(0, Math.min(1, (event.clientX - r.left) / (r.width || 1))));
        }
        const t = event.target.closest('button');
        if (!t) {
            // Tapping a message on touch screens shows its actions.
            const msg = event.target.closest('[data-cr-msg]');
            if (msg && !event.target.closest('a, textarea, form')) {
                root.querySelectorAll('[data-cr-msg].is-touched').forEach((n) => { if (n !== msg) n.classList.remove('is-touched'); });
                msg.classList.toggle('is-touched');
            }
            return;
        }
        const d = t.dataset;
        if (d.crOpen) return openConversation(d.crOpen);
        if (d.crBack) { state.listOpenOnPhone = true; return render(); }
        if (d.crReply) return startReply(d.crReply);
        if (d.crExpand) {
            if (state.expanded.has(d.crExpand)) state.expanded.delete(d.crExpand); else state.expanded.add(d.crExpand);
            return render({ keepScroll: true });
        }
        if (d.crMic) return startRecording(d.crMic);
        if (d.crRecCancel) return finishRecording(false);
        if (d.crRecSend) return finishRecording(true);
        if (d.crPlay) return togglePlay(d.crPlay);
        if (d.crSpeed) {
            state.speed = state.speed === 1 ? 1.5 : state.speed === 1.5 ? 2 : 1;
            if (player.audio) player.audio.playbackRate = state.speed;
            root.querySelectorAll('.cr-voice__speed').forEach((b) => { b.textContent = `${state.speed}×`; });
            return;
        }
        if (d.crCancelReply) { state.replyTo = null; render({ keepScroll: true }); $('crInput')?.focus(); return; }
        if (d.crPin) return togglePin(d.crPin);
        if (d.crEdit) { state.editing = d.crEdit; state.confirmDelete = null; return render({ keepScroll: true }); }
        if (d.crCancelEdit) { state.editing = null; return render({ keepScroll: true }); }
        if (d.crDelete) { state.confirmDelete = d.crDelete; return render({ keepScroll: true }); }
        if (d.crCancelDelete) { state.confirmDelete = null; return render({ keepScroll: true }); }
        if (d.crDeleteYes) return remove(d.crDeleteYes);
        if (d.crTogglePins) { state.showPins = !state.showPins; return render({ keepScroll: true }); }
        if (d.crOlder) return loadOlder().then(() => render({ keepScroll: true, prepend: true }));
        if (d.crMention) return insertMention(d.crMention);
        if (d.crRetry) return loadAll();
        if (d.crTeam === 'create') return sp()?.showCreateTeamForm?.();
        if (d.crTeam === 'join') return sp()?.showJoinTeamForm?.();
        if (d.crJump) {
            const target = $(`cr-msg-${d.crJump}`);
            if (target) {
                state.showPins = false;
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                target.classList.add('is-flash');
                setTimeout(() => target.classList.remove('is-flash'), 1600);
                target.focus({ preventScroll: true });
            }
        }
    });

    document.addEventListener('submit', async (event) => {
        const form = event.target;
        if (form.id === 'crCompose') {
            event.preventDefault();
            const ta = $('crInput');
            const text = String(ta?.value || '').trim();
            if (!text) return;
            ta.value = '';
            if (state.drafts) state.drafts[state.active] = '';
            autosize(ta);
            const ok = await send(text, isDm(state.active) ? {} : { replyTo: null });
            if (!ok && ta) ta.value = text;
            $('crInput')?.focus();
            return;
        }
        const rootId = form.getAttribute?.('data-cr-reply-form');
        if (rootId) {
            event.preventDefault();
            const ta = $('crReplyInput');
            const text = String(ta?.value || '').trim();
            if (!text) return;
            const replyTo = state.threadReplyTo || rootId;
            state.replyDraft = '';
            if (ta) ta.value = '';
            state.expanded.add(rootId);
            const ok = await send(text, { replyTo });
            if (!ok) { state.replyDraft = text; render({ keepScroll: true, focusReply: true }); return; }
            state.threadReplyTo = null;
            render({ keepScroll: true, focusReply: true });
            return;
        }
        const editId = form.getAttribute?.('data-cr-edit-form');
        if (editId) {
            event.preventDefault();
            const text = String($('crEditInput')?.value || '').trim();
            if (!text) { state.confirmDelete = editId; state.editing = null; render({ keepScroll: true }); return; }
            const ok = await saveEdit(editId, text);
            if (ok) { state.editing = null; render({ keepScroll: true }); }
        }
    });

    document.addEventListener('keydown', (event) => {
        const t = event.target;
        if (t?.id === 'crInput') {
            const pop = $('crMentions');
            if (state.mention && pop && !pop.hidden) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const n = state.mention.hits.length;
                    state.mention.index = (state.mention.index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
                    updateMentionPopup(t);
                    return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    insertMention(state.mention.hits[state.mention.index].userId);
                    return;
                }
                if (event.key === 'Escape') { pop.hidden = true; state.mention = null; return; }
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                $('crCompose')?.requestSubmit();
                return;
            }
            if (event.key === 'Escape' && state.replyTo) { state.replyTo = null; render({ keepScroll: true }); return; }
            if (event.key === 'ArrowUp' && !t.value) {
                // Up arrow in an empty box edits your last message, like most chat apps.
                const mine = messagesIn(state.active).filter((m) => m.user_id === state.me).pop();
                if (mine) { event.preventDefault(); state.editing = mine.id; render({ keepScroll: true }); }
            }
            return;
        }
        if (t?.id === 'crReplyInput') {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                t.form?.requestSubmit();
                return;
            }
            if (event.key === 'Escape') { event.preventDefault(); closeThreadBox(); }
            return;
        }
        if (t?.id === 'crEditInput') {
            if (event.key === 'Escape') { event.preventDefault(); state.editing = null; render({ keepScroll: true }); $('crInput')?.focus(); return; }
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                t.form?.requestSubmit();
            }
        }
    });

    document.addEventListener('input', (event) => {
        const id = event.target?.id;
        if (id === 'crInput' || id === 'crReplyInput') {
            event.target.closest('form')?.querySelector('.cr-sendwrap')?.classList.toggle('has-text', !!event.target.value.trim());
        }
        if (id === 'crInput') {
            autosize(event.target);
            updateMentionPopup(event.target);
            if (isDm(state.active) && event.target.value) sendTyping();
        } else if (id === 'crReplyInput') {
            autosize(event.target);
            state.replyDraft = event.target.value;
        } else if (id === 'crEditInput') {
            autosize(event.target);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isOpen() && state.active) {
            const at = noteRead(state.active);
            if (at) { render({ keepScroll: true }); markRead(state.active, at); }
        }
    });

    // ── Public API ───────────────────────────────────────────────────────
    function currentTeam() {
        return sp()?.getActiveTeamId?.() || null;
    }

    function sync() {
        const api = sp();
        if (!api) return;
        const teamId = currentTeam();
        const me = api.getOwnerId?.() || null;
        if (teamId === state.teamId && me === state.me) { render(); return; }
        state.teamId = teamId;
        state.me = me;
        state.messages.clear();
        state.reads = {};
        state.members = [];
        state.active = null;
        state.loaded = false;
        state.drafts = {};
        unsubscribe();
        if (!teamId || !me) { render(); return; }
        loadAll();
        subscribe();
    }

    function open() {
        sync();
        if (state.loaded) {
            if (!state.active) {
                state.active = restoreActive(summary());
                state.newMark = { key: state.active, at: state.reads[state.active] || 0 };
            }
            const at = noteRead(state.active);
            render();
            if (at) markRead(state.active, at);
        } else {
            render({ force: true });
        }
    }

    window.SPCrew = { sync, open, openConversation: (key) => { if (window.showSection) window.showSection('crew'); openConversation(key); } };
    window.addEventListener('sp-supabase-ready', () => setTimeout(sync, 0));
})();
