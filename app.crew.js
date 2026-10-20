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
    };

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
            const [msgRes, readRes, members, teams] = await Promise.all([
                client.from('messages').select('*').eq('team_id', state.teamId).order('created_at', { ascending: false }).limit(PAGE),
                client.from('message_reads').select('channel_key,last_read_at').eq('team_id', state.teamId).eq('user_id', state.me),
                sp().getTeamMembers ? sp().getTeamMembers(state.teamId) : Promise.resolve([]),
                sp().getMyTeams ? sp().getMyTeams({ nullOnError: true }).catch(() => null) : Promise.resolve(null),
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

    async function send(text) {
        const client = db();
        const key = state.active;
        if (!client || !state.teamId || !key || !text) return false;
        const row = {
            team_id: state.teamId,
            user_id: state.me,
            username: myName(),
            content: text,
            msg_type: 'text',
            channel: key.startsWith('dm:') ? 'dm' : key,
            recipient_id: key.startsWith('dm:') ? key.slice(3) : null,
            reply_to: state.replyTo || null,
            mentions: mentionsIn(text),
        };
        const { data, error } = await client.from('messages').insert(row).select();
        if (error) { toast('Error', 'Message not sent. Try again.'); return false; }
        ingest(Array.isArray(data) && data.length ? data : [{ ...row, id: `local-${Date.now()}` }]);
        state.replyTo = null;
        state.reads[key] = Date.now();
        render({ toBottom: true });
        markRead(key);
        return true;
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
        const { error } = await client.from('messages').delete().eq('id', id);
        if (error) { toast('Error', 'Message not deleted. Try again.'); return; }
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
            state.channel = client.channel(`sp-crew-${state.teamId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `team_id=eq.${state.teamId}` }, onChange)
                .subscribe();
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
            const atBottom = nearBottom();
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
        toast('Info', `${text}: ${String(m.content || '').slice(0, 80)}`);
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
            preview = key.startsWith('dm:') && s.last.user_id !== state.me ? s.last.content : `${who}: ${s.last.content}`;
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
        box.append(el('span', 'cr-quote__who', q.user_id === state.me ? 'You' : (q.username || memberName(q.user_id))), el('span', 'cr-quote__text', q.content));
        return box;
    }

    function renderMessage(m, grouped) {
        const own = m.user_id === state.me;
        const row = el('article', `cr-msg${own ? ' is-own' : ''}${grouped ? ' is-grouped' : ''}${m.pinned ? ' is-pinned' : ''}${Array.isArray(m.mentions) && m.mentions.includes(state.me) ? ' is-mention' : ''}`);
        row.id = `cr-msg-${m.id}`;
        row.setAttribute('data-cr-msg', m.id);
        row.tabIndex = -1;
        if (!grouped) row.appendChild(avatar(own ? myName() : (m.username || memberName(m.user_id)), m.user_id, 'md'));
        else row.appendChild(el('span', 'cr-msg__gutter', clock(ts(m))));
        const body = el('div', 'cr-msg__body');
        if (!grouped) {
            const head = el('div', 'cr-msg__head');
            head.append(el('span', 'cr-msg__who', own ? 'You' : (m.username || memberName(m.user_id))), el('time', 'cr-msg__time', clock(ts(m))));
            head.lastChild.setAttribute('datetime', m.created_at);
            if (m.pinned) {
                const pin = el('span', 'cr-msg__pinned');
                pin.append(icon('ph ph-push-pin'), el('span', '', 'Pinned'));
                head.appendChild(pin);
            }
            body.appendChild(head);
        }
        if (m.reply_to) body.appendChild(quote(m.reply_to));

        if (state.editing === m.id) {
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
            body.appendChild(form);
        } else {
            const text = el('div', 'cr-msg__text');
            linkify(text, String(m.content || ''));
            if (m.edited_at) text.appendChild(el('span', 'cr-msg__edited', ' (edited)'));
            body.appendChild(text);
        }

        if (state.confirmDelete === m.id) {
            const c = el('div', 'cr-confirm');
            c.append(el('span', '', 'Delete this message for everyone?'), button('cr-btn cr-btn--ghost', 'Keep', { data: { 'cr-cancel-delete': '1' } }), button('cr-btn cr-btn--danger', 'Delete', { data: { 'cr-delete-yes': m.id } }));
            body.appendChild(c);
        }
        row.appendChild(body);

        if (state.editing !== m.id) {
            const tools = el('div', 'cr-msg__tools');
            tools.setAttribute('role', 'toolbar');
            tools.setAttribute('aria-label', 'Message actions');
            tools.appendChild(button('cr-tool', '', { icon: 'ph ph-arrow-bend-up-left', title: 'Reply', data: { 'cr-reply': m.id } }));
            tools.appendChild(button('cr-tool', '', { icon: m.pinned ? 'ph ph-push-pin-slash' : 'ph ph-push-pin', title: m.pinned ? 'Unpin' : 'Pin', data: { 'cr-pin': m.id } }));
            if (own) {
                tools.appendChild(button('cr-tool', '', { icon: 'ph ph-pencil-simple', title: 'Edit', data: { 'cr-edit': m.id } }));
                tools.appendChild(button('cr-tool cr-tool--danger', '', { icon: 'ph ph-trash', title: 'Delete', data: { 'cr-delete': m.id } }));
            }
            row.appendChild(tools);
        }
        return row;
    }

    function renderConversation(sum) {
        const key = state.active;
        const main = el('section', 'cr-main');
        main.setAttribute('aria-label', conversationTitle(key));

        const head = el('header', 'cr-main__head');
        head.appendChild(button('cr-back', '', { icon: 'ph ph-caret-left', title: 'All conversations', data: { 'cr-back': '1' } }));
        const ch = CHANNELS.find((c) => c.key === key);
        let lead;
        if (ch) { lead = el('span', 'cr-convo__icon cr-convo__icon--lg'); lead.appendChild(icon(`ph ${ch.icon}`)); }
        else if (key.startsWith('dm:')) lead = avatar(memberName(key.slice(3)), key.slice(3), 'md');
        else { lead = el('span', 'cr-convo__icon cr-convo__icon--lg'); lead.appendChild(icon('ph ph-microphone-stage')); }
        const titles = el('div', 'cr-main__titles');
        titles.appendChild(el('h3', 'cr-main__title', conversationTitle(key)));
        let sub = '';
        if (ch) sub = ch.blurb;
        else if (key.startsWith('dm:')) {
            const m = state.members.find((x) => x.userId === key.slice(3));
            sub = `Private between you and ${memberName(key.slice(3))}${m?.roleLabel ? ` · ${m.roleLabel}` : ''}`;
        } else sub = 'Show discussion for the whole crew';
        titles.appendChild(el('p', 'cr-main__sub', sub));
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

        const list = el('div', 'cr-messages');
        list.id = 'crMessages';
        list.setAttribute('role', 'log');
        list.setAttribute('aria-live', 'polite');
        list.setAttribute('aria-label', `Messages in ${conversationTitle(key)}`);
        const msgs = messagesIn(key);
        if (state.hasOlder) list.appendChild(button('cr-older', 'Load older messages', { data: { 'cr-older': '1' } }));
        if (!msgs.length) {
            const empty = el('div', 'cr-empty');
            empty.appendChild(icon('ph ph-chats-circle'));
            empty.appendChild(el('p', 'cr-empty__title', key.startsWith('dm:') ? `Start a conversation with ${memberName(key.slice(3))}` : `No messages in ${conversationTitle(key)} yet`));
            empty.appendChild(el('p', 'cr-empty__sub', key.startsWith('show:') ? 'Share the rider, set times, travel plans and anything the crew needs for this show.' : key.startsWith('dm:') ? 'Only the two of you can see this conversation.' : 'Say hello, share an update or ask the crew a question.'));
            list.appendChild(empty);
        }
        const newSince = state.newMark?.key === key ? state.newMark.at : 0;
        let prev = null;
        let newLineShown = false;
        msgs.forEach((m) => {
            const t = ts(m);
            if (!prev || dayKey(ts(prev)) !== dayKey(t)) {
                const sep = el('div', 'cr-day');
                sep.appendChild(el('span', '', dayLabel(t)));
                list.appendChild(sep);
                prev = null;
            }
            if (!newLineShown && newSince && t > newSince && m.user_id !== state.me) {
                const sep = el('div', 'cr-day cr-day--new');
                sep.appendChild(el('span', '', 'New'));
                list.appendChild(sep);
                newLineShown = true;
                prev = null;
            }
            const grouped = prev && prev.user_id === m.user_id && t - ts(prev) < GROUP_GAP_MS && !m.reply_to;
            list.appendChild(renderMessage(m, grouped));
            prev = m;
        });
        main.appendChild(list);
        main.appendChild(renderComposer(key));
        return main;
    }

    function renderComposer(key) {
        const form = el('form', 'cr-compose');
        form.id = 'crCompose';
        if (state.replyTo) {
            const bar = el('div', 'cr-compose__reply');
            const q = state.messages.get(state.replyTo);
            const label = el('span', 'cr-compose__reply-text');
            label.append(icon('ph ph-arrow-bend-up-left'), el('span', '', `Replying to ${q ? (q.user_id === state.me ? 'yourself' : (q.username || memberName(q.user_id))) : 'a message'}: `), el('span', 'cr-compose__reply-quote', q?.content || ''));
            bar.append(label, button('cr-tool', '', { icon: 'ph ph-x', title: 'Cancel reply', data: { 'cr-cancel-reply': '1' } }));
            form.appendChild(bar);
        }
        const row = el('div', 'cr-compose__row');
        const ta = el('textarea', 'cr-input');
        ta.id = 'crInput';
        ta.rows = 1;
        ta.maxLength = 4000;
        ta.placeholder = key.startsWith('dm:') ? `Message ${memberName(key.slice(3))}` : `Message ${conversationTitle(key)}`;
        ta.setAttribute('aria-label', 'Message');
        ta.value = state.drafts?.[key] || '';
        const sendBtn = el('button', 'cr-send');
        sendBtn.type = 'submit';
        sendBtn.setAttribute('aria-label', 'Send');
        sendBtn.appendChild(icon('ph ph-paper-plane-right'));
        row.append(emojiButton('crInput'), ta, sendBtn);
        form.appendChild(row);
        const pop = el('div', 'cr-mentions');
        pop.id = 'crMentions';
        pop.hidden = true;
        pop.setAttribute('role', 'listbox');
        form.appendChild(pop);
        form.appendChild(el('p', 'cr-hint cr-compose__hint', others().length ? 'Enter to send, Shift+Enter for a new line, @ to mention someone' : 'Enter to send, Shift+Enter for a new line'));
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
        root.replaceChildren(renderSidebar(sum), renderConversation(sum));

        const list = $('crMessages');
        if (list) {
            if (opts.keepScroll && prevList) list.scrollTop = prevScroll + (opts.prepend ? list.scrollHeight - prevHeight : 0);
            else list.scrollTop = list.scrollHeight;
        }
        const nextInput = $('crInput');
        if (nextInput) {
            autosize(nextInput);
            if (focusId === 'crInput') {
                nextInput.focus({ preventScroll: true });
                if (typeof selStart === 'number') nextInput.setSelectionRange(selStart, selStart);
            }
        }
        const edit = $('crEditInput');
        if (edit) {
            edit.focus({ preventScroll: true });
            edit.setSelectionRange(edit.value.length, edit.value.length);
            edit.closest('.cr-msg')?.scrollIntoView({ block: 'nearest' });
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

    // ── Events ───────────────────────────────────────────────────────────
    document.addEventListener('click', (event) => {
        const root = $('crewRoot');
        if (!root || !root.contains(event.target)) return;
        const t = event.target.closest('button');
        if (!t) {
            // Tapping a message on touch screens shows its actions.
            const msg = event.target.closest('[data-cr-msg]');
            if (msg) {
                root.querySelectorAll('.cr-msg.is-touched').forEach((n) => { if (n !== msg) n.classList.remove('is-touched'); });
                msg.classList.toggle('is-touched');
            }
            return;
        }
        const d = t.dataset;
        if (d.crOpen) return openConversation(d.crOpen);
        if (d.crBack) { state.listOpenOnPhone = true; return render(); }
        if (d.crReply) {
            state.replyTo = d.crReply;
            state.editing = null;
            render({ keepScroll: true });
            $('crInput')?.focus();
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
            const ok = await send(text);
            if (!ok && ta) ta.value = text;
            $('crInput')?.focus();
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
        if (t?.id === 'crEditInput') {
            if (event.key === 'Escape') { event.preventDefault(); state.editing = null; render({ keepScroll: true }); $('crInput')?.focus(); return; }
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                t.form?.requestSubmit();
            }
        }
    });

    document.addEventListener('input', (event) => {
        if (event.target?.id === 'crInput') {
            autosize(event.target);
            updateMentionPopup(event.target);
        } else if (event.target?.id === 'crEditInput') {
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
