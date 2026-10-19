// Star Paper: booking payments, promoter / paid-to suggestions, monthly
// budgets and CSV import. Data lives in window.SPFinance (app.js) and is saved
// with the account; this file only draws the forms and checks what people type.
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const F = () => window.SPFinance || null;
    const pages = () => window.SPMoneyPages || null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function ugx(value) {
        return `UGX ${Math.round(Number(value) || 0).toLocaleString()}`;
    }

    function toast(kind, message) {
        const fn = window[kind === 'error' ? 'toastError' : kind === 'warn' ? 'toastWarn' : 'toastSuccess'];
        if (typeof fn === 'function') fn(message);
    }

    function today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function shortDate(iso) {
        const d = new Date(`${String(iso || '').slice(0, 10)}T00:00:00`);
        return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const METHOD_LABELS = { cash: 'Cash', mtn_momo: 'MTN MoMo', airtel_money: 'Airtel Money', bank: 'Bank', other: 'Other' };

    // ── Payments on the booking form ─────────────────────────────────────
    let paymentsBookingId = null;

    function findBooking(id) {
        return (window.bookings || []).find((entry) => String(entry.id) === String(id)) || null;
    }

    function renderPayments() {
        const panel = $('spBookingPayments');
        const booking = findBooking(paymentsBookingId);
        if (!panel || !booking || !F()) { if (panel) panel.hidden = true; return; }
        panel.hidden = false;
        const list = $('spPaymentsList');
        const payments = F().getPayments(booking.id).slice().sort((a, b) => String(a.paidOn).localeCompare(String(b.paidOn)));
        list.replaceChildren();
        const deposit = Math.round(Number(booking.deposit) || 0);
        if (deposit > 0) {
            const item = el('li', 'sp-payments__item sp-payments__item--deposit');
            item.append(el('span', 'sp-payments__when', 'Deposit'), el('span', 'sp-payments__via', METHOD_LABELS[booking.depositMethod] || 'Cash'), el('span', 'sp-payments__amt', ugx(deposit)));
            list.append(item);
        }
        payments.forEach((payment) => {
            const item = el('li', 'sp-payments__item');
            const via = [METHOD_LABELS[payment.method] || 'Other', payment.ref].filter(Boolean).join(' · ');
            item.append(el('span', 'sp-payments__when', shortDate(payment.paidOn)), el('span', 'sp-payments__via', via), el('span', 'sp-payments__amt', ugx(payment.amount)));
            if (F().canEdit()) {
                const remove = el('button', 'sp-payments__remove');
                remove.type = 'button';
                remove.setAttribute('aria-label', `Remove payment of ${ugx(payment.amount)}`);
                remove.setAttribute('data-sp-remove-payment', payment.id);
                remove.append(el('i', 'ph ph-x'));
                remove.firstChild.setAttribute('aria-hidden', 'true');
                item.append(remove);
            }
            list.append(item);
        });
        if (!deposit && !payments.length) list.append(el('li', 'sp-payments__empty', 'Nothing received yet.'));
        const paid = payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) || 0), 0);
        const open = Math.max(0, Math.round(Number(booking.fee) || 0) - deposit - paid);
        $('spPaymentsOpen').textContent = open > 0 ? `${ugx(open)} still open` : 'Paid in full';
        const form = $('spPaymentForm');
        form.hidden = open <= 0 || !F().canEdit();
        const amount = $('spPaymentAmount');
        amount.max = String(open);
        if (!amount.value) amount.placeholder = String(open);
        if (!$('spPaymentDate').value) $('spPaymentDate').value = today();
    }

    function showPayments(bookingId) {
        paymentsBookingId = bookingId;
        const amount = $('spPaymentAmount');
        if (amount) amount.value = '';
        const ref = $('spPaymentRef');
        if (ref) ref.value = '';
        const date = $('spPaymentDate');
        if (date) date.value = today();
        renderPayments();
    }

    function hidePayments() {
        paymentsBookingId = null;
        const panel = $('spBookingPayments');
        if (panel) panel.hidden = true;
    }

    // The booking form's balance box shows what's still open after payments.
    function syncBalanceField(booking) {
        const field = $('bookingBalance');
        if (field && booking) field.value = String(Math.max(0, Math.round(Number(booking.balance) || 0)));
    }

    async function submitPayment(event) {
        event.preventDefault();
        const booking = findBooking(paymentsBookingId);
        if (!booking || !F()) return;
        const button = event.target.querySelector('button[type="submit"]');
        const amount = Math.round(Number(String($('spPaymentAmount').value || '').replace(/[^\d.]/g, '')) || 0);
        try {
            if (button) button.disabled = true;
            await F().recordPayment(booking.id, {
                amount,
                paidOn: $('spPaymentDate').value || today(),
                method: $('spPaymentMethod').value,
                ref: $('spPaymentRef').value
            });
            $('spPaymentAmount').value = '';
            $('spPaymentRef').value = '';
            syncBalanceField(findBooking(booking.id));
            renderPayments();
            toast('success', `Recorded ${ugx(amount)} for "${booking.event}".`);
        } catch (err) {
            toast('error', err?.message || 'Could not record that payment.');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function removePayment(id) {
        if (!F()) return;
        try {
            await F().removePayment(id);
            syncBalanceField(findBooking(paymentsBookingId));
            renderPayments();
            toast('success', 'Payment removed.');
        } catch (err) {
            toast('error', err?.message || 'Could not remove that payment.');
        }
    }

    // ── Suggestions for promoter and paid-to, show picker on expenses ────
    function fillDatalist(id, values) {
        const list = $(id);
        if (!list) return;
        const unique = Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        list.replaceChildren(...unique.slice(0, 60).map((value) => { const option = el('option'); option.value = value; return option; }));
    }

    function fillExpenseBookingOptions(selected) {
        const select = $('expenseBooking');
        if (!select) return;
        const keep = selected !== undefined ? String(selected || '') : select.value;
        const cutoff = Date.now() - 400 * 86400000;
        const shows = (window.bookings || [])
            .filter((b) => b && b.id && String(b.status || '').toLowerCase() !== 'cancelled')
            .filter((b) => { const t = Date.parse(b.date); return Number.isNaN(t) || t >= cutoff || String(b.id) === keep; })
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const first = el('option', null, 'Not tied to a show');
        first.value = '';
        const options = shows.map((b) => {
            const option = el('option', null, `${shortDate(b.date)} · ${b.event}${b.artist ? ` (${b.artist})` : ''}`);
            option.value = String(b.id);
            return option;
        });
        select.replaceChildren(first, ...options);
        select.value = options.some((o) => o.value === keep) ? keep : '';
    }

    document.addEventListener('focusin', (event) => {
        const id = event.target?.id;
        if (id === 'bookingPromoter') fillDatalist('bookingPromoterList', (window.bookings || []).map((b) => b.promoter));
        if (id === 'expensePaidTo') fillDatalist('expensePaidToList', (window.expenses || []).map((e) => e.paidTo));
        if (id === 'expenseBooking') fillExpenseBookingOptions();
    });
    document.addEventListener('pointerdown', (event) => {
        if (event.target?.id === 'expenseBooking') fillExpenseBookingOptions();
    });

    // ── Settings › Monthly budgets ───────────────────────────────────────
    const BUDGET_CATEGORIES = ['transport', 'accommodation', 'equipment', 'costumes', 'food', 'salary', 'marketing', 'supplies', 'miscellaneous', 'other'];

    function usualSpend(category) {
        // Average of the last three full months, as a starting suggestion.
        const now = new Date();
        let total = 0;
        for (let back = 1; back <= 3; back += 1) {
            const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
            (window.expenses || []).forEach((entry) => {
                const d = new Date(`${String(entry.date || '').slice(0, 10)}T00:00:00`);
                if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) return;
                if (String(entry.category || 'other').toLowerCase() !== category) return;
                total += Math.round(Number(entry.amount) || 0);
            });
        }
        return Math.round(total / 3);
    }

    function renderBudgets() {
        const grid = $('spBudgetsGrid');
        if (!grid || !F()) return;
        if (grid.contains(document.activeElement)) return;
        const label = pages()?.categoryLabel || ((k) => k);
        let total = 0;
        const rows = BUDGET_CATEGORIES.map((category) => {
            const budget = F().getBudget(category, 'default');
            total += budget || 0;
            const usual = usualSpend(category);
            const row = el('label', 'sp-budget');
            const name = el('span', 'sp-budget__name', label(category));
            const hint = el('span', 'sp-budget__hint', usual > 0 ? `Usually ${ugx(usual)}` : 'No recent spending');
            const field = el('span', 'sp-target__field');
            const input = el('input');
            input.type = 'number';
            input.min = '0';
            input.step = '10000';
            input.inputMode = 'numeric';
            input.placeholder = 'No budget';
            input.value = budget ? String(budget) : '';
            input.setAttribute('data-sp-budget', category);
            input.disabled = !F().canEdit();
            field.append(el('span', 'sp-target__unit', 'UGX'), input);
            row.append(name, hint, field);
            return row;
        });
        grid.replaceChildren(...rows);
        $('spBudgetsTotal').textContent = total > 0 ? `${ugx(total)} a month in all` : '';
    }

    function submitBudgets(event) {
        event.preventDefault();
        if (!F()) return;
        const entries = Array.from(document.querySelectorAll('[data-sp-budget]')).map((input) => {
            const raw = String(input.value || '').trim();
            const amount = raw === '' ? 0 : Number(raw);
            return { category: input.getAttribute('data-sp-budget'), period: 'default', amount: Number.isFinite(amount) && amount > 0 ? amount : 0 };
        });
        const pending = F().setBudgets(entries);
        if (pending === null) return;
        document.activeElement?.blur?.();
        renderBudgets();
        refreshMoney();
        toast('success', 'Budgets saved.');
    }

    // ── Settings › Import from a spreadsheet ─────────────────────────────
    // RFC 4180-style parser: quoted fields, doubled quotes, commas or
    // semicolons, CRLF or LF.
    function parseCsv(text) {
        const source = String(text || '').replace(/^﻿/, '');
        const firstLine = source.split(/\r?\n/, 1)[0] || '';
        const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;
        for (let i = 0; i < source.length; i += 1) {
            const ch = source[i];
            if (quoted) {
                if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
                else if (ch === '"') quoted = false;
                else field += ch;
            } else if (ch === '"') {
                quoted = true;
            } else if (ch === sep) {
                row.push(field); field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && source[i + 1] === '\n') i += 1;
                row.push(field); field = '';
                if (row.some((cell) => cell.trim() !== '')) rows.push(row);
                row = [];
            } else {
                field += ch;
            }
        }
        row.push(field);
        if (row.some((cell) => cell.trim() !== '')) rows.push(row);
        return rows;
    }

    const COLUMNS = {
        bookings: {
            event: ['event', 'show', 'show name', 'gig', 'title'],
            artist: ['artist', 'act', 'performer'],
            date: ['date', 'show date', 'event date'],
            fee: ['fee', 'total fee', 'amount', 'price'],
            deposit: ['deposit', 'deposit paid', 'paid'],
            status: ['status'],
            location: ['location', 'venue', 'district', 'city', 'country'],
            promoter: ['promoter', 'client', 'customer', 'organiser', 'organizer'],
            contact: ['contact', 'contact person', 'phone'],
            capacity: ['capacity', 'attendance'],
            notes: ['notes', 'note', 'comments']
        },
        expenses: {
            description: ['description', 'item', 'details', 'expense', 'name'],
            amount: ['amount', 'cost', 'total', 'price'],
            date: ['date', 'paid on', 'spent on'],
            category: ['category', 'type'],
            artist: ['artist', 'act'],
            paidTo: ['paid to', 'vendor', 'supplier', 'payee']
        }
    };
    const REQUIRED = { bookings: ['event', 'artist', 'date', 'fee'], expenses: ['description', 'amount', 'date'] };

    function normaliseHeader(value) {
        return String(value || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s*\(.*\)\s*$/, '').replace(/\s+/g, ' ');
    }

    function parseAmount(value) {
        const cleaned = String(value || '').replace(/ugx|shs?|\/=|,|\s/gi, '');
        if (cleaned === '') return 0;
        const number = Number(cleaned);
        return Number.isFinite(number) ? Math.round(number) : NaN;
    }

    // Accepts 2026-10-19, 19/10/2026, 19-10-2026, 19.10.2026 (day first, as
    // the app shows dates) and Excel serial numbers.
    function parseDateCell(value) {
        const raw = String(value || '').trim();
        let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        let y; let mo; let d;
        if (m) { [, y, mo, d] = m.map(Number); }
        else if ((m = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) {
            d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
            if (y < 100) y += 2000;
        } else if (/^\d{5}$/.test(raw)) {
            const date = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);
            y = date.getUTCFullYear(); mo = date.getUTCMonth() + 1; d = date.getUTCDate();
        } else {
            const parsed = new Date(raw);
            if (Number.isNaN(parsed.getTime())) return null;
            y = parsed.getFullYear(); mo = parsed.getMonth() + 1; d = parsed.getDate();
        }
        const check = new Date(y, mo - 1, d);
        if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const KNOWN_CATEGORIES = new Set(BUDGET_CATEGORIES);
    const CATEGORY_ALIASES = { food: ['food & beverages', 'food & drinks', 'food and drinks', 'meals', 'drinks'], salary: ['salaries', 'wages', 'pay'], miscellaneous: ['misc'], transport: ['travel', 'fuel', 'transportation'], accommodation: ['hotel', 'lodging'], equipment: ['sound', 'gear'] };

    function parseCategory(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return 'other';
        if (KNOWN_CATEGORIES.has(raw)) return raw;
        const hit = Object.entries(CATEGORY_ALIASES).find(([, names]) => names.includes(raw));
        return hit ? hit[0] : 'other';
    }

    let importPlan = null;

    function buildImportPlan(kind, rows) {
        if (rows.length < 2) return { error: 'The file needs a header row and at least one record.' };
        const headers = rows[0].map(normaliseHeader);
        const map = {};
        Object.entries(COLUMNS[kind]).forEach(([key, names]) => {
            const index = headers.findIndex((h) => names.includes(h));
            if (index >= 0) map[key] = index;
        });
        const missing = REQUIRED[kind].filter((key) => map[key] === undefined);
        if (missing.length) return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Found: ${rows[0].filter(Boolean).join(', ') || 'none'}.` };
        const records = [];
        const problems = [];
        const existing = new Set(kind === 'bookings'
            ? (window.bookings || []).map((b) => `${String(b.event).toLowerCase()}|${String(b.artist).toLowerCase()}|${b.date}`)
            : (window.expenses || []).map((e) => `${String(e.description).toLowerCase()}|${Math.round(Number(e.amount) || 0)}|${e.date}`));
        let duplicates = 0;
        rows.slice(1).forEach((cells, i) => {
            const line = i + 2;
            const get = (key) => (map[key] === undefined ? '' : String(cells[map[key]] || '').trim());
            const date = parseDateCell(get('date'));
            if (!date) { problems.push(`Row ${line}: date "${get('date')}" not understood`); return; }
            if (kind === 'bookings') {
                const fee = parseAmount(get('fee'));
                const deposit = parseAmount(get('deposit'));
                if (!get('event') || !get('artist')) { problems.push(`Row ${line}: needs an event and an artist`); return; }
                if (!Number.isFinite(fee) || fee <= 0) { problems.push(`Row ${line}: fee "${get('fee')}" is not an amount`); return; }
                if (!Number.isFinite(deposit) || deposit < 0) { problems.push(`Row ${line}: deposit "${get('deposit')}" is not an amount`); return; }
                const status = get('status').toLowerCase();
                const record = {
                    event: get('event'), artist: get('artist'), date, fee, deposit: Math.min(deposit, fee),
                    status: ['confirmed', 'pending', 'cancelled'].includes(status) ? status : 'confirmed',
                    location: get('location'), promoter: get('promoter'), contact: get('contact'),
                    capacity: parseAmount(get('capacity')) || 0, notes: get('notes')
                };
                const key = `${record.event.toLowerCase()}|${record.artist.toLowerCase()}|${date}`;
                if (existing.has(key)) { duplicates += 1; return; }
                existing.add(key);
                records.push(record);
            } else {
                const amount = parseAmount(get('amount'));
                if (!get('description')) { problems.push(`Row ${line}: needs a description`); return; }
                if (!Number.isFinite(amount) || amount <= 0) { problems.push(`Row ${line}: amount "${get('amount')}" is not an amount`); return; }
                const record = { description: get('description'), amount, date, category: parseCategory(get('category')), artist: get('artist'), paidTo: get('paidTo') };
                const key = `${record.description.toLowerCase()}|${amount}|${date}`;
                if (existing.has(key)) { duplicates += 1; return; }
                existing.add(key);
                records.push(record);
            }
        });
        return { kind, records, problems, duplicates };
    }

    function renderImportPreview() {
        const preview = $('spImportPreview');
        const go = $('spImportGo');
        const reset = $('spImportReset');
        preview.replaceChildren();
        if (!importPlan) { preview.hidden = true; go.disabled = true; reset.hidden = true; return; }
        preview.hidden = false;
        reset.hidden = false;
        if (importPlan.error) {
            preview.append(el('p', 'sp-import__error', importPlan.error));
            go.disabled = true;
            return;
        }
        const { kind, records, problems, duplicates } = importPlan;
        const noun = kind === 'bookings' ? 'booking' : 'expense';
        const total = records.reduce((sum, r) => sum + (kind === 'bookings' ? r.fee : r.amount), 0);
        preview.append(el('p', 'sp-import__summary', records.length
            ? `${records.length} ${noun}${records.length === 1 ? '' : 's'} ready, ${ugx(total)} in all.`
            : `No new ${noun}s to add.`));
        if (duplicates) preview.append(el('p', 'sp-import__note', `${duplicates} already in Star Paper and will be skipped.`));
        if (records.length) {
            const table = el('table', 'sp-import__table');
            const head = el('tr');
            const cols = kind === 'bookings' ? [['date', 'Date'], ['event', 'Event'], ['artist', 'Artist'], ['fee', 'Fee'], ['status', 'Status']] : [['date', 'Date'], ['description', 'Description'], ['category', 'Category'], ['amount', 'Amount']];
            cols.forEach(([, label]) => head.append(el('th', null, label)));
            const thead = el('thead');
            thead.append(head);
            const tbody = el('tbody');
            records.slice(0, 5).forEach((record) => {
                const tr = el('tr');
                cols.forEach(([key]) => tr.append(el('td', null, key === 'fee' || key === 'amount' ? ugx(record[key]) : key === 'date' ? shortDate(record[key]) : key === 'category' ? (pages()?.categoryLabel?.(record[key]) || record[key]) : record[key])));
                tbody.append(tr);
            });
            table.append(thead, tbody);
            preview.append(table);
            if (records.length > 5) preview.append(el('p', 'sp-import__note', `…and ${records.length - 5} more.`));
        }
        if (problems.length) {
            preview.append(el('p', 'sp-import__error', `${problems.length} row${problems.length === 1 ? '' : 's'} will be skipped:`));
            const list = el('ul', 'sp-import__problems');
            problems.slice(0, 6).forEach((text) => list.append(el('li', null, text)));
            if (problems.length > 6) list.append(el('li', null, `…and ${problems.length - 6} more.`));
            preview.append(list);
        }
        go.disabled = records.length === 0;
        go.textContent = records.length ? `Import ${records.length} ${noun}${records.length === 1 ? '' : 's'}` : 'Import';
    }

    function importHint() {
        const kind = $('spImportKind')?.value || 'bookings';
        const hint = $('spImportHint');
        if (!hint) return;
        hint.textContent = kind === 'bookings'
            ? 'Needs columns Event, Artist, Date and Fee. Optional: Deposit, Status, Location, Promoter, Contact, Capacity, Notes. Dates like 19/10/2026 are read day first.'
            : 'Needs columns Description, Amount and Date. Optional: Category, Artist, Paid to. Unknown categories become Other.';
    }

    function readImportFile() {
        const file = $('spImportFile')?.files?.[0];
        const kind = $('spImportKind')?.value || 'bookings';
        if (!file) { importPlan = null; renderImportPreview(); return; }
        if (file.size > 2 * 1024 * 1024) { importPlan = { error: 'That file is over 2 MB. Split it into smaller files.' }; renderImportPreview(); return; }
        const reader = new FileReader();
        reader.onload = () => { importPlan = buildImportPlan(kind, parseCsv(reader.result)); renderImportPreview(); };
        reader.onerror = () => { importPlan = { error: 'Could not read that file.' }; renderImportPreview(); };
        reader.readAsText(file);
    }

    function resetImport() {
        importPlan = null;
        const file = $('spImportFile');
        if (file) file.value = '';
        renderImportPreview();
    }

    async function submitImport(event) {
        event.preventDefault();
        if (!importPlan || importPlan.error || !importPlan.records.length || !F()) return;
        const { kind, records } = importPlan;
        const go = $('spImportGo');
        go.disabled = true;
        try {
            const result = await F().importRecords(kind === 'bookings' ? { bookings: records } : { expenses: records });
            if (result === null) { go.disabled = false; return; }
            toast('success', `Imported ${records.length} ${kind === 'bookings' ? 'booking' : 'expense'}${records.length === 1 ? '' : 's'}.`);
            resetImport();
        } catch (err) {
            go.disabled = false;
            toast('error', err?.message || 'Import failed. Nothing was added.');
        }
    }

    // ── Wiring ───────────────────────────────────────────────────────────
    function refreshMoney() {
        window.SPInsights?.render?.();
        window.SPMoneyPages?.render?.();
        if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
    }

    document.addEventListener('submit', (event) => {
        const id = event.target?.id;
        if (id === 'spPaymentForm') submitPayment(event);
        else if (id === 'spBudgetsForm') submitBudgets(event);
        else if (id === 'spImportForm') submitImport(event);
    });
    document.addEventListener('change', (event) => {
        const id = event.target?.id;
        if (id === 'spImportFile') readImportFile();
        else if (id === 'spImportKind') { importHint(); if ($('spImportFile')?.files?.length) readImportFile(); }
    });
    document.addEventListener('click', (event) => {
        const remove = event.target.closest?.('[data-sp-remove-payment]');
        if (remove) { removePayment(remove.getAttribute('data-sp-remove-payment')); return; }
        if (event.target.closest?.('#spImportReset')) resetImport();
    });

    function render() {
        renderBudgets();
        importHint();
        if (paymentsBookingId) renderPayments();
    }

    window.SPFinanceUI = { render, showPayments, hidePayments, fillExpenseBookingOptions, parseCsv, buildImportPlan, parseDateCell };
    if (document.readyState !== 'loading') render();
    else document.addEventListener('DOMContentLoaded', render);
})();
