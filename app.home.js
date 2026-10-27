/**
 * Star Paper - Home (hero, goal ring, key numbers, trend, artist split, aging).
 * app.js keeps writing the ids it always did (totalIncome, dashboardCashAtHand,
 * dashboardExpenses, monthlyGoal*, todayBoard*, dashboardUpcomingList, ...).
 * This file draws everything else from the same money rules (window.SPMoney),
 * using DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const RANGE_KEY = 'starPaperHomeTrendRange';
    const ARTIST_COLORS = 6;

    const $ = (id) => document.getElementById(id);
    const asAmount = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : 0;
    };
    const ugx = (value) => `UGX ${asAmount(value).toLocaleString('en-US')}`;
    const compact = (value) => {
        const n = Math.abs(asAmount(value));
        const sign = value < 0 ? '-' : '';
        if (n >= 1e9) return `${sign}${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '')}B`;
        if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
        if (n >= 1e3) return `${sign}${Math.round(n / 1e3)}K`;
        return `${sign}${n}`;
    };
    const parseDate = (value) => {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    };
    const monthIndex = (date) => date.getFullYear() * 12 + date.getMonth();
    const DAY_MS = 24 * 60 * 60 * 1000;

    function money() {
        const fallback = {
            isEarningBooking: (b) => ['confirmed', 'completed'].includes(String(b?.status || '').toLowerCase()),
            getBookingCollected: (b) => Math.max(0, asAmount(b?.deposit)) + Math.max(0, asAmount(b?.fee) - asAmount(b?.deposit) - asAmount(b?.balance)),
            isReceivedOtherIncome: (e) => String(e?.status || 'received').toLowerCase() === 'received',
            getMonthlyGoal: () => 0
        };
        return Object.assign({}, fallback, window.SPMoney || {});
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function svg(tag, attrs, text) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
        if (text !== undefined) node.textContent = String(text);
        return node;
    }

    function readRange() {
        try { return window.localStorage.getItem(RANGE_KEY) === '12' ? 12 : 6; } catch (_) { return 6; }
    }

    function saveRange(range) {
        try { window.localStorage.setItem(RANGE_KEY, String(range)); } catch (_) { /* per-viewer nicety only */ }
    }

    // ── Data ───────────────────────────────────────────────────────────────
    // Money in / out / net per calendar month, oldest first, ending this month.
    function monthlySeries(count, now) {
        const m = money();
        const end = monthIndex(now);
        const start = end - count + 1;
        const rows = Array.from({ length: count }, (_, i) => {
            const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
            return { date, label: date.toLocaleDateString('en-US', { month: 'short' }), in: 0, out: 0, net: 0 };
        });
        const bucket = (value) => {
            const date = parseDate(value);
            if (!date) return null;
            const idx = monthIndex(date) - start;
            return idx >= 0 && idx < count ? rows[idx] : null;
        };
        (window.bookings || []).forEach((booking) => {
            if (!m.isEarningBooking(booking)) return;
            // Cash lands in the month it was received, not the show's month.
            const events = m.getBookingCashEvents ? m.getBookingCashEvents(booking) : [{ date: booking.date, amount: m.getBookingCollected(booking) }];
            events.forEach((event) => {
                const row = bucket(event.date);
                if (row) row.in += event.amount;
            });
        });
        (window.otherIncome || []).forEach((entry) => {
            if (!m.isReceivedOtherIncome(entry)) return;
            const row = bucket(entry.date);
            if (row) row.in += asAmount(entry.amount);
        });
        (window.expenses || []).forEach((entry) => {
            const row = bucket(entry.date);
            if (row) row.out += asAmount(entry.amount);
        });
        rows.forEach((row) => { row.net = row.in - row.out; });
        return rows;
    }

    function receivables(now) {
        const m = money();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const buckets = [
            { key: 'upcoming', label: 'Show not played yet', amount: 0, count: 0 },
            { key: 'd30', label: '0–30 days late', amount: 0, count: 0 },
            { key: 'd60', label: '31–60 days late', amount: 0, count: 0 },
            { key: 'd90', label: '61–90 days late', amount: 0, count: 0 },
            { key: 'd90p', label: '90+ days late', amount: 0, count: 0 }
        ];
        let total = 0;
        let late = 0;
        (window.bookings || []).forEach((booking) => {
            if (!m.isEarningBooking(booking)) return;
            const balance = asAmount(booking.balance);
            if (balance <= 0) return;
            const date = parseDate(booking.date);
            total += balance;
            let bucket = buckets[0];
            if (date && date < today) {
                late += balance;
                const days = Math.floor((today - date) / DAY_MS);
                bucket = days <= 30 ? buckets[1] : days <= 60 ? buckets[2] : days <= 90 ? buckets[3] : buckets[4];
            }
            bucket.amount += balance;
            bucket.count += 1;
        });
        return { total, late, buckets };
    }

    function bookedAhead(now, days) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const until = new Date(today.getTime() + days * DAY_MS);
        let amount = 0;
        let count = 0;
        let pending = 0;
        (window.bookings || []).forEach((booking) => {
            const status = String(booking?.status || '').toLowerCase();
            if (status !== 'confirmed' && status !== 'pending') return;
            const date = parseDate(booking.date);
            if (!date || date < today || date > until) return;
            amount += asAmount(booking.fee);
            count += 1;
            if (status === 'pending') pending += 1;
        });
        return { amount, count, pending };
    }

    function artistSplit(now) {
        const m = money();
        const totals = new Map();
        (window.bookings || []).forEach((booking) => {
            if (!m.isEarningBooking(booking)) return;
            const events = m.getBookingCashEvents ? m.getBookingCashEvents(booking) : [{ date: booking.date, amount: m.getBookingCollected(booking) }];
            const collected = events.reduce((sum, event) => {
                const date = parseDate(event.date);
                return date && monthIndex(date) === monthIndex(now) ? sum + event.amount : sum;
            }, 0);
            if (collected <= 0) return;
            const name = String(booking.artist || booking.artist_name || 'Unassigned').trim() || 'Unassigned';
            totals.set(name, (totals.get(name) || 0) + collected);
        });
        const rows = [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
        if (rows.length > ARTIST_COLORS) {
            const rest = rows.splice(ARTIST_COLORS - 1);
            rows.push({ name: 'Others', amount: rest.reduce((sum, row) => sum + row.amount, 0) });
        }
        return rows;
    }

    // ── Pieces ─────────────────────────────────────────────────────────────
    // Up is good for money in and profit, bad for expenses.
    function setDelta(node, current, previous, { upIsGood = true, unit = 'month' } = {}) {
        if (!node) return;
        node.classList.remove('is-good', 'is-bad', 'is-flat');
        if (!previous && !current) { node.textContent = `Nothing last ${unit} either`; node.classList.add('is-flat'); return; }
        if (!previous) { node.textContent = `New this ${unit}`; node.classList.add('is-flat'); return; }
        const change = ((current - previous) / Math.abs(previous)) * 100;
        const rounded = Math.round(change);
        if (rounded === 0) { node.textContent = `Same as last ${unit}`; node.classList.add('is-flat'); return; }
        const up = rounded > 0;
        node.textContent = `${up ? '↗ +' : '↘ '}${rounded}% vs last ${unit}`;
        node.classList.add(up === upIsGood ? 'is-good' : 'is-bad');
    }

    function drawSpark(node, values, { label = '' } = {}) {
        if (!node) return;
        if (window.SPCharts) { window.SPCharts.spark(node, values, { area: true, label }); return; }
        node.replaceChildren();
    }

    function renderGoal(collected) {
        const goal = asAmount(money().getMonthlyGoal());
        const ring = $('hv2GoalRing');
        const toGo = $('hv2GoalToGo');
        const card = ring?.closest('.hv2-goal');
        const pct = goal > 0 ? Math.min(100, Math.max(0, (collected / goal) * 100)) : 0;
        if (ring) ring.setAttribute('stroke-dasharray', `${pct.toFixed(1)} 100`);
        card?.classList.toggle('is-unset', !(goal > 0));
        card?.classList.toggle('is-met', goal > 0 && collected >= goal);
        if (!toGo) return;
        if (!(goal > 0)) toGo.textContent = 'No goal yet. Set one to track the month.';
        else if (collected >= goal) toGo.textContent = `Goal reached, UGX ${compact(collected - goal)} over.`;
        else toGo.textContent = `UGX ${compact(goal - collected)} to go`;
    }

    function renderTrend(rows) {
        const node = $('hv2Trend');
        const C = window.SPCharts;
        if (!node || !C) return;
        node.replaceChildren();
        // Draw at the card's real width so axis text stays readable on phones.
        const W = Math.max(300, Math.round(node.clientWidth || node.parentElement?.clientWidth || 640));
        const H = W < 480 ? 220 : 250;
        node.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const left = 44;
        const right = 8;
        const bottom = 24;
        const top = 34;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        const max = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out))) * 1.05;
        const min = Math.min(0, ...rows.map((r) => r.net));
        const span = max - min;
        const y = (v) => top + (1 - (v - min) / span) * plotH;
        const inFill = C.gradient(node, 'bar-gold');
        const outFill = C.gradient(node, 'bar-sage');

        [max / 1.05, max / 2.1, 0, min < 0 ? min : null].filter((v) => v !== null).forEach((v) => {
            node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: v === 0 ? 'spc-zero' : 'spc-grid' }));
            node.appendChild(svg('text', { x: left - 8, y: y(v) + 4, class: 'spc-axis', 'text-anchor': 'end' }, compact(v)));
        });

        const slot = plotW / rows.length;
        const barW = Math.max(5, Math.min(22, slot * 0.3));
        const zero = y(0);
        const netPts = [];
        const columns = [];
        rows.forEach((row, i) => {
            const cx = left + slot * i + slot / 2;
            const current = i === rows.length - 1;
            const g = svg('g', { class: `spc-col${current ? ' is-current' : ''}` });
            g.appendChild(svg('rect', { x: left + slot * i + 2, y: top - 8, width: slot - 4, height: plotH + 8, rx: 10, class: 'spc-col__bg' }));
            const inPath = C.barPath(cx - barW - 1.5, y(row.in), barW, zero - y(row.in), 6);
            const outPath = C.barPath(cx + 1.5, y(row.out), barW, zero - y(row.out), 6);
            if (inPath) g.appendChild(svg('path', { d: inPath, fill: inFill, class: 'spc-bar' }));
            if (outPath) g.appendChild(svg('path', { d: outPath, fill: outFill, class: 'spc-bar' }));
            g.appendChild(svg('text', { x: cx, y: H - 6, class: `spc-axis${current ? ' spc-axis--on' : ''}`, 'text-anchor': 'middle' }, row.label));
            node.appendChild(g);
            netPts.push([cx, y(row.net)]);
            columns.push({
                x0: left + slot * i, x1: left + slot * (i + 1), cx, node: g,
                title: row.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                rows: [
                    { label: 'Money in', value: ugx(row.in), tone: 'gold' },
                    { label: 'Money out', value: ugx(row.out), tone: 'sage' },
                    { label: 'Net', value: ugx(row.net), tone: 'ink', state: row.net < 0 ? 'bad' : row.net > 0 ? 'good' : '' }
                ]
            });
        });
        node.appendChild(svg('path', { d: C.smoothPath(netPts), class: 'spc-line spc-tone--ink spc-line--thin' }));
        netPts.forEach(([x, py], i) => node.appendChild(svg('circle', { cx: x, cy: py, r: i === netPts.length - 1 ? 4 : 3, class: 'spc-netdot' })));
        const last = rows[rows.length - 1];
        if (last.in > 0) C.pill(node, netPts[netPts.length - 1][0] - barW / 2 - 1.5, y(last.in), compact(last.in), { tone: 'gold', W });
        C.bindColumns(node, columns, { top, bottom: H - bottom, W });
    }

    function renderDonut(rows) {
        const host = $('hv2ArtistDonut');
        if (!host || !window.SPCharts) return;
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        window.SPCharts.donut(host, rows, {
            centre: compact(total),
            centreSub: 'this month',
            fmt: ugx,
            empty: 'No money collected from shows this month yet.',
            size: 132
        });
    }

    function renderAging(data, host = $('hv2Aging')) {
        if (!host) return;
        host.replaceChildren();
        if (!data.total) {
            host.appendChild(el('p', 'hv2-empty', 'No unpaid balances. Every show is paid up.'));
            return;
        }
        const max = Math.max(...data.buckets.map((b) => b.amount), 1);
        const list = el('ul', 'hv2-aging__list');
        data.buckets.forEach((bucket) => {
            const li = el('li', `hv2-aging__row hv2-aging__row--${bucket.key}`);
            const bar = el('span', 'hv2-aging__bar');
            const fillNode = el('span', 'hv2-aging__fill');
            fillNode.style.setProperty('--w', `${((bucket.amount / max) * 100).toFixed(1)}%`);
            bar.appendChild(fillNode);
            li.append(
                el('span', 'hv2-aging__label', bucket.label),
                bar,
                el('span', 'hv2-aging__amt money', bucket.amount ? compact(bucket.amount) : '—'),
                el('span', 'hv2-aging__count', bucket.count ? `${bucket.count} show${bucket.count > 1 ? 's' : ''}` : '')
            );
            list.appendChild(li);
        });
        host.appendChild(list);
    }

    // ── Render ─────────────────────────────────────────────────────────────
    function render() {
        if (!$('homeV2')) return;
        const now = new Date();
        const hour = now.getHours();
        const greet = $('hv2GreetWord');
        if (greet) greet.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

        // First run: until there is an artist and a booking, show the two steps.
        const start = $('hv2Start');
        if (start) {
            const hasArtists = Array.isArray(window.artists) && window.artists.length > 0;
            const hasBookings = Array.isArray(window.bookings) && window.bookings.length > 0;
            start.hidden = hasArtists && hasBookings;
            [['hv2StartArtist', hasArtists], ['hv2StartBooking', hasBookings]].forEach(([id, done]) => {
                const step = $(id);
                if (!step) return;
                step.classList.toggle('is-done', done);
                const btn = step.querySelector('button');
                if (btn) btn.hidden = done; // a done step keeps no call to action
            });
        }

        const range = readRange();
        const series = monthlySeries(12, now);
        const last6 = series.slice(-6);
        const cur = series[series.length - 1];
        const prev = series[series.length - 2];

        setDelta($('hv2HeroDelta'), cur.in, prev.in);
        drawSpark($('hv2HeroSpark'), last6.map((r) => r.in), { fill: true, label: cur.in ? compact(cur.in) : '' });
        setDelta($('hv2ProfitDelta'), cur.net, prev.net);
        drawSpark($('hv2ProfitSpark'), last6.map((r) => r.net));
        setDelta($('hv2ExpenseDelta'), cur.out, prev.out, { upIsGood: false });
        drawSpark($('hv2ExpenseSpark'), last6.map((r) => r.out));

        const owed = receivables(now);
        const owedEl = $('hv2Owed');
        if (owedEl) owedEl.textContent = ugx(owed.total);
        const lateEl = $('hv2OwedLate');
        if (lateEl) {
            lateEl.classList.remove('is-good', 'is-bad', 'is-flat');
            lateEl.textContent = owed.late > 0 ? `${ugx(owed.late)} overdue (${Math.round((owed.late / owed.total) * 100)}%)` : 'Nothing overdue';
            lateEl.classList.add(owed.late > 0 ? 'is-bad' : 'is-good');
        }

        const owedMeter = $('hv2OwedMeter');
        if (owedMeter) owedMeter.style.setProperty('--w', `${owed.total ? ((owed.late / owed.total) * 100).toFixed(1) : 0}%`);

        const ahead = bookedAhead(now, 30);
        const bookedMeter = $('hv2BookedMeter');
        if (bookedMeter) bookedMeter.style.setProperty('--w', `${ahead.count ? (((ahead.count - ahead.pending) / ahead.count) * 100).toFixed(1) : 0}%`);
        const bookedEl = $('hv2Booked30');
        if (bookedEl) bookedEl.textContent = ugx(ahead.amount);
        const bookedCountEl = $('hv2Booked30Count');
        if (bookedCountEl) {
            bookedCountEl.classList.add('is-flat');
            bookedCountEl.textContent = ahead.count
                ? `${ahead.count} show${ahead.count > 1 ? 's' : ''}${ahead.pending ? `, ${ahead.pending} still pending` : ', all confirmed'}`
                : 'No shows booked yet';
        }

        renderGoal(cur.in);
        renderTrend(range === 12 ? series : last6);
        document.querySelectorAll('#homeV2 [data-hv2-range]').forEach((btn) => {
            const active = Number(btn.getAttribute('data-hv2-range')) === range;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderDonut(artistSplit(now));
        renderAging(owed);
    }

    document.addEventListener('click', (event) => {
        const btn = event.target.closest?.('#homeV2 [data-hv2-range]');
        if (!btn) return;
        saveRange(btn.getAttribute('data-hv2-range'));
        render();
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    });

    // app.money.js reuses the same data and pieces for the Money tabs.
    window.SPHome = {
        render,
        monthlySeries,
        receivables,
        setDelta,
        drawSpark,
        renderAging,
        fmt: { ugx, compact, asAmount, parseDate, monthIndex, DAY_MS },
        dom: { el, svg },
        money
    };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
