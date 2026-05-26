(function setupDeferredLibraries() {
  function assetManifest() {
    if (!window.SP_BROWSER_ASSETS || typeof window.SP_BROWSER_ASSETS.url !== 'function') {
      throw new Error('Star Paper browser asset manifest is unavailable');
    }
    return window.SP_BROWSER_ASSETS;
  }

  function externalLibrary(name, globalName) {
    var source = assetManifest().external(name);
    if (!source || !source.src || !source.integrity) {
      throw new Error('Star Paper external library metadata is incomplete: ' + name);
    }
    return {
      src: source.src,
      global: globalName,
      crossOrigin: source.crossOrigin || 'anonymous',
      integrity: source.integrity
    };
  }

  function localLibrary(path, options) {
    options = options || {};
    return {
      src: assetManifest().url(path),
      module: options.module === true,
      optional: options.optional === true
    };
  }

  function buildSources() {
    try {
      return {
        sentry: externalLibrary('sentry', 'Sentry'),
        chart: externalLibrary('chart', 'Chart'),
        jspdf: externalLibrary('jspdf', 'jspdf'),
        globe: localLibrary('app.globe.js', { module: true, optional: true }),
        premium: localLibrary('app.premium.js', { optional: true }),
        shell: localLibrary('app.shell.js', { optional: true })
      };
    } catch (error) {
      console.error('Star Paper deferred library metadata failed:', error);
      return {};
    }
  }

  var sources = buildSources();
  var pending = {};

  function idle(work, timeout) {
    if (typeof work !== 'function') return;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(work, { timeout: timeout || 1200 });
      return;
    }
    window.setTimeout(work, Math.min(timeout || 1200, 400));
  }

  function loadScript(name) {
    var config = sources[name];
    if (!config) return Promise.reject(new Error('Unknown deferred library: ' + name));
    if (config.global && window[config.global]) return Promise.resolve(window[config.global]);
    if (pending[name]) return pending[name];
    pending[name] = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = config.src;
      script.async = true;
      if (config.module) script.type = 'module';
      if (config.crossOrigin) script.crossOrigin = config.crossOrigin;
      if (config.integrity) script.integrity = config.integrity;
      script.onload = function() { resolve(config.global ? window[config.global] : true); };
      script.onerror = function() {
        if (name === 'globe' && window.__spShowGlobalScheduleFallback) {
          window.__spShowGlobalScheduleFallback();
        }
        var error = new Error('Deferred library failed: ' + name);
        if (config.optional) resolve(false);
        else reject(error);
      };
      document.head.appendChild(script);
    });
    return pending[name];
  }

  window.__spLoadDeferredLibrary = function(name) {
    if (name === 'pdf') {
      return loadScript('jspdf');
    }
    return loadScript(name);
  };

  window.__spInitSentry = function initDeferredSentry() {
    if (!window.Sentry || window.__spSentryInitialized) return;
    window.__spSentryInitialized = true;
    window.Sentry.init({
      dsn: 'https://43eaad14b9ae20eec68d9249f139cbc2@o4511079351189504.ingest.de.sentry.io/4511081427894352',
      environment: window.location.hostname === 'star-paper.netlify.app' ? 'production' : 'development',
      release: 'star-paper@report-runtime-v138',
      tracesSampleRate: 0.1,
      ignoreErrors: [
        'AbortError',
        'Lock broken by steal',
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection'
      ],
      beforeSend: function(event) {
        try {
          if (localStorage.getItem('sp_logged_out') === '1') return null;
        } catch (_err) {}
        return event;
      }
    });
  };

  window.__spLoadDeferredThirdParty = function(reason) {
    idle(function() {
      loadScript('sentry').then(window.__spInitSentry).catch(function(err) {
        console.warn('Sentry deferred load failed:', err);
      });
    }, 1000);
    idle(function() { loadScript('globe').catch(function() {}); }, 1600);
    idle(function() {
      loadScript('premium')
        .catch(function() {})
        .then(function() { return loadScript('shell').catch(function() {}); });
    }, 1800);
  };

  window.addEventListener('load', function() {
    window.__spLoadDeferredThirdParty('window-load');
  }, { once: true });
})();

(function globalScheduleFallbackGuard() {
  window.__spShowGlobalScheduleFallback = function showGlobalScheduleFallback() {
    if (window.SP_GLOBAL_GLOBE) return;
    var root = document.getElementById('globalScheduleGlobe');
    if (!root) return;
    root.classList.add('sp-global-schedule--fallback');
    try {
      window.renderPerformanceMap?.(null, {
        showLabels: false,
        showLocationList: true,
        showPinnedPanel: true,
        fallbackOnly: true
      });
    } catch (_err) {}
  };
  window.addEventListener('load', function() {
    window.setTimeout(window.__spShowGlobalScheduleFallback, 4500);
  });
})();

(function localDevColdStartGuard() {
  var isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  if (!isLocalDev) return;
  var url = new URL(window.location.href);
  var hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
  var hasAuthCallback = Boolean(
    hashParams.get('access_token') ||
    hashParams.get('refresh_token') ||
    url.searchParams.get('access_token') ||
    url.searchParams.get('refresh_token') ||
    url.searchParams.get('code') ||
    url.searchParams.get('error') ||
    url.searchParams.get('error_code') ||
    url.searchParams.get('error_description')
  );
  if (hasAuthCallback) return;
  var marker = '';
  var hasAppHash = false;
  var publicAuthIntent = '';
  try {
    marker = sessionStorage.getItem('sp_boot_context') || '';
    publicAuthIntent = (url.searchParams.get('auth') || url.searchParams.get('screen') || '').toLowerCase();
    var publicHash = decodeURIComponent((url.hash || '').replace(/^#/, '')).toLowerCase();
    if (!publicAuthIntent && (publicHash === 'signup' || publicHash === 'create-account')) publicAuthIntent = 'signup';
    if (!publicAuthIntent && (publicHash === 'login' || publicHash === 'signin')) publicAuthIntent = 'login';
    var routePath = (url.pathname || '/').replace(/\/+$/, '') || '/';
    var hashToken = publicHash.trim().split(/[?&/]/)[0];
    hasAppHash = (routePath === '/' || routePath === '/index.html') &&
      /^(artists|bookings|calendar|dashboard|expenses|financials|global|money|otherincome|reports|schedule|settings|tasks)$/.test(hashToken);
  } catch (_err) {}
  if (
    window.__spAppBooted ||
    marker === 'auth-return' ||
    hasAppHash
  ) {
    return;
  }
  window.__spSuppressStoredSessionBootstrap = true;
  try { sessionStorage.removeItem('sp_boot_context'); } catch (_err) {}

  function revealLandingForLocalTesting() {
    if (window.__spAppBooted) return;
    var flowId = window.getBootTransitionId && window.getBootTransitionId();
    if (!flowId && window.beginBootTransition) {
      flowId = window.beginBootTransition('local-dev-cold-start', 'loading-session');
    }
    if (publicAuthIntent === 'signup' && window.showSignupForm) {
      window.showSignupForm({ instant: true });
      return;
    }
    if ((publicAuthIntent === 'login' || publicAuthIntent === 'signin') && window.showLoginForm) {
      window.showLoginForm({ instant: true });
      return;
    }
    if (window.showLanding) {
      window.showLanding({ flowId: flowId, minDelayMs: 80 });
      return;
    }
    if (window.commitBootTransition) {
      window.commitBootTransition('landingScreen', { flowId: flowId, minDelayMs: 80 });
    }
  }

  setTimeout(revealLandingForLocalTesting, 0);
  setTimeout(revealLandingForLocalTesting, 750);
  setTimeout(revealLandingForLocalTesting, 2500);
})();

(function fileProtocolGuard() {
  if (window.location.protocol !== 'file:') return;

  function appendText(parent, text) {
    parent.appendChild(document.createTextNode(text));
  }

  window.addEventListener('DOMContentLoaded', function() {
    var banner = document.createElement('div');
    banner.id = 'spLocalFileBanner';
    banner.className = 'sp-local-file-banner';

    var warning = document.createElement('strong');
    warning.textContent = 'Warning: Local file detected.';
    banner.appendChild(warning);
    appendText(banner, ' Google sign-in requires a local server. Run ');

    var command = document.createElement('code');
    command.textContent = 'npm run preview';
    command.className = 'sp-local-file-banner__command';
    banner.appendChild(command);
    appendText(banner, ' in this folder, then open ');

    var origin = document.createElement('strong');
    origin.textContent = 'http://localhost:8080';
    banner.appendChild(origin);
    appendText(banner, '. Email/password login works as normal. ');

    var close = document.createElement('button');
    close.type = 'button';
    close.dataset.localFileBannerClose = '1';
    close.className = 'sp-local-file-banner__close';
    close.setAttribute('aria-label', 'Dismiss local file warning');
    var icon = document.createElement('i');
    icon.className = 'ph ph-x';
    icon.setAttribute('aria-hidden', 'true');
    close.appendChild(icon);
    banner.appendChild(close);

    document.body.appendChild(banner);
    close.addEventListener('click', function(event) {
      event.preventDefault();
      banner.remove();
    });

    document.querySelectorAll('.btn-google, [data-action="signInWithGoogle"]').forEach(function(btn) {
      btn.disabled = true;
      btn.title = 'Google sign-in requires the frontend preview origin, such as http://localhost:8080 - not file://';
      btn.classList.add('sp-local-file-disabled-google');
    });
  });
})();

(function wireCriticalButtons() {
  if (window.__starPaperActionsBound || window.__starPaperFallbackActionsBound) {
    return;
  }
  var MAP = {
    showAddBooking: function() { if (typeof window.showAddBooking === 'function') window.showAddBooking(); },
    showAddExpense: function() { if (typeof window.showAddExpense === 'function') window.showAddExpense(); },
    showAddOtherIncome: function() { if (typeof window.showAddOtherIncome === 'function') window.showAddOtherIncome(); },
    showAddArtistForm: function() { if (typeof window.showAddArtistForm === 'function') window.showAddArtistForm(); },
    showAddEventToCalendar: function() { if (typeof window.showAddEventToCalendar === 'function') window.showAddEventToCalendar(); },
    cancelExpense: function() { if (typeof window.cancelExpense === 'function') window.cancelExpense(); },
    cancelBooking: function() { if (typeof window.cancelBooking === 'function') window.cancelBooking(); },
    cancelOtherIncome: function() { if (typeof window.cancelOtherIncome === 'function') window.cancelOtherIncome(); },
    cancelAddArtist: function() { if (typeof window.cancelAddArtist === 'function') window.cancelAddArtist(); },
    closeReceiptModal: function() { if (typeof window.closeReceiptModal === 'function') window.closeReceiptModal(); },
    closeProfileModal: function() { if (typeof window.closeProfileModal === 'function') window.closeProfileModal(); },
    closeBBFModal: function() { if (typeof window.closeBBFModal === 'function') window.closeBBFModal(); },
    closePdfExportModal: function() { if (typeof window.closePdfExportModal === 'function') window.closePdfExportModal(); },
    openProfileModal: function() { if (typeof window.openProfileModal === 'function') window.openProfileModal(); },
    saveProfileChanges: function() { if (typeof window.saveProfileChanges === 'function') window.saveProfileChanges(); },
    saveMonthlyRevenueGoal: function() { if (typeof window.saveMonthlyRevenueGoal === 'function') window.saveMonthlyRevenueGoal(); },
    saveFinancialsMonthlyRevenueGoal: function() { if (typeof window.saveFinancialsMonthlyRevenueGoal === 'function') window.saveFinancialsMonthlyRevenueGoal(); },
    saveBBF: function() { if (typeof window.saveBBF === 'function') window.saveBBF(); },
    saveClosingThoughts: function() { if (typeof window.saveClosingThoughts === 'function') window.saveClosingThoughts(); },
    handleAddTask: function() { if (typeof window.handleAddTask === 'function') window.handleAddTask(); },
    clearCompletedTasks: function() { if (typeof window.clearCompletedTasks === 'function') window.clearCompletedTasks(); },
    toggleMonthlyGoalEditor: function() { if (typeof window.toggleMonthlyGoalEditor === 'function') window.toggleMonthlyGoalEditor(); },
    toggleFinancialsMonthlyGoalEditor: function() { if (typeof window.toggleFinancialsMonthlyGoalEditor === 'function') window.toggleFinancialsMonthlyGoalEditor(); },
    toggleBBFEditor: function() { if (typeof window.toggleBBFEditor === 'function') window.toggleBBFEditor(); },
    toggleClosingThoughts: function() { if (typeof window.toggleClosingThoughts === 'function') window.toggleClosingThoughts(); },
    clearClosingThoughts: function() { if (typeof window.clearClosingThoughts === 'function') window.clearClosingThoughts(); },
    openBBFModal: function() { if (typeof window.openBBFModal === 'function') window.openBBFModal(); },
    previousMonth: function() { if (typeof window.previousMonth === 'function') window.previousMonth(); },
    nextMonth: function() { if (typeof window.nextMonth === 'function') window.nextMonth(); },
    goToToday: function() { if (typeof window.goToToday === 'function') window.goToToday(); },
    checkAvailability: function() { if (typeof window.checkAvailability === 'function') window.checkAvailability(); },
    generateMomentumPDF: function() { if (typeof window.generateMomentumPDF === 'function') window.generateMomentumPDF(); },
    openPdfExportModal: function() { if (typeof window.openPdfExportModal === 'function') window.openPdfExportModal(); },
    exportCSV: function() { if (typeof window.exportCSV === 'function') window.exportCSV(); },
    exportAllData: function() { if (typeof window.exportAllData === 'function') window.exportAllData(); },
    clearAllData: function() { if (typeof window.clearAllData === 'function') window.clearAllData(); },
    showAboutModal: function() { if (typeof window.showAboutModal === 'function') window.showAboutModal(); },
    showAdminSettings: function() { if (typeof window.showAdminSettings === 'function') window.showAdminSettings(); },
    showCurrencySwitcher: function() { if (window.SP && typeof window.SP.showCurrencySwitcher === 'function') window.SP.showCurrencySwitcher(); },
    retryInitialCloudBootstrap: function() { if (typeof window.retryInitialCloudBootstrap === 'function') window.retryInitialCloudBootstrap(); },
    logout: function() { if (typeof window.logout === 'function') window.logout(); },
    dismissNudge: function(el) { if (typeof window.dismissNudge === 'function') window.dismissNudge(el); }
  };

  function handleShowSection(el) {
    var section = el.dataset.section;
    if (section && typeof window.showSection === 'function') window.showSection(section, el);
  }

  function handleOpenQuickAdd(el) {
    var type = el.dataset.targetSection || el.dataset.type;
    if (type && typeof window.openQuickAdd === 'function') window.openQuickAdd(type, el);
  }

  function handleSwitchMoneyTab(el) {
    var tab = el.dataset.tab;
    if (tab && typeof window.switchMoneyTab === 'function') window.switchMoneyTab(tab);
  }

  function handleSwitchScheduleTab(el) {
    var tab = el.dataset.tab;
    if (tab && typeof window.switchScheduleTab === 'function') window.switchScheduleTab(tab);
  }

  document.addEventListener('click', function(e) {
    var el = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var action = el.dataset.action;
    if (!action) return;

    if (action === 'saveBooking' || action === 'saveExpense' ||
        action === 'saveOtherIncome' || action === 'saveArtist') return;

    if (action === 'showSection') { handleShowSection(el); return; }
    if (action === 'openQuickAdd') { handleOpenQuickAdd(el); return; }
    if (action === 'switchMoneyTab') { handleSwitchMoneyTab(el); return; }
    if (action === 'switchScheduleTab') { handleSwitchScheduleTab(el); return; }

    var fn = MAP[action];
    if (typeof fn === 'function') {
      try { fn(el); }
      catch (err) { console.error('[StarPaper] action "' + action + '" threw:', err); }
    } else if (action && ![
      'showSection', 'openQuickAdd', 'switchMoneyTab', 'switchScheduleTab',
      'showSignupForm', 'showLoginForm', 'showLanding', 'showForgotPassword',
      'signup', 'signInWithGoogle', 'submitForgotPassword',
      'saveBooking', 'saveExpense', 'saveOtherIncome', 'saveArtist',
      'saveProfileChanges', 'showDetailView',
      'landingFeaturePrev', 'landingFeatureNext'
    ].includes(action)) {
      console.warn('[StarPaper] No handler for "' + action + '". window.' + action + '=', typeof window[action]);
    }
  }, true);
})();

(function forgotPasswordActions() {
  function closestAction(event, action) {
    return event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-action="' + action + '"]')
      : null;
  }

  window.showForgotPassword = function showForgotPassword() {
    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var forgotForm = document.getElementById('forgotPasswordForm');
    var result = document.getElementById('forgotPasswordResult');
    var emailInput = document.getElementById('forgotEmail');
    var heading = document.getElementById('loginBoxHeading');
    var subtext = document.getElementById('loginBoxSubtext');
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'none';
    if (forgotForm) forgotForm.style.display = 'block';
    if (result) {
      result.textContent = '';
      result.className = 'forgot-password-hint';
    }
    if (emailInput) emailInput.value = '';
    if (heading) heading.textContent = 'Reset your password';
    if (subtext) subtext.textContent = 'Enter your account email to receive secure reset instructions.';
  };

  window.submitForgotPassword = async function submitForgotPassword() {
    var email = (document.getElementById('forgotEmail')?.value || '').trim();
    var result = document.getElementById('forgotPasswordResult');
    if (!result) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      result.textContent = 'Please enter a valid email address.';
      result.className = 'forgot-password-hint forgot-password-hint--error';
      return;
    }
    result.textContent = 'Sending reset instructions...';
    result.className = 'forgot-password-hint';
    try {
      if (window.SP?.client?.auth?.resetPasswordForEmail) {
        var redirectTo = typeof window.SP.getPasswordResetRedirectUrl === 'function'
          ? window.SP.getPasswordResetRedirectUrl()
          : new URL(window.location.pathname || '/', window.location.origin).toString();
        var resetResult = await window.SP.client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
        if (resetResult?.error) {
          console.warn('[StarPaper] Password reset request was not accepted by Supabase:', resetResult.error);
        }
      } else {
        console.warn('[StarPaper] Password reset skipped because Supabase auth is not ready.');
      }
    } catch (err) {
      console.warn('[StarPaper] Password reset request failed:', err);
    }
    result.textContent = 'If an account exists for that email, reset instructions will arrive shortly.';
    result.className = 'forgot-password-hint forgot-password-hint--success';
  };

  document.addEventListener('click', function(e) {
    if (closestAction(e, 'showForgotPassword')) {
      e.preventDefault();
      window.showForgotPassword();
    }
    if (closestAction(e, 'submitForgotPassword')) {
      e.preventDefault();
      window.submitForgotPassword();
    }
  });
})();
