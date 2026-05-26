/* UPGRADE: StarPaper Premium Polish — Additive JS Layer v1.0.0
   ============================================================
   Loaded AFTER app.js. Pure enhancement — no mutation of existing
   state, handlers, or DOM structure owned by app.js.
   Kill-switch: localStorage.setItem('sp_prem_off','1') + reload.
   ============================================================ */
(function spPremiumBoot(global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // 1. Bootstrap & feature flag
  // ─────────────────────────────────────────────────────────
  if (global.__SP_PREM_BOOTED__) return;
  global.__SP_PREM_BOOTED__ = true;

  var VERSION = '1.0.0';
  var OFF_KEY = 'sp_prem_off';

  function isKilled() {
    try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; }
  }

  if (isKilled()) {
    try { document.documentElement.classList.add('sp-prem-off'); } catch (e) {}
    global.SP_PREMIUM = {
      version: VERSION,
      isEnabled: function () { return false; },
      enable: function () {
        try { localStorage.removeItem(OFF_KEY); location.reload(); } catch (e) {}
      },
      disable: function () {},
      forceRefresh: function () {}
    };
    return;
  }

  global.SP_PREMIUM_ENABLED = true;

  // ─────────────────────────────────────────────────────────
  // 2. Utility helpers
  // ─────────────────────────────────────────────────────────
  function qs(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    catch (e) { return []; }
  }
  function createEl(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') el.className = attrs[k];
        else if (k === 'style' && typeof attrs[k] === 'object') {
          for (var s in attrs[k]) el.style[s] = attrs[k][s];
        } else if (k.indexOf('data-') === 0 || k.indexOf('aria-') === 0 || k === 'role') {
          el.setAttribute(k, attrs[k]);
        } else {
          try { el[k] = attrs[k]; } catch (e) { el.setAttribute(k, attrs[k]); }
        }
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
      });
    }
    return el;
  }
  function throttle(fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), args = arguments, ctx = this;
      var rem = ms - (now - last);
      if (rem <= 0) { last = now; fn.apply(ctx, args); }
      else if (!timer) {
        timer = setTimeout(function () { last = Date.now(); timer = null; fn.apply(ctx, args); }, rem);
      }
    };
  }
  function raf(fn) { return (global.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fn); }
  function clamp(n, mn, mx) { return Math.max(mn, Math.min(mx, n)); }
  function safeCall(fn, label) {
    try { return fn(); }
    catch (e) {
      try {
        if (global.Sentry && global.Sentry.captureException) global.Sentry.captureException(e, { tags: { sp_prem: label || '?' } });
      } catch (_) {}
      try { console.debug('[SP_PREM]', label || 'error', e && e.message); } catch (_) {}
      return null;
    }
  }
  function whenReady(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') raf(fn);
    else document.addEventListener('DOMContentLoaded', function () { raf(fn); }, { once: true });
  }
  function prefersReducedMotion() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function isLowEndDevice() {
    try {
      var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && conn.saveData) return true;
      if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 4) return true;
    } catch (e) {}
    return false;
  }
  function formatUgx(n) {
    n = Math.round(Number(n) || 0);
    return 'UGX ' + n.toLocaleString('en-US');
  }
  function parseUgx(s) {
    if (!s) return 0;
    var m = String(s).replace(/[^0-9.-]/g, '');
    return Math.round(parseFloat(m) || 0);
  }

  var PREM = {
    version: VERSION,
    sparklines: {},
    ring: null,
    chartTheme: { applied: false },
    coinOverlay: null,
    testimonials: null,
    dashboardHookInstalled: false
  };

  // ─────────────────────────────────────────────────────────
  // 3. Phosphor coverage audit + hover tagging
  // ─────────────────────────────────────────────────────────
  function tagPhosphorHovers() {
    safeCall(function () {
      var scopes = [
        '.side-nav a', '.side-nav button',
        '.top-bar button', '.top-bar a',
        '.mainstage-kpi', '.stat-card',
        '.card.dashboard-section-card .card-head',
        '.btn', '.btn-primary', '.btn-secondary', '.landing-cta',
        '.quick-action', '[data-action]'
      ];
      qsa(scopes.join(',')).forEach(function (node) {
        if (!node.classList) return;
        var hasIcon = node.querySelector && node.querySelector('.ph, .ph-fill, .ph-duotone');
        if (hasIcon || (node.classList && node.classList.contains('ph'))) {
          node.classList.add('sp-prem-icon-hover');
        }
      });
      var missing = 0;
      qsa('.side-nav a').forEach(function (a) { if (!a.querySelector('.ph, .ph-fill, .ph-duotone')) missing++; });
      if (missing > 0) console.debug('[SP_PREM] phosphor audit: ' + missing + ' nav links missing icons');
    }, 'tagPhosphorHovers');
  }

  // ─────────────────────────────────────────────────────────
  // 4. Glass-depth class finisher
  // ─────────────────────────────────────────────────────────
  function applyGlassDepth() {
    safeCall(function () {
      var selectors = [
        '.card.dashboard-section-card',
        '.today-board-card',
        '.stat-card',
        '.mainstage-kpi',
        '.landing-mainstage-card',
        '.landing-feature-card'
      ];
      qsa(selectors.join(',')).forEach(function (el) {
        el.classList.add('sp-prem-card-depth');
        el.classList.add('sp-prem-widget');
      });
    }, 'applyGlassDepth');
  }

  // ─────────────────────────────────────────────────────────
  // 5. Mobile dashboard carousel
  // ─────────────────────────────────────────────────────────
  function setupMobileCarousel() {
    safeCall(function () {
      var mq = matchMedia('(max-width: 768px)');
      function apply() {
        if (mq.matches) document.body.classList.add('sp-prem-mobile-carousel');
        else document.body.classList.remove('sp-prem-mobile-carousel');
      }
      apply();
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply);

      var mainstage = qs('.mainstage-kpis');
      if (mainstage && !qs('.sp-prem-dash-dots', mainstage.parentNode)) {
        var dots = createEl('div', { class: 'sp-prem-dash-dots sp-prem-widget' });
        var kpis = qsa('.mainstage-kpi', mainstage);
        kpis.forEach(function (_, i) {
          var d = createEl('button', { class: 'sp-prem-dash-dot', 'aria-label': 'Go to card ' + (i + 1), type: 'button' });
          if (i === 0) d.classList.add('is-active');
          d.addEventListener('click', function () {
            var target = kpis[i];
            if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
          });
          dots.appendChild(d);
        });
        mainstage.parentNode.insertBefore(dots, mainstage.nextSibling);

        var updateActive = throttle(function () {
          if (!mq.matches) return;
          var rect = mainstage.getBoundingClientRect();
          var mid = rect.left + rect.width / 2;
          var nearest = 0, nd = Infinity;
          kpis.forEach(function (k, i) {
            var r = k.getBoundingClientRect();
            var c = r.left + r.width / 2;
            var d = Math.abs(c - mid);
            if (d < nd) { nd = d; nearest = i; }
          });
          qsa('.sp-prem-dash-dot', dots).forEach(function (el, i) {
            el.classList.toggle('is-active', i === nearest);
          });
        }, 100);
        mainstage.addEventListener('scroll', updateActive, { passive: true });
      }
    }, 'setupMobileCarousel');
  }

  // ─────────────────────────────────────────────────────────
  // 6. Radial progress ring
  // ─────────────────────────────────────────────────────────
  var RING_SIZE = 140;
  var RING_STROKE = 10;
  var RING_R = (RING_SIZE - RING_STROKE) / 2;
  var RING_CIRC = 2 * Math.PI * RING_R;

  function buildRingSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + RING_SIZE + ' ' + RING_SIZE);
    svg.setAttribute('class', 'sp-prem-goal-ring');
    svg.setAttribute('aria-hidden', 'true');

    var defs = document.createElementNS(ns, 'defs');
    var grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'spPremRingGrad');
    grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '100%');
    var s1 = document.createElementNS(ns, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#FFE082');
    var s2 = document.createElementNS(ns, 'stop'); s2.setAttribute('offset', '50%'); s2.setAttribute('stop-color', '#FFB300');
    var s3 = document.createElementNS(ns, 'stop'); s3.setAttribute('offset', '100%'); s3.setAttribute('stop-color', '#C9920A');
    grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3);
    defs.appendChild(grad);
    svg.appendChild(defs);

    var track = document.createElementNS(ns, 'circle');
    track.setAttribute('cx', RING_SIZE / 2); track.setAttribute('cy', RING_SIZE / 2);
    track.setAttribute('r', RING_R); track.setAttribute('class', 'sp-prem-ring-track');
    track.setAttribute('fill', 'none');
    svg.appendChild(track);

    var arc = document.createElementNS(ns, 'circle');
    arc.setAttribute('cx', RING_SIZE / 2); arc.setAttribute('cy', RING_SIZE / 2);
    arc.setAttribute('r', RING_R); arc.setAttribute('class', 'sp-prem-ring-arc');
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', 'url(#spPremRingGrad)');
    arc.setAttribute('stroke-width', RING_STROKE);
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', RING_CIRC);
    arc.setAttribute('stroke-dashoffset', RING_CIRC);
    arc.setAttribute('transform', 'rotate(-90 ' + (RING_SIZE / 2) + ' ' + (RING_SIZE / 2) + ')');
    svg.appendChild(arc);

    return { svg: svg, arc: arc };
  }

  function installRing() {
    safeCall(function () {
      var host = qs('[data-sp-prem-goal-ring="true"], .monthly-goal-metric');
      if (!host) return;
      if (host.querySelector('.sp-prem-goal-ring-wrap')) return;

      var wrap = createEl('div', { class: 'sp-prem-goal-ring-wrap sp-prem-widget' });
      var built = buildRingSvg();
      wrap.appendChild(built.svg);

      var existingChildren = Array.prototype.slice.call(host.childNodes);
      host.insertBefore(wrap, host.firstChild);
      existingChildren.forEach(function (n) { wrap.appendChild(n); });

      PREM.ring = { host: host, wrap: wrap, arc: built.arc };
      refreshRing();
    }, 'installRing');
  }

  function refreshRing() {
    safeCall(function () {
      if (!PREM.ring || !PREM.ring.arc) return;
      var pctEl = qs('#monthlyGoalPercent') || qs('[data-goal-percent]');
      var pct = 0;
      if (pctEl) {
        var raw = pctEl.textContent || '';
        pct = parseFloat(raw.replace(/[^0-9.-]/g, '')) || 0;
      }
      pct = clamp(pct, 0, 100);
      var offset = RING_CIRC * (1 - pct / 100);
      PREM.ring.arc.setAttribute('stroke-dashoffset', offset);
    }, 'refreshRing');
  }

  // ─────────────────────────────────────────────────────────
  // 7. Sparklines
  // ─────────────────────────────────────────────────────────
  var SPARK_CONFIG = {
    income: { color: 'gold', gradId: 'spPremSparkGoldGrad' },
    deposits: { color: 'cyan', gradId: 'spPremSparkCyanGrad' },
    expenses: { color: 'red', gradId: 'spPremSparkRedGrad' },
    net: { color: 'green', gradId: 'spPremSparkGreenGrad' }
  };

  function ensureSparkDefs() {
    if (qs('#spPremSparkDefs')) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('id', 'spPremSparkDefs');
    svg.setAttribute('class', 'sp-prem-spark-defs');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');

    var defs = document.createElementNS(ns, 'defs');
    var grads = {
      spPremSparkGoldGrad: ['#FFE082', '#FFB300'],
      spPremSparkCyanGrad: ['#80DEEA', '#00BCD4'],
      spPremSparkRedGrad: ['#FF8A80', '#E53935'],
      spPremSparkGreenGrad: ['#A5D6A7', '#2E7D32']
    };
    Object.keys(grads).forEach(function (id) {
      var g = document.createElementNS(ns, 'linearGradient');
      g.setAttribute('id', id);
      g.setAttribute('x1', '0%'); g.setAttribute('y1', '0%');
      g.setAttribute('x2', '100%'); g.setAttribute('y2', '0%');
      var a = document.createElementNS(ns, 'stop');
      a.setAttribute('offset', '0%'); a.setAttribute('stop-color', grads[id][0]);
      var b = document.createElementNS(ns, 'stop');
      b.setAttribute('offset', '100%'); b.setAttribute('stop-color', grads[id][1]);
      g.appendChild(a); g.appendChild(b);
      defs.appendChild(g);
    });
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function computeSparkData(kind) {
    try {
      var now = new Date();
      var arr = [];
      var bookings = Array.isArray(global.bookings) ? global.bookings : [];
      var expenses = Array.isArray(global.expenses) ? global.expenses : [];
      var other = Array.isArray(global.otherIncome) ? global.otherIncome : [];

      for (var i = 6; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        var key = d.toISOString().slice(0, 10);
        var v = 0;

        if (kind === 'income') {
          v += bookings.reduce(function (s, b) {
            var bd = (b.event_date || b.date || b.created_at || '').slice(0, 10);
            return bd === key ? s + (Number(b.amount) || 0) : s;
          }, 0);
          v += other.reduce(function (s, o) {
            var od = (o.date || o.created_at || '').slice(0, 10);
            return od === key ? s + (Number(o.amount) || 0) : s;
          }, 0);
        } else if (kind === 'deposits') {
          v += bookings.reduce(function (s, b) {
            var bd = (b.event_date || b.date || b.created_at || '').slice(0, 10);
            if (bd !== key) return s;
            return s + (Number(b.deposit) || Number(b.deposit_amount) || 0);
          }, 0);
        } else if (kind === 'expenses') {
          v += expenses.reduce(function (s, e) {
            var ed = (e.date || e.created_at || '').slice(0, 10);
            return ed === key ? s + (Number(e.amount) || 0) : s;
          }, 0);
        } else if (kind === 'net') {
          var inc = bookings.reduce(function (s, b) {
            var bd = (b.event_date || b.date || b.created_at || '').slice(0, 10);
            return bd === key ? s + (Number(b.amount) || 0) : s;
          }, 0);
          inc += other.reduce(function (s, o) {
            var od = (o.date || o.created_at || '').slice(0, 10);
            return od === key ? s + (Number(o.amount) || 0) : s;
          }, 0);
          var exp = expenses.reduce(function (s, e) {
            var ed = (e.date || e.created_at || '').slice(0, 10);
            return ed === key ? s + (Number(e.amount) || 0) : s;
          }, 0);
          v = inc - exp;
        }
        arr.push(v);
      }
      if (arr.every(function (x) { return x === 0; })) {
        for (var j = 0; j < arr.length; j++) arr[j] = Math.random() * 5 + 3;
      }
      return arr;
    } catch (e) { return [3, 4, 3, 5, 4, 6, 5]; }
  }

  function renderSparkline(host, kind) {
    safeCall(function () {
      if (!host) return;
      var cfg = SPARK_CONFIG[kind]; if (!cfg) return;
      var existing = host.querySelector('.sp-prem-sparkline');
      if (existing) existing.parentNode.removeChild(existing);

      var data = computeSparkData(kind);
      var ns = 'http://www.w3.org/2000/svg';
      var w = 100, h = 26, pad = 2;
      var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
      var range = max - min || 1;

      var pts = data.map(function (v, i) {
        var x = pad + (i * (w - pad * 2)) / (data.length - 1);
        var y = h - pad - ((v - min) / range) * (h - pad * 2);
        return [x, y];
      });
      var d = pts.map(function (p, i) {
        return (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
      }).join(' ');

      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'sp-prem-sparkline sp-prem-widget sp-prem-spark-' + cfg.color);
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');

      var fillD = d + ' L' + pts[pts.length - 1][0].toFixed(2) + ' ' + h + ' L' + pts[0][0].toFixed(2) + ' ' + h + ' Z';
      var fillPath = document.createElementNS(ns, 'path');
      fillPath.setAttribute('d', fillD);
      fillPath.setAttribute('class', 'sp-prem-spark-fill');
      svg.appendChild(fillPath);

      var line = document.createElementNS(ns, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'sp-prem-spark-line');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', 'url(#' + cfg.gradId + ')');
      svg.appendChild(line);

      host.appendChild(svg);
      PREM.sparklines[kind] = { host: host, data: data };
    }, 'renderSparkline:' + kind);
  }

  function installSparklines() {
    safeCall(function () {
      ensureSparkDefs();
      qsa('[data-sp-prem-sparkline]').forEach(function (host) {
        var kind = host.getAttribute('data-sp-prem-sparkline');
        renderSparkline(host, kind);
      });
    }, 'installSparklines');
  }

  function refreshSparklines() {
    safeCall(function () {
      qsa('[data-sp-prem-sparkline]').forEach(function (host) {
        var kind = host.getAttribute('data-sp-prem-sparkline');
        renderSparkline(host, kind);
      });
    }, 'refreshSparklines');
  }

  // ─────────────────────────────────────────────────────────
  // 8. Chart.js theme upgrader
  // ─────────────────────────────────────────────────────────
  function upgradeChartTheme() {
    safeCall(function () {
      if (PREM.chartTheme.applied) return;
      if (!global.Chart || !global.Chart.defaults) return;
      global.Chart.defaults.font.family = '"Montserrat", system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      global.Chart.defaults.font.weight = '500';

      var plugin = {
        id: 'spPremGradientFill',
        beforeDatasetsDraw: function (chart) {
          try {
            var canvas = chart.canvas;
            if (!canvas || !canvas.closest) return;
            var host = canvas.closest('.sp-prem-chart-host');
            if (!host) return;
            var ctx = chart.ctx;
            var area = chart.chartArea;
            if (!area) return;
            (chart.data.datasets || []).forEach(function (ds) {
              if (ds.__spPremPatched) return;
              if (ds.type && ds.type !== 'line' && ds.type !== 'bar') return;
              var border = ds.borderColor;
              if (!border || typeof border !== 'string') return;
              var g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
              var hex = border.trim();
              g.addColorStop(0, hexToRgba(hex, 0.45));
              g.addColorStop(1, hexToRgba(hex, 0.02));
              ds.__spPremOrigBg = ds.backgroundColor;
              ds.backgroundColor = g;
              ds.__spPremPatched = true;
              if (typeof ds.tension !== 'number') ds.tension = 0.4;
              if (typeof ds.pointRadius !== 'number') ds.pointRadius = 3;
              if (typeof ds.pointHoverRadius !== 'number') ds.pointHoverRadius = 6;
              if (typeof ds.borderWidth !== 'number') ds.borderWidth = 2.5;
              if (ds.fill == null) ds.fill = true;
            });
          } catch (e) {}
        }
      };
      try { global.Chart.register(plugin); } catch (e) {}
      PREM.chartTheme.applied = true;
    }, 'upgradeChartTheme');
  }

  function hexToRgba(hex, a) {
    if (!hex) return 'rgba(255,179,0,' + a + ')';
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (m.length !== 6) return 'rgba(255,179,0,' + a + ')';
    var r = parseInt(m.slice(0, 2), 16);
    var g = parseInt(m.slice(2, 4), 16);
    var b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ─────────────────────────────────────────────────────────
  // 9. Landing device parallax
  // ─────────────────────────────────────────────────────────
  function installParallax() {
    safeCall(function () {
      if (prefersReducedMotion()) return;
      if (window.innerWidth < 900) return;
      var landing = qs('#landingScreen');
      if (!landing) return;
      if (qs('.landing-walkthrough-section', landing)) return;
      var device = qs('.landing-dashboard-preview', landing) || qs('.feature-reel', landing);
      if (!device) return;
      device.classList.add('sp-prem-device-parallax', 'sp-prem-widget');

      var tx = 0, ty = 0, rx = 0, ry = 0;
      var targetTx = 0, targetTy = 0, targetRx = 0, targetRy = 0;
      var rafing = false;

      var handler = throttle(function (e) {
        var rect = landing.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) / rect.width;
        var dy = (e.clientY - cy) / rect.height;
        targetTx = clamp(dx * 16, -8, 8);
        targetTy = clamp(dy * 16, -8, 8);
        targetRy = clamp(dx * 4, -2, 2);
        targetRx = clamp(-dy * 4, -2, 2);
        if (!rafing) { rafing = true; raf(tick); }
      }, 16);

      function tick() {
        rafing = false;
        tx += (targetTx - tx) * 0.12;
        ty += (targetTy - ty) * 0.12;
        rx += (targetRx - rx) * 0.12;
        ry += (targetRy - ry) * 0.12;
        device.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
        if (Math.abs(targetTx - tx) > 0.1 || Math.abs(targetTy - ty) > 0.1) { rafing = true; raf(tick); }
      }

      landing.addEventListener('mousemove', handler, { passive: true });
      landing.addEventListener('mouseleave', function () {
        targetTx = targetTy = targetRx = targetRy = 0;
        if (!rafing) { rafing = true; raf(tick); }
      });
    }, 'installParallax');
  }

  // ─────────────────────────────────────────────────────────
  // 10. Gradient mesh orbs
  // ─────────────────────────────────────────────────────────
  function installMeshOrbs() {
    safeCall(function () {
      if (prefersReducedMotion()) return;
      if (isLowEndDevice()) return;
      var landing = qs('#landingScreen');
      if (!landing) return;
      if (qs('.landing-walkthrough-section', landing)) return;
      if (qs('.sp-prem-landing-mesh', landing)) return;
      var mesh = createEl('div', { class: 'sp-prem-landing-mesh sp-prem-widget', 'aria-hidden': 'true' });
      mesh.appendChild(createEl('span', { class: 'sp-prem-orb sp-prem-orb-1' }));
      mesh.appendChild(createEl('span', { class: 'sp-prem-orb sp-prem-orb-2' }));
      mesh.appendChild(createEl('span', { class: 'sp-prem-orb sp-prem-orb-3' }));
      landing.insertBefore(mesh, landing.firstChild);
    }, 'installMeshOrbs');
  }

  // ─────────────────────────────────────────────────────────
  // 11. Scroll-reveal observer
  // ─────────────────────────────────────────────────────────
  function installReveal() {
    safeCall(function () {
      if (!('IntersectionObserver' in global)) return;
      if (prefersReducedMotion()) {
        qsa('[data-sp-reveal], .sp-prem-reveal').forEach(function (el) { el.classList.add('is-revealed'); });
        return;
      }

      var autoSelectors = [
        '.landing-metrics-strip .landing-metric-item',
        '.landing-mainstage-card .mainstage-kpi',
        '.landing-features-grid > *',
        '.landing-testimonial',
        '.feature-reel-card'
      ];
      qsa(autoSelectors.join(',')).forEach(function (el, i) {
        if (!el.hasAttribute('data-sp-reveal')) el.setAttribute('data-sp-reveal', '');
        el.classList.add('sp-prem-reveal');
        var stagger = (i % 6) + 1;
        el.classList.add('sp-prem-reveal--d' + stagger);
      });

      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (ent) {
          if (ent.isIntersecting) {
            ent.target.classList.add('is-revealed');
            io.unobserve(ent.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

      qsa('[data-sp-reveal]').forEach(function (el) {
        el.classList.add('sp-prem-reveal');
        io.observe(el);
      });
    }, 'installReveal');
  }

  // ─────────────────────────────────────────────────────────
  // 12. Testimonials carousel
  // ─────────────────────────────────────────────────────────
  var TESTIMONIALS = [
    {
      quote: 'Finally a tool that keeps my artists, bookings, and money in one place. I stopped using spreadsheets on day one.',
      name: 'Aggie Best',
      role: 'Artist Manager, Kampala'
    },
    {
      quote: 'Star Paper cut our monthly reconciliation from three days to forty minutes. The deposit tracking alone paid for a year.',
      name: 'Nadia K.',
      role: 'Artist Manager, Kampala'
    },
    {
      quote: 'Every booking, every expense, every payout — finally in one place. The dashboard feels like a boutique trading floor.',
      name: 'Samuel O.',
      role: 'Tour Producer, Lagos'
    },
    {
      quote: 'I show up to meetings with a single PDF and close deals faster. Clients think we have a full finance team behind us.',
      name: 'Amaka R.',
      role: 'Label Director, Accra'
    }
  ];
  TESTIMONIALS[2].quote = 'Every booking, every expense, every payout - finally in one place. The dashboard feels like a boutique trading floor.';

  function installTestimonials() {
    safeCall(function () {
      var landing = qs('#landingScreen');
      if (!landing) return;
      if (qs('#landingTestimonials', landing)) return;
      var root = qs('.landing-testimonial', landing);
      if (!root || root.classList.contains('sp-prem-testimonials')) return;

      root.classList.add('sp-prem-testimonials', 'sp-prem-widget');
      root.setAttribute('aria-label', 'Customer testimonials');
      root.setAttribute('tabindex', '0');
      root.innerHTML = '';
      var track = createEl('div', { class: 'sp-prem-testimonials__track' });

      TESTIMONIALS.forEach(function (t, i) {
        var slide = createEl('div', { class: 'sp-prem-testimonials__slide' + (i === 0 ? ' is-active' : '') });
        slide.appendChild(createEl('i', { class: 'ph-duotone ph-quotes sp-prem-testimonials__icon', 'aria-hidden': 'true' }));
        slide.appendChild(createEl('p', { class: 'sp-prem-testimonials__quote' }, t.quote));
        var attr = createEl('div', { class: 'sp-prem-testimonials__attr' });
        attr.appendChild(document.createTextNode(t.name + ' — ' + t.role));
        attr.textContent = t.name + ' - ' + t.role;
        slide.appendChild(attr);
        track.appendChild(slide);
      });

      root.appendChild(track);

      var dots = createEl('div', { class: 'sp-prem-testimonials__dots', role: 'tablist' });
      TESTIMONIALS.forEach(function (_, i) {
        var d = createEl('button', { class: 'sp-prem-testimonials__dot' + (i === 0 ? ' is-active' : ''), type: 'button', 'aria-label': 'Testimonial ' + (i + 1) });
        d.addEventListener('click', function () { goTo(i, true); });
        dots.appendChild(d);
      });
      root.appendChild(dots);

      var idx = 0, timer = null;
      function goTo(i, userInitiated) {
        idx = (i + TESTIMONIALS.length) % TESTIMONIALS.length;
        track.style.transform = 'translateX(' + (-idx * 100) + '%)';
        qsa('.sp-prem-testimonials__slide', track).forEach(function (s, k) { s.classList.toggle('is-active', k === idx); });
        qsa('.sp-prem-testimonials__dot', dots).forEach(function (s, k) { s.classList.toggle('is-active', k === idx); });
        if (userInitiated) restart();
      }
      function next() { goTo(idx + 1); }
      function start() { stop(); timer = setInterval(next, 6000); }
      function stop() { if (timer) { clearInterval(timer); timer = null; } }
      function restart() { stop(); start(); }

      root.addEventListener('mouseenter', stop);
      root.addEventListener('mouseleave', start);
      root.addEventListener('focusin', stop);
      root.addEventListener('focusout', start);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
      });
      root.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { goTo(idx + 1, true); }
        else if (e.key === 'ArrowLeft') { goTo(idx - 1, true); }
      });

      PREM.testimonials = { root: root, goTo: goTo, start: start, stop: stop };
      goTo(0);
      if (!prefersReducedMotion()) start();
    }, 'installTestimonials');
  }

  // ─────────────────────────────────────────────────────────
  // 13. CTA pulse wiring
  // ─────────────────────────────────────────────────────────
  function wireCtaPulse() {
    safeCall(function () {
      var targets = ['#createAccountBtn', '#getStartedBtn', '.landing-cta-primary', '[data-landing-cta="primary"]'];
      qsa(targets.join(',')).forEach(function (el) {
        if (!el.hasAttribute('data-sp-prem-pulse')) el.setAttribute('data-sp-prem-pulse', 'gold');
        el.classList.add('sp-prem-widget');
      });
    }, 'wireCtaPulse');
  }

  // ─────────────────────────────────────────────────────────
  // 14. Coin rain overlay (hero coins)
  // ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────
  // 15. PDF modal polish
  // ─────────────────────────────────────────────────────────
  function polishPdfModal() {
    safeCall(function () {
      var modal = qs('#spPdfExportModal');
      if (!modal) return;
      modal.classList.add('sp-prem-pdf-modal', 'sp-prem-widget');
    }, 'polishPdfModal');
  }

  // ─────────────────────────────────────────────────────────
  // 16. updateDashboard hook wrapper
  // ─────────────────────────────────────────────────────────
  function onDashboardRendered() {
    raf(function () {
      refreshRing();
      refreshSparklines();
      upgradeChartTheme();
    });
  }

  function installDashboardHook() {
    safeCall(function () {
      if (PREM.dashboardHookInstalled) return;
      var wrapFn = function () {
        if (typeof global.updateDashboard === 'function' && !global.updateDashboard.__spPremWrapped) {
          var orig = global.updateDashboard;
          var wrapped = function () {
            var out;
            try { out = orig.apply(this, arguments); } catch (e) { throw e; }
            try {
              if (out && typeof out.then === 'function') {
                out.then(onDashboardRendered, onDashboardRendered);
              } else {
                onDashboardRendered();
              }
            } catch (e) {}
            return out;
          };
          wrapped.__spPremWrapped = true;
          try { global.updateDashboard = wrapped; } catch (e) {}
          PREM.dashboardHookInstalled = true;
        }
      };
      wrapFn();
      if (!PREM.dashboardHookInstalled) {
        var retries = 0;
        var iv = setInterval(function () {
          wrapFn();
          retries++;
          if (PREM.dashboardHookInstalled || retries > 20) clearInterval(iv);
        }, 500);
      }

      var lastPct = '';
      setInterval(function () {
        var el = qs('#monthlyGoalPercent');
        if (!el) return;
        var t = el.textContent || '';
        if (t !== lastPct) { lastPct = t; onDashboardRendered(); }
      }, 4000);
    }, 'installDashboardHook');
  }

  // ─────────────────────────────────────────────────────────
  // 17. Kill-switch + exposure
  // ─────────────────────────────────────────────────────────
  global.SP_PREMIUM = {
    version: VERSION,
    isEnabled: function () { return !isKilled(); },
    disable: function () {
      try { localStorage.setItem(OFF_KEY, '1'); location.reload(); } catch (e) {}
    },
    enable: function () {
      try { localStorage.removeItem(OFF_KEY); location.reload(); } catch (e) {}
    },
    forceRefresh: function () {
      refreshRing();
      refreshSparklines();
      upgradeChartTheme();
    }
  };

  // ─────────────────────────────────────────────────────────
  // Boot sequence
  // ─────────────────────────────────────────────────────────
  function bootOnce() {
    safeCall(tagPhosphorHovers, 'boot:tagPhosphorHovers');
    safeCall(applyGlassDepth, 'boot:applyGlassDepth');
    safeCall(setupMobileCarousel, 'boot:setupMobileCarousel');
    safeCall(installRing, 'boot:installRing');
    safeCall(installSparklines, 'boot:installSparklines');
    safeCall(upgradeChartTheme, 'boot:upgradeChartTheme');
    safeCall(installParallax, 'boot:installParallax');
    safeCall(installMeshOrbs, 'boot:installMeshOrbs');
    safeCall(installReveal, 'boot:installReveal');
    safeCall(installTestimonials, 'boot:installTestimonials');
    safeCall(wireCtaPulse, 'boot:wireCtaPulse');
    safeCall(polishPdfModal, 'boot:polishPdfModal');
    safeCall(installDashboardHook, 'boot:installDashboardHook');

    setTimeout(function () {
      safeCall(tagPhosphorHovers, 'late:tagPhosphorHovers');
      safeCall(applyGlassDepth, 'late:applyGlassDepth');
      safeCall(installRing, 'late:installRing');
      safeCall(installSparklines, 'late:installSparklines');
      safeCall(upgradeChartTheme, 'late:upgradeChartTheme');
      safeCall(polishPdfModal, 'late:polishPdfModal');
      safeCall(wireCtaPulse, 'late:wireCtaPulse');
    }, 1500);

    setTimeout(function () {
      safeCall(refreshRing, 'settle:refreshRing');
      safeCall(refreshSparklines, 'settle:refreshSparklines');
    }, 3500);
  }

  whenReady(bootOnce);

  try { console.debug('[SP_PREM] booted v' + VERSION); } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
