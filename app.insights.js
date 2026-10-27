/**
 * Star Paper - phase 3 insights: Money > Expenses analysis (category donut
 * against the usual month, by artist, by month, flags), money alert rules for
 * Home's "Needs you" (each with the numbers, a likely cause and a next step),
 * Settings > Targets & alerts, and the Data health check under Reports.
 * Reads the same money rules as Home and Money (window.SPHome,
 * window.SPMoneyPages). DOM nodes only: no innerHTML. Nothing here edits or
 * deletes records.
 */
(function () {
    'use strict';

    const TARGETS_KEY = 'starPaperTargets';
    const DEFAULT_TARGETS = Object.freeze({ marginFloor: 20, overdueDays: 14, revenueDrop: 25, spendJump: 50, runwayMonths: 2, budgetOver: 10 });
    const MAX_MONEY_ALERTS = 4;

    const $ = (id) => document.getElementById(id);
    const H = () => window.SPHome || null;
    const M = () => window.SPMoneyPages || null;
    const C = () => window.SPCharts || null;

    function startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function monthStart(date, offset = 0) {
        return new Date(date.getFullYear(), date.getMonth() + offset, 1);
    }

    function monthName(date, form = 'long') {
        return date.toLocaleDateString('en-US', { month: form });
    }

    function plural(n, word) {
        return `${n} ${word}${n === 1 ? '' : 's'}`;
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

    // ── Targets (saved with the account through SPFinance) ──────────────
    function storedTargets() {
        if (window.SPFinance) return window.SPFinance.getSettings().targets || {};
        try { return JSON.parse(window.localStorage.getItem(TARGETS_KEY) || '{}') || {}; } catch (_) { return {}; }
    }

    function targets() {
        const stored = storedTargets();
        const out = { ...DEFAULT_TARGETS };
        Object.keys(DEFAULT_TARGETS).forEach((key) => {
            const value = Number(stored[key]);
            if (Number.isFinite(value) && value >= 0) out[key] = value;
        });
        return out;
    }

    function saveTargets(next) {
        if (window.SPFinance) return window.SPFinance.updateSettings({ targets: next });
        try { window.localStorage.setItem(TARGETS_KEY, JSON.stringify(next)); } catch (_) { /* per-device only */ }
        return null;
    }

    // ── Shared data ───────────────────────────────────────────────────────
    function periodKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    // Budget for a category in the month of `date` (month-specific, else the
    // standing monthly budget), or null when none is set.
    function budgetFor(key, date) {
        return window.SPFinance?.getBudget?.(key, periodKey(date)) ?? null;
    }

    function budgetKeys() {
        return new Set((window.SPFinance?.getBudgets?.() || []).filter((b) => Number(b.amount) > 0).map((b) => b.category));
    }

    function expensesIn(date) {
        const { parseDate, monthIndex } = H().fmt;
        const target = monthIndex(date);
        return (window.expenses || []).filter((entry) => {
            const d = parseDate(entry.date);
            return d && monthIndex(d) === target;
        });
    }

    // Average spend per category over the three months before `date`.
    function usualByCategory(date) {
        const m = M();
        const totals = new Map();
        [1, 2, 3].forEach((back) => {
            m.monthLines(monthStart(date, -back)).categories.forEach((amount, key) => {
                totals.set(key, (totals.get(key) || 0) + amount);
            });
        });
        totals.forEach((amount, key) => totals.set(key, amount / 3));
        return totals;
    }

    function cashPosition(now) {
        const m = M();
        const cur = m.monthLines(now);
        const bbf = window.SPMoney?.getBBF?.() || { amount: 0, label: '' };
        const open = Math.round(Number(bbf.amount) || 0);
        return { cur, open, hasOpen: open !== 0, close: open + cur.in - cur.out };
    }

    // Money in from the 1st to today, this month and the same days last month.
    function moneyInToDate(now) {
        const h = H();
        const money = h.money();
        const { parseDate, asAmount } = h.fmt;
        const day = now.getDate();
        const thisStart = monthStart(now);
        const lastStart = monthStart(now, -1);
        const lastDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        const lastEnd = new Date(lastStart.getFullYear(), lastStart.getMonth(), Math.min(day, lastDays), 23, 59, 59);
        const thisEnd = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59);
        let cur = 0;
        let prev = 0;
        const add = (date, amount) => {
            if (!date) return;
            if (date >= thisStart && date <= thisEnd) cur += amount;
            else if (date >= lastStart && date <= lastEnd) prev += amount;
        };
        (window.bookings || []).forEach((b) => {
            if (!money.isEarningBooking(b)) return;
            const events = money.getBookingCashEvents ? money.getBookingCashEvents(b) : [{ date: b.date, amount: money.getBookingCollected(b) }];
            events.forEach((event) => add(parseDate(event.date), event.amount));
        });
        (window.otherIncome || []).forEach((e) => { if (money.isReceivedOtherIncome(e)) add(parseDate(e.date), asAmount(e.amount)); });
        return { cur, prev, lastEnd };
    }

    // ── Alerts for "Needs you" ────────────────────────────────────────────
    // Returns nudges in app.js's shape plus `detail` rows (Why / Try).
    function alerts(nowArg) {
        const h = H();
        const m = M();
        if (!h || !m) return [];
        const now = nowArg instanceof Date ? nowArg : new Date();
        const today = startOfDay(now);
        const t = targets();
        const { ugx, compact } = h.fmt;
        const out = [];
        const { cur, open, hasOpen, close } = cashPosition(now);
        const period = `${now.getFullYear()}-${now.getMonth() + 1}`;

        // 1. Margin under the floor (or money out with nothing in).
        if (cur.in > 0) {
            const margin = Math.round((cur.net / cur.in) * 100);
            if (margin < t.marginFloor) {
                const top = [...cur.categories.entries()].sort((a, b) => b[1] - a[1])[0];
                out.push({
                    type: margin < 0 ? 'alert' : 'warning',
                    icon: 'ph-percent',
                    id: `fin-margin-${period}`,
                    text: margin < 0
                        ? `You're spending more than you take in this month: ${ugx(cur.out)} out, ${ugx(cur.in)} in.`
                        : `You kept ${margin}% of what came in this month, under your ${t.marginFloor}% floor.`,
                    detail: [
                        { k: 'Why', v: top ? `${m.categoryLabel(top[0])} is the biggest cost at ${compact(top[1])} of ${compact(cur.out)}.` : `Costs are ${compact(cur.out)} against ${compact(cur.in)} in.` },
                        { k: 'Try', v: 'Hold back on that cost, or collect open balances to lift money in.' }
                    ],
                    action: 'showSection',
                    actionId: 'money'
                });
            }
        } else if (cur.out > 0 && now.getDate() >= 7) {
            out.push({
                type: 'warning',
                icon: 'ph-percent',
                id: `fin-noin-${period}`,
                text: `${ugx(cur.out)} has gone out this month and nothing has come in yet.`,
                detail: [{ k: 'Try', v: 'Check that played shows have their deposits and balances logged.' }],
                action: 'showSection',
                actionId: 'money'
            });
        }

        // 2. Money in down on the same point last month.
        const mtd = moneyInToDate(now);
        if (mtd.prev > 0 && now.getDate() >= 7) {
            const drop = Math.round(((mtd.prev - mtd.cur) / mtd.prev) * 100);
            if (drop >= t.revenueDrop) {
                const pending = (window.bookings || []).filter((b) => String(b?.status || '').toLowerCase() === 'pending' && h.fmt.parseDate(b.date) >= today);
                const pendingAmt = pending.reduce((a, b) => a + h.fmt.asAmount(b.fee), 0);
                out.push({
                    type: 'warning',
                    icon: 'ph-trend-down',
                    id: `fin-drop-${period}`,
                    text: `Money in is down ${drop}% on the same point last month.`,
                    detail: [
                        { k: 'Why', v: `${compact(mtd.cur)} so far, against ${compact(mtd.prev)} by ${mtd.lastEnd.getDate()} ${monthName(mtd.lastEnd, 'short')}.` },
                        { k: 'Try', v: pending.length ? `Confirm the ${plural(pending.length, 'pending show')} (${compact(pendingAmt)}).` : 'Follow up open enquiries and deposits.' }
                    ],
                    action: 'showSection',
                    actionId: 'schedule'
                });
            }
        }

        // 3a. A category over its budget by more than the allowed margin.
        const overBudget = new Set();
        [...cur.categories.entries()]
            .map(([key, amount]) => ({ key, amount, budget: budgetFor(key, now) }))
            .filter((row) => row.budget && row.amount > row.budget * (1 + t.budgetOver / 100))
            .sort((a, b) => (b.amount - b.budget) - (a.amount - a.budget))
            .slice(0, 2)
            .forEach((row) => {
                overBudget.add(row.key);
                const over = Math.round(((row.amount - row.budget) / row.budget) * 100);
                const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
                out.push({
                    type: over >= 50 ? 'alert' : 'warning',
                    icon: 'ph-wallet',
                    id: `fin-budget-${row.key}-${period}`,
                    text: `${m.categoryLabel(row.key)} is ${over}% over budget this month.`,
                    detail: [
                        { k: 'Why', v: `${compact(row.amount)} spent against a ${compact(row.budget)} budget, with ${plural(daysLeft, 'day')} to go.` },
                        { k: 'Try', v: 'Pause this category until next month, or raise its budget in Settings if the plan changed.' }
                    ],
                    action: 'showSection',
                    actionId: 'expenses'
                });
            });

        // 3b. A category well above its usual month (top two).
        const usual = usualByCategory(now);
        [...cur.categories.entries()]
            .map(([key, amount]) => ({ key, amount, avg: usual.get(key) || 0 }))
            .filter((row) => !overBudget.has(row.key) && !budgetFor(row.key, now))
            .filter((row) => row.avg > 0 && row.amount - row.avg >= 50000 && ((row.amount - row.avg) / row.avg) * 100 >= t.spendJump)
            .sort((a, b) => (b.amount - b.avg) - (a.amount - a.avg))
            .slice(0, 2)
            .forEach((row) => {
                const jump = Math.round(((row.amount - row.avg) / row.avg) * 100);
                const biggest = expensesIn(now)
                    .filter((e) => m.categoryKey(e) === row.key)
                    .sort((a, b) => h.fmt.asAmount(b.amount) - h.fmt.asAmount(a.amount))[0];
                out.push({
                    type: 'warning',
                    icon: 'ph-chart-line-up',
                    id: `fin-jump-${row.key}-${period}`,
                    text: `${m.categoryLabel(row.key)} is up ${jump}% on your usual month.`,
                    detail: [
                        { k: 'Why', v: `${compact(row.amount)} this month against ${compact(row.avg)} on average${biggest ? `; the biggest is "${biggest.description || 'unnamed'}" at ${compact(biggest.amount)}` : ''}.` },
                        { k: 'Try', v: 'Check it was planned, or hold the rest of this category for next month.' }
                    ],
                    action: 'showSection',
                    actionId: 'expenses'
                });
            });

        // 4. Runway and 5. forecast dip (only once an opening balance is set).
        const spend = m.averageWeeklySpend(today);
        const monthly = (spend * 52) / 12;
        if (hasOpen && monthly > 0) {
            const runway = close / monthly;
            if (runway < t.runwayMonths) {
                const owed = h.receivables(now);
                out.push({
                    type: runway < 1 ? 'alert' : 'warning',
                    icon: 'ph-hourglass-medium',
                    id: `fin-runway-${period}`,
                    text: `Cash covers ${Math.max(0, runway).toFixed(1).replace(/\.0$/, '')} months of spending, under your ${t.runwayMonths}-month target.`,
                    detail: [
                        { k: 'Why', v: `Cash now is ${compact(close)} (from ${compact(open)} brought forward); spending runs at about ${compact(monthly)} a month.` },
                        { k: 'Try', v: owed.late > 0 ? `Collect the ${compact(owed.late)} that's overdue first.` : 'Push deposits on upcoming shows.' }
                    ],
                    action: 'showSection',
                    actionId: 'cashflow'
                });
            }
            const minStored = m.readMinCash();
            const minCash = minStored === null ? Math.round(monthly) : minStored;
            const plan = m.forecast(today, close);
            const dip = plan.weeks.find((w) => w.cash < minCash);
            if (dip) {
                out.push({
                    type: dip.cash < 0 ? 'alert' : 'warning',
                    icon: 'ph-chart-line-down',
                    id: `fin-dip-${period}`,
                    text: `Cash is on track to drop below your minimum in the week of ${dip.start.getDate()} ${monthName(dip.start, 'short')}.`,
                    detail: [
                        { k: 'Why', v: `Forecast ${compact(dip.cash)} against a minimum of ${compact(minCash)}.` },
                        { k: 'Try', v: 'Move a cost later, or collect a balance before that week.' }
                    ],
                    action: 'showSection',
                    actionId: 'cashflow'
                });
            }
        } else if (!hasOpen && monthly > 0) {
            out.push({
                type: 'info',
                icon: 'ph-bank',
                id: 'fin-no-opening',
                text: 'Add the cash you started the month with so cash alerts can work.',
                detail: [{ k: 'Try', v: 'Tap here to set the balance brought forward.' }],
                action: 'openBBFModal',
                actionId: ''
            });
        }

        // 6. Balances overdue longer than the target.
        const late = m.unpaidRows(today).filter((r) => r.days > t.overdueDays).sort((a, b) => b.score - a.score);
        if (late.length) {
            const worst = late[0];
            const b = worst.booking;
            const others = late.length - 1;
            out.push({
                type: 'alert',
                icon: 'ph-hand-coins',
                id: `fin-late-${b.id}`,
                text: `"${b.event || 'A show'}" is ${plural(worst.days, 'day')} overdue: ${ugx(worst.balance)} unpaid.${others ? ` ${plural(others, 'more show')} past ${t.overdueDays} days.` : ''}`,
                detail: [
                    { k: 'Why', v: `The show was on ${worst.date ? worst.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'an unknown date'} and the balance is still open.` },
                    { k: 'Try', v: `Call or WhatsApp ${b.contact ? b.contact : 'the promoter'} from Money › Receivables.` }
                ],
                action: 'showSection',
                actionId: 'receivables'
            });
        }

        const rank = { alert: 0, warning: 1, info: 2 };
        return out.sort((a, b) => rank[a.type] - rank[b.type]).slice(0, MAX_MONEY_ALERTS);
    }

    // ── Money > Expenses ──────────────────────────────────────────────────
    function expenseFlags(now) {
        const h = H();
        const m = M();
        const { asAmount, parseDate, monthIndex, compact } = h.fmt;
        const flags = [];
        const thisIdx = monthIndex(now);
        const norm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

        // Same description in 3 of the last 4 months: a recurring charge.
        const byDesc = new Map();
        (window.expenses || []).forEach((e) => {
            const d = parseDate(e.date);
            const key = norm(e.description);
            if (!d || !key) return;
            const back = thisIdx - monthIndex(d);
            if (back < 0 || back > 3) return;
            const row = byDesc.get(key) || { label: e.description, months: new Set(), total: 0 };
            row.months.add(back);
            row.total += asAmount(e.amount);
            byDesc.set(key, row);
        });
        byDesc.forEach((row) => {
            if (row.months.size >= 3) {
                flags.push({ tone: 'info', icon: 'ph-arrows-clockwise', title: `Recurring: ${row.label}`, text: `In ${row.months.size} of the last 4 months, about ${compact(row.total / row.months.size)} each time. Worth checking it's still needed.` });
            }
        });

        // Same amount, day and category twice: maybe entered twice.
        const seen = new Map();
        expensesIn(now).concat(expensesIn(monthStart(now, -1))).forEach((e) => {
            const key = `${asAmount(e.amount)}|${String(e.date).slice(0, 10)}|${m.categoryKey(e)}`;
            if (seen.has(key)) {
                flags.push({ tone: 'warning', icon: 'ph-copy', title: 'Possible double entry', text: `"${seen.get(key).description || 'Expense'}" and "${e.description || 'Expense'}": both ${compact(e.amount)} on ${String(e.date).slice(0, 10)}.` });
            } else seen.set(key, e);
        });

        // Over budget, else well above its usual month.
        const cur = m.monthLines(now);
        const usual = usualByCategory(now);
        const t = targets();
        cur.categories.forEach((amount, key) => {
            const budget = budgetFor(key, now);
            if (budget && amount > budget) {
                flags.push({ tone: 'warning', icon: 'ph-wallet', title: `${m.categoryLabel(key)} over budget`, text: `${compact(amount)} spent against a ${compact(budget)} budget, ${compact(amount - budget)} over.` });
                return;
            }
            // A budget is the plan: within it, a rise on the usual month is expected.
            if (budget) return;
            const avg = usual.get(key) || 0;
            if (avg > 0 && amount - avg >= 50000 && ((amount - avg) / avg) * 100 >= t.spendJump) {
                flags.push({ tone: 'warning', icon: 'ph-chart-line-up', title: `${m.categoryLabel(key)} jumped`, text: `${compact(amount)} this month against ${compact(avg)} usually. Bringing it back to usual saves ${compact(amount - avg)}.` });
            }
        });

        // Costs growing faster than money in (last 3 months vs the 3 before).
        const sum3 = (from) => [0, 1, 2].reduce((acc, i) => {
            const l = m.monthLines(monthStart(now, -(from + i)));
            return { in: acc.in + l.in, out: acc.out + l.out };
        }, { in: 0, out: 0 });
        const recent = sum3(0);
        const before = sum3(3);
        if (before.out > 0 && before.in > 0) {
            const outGrowth = ((recent.out - before.out) / before.out) * 100;
            const inGrowth = ((recent.in - before.in) / before.in) * 100;
            if (outGrowth - inGrowth >= 15 && outGrowth > 0) {
                flags.push({ tone: 'warning', icon: 'ph-scales', title: 'Costs growing faster than money in', text: `Spending is up ${Math.round(outGrowth)}% over the last 3 months; money in is ${inGrowth >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(inGrowth))}%.` });
            }
        }
        return flags;
    }

    function renderExpenses(now) {
        const h = H();
        const m = M();
        const c = C();
        if (!h || !m || !c || !$('mvExDonut')) return;
        const { ugx, compact, asAmount } = h.fmt;
        const { el } = h.dom;
        const cur = m.monthLines(now);
        const prev = m.monthLines(monthStart(now, -1));
        const series = h.monthlySeries(6, now);
        const usual = usualByCategory(now);

        // Tiles
        setText('mvExTotal', ugx(cur.out));
        h.setDelta($('mvExTotalDelta'), cur.out, prev.out, { upIsGood: false });
        c.spark($('mvExTotalSpark'), series.map((r) => r.out), { tone: 'sage' });
        const share = cur.in > 0 ? Math.round((cur.out / cur.in) * 100) : null;
        setText('mvExShare', share === null ? '—' : `${share}%`);
        const shareSub = $('mvExShareSub');
        if (shareSub) {
            shareSub.textContent = share === null ? 'Nothing came in yet this month' : `of money in. You keep ${Math.max(0, 100 - share)} of every 100`;
            setTone(shareSub, share !== null && share > 100 - targets().marginFloor ? 'is-bad' : null);
        }
        const top = [...cur.categories.entries()].sort((a, b) => b[1] - a[1])[0];
        setText('mvExTop', top ? m.categoryLabel(top[0]) : '—');
        setText('mvExTopSub', top ? `${compact(top[1])}, ${Math.round((top[1] / Math.max(1, cur.out)) * 100)}% of spending` : 'No spending yet this month');
        const days = now.getDate();
        setText('mvExDaily', ugx(cur.out / Math.max(1, days)));
        const lastDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        setText('mvExDailySub', prev.out ? `${compact(prev.out / lastDays)} a day in ${monthName(monthStart(now, -1))}` : `Over ${plural(days, 'day')} so far`);
        setText('mvExPeriod', `${monthName(now)} ${now.getFullYear()}`);

        // Category donut + bars against the usual month
        const rows = [...cur.categories.entries()].sort((a, b) => b[1] - a[1]).map(([key, amount]) => ({
            key,
            name: m.categoryLabel(key),
            amount,
            note: usual.get(key) ? `Usually ${compact(usual.get(key))} a month` : 'New this month'
        }));
        let donutRows = rows;
        if (rows.length > 6) {
            const rest = rows.slice(5);
            donutRows = rows.slice(0, 5).concat([{ name: 'Others', amount: rest.reduce((a, r) => a + r.amount, 0) }]);
        }
        c.donut($('mvExDonut'), donutRows, { centre: compact(cur.out), centreSub: 'spent', fmt: ugx, empty: 'No spending logged this month.', size: 170, legend: false });

        const bars = $('mvExBars');
        if (bars) {
            bars.replaceChildren();
            const keys = new Set([...cur.categories.keys(), ...usual.keys(), ...budgetKeys()]);
            const list = [...keys].map((key) => ({ key, amount: cur.categories.get(key) || 0, avg: usual.get(key) || 0, budget: budgetFor(key, now) }))
                .filter((r) => r.amount > 0 || r.avg > 0 || r.budget)
                .sort((a, b) => b.amount - a.amount || (b.budget || b.avg) - (a.budget || a.avg))
                .slice(0, 8);
            const max = Math.max(1, ...list.map((r) => Math.max(r.amount, r.budget || r.avg)));
            const anyBudget = list.some((r) => r.budget);
            setText('mvExBarsSub', anyBudget
                ? 'The marker on each bar is its monthly budget; without one, your usual month (average of the three before).'
                : 'The marker on each bar is your usual month (average of the three before). Set budgets in Settings.');
            if (!list.length) bars.appendChild(el('li', 'mv-empty', 'Nothing spent in the last four months.'));
            list.forEach((r, i) => {
                const over = r.budget ? r.amount > r.budget : (r.avg > 0 && r.amount > r.avg * 1.1);
                const li = el('li', `mv-cbar${over ? ' is-over' : ''}`);
                const head = el('div', 'mv-cbar__head');
                const pctIn = cur.in > 0 ? `${Math.round((r.amount / cur.in) * 100)}% of money in` : '';
                head.append(el('span', 'mv-cbar__name', m.categoryLabel(r.key)), el('span', 'mv-cbar__amt money', compact(r.amount)));
                const track = el('div', 'mv-cbar__track');
                const fill = el('span', `mv-cbar__fill spc-c${(Math.min(i, 5)) + 1}`);
                fill.style.setProperty('--w', `${((r.amount / max) * 100).toFixed(1)}%`);
                track.appendChild(fill);
                const markAt = r.budget || r.avg;
                if (markAt > 0) {
                    const mark = el('span', `mv-cbar__mark${r.budget ? ' is-budget' : ''}`);
                    mark.style.setProperty('--at', `${((markAt / max) * 100).toFixed(1)}%`);
                    mark.title = r.budget ? `Budget: ${ugx(r.budget)}` : `Usual month: ${ugx(r.avg)}`;
                    track.appendChild(mark);
                }
                const budgetText = r.budget
                    ? (r.amount > r.budget ? `${compact(r.amount - r.budget)} over a ${compact(r.budget)} budget` : `${Math.round((r.amount / r.budget) * 100)}% of ${compact(r.budget)} budget`)
                    : null;
                const sub = el('span', 'mv-cbar__sub', [budgetText || (r.avg > 0 ? `Usually ${compact(r.avg)}` : 'New this month'), pctIn].filter(Boolean).join(' · '));
                li.append(head, track, sub);
                c.bindItem(li, m.categoryLabel(r.key), [
                    { label: 'This month', value: ugx(r.amount), tone: `c${Math.min(i, 5) + 1}` },
                    { label: 'Budget', value: r.budget ? ugx(r.budget) : 'Not set', tone: 'gold' },
                    { label: 'Usual month', value: r.avg > 0 ? ugx(r.avg) : '—', tone: 'ink' }
                ], 'Usual month is the average of the three months before this one.');
                bars.appendChild(li);
            });
        }

        // By artist
        const byArtist = new Map();
        expensesIn(now).forEach((e) => {
            const name = String(e.artist || e.artist_name || '').trim() || 'Shared / roster';
            byArtist.set(name, (byArtist.get(name) || 0) + asAmount(e.amount));
        });
        const artistHost = $('mvExArtists');
        if (artistHost) {
            artistHost.replaceChildren();
            const list = [...byArtist.entries()].sort((a, b) => b[1] - a[1]);
            const max = Math.max(1, ...list.map(([, v]) => v));
            if (!list.length) artistHost.appendChild(el('li', 'mv-empty', 'No spending logged this month.'));
            list.forEach(([name, amount], i) => {
                const li = el('li', 'mv-abar');
                const track = el('span', 'mv-abar__track');
                const fill = el('span', `mv-abar__fill spc-c${Math.min(i, 5) + 1}`);
                fill.style.setProperty('--w', `${((amount / max) * 100).toFixed(1)}%`);
                track.appendChild(fill);
                li.append(el('span', 'mv-abar__name', name), track, el('span', 'mv-abar__amt money', compact(amount)), el('span', 'mv-abar__pct', `${Math.round((amount / Math.max(1, cur.out)) * 100)}%`));
                artistHost.appendChild(li);
            });
        }

        // Six months of spending
        c.lineChart($('mvExTrend'), {
            labels: series.map((r) => r.label),
            titles: series.map((r) => r.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
            series: [
                { name: 'Spent', values: series.map((r) => r.out), tone: 'sage', area: true },
                { name: 'Money in', values: series.map((r) => r.in), tone: 'gold', dashed: true, thin: true }
            ],
            fmt: ugx,
            axisFmt: compact,
            endLabel: compact(series[series.length - 1].out)
        });

        // Flags
        const flagHost = $('mvExFlags');
        if (flagHost) {
            flagHost.replaceChildren();
            const flags = expenseFlags(now);
            setText('mvExFlagCount', flags.length ? plural(flags.length, 'flag') : 'All clear');
            if (!flags.length) flagHost.appendChild(el('li', 'mv-empty', 'Nothing unusual in your spending.'));
            flags.forEach((flag) => {
                const li = el('li', `mv-flag is-${flag.tone}`);
                const icon = el('i', `ph ${flag.icon} mv-flag__icon`);
                icon.setAttribute('aria-hidden', 'true');
                const body = el('div', 'mv-flag__body');
                body.append(el('span', 'mv-flag__title', flag.title), el('span', 'mv-flag__text', flag.text));
                li.append(icon, body);
                flagHost.appendChild(li);
            });
        }
    }

    // ── Data health (Reports) ─────────────────────────────────────────────
    function healthIssues(now) {
        const h = H();
        const m = M();
        const { asAmount, parseDate } = h.fmt;
        const today = startOfDay(now);
        const issues = [];
        const fmtDate = (d) => (d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date');
        const live = (b) => String(b?.status || '').toLowerCase() !== 'cancelled';
        const bookings = window.bookings || [];

        const groups = new Map();
        bookings.filter(live).forEach((b) => {
            const d = parseDate(b.date);
            const artist = String(b.artist || b.artist_name || '').trim().toLowerCase();
            if (!d || !artist) return;
            const key = `${artist}|${String(b.date).slice(0, 10)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(b);
        });
        groups.forEach((list) => {
            if (list.length < 2) return;
            const sameEvent = new Set(list.map((b) => String(b.event || '').trim().toLowerCase())).size === 1;
            issues.push({
                kind: 'booking', id: list[1].id, record: list.map((b) => b.event || 'Untitled').join(' / '),
                issue: `${list.length} bookings for ${list[0].artist || list[0].artist_name} on ${fmtDate(parseDate(list[0].date))}.`,
                fix: sameEvent ? 'Looks entered twice. Cancel the extra one.' : 'Check the artist can play both, or fix the date.',
                confidence: sameEvent ? 'high' : 'medium'
            });
        });

        bookings.filter(live).forEach((b) => {
            const fee = asAmount(b.fee);
            const deposit = asAmount(b.deposit);
            const balance = asAmount(b.balance);
            const d = parseDate(b.date);
            const name = b.event || 'Untitled show';
            const status = String(b.status || '').toLowerCase();
            if (!d) issues.push({ kind: 'booking', id: b.id, record: name, issue: 'No show date.', fix: 'Add the date so it counts in the right month.', confidence: 'high' });
            if (deposit > fee && fee > 0) issues.push({ kind: 'booking', id: b.id, record: name, issue: `Deposit ${h.fmt.ugx(deposit)} is more than the fee ${h.fmt.ugx(fee)}.`, fix: 'Correct the fee or the deposit.', confidence: 'high' });
            else if (balance > fee - deposit + 1 && fee > 0) issues.push({ kind: 'booking', id: b.id, record: name, issue: `Balance ${h.fmt.ugx(balance)} is more than fee minus deposit (${h.fmt.ugx(fee - deposit)}).`, fix: `Set the balance to ${h.fmt.ugx(Math.max(0, fee - deposit))} or less.`, confidence: 'high' });
            if (status === 'pending' && d && d < today) issues.push({ kind: 'booking', id: b.id, record: name, issue: `Show date ${fmtDate(d)} has passed and it's still pending.`, fix: 'Mark it confirmed, completed or cancelled.', confidence: 'high' });
            if ((status === 'confirmed' || status === 'completed') && fee <= 0) issues.push({ kind: 'booking', id: b.id, record: name, issue: 'Confirmed with no fee.', fix: 'Add the fee so it counts as money in.', confidence: 'medium' });
        });

        const expenses = window.expenses || [];
        const seen = new Map();
        let vague = 0;
        let vagueTotal = 0;
        expenses.forEach((e) => {
            const amount = asAmount(e.amount);
            const d = parseDate(e.date);
            const name = e.description || 'Unnamed expense';
            if (amount <= 0) issues.push({ kind: 'expense', record: name, issue: 'Amount is zero or missing.', fix: 'Add the amount, or delete the entry if it was a mistake.', confidence: 'high' });
            if (!d) issues.push({ kind: 'expense', record: name, issue: 'No date.', fix: 'Add the date so it lands in the right month.', confidence: 'high' });
            else if (d > new Date(today.getTime() + 2 * h.fmt.DAY_MS)) issues.push({ kind: 'expense', record: name, issue: `Dated in the future (${fmtDate(d)}).`, fix: 'Check the date; future costs belong in the forecast, not the books.', confidence: 'medium' });
            const key = `${amount}|${String(e.date).slice(0, 10)}|${m.categoryKey(e)}`;
            if (amount > 0 && seen.has(key)) issues.push({ kind: 'expense', record: `${seen.get(key).description || 'Expense'} / ${name}`, issue: `Same amount, day and category (${h.fmt.ugx(amount)}).`, fix: 'If it was paid once, delete one of them.', confidence: 'medium' });
            else seen.set(key, e);
            const cat = m.categoryKey(e);
            if (cat === 'other' || cat === 'miscellaneous') { vague += 1; vagueTotal += amount; }
        });
        if (vague) issues.push({ kind: 'expense', record: plural(vague, 'expense'), issue: `${h.fmt.ugx(vagueTotal)} filed under Other or Miscellaneous.`, fix: 'Pick a clearer category so the spending charts mean more.', confidence: 'low' });

        const rank = { high: 0, medium: 1, low: 2 };
        return issues.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
    }

    function renderHealth(now) {
        const host = $('spHealthList');
        const h = H();
        if (!host || !h || !M()) return;
        const { el } = h.dom;
        host.replaceChildren();
        const issues = healthIssues(now);
        const records = (window.bookings || []).length + (window.expenses || []).length;
        const score = records ? Math.max(0, Math.round(100 - (issues.filter((i) => i.confidence !== 'low').length / records) * 100)) : 100;
        setText('spHealthScore', `${score}%`);
        const ring = $('spHealthRing');
        if (ring) ring.setAttribute('stroke-dasharray', `${score} 100`);
        $('spHealth')?.classList.toggle('is-clean', !issues.length);
        setText('spHealthSummary', issues.length
            ? `${plural(issues.length, 'thing')} to check across ${plural(records, 'record')}. Nothing is changed until you change it.`
            : `All ${plural(records, 'record')} look consistent.`);
        if (!issues.length) {
            host.appendChild(el('li', 'mv-empty', 'No problems found in bookings or expenses.'));
            return;
        }
        issues.slice(0, 30).forEach((item) => {
            const li = el('li', `sp-health__row is-${item.confidence}`);
            const icon = el('i', `ph ${item.kind === 'booking' ? 'ph-ticket' : 'ph-receipt'} sp-health__icon`);
            icon.setAttribute('aria-hidden', 'true');
            const body = el('div', 'sp-health__body');
            body.append(el('span', 'sp-health__record', item.record), el('span', 'sp-health__issue', item.issue), el('span', 'sp-health__fix', item.fix));
            const side = el('div', 'sp-health__side');
            side.appendChild(el('span', `sp-health__conf is-${item.confidence}`, item.confidence === 'high' ? 'Likely' : item.confidence === 'medium' ? 'Maybe' : 'Tidy-up'));
            if (item.kind === 'booking' && item.id !== undefined && item.id !== null) {
                const open = el('button', 'sp-health__open', 'Open');
                open.type = 'button';
                open.setAttribute('data-sp-open-booking', String(item.id));
                side.appendChild(open);
            }
            li.append(icon, body, side);
            host.appendChild(li);
        });
    }

    // ── Settings > Targets & alerts ───────────────────────────────────────
    const FIELDS = [
        ['spTargetMargin', 'marginFloor'],
        ['spTargetOverdue', 'overdueDays'],
        ['spTargetDrop', 'revenueDrop'],
        ['spTargetJump', 'spendJump'],
        ['spTargetRunway', 'runwayMonths'],
        ['spTargetBudget', 'budgetOver']
    ];

    function fillTargetsForm() {
        if (!$('spTargetsForm')) return;
        const t = targets();
        FIELDS.forEach(([id, key]) => { const input = $(id); if (input && document.activeElement !== input) input.value = String(t[key]); });
        const goal = Number(window.SPMoney?.getMonthlyGoal?.() || 0);
        const goalInput = $('spTargetGoal');
        if (goalInput && document.activeElement !== goalInput) goalInput.value = goal > 0 ? String(Math.round(goal)) : '';
        const min = M()?.readMinCash?.();
        const minInput = $('spTargetMinCash');
        if (minInput && document.activeElement !== minInput) minInput.value = min === null || min === undefined ? '' : String(min);
    }

    function submitTargets(event) {
        if (event.target?.id !== 'spTargetsForm') return;
        event.preventDefault();
        const next = targets();
        FIELDS.forEach(([id, key]) => {
            const value = Number(String($(id)?.value || '').trim());
            if (Number.isFinite(value) && value >= 0) next[key] = value;
        });
        const minRaw = String($('spTargetMinCash')?.value || '').trim();
        const min = Number(minRaw);
        const minCash = minRaw === '' || !Number.isFinite(min) || min < 0 ? null : Math.round(min);
        if (window.SPFinance) {
            if (window.SPFinance.updateSettings({ targets: next, minCash }) === null) return;
        } else {
            saveTargets(next);
            M()?.saveMinCash?.(minCash);
        }

        const goalRaw = String($('spTargetGoal')?.value || '').trim();
        const goal = goalRaw === '' ? 0 : Number(goalRaw);
        const current = Number(window.SPMoney?.getMonthlyGoal?.() || 0);
        const goalInput = $('monthlyGoalInput');
        if (Number.isFinite(goal) && goal >= 0 && Math.round(goal) !== Math.round(current) && goalInput && typeof window.saveMonthlyRevenueGoal === 'function') {
            goalInput.value = String(Math.round(goal));
            window.saveMonthlyRevenueGoal();
        } else if (typeof window.toastSuccess === 'function') {
            window.toastSuccess('Targets saved.');
        }
        refresh();
    }

    // ── Render ────────────────────────────────────────────────────────────
    function render() {
        if (!H() || !M()) return;
        const now = new Date();
        renderExpenses(now);
        renderHealth(now);
        fillTargetsForm();
    }

    function refresh() {
        render();
        window.SPMoneyPages?.render?.();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
    }

    document.addEventListener('submit', submitTargets);
    document.addEventListener('click', (event) => {
        if (event.target.closest?.('[data-sp-targets-reset]')) {
            saveTargets({ ...DEFAULT_TARGETS });
            fillTargetsForm();
            refresh();
            return;
        }
        const open = event.target.closest?.('[data-sp-open-booking]');
        if (open && typeof window.SPOpenBooking === 'function') window.SPOpenBooking(open.getAttribute('data-sp-open-booking'));
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    });

    window.SPInsights = { render, alerts, targets, healthIssues, expenseFlags, budgetFor, DEFAULT_TARGETS };
    const boot = () => { render(); if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard(); };
    if (document.readyState !== 'loading') boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();
