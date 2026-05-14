/* Star Paper app shell refinement bootstrap.
   Additive only: toggles the refined shell class and applies shared polish
   classes to app-owned surfaces after initial and subsequent renders. */
(function spShellBoot(global) {
  'use strict';

  if (global.__SP_SHELL_BOOTED__) return;
  global.__SP_SHELL_BOOTED__ = true;

  var VERSION = '1.0.0';
  var SHELL_OFF_KEY = 'sp_shell_refined_off';
  var PREM_OFF_KEY = 'sp_prem_off';
  var HANDCRAFT_OFF_KEY = 'sp_handcraft_off';
  var rafId = 0;
  var observer = null;

  function readFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch (_err) { return false; }
  }

  function isAllowed() {
    return !readFlag(SHELL_OFF_KEY) && !readFlag(PREM_OFF_KEY) && !readFlag(HANDCRAFT_OFF_KEY);
  }

  function applyRootState() {
    var allowed = isAllowed();
    var html = document.documentElement;
    html.classList.toggle('sp-shell-refined', allowed);
    html.classList.toggle('sp-shell-off', !allowed);
    if (document.body) {
      document.body.classList.toggle('sp-shell-refined', allowed);
      document.body.classList.toggle('sp-shell-off', !allowed);
    }
    if (readFlag(PREM_OFF_KEY)) html.classList.add('sp-prem-off');
    if (readFlag(PREM_OFF_KEY) || readFlag(HANDCRAFT_OFF_KEY)) html.classList.add('sp-handcraft-off');
    return allowed;
  }

  function qsa(selector, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }
    catch (_err) { return []; }
  }

  function enhanceShell() {
    if (!applyRootState()) return;
    var app = document.getElementById('appContainer');
    if (!app) return;

    qsa([
      '.card',
      '.stat-card',
      '.mainstage-kpi',
      '.data-card',
      '.dashboard-section-card',
      '.today-board-card',
      '.monthly-goal-track',
      '.mainstage-live-pulse',
      '.settings-panel',
      '.settings-row',
      '.sp-rpt-kpi',
      '.sp-rpt-chart-card',
      '.sp-rpt-table-card',
      '.sp-rpt-focus',
      '.sp-rpt-achievements',
      '.sp-rpt-recs',
      '.sp-rpt-ledger'
    ].join(','), app).forEach(function (node) {
      node.classList.add('sp-prem-card-depth', 'sp-shell-widget');
    });

    qsa([
      '.btn-primary',
      '.add-btn',
      '.task-add-btn',
      '.section-fab',
      '.sp-empty__cta',
      '.sp-global-contract',
      '.sp-global-key__open'
    ].join(','), app).forEach(function (node) {
      if (!node.hasAttribute('data-sp-prem-pulse')) node.setAttribute('data-sp-prem-pulse', 'gold');
      node.classList.add('sp-shell-widget');
    });

    qsa('a[href]', app).forEach(function (link) {
      if (link.closest('.landing-shell-nav, .bottom-nav, .sidebar-nav')) return;
      link.classList.add('sp-shell-link');
    });
  }

  function scheduleEnhance() {
    if (rafId) return;
    rafId = (global.requestAnimationFrame || global.setTimeout)(function () {
      rafId = 0;
      enhanceShell();
    }, 16);
  }

  function installObserver() {
    if (observer || typeof MutationObserver !== 'function') return;
    var app = document.getElementById('appContainer');
    if (!app) return;
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(app, { childList: true, subtree: true });
  }

  function boot() {
    applyRootState();
    enhanceShell();
    installObserver();
    setTimeout(scheduleEnhance, 500);
    setTimeout(scheduleEnhance, 1800);
  }

  global.SP_SHELL = {
    version: VERSION,
    isEnabled: isAllowed,
    refresh: scheduleEnhance,
    disable: function () {
      try { localStorage.setItem(SHELL_OFF_KEY, '1'); location.reload(); } catch (_err) {}
    },
    enable: function () {
      try { localStorage.removeItem(SHELL_OFF_KEY); location.reload(); } catch (_err) {}
    }
  };

  document.addEventListener('sp-render', scheduleEnhance);
  global.addEventListener('sp:app-boot-helpers-ready', scheduleEnhance);
  global.addEventListener('storage', function (event) {
    if ([SHELL_OFF_KEY, PREM_OFF_KEY, HANDCRAFT_OFF_KEY].indexOf(event.key) >= 0) applyRootState();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
