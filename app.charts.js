/**
 * Star Paper - shared chart pieces for Home, Money and the insight panels:
 * smooth lines, soft gradient areas, glowing end points, rounded bars,
 * donuts and one hover tooltip. SVG and DOM nodes only: no innerHTML.
 * Colours come from spc-* classes so both themes follow the design tokens.
 */
(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    let uidSeq = 0;

    function svg(tag, attrs, text) {
        const node = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
        if (text !== undefined) node.textContent = String(text);
        return node;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    const f = (n) => (Math.round(n * 10) / 10).toString();

    // Monotone cubic (Fritsch-Carlson): smooth, and never overshoots the data,
    // so a curve can't dip below zero between two zero months.
    function smoothPath(pts) {
        const n = pts.length;
        if (!n) return '';
        if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`;
        if (n === 2) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[1][0])} ${f(pts[1][1])}`;
        const dx = [];
        const m = [];
        for (let i = 0; i < n - 1; i += 1) {
            dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
            m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
        }
        const t = [m[0]];
        for (let i = 1; i < n - 1; i += 1) {
            if (m[i - 1] * m[i] <= 0) t[i] = 0;
            else t[i] = (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
        }
        t[n - 1] = m[n - 2];
        let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
        for (let i = 0; i < n - 1; i += 1) {
            const h = dx[i] / 3;
            d += ` C${f(pts[i][0] + h)} ${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)} ${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
        }
        return d;
    }

    // A bar with rounded top corners only (bottom corners sit on the axis).
    // Negative bars hang down from the axis and round at the bottom instead.
    function barPath(x, yTop, w, h, r = 6, down = false) {
        if (h <= 0 || w <= 0) return '';
        const rr = Math.max(0, Math.min(r, w / 2, h));
        if (down) {
            const yb = yTop + h;
            return `M${f(x)} ${f(yTop)} H${f(x + w)} V${f(yb - rr)} Q${f(x + w)} ${f(yb)} ${f(x + w - rr)} ${f(yb)} H${f(x + rr)} Q${f(x)} ${f(yb)} ${f(x)} ${f(yb - rr)} Z`;
        }
        const yb = yTop + h;
        return `M${f(x)} ${f(yb)} V${f(yTop + rr)} Q${f(x)} ${f(yTop)} ${f(x + rr)} ${f(yTop)} H${f(x + w - rr)} Q${f(x + w)} ${f(yTop)} ${f(x + w)} ${f(yTop + rr)} V${f(yb)} Z`;
    }

    // kind: area-gold | area-sage | area-in | area-out | bar-gold | bar-sage | bar-in | bar-out
    function gradient(root, kind, horizontal = false) {
        let defs = root.querySelector(':scope > defs');
        if (!defs) {
            defs = svg('defs');
            root.insertBefore(defs, root.firstChild);
        }
        const [type, tone] = kind.split('-');
        const id = `spc-${kind}-${(uidSeq += 1)}`;
        const grad = svg('linearGradient', horizontal
            ? { id, x1: 0, y1: 0, x2: 1, y2: 0, class: `spc-grad spc-grad--${type} spc-tone--${tone}` }
            : { id, x1: 0, y1: 0, x2: 0, y2: 1, class: `spc-grad spc-grad--${type} spc-tone--${tone}` });
        grad.append(svg('stop', { offset: '0%', class: 'spc-s0' }), svg('stop', { offset: '100%', class: 'spc-s1' }));
        defs.appendChild(grad);
        return `url(#${id})`;
    }

    // Chart width in px, so text and dots keep their size on any screen.
    function sizeOf(node, fallbackW, fallbackH) {
        const W = Math.max(60, Math.round(node.clientWidth || node.parentElement?.clientWidth || fallbackW));
        const H = Math.max(20, Math.round(node.clientHeight || fallbackH));
        return { W, H };
    }

    // A rounded label: "9.9M" above the last point, Vezaro style.
    function pill(root, x, y, text, { tone = 'gold', W = Infinity, below = false } = {}) {
        const w = Math.round(String(text).length * 6.8 + 16);
        const h = 20;
        const px = Math.max(1, Math.min(x - w / 2, W - w - 1));
        const py = below ? y + 10 : Math.max(1, y - h - 10);
        const g = svg('g', { class: `spc-pill spc-tone--${tone}` });
        g.append(
            svg('rect', { x: px, y: py, width: w, height: h, rx: 7, class: 'spc-pill__bg' }),
            svg('text', { x: px + w / 2, y: py + 14, 'text-anchor': 'middle', class: 'spc-pill__text' }, text)
        );
        root.appendChild(g);
        return g;
    }

    function endDot(root, x, y, tone = 'gold') {
        root.append(
            svg('circle', { cx: x, cy: y, r: 8, class: `spc-halo spc-tone--${tone}` }),
            svg('circle', { cx: x, cy: y, r: 4, class: `spc-dot spc-tone--${tone}` })
        );
    }

    // ── Tooltip ───────────────────────────────────────────────────────────
    let tipNode = null;

    function tip() {
        if (!tipNode || !tipNode.isConnected) {
            tipNode = el('div', 'spc-tip');
            tipNode.setAttribute('role', 'status');
            tipNode.setAttribute('aria-live', 'polite');
            tipNode.hidden = true;
            document.body.appendChild(tipNode);
        }
        return tipNode;
    }

    function showTip(clientX, clientY, title, rows, note) {
        const node = tip();
        node.replaceChildren();
        if (title) node.appendChild(el('p', 'spc-tip__title', title));
        (rows || []).forEach((row) => {
            const line = el('p', 'spc-tip__row');
            const sw = el('span', `spc-tip__sw spc-tone--${row.tone || 'ink'}`);
            sw.setAttribute('aria-hidden', 'true');
            line.append(sw, el('span', 'spc-tip__label', row.label), el('span', `spc-tip__value money${row.state ? ` is-${row.state}` : ''}`, row.value));
            node.appendChild(line);
        });
        if (note) node.appendChild(el('p', 'spc-tip__note', note));
        node.hidden = false;
        const flip = clientX > window.innerWidth - 240;
        node.classList.toggle('is-left', flip);
        node.style.setProperty('--tip-x', `${Math.round(clientX)}px`);
        node.style.setProperty('--tip-y', `${Math.round(clientY)}px`);
    }

    function hideTip() {
        if (tipNode) tipNode.hidden = true;
    }

    window.addEventListener('scroll', hideTip, { passive: true, capture: true });

    // Columns: [{ x0, x1, cx, title, rows, note, node }] in the chart's own
    // units (viewBox width == the chart's px width). Hover or tap a column to
    // see its numbers; a guide line marks it.
    function bindColumns(root, columns, { top = 0, bottom = 0, W } = {}) {
        if (!root) return;
        const guide = svg('line', { x1: 0, x2: 0, y1: top, y2: bottom, class: 'spc-guide' });
        root.appendChild(guide);
        root.__spcCols = { columns, guide, W };
        if (root.__spcBound) return;
        root.__spcBound = true;
        const move = (event) => {
            const state = root.__spcCols;
            if (!state || !state.columns.length) return;
            const rect = root.getBoundingClientRect();
            if (!rect.width) return;
            const x = ((event.clientX - rect.left) / rect.width) * state.W;
            const col = state.columns.find((c) => x >= c.x0 && x < c.x1);
            root.querySelectorAll('.is-hot').forEach((n) => n.classList.remove('is-hot'));
            if (!col) { hideTip(); state.guide.classList.remove('is-on'); return; }
            col.node?.classList.add('is-hot');
            state.guide.setAttribute('x1', col.cx);
            state.guide.setAttribute('x2', col.cx);
            state.guide.classList.add('is-on');
            showTip(event.clientX, event.clientY, col.title, col.rows, col.note);
        };
        const leave = () => {
            hideTip();
            root.__spcCols?.guide.classList.remove('is-on');
            root.querySelectorAll('.is-hot').forEach((n) => n.classList.remove('is-hot'));
        };
        root.addEventListener('pointermove', move);
        root.addEventListener('pointerdown', move);
        root.addEventListener('pointerleave', leave);
        root.addEventListener('pointercancel', leave);
    }

    // Single items (donut segments, legend rows): hover shows their numbers.
    function bindItem(node, title, rows, note) {
        node.addEventListener('pointerenter', (event) => showTip(event.clientX, event.clientY, title, rows, note));
        node.addEventListener('pointermove', (event) => showTip(event.clientX, event.clientY, title, rows, note));
        node.addEventListener('pointerleave', hideTip);
    }

    // ── Spark: smooth line, soft area, glowing last point, optional pill ────
    function spark(node, values, { area = true, label = '', tone = 'gold', zero = false } = {}) {
        if (!node) return;
        node.replaceChildren();
        const { W, H } = sizeOf(node, 120, 32);
        node.setAttribute('viewBox', `0 0 ${W} ${H}`);
        node.setAttribute('preserveAspectRatio', 'none');
        if (!values.length || values.every((v) => v === 0)) {
            node.appendChild(svg('line', { x1: 0, x2: W, y1: H - 3, y2: H - 3, class: 'spc-flat' }));
            return;
        }
        const padTop = label ? 32 : 8;
        const padBottom = 4;
        const padX = 8;
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (zero) min = Math.min(0, min);
        if (max === min) { max += 1; min -= 1; }
        const pts = values.map((v, i) => [
            values.length === 1 ? W / 2 : padX + (i / (values.length - 1)) * (W - padX * 2),
            padTop + (1 - (v - min) / (max - min)) * (H - padTop - padBottom)
        ]);
        const line = smoothPath(pts);
        const [lx, ly] = pts[pts.length - 1];
        if (area) {
            node.appendChild(svg('path', { d: `${line} L${f(lx)} ${H} L${f(pts[0][0])} ${H} Z`, fill: gradient(node, `area-${tone}`), class: 'spc-area' }));
        }
        node.appendChild(svg('path', { d: line, class: `spc-line spc-tone--${tone}` }));
        endDot(node, lx, ly, tone);
        if (label) pill(node, lx, ly, label, { tone, W });
    }

    // ── Line chart: smooth series with gradient areas, axis, tooltip ────────
    // series: [{ name, values, tone, area, dashed }]; labels: x labels;
    // titles: tooltip title per point; fmt: value formatter; axisFmt: axis.
    function lineChart(node, { labels, titles, series, fmt, axisFmt, endLabel } = {}) {
        if (!node) return;
        node.replaceChildren();
        const { W } = sizeOf(node, 640, 240);
        const narrow = W < 480;
        const H = narrow ? 210 : 250;
        node.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const left = 46;
        const right = 14;
        const top = 30;
        const bottom = 26;
        const plotW = W - left - right;
        const plotH = H - top - bottom;
        const all = series.flatMap((s) => s.values);
        const max = Math.max(1, ...all) * 1.08;
        const min = Math.min(0, ...all);
        const y = (v) => top + (1 - (v - min) / (max - min)) * plotH;
        const n = labels.length;
        const x = (i) => (n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);

        [max / 1.08, max / 2.16, 0, min < 0 ? min : null].filter((v) => v !== null).forEach((v) => {
            node.appendChild(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: v === 0 ? 'spc-zero' : 'spc-grid' }));
            node.appendChild(svg('text', { x: left - 8, y: y(v) + 4, class: 'spc-axis', 'text-anchor': 'end' }, axisFmt(v)));
        });
        labels.forEach((label, i) => {
            if (narrow && n > 7 && i % 2 === 1 && i !== n - 1) return;
            node.appendChild(svg('text', { x: x(i), y: H - 7, class: 'spc-axis', 'text-anchor': 'middle' }, label));
        });

        series.forEach((s) => {
            const pts = s.values.map((v, i) => [x(i), y(v)]);
            const line = smoothPath(pts);
            if (s.area) {
                node.appendChild(svg('path', { d: `${line} L${f(pts[n - 1][0])} ${f(y(Math.max(0, min)))} L${f(pts[0][0])} ${f(y(Math.max(0, min)))} Z`, fill: gradient(node, `area-${s.tone}`), class: 'spc-area' }));
            }
            node.appendChild(svg('path', { d: line, class: `spc-line spc-tone--${s.tone}${s.dashed ? ' spc-line--dashed' : ''}${s.thin ? ' spc-line--thin' : ''}` }));
        });
        const lead = series[0];
        const lastY = y(lead.values[n - 1]);
        endDot(node, x(n - 1), lastY, lead.tone);
        if (endLabel) pill(node, x(n - 1), lastY, endLabel, { tone: lead.tone, W });

        const half = n > 1 ? plotW / (n - 1) / 2 : plotW / 2;
        const columns = labels.map((label, i) => ({
            x0: x(i) - half,
            x1: x(i) + half,
            cx: x(i),
            title: titles ? titles[i] : label,
            rows: series.filter((s) => !s.hideTip).map((s) => ({ label: s.name, value: fmt(s.values[i]), tone: s.tone }))
        }));
        bindColumns(node, columns, { top, bottom: H - bottom, W });
    }

    // ── Donut: rounded segments, centre total, % legend, hover numbers ───────
    // rows: [{ name, amount, sub }]
    function donut(host, rows, { centre, centreSub, fmt, empty, size = 140, legend: showLegend = true } = {}) {
        if (!host) return;
        host.replaceChildren();
        host.classList.add('spc-donut');
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        host.classList.toggle('is-empty', !total);
        if (!total) {
            host.appendChild(el('p', 'hv2-empty', empty || 'Nothing to show yet.'));
            return;
        }
        const ring = svg('svg', { viewBox: '0 0 120 120', class: 'spc-donut__ring', 'aria-hidden': 'true', focusable: 'false' });
        ring.appendChild(svg('circle', { cx: 60, cy: 60, r: 46, class: 'spc-donut__track' }));
        const gap = rows.length > 1 ? 3.2 : 0;
        let offset = 0;
        const segs = [];
        rows.forEach((row, i) => {
            const share = (row.amount / total) * 100;
            const seg = svg('circle', {
                cx: 60, cy: 60, r: 46, pathLength: 100,
                class: `spc-donut__seg spc-c${(i % 6) + 1}`,
                'stroke-dasharray': `${Math.max(0.01, share - gap).toFixed(2)} 100`,
                'stroke-dashoffset': (-(offset + gap / 2)).toFixed(2)
            });
            ring.appendChild(seg);
            segs.push(seg);
            offset += share;
        });
        const centreNode = el('div', 'spc-donut__centre');
        centreNode.append(el('span', 'spc-donut__total money', centre ?? fmt(total)), el('span', 'spc-donut__sub', centreSub || ''));
        const figure = el('div', 'spc-donut__figure');
        figure.style.setProperty('--size', `${size}px`);
        figure.append(ring, centreNode);

        const legend = el('ul', 'spc-donut__legend');
        rows.forEach((row, i) => {
            const pct = Math.round((row.amount / total) * 100);
            const li = el('li', 'spc-donut__item');
            const swatch = el('span', `spc-donut__swatch spc-c${(i % 6) + 1}`);
            swatch.setAttribute('aria-hidden', 'true');
            li.append(swatch, el('span', 'spc-donut__name', row.name), el('span', 'spc-donut__pct', `${pct}%`), el('span', 'spc-donut__amt money', row.sub || fmt(row.amount)));
            legend.appendChild(li);
            const rowsTip = [{ label: 'Amount', value: fmt(row.amount), tone: `c${(i % 6) + 1}` }, { label: 'Share', value: `${pct}%`, tone: 'ink' }];
            const hot = (on) => { segs[i].classList.toggle('is-hot', on); li.classList.toggle('is-hot', on); host.classList.toggle('has-hot', on); };
            [segs[i], li].forEach((node) => {
                bindItem(node, row.name, rowsTip, row.note);
                node.addEventListener('pointerenter', () => hot(true));
                node.addEventListener('pointerleave', () => hot(false));
            });
        });
        host.append(figure);
        if (showLegend) host.appendChild(legend);
        else host.classList.add('is-solo');
    }

    window.SPCharts = { svg, el, smoothPath, barPath, gradient, sizeOf, pill, endDot, bindColumns, bindItem, showTip, hideTip, spark, lineChart, donut };
})();
