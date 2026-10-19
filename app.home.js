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
            const row = bucket(booking.date);
            if (row) row.in += m.getBookingCollected(booking);
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
            const date = parseDate(booking.date);
            if (!date || monthIndex(date) !== monthIndex(now)) return;
            const collected = m.getBookingCollected(booking);
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

    function drawSpark(node, values, { fill = false } = {}) {
        if (!node) return;
        node.replaceChildren();
        if (!values.length || values.every((v) => v === 0)) return;
        const [, , w, h] = (node.getAttribute('viewBox') || '0 0 120 32').split(' ').map(Number);
        const min = Math.min(0, ...values);
        const max = Math.max(...values);
        const span = max - min || 1;
        const pad = 3;
        const pts = values.map((v, i) => [
            values.length === 1 ? w / 2 : (i / (values.length - 1)) * w,
            pad + (1 - (v - min) / span) * (h - pad * 2)
        ]);
        const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        if (fill) node.appendChild(svg('path', { d: `${line} L${w} ${h} L0 ${h} Z`, class: 'hv2-spark__area' }));
        node.appendChild(svg('path', { d: line, class: 'hv2-spark__line' }));
        const [lx, ly] = pts[pts.length - 1];
        node.appendChild(svg('circle', { cx: lx, cy: ly, r: 3, class: 'hv2-spark__dot' }));
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
        else if (collected >= goal) toGo.textContent = `Goal reached, ${ugx(collected - goal)} over.`;
        else toGo.textContent = `${ugx(goal - collected)} to go`;
    }

    function renderTrend(rows) {
        const node = $('hv2Trend');
        if (!node) return;
        node.replaceChildren();
        // Draw at the card's real width so axis text stays readable on phones.
        const W = Math.max(300, Math.round(node.clientWidth || node.parentElement?.clientWidth || 640));
        const H = W < 480 ? 200 : 220;
        node.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const left = 44;
        const bottom = 24;
        const top = 10;
        const plotW = W - left - 8;
        const plotH = H - top - bottom;
        const max = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));
        const min = Math.min(0, ...rows.map((r) => r.net));
        const span = max - min;
        const y = (v) => top + (1 - (v - min) / span) * plotH;

        [max, max / 2, 0, min < 0 ? min : null].filter((v) => v !== null).forEach((v) => {
            node.appendChild(svg('line', { x1: left, x2: W - 8, y1: y(v), y2: y(v), class: v === 0 ? 'hv2-trend__zero' : 'hv2-trend__grid' }));
            node.appendChild(svg('text', { x: left - 6, y: y(v) + 4, class: 'hv2-trend__axis', 'text-anchor': 'end' }, compact(v)));
        });

        const slot = plotW / rows.length;
        const barW = Math.max(4, Math.min(18, slot * 0.28));
        const netPts = [];
        rows.forEach((row, i) => {
            const cx = left + slot * i + slot / 2;
            const g = svg('g', { class: 'hv2-trend__month' });
            g.appendChild(svg('title', {}, `${row.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: in ${ugx(row.in)}, out ${ugx(row.out)}, net ${ugx(row.net)}`));
            g.appendChild(svg('rect', { x: left + slot * i, y: top, width: slot, height: plotH, class: 'hv2-trend__hit' }));
            const zero = y(0);
            g.appendChild(svg('rect', { x: cx - barW - 1, y: y(row.in), width: barW, height: Math.max(0, zero - y(row.in)), rx: 3, class: 'hv2-trend__in' }));
            g.appendChild(svg('rect', { x: cx + 1, y: y(row.out), width: barW, height: Math.max(0, zero - y(row.out)), rx: 3, class: 'hv2-trend__out' }));
            g.appendChild(svg('text', { x: cx, y: H - 6, class: 'hv2-trend__axis', 'text-anchor': 'middle' }, row.label));
            node.appendChild(g);
            netPts.push([cx, y(row.net)]);
        });
        node.appendChild(svg('path', { d: netPts.map(([x, py], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${py.toFixed(1)}`).join(' '), class: 'hv2-trend__net' }));
        netPts.forEach(([x, py]) => node.appendChild(svg('circle', { cx: x, cy: py, r: 3, class: 'hv2-trend__netdot' })));
    }

    function renderDonut(rows) {
        const host = $('hv2ArtistDonut');
        if (!host) return;
        host.replaceChildren();
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        if (!total) {
            host.appendChild(el('p', 'hv2-empty', 'No money collected from shows this month yet.'));
            return;
        }
        const ring = svg('svg', { viewBox: '0 0 120 120', class: 'hv2-donut__ring', 'aria-hidden': 'true', focusable: 'false' });
        ring.appendChild(svg('circle', { cx: 60, cy: 60, r: 46, class: 'hv2-donut__track' }));
        let offset = 0;
        rows.forEach((row, i) => {
            const share = (row.amount / total) * 100;
            ring.appendChild(svg('circle', {
                cx: 60, cy: 60, r: 46, pathLength: 100,
                class: `hv2-donut__seg hv2-c${i + 1}`,
                'stroke-dasharray': `${Math.max(0, share - (rows.length > 1 ? 0.8 : 0)).toFixed(2)} 100`,
                'stroke-dashoffset': (-offset).toFixed(2)
            }));
            offset += share;
        });
        const center = el('div', 'hv2-donut__center');
        center.append(el('span', 'hv2-donut__total money', compact(total)), el('span', 'hv2-donut__sub', 'this month'));
        const figure = el('div', 'hv2-donut__figure');
        figure.append(ring, center);

        const legend = el('ul', 'hv2-donut__legend');
        rows.forEach((row, i) => {
            const li = el('li', 'hv2-donut__item');
            const swatch = el('span', `hv2-donut__swatch hv2-c${i + 1}`);
            swatch.setAttribute('aria-hidden', 'true');
            li.append(swatch, el('span', 'hv2-donut__name', row.name), el('span', 'hv2-donut__pct', `${Math.round((row.amount / total) * 100)}%`), el('span', 'hv2-donut__amt money', ugx(row.amount)));
            legend.appendChild(li);
        });
        host.append(figure, legend);
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

        const range = readRange();
        const series = monthlySeries(12, now);
        const last6 = series.slice(-6);
        const cur = series[series.length - 1];
        const prev = series[series.length - 2];

        setDelta($('hv2HeroDelta'), cur.in, prev.in);
        drawSpark($('hv2HeroSpark'), last6.map((r) => r.in), { fill: true });
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
            lateEl.textContent = owed.late > 0 ? `${ugx(owed.late)} overdue` : 'Nothing overdue';
            lateEl.classList.add(owed.late > 0 ? 'is-bad' : 'is-good');
        }

        const ahead = bookedAhead(now, 30);
        const bookedEl = $('hv2Booked30');
        if (bookedEl) bookedEl.textContent = ugx(ahead.amount);
        const bookedCountEl = $('hv2Booked30Count');
        if (bookedCountEl) {
            bookedCountEl.classList.add('is-flat');
            bookedCountEl.textContent = ahead.count
                ? `${ahead.count} show${ahead.count > 1 ? 's' : ''}${ahead.pending ? `, ${ahead.pending} pending` : ''}`
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
