/**
 * Star Paper - Schedule extras: a strip of four booking numbers above the
 * tabs (this month against last, the next 30 days, the next show, overdue
 * balances) and a "Busy times" heatmap of shows by weekday and month under
 * the Calendar tab. DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
    const OPEN_WEEKS = 8;

    const $ = (id) => document.getElementById(id);
    const H = () => window.SPHome || null;
    // window.artists can be the #artists section element before data loads.
    const arr = (name) => (Array.isArray(window[name]) ? window[name] : []);
    let heatYear = null;

    const isLive = (b) => String(b?.status || '').toLowerCase() !== 'cancelled';
    const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const weekdayIndex = (d) => (d.getDay() + 6) % 7;
    const shortDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    function overdueLimit() {
        return window.SPInsights?.targets?.().overdueDays ?? 14;
    }

    // ── Strip ────────────────────────────────────────────────────────────
    function tile(label, value, sub, tone) {
        const { el } = H().dom;
        const box = el('div', 'sc-stat');
        box.append(el('span', 'sc-stat__label', label), el('span', 'sc-stat__value', value));
        if (sub) box.appendChild(el('span', `sc-stat__sub${tone ? ` is-${tone}` : ''}`, sub));
        return box;
    }

    function renderStrip(now) {
        const host = $('scStrip');
        if (!host) return;
        const h = H();
        const m = h.money();
        const { parseDate, asAmount, monthIndex, compact, DAY_MS } = h.fmt;
        const today = dayStart(now);
        const thisIdx = monthIndex(now);
        let thisMonth = 0;
        let lastMonth = 0;
        let soonCount = 0;
        let soonFees = 0;
        let next = null;
        let overdueCount = 0;
        let overdueAmount = 0;
        const limit = overdueLimit();
        arr('bookings').forEach((b) => {
            if (!isLive(b)) return;
            const d = parseDate(b.date);
            if (!d) return;
            const idx = monthIndex(d);
            if (idx === thisIdx) thisMonth += 1;
            if (idx === thisIdx - 1) lastMonth += 1;
            const days = Math.round((dayStart(d) - today) / DAY_MS);
            if (days >= 0 && days <= 30) { soonCount += 1; soonFees += asAmount(b.fee); }
            if (days >= 0 && (!next || d < next.d)) next = { b, d, days };
            const balance = asAmount(b.balance);
            if (m.isEarningBooking(b) && balance > 0 && -days > limit) { overdueCount += 1; overdueAmount += balance; }
        });
        const diff = thisMonth - lastMonth;
        host.replaceChildren(
            tile('Shows this month', String(thisMonth), diff === 0 ? `Same as last month (${lastMonth})` : `${diff > 0 ? '+' : ''}${diff} on last month (${lastMonth})`, diff > 0 ? 'good' : diff < 0 ? 'bad' : ''),
            tile('Next 30 days', `${soonCount} show${soonCount === 1 ? '' : 's'}`, soonFees ? `${compact(soonFees)} in fees` : 'Nothing booked yet'),
            tile('Next show', next ? next.b.event || 'Show' : 'None booked', next ? `${next.b.artist ? `${next.b.artist} · ` : ''}${next.days === 0 ? 'today' : next.days === 1 ? 'tomorrow' : `in ${next.days} days`}` : 'Add a booking to see it here'),
            tile('Overdue balances', overdueCount ? compact(overdueAmount) : 'None', overdueCount ? `${overdueCount} show${overdueCount === 1 ? '' : 's'} unpaid after ${limit} days` : `Nothing unpaid after ${limit} days`, overdueCount ? 'bad' : 'good')
        );
    }

    // ── Busy times heatmap ───────────────────────────────────────────────
    function renderHeatmap(now) {
        const grid = $('scHeat');
        if (!grid) return;
        const h = H();
        const { el } = h.dom;
        const { parseDate } = h.fmt;
        const year = heatYear || now.getFullYear();
        const yearLabel = $('scHeatYear');
        if (yearLabel) yearLabel.textContent = String(year);

        const counts = Array.from({ length: 7 }, () => Array(12).fill(0));
        const byMonth = Array(12).fill(0);
        const byDay = Array(7).fill(0);
        const booked = new Set();
        arr('bookings').forEach((b) => {
            if (!isLive(b)) return;
            const d = parseDate(b.date);
            if (!d) return;
            booked.add(dayStart(d).getTime());
            if (d.getFullYear() !== year) return;
            counts[weekdayIndex(d)][d.getMonth()] += 1;
            byMonth[d.getMonth()] += 1;
            byDay[weekdayIndex(d)] += 1;
        });
        const max = Math.max(0, ...counts.flat());
        const level = (n) => (n === 0 ? 0 : max <= 1 ? 4 : Math.min(4, Math.ceil((n / max) * 4)));

        grid.replaceChildren();
        grid.appendChild(el('span', 'sc-heat__corner'));
        for (let mo = 0; mo < 12; mo += 1) {
            const label = new Date(year, mo, 1).toLocaleDateString('en-US', { month: 'short' });
            grid.appendChild(el('span', `sc-heat__month${year === now.getFullYear() && mo === now.getMonth() ? ' is-now' : ''}`, label));
        }
        WEEKDAYS.forEach((day, wd) => {
            grid.appendChild(el('span', 'sc-heat__day', day));
            for (let mo = 0; mo < 12; mo += 1) {
                const n = counts[wd][mo];
                const cell = el('span', `sc-heat__cell sc-heat__cell--${level(n)}`);
                const words = `${n || 'No'} show${n === 1 ? '' : 's'} on ${WEEKDAY_NAMES[wd]} in ${new Date(year, mo, 1).toLocaleDateString('en-US', { month: 'long' })}`;
                cell.setAttribute('title', words);
                cell.setAttribute('role', 'img');
                cell.setAttribute('aria-label', words);
                if (n) cell.textContent = String(n);
                grid.appendChild(cell);
            }
        });

        const total = byMonth.reduce((a, b) => a + b, 0);
        const summary = $('scHeatSummary');
        if (summary) {
            if (!total) {
                summary.textContent = `No shows in ${year} yet.`;
            } else {
                const topDay = byDay.indexOf(Math.max(...byDay));
                const topMonth = byMonth.indexOf(Math.max(...byMonth));
                summary.textContent = `${total} show${total === 1 ? '' : 's'} in ${year}. Busiest day: ${WEEKDAY_NAMES[topDay]} (${byDay[topDay]}). Busiest month: ${new Date(year, topMonth, 1).toLocaleDateString('en-US', { month: 'long' })} (${byMonth[topMonth]}).`;
            }
        }

        // Open Friday and Saturday nights coming up: the dates promoters ask for.
        const open = $('scHeatOpen');
        if (open) {
            const today = dayStart(now);
            const free = [];
            for (let i = 0; i < OPEN_WEEKS * 7; i += 1) {
                const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
                const wd = weekdayIndex(d);
                if ((wd === 4 || wd === 5) && !booked.has(d.getTime())) free.push(d);
            }
            open.replaceChildren(el('span', 'sc-label', `Open Fridays and Saturdays, next ${OPEN_WEEKS} weeks`));
            const list = el('ul', 'sc-open');
            if (!free.length) list.appendChild(el('li', 'sc-open__none', 'Every Friday and Saturday is booked.'));
            free.slice(0, 10).forEach((d) => list.appendChild(el('li', 'sc-open__date', `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${shortDate(d)}`)));
            if (free.length > 10) list.appendChild(el('li', 'sc-open__none', `and ${free.length - 10} more`));
            open.appendChild(list);
        }
    }

    function render() {
        if (!H()) return;
        const now = new Date();
        renderStrip(now);
        renderHeatmap(now);
    }

    document.addEventListener('click', (event) => {
        const step = event.target.closest?.('[data-sc-year]');
        if (!step) return;
        const base = heatYear || new Date().getFullYear();
        heatYear = base + Number(step.getAttribute('data-sc-year'));
        renderHeatmap(new Date());
    });

    window.SPSchedulePage = { render };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
