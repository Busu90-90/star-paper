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
        let raw = null;
        if (window.SPFinance) {
            raw = window.SPFinance.getSettings().minCash;
        } else {
            try { raw = window.localStorage.getItem(MIN_CASH_KEY); } catch (_) { raw = null; }
        }
        if (raw === null || raw === undefined || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    }

    function saveMinCash(value) {
        const next = value === null ? null : Math.round(value);
        if (window.SPFinance) return window.SPFinance.updateSettings({ minCash: next });
        try {
            if (next === null) window.localStorage.removeItem(MIN_CASH_KEY);
            else window.localStorage.setItem(MIN_CASH_KEY, String(next));
        } catch (_) { /* this device only */ }
        return null;
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
            if (!m.isEarningBooking(booking)) return;
            const events = m.getBookingCashEvents ? m.getBookingCashEvents(booking) : [{ date: booking.date, amount: m.getBookingCollected(booking) }];
            events.forEach((event) => { if (inMonth(event.date)) lines.shows += event.amount; });
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
        const C = window.SPCharts;
        if (C) {
            const now = new Date();
            const months = Array.from({ length: 6 }, (_, i) => monthLines(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)));
            C.spark($('mvSparkShows'), months.map((l) => l.shows), { tone: 'gold' });
            C.spark($('mvSparkOther'), months.map((l) => l.other), { tone: 'gold' });
            C.spark($('mvSparkExpenses'), months.map((l) => l.out), { tone: 'sage' });
            C.spark($('mvSparkNet'), months.map((l) => l.net), { tone: 'in' });
        }
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

        const C = window.SPCharts;
        const fills = C ? {
            in: C.gradient(node, 'bar-gold'),
            out: C.gradient(node, 'bar-sage'),
            total: C.gradient(node, 'bar-in'),
            loss: C.gradient(node, 'bar-out')
        } : {};
        const columns = [];
        node.appendChild(svg('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'mv-wf__zero' }));
        steps.forEach((step, i) => {
            const x = slot * i + (slot - barW) / 2;
            const y1 = y(Math.max(step.from, step.to));
            const y2 = y(Math.min(step.from, step.to));
            const tone = step.kind === 'total' ? (step.value < 0 ? 'mv-wf__bar--loss' : 'mv-wf__bar--total') : `mv-wf__bar--${step.kind}`;
            const g = svg('g', { class: 'mv-wf__step' });
            g.appendChild(svg('rect', { x: slot * i + 2, y: top - 18, width: slot - 4, height: plotH + 18, rx: 10, class: 'spc-col__bg' }));
            const fillKey = step.kind === 'total' ? (step.value < 0 ? 'loss' : 'total') : step.kind;
            g.appendChild(svg('rect', { x, y: y1, width: barW, height: Math.max(step.value ? 2 : 0, y2 - y1), rx: 6, class: `mv-wf__bar ${tone}`, ...(fills[fillKey] ? { fill: fills[fillKey] } : {}) }));
            const share = cur.in > 0 ? `${Math.round((Math.abs(step.value) / cur.in) * 100)}% of money in` : '';
            columns.push({ x0: slot * i, x1: slot * (i + 1), cx: x + barW / 2, node: g, title: step.label, rows: [{ label: step.kind === 'out' ? 'Paid out' : step.kind === 'total' ? 'Left over' : 'Came in', value: ugx(step.value), tone: fillKey === 'in' ? 'gold' : fillKey === 'out' ? 'sage' : fillKey }], note: share });
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
        if (C) C.bindColumns(node, columns, { top, bottom: H2 - bottom, W });

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

        // Budget columns appear once any category has a monthly budget.
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const budgetOf = (k) => window.SPFinance?.getBudget?.(k, period) || 0;
        const allCats = [...new Set([...cur.categories.keys(), ...prev.categories.keys(), ...(window.SPFinance?.getBudgets?.() || []).filter((b) => b.amount > 0).map((b) => b.category)])];
        const showBudget = allCats.some((k) => budgetOf(k) > 0);
        const budgetSum = (filter) => allCats.filter(filter).reduce((sum, k) => sum + budgetOf(k), 0);
        table.classList.toggle('has-budget', showBudget);

        const head = el('thead');
        const hr = el('tr');
        ['UGX', monthName(now, 'short'), monthName(last, 'short'), 'Change'].concat(showBudget ? ['Budget', 'Vs budget'] : []).forEach((text, i) => {
            const th = el('th', i ? 'is-num' : '', text);
            th.setAttribute('scope', 'col');
            hr.appendChild(th);
        });
        head.appendChild(hr);

        const body = el('tbody');
        const row = (label, a, b, { kind = '', upIsGood = true, money = true, budget = null } = {}) => {
            const tr = el('tr', kind ? `mv-pl__${kind}` : '');
            const th = el('th', '', label);
            th.setAttribute('scope', 'row');
            const change = a - b;
            const tone = !change ? '' : (change > 0) === upIsGood ? 'is-good' : 'is-bad';
            const fmt = (v) => (money ? Math.round(v).toLocaleString('en-US') : `${v}%`);
            tr.append(th, el('td', 'is-num money', fmt(a)), el('td', 'is-num money', fmt(b)),
                el('td', `is-num money ${tone}`, change ? `${change > 0 ? '+' : '−'}${fmt(Math.abs(change))}` : '—'));
            if (showBudget) {
                const gap = budget ? a - budget : 0;
                const gapTone = !budget || !gap ? '' : gap > 0 ? 'is-bad' : 'is-good';
                tr.append(el('td', 'is-num money', budget ? fmt(budget) : ''),
                    el('td', `is-num money ${gapTone}`, budget ? (gap ? `${gap > 0 ? '+' : '−'}${fmt(Math.abs(gap))}` : 'On budget') : ''));
            }
            body.appendChild(tr);
        };
        const cats = (filter) => [...new Set([...cur.categories.keys(), ...prev.categories.keys()].concat(showBudget ? allCats : []))]
            .filter(filter)
            .sort((a, b) => (cur.categories.get(b) || 0) - (cur.categories.get(a) || 0));

        row('Show money collected', cur.shows, prev.shows);
        row('Other income', cur.other, prev.other);
        row('Money in', cur.in, prev.in, { kind: 'total' });
        row('Show costs', cur.showCosts, prev.showCosts, { kind: 'group', upIsGood: false, budget: budgetSum((k) => SHOW_COSTS.has(k)) });
        cats((k) => SHOW_COSTS.has(k)).forEach((k) => row(categoryLabel(k), cur.categories.get(k) || 0, prev.categories.get(k) || 0, { kind: 'sub', upIsGood: false, budget: budgetOf(k) }));
        row('Overheads', cur.overheads, prev.overheads, { kind: 'group', upIsGood: false, budget: budgetSum((k) => !SHOW_COSTS.has(k)) });
        cats((k) => !SHOW_COSTS.has(k)).forEach((k) => row(categoryLabel(k), cur.categories.get(k) || 0, prev.categories.get(k) || 0, { kind: 'sub', upIsGood: false, budget: budgetOf(k) }));
        row('Money out', cur.out, prev.out, { kind: 'total', upIsGood: false, budget: budgetSum(() => true) });
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
        setText('mvCfOpenSub', open ? `Carried over${bbf.label ? ` into ${bbf.label}` : ''}` : 'No money carried over from before');
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
        const right = 14;
        const top = 34;
        const bottom = 24;
        const plotW = W - left - right;
        const plotH = H2 - top - bottom;
        const weeks = plan.weeks;
        const values = weeks.flatMap((w) => [w.cash, w.cashWithPending, w.in, w.out]).concat([minCash, 0]);
        const max = Math.max(1, ...values);
        const min = Math.min(0, ...values);
        const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;

        [max, max / 2, 0, min < 0 ? min : null].filter((v) => v !== null).forEach((v) => {
            node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: v === 0 ? 'spc-zero' : 'spc-grid' }));
            node.appendChild(svg('text', { x: left - 8, y: y(v) + 4, class: 'spc-axis', 'text-anchor': 'end' }, compact(v)));
        });

        const C = window.SPCharts;
        const inFill = C ? C.gradient(node, 'bar-gold') : null;
        const outFill = C ? C.gradient(node, 'bar-sage') : null;
        const slot = plotW / weeks.length;
        const barW = Math.max(3, Math.min(12, slot * 0.26));
        const cx = (i) => left + slot * i + slot / 2;
        const columns = [];
        weeks.forEach((week, i) => {
            const g = svg('g', { class: 'spc-col' });
            const label = `${week.start.getDate()} ${monthName(week.start, 'short')}`;
            g.appendChild(svg('rect', { x: left + slot * i + 1, y: top, width: slot - 2, height: plotH, rx: 8, class: 'spc-col__bg' }));
            const inPath = C ? C.barPath(cx(i) - barW - 1, y(week.in), barW, y(0) - y(week.in), 4) : '';
            const outPath = C ? C.barPath(cx(i) + 1, y(week.out), barW, y(0) - y(week.out), 4) : '';
            if (inPath) g.appendChild(svg('path', { d: inPath, fill: inFill, class: 'spc-bar' }));
            if (outPath) g.appendChild(svg('path', { d: outPath, fill: outFill, class: 'spc-bar' }));
            if (!narrow || i % 2 === 0) g.appendChild(svg('text', { x: cx(i), y: H2 - 6, class: 'spc-axis', 'text-anchor': 'middle' }, label));
            node.appendChild(g);
            const rows = [
                { label: 'Due in', value: ugx(week.in), tone: 'gold' },
                { label: 'Spending', value: ugx(week.out), tone: 'sage' },
                { label: 'Cash after', value: ugx(week.cash), tone: 'ink', state: week.cash < minCash ? 'bad' : '' }
            ];
            if (week.pending) rows.push({ label: 'If pending confirm', value: ugx(week.cashWithPending), tone: 'ink' });
            columns.push({ x0: left + slot * i, x1: left + slot * (i + 1), cx: cx(i), node: g, title: `Week of ${label}`, rows, note: week.cash < minCash ? 'Below your minimum cash' : '' });
        });

        const pts = weeks.map((w, i) => [cx(i), y(w.cash)]);
        const line = C ? C.smoothPath(pts) : pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join(' ');
        if (C) node.appendChild(svg('path', { d: `${line} L${pts[pts.length - 1][0]} ${y(Math.max(0, min))} L${pts[0][0]} ${y(Math.max(0, min))} Z`, fill: C.gradient(node, 'area-gold'), class: 'spc-area' }));
        node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(minCash), y2: y(minCash), class: 'mv-fc__min' }));
        if (weeks.some((w) => w.pending)) {
            const pend = weeks.map((w, i) => [cx(i), y(w.cashWithPending)]);
            node.appendChild(svg('path', { d: C ? C.smoothPath(pend) : '', class: 'mv-fc__pending' }));
        }
        node.appendChild(svg('path', { d: line, class: 'spc-line spc-tone--gold' }));
        weeks.forEach((w, i) => {
            if (w.cash < minCash) node.appendChild(svg('circle', { cx: cx(i), cy: y(w.cash), r: 4.5, class: 'mv-fc__dot--low' }));
        });
        if (C) {
            const last = pts[pts.length - 1];
            C.endDot(node, last[0], last[1], weeks[weeks.length - 1].cash < minCash ? 'out' : 'gold');
            C.pill(node, last[0], last[1], compact(weeks[weeks.length - 1].cash), { tone: 'gold', W });
            const minPill = C.pill(node, left + 46, y(minCash) - 2, `Min ${compact(minCash)}`, { tone: 'out', W });
            minPill.classList.add('spc-pill--flat');
            C.bindColumns(node, columns, { top, bottom: H2 - bottom, W });
        }
    }

    // Twelve months of money in and out (replaces the old Chart.js snapshot).
    function renderYear(now) {
        const C = window.SPCharts;
        const H = home();
        if (!C || !$('mvYear')) return;
        const rows = H.monthlySeries(12, now);
        const { ugx, compact } = H.fmt;
        const totalIn = rows.reduce((a, r) => a + r.in, 0);
        const totalOut = rows.reduce((a, r) => a + r.out, 0);
        setText('mvYearIn', ugx(totalIn));
        setText('mvYearOut', ugx(totalOut));
        setText('mvYearNet', ugx(totalIn - totalOut));
        setTone($('mvYearNet'), totalIn - totalOut < 0 ? 'is-bad' : null);
        const best = rows.reduce((a, r) => (r.in > a.in ? r : a), rows[0]);
        setText('mvYearBest', best.in > 0 ? `${best.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: ${compact(best.in)} in` : 'No money in yet');
        C.lineChart($('mvYear'), {
            labels: rows.map((r) => r.label),
            titles: rows.map((r) => r.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
            series: [
                { name: 'Money in', values: rows.map((r) => r.in), tone: 'gold', area: true },
                { name: 'Money out', values: rows.map((r) => r.out), tone: 'sage', area: true },
                { name: 'Net', values: rows.map((r) => r.net), tone: 'ink', dashed: true, thin: true }
            ],
            fmt: ugx,
            axisFmt: compact,
            endLabel: compact(rows[rows.length - 1].in)
        });
    }

    // ── Next 6 months: three cases ─────────────────────────────────────────
    // Income basis: a show counts in the month it's played. Confirmed fees
    // count in full, pending fees at the win rate; other income and spending
    // run at the last three months' average, spending adjusted by the change.
    const SCENARIOS = [
        { key: 'cautious', name: 'Cautious', win: (w) => w * 0.5, cost: (c) => c + 10, other: 0.5, tone: 'ink' },
        { key: 'expected', name: 'Expected', win: (w) => w, cost: (c) => c, other: 1, tone: 'gold' },
        { key: 'hopeful', name: 'Hopeful', win: (w) => Math.min(100, w * 1.5), cost: (c) => c - 5, other: 1, tone: 'gold' }
    ];

    function historicWinRate(today) {
        const { parseDate, DAY_MS } = home().fmt;
        const from = new Date(today.getTime() - 365 * DAY_MS);
        let won = 0;
        let lost = 0;
        (window.bookings || []).forEach((b) => {
            const d = parseDate(b.date);
            if (!d || d < from || d >= today) return;
            const status = String(b.status || '').toLowerCase();
            if (status === 'cancelled') lost += 1;
            else if (status === 'confirmed' || status === 'completed') won += 1;
        });
        return won + lost >= 4 ? Math.round((won / (won + lost)) * 100) : 50;
    }

    function scenarioInputs(today) {
        const stored = window.SPFinance?.getSettings?.().scenario || {};
        const win = Number.isFinite(Number(stored.winRate)) && stored.winRate !== null && stored.winRate !== '' ? Number(stored.winRate) : historicWinRate(today);
        const cost = Number.isFinite(Number(stored.costChange)) && stored.costChange !== null && stored.costChange !== '' ? Number(stored.costChange) : 0;
        return { win: Math.max(0, Math.min(100, win)), cost: Math.max(-50, Math.min(200, cost)), saved: stored.winRate !== undefined };
    }

    function sixMonthPlan(now) {
        const H = home();
        const m = H.money();
        const { asAmount, parseDate, monthIndex } = H.fmt;
        const today = startOfDay(now);
        const inputs = scenarioInputs(today);
        const recent = [1, 2, 3].map((back) => monthLines(new Date(now.getFullYear(), now.getMonth() - back, 1)));
        const avgOut = recent.reduce((a, l) => a + l.out, 0) / 3;
        const avgOther = recent.reduce((a, l) => a + l.other, 0) / 3;
        const months = Array.from({ length: 6 }, (_, i) => {
            const date = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
            return { date, idx: monthIndex(date), booked: 0, pending: 0, bookedCount: 0, pendingCount: 0 };
        });
        (window.bookings || []).forEach((b) => {
            const d = parseDate(b.date);
            if (!d) return;
            const month = months.find((row) => row.idx === monthIndex(d));
            if (!month) return;
            const status = String(b.status || '').toLowerCase();
            if (m.isEarningBooking(b)) { month.booked += asAmount(b.fee); month.bookedCount += 1; }
            else if (status === 'pending') { month.pending += asAmount(b.fee); month.pendingCount += 1; }
        });
        const cases = SCENARIOS.map((sc) => {
            const win = sc.win(inputs.win) / 100;
            const costFactor = 1 + sc.cost(inputs.cost) / 100;
            const rows = months.map((row) => {
                const income = row.booked + row.pending * win + avgOther * sc.other;
                const spend = avgOut * costFactor;
                return { income, spend, profit: income - spend };
            });
            const income = rows.reduce((a, r) => a + r.income, 0);
            const profit = rows.reduce((a, r) => a + r.profit, 0);
            return { ...sc, rows, income, profit, margin: income > 0 ? Math.round((profit / income) * 100) : null };
        });
        return { months, cases, inputs, avgOut, avgOther };
    }

    function renderScenarios(now) {
        const C = window.SPCharts;
        const H = home();
        if (!C || !$('mvScenChart')) return;
        const { el } = H.dom;
        const { ugx, compact } = H.fmt;
        const plan = sixMonthPlan(now);
        const { months, cases, inputs } = plan;
        const win = $('mvScenWin');
        const cost = $('mvScenCost');
        if (win && document.activeElement !== win) win.value = String(Math.round(inputs.win));
        if (cost && document.activeElement !== cost) cost.value = String(Math.round(inputs.cost));
        const editable = window.SPFinance?.canEdit?.() !== false;
        if (win) win.disabled = !editable;
        if (cost) cost.disabled = !editable;
        const first = months[0].date.toLocaleDateString('en-US', { month: 'short' });
        const last = months[5].date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        setText('mvScenSub', `${first} to ${last}. Confirmed shows, plus pending shows at your win rate, less spending at your recent pace.`);

        const host = $('mvScenCases');
        if (host) {
            host.replaceChildren(...cases.map((sc) => {
                const box = el('div', `mv-scen__case${sc.key === 'expected' ? ' is-key' : ''}`);
                const value = el('span', `mv-scen__value money${sc.profit < 0 ? ' is-bad' : ''}`, ugx(sc.profit));
                const sub = sc.margin === null ? 'Nothing coming in' : `${compact(sc.income)} in, keeps ${sc.margin}%`;
                box.append(el('span', 'mv-label', sc.name), value, el('span', 'mv-tile__sub', sub));
                return box;
            }));
        }

        const labels = months.map((r) => r.date.toLocaleDateString('en-US', { month: 'short' }));
        const expected = cases[1];
        // Running profit, so each line ends on its card's six-month total.
        const running = (sc) => { let sum = 0; return sc.rows.map((r) => (sum += r.profit)); };
        C.lineChart($('mvScenChart'), {
            labels,
            titles: months.map((r) => `By end of ${r.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`),
            series: [
                { name: 'Expected', values: running(expected), tone: 'gold', area: true },
                { name: 'Cautious', values: running(cases[0]), tone: 'ink', dashed: true, thin: true },
                { name: 'Hopeful', values: running(cases[2]), tone: 'gold', dashed: true, thin: true }
            ],
            fmt: ugx,
            axisFmt: compact,
            endLabel: compact(expected.profit)
        });

        const table = $('mvScenTable');
        if (table) {
            table.replaceChildren();
            const head = el('thead');
            const hr = el('tr');
            ['Expected', 'Confirmed', 'Pending', 'Other', 'Spending', 'Profit'].forEach((text, i) => {
                const th = el('th', i ? 'is-num' : '', text);
                th.setAttribute('scope', 'col');
                hr.appendChild(th);
            });
            head.appendChild(hr);
            const body = el('tbody');
            const winShare = inputs.win / 100;
            months.forEach((row, i) => {
                const r = expected.rows[i];
                const tr = el('tr');
                const th = el('th', '', row.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
                th.setAttribute('scope', 'row');
                tr.append(th,
                    el('td', 'is-num money', row.booked ? Math.round(row.booked).toLocaleString('en-US') : '—'),
                    el('td', 'is-num money', row.pending ? Math.round(row.pending * winShare).toLocaleString('en-US') : '—'),
                    el('td', 'is-num money', Math.round(plan.avgOther).toLocaleString('en-US')),
                    el('td', 'is-num money', Math.round(r.spend).toLocaleString('en-US')),
                    el('td', `is-num money ${r.profit < 0 ? 'is-bad' : 'is-good'}`, Math.round(r.profit).toLocaleString('en-US')));
                body.appendChild(tr);
            });
            table.append(head, body);
        }
        const pendingTotal = months.reduce((a, r) => a + r.pendingCount, 0);
        const bookedTotal = months.reduce((a, r) => a + r.bookedCount, 0);
        setText('mvScenNote', `${bookedTotal} confirmed and ${pendingTotal} pending show${pendingTotal === 1 ? '' : 's'} in these months. Spending runs at ${compact(plan.avgOut)} a month (last three months)${inputs.cost ? `, ${inputs.cost > 0 ? 'up' : 'down'} ${Math.abs(inputs.cost)}%` : ''}. Cautious halves the win rate and adds 10% to costs; Hopeful raises the win rate by half and trims costs 5%.${inputs.saved ? '' : ` The ${Math.round(inputs.win)}% win rate comes from your last 12 months.`}`);
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

    // How long after a show its balance was cleared, from recorded payments
    // (last 12 months, fully paid shows only).
    function collectionDays(today) {
        const H = home();
        const { parseDate, DAY_MS } = H.fmt;
        const payments = window.SPFinance?.getPayments?.() || [];
        if (!payments.length) return null;
        const lastPaid = new Map();
        payments.forEach((p) => {
            const d = parseDate(p.paidOn);
            if (!d) return;
            const key = String(p.bookingId);
            if (!lastPaid.has(key) || d > lastPaid.get(key)) lastPaid.set(key, d);
        });
        const from = new Date(today.getTime() - 365 * DAY_MS);
        const spans = [];
        (window.bookings || []).forEach((b) => {
            const paid = lastPaid.get(String(b.id));
            const show = parseDate(b.date);
            if (!paid || !show || show < from || Math.round(Number(b.balance) || 0) > 0) return;
            spans.push(Math.max(0, Math.round((startOfDay(paid) - startOfDay(show)) / DAY_MS)));
        });
        if (!spans.length) return null;
        return { days: Math.round(spans.reduce((a, v) => a + v, 0) / spans.length), count: spans.length };
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
        const collect = collectionDays(today);
        const collectText = collect ? `paid ${collect.days === 0 ? 'on the day' : `${plural(collect.days, 'day')} after the show`} on average` : '';
        setText('mvArTotalSub', [rows.length ? `Across ${plural(rows.length, 'show')}` : 'Every show is paid up', collectText].filter(Boolean).join('; '));
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
                    el('span', 'mv-unpaid__meta', [b.artist, b.promoter ? `via ${b.promoter}` : '', b.location || b.venue].filter(Boolean).join(' · ') || 'No artist set')
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
        renderYear(now);
        renderCashflow(cur, now);
        renderScenarios(now);
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
        if (event.target?.id !== 'mvScenForm') return;
        event.preventDefault();
        const win = Number(String($('mvScenWin')?.value || '').trim());
        const cost = Number(String($('mvScenCost')?.value || '').trim());
        if (!Number.isFinite(win) || win < 0 || win > 100 || !Number.isFinite(cost)) {
            if (typeof window.toastError === 'function') window.toastError('Win rate must be 0 to 100%, and spending change a number.');
            return;
        }
        window.SPFinance?.updateSettings?.({ scenario: { winRate: Math.round(win), costChange: Math.round(cost) } });
        render();
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

    window.SPMoneyPages = { render, monthLines, forecast, sixMonthPlan, averageWeeklySpend, unpaidRows, readMinCash, saveMinCash, categoryKey, categoryLabel, SHOW_COSTS };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
