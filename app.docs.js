/**
 * Star Paper - Documents vault. Every contract, endorsement, travel paper,
 * registration, receipt and piece of show paperwork for the workspace, each
 * with its key dates and a live countdown. Records live in public.documents;
 * their files are versions in public.document_files, stored in the private
 * team-docs bucket at <team id or u-user id>/<document id>/<file>. Sensitive
 * papers (passports, IDs) are only visible to the owner, admins and whoever
 * added them, enforced by the database. Expiries feed the Home alerts and
 * the bell (alerts()), the artist profile (artistBlock()) and the booking
 * form (showForBooking()). DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const BUCKET = 'team-docs';
    const MAX_BYTES = 20 * 1024 * 1024;
    const PHOTO_MAX_SIDE = 2400;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const FILE_TYPES = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

    // What each kind of document records. signed/ends are the labels for
    // signed_on and ends_on (null hides the field); party names the other side.
    const KINDS = [
        { key: 'contract', name: 'Contracts', one: 'Contract', icon: 'ph-file-text', hint: 'Management, booking, label, publishing or producer deals.', party: 'Other side', signed: 'Signed', starts: true, ends: 'Ends', notice: true, keyDates: false, amount: true, sample: 'Management agreement' },
        { key: 'endorsement', name: 'Endorsements', one: 'Endorsement', icon: 'ph-handshake', hint: 'Brand ambassador, campaign and sponsorship deals.', party: 'Brand', signed: 'Signed', starts: true, ends: 'Ends', notice: false, keyDates: true, amount: true, sample: 'MTN ambassador deal' },
        { key: 'travel', name: 'Travel', one: 'Travel document', icon: 'ph-airplane-tilt', hint: 'Passports, visas, yellow fever cards and work permits.', party: 'Holder', signed: 'Issued', starts: false, ends: 'Expires', notice: false, keyDates: false, amount: false, sample: 'Passport' },
        { key: 'registration', name: 'Registrations', one: 'Registration', icon: 'ph-seal-check', hint: 'URSB company and trademark, UPRS and UMPROS membership, copyright, ISRC.', party: 'Registered with', signed: 'Filed', starts: false, ends: 'Renewal due', notice: false, keyDates: false, amount: false, sample: 'URSB trademark' },
        { key: 'money', name: 'Money', one: 'Money paper', icon: 'ph-receipt', hint: 'Receipts, invoices, MoMo statements, URA withholding certificates, bank letters.', party: 'From or to', signed: 'Date', starts: false, ends: null, notice: false, keyDates: false, amount: true, sample: 'Studio receipt' },
        { key: 'show', name: 'Show paperwork', one: 'Show paper', icon: 'ph-ticket', hint: 'Riders, stage plots, permits, police clearance and venue insurance.', party: 'Venue or promoter', signed: null, starts: false, ends: null, notice: false, keyDates: true, amount: false, sample: 'Technical rider' },
        { key: 'other', name: 'Other', one: 'Document', icon: 'ph-file', hint: 'Anything else worth keeping safe.', party: 'Other side', signed: 'Dated', starts: false, ends: 'Expires', notice: false, keyDates: true, amount: false, sample: 'Insurance certificate' },
    ];
    const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
    const FILE_LABELS = ['', 'Draft', 'Signed', 'Scan', 'Receipt', 'Copy'];

    const $ = (id) => document.getElementById(id);
    const sp = () => window.SP || null;
    const db = () => sp()?.client || null;
    const arr = (name) => (Array.isArray(window[name]) ? window[name] : []);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isCloudId = (id) => typeof id === 'string' && UUID_RE.test(id);

    const state = {
        teamId: null,
        me: null,
        docs: [],
        loaded: false,
        loading: false,
        loadedAt: 0,
        error: '',
        view: 'list',
        openId: null,
        kind: 'all',
        due: null,
        artist: null,
        search: '',
        archived: false,
        form: null,
        confirmDelete: null,
        confirmFile: null,
        busy: '',
        bookingId: null,
        pending: null,
        newFileLabel: '',
    };

    // ── Small helpers ────────────────────────────────────────────────────
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        const i = el('i', `ph ${name}`);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function button(className, text, data, iconName) {
        const b = el('button', className);
        b.type = 'button';
        if (iconName) b.appendChild(icon(iconName));
        if (text) b.appendChild(document.createTextNode(text));
        Object.entries(data || {}).forEach(([k, v]) => b.setAttribute(`data-${k}`, String(v)));
        return b;
    }

    function toast(kind, message) {
        const fn = window[kind === 'error' ? 'toastError' : kind === 'warn' ? 'toastWarn' : 'toastSuccess'];
        if (typeof fn === 'function') fn(message);
    }

    function today() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function parseDay(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function fmtDay(value) {
        const d = value instanceof Date ? value : parseDay(value);
        return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    }

    function fmtSize(bytes) {
        const n = Number(bytes) || 0;
        if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        if (n >= 1024) return `${Math.round(n / 1024)} KB`;
        return `${n} B`;
    }

    function ugx(value) {
        return `UGX ${Math.round(Number(value) || 0).toLocaleString('en-US')}`;
    }

    function inDays(days) {
        if (days === 0) return 'today';
        if (days === 1) return 'tomorrow';
        return `in ${days} days`;
    }

    function artistById(id) {
        return id ? arr('artists').find((a) => String(a.id) === String(id)) || null : null;
    }

    function bookingById(id) {
        return id ? arr('bookings').find((b) => String(b.id) === String(id)) || null : null;
    }

    function docById(id) {
        return state.docs.find((d) => d.id === id) || null;
    }

    function filesOf(doc) {
        return (doc?.files || []).slice().sort((a, b) => b.version - a.version || String(b.created_at).localeCompare(String(a.created_at)));
    }

    function canEdit() {
        if (!state.me) return false;
        if (!state.teamId) return true;
        return sp()?.getActiveTeamPermissions?.()?.edit === true;
    }

    // ── Dates and countdowns ─────────────────────────────────────────────
    // Every dated thing about a document that someone may need to act on.
    function eventsOf(doc) {
        const kind = KIND[doc.kind] || KIND.other;
        const list = [];
        if (doc.ends_on && kind.ends) list.push({ on: parseDay(doc.ends_on), what: kind.ends, type: 'end' });
        if (doc.notice_on) list.push({ on: parseDay(doc.notice_on), what: 'Renewal notice', type: 'notice' });
        (Array.isArray(doc.key_dates) ? doc.key_dates : []).forEach((k) => {
            const on = parseDay(k?.on);
            if (on) list.push({ on, what: String(k.label || 'Deliverable').trim() || 'Deliverable', type: 'key' });
        });
        if (doc.kind === 'show') {
            const b = bookingById(doc.booking_id);
            const on = parseDay(b?.date);
            if (on) list.push({ on, what: 'Show', type: 'show' });
        }
        return list.filter((e) => e.on).sort((a, b) => a.on - b.on);
    }

    function nextEvent(doc, now) {
        const t = now || today();
        const ev = eventsOf(doc).find((e) => e.on >= t);
        return ev ? { ...ev, days: Math.round((ev.on - t) / DAY_MS) } : null;
    }

    function expiredOn(doc, now) {
        const t = now || today();
        const kind = KIND[doc.kind] || KIND.other;
        const end = kind.ends ? parseDay(doc.ends_on) : null;
        return end && end < t ? end : null;
    }

    // Green over 60 days, amber 15 to 60, red under 15, grey when expired,
    // archived or undated.
    function countdown(doc, now) {
        if (doc.archived) return { tone: 'muted', text: 'Archived', rank: 4 };
        const ev = nextEvent(doc, now);
        if (ev) {
            const tone = ev.days < 15 ? 'bad' : ev.days <= 60 ? 'warn' : 'good';
            const when = ev.days <= 60 ? inDays(ev.days) : fmtDay(ev.on);
            return { tone, text: `${ev.what} ${when}`, rank: ev.days < 15 ? 0 : ev.days <= 60 ? 1 : 2, days: ev.days, ev };
        }
        const gone = expiredOn(doc, now);
        if (gone) return { tone: 'muted', text: `${(KIND[doc.kind] || KIND.other).ends === 'Renewal due' ? 'Renewal was due' : 'Expired'} ${fmtDay(gone)}`, rank: 3, expired: true };
        return { tone: 'muted', text: 'No dates to watch', rank: 5 };
    }

    // How many days ahead a reminder starts, per kind and date.
    function windowFor(doc, ev) {
        switch (doc.kind) {
            case 'contract': return 90;
            case 'endorsement': return ev.type === 'key' ? 7 : 30;
            case 'travel': return /passport/i.test(doc.title) ? 183 : 60;
            case 'registration': return 60;
            case 'show': return 7;
            case 'money': return 0;
            default: return 30;
        }
    }

    function phrase(doc, ev) {
        if (ev.type === 'notice') return `renewal notice is due ${inDays(ev.days)}`;
        if (ev.type === 'key') return `${ev.what} is due ${inDays(ev.days)}`;
        if (ev.type === 'show') return `the show is ${inDays(ev.days)}`;
        if (doc.kind === 'registration') return `renewal is due ${inDays(ev.days)}`;
        if (doc.kind === 'contract' || doc.kind === 'endorsement') return `ends ${inDays(ev.days)}`;
        return `expires ${inDays(ev.days)}`;
    }

    function docLabel(doc) {
        const artist = artistById(doc.artist_id);
        return artist?.name && !doc.title.toLowerCase().includes(String(artist.name).toLowerCase())
            ? `${artist.name}'s ${doc.title}`
            : doc.title;
    }

    // Home alerts and the bell: documents whose next date is inside their
    // reminder window, plus papers that expired in the last 30 days.
    function alerts(now) {
        if (!state.loaded) return [];
        const t = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : today();
        const due = [];
        state.docs.forEach((doc) => {
            if (doc.archived) return;
            const ev = nextEvent(doc, t);
            if (ev && ev.days <= windowFor(doc, ev)) {
                due.push({ doc, days: ev.days, text: `${docLabel(doc)}: ${phrase(doc, ev)}.`, key: `${ev.type}-${ev.on.toISOString().slice(0, 10)}` });
                return;
            }
            const gone = !ev && expiredOn(doc, t);
            if (gone && (t - gone) / DAY_MS <= 30 && doc.kind !== 'money') {
                due.push({ doc, days: -1, text: `${docLabel(doc)} ${doc.kind === 'registration' ? 'was due for renewal' : 'expired'} on ${fmtDay(gone)}.`, key: 'expired' });
            }
        });
        due.sort((a, b) => a.days - b.days);
        const nudges = due.slice(0, 3).map((d) => ({
            type: d.days < 15 ? 'alert' : 'warning',
            icon: (KIND[d.doc.kind] || KIND.other).icon,
            id: `doc-${d.doc.id}-${d.key}`,
            text: d.text,
            action: 'openDocument',
            actionId: d.doc.id,
        }));
        if (due.length > 3) {
            nudges.push({
                type: 'warning',
                icon: 'ph-folder-simple-lock',
                id: `doc-more-${due.length}`,
                text: `${due.length - 3} more document${due.length - 3 === 1 ? '' : 's'} need${due.length - 3 === 1 ? 's' : ''} attention.`,
                action: 'showSection',
                actionId: 'documents',
            });
        }
        return nudges;
    }

    // ── Loading ──────────────────────────────────────────────────────────
    function scopeKey() {
        return `${state.teamId || 'personal'}:${state.me || ''}`;
    }

    function normalise(row) {
        return {
            ...row,
            title: String(row.title || ''),
            party: String(row.party || ''),
            notes: String(row.notes || ''),
            key_dates: Array.isArray(row.key_dates) ? row.key_dates : [],
            files: Array.isArray(row.document_files) ? row.document_files : (row.files || []),
        };
    }

    async function load() {
        const client = db();
        if (!client || !state.me) return;
        const key = scopeKey();
        state.loading = true;
        state.error = '';
        render();
        try {
            let query = client.from('documents').select('*, document_files(*)').order('updated_at', { ascending: false }).limit(2000);
            query = state.teamId ? query.eq('team_id', state.teamId) : query.is('team_id', null).eq('owner_id', state.me);
            const { data, error } = await query;
            if (key !== scopeKey()) return;
            if (error) throw error;
            state.docs = (data || []).map(normalise);
            state.loaded = true;
            state.loadedAt = Date.now();
        } catch (err) {
            if (key !== scopeKey()) return;
            state.error = /relation|does not exist|schema cache/i.test(String(err?.message || '')) ? 'Documents are not set up on this server yet.' : 'Could not load documents. Check your connection and try again.';
        } finally {
            if (key === scopeKey()) {
                state.loading = false;
                render();
                refreshOthers();
            }
        }
    }

    // Home alerts, the bell, the artist profile and the booking form all
    // read the vault, so they redraw when it changes.
    function refreshOthers() {
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
        window.SPArtistsPage?.render?.();
        if (state.bookingId) renderBookingPanel();
    }

    // ── Saving ───────────────────────────────────────────────────────────
    function rowFromDraft(draft) {
        const kind = KIND[draft.kind] || KIND.other;
        const dateOrNull = (v) => (parseDay(v) ? String(v).slice(0, 10) : null);
        const amount = Math.round(Number(String(draft.amount || '').replace(/[^\d.]/g, '')) || 0);
        return {
            kind: kind.key,
            title: String(draft.title || '').trim().slice(0, 160),
            party: String(draft.party || '').trim().slice(0, 160),
            artist_id: isCloudId(draft.artist_id) ? draft.artist_id : null,
            booking_id: isCloudId(draft.booking_id) ? draft.booking_id : null,
            signed_on: kind.signed ? dateOrNull(draft.signed_on) : null,
            starts_on: kind.starts ? dateOrNull(draft.starts_on) : null,
            ends_on: kind.ends ? dateOrNull(draft.ends_on) : null,
            notice_on: kind.notice ? dateOrNull(draft.notice_on) : null,
            key_dates: kind.keyDates
                ? (draft.key_dates || []).map((k) => ({ label: String(k.label || '').trim().slice(0, 60), on: dateOrNull(k.on) })).filter((k) => k.on)
                : [],
            amount: kind.amount && amount > 0 ? amount : null,
            sensitive: !!draft.sensitive,
            notes: String(draft.notes || '').trim().slice(0, 4000),
            updated_at: new Date().toISOString(),
        };
    }

    async function saveForm() {
        const client = db();
        const form = state.form;
        if (!client || !form || state.busy) return;
        readForm();
        const row = rowFromDraft(form.draft);
        if (!row.title) { toast('warn', 'Give the document a name.'); $('dvTitle')?.focus(); return; }
        if (row.starts_on && row.ends_on && row.ends_on < row.starts_on) { toast('warn', 'The end date is before the start date.'); return; }
        state.busy = 'save';
        render();
        try {
            let saved;
            if (form.id) {
                const { data, error } = await client.from('documents').update(row).eq('id', form.id).select('*, document_files(*)');
                if (error) throw error;
                if (!data || !data[0]) throw new Error('You can no longer change this document.');
                saved = normalise(data[0]);
            } else {
                const { data, error } = await client.from('documents').insert([{ ...row, owner_id: state.me, team_id: state.teamId || null }]).select('*, document_files(*)');
                if (error) throw error;
                saved = normalise(data[0]);
            }
            const index = state.docs.findIndex((d) => d.id === saved.id);
            if (index >= 0) state.docs[index] = saved; else state.docs.unshift(saved);
            const pending = state.pending;
            state.form = null;
            state.view = 'detail';
            state.openId = saved.id;
            state.busy = '';
            if (pending?.blob) {
                await upload(saved, pending, state.newFileLabel || (saved.kind === 'money' ? 'Receipt' : ''));
            }
            clearPending();
            toast('success', form.id ? 'Document updated.' : 'Document saved.');
        } catch (err) {
            toast('error', friendly(err, 'Could not save the document.'));
        } finally {
            state.busy = '';
            render();
            refreshOthers();
        }
    }

    function friendly(err, fallback) {
        const msg = String(err?.message || '');
        if (/row-level security|permission|not allowed|unauthori[sz]ed/i.test(msg)) return 'You do not have permission to do that in this team.';
        if (/exceeded|too large|maximum allowed size|payload/i.test(msg)) return 'That file is over the 20 MB limit.';
        if (/mime|invalid.*type/i.test(msg)) return 'Only PDFs and photos can be stored.';
        if (/fetch|network|failed to/i.test(msg)) return 'No connection. Try again when you are back online.';
        return msg && msg.length < 140 ? msg : fallback;
    }

    async function setArchived(doc, archived) {
        const client = db();
        if (!client || state.busy) return;
        state.busy = 'archive';
        render();
        try {
            const { data, error } = await client.from('documents').update({ archived, updated_at: new Date().toISOString() }).eq('id', doc.id).select('*, document_files(*)');
            if (error) throw error;
            if (data && data[0]) Object.assign(doc, normalise(data[0]));
            toast('success', archived ? 'Archived. Its reminders are off.' : 'Restored.');
        } catch (err) {
            toast('error', friendly(err, 'Could not change the document.'));
        } finally {
            state.busy = '';
            render();
            refreshOthers();
        }
    }

    async function removeDoc(doc) {
        const client = db();
        if (!client || state.busy) return;
        state.busy = 'delete';
        render();
        try {
            const paths = (doc.files || []).map((f) => f.path).filter(Boolean);
            if (paths.length) {
                const { error: storageError } = await client.storage.from(BUCKET).remove(paths);
                if (storageError) throw storageError;
            }
            const { error } = await client.from('documents').delete().eq('id', doc.id);
            if (error) throw error;
            state.docs = state.docs.filter((d) => d.id !== doc.id);
            state.view = 'list';
            state.openId = null;
            toast('success', 'Document deleted.');
        } catch (err) {
            toast('error', friendly(err, 'Could not delete the document.'));
        } finally {
            state.busy = '';
            state.confirmDelete = null;
            render();
            refreshOthers();
        }
    }

    // ── Files ────────────────────────────────────────────────────────────
    function safeName(name) {
        const base = String(name || 'file').normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return (base || 'file').slice(-80);
    }

    async function upload(doc, pending, label) {
        const client = db();
        if (!client || !pending?.blob) return false;
        if (pending.blob.size > MAX_BYTES) { toast('warn', 'That file is over the 20 MB limit.'); return false; }
        state.busy = 'upload';
        render();
        const folder = `${doc.team_id || `u-${doc.owner_id}`}/${doc.id}/`;
        const path = `${folder}${Date.now().toString(36)}-${safeName(pending.name)}`;
        try {
            const { error } = await client.storage.from(BUCKET).upload(path, pending.blob, { contentType: pending.mime, upsert: false });
            if (error) throw error;
            const version = Math.max(0, ...(doc.files || []).map((f) => Number(f.version) || 0)) + 1;
            const { data, error: rowError } = await client.from('document_files').insert([{
                document_id: doc.id,
                owner_id: state.me,
                path,
                name: String(pending.name || 'file').slice(0, 200),
                mime: pending.mime,
                size: pending.blob.size,
                version,
                label: String(label || '').slice(0, 40),
            }]).select('*');
            if (rowError) {
                client.storage.from(BUCKET).remove([path]).catch(() => null);
                throw rowError;
            }
            doc.files = [...(doc.files || []), data[0]];
            client.from('documents').update({ updated_at: new Date().toISOString() }).eq('id', doc.id).then(() => null, () => null);
            return true;
        } catch (err) {
            toast('error', friendly(err, 'Could not upload the file.'));
            return false;
        } finally {
            state.busy = '';
            render();
        }
    }

    async function removeFile(doc, file) {
        const client = db();
        if (!client || state.busy) return;
        state.busy = 'file';
        render();
        try {
            const { error: storageError } = await client.storage.from(BUCKET).remove([file.path]);
            if (storageError) throw storageError;
            const { error } = await client.from('document_files').delete().eq('id', file.id);
            if (error) throw error;
            doc.files = (doc.files || []).filter((f) => f.id !== file.id);
        } catch (err) {
            toast('error', friendly(err, 'Could not remove the file.'));
        } finally {
            state.busy = '';
            render();
        }
    }

    // The window opens straight away (inside the tap) so phones don't block
    // it, then goes to a short-lived private link.
    async function openFile(file) {
        const client = db();
        if (!client) return;
        let win = null;
        try { win = window.open('', '_blank'); } catch (_) { win = null; }
        try {
            const { data, error } = await client.storage.from(BUCKET).createSignedUrl(file.path, 300);
            if (error || !data?.signedUrl) throw error || new Error('No link');
            if (win && !win.closed) {
                win.opener = null;
                win.location.href = data.signedUrl;
            } else {
                window.location.assign(data.signedUrl);
            }
        } catch (err) {
            if (win && !win.closed) win.close();
            toast('error', friendly(err, 'Could not open the file.'));
        }
    }

    // ── Download and share ───────────────────────────────────────────────
    const SHARE_DAYS = 7;
    const fileCache = new Map();

    function fileName(doc, file) {
        const ext = /pdf/.test(file.mime) ? 'pdf' : (String(file.name).match(/\.(\w{2,5})$/) || [])[1] || 'jpg';
        const base = safeName(`${doc.title}${file.label ? ` ${file.label}` : ''}`).replace(/\.[^.]*$/, '');
        return `${base || 'document'}.${ext}`;
    }

    async function fetchFile(doc, file) {
        if (fileCache.has(file.id)) return fileCache.get(file.id);
        const client = db();
        const { data, error } = await client.storage.from(BUCKET).download(file.path);
        if (error || !data) throw error || new Error('Could not fetch the file.');
        const out = new File([data], fileName(doc, file), { type: file.mime || data.type || 'application/octet-stream' });
        fileCache.set(file.id, out);
        return out;
    }

    async function downloadFile(doc, file) {
        try {
            const blob = await fetchFile(doc, file);
            const url = URL.createObjectURL(blob);
            const a = el('a');
            a.href = url;
            a.download = blob.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
        } catch (err) {
            toast('error', friendly(err, 'Could not download the file.'));
        }
    }

    function canShareFiles() {
        try {
            return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
                && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
        } catch (_) { return false; }
    }

    // The phone's own share sheet, with the file itself attached (WhatsApp,
    // Gmail, Bluetooth...). Fetching can outlast the tap on some phones; the
    // file is then kept ready and the next tap shares it at once.
    async function shareFile(doc, file) {
        const ready = fileCache.has(file.id);
        let blob;
        try {
            blob = await fetchFile(doc, file);
        } catch (err) {
            toast('error', friendly(err, 'Could not fetch the file.'));
            return;
        }
        try {
            await navigator.share({ files: [blob], title: doc.title, text: `${doc.title} (from Star Paper)` });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            if (!ready && err?.name === 'NotAllowedError') toast('success', 'The file is ready. Tap Share again.');
            else toast('error', 'This phone could not share the file. Use WhatsApp or Email instead.');
        }
    }

    async function linkFor(file) {
        const { data, error } = await db().storage.from(BUCKET).createSignedUrl(file.path, SHARE_DAYS * 24 * 60 * 60);
        if (error || !data?.signedUrl) throw error || new Error('No link');
        return data.signedUrl;
    }

    function shareText(doc, file, url) {
        const label = [doc.title, file.label].filter(Boolean).join(', ');
        return `${label}: ${url}\n\nShared from Star Paper. The link works for ${SHARE_DAYS} days.`;
    }

    // WhatsApp and email get a private link that stops working after a week.
    async function shareLink(doc, file, via) {
        let win = null;
        if (via === 'whatsapp') { try { win = window.open('', '_blank'); } catch (_) { win = null; } }
        try {
            const url = await linkFor(file);
            const text = shareText(doc, file, url);
            if (via === 'whatsapp') {
                const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
                if (win && !win.closed) { win.opener = null; win.location.href = wa; } else window.location.assign(wa);
            } else {
                window.location.href = `mailto:?subject=${encodeURIComponent(doc.title)}&body=${encodeURIComponent(text)}`;
            }
        } catch (err) {
            if (win && !win.closed) win.close();
            toast('error', friendly(err, 'Could not make a link for that file.'));
        }
    }

    // Photos are shrunk to a sensible size and, when the page stands out
    // from a darker background, cropped to the page.
    async function preparePhoto(file, crop) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (_) {
            try { bitmap = await createImageBitmap(file); } catch (_e) { return null; }
        }
        const box = crop ? findPage(bitmap) : null;
        const sx = box ? box.x : 0;
        const sy = box ? box.y : 0;
        const sw = box ? box.w : bitmap.width;
        const sh = box ? box.h : bitmap.height;
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(sw, sh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        if (bitmap.close) bitmap.close();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        if (!blob) return null;
        return { blob, cropped: !!box };
    }

    // Finds a bright page on a darker surface: the rows and columns that are
    // mostly brighter than the Otsu threshold, with a dark border around them.
    function findPage(bitmap) {
        const W = 160;
        const scale = W / bitmap.width;
        const H = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, W, H);
        const px = ctx.getImageData(0, 0, W, H).data;
        const lum = new Float32Array(W * H);
        const hist = new Array(256).fill(0);
        for (let i = 0; i < W * H; i += 1) {
            const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
            lum[i] = v;
            hist[Math.min(255, Math.round(v))] += 1;
        }
        let sum = 0;
        for (let i = 0; i < 256; i += 1) sum += i * hist[i];
        let sumB = 0; let wB = 0; let best = 0; let threshold = 128;
        for (let i = 0; i < 256; i += 1) {
            wB += hist[i];
            if (!wB) continue;
            const wF = W * H - wB;
            if (!wF) break;
            sumB += i * hist[i];
            const between = wB * wF * ((sumB / wB) - ((sum - sumB) / wF)) ** 2;
            if (between > best) { best = between; threshold = i; }
        }
        const rows = new Array(H).fill(0);
        const cols = new Array(W).fill(0);
        let border = 0; let borderN = 0;
        const edge = Math.max(2, Math.round(Math.min(W, H) * 0.04));
        for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
                const bright = lum[y * W + x] > threshold;
                if (bright) { rows[y] += 1; cols[x] += 1; }
                if (x < edge || y < edge || x >= W - edge || y >= H - edge) { border += bright ? 1 : 0; borderN += 1; }
            }
        }
        if (borderN && border / borderN > 0.45) return null;
        const firstLast = (list, size, len) => {
            let a = -1; let b = -1;
            for (let i = 0; i < len; i += 1) if (list[i] > size * 0.4) { if (a < 0) a = i; b = i; }
            return [a, b];
        };
        const [top, bottom] = firstLast(rows, W, H);
        const [left, right] = firstLast(cols, H, W);
        if (top < 0 || left < 0) return null;
        const area = ((bottom - top + 1) * (right - left + 1)) / (W * H);
        if (area < 0.2 || area > 0.92) return null;
        const pad = 0.01;
        const x0 = Math.max(0, (left / W - pad) * bitmap.width);
        const y0 = Math.max(0, (top / H - pad) * bitmap.height);
        const x1 = Math.min(bitmap.width, ((right + 1) / W + pad) * bitmap.width);
        const y1 = Math.min(bitmap.height, ((bottom + 1) / H + pad) * bitmap.height);
        return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    }

    // The camera app can take a while; if the page redraws meanwhile the
    // input is detached and a document-level listener never hears it, so
    // each picker listens for itself.
    function watchPick(input) {
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const target = input.getAttribute('data-dv-pick');
            if (target === 'form' && document.getElementById('dvTitle')) readForm();
            pickFile(file, target);
            input.value = '';
        });
    }

    // Laptops ignore the capture attribute and open the file chooser, so
    // without a touch screen "Take photo" opens the webcam in the page.
    // Decided by the device, not the pointer: touch-screen laptops report
    // a coarse pointer but still open the file chooser.
    function wantsLiveCamera() {
        if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return false;
        const ua = navigator.userAgent || '';
        const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
        // No touch screen at all can't be a phone, whatever the browser says.
        if (!navigator.maxTouchPoints) return true;
        const phone = (navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || ipad;
        return !phone;
    }

    function cameraError(err) {
        const name = err && err.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this site in your browser, or use Choose file.';
        if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Use Choose file instead.';
        if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again.';
        return 'The camera could not start. Use Choose file instead.';
    }

    async function openLiveCamera(target) {
        if (document.querySelector('.dv-cam')) return;
        const shade = el('div', 'dv-cam');
        shade.setAttribute('role', 'dialog');
        shade.setAttribute('aria-modal', 'true');
        shade.setAttribute('aria-label', 'Take a photo');
        const panel = el('div', 'dv-cam__panel');
        const video = el('video', 'dv-cam__video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        const status = el('p', 'dv-cam__status', 'Starting the camera…');
        const actions = el('div', 'dv-cam__actions');
        const cancel = button('back-btn', 'Cancel', null, 'ph-x');
        const snap = button('btn-primary', 'Take photo', null, 'ph-camera');
        snap.disabled = true;
        actions.append(cancel, snap);
        panel.append(video, status, actions);
        shade.appendChild(panel);
        document.body.appendChild(shade);
        let stream = null;
        const close = () => {
            if (stream) stream.getTracks().forEach((t) => t.stop());
            stream = null;
            document.removeEventListener('keydown', onKey, true);
            shade.remove();
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        cancel.addEventListener('click', close);
        shade.addEventListener('click', (e) => { if (e.target === shade) close(); });
        snap.addEventListener('click', () => {
            const w = video.videoWidth, h = video.videoHeight;
            if (!w || !h) return;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            snap.disabled = true;
            canvas.toBlob((blob) => {
                close();
                if (!blob) { toast('warn', 'That photo could not be taken. Try again.'); return; }
                const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                if (target === 'form' && document.getElementById('dvTitle')) readForm();
                pickFile(file, target);
            }, 'image/jpeg', 0.92);
        });
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        } catch (err) {
            close();
            toast('warn', cameraError(err));
            return;
        }
        if (!shade.isConnected) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        try { await video.play(); } catch (_) { /* autoplay covers it */ }
        status.textContent = 'Hold the document flat and fill the frame.';
        snap.disabled = false;
        snap.focus();
    }

    function clearPending() {
        if (state.pending?.url) URL.revokeObjectURL(state.pending.url);
        state.pending = null;
    }

    async function pickFile(file, target) {
        if (!file) return;
        clearPending();
        // Some phone cameras hand back a photo with no type, so the name counts too.
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        const isImage = !isPdf && (/^image\//.test(file.type) || /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name || '') || !file.type || file.type === 'application/octet-stream');
        if (!isImage && !isPdf) { toast('warn', 'Only PDFs and photos can be stored.'); return; }
        state.pending = { file, name: file.name || (isPdf ? 'document.pdf' : 'photo.jpg'), mime: isPdf ? 'application/pdf' : (/^image\//.test(file.type) ? file.type : ''), blob: file, crop: true, cropped: false, target, working: isImage };
        render();
        if (isImage) await reprocess();
        if (target === 'detail') {
            const doc = docById(state.openId);
            if (doc && state.pending?.blob) {
                const pending = state.pending;
                const ok = await upload(doc, pending, state.newFileLabel);
                if (ok) { clearPending(); toast('success', 'File added.'); }
                render();
            }
        }
    }

    async function reprocess() {
        const p = state.pending;
        if (!p?.file) return;
        p.working = true;
        render();
        let out = null;
        try { out = await preparePhoto(p.file, p.crop); } catch (_) { out = null; }
        if (state.pending !== p) return;
        p.working = false;
        if (!out && !/^image\/(jpeg|png|webp|heic|heif)$/.test(p.mime)) {
            clearPending();
            toast('warn', 'That photo could not be read. Try again or choose it from your gallery.');
            render();
            return;
        }
        if (out) {
            p.blob = out.blob;
            p.cropped = out.cropped;
            p.mime = 'image/jpeg';
            p.name = `${String(p.file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
            if (p.url) URL.revokeObjectURL(p.url);
            p.url = URL.createObjectURL(out.blob);
        }
        render();
    }

    // ── Navigation ───────────────────────────────────────────────────────
    function go(view, id) {
        state.view = view;
        state.openId = id || null;
        state.confirmDelete = null;
        state.confirmFile = null;
        if (view !== 'form') state.form = null;
        render();
        const root = $('docsRoot');
        if (root && document.getElementById('documents')?.classList.contains('active')) {
            root.scrollIntoView({ block: 'start' });
        }
    }

    // Quick add: straight to a blank form, or the list when this role can't add.
    function newDocument() {
        sync();
        if (!canEdit()) { go('list'); toast('warn', 'Your role can view documents but not add them.'); return; }
        startForm(null, {});
    }

    function startForm(doc, preset) {
        clearPending();
        const kind = doc?.kind || preset?.kind || (state.kind !== 'all' ? state.kind : 'contract');
        state.form = {
            id: doc?.id || null,
            draft: {
                kind,
                title: doc?.title || '',
                party: doc?.party || '',
                artist_id: doc?.artist_id || preset?.artist_id || state.artist || '',
                booking_id: doc?.booking_id || preset?.booking_id || '',
                signed_on: doc?.signed_on || '',
                starts_on: doc?.starts_on || '',
                ends_on: doc?.ends_on || '',
                notice_on: doc?.notice_on || '',
                key_dates: (doc?.key_dates || []).map((k) => ({ label: k.label || '', on: k.on || '' })),
                amount: doc?.amount ? String(Math.round(doc.amount)) : '',
                sensitive: doc ? !!doc.sensitive : kind === 'travel',
                notes: doc?.notes || '',
            },
        };
        state.newFileLabel = '';
        go('form', doc?.id || null);
    }

    function openDocument(id) {
        if (typeof window.showSection === 'function') window.showSection('documents');
        state.kind = 'all';
        state.due = null;
        if (!state.loaded) sync();
        go(docById(id) || !state.loaded ? 'detail' : 'list', id);
    }

    function openForArtist(artistId) {
        if (typeof window.showSection === 'function') window.showSection('documents');
        state.artist = artistId || null;
        state.kind = 'all';
        state.due = null;
        go('list');
    }

    // ── Rendering ────────────────────────────────────────────────────────
    function isOpen() {
        return !!document.getElementById('documents')?.classList.contains('active');
    }

    function render() {
        const root = $('docsRoot');
        if (root) {
            root.replaceChildren();
            if (!state.me) root.appendChild(emptyState('ph-lock-simple', 'Sign in to keep documents', 'Your contracts, travel papers and receipts are stored privately with your account.'));
            else if (state.view === 'form' && state.form) root.appendChild(renderForm());
            else if (state.view === 'detail' && docById(state.openId)) root.appendChild(renderDetail(docById(state.openId)));
            else if (state.view === 'detail' && state.loading) root.appendChild(emptyState('ph-hourglass', 'Opening document', ''));
            else root.appendChild(renderList());
        }
        if (state.bookingId) renderBookingPanel();
    }

    function emptyState(iconName, title, text) {
        const box = el('div', 'dv-empty');
        const tile = el('span', 'sp-icon-tile dv-empty__icon');
        tile.appendChild(icon(iconName));
        box.append(tile, el('p', 'dv-empty__title', title));
        if (text) box.appendChild(el('p', 'dv-empty__text', text));
        return box;
    }

    function visibleDocs() {
        const t = today();
        const q = state.search.trim().toLowerCase();
        return state.docs
            .filter((d) => state.archived || !d.archived)
            .filter((d) => state.kind === 'all' || d.kind === state.kind)
            .filter((d) => !state.artist || String(d.artist_id) === String(state.artist))
            .filter((d) => {
                if (!state.due) return true;
                const c = countdown(d, t);
                return state.due === 'soon' ? c.days !== undefined && c.days <= 30 : !!c.expired;
            })
            .filter((d) => {
                if (!q) return true;
                const artist = artistById(d.artist_id)?.name || '';
                const booking = bookingById(d.booking_id)?.event || '';
                return [d.title, d.party, d.notes, artist, booking, (KIND[d.kind] || KIND.other).one].join(' ').toLowerCase().includes(q);
            })
            .map((d) => ({ d, c: countdown(d, t) }))
            .sort((a, b) => a.c.rank - b.c.rank || (a.c.days ?? 1e9) - (b.c.days ?? 1e9) || String(b.d.updated_at).localeCompare(String(a.d.updated_at)));
    }

    function renderList() {
        const wrap = el('div', 'dv-page');
        const head = el('div', 'dv-head');
        const titles = el('div', 'dv-head__text');
        titles.append(el('h2', 'dv-title', 'Documents'), el('p', 'dv-sub', 'Contracts, travel papers, registrations and receipts, with the dates that matter.'));
        head.appendChild(titles);
        if (canEdit()) head.appendChild(button('btn-primary dv-add', 'Add document', { dv: 'new' }, 'ph-plus'));
        wrap.appendChild(head);

        const t = today();
        const live = state.docs.filter((d) => !d.archived);
        const soon = live.filter((d) => { const c = countdown(d, t); return c.days !== undefined && c.days <= 30; }).length;
        const expired = live.filter((d) => countdown(d, t).expired).length;
        const stats = el('div', 'dv-stats');
        [
            { key: 'soon', label: 'Due in 30 days', value: soon, tone: soon ? 'warn' : '' },
            { key: 'expired', label: 'Expired', value: expired, tone: expired ? 'bad' : '' },
            { key: '', label: 'All documents', value: live.length, tone: '' },
        ].forEach((s) => {
            const b = button(`dv-stat${(state.due || '') === s.key ? ' is-active' : ''}${s.tone ? ` is-${s.tone}` : ''}`, '', { 'dv-due': s.key || 'all' });
            b.setAttribute('aria-pressed', (state.due || '') === s.key ? 'true' : 'false');
            b.append(el('span', 'dv-stat__value', s.value), el('span', 'dv-stat__label', s.label));
            stats.appendChild(b);
        });
        wrap.appendChild(stats);

        const tools = el('div', 'dv-tools');
        const chips = el('div', 'sp-chips dv-chips');
        chips.setAttribute('role', 'group');
        chips.setAttribute('aria-label', 'Kind of document');
        [{ key: 'all', name: 'All' }, ...KINDS].forEach((k) => {
            const count = k.key === 'all' ? live.length : live.filter((d) => d.kind === k.key).length;
            if (k.key !== 'all' && !count && state.kind !== k.key) return;
            const chip = button(`sp-chip${state.kind === k.key ? ' is-active' : ''}`, `${k.name}${count ? ` ${count}` : ''}`, { 'dv-kind': k.key });
            chip.setAttribute('aria-pressed', state.kind === k.key ? 'true' : 'false');
            chips.appendChild(chip);
        });
        const search = el('input', 'dv-search');
        search.type = 'search';
        search.id = 'dvSearch';
        search.placeholder = 'Search documents';
        search.setAttribute('aria-label', 'Search documents');
        search.value = state.search;
        const arch = el('label', 'dv-toggle');
        const box = el('input');
        box.type = 'checkbox';
        box.id = 'dvArchived';
        box.checked = state.archived;
        arch.append(box, el('span', '', 'Show archived'));
        tools.append(chips, search, arch);
        wrap.appendChild(tools);

        if (state.artist) {
            const artist = artistById(state.artist);
            const bar = el('div', 'dv-filterbar');
            bar.append(el('span', '', `Showing documents for ${artist?.name || 'one artist'}`), button('dv-link', 'Show all', { 'dv-artist-clear': '1' }));
            wrap.appendChild(bar);
        }

        const listHost = el('div', 'dv-listhost');
        listHost.id = 'dvListHost';
        listHost.appendChild(renderRows());
        wrap.appendChild(listHost);
        return wrap;
    }

    function renderRows() {
        if (state.error) {
            const box = emptyState('ph-cloud-slash', 'Documents did not load', state.error);
            box.appendChild(button('back-btn', 'Try again', { dv: 'reload' }));
            return box;
        }
        if (!state.loaded) return emptyState('ph-hourglass', 'Loading documents', '');
        const rows = visibleDocs();
        if (!rows.length) {
            if (!state.docs.length) {
                const box = emptyState('ph-folder-simple-lock', 'Nothing in the vault yet', 'Add a contract, passport or receipt and Star Paper will remind you before anything runs out.');
                if (canEdit()) box.appendChild(button('btn-primary', 'Add your first document', { dv: 'new' }, 'ph-plus'));
                return box;
            }
            return emptyState('ph-magnifying-glass', 'No documents match', 'Try another filter or search.');
        }
        const list = el('ul', 'dv-list');
        rows.forEach(({ d, c }) => list.appendChild(rowItem(d, c)));
        return list;
    }

    function rowItem(d, c) {
        const kind = KIND[d.kind] || KIND.other;
        const li = el('li', `dv-row${d.archived ? ' is-archived' : ''}`);
        const b = button('dv-row__btn', '', { 'dv-open': d.id });
        const tile = el('span', 'sp-icon-tile dv-row__icon');
        tile.appendChild(icon(kind.icon));
        const text = el('span', 'dv-row__text');
        const title = el('span', 'dv-row__title', d.title);
        if (d.sensitive) {
            const lock = icon('ph-lock-simple');
            lock.classList.add('dv-row__lock');
            lock.setAttribute('aria-hidden', 'false');
            lock.setAttribute('aria-label', 'Owner and admins only');
            lock.setAttribute('title', 'Owner and admins only');
            title.appendChild(lock);
        }
        const artist = artistById(d.artist_id)?.name;
        const booking = bookingById(d.booking_id);
        const meta = [...new Set([kind.one, artist, d.party, booking ? booking.event : ''].filter(Boolean))].join(' · ');
        text.append(title, el('span', 'dv-row__meta', meta));
        const right = el('span', 'dv-row__right');
        right.appendChild(el('span', `ap-pill is-${c.tone}`, c.text));
        const n = (d.files || []).length;
        right.appendChild(el('span', 'dv-row__files', n ? `${n} file${n === 1 ? '' : 's'}` : 'No file yet'));
        b.append(tile, text, right);
        li.appendChild(b);
        return li;
    }

    function fact(list, label, value, extra) {
        if (!value && !extra) return;
        const row = el('div', 'dv-fact');
        row.appendChild(el('dt', 'dv-fact__label', label));
        const dd = el('dd', 'dv-fact__value');
        if (value) dd.appendChild(typeof value === 'string' ? document.createTextNode(value) : value);
        if (extra) dd.appendChild(extra);
        row.appendChild(dd);
        list.appendChild(row);
    }

    function renderDetail(doc) {
        const kind = KIND[doc.kind] || KIND.other;
        const c = countdown(doc);
        const wrap = el('div', 'dv-page dv-detail');
        wrap.appendChild(button('dv-back', 'All documents', { dv: 'list' }, 'ph-caret-left'));

        const card = el('section', 'card dv-card');
        const head = el('div', 'dv-detail__head');
        const tile = el('span', 'sp-icon-tile dv-detail__icon');
        tile.appendChild(icon(kind.icon));
        const names = el('div', 'dv-detail__names');
        names.append(el('h2', 'dv-title', doc.title), el('p', 'dv-sub', [kind.one, doc.party].filter(Boolean).join(' · ')));
        head.append(tile, names, el('span', `ap-pill dv-detail__pill is-${c.tone}`, c.text));
        card.appendChild(head);

        const facts = el('dl', 'dv-facts');
        const artist = artistById(doc.artist_id);
        fact(facts, 'Artist', artist?.name || '');
        const booking = bookingById(doc.booking_id);
        if (booking) {
            const link = button('dv-link', `${booking.event || 'Show'}${booking.date ? `, ${fmtDay(booking.date)}` : ''}`, { 'dv-booking': booking.id });
            fact(facts, 'Show', link);
        }
        if (doc.party) fact(facts, kind.party, doc.party);
        if (kind.signed) fact(facts, kind.signed, fmtDay(doc.signed_on));
        if (kind.starts) fact(facts, 'Starts', fmtDay(doc.starts_on));
        if (kind.ends) fact(facts, kind.ends, fmtDay(doc.ends_on));
        if (kind.notice) fact(facts, 'Renewal notice', fmtDay(doc.notice_on));
        if (doc.amount) fact(facts, 'Amount', ugx(doc.amount));
        if (doc.key_dates?.length) {
            const ul = el('ul', 'dv-keydates');
            const t = today();
            doc.key_dates.slice().sort((a, b) => String(a.on).localeCompare(String(b.on))).forEach((k) => {
                const on = parseDay(k.on);
                const li = el('li', on && on < t ? 'is-past' : '');
                li.append(el('span', '', k.label || 'Deliverable'), el('span', 'dv-keydates__on', fmtDay(on)));
                ul.appendChild(li);
            });
            fact(facts, 'Key dates', null, ul);
        }
        fact(facts, 'Who can see it', doc.sensitive ? 'Owner and admins only' : state.teamId ? 'Everyone in the team' : 'Only you');
        if (doc.notes) fact(facts, 'Notes', el('span', 'dv-notes', doc.notes));
        card.appendChild(facts);

        if (canEdit()) {
            const actions = el('div', 'dv-actions');
            actions.appendChild(button('back-btn', 'Edit', { dv: 'edit' }, 'ph-pencil-simple'));
            actions.appendChild(button('back-btn', doc.archived ? 'Restore' : 'Archive', { dv: doc.archived ? 'restore' : 'archive' }, doc.archived ? 'ph-arrow-counter-clockwise' : 'ph-archive'));
            if (state.confirmDelete === doc.id) {
                const confirm = el('span', 'dv-confirm');
                confirm.append(el('span', '', 'Delete it and all its files?'), button('dv-danger', 'Delete', { dv: 'delete-yes' }), button('back-btn', 'Keep', { dv: 'delete-no' }));
                actions.appendChild(confirm);
            } else {
                actions.appendChild(button('back-btn dv-delete', 'Delete', { dv: 'delete' }, 'ph-trash'));
            }
            card.appendChild(actions);
        }
        wrap.appendChild(card);
        wrap.appendChild(renderFiles(doc));
        return wrap;
    }

    function renderFiles(doc) {
        const card = el('section', 'card dv-card dv-files');
        const head = el('div', 'dv-files__head');
        head.append(el('h3', 'dv-files__title', 'Files'), el('span', 'dv-sub', `Newest first. WhatsApp and email links work for ${SHARE_DAYS} days.`));
        card.appendChild(head);
        const files = filesOf(doc);
        const canShare = canShareFiles();
        const list = el('ul', 'dv-filelist');
        files.forEach((f, i) => {
            const li = el('li', `dv-file${i === 0 ? ' is-current' : ''}`);
            const tile = el('span', 'dv-file__icon');
            tile.appendChild(icon(/pdf/.test(f.mime) ? 'ph-file-pdf' : 'ph-image'));
            const text = el('span', 'dv-file__text');
            text.append(
                el('span', 'dv-file__name', `Version ${f.version}${f.label ? ` · ${f.label}` : ''}${i === 0 && files.length > 1 ? ' (current)' : ''}`),
                el('span', 'dv-file__meta', [f.name, fmtSize(f.size), fmtDay(String(f.created_at || '').slice(0, 10))].filter(Boolean).join(' · '))
            );
            li.append(tile, text);
            if (canEdit() && state.confirmFile === f.id) {
                li.appendChild(button('dv-danger dv-file__confirm', 'Remove', { 'dv-file-remove': f.id }));
            } else if (canEdit()) {
                const remove = button('dv-file__remove', '', { 'dv-file-ask': f.id }, 'ph-x');
                remove.setAttribute('aria-label', `Remove version ${f.version}`);
                li.appendChild(remove);
            }
            const acts = el('div', 'dv-file__acts');
            acts.appendChild(button('dv-chipbtn', 'Open', { 'dv-file-act': 'open', 'dv-file': f.id }, 'ph-arrow-square-out'));
            acts.appendChild(button('dv-chipbtn', 'Download', { 'dv-file-act': 'download', 'dv-file': f.id }, 'ph-download-simple'));
            if (canShare) acts.appendChild(button('dv-chipbtn', 'Share', { 'dv-file-act': 'share', 'dv-file': f.id }, 'ph-share-network'));
            acts.appendChild(button('dv-chipbtn', 'WhatsApp', { 'dv-file-act': 'whatsapp', 'dv-file': f.id }, 'ph-whatsapp-logo'));
            acts.appendChild(button('dv-chipbtn', 'Email', { 'dv-file-act': 'email', 'dv-file': f.id }, 'ph-envelope-simple'));
            li.appendChild(acts);
            list.appendChild(li);
        });
        if (!files.length) list.appendChild(el('li', 'dv-file dv-file--empty', 'No file yet. Add a PDF or take a photo of the paper.'));
        card.appendChild(list);
        if (canEdit()) card.appendChild(fileAdder('detail'));
        return card;
    }

    function fileAdder(target) {
        const box = el('div', 'dv-adder');
        const busy = state.busy === 'upload' || (state.pending?.target === target && state.pending.working);
        if (target === 'detail') {
            const label = el('label', 'dv-adder__label');
            label.appendChild(el('span', '', 'Mark as'));
            const select = el('select');
            select.id = 'dvFileLabel';
            FILE_LABELS.forEach((v) => {
                const o = el('option', '', v || 'No label');
                o.value = v;
                if (v === state.newFileLabel) o.selected = true;
                select.appendChild(o);
            });
            label.appendChild(select);
            box.appendChild(label);
        }
        let camera;
        if (wantsLiveCamera()) {
            camera = button('back-btn dv-pick', 'Take photo', null, 'ph-camera');
            camera.disabled = busy;
            camera.addEventListener('click', () => openLiveCamera(target));
        } else {
            camera = el('label', 'back-btn dv-pick');
            camera.appendChild(icon('ph-camera'));
            camera.appendChild(document.createTextNode('Take photo'));
            const camInput = el('input', 'dv-pick__input');
            camInput.type = 'file';
            camInput.accept = 'image/*';
            camInput.setAttribute('capture', 'environment');
            camInput.setAttribute('data-dv-pick', target);
            camInput.disabled = busy;
            watchPick(camInput);
            camera.appendChild(camInput);
        }
        const choose = el('label', 'back-btn dv-pick');
        choose.appendChild(icon('ph-paperclip'));
        choose.appendChild(document.createTextNode(target === 'detail' ? 'Add a version' : 'Choose file'));
        const fileInput = el('input', 'dv-pick__input');
        fileInput.type = 'file';
        fileInput.accept = FILE_TYPES;
        fileInput.setAttribute('data-dv-pick', target);
        fileInput.disabled = busy;
        watchPick(fileInput);
        choose.appendChild(fileInput);
        box.append(camera, choose);
        if (busy) box.appendChild(el('span', 'dv-adder__status', state.busy === 'upload' ? 'Uploading…' : 'Preparing photo…'));
        else box.appendChild(el('span', 'dv-adder__status', 'PDF or photo, up to 20 MB.'));
        return box;
    }

    function pendingPreview() {
        const p = state.pending;
        if (!p || p.target !== 'form') return null;
        const box = el('div', 'dv-pending');
        if (p.url) {
            const img = el('img', 'dv-pending__img');
            img.src = p.url;
            img.alt = 'Preview of the photo';
            box.appendChild(img);
        } else {
            const tile = el('span', 'dv-file__icon');
            tile.appendChild(icon(/pdf/.test(p.mime) ? 'ph-file-pdf' : 'ph-image'));
            box.appendChild(tile);
        }
        const text = el('div', 'dv-pending__text');
        text.append(el('span', 'dv-file__name', p.name), el('span', 'dv-file__meta', p.working ? 'Preparing photo…' : `${fmtSize(p.blob?.size)}${p.cropped ? ' · cropped to the page' : ''}`));
        const row = el('div', 'dv-pending__actions');
        if (p.url && !p.working) {
            if (p.cropped) row.appendChild(button('dv-link', 'Use the full photo', { dv: 'crop-off' }));
            else if (!p.crop) row.appendChild(button('dv-link', 'Crop to the page', { dv: 'crop-on' }));
        }
        row.appendChild(button('dv-link', 'Remove', { dv: 'pending-clear' }));
        text.appendChild(row);
        box.appendChild(text);
        return box;
    }

    function field(labelText, input, hint) {
        const g = el('label', 'form-group dv-field');
        g.appendChild(el('span', 'dv-field__label', labelText));
        g.appendChild(input);
        if (hint) g.appendChild(el('span', 'dv-field__hint', hint));
        return g;
    }

    function input(type, id, value, attrs) {
        const i = el('input');
        i.type = type;
        i.id = id;
        i.value = value || '';
        Object.entries(attrs || {}).forEach(([k, v]) => i.setAttribute(k, String(v)));
        return i;
    }

    function select(id, options, value) {
        const s = el('select');
        s.id = id;
        options.forEach(([v, label]) => {
            const o = el('option', '', label);
            o.value = v;
            if (String(v) === String(value || '')) o.selected = true;
            s.appendChild(o);
        });
        return s;
    }

    function renderForm() {
        const form = state.form;
        const d = form.draft;
        const kind = KIND[d.kind] || KIND.other;
        const wrap = el('div', 'dv-page dv-formpage');
        wrap.appendChild(button('dv-back', form.id ? 'Back to document' : 'All documents', { dv: form.id ? 'cancel-edit' : 'list' }, 'ph-caret-left'));
        const card = el('form', 'card dv-card dv-form');
        card.id = 'dvForm';
        card.noValidate = true;
        card.appendChild(el('h2', 'dv-title', form.id ? 'Edit document' : 'Add a document'));

        const grid = el('div', 'dv-grid');
        grid.appendChild(field('Kind', select('dvKind', KINDS.map((k) => [k.key, k.one]), d.kind), kind.hint));
        grid.appendChild(field('Name', input('text', 'dvTitle', d.title, { maxlength: 160, placeholder: `e.g. ${kind.sample}`, required: 'required' })));
        grid.appendChild(field(kind.party, input('text', 'dvParty', d.party, { maxlength: 160 })));
        const artists = arr('artists').filter((a) => isCloudId(a.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        grid.appendChild(field('Artist', select('dvArtist', [['', 'No artist'], ...artists.map((a) => [a.id, a.name || 'Unnamed artist'])], d.artist_id)));
        const shows = arr('bookings').filter((b) => isCloudId(b.id)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 300);
        grid.appendChild(field('Show', select('dvBooking', [['', 'Not for a show'], ...shows.map((b) => [b.id, `${b.event || 'Show'}${b.date ? ` · ${fmtDay(b.date)}` : ''}`])], d.booking_id)));
        if (kind.signed) grid.appendChild(field(kind.signed, input('date', 'dvSigned', d.signed_on)));
        if (kind.starts) grid.appendChild(field('Starts', input('date', 'dvStarts', d.starts_on)));
        if (kind.ends) grid.appendChild(field(kind.ends, input('date', 'dvEnds', d.ends_on), d.kind === 'travel' ? 'Reminders start 6 months ahead for passports, 60 days for visas and permits.' : ''));
        if (kind.notice) grid.appendChild(field('Renewal notice by', input('date', 'dvNotice', d.notice_on), 'The last day to give notice or renew.'));
        if (kind.amount) grid.appendChild(field('Amount (UGX)', input('number', 'dvAmount', d.amount, { min: 0, step: 1000, inputmode: 'numeric' })));
        card.appendChild(grid);

        if (kind.keyDates) {
            const kd = el('fieldset', 'dv-kd');
            kd.appendChild(el('legend', 'dv-field__label', d.kind === 'endorsement' ? 'Deliverables and key dates' : 'Key dates'));
            (d.key_dates || []).forEach((k, i) => {
                const row = el('div', 'dv-kd__row');
                const label = input('text', `dvKdLabel${i}`, k.label, { maxlength: 60, placeholder: d.kind === 'endorsement' ? 'e.g. Instagram post' : 'What is due', 'aria-label': 'What is due', 'data-dv-kd-label': i });
                const on = input('date', `dvKdOn${i}`, k.on, { 'aria-label': 'Date', 'data-dv-kd-on': i });
                const remove = button('dv-file__remove', '', { 'dv-kd-remove': i }, 'ph-x');
                remove.setAttribute('aria-label', 'Remove this date');
                row.append(label, on, remove);
                kd.appendChild(row);
            });
            kd.appendChild(button('dv-link', 'Add a date', { dv: 'kd-add' }, 'ph-plus'));
            card.appendChild(kd);
        }

        const notes = el('textarea');
        notes.id = 'dvNotes';
        notes.maxLength = 4000;
        notes.rows = 3;
        notes.value = d.notes || '';
        card.appendChild(field('Notes', notes));

        if (state.teamId) {
            const sens = el('label', 'dv-toggle dv-sensitive');
            const sensBox = el('input');
            sensBox.type = 'checkbox';
            sensBox.id = 'dvSensitive';
            sensBox.checked = !!d.sensitive;
            const sensText = el('span', '');
            sensText.append(el('strong', '', 'Private'), document.createTextNode(': only the owner, admins and you can see it. Use this for passports and IDs.'));
            sens.append(sensBox, sensText);
            card.appendChild(sens);
        }

        if (!form.id) {
            const files = el('div', 'dv-formfiles');
            files.appendChild(el('span', 'dv-field__label', 'File'));
            const preview = pendingPreview();
            if (preview) files.appendChild(preview);
            else files.appendChild(fileAdder('form'));
            card.appendChild(files);
        }

        const actions = el('div', 'dv-actions');
        const save = el('button', 'btn-primary', state.busy === 'save' || state.busy === 'upload' ? 'Saving…' : 'Save document');
        save.type = 'submit';
        save.disabled = !!state.busy || !!state.pending?.working;
        actions.append(save, button('back-btn', 'Cancel', { dv: form.id ? 'cancel-edit' : 'list' }));
        card.appendChild(actions);
        wrap.appendChild(card);
        return wrap;
    }

    // Copies what is typed into the draft, so a re-render keeps it.
    function readForm() {
        const d = state.form?.draft;
        if (!d) return;
        const v = (id) => $(id)?.value;
        if ($('dvKind')) d.kind = v('dvKind');
        if ($('dvTitle')) d.title = v('dvTitle');
        if ($('dvParty')) d.party = v('dvParty');
        if ($('dvArtist')) d.artist_id = v('dvArtist');
        if ($('dvBooking')) d.booking_id = v('dvBooking');
        if ($('dvSigned')) d.signed_on = v('dvSigned');
        if ($('dvStarts')) d.starts_on = v('dvStarts');
        if ($('dvEnds')) d.ends_on = v('dvEnds');
        if ($('dvNotice')) d.notice_on = v('dvNotice');
        if ($('dvAmount')) d.amount = v('dvAmount');
        if ($('dvNotes')) d.notes = v('dvNotes');
        if ($('dvSensitive')) d.sensitive = $('dvSensitive').checked;
        document.querySelectorAll('[data-dv-kd-label]').forEach((node) => {
            const i = Number(node.getAttribute('data-dv-kd-label'));
            if (d.key_dates[i]) d.key_dates[i].label = node.value;
        });
        document.querySelectorAll('[data-dv-kd-on]').forEach((node) => {
            const i = Number(node.getAttribute('data-dv-kd-on'));
            if (d.key_dates[i]) d.key_dates[i].on = node.value;
        });
    }

    // ── Elsewhere in the app ─────────────────────────────────────────────
    function miniRow(doc) {
        const c = countdown(doc);
        const li = el('li', 'dv-mini__row');
        const b = button('dv-mini__btn', '', { 'dv-goto': doc.id });
        const t = el('span', 'dv-mini__title', doc.title);
        if (doc.sensitive) {
            const lock = icon('ph-lock-simple');
            lock.classList.add('dv-row__lock');
            t.appendChild(lock);
        }
        b.append(icon((KIND[doc.kind] || KIND.other).icon), t, el('span', `ap-pill is-${c.tone}`, c.text));
        li.appendChild(b);
        return li;
    }

    function byUrgency(list) {
        const t = today();
        return list.map((d) => ({ d, c: countdown(d, t) }))
            .sort((a, b) => a.c.rank - b.c.rank || (a.c.days ?? 1e9) - (b.c.days ?? 1e9))
            .map((x) => x.d);
    }

    // The artist profile's Documents box.
    function artistBlock(artist) {
        if (!state.me || !artist) return null;
        const box = el('div', 'ap-detail__docs dv-mini');
        box.appendChild(el('span', 'ap-label', 'Documents'));
        const docs = isCloudId(artist.id) ? byUrgency(state.docs.filter((d) => !d.archived && String(d.artist_id) === String(artist.id))) : [];
        const list = el('ul', 'dv-mini__list');
        docs.slice(0, 4).forEach((d) => list.appendChild(miniRow(d)));
        if (!state.loaded) list.appendChild(el('li', 'ap-costs__empty', 'Loading…'));
        else if (!docs.length) list.appendChild(el('li', 'ap-costs__empty', 'No documents linked to this artist yet.'));
        box.appendChild(list);
        const foot = el('div', 'dv-mini__foot');
        if (docs.length) foot.appendChild(button('dv-link', docs.length > 4 ? `All ${docs.length} documents` : 'Open in Documents', { 'dv-artist': artist.id }));
        if (canEdit() && isCloudId(artist.id)) foot.appendChild(button('dv-link', 'Add a document', { 'dv-new-artist': artist.id }, 'ph-plus'));
        box.appendChild(foot);
        return box;
    }

    function renderBookingPanel() {
        const panel = $('spBookingDocs');
        if (!panel) return;
        const booking = bookingById(state.bookingId);
        if (!booking || !state.me) { panel.hidden = true; panel.replaceChildren(); return; }
        panel.hidden = false;
        panel.replaceChildren();
        const head = el('div', 'sp-payments__head');
        head.appendChild(el('span', 'sp-payments__title', 'Documents for this show'));
        panel.appendChild(head);
        const docs = isCloudId(booking.id) ? byUrgency(state.docs.filter((d) => String(d.booking_id) === String(booking.id))) : [];
        const list = el('ul', 'dv-mini__list');
        docs.forEach((d) => list.appendChild(miniRow(d)));
        if (!docs.length) list.appendChild(el('li', 'sp-payments__empty', isCloudId(booking.id) ? 'No contract, rider or receipts linked yet.' : 'Save the booking first, then link its paperwork.'));
        panel.appendChild(list);
        if (canEdit() && isCloudId(booking.id)) panel.appendChild(button('dv-link', 'Add a document for this show', { 'dv-new-booking': booking.id }, 'ph-plus'));
    }

    function showForBooking(bookingId) {
        state.bookingId = bookingId || null;
        if (state.bookingId && !state.loaded && !state.loading) sync();
        renderBookingPanel();
    }

    function hideForBooking() {
        state.bookingId = null;
        const panel = $('spBookingDocs');
        if (panel) { panel.hidden = true; panel.replaceChildren(); }
    }

    // ── Events ───────────────────────────────────────────────────────────
    document.addEventListener('click', (event) => {
        const t = event.target;
        if (!t?.closest) return;
        const goto = t.closest('[data-dv-goto]');
        if (goto) { event.preventDefault(); openDocument(goto.getAttribute('data-dv-goto')); return; }
        const forArtist = t.closest('[data-dv-artist]');
        if (forArtist) { event.preventDefault(); openForArtist(forArtist.getAttribute('data-dv-artist')); return; }
        const newArtist = t.closest('[data-dv-new-artist]');
        if (newArtist) {
            event.preventDefault();
            if (typeof window.showSection === 'function') window.showSection('documents');
            startForm(null, { artist_id: newArtist.getAttribute('data-dv-new-artist') });
            return;
        }
        const newBooking = t.closest('[data-dv-new-booking]');
        if (newBooking) {
            event.preventDefault();
            const booking = bookingById(newBooking.getAttribute('data-dv-new-booking'));
            if (typeof window.showSection === 'function') window.showSection('documents');
            startForm(null, { kind: 'show', booking_id: booking?.id, artist_id: isCloudId(booking?.artistId) ? booking.artistId : '' });
            return;
        }

        const root = $('docsRoot');
        if (!root || !root.contains(t)) return;
        const open = t.closest('[data-dv-open]');
        if (open) { go('detail', open.getAttribute('data-dv-open')); return; }
        const kindBtn = t.closest('[data-dv-kind]');
        if (kindBtn) { state.kind = kindBtn.getAttribute('data-dv-kind'); render(); return; }
        const dueBtn = t.closest('[data-dv-due]');
        if (dueBtn) {
            const v = dueBtn.getAttribute('data-dv-due');
            state.due = v === 'all' || state.due === v ? null : v;
            render();
            return;
        }
        if (t.closest('[data-dv-artist-clear]')) { state.artist = null; render(); return; }
        const bookingLink = t.closest('[data-dv-booking]');
        if (bookingLink) { window.SPOpenBooking?.(bookingLink.getAttribute('data-dv-booking')); return; }
        const fileAct = t.closest('[data-dv-file-act]');
        if (fileAct) {
            const doc = docById(state.openId);
            const file = (doc?.files || []).find((f) => f.id === fileAct.getAttribute('data-dv-file'));
            if (!doc || !file) return;
            const act = fileAct.getAttribute('data-dv-file-act');
            if (act === 'open') openFile(file);
            else if (act === 'download') downloadFile(doc, file);
            else if (act === 'share') shareFile(doc, file);
            else shareLink(doc, file, act);
            return;
        }
        const fileAsk = t.closest('[data-dv-file-ask]');
        if (fileAsk) { state.confirmFile = fileAsk.getAttribute('data-dv-file-ask'); render(); return; }
        const fileRemove = t.closest('[data-dv-file-remove]');
        if (fileRemove) {
            const doc = docById(state.openId);
            const file = (doc?.files || []).find((f) => f.id === fileRemove.getAttribute('data-dv-file-remove'));
            state.confirmFile = null;
            if (doc && file) removeFile(doc, file);
            return;
        }
        const kdRemove = t.closest('[data-dv-kd-remove]');
        if (kdRemove && state.form) {
            readForm();
            state.form.draft.key_dates.splice(Number(kdRemove.getAttribute('data-dv-kd-remove')), 1);
            render();
            return;
        }
        const action = t.closest('[data-dv]')?.getAttribute('data-dv');
        if (!action) return;
        const doc = docById(state.openId);
        switch (action) {
            case 'new': startForm(null); break;
            case 'list': clearPending(); go('list'); break;
            case 'reload': load(); break;
            case 'edit': if (doc) startForm(doc); break;
            case 'cancel-edit': clearPending(); go('detail', state.form?.id || state.openId); break;
            case 'archive': if (doc) setArchived(doc, true); break;
            case 'restore': if (doc) setArchived(doc, false); break;
            case 'delete': state.confirmDelete = state.openId; render(); break;
            case 'delete-no': state.confirmDelete = null; render(); break;
            case 'delete-yes': if (doc) removeDoc(doc); break;
            case 'kd-add': readForm(); state.form.draft.key_dates.push({ label: '', on: '' }); render(); $(`dvKdLabel${state.form.draft.key_dates.length - 1}`)?.focus(); break;
            case 'crop-off': if (state.pending) { readForm(); state.pending.crop = false; reprocess(); } break;
            case 'crop-on': if (state.pending) { readForm(); state.pending.crop = true; reprocess(); } break;
            case 'pending-clear': readForm(); clearPending(); render(); break;
            default: break;
        }
    });

    document.addEventListener('submit', (event) => {
        if (event.target?.id !== 'dvForm') return;
        event.preventDefault();
        saveForm();
    });

    document.addEventListener('input', (event) => {
        const t = event.target;
        if (t?.id === 'dvSearch') {
            state.search = t.value;
            const host = $('dvListHost');
            if (host) host.replaceChildren(renderRows());
        }
    });

    document.addEventListener('change', (event) => {
        const t = event.target;
        if (!t) return;
        if (t.id === 'dvArchived') { state.archived = t.checked; render(); return; }
        if (t.id === 'dvFileLabel') { state.newFileLabel = t.value; return; }
        if (t.id === 'dvKind' && state.form) {
            readForm();
            const d = state.form.draft;
            if (!state.form.id && d.kind === 'travel') d.sensitive = true;
            render();
            $('dvKind')?.focus();
            return;
        }
    });

    // ── Public API ───────────────────────────────────────────────────────
    function sync() {
        const api = sp();
        if (!api) return;
        const teamId = api.getActiveTeamId?.() || null;
        const me = api.getOwnerId?.() || null;
        if (teamId === state.teamId && me === state.me && (state.loaded || state.loading)) return;
        if (teamId !== state.teamId || me !== state.me) {
            state.docs = [];
            state.loaded = false;
            state.view = 'list';
            state.openId = null;
            state.form = null;
            state.artist = null;
            clearPending();
        }
        state.teamId = teamId;
        state.me = me;
        if (!me) { render(); return; }
        load();
    }

    // Opening the page picks up what teammates added since the last look.
    function open() {
        sync();
        if (state.loaded && !state.loading && Date.now() - state.loadedAt > 60 * 1000) load();
        else render();
    }

    window.SPDocs = {
        sync,
        open,
        reload: load,
        alerts,
        openDocument,
        openForArtist,
        newDocument,
        artistBlock,
        showForBooking,
        hideForBooking,
        countdown,
        kinds: KINDS,
        _findPage: findPage,
    };
    window.addEventListener('sp-supabase-ready', () => setTimeout(sync, 0));
    if (isOpen()) render();
})();
