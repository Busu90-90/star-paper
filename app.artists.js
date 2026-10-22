/**
 * Star Paper - Artists page: a top-artist spotlight, one profit and loss row
 * per artist (shows, fees, costs, net, owed, share of fees) and a mini P&L
 * for the artist you open. Uses the same money rules as Home and Money
 * (window.SPHome, window.SPMoneyPages) and builds DOM nodes only: no innerHTML.
 */
(function () {
    'use strict';

    const PERIOD_KEY = 'starPaperArtistsPeriod';
    const PERIODS = {
        month: 'This month',
        year: 'This year',
        all: 'All time'
    };

    const $ = (id) => document.getElementById(id);
    const H = () => window.SPHome || null;
    // window.artists can be the #artists section element before data loads.
    const arr = (name) => (Array.isArray(window[name]) ? window[name] : []);
    const M = () => window.SPMoneyPages || null;
    let openKey = null;

    function readPeriod() {
        try {
            const saved = window.localStorage.getItem(PERIOD_KEY);
            return PERIODS[saved] ? saved : 'year';
        } catch (_) { return 'year'; }
    }

    function savePeriod(period) {
        try { window.localStorage.setItem(PERIOD_KEY, period); } catch (_) { /* per-viewer nicety only */ }
    }

    function nameKey(value) {
        return String(value || '').trim().toLowerCase();
    }

    // Only shows and costs up to today count: a booked future show is not
    // earned yet (the spotlight lists the next show instead).
    function inPeriod(date, period, now) {
        if (!date || date > now) return false;
        if (period === 'all') return true;
        if (date.getFullYear() !== now.getFullYear()) return false;
        return period === 'year' || date.getMonth() === now.getMonth();
    }

    // One entry per roster artist, plus any artist name that only appears on
    // bookings or expenses, so no money goes missing from the table.
    function buildRows(period, now) {
        const h = H();
        const m = h.money();
        const { asAmount, parseDate } = h.fmt;
        const rows = new Map();
        const idIndex = new Map();
        const ensure = (key, name, artist) => {
            if (!rows.has(key)) {
                rows.set(key, {
                    key, name: name || 'Unnamed artist', artist: artist || null,
                    shows: 0, fees: 0, collected: 0, costs: 0, owed: 0, owedShows: 0,
                    costByCategory: new Map(), bookings: [], expenses: []
                });
            }
            return rows.get(key);
        };
        arr('artists').forEach((artist) => {
            const key = nameKey(artist?.name);
            if (!key) return;
            ensure(key, artist.name, artist);
            if (artist.id) idIndex.set(String(artist.id), key);
        });
        const keyFor = (entry) => {
            const byId = entry?.artistId ? idIndex.get(String(entry.artistId)) : null;
            return byId || nameKey(entry?.artist);
        };

        let shared = 0;
        arr('bookings').forEach((booking) => {
            const key = keyFor(booking);
            if (!key) return;
            const row = ensure(key, booking.artist);
            row.bookings.push(booking);
            if (!m.isEarningBooking(booking)) return;
            const date = parseDate(booking.date);
            const balance = Math.max(0, asAmount(booking.balance));
            if (balance > 0 && date && date <= now) { row.owed += balance; row.owedShows += 1; }
            if (!inPeriod(date, period, now)) return;
            row.shows += 1;
            row.fees += asAmount(booking.fee);
            row.collected += m.getBookingCollected(booking);
        });
        arr('expenses').forEach((expense) => {
            if (!inPeriod(parseDate(expense.date), period, now)) return;
            const amount = asAmount(expense.amount);
            const key = keyFor(expense);
            if (!key) { shared += amount; return; }
            const row = ensure(key, expense.artist);
            row.costs += amount;
            row.expenses.push(expense);
            const category = M()?.categoryKey ? M().categoryKey(expense) : 'other';
            row.costByCategory.set(category, (row.costByCategory.get(category) || 0) + amount);
        });

        const list = [...rows.values()].map((row) => ({
            ...row,
            net: row.fees - row.costs,
            margin: row.fees > 0 ? Math.round(((row.fees - row.costs) / row.fees) * 100) : null
        }));
        const totalFees = list.reduce((sum, row) => sum + row.fees, 0);
        list.forEach((row) => { row.share = totalFees > 0 ? Math.round((row.fees / totalFees) * 100) : 0; });
        list.sort((a, b) => (b.fees - a.fees) || (b.owed - a.owed) || a.name.localeCompare(b.name));
        return { list, shared, totalFees };
    }

    // ── Small pieces ─────────────────────────────────────────────────────
    function avatar(row, size) {
        const { el } = H().dom;
        const box = el('span', `ap-avatar ap-avatar--${size}`);
        const src = row.artist && typeof window.SPArtistAvatar === 'function' ? window.SPArtistAvatar(row.artist) : '';
        if (src) {
            const img = el('img');
            img.src = src;
            img.alt = '';
            box.appendChild(img);
        } else {
            box.textContent = row.name.charAt(0).toUpperCase();
        }
        box.setAttribute('aria-hidden', 'true');
        return box;
    }

    function ring(share) {
        const { svg } = H().dom;
        const r = 14;
        const c = 2 * Math.PI * r;
        const node = svg('svg', { class: 'ap-ring', viewBox: '0 0 36 36', 'aria-hidden': 'true' });
        node.appendChild(svg('circle', { cx: 18, cy: 18, r, class: 'ap-ring__track' }));
        const fill = (Math.max(0, Math.min(100, share)) / 100) * c;
        node.appendChild(svg('circle', { cx: 18, cy: 18, r, class: 'ap-ring__fill', 'stroke-dasharray': `${fill.toFixed(1)} ${(c - fill).toFixed(1)}` }));
        return node;
    }

    function stat(label, value, tone, sub) {
        const { el } = H().dom;
        const box = el('div', 'ap-stat');
        box.append(el('span', 'ap-stat__label', label), el('span', `ap-stat__value money${tone ? ` is-${tone}` : ''}`, value));
        if (sub) box.appendChild(el('span', 'ap-stat__sub', sub));
        return box;
    }

    function periodWords(period, now) {
        if (period === 'month') return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (period === 'year') return String(now.getFullYear());
        return 'all time';
    }

    function nextShow(row, now) {
        const { parseDate } = H().fmt;
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return row.bookings
            .filter((b) => String(b.status || '').toLowerCase() !== 'cancelled')
            .map((b) => ({ b, d: parseDate(b.date) }))
            .filter((x) => x.d && x.d >= today)
            .sort((a, b) => a.d - b.d)[0] || null;
    }

    // ── Spotlight ────────────────────────────────────────────────────────
    function renderSpotlight(data, period, now) {
        const host = $('apSpot');
        if (!host) return;
        const { el } = H().dom;
        const { ugx, compact } = H().fmt;
        host.replaceChildren();
        const top = data.list.find((row) => row.fees > 0);
        if (!top) {
            host.appendChild(el('p', 'ap-empty', `No confirmed shows in ${periodWords(period, now)} yet, so there is no top artist to show.`));
            return;
        }
        const head = el('div', 'ap-spot__who');
        const names = el('div', 'ap-spot__names');
        names.append(
            el('span', 'ap-label', `Top artist · ${periodWords(period, now)}`),
            el('span', 'ap-spot__name', top.name),
            el('span', 'ap-spot__sub', `${top.share}% of all fees from ${top.shows} show${top.shows === 1 ? '' : 's'}`)
        );
        head.append(avatar(top, 'lg'), names);
        const stats = el('div', 'ap-spot__stats');
        stats.append(
            stat('Fees', compact(top.fees)),
            stat('Costs', compact(top.costs)),
            stat('Net', compact(top.net), top.net < 0 ? 'bad' : '', top.margin === null ? '' : `keeps ${top.margin}%`),
            stat('Owed now', top.owed ? compact(top.owed) : '—', '', top.owed ? `${top.owedShows} show${top.owedShows === 1 ? '' : 's'}` : '')
        );
        const next = nextShow(top, now);
        const foot = el('p', 'ap-spot__next');
        if (next) {
            const days = Math.round((next.d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / H().fmt.DAY_MS);
            foot.textContent = `Next show: ${next.b.event || 'Show'}, ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}${next.b.location ? ` in ${next.b.location}` : ''}.`;
        } else {
            foot.textContent = 'No upcoming shows booked.';
        }
        const open = el('button', 'ap-link', 'Open profit and loss');
        open.type = 'button';
        open.setAttribute('data-ap-open', top.key);
        host.append(head, stats, foot, open);
        host.setAttribute('aria-label', `Top artist ${top.name}, fees ${ugx(top.fees)}`);
    }

    // ── Table ────────────────────────────────────────────────────────────
    function renderTable(data, period, now) {
        const table = $('apTable');
        if (!table) return;
        const { el } = H().dom;
        const { ugx } = H().fmt;
        table.replaceChildren();
        const sub = $('apTableSub');
        if (sub) sub.textContent = `Shows played, fees and costs for ${periodWords(period, now)}, up to today. Owed now is unpaid balances on shows already played.`;
        if (!data.list.length) {
            const row = el('tr');
            const td = el('td', 'ap-empty', 'Add an artist to see their numbers here.');
            td.colSpan = 7;
            row.appendChild(td);
            table.appendChild(row);
            return;
        }
        const head = el('thead');
        const hr = el('tr');
        [['Artist', ''], ['Shows', 'is-num'], ['Fees', 'is-num'], ['Costs', 'is-num'], ['Net', 'is-num'], ['Owed now', 'is-num'], ['Share of fees', 'is-num']].forEach(([text, cls]) => {
            const th = el('th', cls, text);
            th.setAttribute('scope', 'col');
            hr.appendChild(th);
        });
        head.appendChild(hr);
        const body = el('tbody');
        data.list.forEach((row) => {
            const tr = el('tr', `ap-row${row.key === openKey ? ' is-open' : ''}`);
            const th = el('th', 'ap-row__who');
            th.setAttribute('scope', 'row');
            const btn = el('button', 'ap-row__btn');
            btn.type = 'button';
            btn.setAttribute('data-ap-open', row.key);
            btn.setAttribute('aria-expanded', row.key === openKey ? 'true' : 'false');
            const names = el('span', 'ap-row__names');
            names.append(el('span', 'ap-row__name', row.name), el('span', 'ap-row__meta', row.artist?.specialty || (row.artist ? '' : 'Not on your roster')));
            btn.append(avatar(row, 'sm'), names);
            th.appendChild(btn);
            const share = el('td', 'is-num');
            const shareBox = el('span', 'ap-row__share');
            shareBox.append(ring(row.share), el('span', 'ap-row__pct', `${row.share}%`));
            share.appendChild(shareBox);
            tr.append(
                th,
                el('td', 'is-num', String(row.shows)),
                el('td', 'is-num money', row.fees ? ugx(row.fees) : '—'),
                el('td', 'is-num money', row.costs ? ugx(row.costs) : '—'),
                el('td', `is-num money${row.net < 0 ? ' is-bad' : ''}`, row.fees || row.costs ? ugx(row.net) : '—'),
                el('td', 'is-num money', row.owed ? ugx(row.owed) : '—'),
                share
            );
            body.appendChild(tr);
        });
        table.append(head, body);
        if (data.shared > 0) {
            const foot = el('tfoot');
            const tr = el('tr', 'ap-row--shared');
            const th = el('th', '', 'Shared costs (no artist)');
            th.setAttribute('scope', 'row');
            const note = el('td', 'ap-row__note', 'Not split between artists');
            const empty = el('td');
            empty.colSpan = 2;
            tr.append(th, el('td'), note, el('td', 'is-num money', ugx(data.shared)), el('td', 'is-num money is-bad', `−${ugx(data.shared)}`), empty);
            foot.appendChild(tr);
            table.appendChild(foot);
        }
        const note = $('apNote');
        if (note) {
            const roster = data.list.filter((row) => row.artist).length;
            const net = data.list.reduce((sum, row) => sum + row.net, 0) - data.shared;
            note.textContent = `${roster} artist${roster === 1 ? '' : 's'} on your roster. After shared costs, the roster ${net < 0 ? 'lost' : 'kept'} ${ugx(Math.abs(net))} in ${periodWords(period, now)}.`;
        }
    }

    // ── Mini P&L for one artist ──────────────────────────────────────────
    function lastSixMonths(row, now) {
        const { parseDate, asAmount, monthIndex } = H().fmt;
        const m = H().money();
        const end = monthIndex(now);
        const months = Array.from({ length: 6 }, (_, i) => {
            const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            return { date, idx: monthIndex(date), fees: 0, costs: 0 };
        });
        const at = (date) => (date ? months.find((month) => month.idx === monthIndex(date)) : null);
        row.bookings.forEach((b) => {
            if (!m.isEarningBooking(b)) return;
            const month = at(parseDate(b.date));
            if (month) month.fees += asAmount(b.fee);
        });
        arr('expenses').forEach((e) => {
            const key = e?.artistId && row.artist && String(row.artist.id) === String(e.artistId) ? row.key : nameKey(e?.artist);
            if (key !== row.key) return;
            const date = parseDate(e.date);
            if (!date || monthIndex(date) > end) return;
            const month = at(date);
            if (month) month.costs += asAmount(e.amount);
        });
        return months;
    }

    function payState(b, today) {
        const { asAmount, parseDate, DAY_MS } = H().fmt;
        const status = String(b.status || '').toLowerCase();
        if (status === 'cancelled') return { text: 'Cancelled', tone: 'muted' };
        if (status === 'pending') return { text: 'Pending', tone: 'muted' };
        const balance = asAmount(b.balance);
        if (balance <= 0) return { text: 'Paid', tone: 'good' };
        const date = parseDate(b.date);
        const days = date ? Math.floor((today - date) / DAY_MS) : 0;
        const limit = window.SPInsights?.targets?.().overdueDays ?? 14;
        if (days > limit) return { text: `Overdue ${days} days`, tone: 'bad' };
        return { text: asAmount(b.deposit) > 0 ? 'Part paid' : 'Unpaid', tone: 'warn' };
    }

    function renderDetail(data, period, now) {
        const host = $('apDetail');
        if (!host) return;
        const row = openKey ? data.list.find((entry) => entry.key === openKey) : null;
        if (!row) { host.hidden = true; host.replaceChildren(); return; }
        const { el } = H().dom;
        const { ugx, compact, parseDate } = H().fmt;
        host.hidden = false;
        host.replaceChildren();

        const head = el('div', 'ap-detail__head');
        const names = el('div', 'ap-spot__names');
        names.append(el('h3', 'ap-title', `${row.name}: profit and loss`), el('span', 'ap-sub', `${PERIODS[period]}${period === 'all' ? '' : ` (${periodWords(period, now)})`}`));
        const close = el('button', 'ap-close');
        close.type = 'button';
        close.setAttribute('data-ap-close', '');
        close.setAttribute('aria-label', 'Close profit and loss');
        const x = el('i', 'ph ph-x');
        x.setAttribute('aria-hidden', 'true');
        close.appendChild(x);
        head.append(avatar(row, 'md'), names, close);

        const stats = el('div', 'ap-detail__stats');
        stats.append(
            stat('Fees', ugx(row.fees)),
            stat('Collected', ugx(row.collected)),
            stat('Costs', ugx(row.costs)),
            stat('Net', ugx(row.net), row.net < 0 ? 'bad' : '', row.margin === null ? '' : `keeps ${row.margin}% of fees`),
            stat('Owed now', row.owed ? ugx(row.owed) : '—', '', row.owed ? `on ${row.owedShows} show${row.owedShows === 1 ? '' : 's'}` : 'Nothing unpaid')
        );

        const grid = el('div', 'ap-detail__grid');
        const chartBox = el('div', 'ap-detail__chart');
        chartBox.appendChild(el('span', 'ap-label', 'Fees and costs, last 6 months'));
        const chart = H().dom.svg('svg', { class: 'mv-chart ap-chart', role: 'img', 'aria-label': `Fees and costs for ${row.name} over the last six months`, focusable: 'false' });
        chartBox.appendChild(chart);

        const costs = el('div', 'ap-detail__costs');
        costs.appendChild(el('span', 'ap-label', 'Where the costs went'));
        const costList = el('ul', 'ap-costs');
        const cats = [...row.costByCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (!cats.length) costList.appendChild(el('li', 'ap-costs__empty', 'No costs linked to this artist in this period.'));
        const maxCat = Math.max(1, ...cats.map(([, v]) => v));
        cats.forEach(([key, amount]) => {
            const li = el('li', 'ap-costs__row');
            const bar = el('span', 'ap-costs__bar');
            const fill = el('span', 'ap-costs__fill');
            fill.style.setProperty('--w', `${((amount / maxCat) * 100).toFixed(1)}%`);
            bar.appendChild(fill);
            li.append(el('span', 'ap-costs__name', M()?.categoryLabel ? M().categoryLabel(key) : key), el('span', 'ap-costs__amt money', compact(amount)), bar);
            costList.appendChild(li);
        });
        costs.appendChild(costList);

        const shows = el('div', 'ap-detail__shows');
        shows.appendChild(el('span', 'ap-label', 'Shows'));
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dated = row.bookings.map((b) => ({ b, d: parseDate(b.date) })).filter((x) => x.d);
        const upcoming = dated.filter((x) => x.d >= today).sort((a, b) => a.d - b.d).slice(0, 3);
        const past = dated.filter((x) => x.d < today).sort((a, b) => b.d - a.d).slice(0, 4);
        const showList = el('ul', 'ap-shows');
        [...upcoming, ...past].forEach(({ b, d }) => {
            const li = el('li', 'ap-shows__row');
            const state = payState(b, today);
            const what = el('span', 'ap-shows__what');
            what.append(el('span', 'ap-shows__event', b.event || 'Show'), el('span', 'ap-shows__when', `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${b.location ? ` · ${b.location}` : ''}`));
            li.append(what, el('span', 'ap-shows__fee money', compact(H().fmt.asAmount(b.fee))), el('span', `ap-pill is-${state.tone}`, state.text));
            showList.appendChild(li);
        });
        if (!upcoming.length && !past.length) showList.appendChild(el('li', 'ap-costs__empty', 'No shows booked for this artist yet.'));
        shows.appendChild(showList);

        grid.append(chartBox, costs, shows);
        const docs = window.SPDocs?.artistBlock?.(row.artist);
        if (docs) grid.appendChild(docs);
        host.append(head, stats, grid);

        if (window.SPCharts) {
            const months = lastSixMonths(row, now);
            window.SPCharts.lineChart(chart, {
                labels: months.map((month) => month.date.toLocaleDateString('en-US', { month: 'short' })),
                titles: months.map((month) => month.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
                series: [
                    { name: 'Fees', values: months.map((month) => month.fees), tone: 'gold', area: true },
                    { name: 'Costs', values: months.map((month) => month.costs), tone: 'ink', dashed: true, thin: true }
                ],
                fmt: ugx,
                axisFmt: compact,
                endLabel: compact(months[5].fees)
            });
        }
    }

    function renderPeriodButtons(period) {
        document.querySelectorAll('[data-ap-period]').forEach((btn) => {
            const on = btn.getAttribute('data-ap-period') === period;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function render() {
        if (!$('apTable') || !H()) return;
        const now = new Date();
        const period = readPeriod();
        renderPeriodButtons(period);
        const data = buildRows(period, now);
        renderSpotlight(data, period, now);
        renderTable(data, period, now);
        renderDetail(data, period, now);
    }

    document.addEventListener('click', (event) => {
        const periodBtn = event.target.closest?.('[data-ap-period]');
        if (periodBtn) {
            savePeriod(periodBtn.getAttribute('data-ap-period'));
            render();
            return;
        }
        const open = event.target.closest?.('[data-ap-open]');
        if (open) {
            const key = open.getAttribute('data-ap-open');
            openKey = openKey === key && open.classList.contains('ap-row__btn') ? null : key;
            render();
            if (openKey) $('apDetail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return;
        }
        if (event.target.closest?.('[data-ap-close]')) {
            openKey = null;
            render();
        }
    });

    window.SPArtistsPage = { render, buildRows };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
