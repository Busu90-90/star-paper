/**
 * Star Paper - Money tabs: Overview extras (deltas, waterfall, biggest
 * changes, profit and loss), Cash flow (opening to closing cash, 13-week
 * forecast with a minimum-cash line) and Receivables (aging, top 10 unpaid,
 * expected collections). app.js still fills the ids it always did; this file
 * draws the rest from the same money rules as Home (window.SPMoney via
 * window.SPHome), using DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const MIN_CASH_KEY = 'starPaperMinCash';
    const WEEKS = 13;
    const SPEND_WEEKS = 12;
    const SHOW_COSTS = new Set(['transport', 'accommodation', 'equipment', 'costumes', 'food']);
    const CATEGORY_LABELS = {
        transport: 'Transport',
        accommodation: 'Accommodation',
        equipment: 'Equipment',
        costumes: 'Costumes',
        food: 'Food & drinks',
        salary: 'Salary',
        marketing: 'Marketing',
        supplies: 'Supplies',
        miscellaneous: 'Miscellaneous',
        other: 'Other'
    };

    const $ = (id) => document.getElementById(id);
    const home = () => window.SPHome || null;

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function categoryKey(entry) {
        const key = String(entry?.category || 'other').trim().toLowerCase();
        return key || 'other';
    }

    function categoryLabel(key) {
        return CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
    }

    function monthName(date, form = 'long') {
        return date.toLocaleDateString('en-US', { month: form });
    }

    function readMinCash() {
        try {
            const raw = window.localStorage.getItem(MIN_CASH_KEY);
            if (raw === null || raw === '') return null;
            const value = Number(raw);
            return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
        } catch (_) { return null; }
    }

    function saveMinCash(value) {
        try {
            if (value === null) window.localStorage.removeItem(MIN_CASH_KEY);
            else window.localStorage.setItem(MIN_CASH_KEY, String(Math.round(value)));
        } catch (_) { /* this device only until Settings > Targets syncs it */ }
    }

    function setText(id, text) {
        const node = $(id);
        if (node) node.textContent = text;
    }

    function setTone(node, tone) {
        if (!node) return;
        node.classList.remove('is-good', 'is-bad', 'is-flat');
        if (tone) node.classList.add(tone);
    }

    // ── Data ───────────────────────────────────────────────────────────────
    // One month's profit and loss lines, on the same rules as Home.
    function monthLines(date) {
        const H = home();
        const m = H.money();
        const { asAmount, parseDate, monthIndex } = H.fmt;
        const target = monthIndex(date);
        const inMonth = (value) => {
            const d = parseDate(value);
            return d && monthIndex(d) === target;
        };
        const lines = { shows: 0, other: 0, categories: new Map() };
        (window.bookings || []).forEach((booking) => {
            if (m.isEarningBooking(booking) && inMonth(booking.date)) lines.shows += m.getBookingCollected(booking);
        });
        (window.otherIncome || []).forEach((entry) => {
            if (m.isReceivedOtherIncome(entry) && inMonth(entry.date)) lines.other += asAmount(entry.amount);
        });
        (window.expenses || []).forEach((entry) => {
            if (!inMonth(entry.date)) return;
            const key = categoryKey(entry);
            lines.categories.set(key, (lines.categories.get(key) || 0) + asAmount(entry.amount));
        });
        lines.in = lines.shows + lines.other;
        lines.showCosts = 0;
        lines.overheads = 0;
        lines.categories.forEach((amount, key) => {
            if (SHOW_COSTS.has(key)) lines.showCosts += amount;
            else lines.overheads += amount;
        });
        lines.out = lines.showCosts + lines.overheads;
        lines.net = lines.in - lines.out;
        return lines;
    }

    function averageWeeklySpend(today) {
        const { asAmount, parseDate, DAY_MS } = home().fmt;
        const from = new Date(today.getTime() - SPEND_WEEKS * 7 * DAY_MS);
        let total = 0;
        (window.expenses || []).forEach((entry) => {
            const d = parseDate(entry.date);
            if (d && d >= from && d < today) total += asAmount(entry.amount);
        });
        return total / SPEND_WEEKS;
    }

    function unpaidRows(today) {
        const H = home();
        const m = H.money();
        const { asAmount, parseDate, DAY_MS } = H.fmt;
        const rows = [];
        (window.bookings || []).forEach((booking) => {
            if (!m.isEarningBooking(booking)) return;
            const balance = asAmount(booking.balance);
            if (balance <= 0) return;
            const date = parseDate(booking.date);
            const days = date ? Math.floor((today - startOfDay(date)) / DAY_MS) : 0;
            rows.push({ booking, balance, date, days, score: balance * Math.max(0, days) });
        });
        return rows;
    }

    function forecast(today, cashNow) {
        const H = home();
        const m = H.money();
        const { asAmount, parseDate, DAY_MS } = H.fmt;
        const weekday = (today.getDay() + 6) % 7;
        const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday);
        const spend = averageWeeklySpend(today);
        const weeks = Array.from({ length: WEEKS }, (_, i) => ({
            start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i * 7),
            in: 0,
            pending: 0,
            out: Math.round(spend)
        }));
        const end = new Date(monday.getTime() + WEEKS * 7 * DAY_MS);
        const weekOf = (date) => weeks[Math.floor((startOfDay(date) - monday) / (7 * DAY_MS))];
        (window.bookings || []).forEach((booking) => {
            const date = parseDate(booking.date);
            if (!date || date < today || date >= end) return;
            const week = weekOf(date);
            if (!week) return;
            if (m.isEarningBooking(booking)) week.in += Math.max(0, asAmount(booking.balance));
            else if (String(booking?.status || '').toLowerCase() === 'pending') week.pending += Math.max(0, asAmount(booking.fee));
        });
        let cash = cashNow;
        let withPending = cashNow;
        weeks.forEach((week) => {
            cash += week.in - week.out;
            withPending += week.in + week.pending - week.out;
            week.cash = cash;
            week.cashWithPending = withPending;
        });
        return { weeks, spend };
    }

    // ── Overview ───────────────────────────────────────────────────────────
    function renderOverviewDeltas(cur, prev, owed) {
        const H = home();
        H.setDelta($('mvDeltaShows'), cur.shows, prev.shows);
        H.setDelta($('mvDeltaOther'), cur.other, prev.other);
        H.setDelta($('mvDeltaExpenses'), cur.out, prev.out, { upIsGood: false });
        H.setDelta($('mvDeltaNet'), cur.net, prev.net);
        const late = $('mvOwedLate');
        if (late) {
            // The tile is this month's shows; the line points at everything owed.
            late.textContent = owed.total > 0 ? `This month's shows. ${H.fmt.compact(owed.total)} owed in all` : 'Nothing owed in all';
            setTone(late, null);
        }
    }

    function renderWaterfall(cur, now) {
        const node = $('mvWaterfall');
        if (!node) return;
        const H = home();
        const { svg } = H.dom;
        const { compact, ugx } = H.fmt;
        node.replaceChildren();
        setText('mvWaterfallPeriod', `${monthName(now)} ${now.getFullYear()}`);

        const steps = [
            { label: 'Shows', value: cur.shows, kind: 'in' },
            { label: 'Other income', value: cur.other, kind: 'in' },
            { label: 'Show costs', value: -cur.showCosts, kind: 'out' },
            { label: 'Overheads', value: -cur.overheads, kind: 'out' },
            { label: 'Left over', value: cur.net, kind: 'total' }
        ];
        let running = 0;
        steps.forEach((step) => {
            if (step.kind === 'total') { step.from = 0; step.to = step.value; return; }
            step.from = running;
            running += step.value;
            step.to = running;
        });

        const W = Math.max(300, Math.round(node.clientWidth || node.parentElement?.clientWidth || 640));
        const narrow = W < 480;
        const H2 = narrow ? 210 : 240;
        node.setAttribute('viewBox', `0 0 ${W} ${H2}`);
        const top = 22;
        const bottom = narrow ? 34 : 26;
        const plotH = H2 - top - bottom;
        const max = Math.max(1, ...steps.map((s) => Math.max(s.from, s.to)));
        const min = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
        const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;
        const slot = W / steps.length;
        const barW = Math.min(64, slot * 0.56);

        node.appendChild(svg('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'mv-wf__zero' }));
        steps.forEach((step, i) => {
            const x = slot * i + (slot - barW) / 2;
            const y1 = y(Math.max(step.from, step.to));
            const y2 = y(Math.min(step.from, step.to));
            const tone = step.kind === 'total' ? (step.value < 0 ? 'mv-wf__bar--loss' : 'mv-wf__bar--total') : `mv-wf__bar--${step.kind}`;
            const g = svg('g', { class: 'mv-wf__step' });
            g.appendChild(svg('title', {}, `${step.label}: ${ugx(step.value)}`));
            g.appendChild(svg('rect', { x, y: y1, width: barW, height: Math.max(step.value ? 2 : 0, y2 - y1), rx: 4, class: `mv-wf__bar ${tone}` }));
            const sign = step.kind === 'out' && step.value ? '−' : '';
            g.appendChild(svg('text', { x: x + barW / 2, y: y1 - 6, class: 'mv-wf__value', 'text-anchor': 'middle' }, `${sign}${compact(Math.abs(step.value))}`));
            const words = narrow ? step.label.split(' ') : [step.label];
            words.forEach((word, w) => {
                g.appendChild(svg('text', { x: x + barW / 2, y: H2 - bottom + 16 + w * 13, class: 'mv-wf__axis', 'text-anchor': 'middle' }, word));
            });
            if (i < steps.length - 2) {
                const nx = slot * (i + 1) + (slot - barW) / 2;
                g.appendChild(svg('line', { x1: x + barW, x2: nx, y1: y(step.to), y2: y(step.to), class: 'mv-wf__link' }));
            }
            node.appendChild(g);
        });

        const note = $('mvWaterfallNote');
        if (note) {
            if (!cur.in && !cur.out) note.textContent = 'Nothing collected or spent yet this month.';
            else if (cur.in > 0) {
                const margin = Math.round((cur.net / cur.in) * 100);
                note.textContent = `${margin}% of what came in was left after costs. Show costs are transport, accommodation, equipment, costumes and food; overheads are everything else.`;
            } else note.textContent = 'Money went out but nothing came in yet this month.';
        }
    }

    function renderChanges(cur, prev, now) {
        const list = $('mvChanges');
        if (!list) return;
        const H = home();
        const { el } = H.dom;
        const { ugx, compact } = H.fmt;
        list.replaceChildren();
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const summary = $('mvSummary');
        if (summary) {
            const diff = cur.net - prev.net;
            const head = cur.net >= 0 ? `You kept ${ugx(cur.net)} this month` : `You're ${ugx(-cur.net)} down this month`;
            const tail = !prev.in && !prev.out
                ? `, with nothing to compare in ${monthName(last)}.`
                : diff === 0
                    ? `, the same as ${monthName(last)}.`
                    : `, ${compact(Math.abs(diff))} ${diff > 0 ? 'better' : 'worse'} than ${monthName(last)}.`;
            summary.textContent = head + tail;
        }

        const items = [
            { label: 'Show money', cur: cur.shows, prev: prev.shows, upIsGood: true },
            { label: 'Other income', cur: cur.other, prev: prev.other, upIsGood: true }
        ];
        new Set([...cur.categories.keys(), ...prev.categories.keys()]).forEach((key) => {
            items.push({ label: categoryLabel(key), cur: cur.categories.get(key) || 0, prev: prev.categories.get(key) || 0, upIsGood: false });
        });
        const ranked = items
            .map((item) => ({ ...item, change: item.cur - item.prev }))
            .filter((item) => item.change !== 0)
            .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
            .slice(0, 3);
        if (!ranked.length) {
            list.appendChild(el('li', 'mv-empty', 'No changes from last month yet.'));
            return;
        }
        ranked.forEach((item) => {
            const up = item.change > 0;
            const li = el('li', `mv-change ${up === item.upIsGood ? 'is-good' : 'is-bad'}`);
            const icon = el('i', `ph ${up ? 'ph-trend-up' : 'ph-trend-down'} mv-change__icon`);
            icon.setAttribute('aria-hidden', 'true');
            const pct = item.prev ? ` (${up ? '+' : '−'}${Math.round(Math.abs(item.change / item.prev) * 100)}%)` : '';
            const body = el('div', 'mv-change__body');
            body.append(
                el('span', 'mv-change__name', `${item.label} ${up ? 'up' : 'down'}`),
                el('span', 'mv-change__detail', `${compact(item.prev)} → ${compact(item.cur)}${pct}`)
            );
            li.append(icon, body, el('span', 'mv-change__amt money', `${up ? '+' : '−'}${compact(Math.abs(item.change))}`));
            list.appendChild(li);
        });
    }

    function renderPnl(cur, prev, now) {
        const table = $('mvPnl');
        if (!table) return;
        const H = home();
        const { el } = H.dom;
        table.replaceChildren();
        const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const head = el('thead');
        const hr = el('tr');
        ['UGX', monthName(now, 'short'), monthName(last, 'short'), 'Change'].forEach((text, i) => {
            const th = el('th', i ? 'is-num' : '', text);
            th.setAttribute('scope', 'col');
            hr.appendChild(th);
        });
        head.appendChild(hr);

        const body = el('tbody');
        const row = (label, a, b, { kind = '', upIsGood = true, money = true } = {}) => {
            const tr = el('tr', kind ? `mv-pl__${kind}` : '');
            const th = el('th', '', label);
            th.setAttribute('scope', 'row');
            const change = a - b;
            const tone = !change ? '' : (change > 0) === upIsGood ? 'is-good' : 'is-bad';
            const fmt = (v) => (money ? Math.round(v).toLocaleString('en-US') : `${v}%`);
            tr.append(th, el('td', 'is-num money', fmt(a)), el('td', 'is-num money', fmt(b)),
                el('td', `is-num money ${tone}`, change ? `${change > 0 ? '+' : '−'}${fmt(Math.abs(change))}` : '—'));
            body.appendChild(tr);
        };
        const cats = (filter) => [...new Set([...cur.categories.keys(), ...prev.categories.keys()])]
            .filter(filter)
            .sort((a, b) => (cur.categories.get(b) || 0) - (cur.categories.get(a) || 0));

        row('Show money collected', cur.shows, prev.shows);
        row('Other income', cur.other, prev.other);
        row('Money in', cur.in, prev.in, { kind: 'total' });
        row('Show costs', cur.showCosts, prev.showCosts, { kind: 'group', upIsGood: false });
        cats((k) => SHOW_COSTS.has(k)).forEach((k) => row(categoryLabel(k), cur.categories.get(k) || 0, prev.categories.get(k) || 0, { kind: 'sub', upIsGood: false }));
        row('Overheads', cur.overheads, prev.overheads, { kind: 'group', upIsGood: false });
        cats((k) => !SHOW_COSTS.has(k)).forEach((k) => row(categoryLabel(k), cur.categories.get(k) || 0, prev.categories.get(k) || 0, { kind: 'sub', upIsGood: false }));
        row('Money out', cur.out, prev.out, { kind: 'total', upIsGood: false });
        row('Left over', cur.net, prev.net, { kind: 'net' });
        const margin = (l) => (l.in > 0 ? Math.round((l.net / l.in) * 100) : 0);
        row('Kept of every 100 in', margin(cur), margin(prev), { kind: 'sub', money: false });
        table.append(head, body);
    }

    // ── Cash flow ──────────────────────────────────────────────────────────
    function renderCashflow(cur, now) {
        const H = home();
        const { ugx } = H.fmt;
        const today = startOfDay(now);
        const bbf = (window.SPMoney?.getBBF?.() || { amount: 0, label: '' });
        const open = Math.round(Number(bbf.amount) || 0);
        const close = open + cur.in - cur.out;

        setText('mvCfOpen', ugx(open));
        setText('mvCfOpenSub', open ? `Brought forward${bbf.label ? ` for ${bbf.label}` : ''}` : 'No balance brought forward set');
        setText('mvCfIn', ugx(cur.in));
        setText('mvCfInSub', `Shows ${H.fmt.compact(cur.shows)}, other ${H.fmt.compact(cur.other)}`);
        setText('mvCfOut', ugx(cur.out));
        setText('mvCfOutSub', `${monthName(now)} expenses`);
        setText('mvCfClose', ugx(close));

        const plan = forecast(today, close);
        const monthlySpend = (plan.spend * 52) / 12;
        const stored = readMinCash();
        const minCash = stored === null ? Math.round(monthlySpend) : stored;
        setText('mvMinCash', ugx(minCash));
        const closeSub = $('mvCfCloseSub');
        if (closeSub) {
            closeSub.textContent = monthlySpend > 0
                ? `Covers ${(close / monthlySpend).toFixed(1).replace(/\.0$/, '')} months of spending`
                : 'No spending in the last 12 weeks';
            setTone(closeSub, close < minCash ? 'is-bad' : '');
        }
        renderForecastChart(plan, minCash);

        const note = $('mvForecastNote');
        if (note) {
            const dip = plan.weeks.find((w) => w.cash < minCash);
            const lowest = plan.weeks.reduce((a, w) => (w.cash < a.cash ? w : a), plan.weeks[0]);
            const when = (w) => `the week of ${w.start.getDate()} ${monthName(w.start, 'short')}`;
            const parts = [];
            if (dip) parts.push(`Cash drops below your minimum in ${when(dip)}, to ${ugx(dip.cash)}.`);
            else parts.push(`Cash stays above your minimum for all 13 weeks. The lowest point is ${ugx(lowest.cash)}, in ${when(lowest)}.`);
            parts.push(`Spending is estimated at ${ugx(plan.spend)} a week.`);
            if (stored === null) parts.push('The minimum defaults to one month of spending until you set your own.');
            note.textContent = parts.join(' ');
            note.classList.toggle('is-bad', Boolean(dip));
        }
    }

    function renderForecastChart(plan, minCash) {
        const node = $('mvForecast');
        if (!node) return;
        const H = home();
        const { svg } = H.dom;
        const { compact, ugx } = H.fmt;
        node.replaceChildren();
        const W = Math.max(300, Math.round(node.clientWidth || node.parentElement?.clientWidth || 640));
        const narrow = W < 480;
        const H2 = narrow ? 220 : 260;
        node.setAttribute('viewBox', `0 0 ${W} ${H2}`);
        const left = 46;
        const right = 8;
        const top = 12;
        const bottom = 24;
        const plotW = W - left - right;
        const plotH = H2 - top - bottom;
        const weeks = plan.weeks;
        const values = weeks.flatMap((w) => [w.cash, w.cashWithPending, w.in, w.out]).concat([minCash, 0]);
        const max = Math.max(1, ...values);
        const min = Math.min(0, ...values);
        const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;

        [max, max / 2, 0, min < 0 ? min : null].filter((v) => v !== null).forEach((v) => {
            node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: v === 0 ? 'mv-fc__zero' : 'mv-fc__grid' }));
            node.appendChild(svg('text', { x: left - 6, y: y(v) + 4, class: 'mv-fc__axis', 'text-anchor': 'end' }, compact(v)));
        });

        const slot = plotW / weeks.length;
        const barW = Math.max(3, Math.min(12, slot * 0.28));
        const cx = (i) => left + slot * i + slot / 2;
        weeks.forEach((week, i) => {
            const g = svg('g', { class: 'mv-fc__week' });
            const label = `${week.start.getDate()} ${monthName(week.start, 'short')}`;
            g.appendChild(svg('title', {}, `Week of ${label}: in ${ugx(week.in)}, out ${ugx(week.out)}, cash ${ugx(week.cash)}${week.pending ? `, ${ugx(week.pending)} more if pending shows confirm` : ''}`));
            g.appendChild(svg('rect', { x: left + slot * i, y: top, width: slot, height: plotH, class: 'mv-fc__hit' }));
            g.appendChild(svg('rect', { x: cx(i) - barW - 1, y: y(week.in), width: barW, height: Math.max(0, y(0) - y(week.in)), rx: 2, class: 'mv-fc__in' }));
            g.appendChild(svg('rect', { x: cx(i) + 1, y: y(week.out), width: barW, height: Math.max(0, y(0) - y(week.out)), rx: 2, class: 'mv-fc__out' }));
            if (!narrow || i % 2 === 0) g.appendChild(svg('text', { x: cx(i), y: H2 - 6, class: 'mv-fc__axis', 'text-anchor': 'middle' }, label));
            node.appendChild(g);
        });

        node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(minCash), y2: y(minCash), class: 'mv-fc__min' }));
        const path = (key) => weeks.map((w, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(w[key]).toFixed(1)}`).join(' ');
        if (weeks.some((w) => w.pending)) node.appendChild(svg('path', { d: path('cashWithPending'), class: 'mv-fc__pending' }));
        node.appendChild(svg('path', { d: path('cash'), class: 'mv-fc__cash' }));
        weeks.forEach((w, i) => {
            node.appendChild(svg('circle', { cx: cx(i), cy: y(w.cash), r: w.cash < minCash ? 4.5 : 3, class: w.cash < minCash ? 'mv-fc__dot mv-fc__dot--low' : 'mv-fc__dot' }));
        });
    }

    // ── Receivables ────────────────────────────────────────────────────────
    function phoneDigits(contact) {
        const digits = String(contact || '').replace(/[^\d+]/g, '');
        const bare = digits.replace(/^\+/, '');
        if (bare.length < 9) return '';
        if (/^0\d{9}$/.test(bare)) return `256${bare.slice(1)}`;
        if (/^7\d{8}$/.test(bare)) return `256${bare}`;
        return bare;
    }

    function renderReceivables(now) {
        const H = home();
        const { el } = H.dom;
        const { ugx } = H.fmt;
        const today = startOfDay(now);
        const owed = H.receivables(now);
        const rows = unpaidRows(today);
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

        const late = rows.filter((r) => r.days > 0);
        const due30 = rows.filter((r) => r.days <= 0 && r.days > -31);
        const due90 = rows.filter((r) => r.days <= -31 && r.days > -91);
        const sum = (list) => list.reduce((a, r) => a + r.balance, 0);
        setText('mvArTotal', ugx(owed.total));
        setText('mvArTotalSub', rows.length ? `Across ${plural(rows.length, 'show')}` : 'Every show is paid up');
        setText('mvArLate', ugx(owed.late));
        const lateSub = $('mvArLateSub');
        if (lateSub) {
            const oldest = late.reduce((a, r) => Math.max(a, r.days), 0);
            lateSub.textContent = late.length ? `${plural(late.length, 'show')}, oldest ${plural(oldest, 'day')} late` : 'Nothing overdue';
            setTone(lateSub, late.length ? 'is-bad' : 'is-good');
        }
        setText('mvAr30', ugx(sum(due30)));
        setText('mvAr30Sub', due30.length ? `${plural(due30.length, 'show')} still to play` : 'No balances due');
        setText('mvAr90', ugx(sum(due90)));
        setText('mvAr90Sub', due90.length ? plural(due90.length, 'show') : 'No balances due');

        H.renderAging(owed, $('mvAging'));

        const list = $('mvUnpaid');
        if (!list) return;
        list.replaceChildren();
        if (!rows.length) {
            list.appendChild(el('li', 'mv-empty', 'No unpaid balances. Every show is paid up.'));
            return;
        }
        rows.sort((a, b) => b.score - a.score || b.balance - a.balance)
            .slice(0, 10)
            .forEach((row) => {
                const b = row.booking;
                const li = el('li', `mv-unpaid__row ${row.days > 0 ? 'is-late' : ''}`);
                const main = el('div', 'mv-unpaid__main');
                main.append(
                    el('span', 'mv-unpaid__event', b.event || 'Untitled show'),
                    el('span', 'mv-unpaid__meta', [b.artist, b.location || b.venue].filter(Boolean).join(' · ') || 'No artist set')
                );
                const when = el('div', 'mv-unpaid__when');
                const dateText = row.date ? row.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date';
                const lateText = !row.date ? '' : row.days > 0 ? `${plural(row.days, 'day')} late` : row.days === 0 ? 'Show is today' : `Show in ${plural(Math.round(-row.days), 'day')}`;
                when.append(el('span', 'mv-unpaid__date', dateText), el('span', 'mv-unpaid__late', lateText));
                const amount = el('span', 'mv-unpaid__amt money', ugx(row.balance));
                const actions = el('div', 'mv-unpaid__actions');
                const phone = phoneDigits(b.contact);
                if (phone) {
                    const call = el('a', 'mv-unpaid__btn');
                    call.href = `tel:+${phone}`;
                    call.setAttribute('aria-label', `Call about ${b.event || 'this show'}`);
                    call.title = 'Call';
                    const ci = el('i', 'ph ph-phone'); ci.setAttribute('aria-hidden', 'true');
                    call.appendChild(ci);
                    const wa = el('a', 'mv-unpaid__btn');
                    const msg = `Hello, a reminder about the balance of ${ugx(row.balance)} for ${b.event || 'the show'}${row.date ? ` on ${dateText}` : ''}. Thank you.`;
                    wa.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                    wa.target = '_blank';
                    wa.rel = 'noopener noreferrer';
                    wa.setAttribute('aria-label', `WhatsApp a reminder about ${b.event || 'this show'}`);
                    wa.title = 'WhatsApp reminder';
                    const wi = el('i', 'ph ph-whatsapp-logo'); wi.setAttribute('aria-hidden', 'true');
                    wa.appendChild(wi);
                    actions.append(call, wa);
                } else if (b.contact) {
                    actions.appendChild(el('span', 'mv-unpaid__contact', b.contact));
                }
                li.append(main, when, amount, actions);
                list.appendChild(li);
            });
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function render() {
        const H = home();
        if (!H || !$('moneyPanel-financials')) return;
        const now = new Date();
        const cur = monthLines(now);
        const prev = monthLines(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const owed = H.receivables(now);
        renderOverviewDeltas(cur, prev, owed);
        renderWaterfall(cur, now);
        renderChanges(cur, prev, now);
        renderPnl(cur, prev, now);
        renderCashflow(cur, now);
        renderReceivables(now);
    }

    function toggleMinCashEditor(open) {
        const editor = $('mvMinCashEditor');
        if (!editor) return;
        editor.hidden = !open;
        if (open) {
            const input = $('mvMinCashInput');
            const stored = readMinCash();
            if (input) {
                input.value = stored === null ? '' : String(stored);
                setTimeout(() => input.focus(), 0);
            }
        }
    }

    document.addEventListener('click', (event) => {
        if (event.target.closest?.('#money [data-mv-mincash]')) {
            toggleMinCashEditor($('mvMinCashEditor')?.hidden !== false);
        } else if (event.target.closest?.('#money [data-mv-mincash-cancel]')) {
            toggleMinCashEditor(false);
        }
    });

    document.addEventListener('submit', (event) => {
        if (event.target?.id !== 'mvMinCashEditor') return;
        event.preventDefault();
        const raw = String($('mvMinCashInput')?.value || '').trim();
        const value = Number(raw);
        saveMinCash(raw === '' || !Number.isFinite(value) || value < 0 ? null : value);
        toggleMinCashEditor(false);
        render();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    });

    window.SPMoneyPages = { render };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
