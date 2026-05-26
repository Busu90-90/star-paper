/**
 * Star Paper - UI Initialization Engine
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Fade-In Animations (Intersection Observer)
    initScrollAnimations();
    installBrandImageFallbacks();
    harmonizeSectionIcons();
    updateAppHeaderIcon('dashboard');
    updateLandingTopControlsVisibility();
    initializeBootSequence();

    // 2. Initialize App State
    console.log("Star Paper: Branding and assets initialized successfully.");
});

/**
 * High-performance observer for smooth image entry
 */
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

const STAR_PAPER_IMAGE_FALLBACK = '/favicon.ico';

function applyBrandImageFallback(img) {
    if (!img || img.dataset.spBrandFallbackApplied === '1') return;
    img.dataset.spBrandFallbackApplied = '1';
    img.removeAttribute('srcset');
    img.src = STAR_PAPER_IMAGE_FALLBACK;
}

function installBrandImageFallbacks(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const selector = [
        'img[src*="star_paper_logo_pack"]',
        'img[srcset*="star_paper_logo_pack"]'
    ].join(',');
    root.querySelectorAll(selector).forEach((img) => {
        if (img.dataset.spBrandFallbackBound !== '1') {
            img.dataset.spBrandFallbackBound = '1';
            img.addEventListener('error', () => applyBrandImageFallback(img));
        }
        if (img.complete && img.naturalWidth === 0) {
            applyBrandImageFallback(img);
        }
    });
}
window.installBrandImageFallbacks = installBrandImageFallbacks;

function isBootRevealBlockingState(state) {
    return ['booting-auth', 'loading-session', 'signing-in', 'booting-data', 'loading-app'].includes(state);
}

let spBootTransitionId = 0;

function isAppShellPaintReady() {
    const app = document.getElementById('appContainer');
    if (!app || !window.__spAppBooted) return false;
    return isAppShellVisible();
}

function isAppShellVisible() {
    const app = document.getElementById('appContainer');
    if (!app) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(app) : null;
    const isVisible = app.classList.contains('screen-active') &&
        app.style.display !== 'none' &&
        (!style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0));
    if (!isVisible) return false;
    const rect = app.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
window.isAppShellVisible = isAppShellVisible;

function isCurrentBootTransition(flowId) {
    return !flowId || Number(flowId) === spBootTransitionId;
}

function hideBootLoaderElement(options = {}) {
    if (options.flowId && !isCurrentBootTransition(options.flowId)) return;
    if (window.__spBootRevealPending && options.force !== true) {
        hideBootLoaderWhenUiPainted({ requireAppReady: true, minDelayMs: 120, flowId: options.flowId });
        return;
    }
    window.__spBootRevealPending = false;
    document.documentElement.classList.remove('sp-force-boot');
    const loader = document.getElementById('appBootLoader');
    if (!loader) return;
    const actions = document.getElementById('appBootLoaderActions');
    if (actions) {
        actions.hidden = true;
    }
    loader.classList.add('hidden');
    loader.setAttribute('aria-hidden', 'true');
}

function hideBootLoaderWhenUiPainted(options = {}) {
    const minDelayMs = Number.isFinite(options.minDelayMs)
        ? Math.max(0, Number(options.minDelayMs))
        : 0;
    const requireAppReady = options.requireAppReady === true;
    const flowId = options.flowId || null;
    const startedAt = Date.now();

    const hideWhenReady = () => {
        if (flowId && !isCurrentBootTransition(flowId)) return;
        const appReady = !requireAppReady || isAppShellPaintReady();
        const elapsed = Date.now() - startedAt;
        if (appReady && elapsed >= minDelayMs) {
            hideBootLoaderElement({ force: true, flowId });
            return;
        }
        setTimeout(hideWhenReady, appReady ? Math.max(0, minDelayMs - elapsed) : 80);
    };

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(hideWhenReady);
    } else {
        setTimeout(hideWhenReady, 0);
    }
}

function showBootLoaderElement() {
    document.documentElement.classList.add('sp-force-boot');
    const loader = document.getElementById('appBootLoader');
    if (!loader) return;
    loader.classList.remove('hidden');
    loader.setAttribute('aria-hidden', 'false');
}

window.hideBootLoaderElement = hideBootLoaderElement;
window.hideBootLoaderWhenUiPainted = hideBootLoaderWhenUiPainted;
window.showBootLoaderElement = showBootLoaderElement;
window.isCurrentBootTransition = isCurrentBootTransition;
window.getBootTransitionId = () => spBootTransitionId;

const APP_BOOT_CONTEXT_STORAGE_KEY = 'sp_boot_context';
const APP_BOOT_CONTEXT_APP_SHELL = 'app-shell';
const APP_BOOT_CONTEXT_AUTH_RETURN = 'auth-return';
const SP_ROUTE_APP_PATHS = new Set(['/', '/index.html']);
const SP_ROUTE_PUBLIC_PATHS = new Set([
    '/',
    '/index.html',
    '/how-it-works',
    '/how-it-works.html',
    '/proof',
    '/proof.html',
    '/testimonials',
    '/testimonials.html'
]);
const SP_ROUTE_PUBLIC_LINK_PATHS = new Set([
    '/how-it-works',
    '/how-it-works.html',
    '/proof',
    '/proof.html',
    '/testimonials',
    '/testimonials.html'
]);
const SP_ROUTE_APP_SECTIONS = new Set([
    'artists',
    'bookings',
    'calendar',
    'dashboard',
    'expenses',
    'financials',
    'global',
    'money',
    'otherIncome',
    'reports',
    'schedule',
    'settings',
    'tasks'
]);
const SP_ROUTE_APP_SECTION_ALIASES = new Map(
    Array.from(SP_ROUTE_APP_SECTIONS).map((section) => [section.toLowerCase(), section])
);

function hasAuthCallbackParams(href = window.location.href) {
    try {
        const url = new URL(href);
        const hashParams = new URLSearchParams((url.hash || '').replace(/^#/, ''));
        return Boolean(
            hashParams.get('access_token') ||
            hashParams.get('refresh_token') ||
            url.searchParams.get('access_token') ||
            url.searchParams.get('refresh_token') ||
            url.searchParams.get('code') ||
            url.searchParams.get('error') ||
            url.searchParams.get('error_code') ||
            url.searchParams.get('error_description')
        );
    } catch (_err) {
        return false;
    }
}

function readBootContextMarker() {
    try {
        return sessionStorage.getItem(APP_BOOT_CONTEXT_STORAGE_KEY) || '';
    } catch (_err) {
        return '';
    }
}

function setAppShellBootContext() {
    try {
        sessionStorage.setItem(APP_BOOT_CONTEXT_STORAGE_KEY, APP_BOOT_CONTEXT_APP_SHELL);
    } catch (_err) {
        // Ignore sessionStorage failures in private browsing / restrictive contexts.
    }
}

function setAuthReturnBootContext() {
    try {
        sessionStorage.setItem(APP_BOOT_CONTEXT_STORAGE_KEY, APP_BOOT_CONTEXT_AUTH_RETURN);
    } catch (_err) {
        // Ignore sessionStorage failures in private browsing / restrictive contexts.
    }
}

function clearAppShellBootContext() {
    try {
        sessionStorage.removeItem(APP_BOOT_CONTEXT_STORAGE_KEY);
    } catch (_err) {
        // Ignore sessionStorage failures in private browsing / restrictive contexts.
    }
}

function normalizeRoutePathname(pathname = window.location.pathname) {
    return (String(pathname || '/').replace(/\/+$/, '') || '/');
}

function isAppShellPath(pathname = window.location.pathname) {
    return SP_ROUTE_APP_PATHS.has(normalizeRoutePathname(pathname));
}

function getAppHashSection(hash = window.location.hash) {
    try {
        const raw = decodeURIComponent(String(hash || '').replace(/^#/, '')).trim();
        if (!raw) return '';
        const section = raw.split(/[?&/]/)[0];
        return SP_ROUTE_APP_SECTIONS.has(section)
            ? section
            : (SP_ROUTE_APP_SECTION_ALIASES.get(section.toLowerCase()) || '');
    } catch (_err) {
        return '';
    }
}

function isPublicShellRoute(locationLike = window.location) {
    const pathname = normalizeRoutePathname(locationLike?.pathname || window.location.pathname);
    return SP_ROUTE_PUBLIC_PATHS.has(pathname) && !getAppHashSection(locationLike?.hash || window.location.hash);
}

function shouldBootAuthenticatedApp(locationLike = window.location) {
    try {
        if (localStorage.getItem('sp_logged_out') === '1') return false;
    } catch (_err) {}
    const href = locationLike?.href || window.location.href;
    if (hasAuthCallbackParams(href)) return false;
    return isAppShellPath(locationLike?.pathname || window.location.pathname) &&
        Boolean(getAppHashSection(locationLike?.hash || window.location.hash));
}

window.isAppShellPath = isAppShellPath;
window.getAppHashSection = getAppHashSection;
window.isPublicShellRoute = isPublicShellRoute;
window.shouldBootAuthenticatedApp = shouldBootAuthenticatedApp;

function sanitizeOutboundPublicHref(href) {
    try {
        const originalHref = String(href || '');
        if (!originalHref) return originalHref;
        const url = new URL(originalHref, window.location.href);
        if (url.origin !== window.location.origin) return originalHref;
        const pathname = normalizeRoutePathname(url.pathname);
        if (!SP_ROUTE_PUBLIC_LINK_PATHS.has(pathname)) return originalHref;
        if (!getAppHashSection(url.hash)) return originalHref;
        return `${url.pathname}${url.search || ''}`;
    } catch (_err) {
        return href;
    }
}
window.sanitizeOutboundPublicHref = sanitizeOutboundPublicHref;

function installOutboundPublicLinkSanitizer() {
    if (window.__spOutboundPublicLinkSanitizerInstalled) return;
    window.__spOutboundPublicLinkSanitizerInstalled = true;
    document.addEventListener('click', (event) => {
        const rawTarget = event.target;
        const elementTarget = rawTarget?.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
        const anchor = elementTarget?.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        const sanitized = sanitizeOutboundPublicHref(href);
        if (sanitized && sanitized !== href) {
            anchor.setAttribute('href', sanitized);
        }
    }, true);
}
installOutboundPublicLinkSanitizer();

function getStartupBootContext() {
    if (hasAuthCallbackParams()) {
        return 'auth-callback';
    }
    const marker = readBootContextMarker();
    if (marker === APP_BOOT_CONTEXT_AUTH_RETURN) {
        return 'auth-callback';
    }
    if (shouldBootAuthenticatedApp()) return 'app-refresh';
    return 'cold-start';
}

function isLocalDevOrigin() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function hasStoredCloudSessionHint() {
    try {
        return Boolean(window.__spSupabaseConfigured) &&
            localStorage.getItem('sp-starpaper-auth-v1') &&
            localStorage.getItem('sp_logged_out') !== '1';
    } catch (_err) {
        return false;
    }
}

function getPublicAuthIntent(href = window.location.href) {
    try {
        const url = new URL(href);
        const hash = decodeURIComponent(String(url.hash || '').replace(/^#/, '')).trim().toLowerCase();
        const authParam = String(url.searchParams.get('auth') || url.searchParams.get('screen') || '').trim().toLowerCase();
        if (authParam === 'signup' || authParam === 'register' || hash === 'signup' || hash === 'create-account') {
            return 'signup';
        }
        if (authParam === 'login' || authParam === 'signin' || hash === 'login' || hash === 'signin') {
            return 'login';
        }
    } catch (_err) {}
    return '';
}
window.getPublicAuthIntent = getPublicAuthIntent;

function isSupabaseBootWorkActive() {
    if (!window.__spSupabaseConfigured) return false;
    return Boolean(
        window.__spCloudBootstrapPending ||
        window.__spSupabaseBootPromise ||
        window.__spAuthRedirectInProgress
    );
}

function shouldUseInstantPublicReveal(options = {}) {
    if (options.keepLoader === true) return false;
    if (options.instant === true || options.publicReveal === true || options.skipBoot === true) return true;
    if (hasAuthCallbackParams() || shouldBootAuthenticatedApp() || isSupabaseBootWorkActive()) return false;
    return getStartupBootContext() === 'cold-start';
}

function shouldSuppressBootLoaderForReason(reason = '', state = '', options = {}) {
    if (!shouldUseInstantPublicReveal(options)) return false;
    const bootReason = String(reason || '').toLowerCase();
    const bootState = String(state || '').toLowerCase();
    return bootReason.includes('cold-start') ||
        bootReason === 'show-landing' ||
        bootReason === 'show-login' ||
        bootReason === 'show-signup' ||
        bootState === 'auth-required';
}

function revealPublicScreenInstant(targetScreen = 'landingScreen') {
    window.__spBootRevealPending = false;
    if (typeof setActiveScreen === 'function') {
        setActiveScreen(targetScreen);
    }
    hideBootLoaderElement({ force: true });
}

function resetCloudSaveInFlightFlags(reason = 'ui-not-app') {
    window.__spCloudSaveInFlightCount = 0;
    window.__spCloudSaveInFlight = false;
    window.__spCloudSaveInFlightReason = reason;
}

window.__spResetCloudSaveInFlightFlags = resetCloudSaveInFlightFlags;

function isScreenElementVisible(id) {
    const element = document.getElementById(id);
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
}

function shouldWarnBeforeUnload() {
    const count = Number(window.__spCloudSaveInFlightCount || 0);
    if (window.__spCloudSaveInFlight !== true || count <= 0) return false;
    if (isSupabaseBootWorkActive()) return false;
    if (isScreenElementVisible('landingScreen') || isScreenElementVisible('loginScreen')) return false;
    const loader = document.getElementById('appBootLoader');
    const loaderVisible = loader && getComputedStyle(loader).display !== 'none' && loader.dataset.state !== 'hidden';
    if (loaderVisible && !window.__spAppBooted) return false;
    if (!isAppShellVisible()) return false;
    const hasAuthenticatedUser = Boolean(
        window.currentUser ||
        (typeof currentUser !== 'undefined' && currentUser) ||
        window.currentManagerId ||
        (typeof currentManagerId !== 'undefined' && currentManagerId)
    );
    return hasAuthenticatedUser;
}

window.__spShouldWarnBeforeUnload = shouldWarnBeforeUnload;

function scheduleLocalBootFallback(bootContext, flowId = null) {
    if (!isLocalDevOrigin() || bootContext === 'auth-callback') return;
    setTimeout(() => {
        if (flowId && !isCurrentBootTransition(flowId)) return;
        const loader = document.getElementById('appBootLoader');
        if (loader?.dataset.state !== 'loading-session') return;
        if (isAppShellVisible()) {
            hideBootLoaderElement({ force: true });
            return;
        }
        if (window.__spAppBooted) return;
        if (isSupabaseBootWorkActive()) {
            return;
        }
        if (bootContext === 'app-refresh' || shouldBootAuthenticatedApp()) {
            setBootState('boot-error', {
                text: 'Session restore stalled',
                subtext: 'Retry to reconnect to Star Paper, or log out and sign in again.',
                showActions: true
            });
            return;
        }
        clearAppShellBootContext();
        commitBootTransition('landingScreen', {
            flowId,
            reason: 'local-boot-fallback',
            minDelayMs: 80
        });
    }, 8000);
}

const BOOT_STATE_MESSAGES = {
    'booting-auth': {
        text: 'Loading session...',
        subtext: 'Checking your secure cloud session...'
    },
    'loading-session': {
        text: 'Loading session...',
        subtext: 'Checking your secure cloud session...'
    },
    'signing-in': {
        text: 'Signing in...',
        subtext: 'Opening your workspace securely...'
    },
    'booting-data': {
        text: 'Syncing your workspace...',
        subtext: 'Fetching your latest cloud data.'
    },
    'loading-app': {
        text: 'Loading Star Paper...',
        subtext: 'Preparing your dashboard...'
    },
    'signing-out': {
        text: 'Signing out...',
        subtext: 'Taking you back to Star Paper.'
    },
    'auth-required': {
        text: 'Sign in to continue',
        subtext: 'Your session is not active right now.'
    },
    'boot-error': {
        text: 'Cloud sync needs attention',
        subtext: 'We could not load your workspace. Retry or log out.'
    },
    'ready': {
        text: 'Ready',
        subtext: ''
    }
};

function setBootState(state, options = {}) {
    const loader = document.getElementById('appBootLoader');
    if (!loader) return;
    if (state === 'boot-error' && isAppShellVisible()) {
        hideBootLoaderElement({ force: true });
        return;
    }
    const preset = BOOT_STATE_MESSAGES[state] || BOOT_STATE_MESSAGES['booting-auth'];
    const nextText = options.text || preset.text;
    const nextSubtext = options.subtext ?? preset.subtext;
    const showActions = Boolean(options.showActions || state === 'boot-error');
    loader.dataset.state = state;
    window.__spBootRevealPending = isBootRevealBlockingState(state);
    showBootLoaderElement();

    const textEl = document.getElementById('appBootLoaderText');
    if (textEl) textEl.textContent = nextText;
    const subtextEl = document.getElementById('appBootLoaderSubtext');
    if (subtextEl) {
        subtextEl.textContent = nextSubtext;
        subtextEl.hidden = !nextSubtext;
    }
    const actionsEl = document.getElementById('appBootLoaderActions');
    if (actionsEl) {
        actionsEl.hidden = !showActions;
    }
}
window.setBootState = setBootState;

function beginBootTransition(reason = 'boot', state = 'loading-session', options = {}) {
    spBootTransitionId += 1;
    const flowId = spBootTransitionId;
    window.__spBootTransitionReason = reason;
    window.__spBootTransitionTarget = '';
    window.__spBootRevealPending = true;
    if (shouldSuppressBootLoaderForReason(reason, state, options)) {
        window.__spBootRevealPending = false;
        return flowId;
    }
    if (state) {
        setBootState(state, options);
    } else {
        showBootLoaderElement();
    }
    return flowId;
}

function commitBootTransition(target, options = {}) {
    const flowId = options.flowId || spBootTransitionId;
    if (flowId && !isCurrentBootTransition(flowId)) return false;
    const targetScreen = target || options.target;
    if (!targetScreen) return false;

    if (options.state) {
        setBootState(options.state, options);
    }
    if (typeof setActiveScreen === 'function') {
        setActiveScreen(targetScreen);
    }

    window.__spBootTransitionTarget = targetScreen;
    const shouldHideLoader = options.hideLoader !== false;
    if (!shouldHideLoader) return true;

    hideBootLoaderWhenUiPainted({
        flowId,
        requireAppReady: options.requireAppReady === true || targetScreen === 'appContainer',
        minDelayMs: Number.isFinite(options.minDelayMs) ? options.minDelayMs : 180
    });
    return true;
}

window.beginBootTransition = beginBootTransition;
window.commitBootTransition = commitBootTransition;

function markRootLayoutReady() {
    document.body.classList.add('loaded', 'layout-root-ready');
    // Do NOT add layout-ready to appContainer here - only when user logs in
}

function initializeBootSequence() {
    markRootLayoutReady();
    const bootContext = getStartupBootContext();
    window.__spBootContext = bootContext;

    if (bootContext === 'auth-callback' || bootContext === 'app-refresh') {
        const flowId = beginBootTransition(`startup:${bootContext}`, 'loading-session');
        scheduleLocalBootFallback(bootContext, flowId);
        return;
    }

    const publicAuthIntent = getPublicAuthIntent();
    if (publicAuthIntent === 'signup' && typeof showSignupForm === 'function') {
        showSignupForm({ instant: true });
        return;
    }
    if (publicAuthIntent === 'login' && typeof showLoginForm === 'function') {
        showLoginForm({ instant: true });
        return;
    }
    revealPublicScreenInstant('landingScreen');
}

function getSectionIconMarkup(iconKey) {
        // All icons use Phosphor — <i class="ph ph-*"> for consistent rendering
        const phClass = {
            money:      'ph-currency-circle-dollar',
            schedule:   'ph-calendar-blank',
            dashboard:  'ph-house',
            artists:    'ph-microphone-stage',
            bookings:   'ph-calendar-check',
            financials: 'ph-chart-bar',
            expenses:   'ph-receipt',
            tour:       'ph-globe',
            global:     'ph-globe-hemisphere-east',
            otherIncome:'ph-plus-circle',
            calendar:   'ph-calendar-blank',
            reports:    'ph-clipboard-text',
            tasks:      'ph-clipboard-text',
            settings:   'ph-gear-six',
        };
        const cls = phClass[iconKey] || phClass.dashboard;
        return `<i class="ph ${cls}" aria-hidden="true"></i>`;
}

// Ensure all existing functions from your previous index.html 
// (e.g., showLoginForm, signup, saveBooking) are moved here.



        // Storage Helper
        const isCloudOnlyMode = () => Boolean(window.__spCloudOnly);
        const cloudOnlyStorageShadow = {};
        const closingThoughtsMemoryStore = {};

        // Keep small UI navigation state across refresh without persisting core data.
        // sessionStorage survives reloads in the same tab, but clears when the tab closes.
        const SESSION_PERSIST_KEYS = new Set([
            'starPaperLastSection',
            'starPaperLastMoneyTab',
            'starPaperLastScheduleTab'
        ]);

        function loadSessionPersistedValue(key) {
            if (!SESSION_PERSIST_KEYS.has(key)) return undefined;
            try {
                const raw = sessionStorage.getItem(`sp_ui_${key}`);
                if (raw === null) return undefined;
                return JSON.parse(raw);
            } catch (_err) {
                return undefined;
            }
        }

        function saveSessionPersistedValue(key, value) {
            if (!SESSION_PERSIST_KEYS.has(key)) return;
            try {
                const storageKey = `sp_ui_${key}`;
                if (value === null || typeof value === 'undefined') {
                    sessionStorage.removeItem(storageKey);
                    return;
                }
                sessionStorage.setItem(storageKey, JSON.stringify(value));
            } catch (_err) {
                // Ignore sessionStorage failures in private browsing / restrictive contexts.
            }
        }

        const Storage = {
            saveSync(key, value) {
                try {
                    if (isCloudOnlyMode()) {
                        // FIXED: cloud-first mode keeps app-owned prefs/drafts/business data out of localStorage.
                        if (value === null || typeof value === 'undefined') {
                            delete cloudOnlyStorageShadow[key];
                        } else {
                            cloudOnlyStorageShadow[key] = value;
                        }
                        saveSessionPersistedValue(key, value);
                        return true;
                    }
                    if (value === null || typeof value === 'undefined') {
                        delete cloudOnlyStorageShadow[key];
                    } else {
                        cloudOnlyStorageShadow[key] = value;
                    }
                    saveSessionPersistedValue(key, value);
                    // FIXED: app-owned Storage is volatile only; no localStorage fallback remains.
                    return true;
                } catch (err) {
                    console.error('Storage Error:', err);
                    if (err.name === 'QuotaExceededError' && typeof window.toastWarn === 'function') {
                        window.toastWarn('Device storage is almost full. Some data may not save locally.');
                    }
                    return false;
                }
            },
            loadSync(key, fallback = null) {
                try {
                    if (isCloudOnlyMode()) {
                        // FIXED: localStorage is no longer a runtime source of truth in cloud-first mode.
                        return Object.prototype.hasOwnProperty.call(cloudOnlyStorageShadow, key)
                            ? cloudOnlyStorageShadow[key]
                            : (loadSessionPersistedValue(key) ?? fallback);
                    }
                    return Object.prototype.hasOwnProperty.call(cloudOnlyStorageShadow, key)
                        ? cloudOnlyStorageShadow[key]
                        : (loadSessionPersistedValue(key) ?? fallback);
                } catch {
                    return fallback;
                }
            },
            save(key, value) {
                return Promise.resolve(this.saveSync(key, value));
            },
            load(key, fallback = null) {
                return Promise.resolve(this.loadSync(key, fallback));
            }
        };

        // Retired local-auth/data keys kept only for explicit cache cleanup.
        const LEGACY_CLOUD_RUNTIME_KEYS = [
            'starPaperManagerData',
            'starPaperBookings',
            'starPaperExpenses',
            'starPaperOtherIncome',
            'starPaperArtists',
            'starPaperRevenueGoals',
            'starPaperBBF',
            'starPaperClosingThoughtsByPeriod',
            'starPaperAudienceMetrics',
            'sp_tasks',
            'starPaperTasks',
            'starPaperUsers',
            'starPaperCredentials',
            'starPaperCurrentUser',
            'starPaperRemember',
            'starPaper_session',
            'starPaperSessionUser',
            'starPaperSchemaVersion',
            'sp_active_team',
            'spManagers',
            'spPendingUsers'
        ];

        function clearLegacyCloudDataKeys() {
            LEGACY_CLOUD_RUNTIME_KEYS.forEach((key) => {
                delete cloudOnlyStorageShadow[key];
                localStorage.removeItem(key);
            });
        }

        window.clearLegacyCloudDataKeys = clearLegacyCloudDataKeys;
        window.setBootState = setBootState;
        window.showBootLoaderElement = showBootLoaderElement;
        window.hideBootLoaderElement = hideBootLoaderElement;
        window.getStartupBootContext = getStartupBootContext;
        window.setAppShellBootContext = setAppShellBootContext;
        window.setAuthReturnBootContext = setAuthReturnBootContext;
        window.clearAppShellBootContext = clearAppShellBootContext;

        function bindDeclarativeActionFallback() {
            if (window.__starPaperActionsBound || window.__starPaperFallbackActionsBound) return;
            window.__starPaperFallbackActionsBound = true;

            function getElementTarget(event) {
                const rawTarget = event && event.target;
                if (!rawTarget) return null;
                if (rawTarget.nodeType === Node.ELEMENT_NODE) return rawTarget;
                if (rawTarget.nodeType === Node.TEXT_NODE) return rawTarget.parentElement;
                return null;
            }

            function invokeAction(actionName, args = []) {
                const fn = window[actionName];
                if (typeof fn !== 'function') {
                    console.warn(`Action "${actionName}" is not available on window.`);
                    return;
                }
                try {
                    fn(...args);
                } catch (error) {
                    console.error(`Action "${actionName}" failed:`, error);
                }
            }

            function primeDeclarativeAccessibility(scope = document) {
                const targets = scope.querySelectorAll('[data-action]');
                targets.forEach((target) => {
                    const tag = target.tagName;
                    const naturallyFocusable = (
                        tag === 'A' ||
                        tag === 'BUTTON' ||
                        tag === 'INPUT' ||
                        tag === 'SELECT' ||
                        tag === 'TEXTAREA' ||
                        target.hasAttribute('tabindex')
                    );
                    if (!naturallyFocusable) {
                        target.setAttribute('tabindex', '0');
                        if (!target.hasAttribute('role')) {
                            target.setAttribute('role', 'button');
                        }
                    }
                });
            }

            primeDeclarativeAccessibility();

            document.addEventListener('click', (event) => {
                const elementTarget = getElementTarget(event);
                if (!elementTarget || typeof elementTarget.closest !== 'function') return;
                const target = elementTarget.closest('[data-action]');
                if (!target) return;
                const action = target.dataset.action;
                if (!action) return;

                if (target.tagName === 'A') {
                    event.preventDefault();
                }

                switch (action) {
                    case 'showSection': {
                        const section = target.dataset.section;
                        if (section) {
                            invokeAction('showSection', [section, target.closest('.nav-item') || target]);
                        }
                        return;
                    }
                    case 'openQuickAdd': {
                        const targetSection = target.dataset.targetSection || target.dataset.type;
                        if (targetSection) {
                            invokeAction('openQuickAdd', [targetSection, target]);
                        }
                        return;
                    }
                    case 'showDetailView': {
                        const detailKey = target.dataset.detailKey;
                        if (detailKey) {
                            invokeAction('showDetailView', [detailKey]);
                        }
                        return;
                    }
                    case 'switchMoneyTab': {
                        const tabId = target.dataset.tab;
                        if (tabId) switchMoneyTab(tabId);
                        return;
                    }
                    case 'switchScheduleTab': {
                        const tabId = target.dataset.tab;
                        if (tabId) switchScheduleTab(tabId);
                        return;
                    }
                    case 'showAboutModal':
                        showAboutModal();
                        return;
                    case 'showAdminSettings':
                        showAdminSettings();
                        return;
                    case 'showCurrencySwitcher':
                        window.SP?.showCurrencySwitcher?.();
                        return;
                    case 'showHelpCenterAlert':
                        toastInfo('Help documentation coming soon!');
                        return;
                    case 'showContactAlert':
                        toastInfo('Contact: support@starpaper.com');
                        return;
                    default:
                        invokeAction(action);
                }
            });

            document.addEventListener('keydown', (event) => {
                const elementTarget = getElementTarget(event);
                if (!elementTarget || typeof elementTarget.closest !== 'function') return;
                const target = elementTarget.closest('[data-action]');
                if (!target) return;

                const key = event.key;
                if (key !== 'Enter' && key !== ' ') return;

                if (target.matches('button, a, input, select, textarea')) return;
                if (elementTarget.matches('input, textarea, select, [contenteditable="true"]')) return;

                event.preventDefault();
                target.click();
            });

            document.addEventListener('change', (event) => {
                const elementTarget = getElementTarget(event);
                if (!elementTarget || typeof elementTarget.closest !== 'function') return;
                const target = elementTarget.closest('[data-change-action]');
                if (!target) return;
                const action = target.dataset.changeAction;
                if (!action) return;
                invokeAction(action, [event]);
            });

            document.addEventListener('input', (event) => {
                const elementTarget = getElementTarget(event);
                if (!elementTarget || typeof elementTarget.closest !== 'function') return;
                const target = elementTarget.closest('[data-input-action]');
                if (!target) return;
                const action = target.dataset.inputAction;
                if (!action) return;
                invokeAction(action, [event]);
            });
        }

        if (typeof window.bindStarPaperDeclarativeActions === 'function') {
            window.bindStarPaperDeclarativeActions();
        } else {
            bindDeclarativeActionFallback();
        }

        /**
         * Format date as DD-MM-YYYY
         * @param {Date|string} date - Date to format
         * @returns {string} Formatted date string
         */
        function formatDateDDMMYYYY(date) {
            const d = typeof date === 'string' ? new Date(date) : date;
            if (isNaN(d.getTime())) return 'Invalid Date';
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            
            return `${day}-${month}-${year}`;
        }

        /**
         * Format UI date labels without mutating global Date behavior.
         * @param {Date|string} value
         * @returns {string}
         */
        function formatDisplayDate(value) {
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) return 'Invalid Date';
            return formatDateDDMMYYYY(date);
        }

        function sanitizeTextInput(value) {
            return String(value ?? '')
                .replace(/[<>`]/g, '')
                .trim();
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function normalizePhosphorIconClass(value) {
            const iconClass = String(value ?? '').trim();
            return /^ph-[a-z0-9-]+$/i.test(iconClass) ? iconClass : '';
        }

        function escapeXml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        const SP_AVATAR_UPLOAD_MAX_BYTES = 1024 * 1024;
        const SP_RECEIPT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
        const SP_ALLOWED_UPLOAD_IMAGE_TYPES = new Set([
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif'
        ]);

        function isSafeImageDataUrl(value) {
            return /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(String(value || '').trim());
        }

        function normalizeSafeImageSource(value, fallback = '') {
            const raw = String(value || '').trim();
            if (!raw) return fallback;
            if (isSafeImageDataUrl(raw)) return raw;
            if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) return raw;
            if (raw.startsWith('./') && !raw.includes('\\')) return raw;
            try {
                const url = new URL(raw, window.location.origin);
                if (url.protocol === 'https:') return url.href;
                if (url.origin === window.location.origin && (url.protocol === 'http:' || url.protocol === 'https:')) {
                    return `${url.pathname}${url.search}${url.hash}`;
                }
            } catch (_err) {}
            return fallback;
        }

        function validateImageUpload(file, { label = 'Image', maxBytes = SP_AVATAR_UPLOAD_MAX_BYTES } = {}) {
            if (!file) return false;
            if (!SP_ALLOWED_UPLOAD_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
                toastError(`${label} must be a PNG, JPG, WebP, or GIF image.`);
                return false;
            }
            if (file.size > maxBytes) {
                const sizeMb = Math.round(maxBytes / (1024 * 1024));
                toastError(`${label} must be ${sizeMb} MB or smaller.`);
                return false;
            }
            return true;
        }

        function readValidatedImageDataUrl(file, options = {}) {
            if (!validateImageUpload(file, options)) return Promise.resolve('');
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const result = normalizeSafeImageSource(reader.result);
                    if (!result) {
                        toastError(`${options.label || 'Image'} could not be read safely.`);
                    }
                    resolve(result);
                };
                reader.onerror = () => {
                    toastError(`${options.label || 'Image'} could not be read.`);
                    resolve('');
                };
                reader.readAsDataURL(file);
            });
        }

        // FIXED: cloud UUIDs and legacy numeric IDs are compared consistently across inline actions.
        function isSameRecordId(left, right) {
            return String(left ?? '') === String(right ?? '');
        }

        function formatCurrencyDisplay(value) {
            const amount = Number(value);
            const normalized = Number.isFinite(amount) ? amount : 0;
            if (typeof window.SP_formatCurrencyFull === 'function') {
                return window.SP_formatCurrencyFull(normalized);
            }
            if (typeof window.SP_formatCurrency === 'function') {
                return window.SP_formatCurrency(normalized);
            }
            return `UGX ${Math.round(normalized).toLocaleString()}`;
        }



        // Data Storage
        let users = [];
        let artists = [];
        let managerData = {};
        let revenueGoals = {};
        let bbfData = {};
        let bbfViewState = Storage.loadSync('starPaperBBFViewState', {});
        if (!bbfViewState || typeof bbfViewState !== 'object' || Array.isArray(bbfViewState)) bbfViewState = {};
        let audienceMetricsStore = {};
        let audienceMetrics = [];
        let currentUser = null;
        let currentManagerId = null;
        let currentTeamRole = null;
        let currentTeamPermissions = null;
        let bookings = [];
        let expenses = [];
        let otherIncome = [];
        const cloudHydrationByScope = {};
        let performanceChart = null;
        let currentCalendarDate = new Date();
        let selectedCalendarDate = null;
        let editingBookingId = null;
        let editingExpenseId = null;
        let editingOtherIncomeId = null;
        let editingArtistId = null;
        let searchIndexCache = [];
        let searchIndexDirty = true;
        let searchInputDebounceTimer = null;
        let pendingProfileAvatarValue = '';
        let pendingArtistAvatarValue = '';
        const CLOSING_THOUGHTS_STORAGE_KEY = 'starPaperClosingThoughtsByPeriod';
        const REPORT_LOGO_ASSET_VERSION = '3';
        const RETIRED_ARTIST_NAME_SET = new Set(['cinderella sanyu']);
        const dashboardWeatherCache = {
            geocode: new Map(),
            forecast: new Map()
        };

        function markSearchIndexDirty() {
            searchIndexDirty = true;
        }

        function refreshDataStoresFromStorage() {
            if (window.__spCloudOnly) {
                return;
            }
            const loadedUsers = Storage.loadSync('starPaperUsers', []);
            users = Array.isArray(loadedUsers) ? loadedUsers : [];
            const loadedArtists = Storage.loadSync('starPaperArtists', []);
            artists = Array.isArray(loadedArtists) ? loadedArtists : [];
            const loadedManagerData = Storage.loadSync('starPaperManagerData', {});
            managerData = loadedManagerData && typeof loadedManagerData === 'object' && !Array.isArray(loadedManagerData) ? loadedManagerData : {};
            const loadedRevenueGoals = Storage.loadSync('starPaperRevenueGoals', {});
            revenueGoals = loadedRevenueGoals && typeof loadedRevenueGoals === 'object' && !Array.isArray(loadedRevenueGoals) ? loadedRevenueGoals : {};
            const loadedBBF = Storage.loadSync('starPaperBBF', {});
            bbfData = loadedBBF && typeof loadedBBF === 'object' && !Array.isArray(loadedBBF) ? loadedBBF : {};
            const loadedAudienceMetrics = Storage.loadSync('starPaperAudienceMetrics', {});
            audienceMetricsStore = loadedAudienceMetrics && typeof loadedAudienceMetrics === 'object' && !Array.isArray(loadedAudienceMetrics)
                ? loadedAudienceMetrics
                : {};
        }

        function saveIdentityStores() {
            if (window.__spCloudOnly) {
                return;
            }
            Storage.saveSync('starPaperUsers', users);
            Storage.saveSync('starPaperArtists', artists);
        }

        function getUsers() {
            return users;
        }

        function getArtists() {
            return artists;
        }

        function normalizeUsername(value) {
            return String(value || '').trim().toLowerCase();
        }

        function findUserByUsername(username) {
            return users.find((user) => user?.username === username) || null;
        }

        function findUserByUsernameInsensitive(username) {
            const normalized = normalizeUsername(username);
            if (!normalized) return null;
            return users.find((user) => normalizeUsername(user?.username) === normalized) || null;
        }

        function findUserById(id) {
            return users.find((user) => user?.id === id) || null;
        }

        function getCurrentUserRecord() {
            const profile = typeof window.SP?.getProfileState === 'function'
                ? (window.SP.getProfileState() || null)
                : null;
            if (window.__spCloudOnly) {
                return {
                    id: profile?.id || window.SP?.getOwnerId?.() || null,
                    username: profile?.username || currentUser || '',
                    email: profile?.email || '',
                    phone: profile?.phone || '',
                    bio: profile?.bio || '',
                    avatar: profile?.avatar || profile?.avatar_url || ''
                };
            }
            const localRecord = findUserByUsername(currentUser);
            if (!profile) return localRecord;
            return {
                ...localRecord,
                id: profile.id || localRecord?.id || null,
                username: profile.username || localRecord?.username || currentUser || '',
                email: profile.email || localRecord?.email || '',
                phone: profile.phone || localRecord?.phone || '',
                bio: profile.bio || localRecord?.bio || '',
                avatar: profile.avatar_url || profile.avatar || localRecord?.avatar || ''
            };
        }

        function avatarDataUriFromSymbol(symbol) {
            const token = String(symbol || '').trim();
            if (!token) return '';
            const safeToken = escapeXml(token.slice(0, 2).toUpperCase());
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
                    <defs>
                        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#FFB300" />
                            <stop offset="100%" stop-color="#D4AF37" />
                        </linearGradient>
                    </defs>
                    <rect width="256" height="256" rx="128" fill="url(#g)" />
                    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-size="118">${safeToken}</text>
                </svg>
            `.trim();
            const encoded = window.btoa(unescape(encodeURIComponent(svg)));
            return `data:image/svg+xml;base64,${encoded}`;
        }

        function resolveDisplayAvatar(user) {
            const raw = String(user?.avatar || '').trim();
            if (!raw) return '/star_paper_logo_pack/star_paper_128.png?v=3';
            const safeImage = normalizeSafeImageSource(raw);
            if (safeImage) return safeImage;
            return avatarDataUriFromSymbol(raw);
        }

        function isBrandLogoAsset(src) {
            const value = String(src || '').trim().toLowerCase();
            if (!value) return false;
            return [
                'star_paper_32.png',
                'star_paper_64.png',
                'star_paper_128.png',
                'star_paper_256.png',
                'star_paper_512.png',
                'star_paper_1024.png',
                'star_paper_transparent.png',
                'star_paper_black.png',
                'star_paper_white.png'
            ].some((token) => value.includes(token));
        }

        function syncBrandMarkPresentation(img, src) {
            if (!img) return;
            const activeSrc = String(src || img.getAttribute('src') || img.src || '').trim();
            const isBrandMark = isBrandLogoAsset(activeSrc);
            img.classList.toggle('avatar-img--brand-mark', isBrandMark);
            const frame = img.closest('.sidebar-avatar');
            if (frame) {
                frame.classList.toggle('sidebar-avatar--brand-mark', isBrandMark);
            }
        }

        function resolveDisplayArtistAvatar(artist) {
            const raw = String(artist?.avatar || '').trim();
            if (raw) {
                const safeImage = normalizeSafeImageSource(raw);
                if (safeImage) return safeImage;
                return avatarDataUriFromSymbol(raw);
            }
            const initial = String(artist?.name || '?').trim().charAt(0).toUpperCase() || '?';
            return avatarDataUriFromSymbol(initial);
        }

        function updateArtistAvatarPreview(src) {
            const preview = document.getElementById('artistAvatarPreview');
            if (!preview) return;
            preview.src = src || '';
        }

        async function handleArtistAvatarUpload(event) {
            const file = event?.target?.files?.[0];
            if (!file) return;
            const result = await readValidatedImageDataUrl(file, {
                label: 'Artist photo',
                maxBytes: SP_AVATAR_UPLOAD_MAX_BYTES
            });
            if (!result) return;
            pendingArtistAvatarValue = result;
            updateArtistAvatarPreview(result);
        }

        function updateHeaderGreeting() {
            const userNameEl = document.getElementById('userName');
            if (!userNameEl) return;
            const user = getCurrentUserRecord();
            const displayName = String(user?.username || currentUser || '').trim();
            if (!displayName) {
                userNameEl.textContent = '';
                userNameEl.style.display = 'none';
                return;
            }
            userNameEl.textContent = `Hi, ${displayName}`;
            userNameEl.style.display = 'inline';
        }

        function refreshProfileUI() {
            const user = getCurrentUserRecord();
            const displayName = user?.username || currentUser || 'Manager';
            const displayEmail = user?.email || 'Profile details';
            const displayBio = user?.bio || 'Manage your identity, photo, contact details, and bio.';
            const sidebarName = document.getElementById('sidebarUserName');
            if (sidebarName) {
                sidebarName.textContent = displayName;
            }
            const avatarSrc = resolveDisplayAvatar(user);
            const sidebarAvatar = document.getElementById('sidebarAvatarImg');
            if (sidebarAvatar) {
                sidebarAvatar.src = avatarSrc;
                syncBrandMarkPresentation(sidebarAvatar, avatarSrc);
            }
            const settingsName = document.getElementById('settingsProfileName');
            if (settingsName) {
                settingsName.textContent = displayName;
            }
            const settingsEmail = document.getElementById('settingsProfileEmail');
            if (settingsEmail) {
                settingsEmail.textContent = displayEmail;
            }
            const settingsBio = document.getElementById('settingsProfileBio');
            if (settingsBio) {
                settingsBio.textContent = displayBio;
            }
            const settingsAvatar = document.getElementById('settingsAvatarImg');
            if (settingsAvatar) {
                settingsAvatar.src = avatarSrc;
                syncBrandMarkPresentation(settingsAvatar, avatarSrc);
            }
            const profilePreview = document.getElementById('profileAvatarPreview');
            if (profilePreview) {
                const previewSrc = pendingProfileAvatarValue || avatarSrc;
                profilePreview.src = previewSrc;
                syncBrandMarkPresentation(profilePreview, previewSrc);
            }
            installBrandImageFallbacks();
            updateHeaderGreeting();
        }

        function openProfileModal() {
            const profileModal = document.getElementById('profileModal');
            const user = getCurrentUserRecord();
            if (!profileModal || !user) return;
            pendingProfileAvatarValue = '';
            const usernameInput = document.getElementById('profileUsername');
            const passwordInput = document.getElementById('profilePassword');
            const emailInput = document.getElementById('profileEmail');
            const phoneInput = document.getElementById('profilePhone');
            const bioInput = document.getElementById('profileBio');
            const avatarPreview = document.getElementById('profileAvatarPreview');
            if (usernameInput) usernameInput.value = user.username || '';
            if (passwordInput) passwordInput.value = '';
            if (emailInput) emailInput.value = user.email || '';
            if (phoneInput) phoneInput.value = user.phone || '';
            if (bioInput) bioInput.value = user.bio || '';
            if (avatarPreview) {
                const previewSrc = resolveDisplayAvatar(user);
                avatarPreview.src = previewSrc;
                syncBrandMarkPresentation(avatarPreview, previewSrc);
            }
            profileModal.style.display = 'flex';
        }

        function closeProfileModal() {
            const profileModal = document.getElementById('profileModal');
            if (profileModal) {
                profileModal.style.display = 'none';
            }
            const uploadInput = document.getElementById('profileAvatarUpload');
            if (uploadInput) {
                uploadInput.value = '';
            }
            pendingProfileAvatarValue = '';
        }

        async function handleProfileAvatarUpload(event) {
            const file = event?.target?.files?.[0];
            if (!file) return;
            const result = await readValidatedImageDataUrl(file, {
                label: 'Profile photo',
                maxBytes: SP_AVATAR_UPLOAD_MAX_BYTES
            });
            if (!result) return;
            pendingProfileAvatarValue = result;
            const preview = document.getElementById('profileAvatarPreview');
            if (preview) {
                preview.src = result;
                syncBrandMarkPresentation(preview, result);
            }
        }

        function selectProfileAvatarPreset(event) {
            const rawTarget = event && event.target;
            const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
            const button = target?.closest?.('button[data-avatar]');
            if (!button) return;
            const token = button.dataset.avatar || button.textContent || '';
            const avatarUri = avatarDataUriFromSymbol(token);
            if (!avatarUri) return;
            pendingProfileAvatarValue = avatarUri;
            const preview = document.getElementById('profileAvatarPreview');
            if (preview) {
                preview.src = avatarUri;
                syncBrandMarkPresentation(preview, avatarUri);
            }
        }

        async function saveProfileChanges() {
            try {
                const user = getCurrentUserRecord();
                if (!user) return;

                const oldUsername = user.username;
                const nextUsername = sanitizeTextInput(document.getElementById('profileUsername')?.value || oldUsername);
                const nextEmail = sanitizeTextInput(document.getElementById('profileEmail')?.value || '');
                const nextPhone = sanitizeTextInput(document.getElementById('profilePhone')?.value || '');
                const nextBio = sanitizeTextInput(document.getElementById('profileBio')?.value || '');
                const nextPassword = document.getElementById('profilePassword')?.value || '';

                if (!nextUsername) {
                    toastError('Username is required.');
                    return;
                }
                const nextAvatar = pendingProfileAvatarValue || normalizeSafeImageSource(user.avatar) || '';
                const saveBridge = window.SP?.saveAccountProfile;
                if (typeof saveBridge !== 'function') {
                    toastError('Profile sync is not ready yet. Please try again in a moment.');
                    return;
                }

                const result = await saveBridge({
                    username: nextUsername,
                    email: nextEmail,
                    phone: nextPhone,
                    bio: nextBio,
                    avatar: nextAvatar,
                    password: nextPassword
                });

                if (!result?.profile) {
                    toastError(result?.message || 'Could not save profile changes.');
                    return;
                }

                currentUser = result.profile.username || nextUsername || currentUser;
                window.currentUser = currentUser;
                updateCurrentManagerContext();
                markSearchIndexDirty();
                refreshProfileUI();
                const passwordInput = document.getElementById('profilePassword');
                if (passwordInput) {
                    passwordInput.value = '';
                }
                closeProfileModal();
                if (result?.emailConfirmationPending) {
                    toastSuccess(result.message || 'Profile updated. Confirm your new email to finish the email change.');
                } else {
                    toastSuccess(result?.message || 'Profile updated.');
                }
            } catch (error) {
                console.error('Profile save failed:', error);
                toastError(error?.message || 'Could not save profile changes.');
            }
        }

        function findArtistByName(name) {
            const normalized = String(name || '').trim().toLowerCase();
            if (!normalized) return null;
            return artists.find((artist) => String(artist?.name || '').trim().toLowerCase() === normalized) || null;
        }

        function findArtistById(id) {
            const normalized = String(id || '').trim();
            if (!normalized) return null;
            return artists.find((artist) => String(artist?.id || '').trim() === normalized) || null;
        }

        function isRetiredArtistName(name) {
            return RETIRED_ARTIST_NAME_SET.has(String(name || '').trim().toLowerCase());
        }

        function purgeRetiredArtistsForCurrentManager() {
            if (!currentManagerId) return false;

            const removedArtistIds = new Set();
            const nextArtists = [];
            let artistsChanged = false;

            artists.forEach((artist) => {
                if (!artist || artist.managerId !== currentManagerId) {
                    nextArtists.push(artist);
                    return;
                }
                if (!isRetiredArtistName(artist.name)) {
                    nextArtists.push(artist);
                    return;
                }
                if (artist.id) {
                    removedArtistIds.add(artist.id);
                }
                artistsChanged = true;
            });

            if (artistsChanged) {
                artists = nextArtists;
                Storage.saveSync('starPaperArtists', artists);
            }

            const previousBookingCount = bookings.length;
            bookings = bookings.filter((entry) => {
                if (!entry || typeof entry !== 'object') return false;
                if (isRetiredArtistName(entry.artist)) return false;
                if (entry.artistId && removedArtistIds.has(entry.artistId)) return false;
                return true;
            });
            const bookingsChanged = bookings.length !== previousBookingCount;

            if (bookingsChanged) {
                window.bookings = bookings;
            }

            return artistsChanged || bookingsChanged;
        }

        function sanitizeIdChunk(value, fallback = 'id') {
            const base = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            return base || fallback;
        }

        function createRuntimeId(prefix, seed) {
            return `${prefix}_${sanitizeIdChunk(seed, prefix)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        }

        function getAudienceMetricsForScope(scopeKey) {
            if (!scopeKey) return [];
            if (!audienceMetricsStore || typeof audienceMetricsStore !== 'object' || Array.isArray(audienceMetricsStore)) {
                audienceMetricsStore = {};
            }
            const scoped = audienceMetricsStore[scopeKey];
            return Array.isArray(scoped) ? scoped : [];
        }

        function saveAudienceMetricsForScope(scopeKey, entries) {
            if (!scopeKey) return;
            if (!audienceMetricsStore || typeof audienceMetricsStore !== 'object' || Array.isArray(audienceMetricsStore)) {
                audienceMetricsStore = {};
            }
            audienceMetricsStore[scopeKey] = Array.isArray(entries) ? entries : [];
            Storage.saveSync('starPaperAudienceMetrics', audienceMetricsStore);
        }

        function ensureArtistForBookingName(name, managerIdHint = currentManagerId) {
            const artistName = sanitizeTextInput(name);
            if (!artistName) return null;
            let artist = findArtistByName(artistName);
            if (artist) return artist;

            const fallbackManagerId = managerIdHint || users[0]?.id || null;
            if (!fallbackManagerId) return null;

            artist = {
                id: createRuntimeId('artist', artistName),
                name: artistName,
                managerId: fallbackManagerId,
                createdAt: new Date().toISOString(),
                email: '',
                phone: '',
                specialty: '',
                bio: '',
                strategicGoal: '',
                avatar: ''
            };
            artists.push(artist);
            Storage.saveSync('starPaperArtists', artists);
            return artist;
        }

        function ensureBookingArtistRefs(records, managerIdHint = currentManagerId) {
            if (!Array.isArray(records)) return [];
            return records.map((booking) => {
                if (!booking || typeof booking !== 'object') return booking;
                if (booking.artistId && findArtistById(booking.artistId)) return booking;
                const artist = ensureArtistForBookingName(booking.artist, managerIdHint);
                return {
                    ...booking,
                    artistId: artist?.id || booking.artistId || null
                };
            });
        }

        function resolveArtistScope(options = {}) {
            const explicitArtist = options.artist && typeof options.artist === 'object' ? options.artist : null;
            const selectedArtistName = String(options.selectedArtist || '').trim();
            const artistName = String(options.artistName || selectedArtistName || '').trim();
            const artistId = String(options.artistId || '').trim();
            const artist = explicitArtist
                || (artistId ? findArtistById(artistId) : null)
                || (artistName ? findArtistByName(artistName) : null);
            return {
                artist: artist || null,
                artistId: String(artistId || artist?.id || '').trim(),
                artistName: String(artistName || artist?.name || '').trim(),
                hasArtist: Boolean(artistId || artistName || artist?.id || artist?.name)
            };
        }

        function financeRecordMatchesArtist(record, scope) {
            if (!scope?.hasArtist) return true;
            if (!record || typeof record !== 'object') return false;
            const recordArtistId = String(record.artistId || '').trim();
            const recordArtistName = String(record.artist || record.artistName || '').trim().toLowerCase();
            if (scope.artistId && recordArtistId && recordArtistId === scope.artistId) return true;
            if (scope.artistName && recordArtistName && recordArtistName === scope.artistName.toLowerCase()) return true;
            return false;
        }

        function isFinanceRecordShared(record) {
            if (!record || typeof record !== 'object') return false;
            const hasArtistId = Boolean(String(record.artistId || '').trim());
            const hasArtistName = Boolean(String(record.artist || record.artistName || '').trim());
            return !hasArtistId && !hasArtistName;
        }

        function normalizeFinanceArtistRef(record) {
            if (!record || typeof record !== 'object') return record;
            const artist = resolveArtistScope({
                artistId: record.artistId,
                artistName: record.artist || record.artistName
            }).artist;
            if (!artist) {
                return {
                    ...record,
                    artist: String(record.artist || record.artistName || '').trim(),
                    artistId: record.artistId || null
                };
            }
            return {
                ...record,
                artist: artist.name || String(record.artist || record.artistName || '').trim(),
                artistId: artist.id || record.artistId || null
            };
        }

        function ensureFinanceArtistRefs(records) {
            if (!Array.isArray(records)) return [];
            return records.map(normalizeFinanceArtistRef);
        }

        const FINANCE_ARTIST_NAME_VALUE_PREFIX = 'name:';

        function encodeFinanceArtistNameValue(name) {
            return `${FINANCE_ARTIST_NAME_VALUE_PREFIX}${String(name || '')}`;
        }

        function decodeFinanceArtistNameValue(value) {
            const raw = String(value || '');
            return raw.startsWith(FINANCE_ARTIST_NAME_VALUE_PREFIX)
                ? raw.slice(FINANCE_ARTIST_NAME_VALUE_PREFIX.length).trim()
                : '';
        }

        function populateFinanceArtistDropdown(select, selectedValue = '') {
            if (!select) return;
            const currentValue = String(selectedValue || select.value || '').trim();
            const artistList = getArtists();
            select.innerHTML = '<option value="">Roster / Shared</option>' +
                artistList.map((artist) => {
                    const id = escapeHtml(artist?.id || '');
                    const name = escapeHtml(artist?.name || 'Artist');
                    return `<option value="${id}">${name}</option>`;
                }).join('');
            if (currentValue) {
                const knownArtist = findArtistById(currentValue) || findArtistByName(currentValue);
                if (knownArtist?.id) {
                    select.value = knownArtist.id;
                    return;
                }
                const legacyName = decodeFinanceArtistNameValue(currentValue) || currentValue;
                const opt = document.createElement('option');
                opt.value = encodeFinanceArtistNameValue(legacyName);
                opt.textContent = legacyName;
                select.appendChild(opt);
                select.value = opt.value;
            }
        }

        function populateFinanceArtistDropdowns() {
            populateFinanceArtistDropdown(document.getElementById('expenseArtist'));
            populateFinanceArtistDropdown(document.getElementById('otherIncomeArtist'));
        }

        function setFinanceArtistSelectValue(selectId, record) {
            const select = document.getElementById(selectId);
            if (!select) return;
            const artist = resolveArtistScope({
                artistId: record?.artistId,
                artistName: record?.artist || record?.artistName
            }).artist;
            const selectedValue = artist?.id
                || (record?.artist ? encodeFinanceArtistNameValue(record.artist) : '');
            populateFinanceArtistDropdown(select, selectedValue);
        }

        function getFinanceArtistSelection(selectId) {
            const value = String(document.getElementById(selectId)?.value || '').trim();
            if (!value) return null;
            const legacyName = decodeFinanceArtistNameValue(value);
            if (legacyName) return { id: null, name: legacyName };
            const artist = findArtistById(value) || findArtistByName(value);
            return artist ? { id: artist.id || null, name: artist.name || '' } : null;
        }

        function applyFinanceArtistSelection(record, selection) {
            return {
                ...record,
                artistId: selection?.id || null,
                artist: selection?.name || ''
            };
        }

        function getFinanceArtistLabel(record) {
            const artist = resolveArtistScope({
                artistId: record?.artistId,
                artistName: record?.artist || record?.artistName
            }).artist;
            return artist?.name || String(record?.artist || record?.artistName || '').trim() || 'Roster / Shared';
        }

        function getAllMemberNames() {
            const managerNames = getUsers().map((user) => user.username).filter(Boolean);
            const artistNames = getArtists().map((artist) => artist.name).filter(Boolean);
            return Array.from(new Set([...managerNames, ...artistNames]));
        }

        function updateCurrentManagerContext() {
            const ownerId = typeof window.SP?.getOwnerId === 'function' ? window.SP.getOwnerId() : null;
            if (ownerId) {
                currentManagerId = ownerId;
                return;
            }
            const manager = findUserByUsername(currentUser);
            currentManagerId = manager?.id || null;
        }

        function getActiveTeamId() {
            return typeof window.SP?.getActiveTeamId === 'function' ? window.SP.getActiveTeamId() : null;
        }

        function getActiveTeamRole() {
            return typeof window.SP?.getActiveTeamRole === 'function' ? window.SP.getActiveTeamRole() : null;
        }

        function getActiveTeamPermissions() {
            if (typeof window.SP?.getActiveTeamPermissions === 'function') {
                return window.SP.getActiveTeamPermissions();
            }
            return currentTeamPermissions;
        }

        function getActiveDataScopeKey() {
            const teamId = getActiveTeamId();
            if (teamId) return `team:${teamId}`;
            // CRITICAL FIX: Use the Supabase UUID as the primary scope key.
            // currentManagerId is a LOCAL runtime ID ("mgr_xyz_abc") that is
            // re-generated with a different random suffix on every fresh browser.
            // If we used it as the localStorage scope key, Opera would create a
            // DIFFERENT key from Chrome for the same account, making data invisible
            // across devices. The Supabase UID is stable and identity-tied.
            const supabaseUid = window.SP?.getOwnerId?.() || null;
            if (supabaseUid) return supabaseUid;
            // Offline fallback: no cloud session yet, use local ID.
            return String(currentManagerId || currentUser || '');
        }

        function hasTeamPermission(permission) {
            const teamId = getActiveTeamId();
            if (!teamId) return true;
            const access = getActiveTeamPermissions() || {};
            if (access.admin) return true;
            return Boolean(access[permission]);
        }

        function fallbackTeamPermissions(role) {
            const key = String(role || 'viewer').toLowerCase();
            if (key === 'owner' || key === 'admin') return { read: true, edit: true, finance: true, reports: true, admin: true };
            if (key === 'manager' || key === 'editor') return { read: true, edit: true, finance: false, reports: false, admin: false };
            if (key === 'finance') return { read: true, edit: true, finance: true, reports: true, admin: false };
            if (key === 'reports') return { read: true, edit: false, finance: false, reports: true, admin: false };
            return { read: true, edit: false, finance: false, reports: false, admin: false };
        }

        function isViewerRole() {
            const teamId = getActiveTeamId();
            if (!teamId) return false;
            return !hasTeamPermission('edit');
        }

        function ensureReadOnlyBanner() {
            let banner = document.getElementById('spReadOnlyBanner');
            if (banner) return banner;
            const container = document.querySelector('.main-content') || document.body;
            banner = document.createElement('div');
            banner.id = 'spReadOnlyBanner';
            banner.className = 'sp-readonly-banner';
            banner.textContent = 'Read-only access: this team role cannot add, edit, or delete records.';
            container.insertBefore(banner, container.firstChild);
            return banner;
        }

        function applyReadOnlyMode() {
            const isViewer = isViewerRole();
            document.body.classList.toggle('sp-readonly', isViewer);
            document.body.classList.toggle('sp-no-finance', Boolean(getActiveTeamId()) && !hasTeamPermission('finance'));
            document.body.classList.toggle('sp-no-reports', Boolean(getActiveTeamId()) && !hasTeamPermission('reports'));
            const banner = ensureReadOnlyBanner();
            banner.style.display = isViewer ? 'block' : 'none';
            const appRoot = document.getElementById('appContainer') || document.body;
            const submitButtons = appRoot.querySelectorAll('button[type="submit"], input[type="submit"]');
            submitButtons.forEach((btn) => {
                if (isViewer) {
                    btn.dataset.readonlyDisabled = '1';
                    btn.disabled = true;
                } else if (btn.dataset.readonlyDisabled) {
                    btn.disabled = false;
                    btn.removeAttribute('data-readonly-disabled');
                }
            });
            const taskControls = appRoot.querySelectorAll('.task-checkbox, .task-edit, .task-delete, .task-add-btn');
            taskControls.forEach((control) => {
                if (isViewer) {
                    control.dataset.readonlyDisabled = '1';
                    control.disabled = true;
                } else if (control.dataset.readonlyDisabled) {
                    control.disabled = false;
                    control.removeAttribute('data-readonly-disabled');
                }
            });
        }

        function setTeamRole(role) {
            setTeamAccess(role, null);
        }
        window.setTeamRole = setTeamRole;

        function setTeamAccess(role, permissions) {
            currentTeamRole = role || null;
            currentTeamPermissions = permissions && typeof permissions === 'object'
                ? { ...permissions }
                : (currentTeamRole ? fallbackTeamPermissions(currentTeamRole) : null);
            window.currentTeamRole = currentTeamRole;
            window.currentTeamPermissions = currentTeamPermissions;
            applyReadOnlyMode();
        }
        window.setTeamAccess = setTeamAccess;

        function guardReadOnly(actionLabel) {
            if (!isViewerRole()) return false;
            if (typeof toastWarn === 'function') {
                toastWarn(`Read-only access: you cannot ${actionLabel}.`);
            } else if (typeof toastInfo === 'function') {
                toastInfo('Read-only access.');
            }
            return true;
        }

        function guardTeamPermission(permission, actionLabel) {
            if (!getActiveTeamId() || hasTeamPermission(permission)) return false;
            const permissionLabel = permission === 'finance' ? 'finance' : permission === 'reports' ? 'reports' : 'team';
            if (typeof toastWarn === 'function') {
                toastWarn(`This team role does not have ${permissionLabel} access to ${actionLabel}.`);
            } else if (typeof toastInfo === 'function') {
                toastInfo('Team permission required.');
            }
            return true;
        }

        function guardCloudOnly(actionLabel) {
            if (!isCloudOnlyMode()) return false;
            const hasSession = typeof window.SP?.getOwnerId === 'function' ? Boolean(window.SP.getOwnerId()) : false;
            if (!navigator.onLine || !hasSession) {
                if (typeof toastWarn === 'function') {
                    toastWarn('Cloud unavailable; try again.');
                } else if (typeof toastInfo === 'function') {
                    toastInfo('Cloud unavailable; try again.');
                }
                return true;
            }
            return false;
        }
        window.guardCloudOnly = guardCloudOnly;

        function getCurrentRevenueGoalKey() {
            return getActiveDataScopeKey();
        }

        function getCurrentMonthlyRevenueGoal() {
            const key = getCurrentRevenueGoalKey();
            if (!key) return 0;
            const raw = Number(revenueGoals[key] || 0);
            return Number.isFinite(raw) && raw > 0 ? raw : 0;
        }

        function setCurrentMonthlyRevenueGoal(amount) {
            const key = getCurrentRevenueGoalKey();
            if (!key) return;
            const nextValue = Number(amount);
            revenueGoals[key] = Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 0;
            Storage.saveSync('starPaperRevenueGoals', revenueGoals);
        }

        function toggleRevenueGoalEditor(editorId, inputId) {
            const editor = document.getElementById(editorId);
            const input = document.getElementById(inputId);
            if (!editor) return;
            const isOpen = editor.style.display && editor.style.display !== 'none';
            const openDisplay = window.innerWidth >= 1025 ? 'grid' : 'flex';
            editor.style.display = isOpen ? 'none' : openDisplay;
            if (!isOpen && input) {
                const currentGoal = getCurrentMonthlyRevenueGoal();
                input.value = currentGoal > 0 ? String(Math.round(currentGoal)) : '';
                setTimeout(() => input.focus(), 0);
            }
        }

        function saveRevenueGoalFromInput(inputId, editorId) {
            if (guardTeamPermission('finance', 'update revenue goals')) return;
            const input = document.getElementById(inputId);
            if (!input) return;
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0) {
                toastError('Please enter a valid amount for the goal.');
                return;
            }
            setCurrentMonthlyRevenueGoal(value);
            const editor = document.getElementById(editorId);
            if (editor) editor.style.display = 'none';
            updateDashboard();
            syncCloudExtras();
            toastSuccess(`Monthly revenue goal saved: UGX ${Math.round(value || 0).toLocaleString()}.`);
        }

        function toggleMonthlyGoalEditor() {
            toggleRevenueGoalEditor('monthlyGoalEditor', 'monthlyGoalInput');
        }

        function saveMonthlyRevenueGoal() {
            saveRevenueGoalFromInput('monthlyGoalInput', 'monthlyGoalEditor');
        }

        function toggleFinancialsMonthlyGoalEditor() {
            toggleRevenueGoalEditor('financialsMonthlyGoalEditor', 'financialsMonthlyGoalInput');
        }

        function saveFinancialsMonthlyRevenueGoal() {
            saveRevenueGoalFromInput('financialsMonthlyGoalInput', 'financialsMonthlyGoalEditor');
        }

        // ── Balance Brought Forward (BBF) ─────────────────────────────────────
        const BBF_ARTIST_MARKER = '::artist::';

        function formatBBFMonthKey(date) {
            const safeDate = date instanceof Date ? date : new Date();
            return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
        }

        function shiftBBFPeriod(period, deltaMonths = 0) {
            const normalized = String(period || '').trim();
            const match = normalized.match(/^(\d{4})-(\d{2})$/);
            if (!match) return normalized || formatBBFMonthKey(new Date());
            const year = Number(match[1]);
            const monthIndex = Number(match[2]) - 1;
            const shifted = new Date(year, monthIndex + Number(deltaMonths || 0), 1);
            return formatBBFMonthKey(shifted);
        }

        function getBBFPeriodFromSelection(period = '', options = {}) {
            const explicitDateStart = String(options.dateStart || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDateStart)) {
                return explicitDateStart.slice(0, 7);
            }

            const today = new Date();
            switch (String(period || '').trim()) {
                case 'prevMonth':
                    return formatBBFMonthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
                case 'quarter': {
                    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
                    return formatBBFMonthKey(new Date(today.getFullYear(), quarterStartMonth, 1));
                }
                case 'year':
                    return `${today.getFullYear()}-01`;
                case 'prevYear':
                    return `${today.getFullYear() - 1}-01`;
                case 'all': {
                    const allDates = [
                        ...(Array.isArray(bookings) ? bookings : []).map((entry) => entry?.date),
                        ...(Array.isArray(expenses) ? expenses : []).map((entry) => entry?.date),
                        ...(Array.isArray(otherIncome) ? otherIncome : []).map((entry) => entry?.date),
                    ]
                        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim()))
                        .sort();
                    return allDates.length > 0 ? allDates[0].slice(0, 7) : formatBBFMonthKey(today);
                }
                case 'month':
                default:
                    return formatBBFMonthKey(today);
            }
        }

        function getDefaultBBFPeriod() {
            const pdfDateStart = String(document.getElementById('spPdfDateStart')?.value || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(pdfDateStart)) {
                return pdfDateStart.slice(0, 7);
            }
            const reportSelection = typeof getReportPeriodSelection === 'function'
                ? getReportPeriodSelection()
                : { period: 'month' };
            return getBBFPeriodFromSelection(reportSelection?.period, { dateStart: pdfDateStart });
        }

        function normalizeBBFPeriod(period) {
            const raw = String(period || '').trim();
            return /^\d{4}-\d{2}$/.test(raw) ? raw : getDefaultBBFPeriod();
        }

        function slugifyBBFArtistKey(value) {
            return String(value || '')
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        function getBBFArtistKey(options = {}) {
            const artistId = String(options.artistId || '').trim();
            if (artistId) return artistId;
            const artistName = String(options.artistName || options.artist || '').trim();
            return artistName ? `name-${slugifyBBFArtistKey(artistName)}` : '';
        }

        function serializeBBFPeriod(period, artistKey = '') {
            const normalized = normalizeBBFPeriod(period);
            const scopedArtistKey = String(artistKey || '').trim();
            return scopedArtistKey ? `${normalized}${BBF_ARTIST_MARKER}${scopedArtistKey}` : normalized;
        }

        function parseBBFPeriodKey(periodKey) {
            const raw = String(periodKey || '').trim();
            if (!raw) {
                return { period: getDefaultBBFPeriod(), artistKey: '' };
            }
            const markerIndex = raw.indexOf(BBF_ARTIST_MARKER);
            if (markerIndex === -1) {
                return { period: normalizeBBFPeriod(raw), artistKey: '' };
            }
            return {
                period: normalizeBBFPeriod(raw.slice(0, markerIndex)),
                artistKey: raw.slice(markerIndex + BBF_ARTIST_MARKER.length).trim()
            };
        }

        function getBBFKey(options = {}) {
            const scopeKey = getActiveDataScopeKey();
            const periodKey = serializeBBFPeriod(options.period, getBBFArtistKey(options));
            return `${scopeKey}_${periodKey}`;
        }

        function getBBFViewStateKey() {
            return getActiveDataScopeKey() || 'default';
        }

        function getPersistedBBFContext() {
            const raw = bbfViewState[getBBFViewStateKey()];
            if (!raw || typeof raw !== 'object') return null;
            return {
                period: normalizeBBFPeriod(raw.period),
                artistId: String(raw.artistId || '').trim(),
                artistName: String(raw.artistName || '').trim()
            };
        }

        function setPersistedBBFContext(options = {}) {
            const scopeKey = getBBFViewStateKey();
            bbfViewState[scopeKey] = {
                period: normalizeBBFPeriod(options.period),
                artistId: String(options.artistId || '').trim(),
                artistName: String(options.artistName || options.artist || '').trim()
            };
            Storage.saveSync('starPaperBBFViewState', bbfViewState);
        }

        function resolveBBFEntry(options = {}) {
            const scopeKey = getActiveDataScopeKey();
            const requestedPeriod = normalizeBBFPeriod(options.period);
            const artistKey = getBBFArtistKey(options);
            const allowGlobalFallback = options.fallbackToGlobal !== false;
            const previousPeriod = shiftBBFPeriod(requestedPeriod, -1);
            const candidates = [
                { period: requestedPeriod, artistKey, usedPreviousPeriod: false },
                ...(allowGlobalFallback && artistKey ? [{ period: requestedPeriod, artistKey: '', usedPreviousPeriod: false }] : []),
                { period: previousPeriod, artistKey, usedPreviousPeriod: true },
                ...(allowGlobalFallback && artistKey ? [{ period: previousPeriod, artistKey: '', usedPreviousPeriod: true }] : []),
            ];

            for (const candidate of candidates) {
                const scopedKey = `${scopeKey}_${serializeBBFPeriod(candidate.period, candidate.artistKey)}`;
                const raw = bbfData[scopedKey];
                if (raw === undefined || raw === null || raw === '') continue;
                const amount = Number(raw);
                if (!Number.isFinite(amount)) continue;
                return {
                    amount,
                    requestedPeriod,
                    matchedPeriod: candidate.period,
                    usedPreviousPeriod: candidate.usedPreviousPeriod,
                    matchedArtistKey: candidate.artistKey
                };
            }

            return {
                amount: 0,
                requestedPeriod,
                matchedPeriod: requestedPeriod,
                usedPreviousPeriod: false,
                matchedArtistKey: artistKey
            };
        }

        function getCurrentBBF(options = {}) {
            return Number(resolveBBFEntry(options).amount) || 0;
        }

        function setCurrentBBF(amount, options = {}) {
            const val = Number(amount);
            bbfData[getBBFKey(options)] = Number.isFinite(val) && val >= 0 ? val : 0;
            Storage.saveSync('starPaperBBF', bbfData);
            setPersistedBBFContext(options);
        }

        function formatBBFPeriodLabel(period) {
            const normalized = normalizeBBFPeriod(period);
            const [yearStr, monthStr] = normalized.split('-');
            const year = Number(yearStr);
            const monthIndex = Number(monthStr) - 1;
            if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return normalized;
            return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        function populateBBFArtistOptions(selectedArtistId = '') {
            const select = document.getElementById('spBbfArtistSelect');
            if (!select) return;
            const artistsList = getArtists();
            select.innerHTML = '<option value="">Roster / All Artists</option>' + artistsList.map((artist) => {
                const id = escapeHtml(artist?.id || '');
                const name = escapeHtml(artist?.name || 'Artist');
                return `<option value="${id}">${name}</option>`;
            }).join('');
            if (selectedArtistId) {
                select.value = selectedArtistId;
            }
        }

        function getDefaultBBFArtist() {
            const reportArtistName = String(document.getElementById('spRptArtistFilter')?.value || '').trim();
            if (reportArtistName) {
                const reportArtist = findArtistByName(reportArtistName);
                if (reportArtist?.id) return reportArtist;
            }
            const pdfArtistName = String(document.getElementById('spPdfArtistSelect')?.value || '').trim();
            if (pdfArtistName) {
                const pdfArtist = findArtistByName(pdfArtistName);
                if (pdfArtist?.id) return pdfArtist;
            }
            return null;
        }

        function getActiveBBFContext(options = {}) {
            const persisted = (!options.period && !options.artist && !options.artistId && !options.artistName)
                ? getPersistedBBFContext()
                : null;
            const artist = options.artist
                || (persisted?.artistId ? findArtistById(persisted.artistId) : null)
                || (persisted?.artistName ? findArtistByName(persisted.artistName) : null)
                || getDefaultBBFArtist();
            const period = normalizeBBFPeriod(options.period || persisted?.period || getDefaultBBFPeriod());
            const resolved = resolveBBFEntry({
                period,
                artistId: options.artistId || artist?.id,
                artistName: options.artistName || artist?.name,
                fallbackToGlobal: options.fallbackToGlobal !== false
            });
            const sourcePeriod = resolved.usedPreviousPeriod ? resolved.matchedPeriod : shiftBBFPeriod(period, -1);
            return {
                period,
                periodLabel: formatBBFPeriodLabel(period),
                matchedPeriod: resolved.matchedPeriod,
                matchedPeriodLabel: formatBBFPeriodLabel(resolved.matchedPeriod),
                sourcePeriod,
                sourcePeriodLabel: formatBBFPeriodLabel(sourcePeriod),
                artist,
                amount: Number(resolved.amount) || 0
            };
        }

        function updateBBFModalPreview() {
            const select = document.getElementById('spBbfArtistSelect');
            const periodInput = document.getElementById('spBbfPeriodInput');
            const amountInput = document.getElementById('spBbfAmountInput');
            const contextEl = document.getElementById('spBbfContext');
            if (!periodInput || !amountInput) return;

            const period = normalizeBBFPeriod(periodInput.value);
            const artist = select?.value ? findArtistById(select.value) : null;
            const existingAmount = getCurrentBBF({
                period,
                artistId: artist?.id,
                artistName: artist?.name,
                fallbackToGlobal: !artist
            });

            amountInput.value = existingAmount > 0 ? String(Math.round(existingAmount)) : '';

            if (contextEl) {
                const scopeLabel = artist?.name ? `${artist.name} only` : 'the full roster';
                const periodLabel = formatBBFPeriodLabel(period);
                const amountLabel = `UGX ${Math.round(existingAmount || 0).toLocaleString()}`;
                contextEl.textContent = `Saving BBF for ${scopeLabel} in ${periodLabel}. Current stored value: ${amountLabel}.`;
            }
        }

        function bindBBFModal() {
            const modal = document.getElementById('spBbfModal');
            const artistSelect = document.getElementById('spBbfArtistSelect');
            const periodInput = document.getElementById('spBbfPeriodInput');
            if (!modal || modal.dataset.bound === '1') return;
            modal.dataset.bound = '1';
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeBBFModal();
            });
            artistSelect?.addEventListener('change', updateBBFModalPreview);
            periodInput?.addEventListener('change', updateBBFModalPreview);
        }

        function openBBFModal() {
            const modal = document.getElementById('spBbfModal');
            const periodInput = document.getElementById('spBbfPeriodInput');
            const amountInput = document.getElementById('spBbfAmountInput');
            if (!modal || !periodInput) return;

            bindBBFModal();
            const activeContext = getActiveBBFContext();
            populateBBFArtistOptions(activeContext.artist?.id || '');
            periodInput.value = activeContext.period;
            updateBBFModalPreview();
            modal.style.display = 'flex';

            setTimeout(() => {
                amountInput?.focus();
                amountInput?.select?.();
            }, 0);
        }

        function closeBBFModal() {
            const modal = document.getElementById('spBbfModal');
            if (modal) modal.style.display = 'none';
        }

        function toggleBBFEditor() {
            openBBFModal();
        }

        function saveBBF() {
            if (guardTeamPermission('finance', 'update the balance brought forward')) return;
            const select = document.getElementById('spBbfArtistSelect');
            const periodInput = document.getElementById('spBbfPeriodInput');
            const amountInput = document.getElementById('spBbfAmountInput');
            if (!periodInput || !amountInput) return;

            const value = Number(amountInput.value);
            if (!Number.isFinite(value) || value < 0) {
                toastError('Please enter a valid amount.');
                return;
            }

            const artist = select?.value ? findArtistById(select.value) : null;
            const period = normalizeBBFPeriod(periodInput.value);
            setCurrentBBF(value, {
                period,
                artistId: artist?.id,
                artistName: artist?.name
            });

            closeBBFModal();
            updateDashboard();
            if (typeof window.renderMomentumDashboard === 'function') {
                window.renderMomentumDashboard();
            }
            syncCloudExtras();
            toastSuccess(`BBF saved for ${artist?.name || 'Roster'} (${formatBBFPeriodLabel(period)}).`);
        }
        // ─────────────────────────────────────────────────────────────────────

        function normalizeAllManagerBookingReferences() {
            bookings = ensureBookingArtistRefs(bookings, currentManagerId);
            window.bookings = bookings;
        }

        function getRecordSortTimestamp(item) {
            if (!item || typeof item !== 'object') return 0;
            const createdTime = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
            if (Number.isFinite(createdTime)) return createdTime;
            if (typeof item.id === 'number' && Number.isFinite(item.id)) return item.id;
            const dateTime = item.date ? new Date(item.date).getTime() : NaN;
            return Number.isFinite(dateTime) ? dateTime : 0;
        }

        function sortNewestFirst(records) {
            return [...records].sort((a, b) => getRecordSortTimestamp(b) - getRecordSortTimestamp(a));
        }

        // Location Data
        const ugandaDistricts = [
            'Kampala', 'Wakiso', 'Mukono', 'Entebbe', 'Jinja', 'Mbale', 'Gulu', 'Lira', 'Mbarara', 
            'Masaka', 'Soroti', 'Hoima', 'Arua', 'Kabale', 'Fort Portal', 'Kasese', 'Tororo', 
            'Busia', 'Iganga', 'Pallisa', 'Kumi', 'Kitgum', 'Moroto', 'Kotido', 'Kaabong',
            'Abim', 'Adjumani', 'Apac', 'Bundibugyo', 'Bushenyi', 'Buvuma', 'Dokolo', 'Ibanda',
            'Isingiro', 'Jinja', 'Kabarole', 'Kaberamaido', 'Kalangala', 'Kaliro', 'Kampala',
            'Kamuli', 'Kamwenge', 'Kanungu', 'Kapchorwa', 'Katakwi', 'Kayunga', 'Kibaale',
            'Kiboga', 'Kibuku', 'Kiruhura', 'Kiryandongo', 'Kisoro', 'Kitgum', 'Koboko',
            'Kole', 'Kotido', 'Kumi', 'Kyankwanzi', 'Kyegegwa', 'Kyenjojo', 'Lamwo', 'Lira',
            'Luuka', 'Luwero', 'Lwengo', 'Lyantonde', 'Manafwa', 'Maracha', 'Masaka', 'Masindi',
            'Mayuge', 'Mbale', 'Mbarara', 'Mitooma', 'Mityana', 'Moroto', 'Moyo', 'Mpigi',
            'Mubende', 'Mukono', 'Nakapiripirit', 'Nakaseke', 'Nakasongola', 'Namayingo',
            'Namutumba', 'Napak', 'Nebbi', 'Ngora', 'Ntoroko', 'Ntungamo', 'Nwoya', 'Otuke',
            'Oyam', 'Pader', 'Pallisa', 'Rakai', 'Rubanda', 'Rubirizi', 'Rukungiri', 'Sembabule',
            'Serere', 'Sheema', 'Sironko', 'Soroti', 'Tororo', 'Wakiso', 'Yumbe', 'Zombo'
        ].sort();

        const countries = [
            'Nigeria', 'Kenya', 'Tanzania', 'Rwanda', 'South Africa', 'Ghana', 'United Kingdom',
            'United States', 'Canada', 'France', 'Germany', 'Dubai (UAE)', 'South Sudan',
            'Congo (DRC)', 'Burundi', 'Ethiopia', 'Egypt', 'Morocco', 'Senegal', 'Ivory Coast',
            'Netherlands', 'Belgium', 'Sweden', 'Australia', 'India', 'China', 'Japan',
            'Brazil', 'Argentina', 'Mexico', 'Spain', 'Italy', 'Portugal', 'Switzerland'
        ].sort();

        function initializeMainEventSystem() {
            if (window.__starPaperMainEventsBound) return;
            window.__starPaperMainEventsBound = true;

            // ── In-app navigation history stack ──────────────────────────
            window._spNavStack = [];   // array of section names
            window._spNavIndex = -1;  // current position in stack
            window._spNavSkip = false; // flag: popstate-driven navigation, don't push

            const runAuthAction = (actionName, fallback) => {
                const fn = typeof window[actionName] === 'function' ? window[actionName] : fallback;
                if (typeof fn === 'function') {
                    return fn();
                }
                console.warn(`Auth action "${actionName}" is not available.`);
                return undefined;
            };
            const runLogin = () => runAuthAction('login', login);
            const runSignup = () => runAuthAction('signup', signup);

            document.getElementById('loginButton')?.addEventListener('click', () => runLogin());
            document.getElementById('hamburgerBtn')?.addEventListener('click', () => toggleSidebar());
            document.getElementById('sidebarOverlay')?.addEventListener('click', () => closeSidebar());

            // ── Back / Forward navigation buttons ────────────────────────
            document.getElementById('navBackBtn')?.addEventListener('click', () => {
                if (window._spNavIndex > 0) {
                    window._spNavIndex--;
                    window._spNavSkip = true;
                    showSection(window._spNavStack[window._spNavIndex]);
                    updateNavHistButtons();
                }
            });
            document.getElementById('navFwdBtn')?.addEventListener('click', () => {
                if (window._spNavIndex < window._spNavStack.length - 1) {
                    window._spNavIndex++;
                    window._spNavSkip = true;
                    showSection(window._spNavStack[window._spNavIndex]);
                    updateNavHistButtons();
                }
            });

            // ── Scroll-to-top FAB ──────────────────────────────────────
            const scrollFab = document.getElementById('scrollTopFab');
            const mainContent = document.querySelector('.main-content');
            const showFab = () => {
                const scrolled = (mainContent?.scrollTop || 0) + window.scrollY;
                scrollFab?.classList.toggle('visible', scrolled > 280);
            };
            mainContent?.addEventListener('scroll', showFab, { passive: true });
            window.addEventListener('scroll', showFab, { passive: true });
            scrollFab?.addEventListener('click', () => {
                mainContent?.scrollTo({ top: 0, behavior: 'smooth' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

            // ── Landing: sticky mini-nav on scroll ────────────────────
            const landingEl = document.getElementById('landingScreen');
            const miniNav   = document.getElementById('landingMiniNav');
            if (landingEl && miniNav) {
                const heroStage = document.getElementById('landingHeroStage');
                const updateMiniNav = () => {
                    const threshold = heroStage
                        ? Math.max(220, Math.round(heroStage.offsetHeight * 0.45))
                        : 260;
                    const show = landingEl.scrollTop > threshold;
                    miniNav.classList.toggle('visible', show);
                    miniNav.setAttribute('aria-hidden', String(!show));
                };
                landingEl.addEventListener('scroll', updateMiniNav, { passive: true });
                window.addEventListener('resize', updateMiniNav, { passive: true });
                updateMiniNav();
            }
            document.getElementById('landingThemeToggle')?.addEventListener('click', toggleTheme);
            document.getElementById('sidebarLightBtn')?.addEventListener('click', () => setTheme('light'));
            document.getElementById('sidebarDarkBtn')?.addEventListener('click', () => setTheme('dark'));
            document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
                if (typeof window.logout === 'function') {
                    window.logout();
                    return;
                }
                if (typeof logout === 'function') {
                    logout();
                }
            });
            bindMobileUtilityActions();
            bindInlineEditController();
            document.getElementById('quickAddBtn')?.addEventListener('click', toggleQuickAdd);
            const quickAddPanel = document.getElementById('quickAddPanel');
            if (quickAddPanel && !window.__starPaperQuickAddPanelBound) {
                window.__starPaperQuickAddPanelBound = true;
                quickAddPanel.addEventListener('click', (event) => {
                    const rawTarget = event && event.target;
                    const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE
                        ? rawTarget.parentElement
                        : rawTarget;
                    if (!target || typeof target.closest !== 'function') return;
                    const actionEl = target.closest('[data-action="openQuickAdd"]');
                    if (!actionEl) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const targetKey = actionEl.dataset.type || actionEl.dataset.targetSection;
                    if (targetKey) {
                        openQuickAdd(targetKey);
                    } else {
                        console.warn('Quick Add button missing target key.');
                    }
                });
            }
            const artistGrid = document.getElementById('artistGrid');
            if (artistGrid && !window.__starPaperArtistCardBound) {
                window.__starPaperArtistCardBound = true;
                artistGrid.addEventListener('click', (event) => {
                    const rawTarget = event && event.target;
                    const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE
                        ? rawTarget.parentElement
                        : rawTarget;
                    if (!target || typeof target.closest !== 'function') return;
                    if (target.closest('.sp-inline-editable')) return; // FIXED: inline artist edits do not open the full form.

                    const deleteBtn = target.closest('[data-action="deleteArtistCard"]');
                    if (deleteBtn) {
                        event.preventDefault();
                        event.stopPropagation();
                        const artistId = deleteBtn.dataset.artistId || '';
                        if (artistId) deleteArtist(artistId);
                        return;
                    }

                    const card = target.closest('.artist-card[data-artist-id]');
                    if (!card) return;
                    const artistId = card.dataset.artistId || '';
                    if (artistId) {
                        showEditArtistForm(artistId);
                    }
                });
                artistGrid.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    const rawTarget = event && event.target;
                    const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE
                        ? rawTarget.parentElement
                        : rawTarget;
                    if (!target || typeof target.closest !== 'function') return;
                    if (target.closest('.sp-inline-editable')) return; // FIXED: keyboard inline edits stay inline.
                    const card = target.closest('.artist-card[data-artist-id]');
                    if (!card) return;
                    event.preventDefault();
                    const artistId = card.dataset.artistId || '';
                    if (artistId) {
                        showEditArtistForm(artistId);
                    }
                });
            }
            document.getElementById('dashboardSearch')?.addEventListener('input', (event) => {
                handleDashboardSearch();
                triggerSearchCoinCascade(event, 10);
            });
            document.getElementById('dashboardSearch')?.addEventListener('focus', (event) => {
                handleDashboardSearch();
                triggerSearchCoinCascade(event, 16);
            });
            document.getElementById('dashboardSearch')?.addEventListener('keydown', handleDashboardSearchInputKeydown);
            bindDashboardSearchResultInteractions();
            document.getElementById('monthlyGoalInput')?.addEventListener('keydown', (e) => handleEnterSubmit(e, saveMonthlyRevenueGoal));
            document.getElementById('financialsMonthlyGoalInput')?.addEventListener('keydown', (e) => handleEnterSubmit(e, saveFinancialsMonthlyRevenueGoal));
            bindBBFModal();
            document.getElementById('spBbfAmountInput')?.addEventListener('keydown', (e) => handleEnterSubmit(e, saveBBF));
            document.getElementById('loginName')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runLogin));
            document.getElementById('loginPassword')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runLogin));
            document.getElementById('signupName')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runSignup));
            document.getElementById('signupPassword')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runSignup));
            document.getElementById('signupEmail')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runSignup));
            document.getElementById('signupPhone')?.addEventListener('keydown', (e) => handleEnterSubmit(e, runSignup));
            document.getElementById('profileAvatarUpload')?.addEventListener('change', handleProfileAvatarUpload);
            document.getElementById('profileAvatarPresets')?.addEventListener('click', selectProfileAvatarPreset);
            document.getElementById('artistAvatarUpload')?.addEventListener('change', handleArtistAvatarUpload);
            applyTheme(getStoredThemePreference() || 'dark', { persist: false, syncRemote: false });
            document.addEventListener('input', cacheDrafts);
            window.addEventListener('beforeunload', cacheDrafts);
            window.addEventListener('beforeunload', (event) => {
                if (!shouldWarnBeforeUnload()) return;
                event.preventDefault();
                event.returnValue = '';
            });

            // Mobile swipe gestures for sidebar
            let touchStartX = 0;
            let touchStartY = 0;
            let touchStartTime = 0;

            document.addEventListener('touchstart', (event) => {
                if (!event.touches || event.touches.length !== 1) return;
                const touch = event.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                touchStartTime = Date.now();
            }, { passive: true });

            document.addEventListener('touchend', (event) => {
                if (!event.changedTouches || event.changedTouches.length !== 1) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - touchStartX;
                const deltaY = touch.clientY - touchStartY;
                const elapsed = Date.now() - touchStartTime;

                // Ignore slow swipes or mostly vertical swipes
                if (elapsed > 500 || Math.abs(deltaY) > Math.abs(deltaX)) return;

                const sidebar = document.getElementById('sidebar');
                const isActive = sidebar?.classList.contains('active');

                // Swipe right from left edge to open
                if (!isActive && touchStartX <= 24 && deltaX > 60) {
                    toggleSidebar(true);
                    return;
                }

                // Swipe left to close when sidebar is open
                if (isActive && deltaX < -60) {
                    toggleSidebar(false);
                }
            }, { passive: true });

            window.addEventListener('resize', () => {
                if (window.innerWidth > 1024) {
                    closeSidebar();
                }
                const quickAddPanel = document.getElementById('quickAddPanel');
                if (quickAddPanel?.classList.contains('active')) {
                    setQuickAddPanelPlacement();
                }
            });

            window.addEventListener('error', (event) => {
                console.error('Runtime Error:', event.error);
            });

            // Supabase v2 uses the Web Locks API internally to coordinate auth token
            // refresh across tabs. When a new tab steals the lock, every other tab
            // gets an AbortError: "Lock broken by another request with the 'steal' option".
            // This is non-fatal — the auth state self-heals — but without this handler
            // it surfaces as a red toast. We silence it here and log quietly instead.
            window.addEventListener('unhandledrejection', (event) => {
                const err = event.reason;
                if (err?.name === 'AbortError') {
                    event.preventDefault(); // stop it reaching any global error toast
                    console.warn('[StarPaper] Suppressed non-fatal AbortError (Supabase lock contention):', err.message);
                }
            });

            let lastScrollY = 0;
            window.addEventListener('scroll', () => {
                const current = window.scrollY;
                lastScrollY = current;
                updateLandingTopControlsVisibility();
            });

            document.addEventListener('click', (event) => {
                hideOpenFormsIfClickedOutside(event);
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeMainEventSystem, { once: true });
        } else {
            initializeMainEventSystem();
        }

        // Cloud-only runtime starts with empty in-memory stores; Supabase hydrates real data.
        function initializeData() {
            users = [];
            artists = [];
            managerData = {};
        }

        window.__spAppBooted = false;
        window.__spDataHydrationPending = Boolean(window.__spDataHydrationPending);
        window.__spDataLoaded = Boolean(window.__spDataLoaded);
        window.currentUser = null;
        window.currentManagerId = null;
        if (getStartupBootContext() !== 'cold-start') {
            beginBootTransition('app-state-init', 'loading-session');
        }

        // Populate location dropdowns on page load
        function populateLocationDropdowns() {
            const ugandaSelect = document.getElementById('bookingUgandaLocation');
            const abroadSelect = document.getElementById('bookingAbroadLocation');
            if (!ugandaSelect || !abroadSelect) return;
            ugandaSelect.innerHTML = ugandaDistricts.map(d => `<option value="${d}">${d}</option>`).join('');
            abroadSelect.innerHTML = countries.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // Update location dropdown based on location type selection
        function updateLocationDropdown() {
            const locationTypeEl = document.getElementById('bookingLocationType');
            const ugandaGroup = document.getElementById('ugandaLocationGroup');
            const abroadGroup = document.getElementById('abroadLocationGroup');
            if (!locationTypeEl || !ugandaGroup || !abroadGroup) return;
            const locationType = locationTypeEl.value;
            if (locationType === 'uganda') {
                ugandaGroup.style.display = 'flex';
                abroadGroup.style.display = 'none';
            } else {
                ugandaGroup.style.display = 'none';
                abroadGroup.style.display = 'flex';
            }
        }

        // Landing page functions
        function getInput(id) {
            return document.getElementById(id)?.value.trim() || '';
        }

        function handleEnterSubmit(event, action) {
            if (event.key === 'Enter') {
                event.preventDefault();
                action();
            }
        }

        function setValidationMessage(id, message) {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = message;
            }
        }

        function setInputError(id, isError) {
            const input = document.getElementById(id);
            if (input) {
                input.classList.toggle('input-error', isError);
            }
        }

        function clearLoginValidation() {
            setValidationMessage('loginNameError', '');
            setValidationMessage('loginPasswordError', '');
            setInputError('loginName', false);
            setInputError('loginPassword', false);
        }

        let loginLoadingGuard = null;
        function setLoginLoading(isLoading) {
            const overlay = document.getElementById('loginLoading');
            const button = document.getElementById('loginButton');
            if (overlay) {
                overlay.classList.toggle('active', isLoading);
            }
            if (button) {
                button.disabled = isLoading;
            }
            if (loginLoadingGuard) {
                clearTimeout(loginLoadingGuard);
                loginLoadingGuard = null;
            }
            if (isLoading) {
                loginLoadingGuard = setTimeout(() => {
                    if (overlay && overlay.classList.contains('active')) {
                        overlay.classList.remove('active');
                    }
                    if (button) {
                        button.disabled = false;
                    }
                    if (typeof window.toastWarn === 'function') {
                        window.toastWarn('Login is taking longer than expected. Please try again.');
                    }
                }, 12000);
            }
        }

        function toggleSidebar(force) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const isActive = sidebar?.classList.contains('active');
            const nextState = typeof force === 'boolean' ? force : !isActive;
            sidebar?.classList.toggle('active', nextState);
            overlay?.classList.toggle('active', nextState);
            document.body.classList.toggle('sidebar-open', nextState);
            if (overlay) {
                overlay.setAttribute('aria-hidden', String(!nextState));
            }
            const hamburger = document.getElementById('hamburgerBtn');
            if (hamburger) {
                hamburger.setAttribute('aria-expanded', String(nextState));
            }
        }

        function setQuickAddPanelPlacement() {
            const panel = document.getElementById('quickAddPanel');
            const trigger = document.getElementById('quickAddBtn');
            if (!panel || !trigger) return;

            panel.classList.remove('quick-add-panel--drop-up');
            if (!panel.classList.contains('active')) return;

            const triggerRect = trigger.getBoundingClientRect();
            const estimatedPanelHeight = Math.min(Math.max(panel.scrollHeight, 140), 260) + 12;
            const spaceBelow = window.innerHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;

            if (spaceBelow < estimatedPanelHeight && spaceAbove > estimatedPanelHeight) {
                panel.classList.add('quick-add-panel--drop-up');
            }
        }

        function toggleQuickAdd() {
            const panel = document.getElementById('quickAddPanel');
            if (!panel) return;
            panel.classList.toggle('active');
            setQuickAddPanelPlacement();
        }

        function hideOpenFormsIfClickedOutside(event) {
            const rawTarget = event && event.target;
            const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE
                ? rawTarget.parentElement
                : rawTarget;
            if (!target || typeof target.closest !== 'function') return;

            // A quick-add action intentionally opens a form after section navigation.
            // Do not immediately auto-cancel forms for that same click event.
            if (target.closest('[data-action="openQuickAdd"]')) {
                return;
            }
            
            // Close quick-add panel if clicked outside
            const quickAddPanel = document.getElementById('quickAddPanel');
            const quickAddBtn = document.getElementById('quickAddBtn');
            if (quickAddPanel && quickAddPanel.classList.contains('active')) {
                if (!quickAddPanel.contains(target) && target !== quickAddBtn && !quickAddBtn.contains(target)) {
                    quickAddPanel.classList.remove('active');
                }
            }
                const forms = [
                    {
                        id: 'addBookingForm',
                        cancel: cancelBooking,
                        openSelectors: [
                            '[data-action="showAddBooking"]',
                            '[data-action="showAddEventToCalendar"]',
                            '[data-availability-book]',
                            '.booking-edit-trigger'
                        ]
                    },
                    { id: 'addExpenseForm', cancel: cancelExpense, openSelectors: ['[data-action="showAddExpense"]', '.expense-edit-trigger'] },
                    { id: 'addOtherIncomeForm', cancel: cancelOtherIncome, openSelectors: ['[data-action="showAddOtherIncome"]', '.other-income-edit-trigger'] },
                    { id: 'addArtistForm', cancel: cancelAddArtist, openSelectors: ['[data-action="showAddArtistForm"]', '.artist-card[data-artist-id]'] }
                ];

            forms.forEach(form => {
                const formEl = document.getElementById(form.id);
                if (!formEl || formEl.style.display !== 'block') return;
                if (formEl.contains(target)) return;
                const clickedOpenButton = form.openSelectors.some(sel => target.closest(sel));
                if (clickedOpenButton) return;
                form.cancel();
            });
        }

        /**
         * Quick Add: Navigate to section and show input form
         * @param {string} section - Section to navigate to
         */
        function openQuickAdd(targetKey) {
            const quickAddPanel = document.getElementById('quickAddPanel');
            if (!quickAddPanel) {
                console.warn('Quick Add panel not found: #quickAddPanel');
                return;
            }
            quickAddPanel.classList.add('active');

            const quickAddConfig = {
                booking: { section: 'bookings', formId: 'quickAddBooking', fallbackFormId: 'addBookingForm', openForm: showAddBooking },
                expense: { section: 'expenses', formId: 'quickAddExpense', fallbackFormId: 'addExpenseForm', openForm: showAddExpense },
                income: { section: 'otherIncome', formId: 'quickAddIncome', fallbackFormId: 'addOtherIncomeForm', openForm: showAddOtherIncome },
                bookings: { section: 'bookings', formId: 'quickAddBooking', fallbackFormId: 'addBookingForm', openForm: showAddBooking },
                expenses: { section: 'expenses', formId: 'quickAddExpense', fallbackFormId: 'addExpenseForm', openForm: showAddExpense },
                otherIncome: { section: 'otherIncome', formId: 'quickAddIncome', fallbackFormId: 'addOtherIncomeForm', openForm: showAddOtherIncome },
                artists: { section: 'artists', formId: null, fallbackFormId: 'addArtistForm', openForm: showAddArtistForm }
            };

            const config = quickAddConfig[targetKey];
            if (!config) {
                console.warn(`Unknown quick-add target: ${targetKey}`);
                return;
            }

            const knownForms = ['addBookingForm', 'addExpenseForm', 'addOtherIncomeForm', 'addArtistForm', 'quickAddBooking', 'quickAddExpense', 'quickAddIncome'];
            knownForms.forEach((formId) => {
                const formEl = document.getElementById(formId);
                if (formEl) {
                    formEl.style.display = 'none';
                }
            });

            showSection(config.section);

            const targetForm = (config.formId && document.getElementById(config.formId))
                || (config.fallbackFormId && document.getElementById(config.fallbackFormId));

            if (!targetForm) {
                const expectedId = config.formId || config.fallbackFormId;
                console.warn(`Quick Add target form not found: #${expectedId}`);
                return;
            }

            config.openForm();
            targetForm.style.display = 'block';
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });

            const firstInput = targetForm.querySelector('input, select, textarea');
            if (firstInput instanceof HTMLElement) {
                firstInput.focus({ preventScroll: true });
            }
        }

        /**
         * Show detail view for clicked stat card
         * @param {string} type - Type of detail to show
         */
        function showDetailView(type) {
            showSection('bookings');
            
            setTimeout(() => {
                const table = document.getElementById('bookingsTable');
                const cardsContainer = document.getElementById('bookingsCards');
                
                if (type === 'totalIncome') {
                    // Show all bookings
                    toastInfo('Showing all bookings');
                    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (type === 'balances') {
                    // Filter to show only bookings with balances due
                    toastInfo('Showing balances due');
                    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (type === 'deposits') {
                    // Show bookings with deposits
                    toastInfo('Showing deposits received');
                    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (type === 'upcoming') {
                    // Filter to upcoming shows only
                    toastInfo('Showing upcoming shows');
                    if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 200);
        }

        function clearDashboardSearchResults() {
            const results = document.getElementById('dashboardSearchResults');
            if (!results) return;
            results.classList.remove('active');
            results.innerHTML = '';
        }

        function buildDashboardSearchResultMarkup(item) {
            const section = escapeHtml(item.section);
            const type = escapeHtml(item.type);
            const id = escapeHtml(item.id);
            const label = escapeHtml(item.label);
            const sub = escapeHtml(item.sub);
            const aria = escapeHtml(`${item.type}: ${item.label}`);
            return `<div class="search-result-item" role="option" tabindex="0" data-section="${section}" data-type="${type}" data-id="${id}" aria-label="${aria}">
                <div class="search-result-type">${type}</div>
                <div>${label}</div>
                <div class="search-result-sub">${sub}</div>
            </div>`;
        }

        function bindDashboardSearchResultInteractions() {
            if (window.__starPaperSearchResultInteractionsBound) return;
            const results = document.getElementById('dashboardSearchResults');
            if (!results) return;
            window.__starPaperSearchResultInteractionsBound = true;

            const activateResult = (resultEl) => {
                if (!resultEl) return;
                const { section, type, id } = resultEl.dataset;
                if (!section || !type || id === undefined) return;
                selectSearchResult(section, type, id);
            };

            results.addEventListener('click', (event) => {
                const target = event.target?.closest?.('.search-result-item[data-section]');
                if (!target) return;
                activateResult(target);
            });

            results.addEventListener('keydown', (event) => {
                const target = event.target?.closest?.('.search-result-item[data-section]');
                if (!target) return;
                const key = event.key;
                if (key === 'Enter' || key === ' ') {
                    event.preventDefault();
                    activateResult(target);
                    return;
                }
                if (key !== 'ArrowDown' && key !== 'ArrowUp') return;

                const items = Array.from(results.querySelectorAll('.search-result-item[data-section]'));
                if (!items.length) return;
                const currentIndex = items.indexOf(target);
                if (currentIndex === -1) return;
                event.preventDefault();
                const nextIndex = key === 'ArrowDown'
                    ? (currentIndex + 1) % items.length
                    : (currentIndex - 1 + items.length) % items.length;
                items[nextIndex]?.focus();
            });
        }

        // FIXED: shared inline editor for cloud-backed bookings, expenses, and other income.
        const INLINE_EDIT_CONFIG = {
            booking: {
                label: 'Booking',
                collection: () => bookings,
                assign: (items) => { bookings = items; window.bookings = bookings; },
                save: () => (typeof window.SP?.saveBookings === 'function' ? window.SP.saveBookings(bookings) : saveUserData()),
                render: () => {
                    renderBookings();
                    updateDashboard();
                    renderCalendar();
                    renderPerformanceMap();
                    updateReportStatistics();
                },
                fields: {
                    event: { label: 'Event', type: 'text', required: true },
                    artist: { label: 'Artist', type: 'text', required: true },
                    date: { label: 'Date', type: 'date', required: true },
                    capacity: { label: 'Capacity', type: 'number', min: 0 },
                    location: { label: 'Location', type: 'text' },
                    fee: { label: 'Total Fee', type: 'number', required: true, min: 1 },
                    deposit: { label: 'Deposit', type: 'number', min: 0 },
                    contact: { label: 'Contact', type: 'text' },
                    status: {
                        label: 'Status',
                        type: 'select',
                        options: ['pending', 'confirmed', 'cancelled', 'completed'],
                    },
                    notes: { label: 'Notes', type: 'textarea' },
                },
            },
            expense: {
                label: 'Expense',
                collection: () => expenses,
                assign: (items) => { expenses = items; window.expenses = expenses; },
                save: () => (typeof window.SP?.saveExpenses === 'function' ? window.SP.saveExpenses(expenses) : saveUserData()),
                render: () => {
                    renderExpenses();
                    updateDashboard();
                    updateReportStatistics();
                },
                fields: {
                    description: { label: 'Description', type: 'text', required: true },
                    category: {
                        label: 'Category',
                        type: 'select',
                        options: ['transport', 'accommodation', 'equipment', 'food', 'marketing', 'supplies', 'costumes', 'salary', 'miscellaneous', 'other'],
                    },
                    amount: { label: 'Amount', type: 'number', required: true, min: 1 },
                    date: { label: 'Date', type: 'date', required: true },
                },
            },
            otherIncome: {
                label: 'Other Income',
                collection: () => otherIncome,
                assign: (items) => { otherIncome = items; window.otherIncome = otherIncome; },
                save: () => (typeof window.SP?.saveOtherIncome === 'function' ? window.SP.saveOtherIncome(otherIncome) : saveUserData()),
                render: () => {
                    renderOtherIncome();
                    updateDashboard();
                    updateReportStatistics();
                },
                fields: {
                    source: { label: 'Source', type: 'text', required: true },
                    type: {
                        label: 'Type',
                        type: 'select',
                        options: ['tips', 'donation', 'merch', 'endorsement', 'sponsorship', 'gift', 'other'],
                    },
                    amount: { label: 'Amount', type: 'number', required: true, min: 1 },
                    date: { label: 'Date', type: 'date', required: true },
                    payer: { label: 'Payer', type: 'text' },
                    method: { label: 'Method', type: 'select', options: ['cash', 'mobile', 'bank', 'online'] },
                    status: { label: 'Status', type: 'select', options: ['received', 'pending'] },
                    notes: { label: 'Notes', type: 'textarea' },
                },
            },
            artist: {
                label: 'Artist',
                collection: () => artists,
                assign: (items) => { artists = items; window.artists = artists; },
                save: () => (typeof window.SP?.saveArtists === 'function' ? window.SP.saveArtists(artists) : saveUserData()),
                render: () => {
                    renderArtists();
                    populateArtistDropdown();
                    populateAudienceArtistDropdown();
                    updateDashboard();
                    renderPerformanceMap();
                    updateReportStatistics();
                },
                fields: {
                    name: { label: 'Artist Name', type: 'text', required: true },
                    specialty: { label: 'Specialty', type: 'text' },
                    email: { label: 'Email', type: 'email' },
                    phone: { label: 'Phone', type: 'text' },
                    strategicGoal: { label: 'Strategic Goal', type: 'textarea' },
                    bio: { label: 'Bio', type: 'textarea' },
                },
            },
            audienceMetric: {
                label: 'Audience Metric',
                collection: () => audienceMetrics,
                assign: (items) => {
                    audienceMetrics = items;
                    window.audienceMetrics = audienceMetrics;
                    saveAudienceMetricsForScope(getActiveDataScopeKey(), audienceMetrics);
                },
                save: () => syncCloudExtras(),
                render: () => {
                    renderAudienceMetrics();
                    updateDashboard();
                    updateReportStatistics();
                },
                fields: {
                    period: { label: 'Period', type: 'month', required: true },
                    socialFollowers: { label: 'Social Media Followers', type: 'number', min: 0 },
                    spotifyListeners: { label: 'Spotify Listeners', type: 'number', min: 0 },
                    youtubeListeners: { label: 'YouTube Listeners', type: 'number', min: 0 },
                },
            },
            task: {
                label: 'Task',
                collection: () => (typeof window.loadTasks === 'function' ? window.loadTasks() : []),
                assign: (items) => {
                    if (typeof window.applyTaskSync === 'function') window.applyTaskSync(items, { source: 'inline-edit', render: false });
                },
                save: () => {
                    const nextTasks = typeof window.loadTasks === 'function' ? window.loadTasks() : [];
                    if (typeof window.SP?.saveTasks === 'function') {
                        // FIXED: task saves normalize Supabase's void success into the shared cloud feedback shape.
                        return window.SP.saveTasks(nextTasks).then(() => ({ ok: true, cloudSynced: true }));
                    }
                    return syncCloudExtras();
                },
                render: () => {
                    if (typeof window.renderTasks === 'function') window.renderTasks();
                    updateDashboard();
                },
                fields: {
                    text: { label: 'Task', type: 'text', required: true },
                    dueDate: { label: 'Due Date', type: 'date' },
                },
            },
            revenueGoal: {
                label: 'Revenue Goal',
                collection: () => ([{ id: 'current', amount: getCurrentMonthlyRevenueGoal() }]),
                assign: (items) => setCurrentMonthlyRevenueGoal(items?.[0]?.amount || 0),
                apply: (_record, _field, value) => setCurrentMonthlyRevenueGoal(value),
                save: () => syncCloudExtras(),
                render: () => {
                    updateDashboard();
                    if (typeof window.renderMomentumDashboard === 'function') window.renderMomentumDashboard();
                },
                fields: {
                    amount: { label: 'Monthly Revenue Goal', type: 'number', min: 0 },
                },
            },
            bbf: {
                label: 'BBF',
                collection: () => {
                    const context = getActiveBBFContext();
                    return [{
                        id: 'current',
                        amount: Number(context.amount) || 0,
                        period: context.period,
                        artistId: context.artist?.id || '',
                        artistName: context.artist?.name || '',
                    }];
                },
                assign: (items) => {
                    const entry = items?.[0] || {};
                    setCurrentBBF(entry.amount || 0, {
                        period: entry.period,
                        artistId: entry.artistId,
                        artistName: entry.artistName,
                    });
                },
                apply: (record, _field, value) => setCurrentBBF(value, {
                    period: record?.period,
                    artistId: record?.artistId,
                    artistName: record?.artistName,
                }),
                save: () => syncCloudExtras(),
                render: () => {
                    updateDashboard();
                    if (typeof window.renderMomentumDashboard === 'function') window.renderMomentumDashboard();
                },
                fields: {
                    amount: { label: 'Balance Brought Forward', type: 'number', min: 0 },
                },
            },
        };

        function inlineEditAttrs(recordType, recordId, field, label) {
            const safeType = escapeHtml(recordType);
            const safeId = escapeHtml(String(recordId ?? ''));
            const safeField = escapeHtml(field);
            const safeLabel = escapeHtml(label || field);
            return `data-record-type="${safeType}" data-record-id="${safeId}" data-field="${safeField}" data-label="${safeLabel}" tabindex="0" role="button" aria-label="Edit ${safeLabel}" title="Double-click to edit ${safeLabel}"`;
        }

        function deleteRecordAttrs(recordType, recordId) {
            return `data-delete-record-type="${escapeHtml(recordType)}" data-delete-record-id="${escapeHtml(String(recordId ?? ''))}"`;
        }

        function applyInlineEditMetadata(element, recordType, recordId, field, label) {
            if (!element) return;
            element.classList.add('sp-inline-editable');
            element.dataset.recordType = recordType;
            element.dataset.recordId = String(recordId ?? '');
            element.dataset.field = field;
            element.dataset.label = label || field;
            element.tabIndex = 0;
            element.setAttribute('role', 'button');
            element.setAttribute('aria-label', `Edit ${label || field}`);
            element.title = `Double-click to edit ${label || field}`; // FIXED: dynamic dashboard metrics are inline-edit targets too.
        }

        function formatInlineMoney(value) {
            return `UGX ${(Math.round(Number(value) || 0)).toLocaleString()}`;
        }

        function formatInlineTitle(value) {
            const text = String(value || '').trim();
            return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
        }

        function getInlineEditConfig(recordType, field) {
            const typeConfig = INLINE_EDIT_CONFIG[recordType];
            if (!typeConfig) return null;
            const fieldConfig = typeConfig.fields[field];
            return fieldConfig ? { typeConfig, fieldConfig } : null;
        }

        function getInlineRecord(recordType, recordId) {
            const typeConfig = INLINE_EDIT_CONFIG[recordType];
            const collection = typeConfig?.collection?.() || [];
            return collection.find((item) => isSameRecordId(item?.id, recordId)) || null;
        }

        function normalizeInlineValue(rawValue, fieldConfig) {
            if (fieldConfig.type === 'number') {
                const cleaned = String(rawValue ?? '').replace(/,/g, '').trim();
                return Math.round(Number(cleaned) || 0);
            }
            if (fieldConfig.type === 'date' || fieldConfig.type === 'month') {
                return String(rawValue || '').trim();
            }
            if (fieldConfig.type === 'select') {
                const value = sanitizeTextInput(rawValue).toLowerCase();
                const options = typeof fieldConfig.options === 'function' ? fieldConfig.options() : fieldConfig.options;
                return options.includes(value) ? value : options[0];
            }
            return sanitizeTextInput(rawValue);
        }

        function validateInlineValue(value, fieldConfig) {
            if (fieldConfig.required && (value === '' || value === null || typeof value === 'undefined')) {
                return `${fieldConfig.label} is required.`;
            }
            if (fieldConfig.type === 'number') {
                const min = typeof fieldConfig.min === 'number' ? fieldConfig.min : null;
                if (min !== null && Number(value) < min) {
                    return `${fieldConfig.label} must be at least ${min}.`;
                }
            }
            if (fieldConfig.type === 'date' && fieldConfig.required && !/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
                return 'Use a valid date.';
            }
            if (fieldConfig.type === 'month' && fieldConfig.required && !/^\d{4}-\d{2}$/.test(String(value || ''))) {
                return 'Use a valid month.';
            }
            return '';
        }

        function createInlineEditControl(record, field, fieldConfig) {
            const tag = fieldConfig.type === 'textarea' ? 'textarea' : (fieldConfig.type === 'select' ? 'select' : 'input');
            const control = document.createElement(tag);
            control.className = 'sp-inline-edit-control';
            control.dataset.inlineEditControl = '1';
            if (tag === 'input') {
                control.type = fieldConfig.type === 'number'
                    ? 'number'
                    : (fieldConfig.type === 'date' ? 'date' : (fieldConfig.type === 'month' ? 'month' : (fieldConfig.type === 'email' ? 'email' : 'text')));
                if (typeof fieldConfig.min === 'number') control.min = String(fieldConfig.min);
                if (fieldConfig.type === 'number') control.inputMode = 'numeric';
            }
            if (tag === 'select') {
                const options = typeof fieldConfig.options === 'function' ? fieldConfig.options() : fieldConfig.options;
                options.forEach((option) => {
                    const optionEl = document.createElement('option');
                    optionEl.value = option;
                    optionEl.textContent = formatInlineTitle(option);
                    control.appendChild(optionEl);
                });
            }
            control.value = record?.[field] ?? '';
            return control;
        }

        async function commitInlineEdit(cell, control, previousHtml) {
            const recordType = cell.dataset.recordType;
            const recordId = cell.dataset.recordId;
            const field = cell.dataset.field;
            const config = getInlineEditConfig(recordType, field);
            if (!config) {
                cell.innerHTML = previousHtml;
                cell.classList.remove('is-editing');
                return true;
            }

            const { typeConfig, fieldConfig } = config;
            const record = getInlineRecord(recordType, recordId);
            if (!record) {
                cell.innerHTML = previousHtml;
                cell.classList.remove('is-editing');
                toastError('Record not found. Refresh and try again.');
                return true;
            }

            const nextValue = normalizeInlineValue(control.value, fieldConfig);
            const validationMessage = validateInlineValue(nextValue, fieldConfig);
            if (validationMessage) {
                toastError(validationMessage);
                control.focus();
                return false;
            }

            const previousValue = record[field] ?? '';
            if (String(previousValue) === String(nextValue)) {
                cell.innerHTML = previousHtml;
                cell.classList.remove('is-editing');
                return true;
            }

            const previousCollection = (typeConfig.collection() || []).map((item) => ({ ...item }));
            const previousArtists = Array.isArray(artists) ? artists.map((item) => ({ ...item })) : [];
            record[field] = nextValue;
            if (typeof typeConfig.apply === 'function') {
                typeConfig.apply(record, field, nextValue); // FIXED: virtual cloud-backed values like BBF/goals update their real store.
            }
            if (recordType === 'booking' && (field === 'fee' || field === 'deposit')) {
                record.balance = Math.round(Number(record.fee) || 0) - Math.round(Number(record.deposit) || 0);
            }
            if (recordType === 'booking' && field === 'artist') {
                const linkedArtist = ensureArtistForBookingName(record.artist, currentManagerId); // FIXED: inline artist edits preserve booking->artist cloud links.
                record.artistId = linkedArtist?.id || null;
            }

            markSearchIndexDirty();
            syncWindowState();
            cell.classList.add('is-saving');
            typeConfig.render();

            try {
                await persistMutationWithCloudFeedback(async () => {
                    if (recordType === 'booking' && field === 'artist') {
                        const artistsChanged = previousArtists.length !== artists.length || previousArtists.some((artist, index) => {
                            const nextArtist = artists[index];
                            return JSON.stringify(artist) !== JSON.stringify(nextArtist);
                        });
                        if (artistsChanged && typeof window.SP?.saveArtists === 'function') {
                            const artistSyncResult = await window.SP.saveArtists(artists);
                            if (!(artistSyncResult?.ok || artistSyncResult?.cloudSynced)) {
                                const error = new Error(getCloudFailureMessage(artistSyncResult, 'Artist link could not be saved in the cloud.'));
                                error.syncResult = artistSyncResult;
                                throw error;
                            }
                        }
                    }
                    return typeConfig.save();
                }, {
                    successMessage: `${typeConfig.label} updated in cloud.`
                });
            } catch (err) {
                typeConfig.assign(previousCollection);
                if (recordType === 'booking') {
                    artists = previousArtists;
                    window.artists = artists;
                }
                markSearchIndexDirty();
                typeConfig.render();
                toastError(getCloudFailureMessage(err?.syncResult, `${typeConfig.label} could not be updated in the cloud. Your last change was undone.`));
            }
            return true;
        }

        function beginInlineEdit(cell) {
            if (!cell || cell.classList.contains('is-editing') || cell.classList.contains('is-saving')) return;
            const recordType = cell.dataset.recordType;
            const recordId = cell.dataset.recordId;
            const field = cell.dataset.field;
            const config = getInlineEditConfig(recordType, field);
            const record = getInlineRecord(recordType, recordId);
            if (!config || !record || guardReadOnly(`edit ${config.typeConfig.label.toLowerCase()}`)) return;

            const previousHtml = cell.innerHTML;
            const control = createInlineEditControl(record, field, config.fieldConfig);
            let finished = false;
            let committing = false;
            const finish = (shouldCommit) => {
                if (finished || committing) return;
                if (!shouldCommit) {
                    finished = true;
                    cell.innerHTML = previousHtml;
                    cell.classList.remove('is-editing');
                    return;
                }
                committing = true;
                commitInlineEdit(cell, control, previousHtml).then((done) => {
                    committing = false;
                    finished = Boolean(done);
                });
            };

            cell.classList.add('is-editing');
            cell.innerHTML = '';
            cell.appendChild(control);
            control.addEventListener('click', (event) => event.stopPropagation());
            control.addEventListener('pointerup', (event) => event.stopPropagation());
            control.addEventListener('blur', () => finish(true));
            control.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                    return;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    finish(true);
                }
            });
            if (control.tagName === 'SELECT') {
                control.addEventListener('change', () => finish(true));
            }
            setTimeout(() => {
                control.focus();
                if (typeof control.select === 'function' && control.tagName !== 'SELECT') {
                    control.select();
                }
            }, 0);
        }

        function bindInlineEditController() {
            if (window.__spInlineEditBound) return;
            window.__spInlineEditBound = true;
            const isInlineTarget = (event) => {
                const rawTarget = event && event.target;
                const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
                if (!target || typeof target.closest !== 'function') return null;
                if (target.closest('button, a, input, select, textarea, [data-inline-edit-control]')) return null;
                return target.closest('.sp-inline-editable[data-record-type][data-record-id][data-field]');
            };

            document.addEventListener('dblclick', (event) => {
                const cell = isInlineTarget(event);
                if (!cell) return;
                event.preventDefault();
                event.stopPropagation();
                beginInlineEdit(cell);
            });

            document.addEventListener('pointerup', (event) => {
                const isTouchLike = event.pointerType === 'touch' || window.matchMedia?.('(pointer: coarse)')?.matches;
                if (!isTouchLike) return;
                const cell = isInlineTarget(event);
                if (!cell) return;
                event.preventDefault();
                event.stopPropagation();
                beginInlineEdit(cell);
            }, { passive: false });

            document.addEventListener('click', (event) => {
                const cell = isInlineTarget(event);
                if (!cell) return;
                event.stopPropagation(); // FIXED: inline cells/cards no longer bubble into row/card/modal open handlers.
            }, true);

            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const cell = isInlineTarget(event);
                if (!cell) return;
                event.preventDefault();
                beginInlineEdit(cell);
            });

            document.addEventListener('click', (event) => {
                const rawTarget = event && event.target;
                const target = rawTarget && rawTarget.nodeType === Node.TEXT_NODE ? rawTarget.parentElement : rawTarget;
                const deleteBtn = target?.closest?.('[data-delete-record-type][data-delete-record-id]');
                if (!deleteBtn) return;
                event.preventDefault();
                event.stopPropagation();
                const recordType = deleteBtn.dataset.deleteRecordType;
                const recordId = deleteBtn.dataset.deleteRecordId;
                if (recordType === 'booking') deleteBooking(recordId);
                if (recordType === 'expense') deleteExpense(recordId);
                if (recordType === 'otherIncome') deleteOtherIncome(recordId);
            });
        }

        function bindMobileUtilityActions() {
            if (window.__spMobileUtilityActionsBound) return;
            window.__spMobileUtilityActionsBound = true;
            document.getElementById('settingsAboutBtn')?.addEventListener('click', (event) => {
                event.preventDefault();
                if (typeof window.showAboutModal === 'function') window.showAboutModal();
                else if (typeof showAboutModal === 'function') showAboutModal();
            });
            document.getElementById('settingsLogoutBtn')?.addEventListener('click', (event) => {
                event.preventDefault();
                if (typeof window.logout === 'function') {
                    window.logout();
                    return;
                }
                if (typeof logout === 'function') logout();
            });
        }

        let searchCoinLastBurstAt = 0;
        function triggerSearchCoinCascade(event, count = 10) {
            // FIXED: performant CSS particles, throttled for mobile typing and reduced-motion users.
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
            const now = Date.now();
            if (now - searchCoinLastBurstAt < 130) return;
            searchCoinLastBurstAt = now;

            const input = event?.target?.id === 'dashboardSearch'
                ? event.target
                : document.getElementById('dashboardSearch');
            const searchBar = input?.closest?.('.search-bar');
            if (!searchBar) return;

            let layer = searchBar.querySelector('.search-coin-layer');
            if (!layer) {
                layer = document.createElement('div');
                layer.className = 'search-coin-layer';
                layer.setAttribute('aria-hidden', 'true');
                searchBar.appendChild(layer);
            }

            const clampedCount = Math.max(4, Math.min(Number(count) || 8, 18));
            for (let index = 0; index < clampedCount; index += 1) {
                const coin = document.createElement('span');
                coin.className = 'sp-search-coin';
                const size = 10 + Math.random() * 8;
                const duration = 680 + Math.random() * 520;
                coin.style.setProperty('--coin-x', String(Math.round(8 + Math.random() * 84)));
                coin.style.setProperty('--coin-size', `${size.toFixed(1)}px`);
                coin.style.setProperty('--coin-drift', `${(-32 + Math.random() * 64).toFixed(1)}px`);
                coin.style.setProperty('--coin-spin', `${Math.round(360 + Math.random() * 720)}deg`);
                coin.style.setProperty('--coin-dur', `${Math.round(duration)}ms`);
                coin.style.setProperty('--coin-delay', `${Math.round(index * 18 + Math.random() * 60)}ms`);
                layer.appendChild(coin);
                setTimeout(() => coin.remove(), duration + 260);
            }
        }

        function handleDashboardSearchInputKeydown(event) {
            const key = event.key;
            const input = event.target;
            const results = document.getElementById('dashboardSearchResults');
            if (!input || !results) return;

            if (key === 'Escape') {
                input.value = '';
                clearDashboardSearchResults();
                return;
            }

            if (key !== 'ArrowDown') return;
            if (!results.classList.contains('active')) return;
            const firstResult = results.querySelector('.search-result-item[data-section]');
            if (!firstResult) return;
            event.preventDefault();
            firstResult.focus();
        }



        function runDashboardSearch(query) {
            const input = document.getElementById('dashboardSearch');
            const results = document.getElementById('dashboardSearchResults');
            if (!input || !results) return;

            if (!query) {
                clearDashboardSearchResults();
                return;
            }

            const matches = buildSearchIndex()
                .filter(item => item.searchText.includes(query))
                .slice(0, 6);

            if (matches.length === 0) {
                results.classList.add('active');
                results.innerHTML = `<div class="search-result-item search-result-empty" aria-disabled="true">
                    <div class="search-result-type">No results</div>
                    <div class="search-result-sub">Try another keyword.</div>
                </div>`;
                return;
            }

            results.classList.add('active');
            results.innerHTML = matches.map((item) => buildDashboardSearchResultMarkup(item)).join('');
        }

        function handleDashboardSearch() {
            const input = document.getElementById('dashboardSearch');
            const results = document.getElementById('dashboardSearchResults');
            if (!input || !results) return;

            const query = input.value.trim().toLowerCase();
            if (!query) {
                if (searchInputDebounceTimer) {
                    clearTimeout(searchInputDebounceTimer);
                    searchInputDebounceTimer = null;
                }
                clearDashboardSearchResults();
                return;
            }

            if (searchInputDebounceTimer) {
                clearTimeout(searchInputDebounceTimer);
            }

            // Debounce input to keep mobile typing and filtering smooth.
            searchInputDebounceTimer = setTimeout(() => {
                runDashboardSearch(input.value.trim().toLowerCase());
            }, 100);
        }

        function buildSearchIndex() {
            if (!searchIndexDirty && searchIndexCache.length) {
                return searchIndexCache;
            }

            const items = [];
            bookings.forEach(booking => {
                items.push({
                    id: booking.id,
                    type: 'Booking',
                    section: 'bookings',
                    label: `${booking.event} - ${booking.artist}`,
                    sub: `${formatDisplayDate(booking.date)}  -  ${booking.location || 'Location TBD'}`,
                    searchText: `${booking.event} ${booking.artist} ${booking.location} ${booking.contact}`.toLowerCase()
                });
            });

            expenses.forEach(expense => {
                items.push({
                    id: expense.id,
                    type: 'Expense',
                    section: 'expenses',
                    label: expense.description,
                    sub: `${formatDisplayDate(expense.date)}  -  ${expense.category}  -  UGX ${(Math.round(Number(expense.amount) || 0)).toLocaleString()}`,
                    searchText: `${expense.description} ${expense.category}`.toLowerCase()
                });
            });

            otherIncome.forEach(item => {
                items.push({
                    id: item.id,
                    type: 'Other Income',
                    section: 'otherIncome',
                    label: item.source,
                    sub: `${formatDisplayDate(item.date)}  -  ${item.type}  -  UGX ${(Math.round(Number(item.amount) || 0)).toLocaleString()}`,
                    searchText: `${item.source} ${item.type} ${item.payer}`.toLowerCase()
                });
            });

            getArtists().forEach((artist) => {
                const name = artist.name;
                items.push({
                    id: artist.id || name,
                    type: 'Artist',
                    section: 'artists',
                    label: name,
                    sub: `${artist.specialty || 'Artist'}  -  ${artist.email || 'No email'}`,
                    searchText: `${name} ${artist.specialty || ''} ${artist.email || ''} ${artist.phone || ''}`.toLowerCase()
                });
            });

            (typeof window.loadTasks === 'function' ? window.loadTasks() : []).forEach((task) => {
                items.push({
                    id: task.id,
                    type: 'Task',
                    section: 'tasks',
                    label: task.text || 'Task',
                    sub: task.dueDate ? `Due ${formatDisplayDate(task.dueDate)}` : 'No due date',
                    searchText: `${task.text || ''} ${task.dueDate || ''}`.toLowerCase()
                });
            });

            audienceMetrics.forEach((metric) => {
                items.push({
                    id: metric.id || `${metric.artistId || metric.artist}-${metric.period}`,
                    type: 'Audience Metric',
                    section: 'reports',
                    label: `${metric.artist || 'Artist'} audience`,
                    sub: `${metric.period || ''} - Social Media ${(Number(metric.socialFollowers) || 0).toLocaleString()}`,
                    searchText: `${metric.artist || ''} ${metric.period || ''} ${metric.socialFollowers || ''} ${metric.spotifyListeners || ''} ${metric.youtubeListeners || ''}`.toLowerCase()
                });
            });

            searchIndexCache = items;
            searchIndexDirty = false;
            return searchIndexCache;
        }

        /**
         * Enhanced search result selection
         * - Switches to correct section/tab (including Admin if needed)
         * - Scrolls to element
         * - Applies temporary highlight
         * @param {string} section - Section to navigate to
         * @param {string} type - Type of result
         * @param {string} id - ID of element
         */
        function selectSearchResult(section, type, id) {
            const input = document.getElementById('dashboardSearch');
            
            // Clear search UI
            clearDashboardSearchResults();
            if (input) {
                input.value = '';
            }
            
            // Check if we need to switch user view (e.g., to Admin)
            // This handles cases where the result is in a different user's view
            const targetElement = getSearchTargetElement(type, id);
            if (targetElement) {
                const sectionElement = document.getElementById(section);
                if (sectionElement && sectionElement.style.display === 'none') {
                    // Section is hidden, might need to switch view
                    console.log('Switching to section:', section);
                }
            }
            
            // Switch to the correct section
            showSection(section);
            
            // Allow time for section to render
            setTimeout(() => {
                highlightSearchResultEnhanced(type, id);
            }, 200);
        }
        
        /**
         * Get search target element
         * @param {string} type - Type of result  
         * @param {string} id - ID of element
         * @returns {HTMLElement|null} Target element
         */
        function getSearchTargetElement(type, id) {
            const selectors = {
                'Booking': `[data-booking-id="${id}"]`,
                'Expense': `[data-expense-id="${id}"]`,
                'Other Income': `[data-other-income-id="${id}"]`,
                'Artist': `[data-artist-id="${id}"]`
            };
            
            const selector = selectors[type];
            if (type === 'Artist') {
                return document.querySelector(selector) || document.querySelector(`[data-artist-name="${id}"]`);
            }
            return selector ? document.querySelector(selector) : null;
        }

        /**
         * Enhanced highlight with auto-remove after 3 seconds
         * @param {string} type - Type of result
         * @param {string} id - ID of element
         */
        function getVisibleSearchTarget(selector) {
            const nodes = Array.from(document.querySelectorAll(selector));
            if (!nodes.length) return null;
            const visibleNode = nodes.find(el => {
                if (!(el instanceof HTMLElement)) return false;
                if (el.offsetParent === null) return false;
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
            return visibleNode || nodes[0];
        }

        function highlightSearchResultEnhanced(type, id, attempt = 0) {
            // Remove any existing highlights
            document.querySelectorAll('.search-highlight').forEach(el => {
                el.classList.remove('search-highlight');
            });
            
            // Find target element based on type
            let target = null;
            const selectors = {
                'Booking': `[data-booking-id="${id}"]`,
                'Expense': `[data-expense-id="${id}"]`,
                'Other Income': `[data-other-income-id="${id}"]`,
                'Artist': `[data-artist-id="${id}"]`
            };
            
            const selector = selectors[type];
            if (selector) {
                target = getVisibleSearchTarget(selector);
                if (!target && type === 'Artist') {
                    target = getVisibleSearchTarget(`[data-artist-name="${id}"]`);
                }
            }
            
            if (!target) {
                if (attempt < 1) {
                    setTimeout(() => {
                        highlightSearchResultEnhanced(type, id, attempt + 1);
                    }, 180);
                } else {
                    console.warn('Search target not found:', type, id);
                }
                return;
            }
            
            // Scroll to element with smooth behavior
            target.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
            });
            
            // Apply highlight class
            target.classList.add('search-highlight');
            
            // Add pulsing animation
            target.style.animation = 'searchPulse 0.6s ease-in-out 3';
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
                target.classList.remove('search-highlight');
                target.style.animation = '';
            }, 3000);
        }
        
        // Keep backward compatibility
        function highlightSearchResult(type, id) {
            highlightSearchResultEnhanced(type, id);
        }

        function closeSidebar() {
            requestAnimationFrame(() => toggleSidebar(false));
        }

        function normalizeThemeValue(theme) {
            return theme === 'light' ? 'light' : 'dark';
        }

        function getStoredThemePreference() {
            let stored = null;
            try {
                stored = localStorage.getItem('starPaperTheme');
            } catch (_err) {
                stored = null;
            }
            if (stored !== 'light' && stored !== 'dark') {
                stored = Storage.loadSync('starPaperTheme', null);
            }
            return stored === 'light' || stored === 'dark' ? stored : null;
        }

        function hasStoredThemePreference() {
            return Boolean(getStoredThemePreference());
        }

        function applyTheme(theme, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const normalizedTheme = normalizeThemeValue(theme);
            const isLight = normalizedTheme === 'light';
            const shouldPersist = opts.persist !== false;
            const shouldSync = shouldPersist && opts.syncRemote !== false;
            document.body.classList.toggle('light-theme', isLight);
            if (shouldPersist) {
                try {
                    localStorage.setItem('starPaperTheme', normalizedTheme);
                } catch (_err) {}
                Storage.saveSync('starPaperTheme', normalizedTheme);
            }
            updateThemeIcons(isLight);
            syncSidebarThemeButtonState(isLight);
            if (currentUser) {
                updateDashboard();
                if (document.getElementById('moneyPanel-reports')?.classList.contains('sp-tab-panel--active') &&
                    typeof window.renderMomentumDashboard === 'function') {
                    window.renderMomentumDashboard();
                }
            }
            if (shouldSync) {
                syncCloudExtras({ includeTheme: true });
            }
        }

        function setTheme(theme) {
            applyTheme(theme === 'light' ? 'light' : 'dark');
        }

        function toggleTheme() {
            const isLight = document.body.classList.contains('light-theme');
            const nextTheme = isLight ? 'dark' : 'light';
            applyTheme(nextTheme);
        }

        window.applyTheme = applyTheme;
        window.hasStoredThemePreference = hasStoredThemePreference;

        function syncSidebarThemeButtonState(isLight) {
            const lightBtn = document.getElementById('sidebarLightBtn');
            const darkBtn = document.getElementById('sidebarDarkBtn');
            lightBtn?.classList.toggle('active', isLight);
            darkBtn?.classList.toggle('active', !isLight);
        }

        function updateThemeIcons(isLight) {
            const landingToggle = document.getElementById('landingThemeToggle');
            if (landingToggle) {
                landingToggle.innerHTML = isLight
                    ? '<i class="ph ph-sun" aria-hidden="true"></i>'
                    : '<i class="ph ph-moon" aria-hidden="true"></i>';
                landingToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
            }
        }

function showLoginForm(options = {}) {
            resetCloudSaveInFlightFlags('show-login');
            const instantPublicReveal = !options.flowId && shouldUseInstantPublicReveal(options);
            const flowId = instantPublicReveal
                ? null
                : (options.flowId || beginBootTransition('show-login', 'auth-required'));
            // Lock body scroll while the auth screen is open.
            document.body.classList.add('sp-auth-open');
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('signupForm').style.display = 'none';
            document.getElementById('forgotPasswordForm').style.display = 'none';
            const h = document.getElementById('loginBoxHeading');
            const s = document.getElementById('loginBoxSubtext');
            if (h) h.textContent = 'Welcome back to Star Paper';
            if (s) s.textContent = 'Sign in to continue to your dashboard.';
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe) {
                rememberMe.checked = false;
            }
            clearLoginValidation();
            setLoginLoading(false);
            if (instantPublicReveal) {
                revealPublicScreenInstant('loginScreen');
            } else {
                commitBootTransition('loginScreen', { flowId, minDelayMs: 120 });
            }
        }

        function showSignupForm(options = {}) {
            resetCloudSaveInFlightFlags('show-signup');
            const instantPublicReveal = !options.flowId && shouldUseInstantPublicReveal(options);
            const flowId = instantPublicReveal
                ? null
                : (options.flowId || beginBootTransition('show-signup', 'auth-required'));
            // Lock body scroll while the auth screen is open.
            document.body.classList.add('sp-auth-open');
            document.getElementById('signupForm').style.display = 'block';
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('forgotPasswordForm').style.display = 'none';
            const h = document.getElementById('loginBoxHeading');
            const s = document.getElementById('loginBoxSubtext');
            if (h) h.textContent = 'Welcome to Star Paper';
            if (s) s.textContent = 'Create your account to get started.';
            clearLoginValidation();
            setLoginLoading(false);
            if (instantPublicReveal) {
                revealPublicScreenInstant('loginScreen');
            } else {
                commitBootTransition('loginScreen', { flowId, minDelayMs: 120 });
            }
        }

        function showLanding(options = {}) {
            resetCloudSaveInFlightFlags('show-landing');
            const instantPublicReveal = !options.flowId && shouldUseInstantPublicReveal(options);
            const flowId = instantPublicReveal
                ? null
                : (options.flowId || beginBootTransition('show-landing', options.state || 'loading-session', {
                    text: options.text,
                    subtext: options.subtext
                }));
            // Release the body scroll lock — the landing scrolls again.
            document.body.classList.remove('sp-auth-open');
            clearForms();
            if (instantPublicReveal) {
                revealPublicScreenInstant('landingScreen');
            } else {
                commitBootTransition('landingScreen', { flowId, minDelayMs: options.minDelayMs ?? 120 });
            }
        }

        function clearForms() {
            document.getElementById('loginName').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('signupName').value = '';
            document.getElementById('signupPassword').value = '';
            document.getElementById('signupEmail').value = '';
            document.getElementById('signupPhone').value = '';
        }

        function ensureSessionUserExists(username, profile = {}) {
            const normalized = String(username || '').trim();
            if (!normalized) return null;
            if (window.__spCloudOnly) {
                return {
                    id: profile.id || profile.user_id || window.SP?.getOwnerId?.() || null,
                    username: normalized,
                    email: profile.email || '',
                    phone: profile.phone || '',
                    bio: profile.bio || '',
                    avatar: profile.avatar || profile.avatar_url || '',
                    createdAt: new Date().toISOString()
                };
            }
            const existing = findUserByUsername(normalized) || findUserByUsernameInsensitive(normalized);
            if (existing) return existing;

            const user = {
                id: profile.id || profile.user_id || window.SP?.getOwnerId?.() || createRuntimeId('mgr', normalized),
                username: normalized,
                email: profile.email || '',
                phone: profile.phone || '',
                bio: '',
                avatar: '',
                createdAt: new Date().toISOString()
            };
            users.push(user);
            saveIdentityStores();
            return user;
        }

        function applyAuthSession(username, options = {}) {
            const normalized = String(username || '').trim();
            if (!normalized) return false;
            ensureSessionUserExists(normalized, options.profile || {});
            currentUser = normalized;
            updateCurrentManagerContext();
            window.currentUser = currentUser;
            window.currentManagerId = currentManagerId;
            return true;
        }

        function clearAuthSessionState() {
            currentUser = null;
            currentManagerId = null;
            window.currentUser = null;
            window.currentManagerId = null;
            clearAppShellBootContext();
            // Reset boot flag so a same-tab re-login boots the full app cleanly.
            window.__spAppBooted = false;
        }

        window.applyAuthSession = applyAuthSession;
        window.clearAuthSessionState = clearAuthSessionState;

        window.addEventListener('storage', (event) => {
            const key = event?.key || '';
            if (!key) return;
            if (key === 'sp_logged_out' && event.newValue === '1') {
                clearAuthSessionState();
                if (typeof showLoginForm === 'function') {
                    showLoginForm();
                }
            }
        });

        // ── SAFE WINDOW EXPOSURE ─────────────────────────────────────────────────
        // All functions below are global declarations (depth-0) and are already
        // on window automatically in browsers. We use ||= so app.actions.js (which
        // loads first) always wins if it defines its own version. We never override
        // what another module already set — this prevents regression on every deploy.

        // Form show/open
        window.showAddExpense         ||= showAddExpense;
        window.showAddBooking         ||= showAddBooking;
        window.showAddOtherIncome     ||= showAddOtherIncome;
        window.showAddArtistForm      ||= showAddArtistForm;
        window.showAddEventToCalendar ||= showAddEventToCalendar;

        // Form cancel
        window.cancelExpense     ||= cancelExpense;
        window.cancelBooking     ||= cancelBooking;
        window.cancelOtherIncome ||= cancelOtherIncome;
        window.cancelAddArtist   ||= cancelAddArtist;

        // Form save
        window.saveExpense     ||= saveExpense;
        window.saveBooking     ||= saveBooking;
        window.saveOtherIncome ||= saveOtherIncome;
        window.saveArtist      ||= saveArtist;

        // Edit actions
        window.editExpense     ||= editExpense;
        window.editBooking     ||= editBooking;
        window.editOtherIncome ||= editOtherIncome;

        // FIXED: Supabase refresh callbacks can re-render the cloud-backed lists after background loads.
        window.renderExpenses     ||= renderExpenses;
        window.renderBookings     ||= renderBookings;
        window.renderOtherIncome  ||= renderOtherIncome;
        window.renderArtists      ||= renderArtists;
        window.updateDashboard    ||= updateDashboard;
        window.renderCalendar     ||= renderCalendar;
        window.updateReportStatistics ||= updateReportStatistics;

        // Profile modal
        window.openProfileModal   ||= openProfileModal;
        window.closeProfileModal  ||= closeProfileModal;
        window.saveProfileChanges ||= saveProfileChanges;

        // Receipt/modal
        window.closeReceiptModal ||= closeReceiptModal;
        window.viewReceiptById   ||= viewReceiptById;

        // Auth screens
        window.showLoginForm  ||= showLoginForm;
        window.showSignupForm ||= showSignupForm;
        window.showLanding    ||= showLanding;
        window.signup         ||= signup;

        // Calendar
        window.previousMonth      ||= previousMonth;
        window.nextMonth          ||= nextMonth;
        window.goToToday          ||= goToToday;
        window.selectCalendarDate ||= selectCalendarDate;

        // Dashboard widgets
        window.toggleMonthlyGoalEditor           ||= toggleMonthlyGoalEditor;
        window.saveMonthlyRevenueGoal            ||= saveMonthlyRevenueGoal;
        window.toggleFinancialsMonthlyGoalEditor ||= toggleFinancialsMonthlyGoalEditor;
        window.saveFinancialsMonthlyRevenueGoal  ||= saveFinancialsMonthlyRevenueGoal;
        window.getCurrentMonthlyRevenueGoal      ||= getCurrentMonthlyRevenueGoal;
        window.openBBFModal         ||= openBBFModal;
        window.closeBBFModal        ||= closeBBFModal;
        window.toggleBBFEditor       ||= toggleBBFEditor;
        window.saveBBF               ||= saveBBF;
        window.toggleClosingThoughts ||= toggleClosingThoughts;
        window.saveClosingThoughts   ||= saveClosingThoughts;
        window.clearClosingThoughts  ||= clearClosingThoughts;

        // Artists / availability
        window.checkAvailability          ||= checkAvailability;
        window.bookArtistFromAvailability ||= bookArtistFromAvailability;

        // Reports
        window.exportCSV ||= exportCSV;
        window.getReportPeriodSelection ||= getReportPeriodSelection;
        window.getReportPeriodData ||= getReportPeriodData;
        window.getReportLogoDataUrl ||= getReportLogoDataUrl;
        window.getCurrentBBF ||= getCurrentBBF;
        window.getActiveBBFContext ||= getActiveBBFContext;
        window.shiftBBFPeriod ||= shiftBBFPeriod;
        window.getPeriodString ||= getPeriodString;
        window.formatDisplayDate ||= formatDisplayDate;
        window.getClosingThoughtsForPeriod ||= getClosingThoughtsForPeriod;
        window.resolveDisplayAvatar ||= resolveDisplayAvatar;
        window.renderPerformanceMap ||= renderPerformanceMap;
        window.saveAudienceMetricEntry ||= saveAudienceMetricEntry;
        window.renderAudienceMetrics ||= renderAudienceMetrics;
        window.populateAudienceArtistDropdown ||= populateAudienceArtistDropdown;

        // Admin
        window.adminApproveUser ||= adminApproveUser;
        window.adminDeleteUser  ||= adminDeleteUser;

        // Fallback implementations for actions that live in app.tasks.js / app.actions.js.
        // These only activate if those files didn't already define them (||=).
        window.handleAddTask ||= function() {
            const input = document.getElementById('taskInput');
            const due   = document.getElementById('taskDueDate');
            const text  = (input?.value || '').trim();
            if (!text) { input?.focus(); return; }
            // FIXED: cloud-only fallback keeps tasks in memory and asks Supabase to persist them.
            const tasks = Array.isArray(window.__spFallbackTasks) ? window.__spFallbackTasks : [];
            tasks.push({ id: Date.now(), text, due: due?.value || '', done: false, createdAt: new Date().toISOString() });
            window.__spFallbackTasks = tasks;
            if (typeof window.SP?.saveTasks === 'function') {
                window.SP.saveTasks(tasks).catch((err) => console.warn('Cloud task sync failed:', err));
            }
            if (input) input.value = '';
            if (due)   due.value   = '';
            if (typeof window.renderTasks === 'function') window.renderTasks();
        };

        window.clearCompletedTasks ||= function() {
            // FIXED: no localStorage fallback for core task records.
            const tasks = Array.isArray(window.__spFallbackTasks) ? window.__spFallbackTasks : [];
            window.__spFallbackTasks = tasks.filter(t => !t.done);
            if (typeof window.SP?.saveTasks === 'function') {
                window.SP.saveTasks(window.__spFallbackTasks).catch((err) => console.warn('Cloud task sync failed:', err));
            }
            if (typeof window.renderTasks === 'function') window.renderTasks();
        };

        window.dismissNudge ||= function(btn) {
            const banner = btn instanceof Element ? btn.closest('[data-nudge-id]') : document.querySelector('[data-nudge-id]');
            if (banner) {
                const id = banner.dataset.nudgeId;
                if (id) {
                    const d = JSON.parse(sessionStorage.getItem('sp_dismissed_nudges') || '[]');
                    if (!d.includes(id)) { d.push(id); sessionStorage.setItem('sp_dismissed_nudges', JSON.stringify(d)); }
                }
                banner.remove();
            }
        };

        window.exportAllData ||= function() {
            const data = {
                bookings: Array.isArray(bookings) ? bookings : [],
                expenses: Array.isArray(expenses) ? expenses : [],
                otherIncome: Array.isArray(otherIncome) ? otherIncome : [],
                artists: Array.isArray(artists) ? artists : [],
                tasks: typeof window.loadTasks === 'function' ? window.loadTasks() : [],
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), {
                href: url,
                download: `starpaper-export-${new Date().toISOString().slice(0,10)}.json`
            });
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        };

        window.clearAllData ||= function() {
            if (!confirm('Clear legacy local cache and drafts on this device?')) return;
            if (typeof window.clearLegacyCloudDataKeys === 'function') {
                window.clearLegacyCloudDataKeys();
            }
            sessionStorage.removeItem('sp_dismissed_nudges');
            if (typeof window.toastSuccess === 'function') {
                window.toastSuccess('Local cache cleared.');
            }
        };

        // Login System
        // Supabase owns auth. These stubs exist only so early clicks fail closed
        // before supabase.js patches window.login/window.signup.
        async function login() {
            clearLoginValidation();
            setLoginLoading(false);
            toastError('Cloud login is managed by Supabase. Please try again in a moment.');
        }

        async function signup() {
            toastError('Cloud signup is managed by Supabase. Please try again in a moment.');
        }

        function showWelcomeMessage() {
            const welcomeName = document.getElementById('welcomeUserName');
            const welcomeCard = document.getElementById('welcomeMessage');
            if (welcomeName) {
                welcomeName.textContent = 'STAR PAPER';
            }
            if (welcomeCard) {
                welcomeCard.style.display = 'block';
            }
            refreshProfileUI();
        }

        function requestNotificationPermission() {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }

        function loadPushSettings() {
            const key = Storage.loadSync('starPaperPushPublicKey', '');
            const endpoint = Storage.loadSync('starPaperPushEndpoint', '');
            const subscription = Storage.loadSync('starPaperPushSubscription', null);
            const keyInput = document.getElementById('pushPublicKey');
            const endpointInput = document.getElementById('pushServerEndpoint');
            const status = document.getElementById('pushStatus');

            if (keyInput) keyInput.value = key;
            if (endpointInput) endpointInput.value = endpoint;
            if (status) {
                status.textContent = subscription ? 'Push enabled and subscribed.' : 'Push not enabled.';
            }
        }

        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }

        async function subscribeToPush() {
            try {
                requestNotificationPermission();
                if (!('serviceWorker' in navigator)) {
                    toastWarn('Push notifications are not supported in this browser.');
                    return;
                }
                if (Notification.permission !== 'granted') {
                    toastWarn('Please allow notifications to enable push alerts.');
                    return;
                }

                const publicKey = document.getElementById('pushPublicKey')?.value.trim();
                const endpointUrl = document.getElementById('pushServerEndpoint')?.value.trim();
                if (!publicKey) {
                    toastError('Please enter a VAPID public key.');
                    return;
                }

                Storage.saveSync('starPaperPushPublicKey', publicKey);
                Storage.saveSync('starPaperPushEndpoint', endpointUrl || '');

                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });

                Storage.saveSync('starPaperPushSubscription', subscription);
                const status = document.getElementById('pushStatus');
                if (status) status.textContent = 'Push enabled and subscribed.';

                if (endpointUrl) {
                    const lastSend = Storage.loadSync('starPaperPushLastSend', 0);
                    const now = Date.now();
                    if (now - lastSend < 60 * 1000) {
                        const status = document.getElementById('pushStatus');
                        if (status) status.textContent = 'Push saved. Waiting before re-sending to server.';
                        return;
                    }
                    const response = await fetch(endpointUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user: currentUser,
                            subscription
                        })
                    });
                    if (response.status === 429) {
                        const status = document.getElementById('pushStatus');
                        if (status) status.textContent = 'Push server rate limited (429). Try again in a minute.';
                        return;
                    }
                    Storage.saveSync('starPaperPushLastSend', now);
                }
            } catch (err) {
                console.error('Push subscribe failed:', err);
                toastError('Push subscription failed. Check console for details.');
            }
        }

        async function copyPushSubscription() {
            const subscription = Storage.loadSync('starPaperPushSubscription', null);
            if (!subscription) {
                toastInfo('No push subscription found yet.');
                return;
            }
            const text = JSON.stringify(subscription);
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                toastSuccess('Subscription copied to clipboard.');
            } else {
                toastWarn('Clipboard unavailable. Open console to copy.');
                console.log(text);
            }
        }

        function logout() {
            const flowId = beginBootTransition('local-logout', 'signing-out');
            resetCloudSaveInFlightFlags('local-logout');
            saveUserData();
            resetCloudSaveInFlightFlags('local-logout-complete');
            clearAuthSessionState();
            Storage.saveSync('starPaperDrafts', null);
            refreshProfileUI();
            clearForms();
            commitBootTransition('landingScreen', { flowId, minDelayMs: 180 });
            setTimeout(() => {
                const landing = document.getElementById('landingScreen');
                if (landing?.classList.contains('screen-active')) {
                    hideBootLoaderElement({ force: true });
                }
            }, 260);
            toastInfo('Logged out');
        }

        async function resetAppCache() {
            const isAdmin = currentUser === 'Admin';
            if (!isAdmin) {
                toastWarn('Admin access required');
                return;
            }

            const shouldProceed = confirm('Reset app cache on this device and reload now?');
            if (!shouldProceed) return;

            try {
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(registrations.map((registration) => registration.unregister()));
                }

                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                }

                toastSuccess('Cache reset complete. Reloading...');
                setTimeout(() => {
                    window.location.reload();
                }, 300);
            } catch (error) {
                console.error('Failed to reset app cache:', error);
                toastError('Failed to reset cache. Please clear browser site data manually.');
            }
        }

        function deferNonCriticalRender(work, timeout = 350) {
            if (typeof work !== 'function') return;
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => work(), { timeout });
                return;
            }
            setTimeout(() => work(), Math.min(timeout, 220));
        }

        function showApp(options = {}) {
            const hydrationPending = options?.hydrationPending === true;
            window.__spDataHydrationPending = hydrationPending || Boolean(window.__spDataHydrationPending);
            document.body.classList.toggle('sp-data-hydration-pending', window.__spDataHydrationPending === true);
            if (hydrationPending && typeof window.__spUpdateSyncIndicator === 'function') {
                window.__spUpdateSyncIndicator('syncing');
            }
            const ownsBootLoader = hydrationPending || !window.__spCloudBootstrapPending &&
                !window.__spSupabaseBootPromise &&
                !window.__spAuthRedirectInProgress;
            const flowId = window.getBootTransitionId?.() || beginBootTransition('show-app', hydrationPending ? 'booting-data' : 'loading-app');
            if (!hydrationPending) {
                setBootState('loading-app');
            }
            try {
                commitBootTransition('appContainer', { flowId, hideLoader: false });
                const sidebar = document.getElementById('sidebar');
                const sidebarOverlay = document.getElementById('sidebarOverlay');
                sidebar?.classList.remove('active');
                sidebarOverlay?.classList.remove('active');
                sidebarOverlay?.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('sidebar-open');
                document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
                document.getElementById('quickAddPanel')?.classList.remove('active');
                clearDashboardSearchResults();
                const welcomeCard = document.getElementById('welcomeMessage');
                if (welcomeCard) welcomeCard.style.display = 'block'; // FIXED: top search bar is visible after refresh bootstrap.
                refreshProfileUI();
                populateLocationDropdowns();
                updateMonthContextLabels();
                if (typeof window.updateTodayBoard === 'function') {
                    window.updateTodayBoard();
                }
                populateArtistDropdown();
                populateFinanceArtistDropdowns();
                toggleAdminOnlyUI();
                if (!hydrationPending) {
                    updateDashboard();
                    renderBookings();
                    renderExpenses();
                    renderOtherIncome();
                    renderArtists();
                }

                window.__spAppBooted = true;
                applyReadOnlyMode();
                if (ownsBootLoader) {
                    commitBootTransition('appContainer', {
                        flowId,
                        requireAppReady: true,
                        minDelayMs: hydrationPending ? 80 : 220
                    });
                }

                const deferBootWork = (label, work, timeout = 700) => {
                    deferNonCriticalRender(() => {
                        try {
                            work();
                        } catch (err) {
                            console.warn(`Deferred app boot task failed (${label}):`, err);
                        }
                    }, timeout);
                };

                if (!hydrationPending) {
                    deferBootWork('calendar', () => renderCalendar(), 350);
                    deferBootWork('audience-controls', () => {
                        updateAvailabilityArtists();
                        renderAudienceMetrics();
                        bindAudienceArtistSelect();
                        handleAudienceArtistChange();
                    }, 450);
                    deferBootWork('push-settings', () => loadPushSettings(), 650);
                    deferBootWork('performance-map', () => renderPerformanceMap(), window.innerWidth <= 900 ? 900 : 700);
                    deferBootWork('report-statistics', () => updateReportStatistics(), 800);
                    deferBootWork('reminders', () => {
                        requestNotificationPermission();
                        scheduleReminderChecks();
                    }, 1000);
                }
                if (typeof window.__spLoadDeferredThirdParty === 'function') {
                    window.__spLoadDeferredThirdParty('app-booted');
                }
            } catch (error) {
                console.error('ERROR IN SHOWAPP:', error);
                console.error('Error stack:', error.stack);
                setBootState('boot-error', {
                    text: 'Star Paper needs attention',
                    subtext: 'The dashboard could not finish loading. Retry or log out.',
                    showActions: true
                });
                toastError('Error loading app. Check console for details.');
            }
        }

        const SP_MONEY_TAB_IDS = new Set(['financials', 'expenses', 'otherIncome', 'reports']);
        const SP_SCHEDULE_TAB_IDS = new Set(['global', 'bookings', 'calendar']);
        const SP_APP_SECTION_IDS = new Set(['dashboard', 'money', 'schedule', 'artists', 'tasks', 'settings', ...SP_MONEY_TAB_IDS, ...SP_SCHEDULE_TAB_IDS]);

        function isMoneyTabSection(section) {
            return SP_MONEY_TAB_IDS.has(section);
        }

        function isScheduleTabSection(section) {
            return SP_SCHEDULE_TAB_IDS.has(section);
        }

        function normalizeAppSection(section) {
            if (section === 'money') {
                const saved = Storage.loadSync('starPaperLastMoneyTab', 'financials');
                return isMoneyTabSection(saved) ? saved : 'financials';
            }
            if (section === 'schedule') {
                const saved = Storage.loadSync('starPaperLastScheduleTab', 'global');
                return isScheduleTabSection(saved) ? saved : 'global';
            }
            return SP_APP_SECTION_IDS.has(section) ? section : 'dashboard';
        }

        function persistAppSectionRoute(section) {
            const normalized = normalizeAppSection(section);
            Storage.saveSync('starPaperLastSection', normalized);
            if (isMoneyTabSection(normalized)) {
                Storage.saveSync('starPaperLastMoneyTab', normalized);
            } else if (isScheduleTabSection(normalized)) {
                Storage.saveSync('starPaperLastScheduleTab', normalized);
            }
            if (!isAppShellPath(window.location.pathname)) {
                return normalized;
            }
            try {
                const hash = `#${normalized}`;
                const route = `/${window.location.search || ''}${hash}`;
                const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                if (currentRoute !== route) {
                    window.history.replaceState(null, '', route);
                }
            } catch (_err) {}
            return normalized;
        }

        function restorePostBootUiState() {
            if (!isAppShellPath(window.location.pathname)) return;
            const allowedSections = SP_APP_SECTION_IDS;
            const readHashSection = () => {
                try {
                    const section = getAppHashSection(window.location.hash);
                    return allowedSections.has(section) ? section : '';
                } catch (_err) {
                    return '';
                }
            };
            const hashSection = readHashSection();
            const lastSectionRaw = Storage.loadSync('starPaperLastSection', 'dashboard');
            const lastMoneyTab = Storage.loadSync('starPaperLastMoneyTab', 'financials');
            const lastScheduleTab = Storage.loadSync('starPaperLastScheduleTab', 'global');
            const storedSection = allowedSections.has(lastSectionRaw) ? lastSectionRaw : 'dashboard';

            // Older deployed builds forced #dashboard even while another section was active.
            // Treat that specific stale hash as weaker than the stored app section.
            let targetSection = hashSection && !(hashSection === 'dashboard' && storedSection !== 'dashboard')
                ? hashSection
                : storedSection;
            if (targetSection === 'money') {
                targetSection = isMoneyTabSection(lastMoneyTab) ? lastMoneyTab : 'financials';
            } else if (targetSection === 'schedule') {
                targetSection = isScheduleTabSection(lastScheduleTab) ? lastScheduleTab : 'global';
            }
            targetSection = normalizeAppSection(targetSection);

            if (typeof showSection === 'function') {
                showSection(targetSection);
            }
            restoreDrafts();
        }
        window.restorePostBootUiState = restorePostBootUiState;

        let spAppHashRouteHandling = false;
        window.addEventListener('hashchange', () => {
            if (spAppHashRouteHandling || !window.__spAppBooted || !isAppShellPath(window.location.pathname)) return;
            const section = getAppHashSection(window.location.hash);
            if (section && SP_APP_SECTION_IDS.has(section)) {
                spAppHashRouteHandling = true;
                try {
                    showSection(section);
                } finally {
                    spAppHashRouteHandling = false;
                }
                return;
            }
            if (window.location.hash) {
                window.history.replaceState(null, '', `${window.location.pathname}${window.location.search || ''}`);
            }
        });

        function toggleAdminOnlyUI() {
            const isAdmin = currentUser === 'Admin';
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = isAdmin ? 'block' : 'none';
            });
        }

        function hasAuthenticatedCloudSession() {
            return Boolean(window.__spSupabaseConfigured) &&
                Boolean(window.SP?.getOwnerId?.());
        }

        const CORE_CLOUD_DATASET_KEYS = ['bookings', 'expenses', 'otherIncome', 'artists'];

        function hasOwnCloudField(cloudData, key) {
            return Boolean(cloudData) && Object.prototype.hasOwnProperty.call(cloudData, key);
        }

        function hasCompleteCoreCloudSnapshot(cloudData) {
            return CORE_CLOUD_DATASET_KEYS.every((key) => hasOwnCloudField(cloudData, key));
        }

        function normalizeWorkspaceScopeKey(scopeKey) {
            return String(scopeKey || '').trim();
        }

        function getActiveWorkspaceSnapshotMeta(scopeKey) {
            return {
                ownerId: window.SP?.getOwnerId?.() || null,
                teamId: getActiveTeamId() || null,
                scopeKey: normalizeWorkspaceScopeKey(scopeKey || getActiveDataScopeKey())
            };
        }

        function markWorkspaceHydrated(scopeKey, hydrated, detail = {}) {
            if (!scopeKey) return;
            cloudHydrationByScope[scopeKey] = {
                hydrated: Boolean(hydrated),
                updatedAt: Date.now(),
                detail
            };
            window.__spWorkspaceDataHydrated = Boolean(hydrated);
            window.__spWorkspaceHydrationScope = scopeKey;
        }

        function isActiveWorkspaceHydrated() {
            if (!window.__spCloudOnly || !hasAuthenticatedCloudSession()) return true;
            const scopeKey = getActiveDataScopeKey();
            return Boolean(scopeKey && cloudHydrationByScope[scopeKey]?.hydrated);
        }

        function guardWorkspaceHydrated(actionLabel = 'save this workspace') {
            if (isActiveWorkspaceHydrated()) return false;
            const message = 'Cloud data is still loading. Try again in a moment.';
            if (typeof window.toastWarn === 'function') {
                window.toastWarn(message);
            }
            return {
                ok: false,
                cloudSynced: false,
                skipped: true,
                queued: false,
                reason: 'workspace-hydrating',
                message,
                action: actionLabel
            };
        }

        function syncWindowState() {
            markSearchIndexDirty();
            window.bookings = bookings;
            window.expenses = expenses;
            window.otherIncome = otherIncome;
            window.artists = artists;
            window.audienceMetrics = audienceMetrics;
            window.revenueGoals = revenueGoals;
            window.bbfData = bbfData;
            window.currentManagerId = currentManagerId;
            window.currentUser = currentUser;
        }

        function applyCloudSnapshotToRuntime(cloudData, activeScopeKey, options = {}) {
            if (!cloudData) {
                syncWindowState();
                return;
            }

            const normalizedActiveScopeKey = normalizeWorkspaceScopeKey(activeScopeKey || getActiveDataScopeKey());
            const incomingWorkspace = cloudData?.__workspace || options.workspaceMeta || null;
            const incomingScopeKey = normalizeWorkspaceScopeKey(incomingWorkspace?.scopeKey || normalizedActiveScopeKey);
            if (incomingScopeKey && normalizedActiveScopeKey && incomingScopeKey !== normalizedActiveScopeKey) {
                console.warn('Ignored cloud snapshot for inactive workspace scope:', {
                    incomingScopeKey,
                    activeScopeKey: normalizedActiveScopeKey,
                    source: options.source || 'cloud'
                });
                syncWindowState();
                return;
            }

            if (hasOwnCloudField(cloudData, 'bookings')) {
                bookings = Array.isArray(cloudData.bookings)
                    ? ensureBookingArtistRefs(cloudData.bookings, currentManagerId)
                    : bookings;
            }
            if (hasOwnCloudField(cloudData, 'expenses')) {
                expenses = Array.isArray(cloudData.expenses) ? ensureFinanceArtistRefs(cloudData.expenses) : expenses;
            }
            if (hasOwnCloudField(cloudData, 'otherIncome')) {
                otherIncome = Array.isArray(cloudData.otherIncome) ? ensureFinanceArtistRefs(cloudData.otherIncome) : otherIncome;
            }
            if (hasOwnCloudField(cloudData, 'artists')) {
                artists = Array.isArray(cloudData.artists) ? cloudData.artists : artists;
            }

            if (cloudData.revenueGoal && typeof cloudData.revenueGoal === 'object') {
                const goalKey = getCurrentRevenueGoalKey();
                const amount = Number(cloudData.revenueGoal.amount || 0);
                revenueGoals[goalKey] = Number.isFinite(amount) ? amount : 0;
                Storage.saveSync('starPaperRevenueGoals', revenueGoals);
            }

            if (Array.isArray(cloudData.bbfEntries)) {
                Object.keys(bbfData).forEach((key) => {
                    if (key.startsWith(`${activeScopeKey}_`)) delete bbfData[key];
                });
                cloudData.bbfEntries.forEach((entry) => {
                    if (!entry?.period) return;
                    bbfData[`${activeScopeKey}_${entry.period}`] = Number(entry.amount) || 0;
                });
                Storage.saveSync('starPaperBBF', bbfData);
            }

            if (Array.isArray(cloudData.closingThoughts)) {
                const scopeKey = activeScopeKey || 'default';
                const store = getClosingThoughtsStore();
                const nextStore = {};
                cloudData.closingThoughts.forEach((entry) => {
                    if (!entry?.period) return;
                    nextStore[entry.period] = String(entry.content || '');
                });
                store[scopeKey] = nextStore;
                Storage.saveSync(CLOSING_THOUGHTS_STORAGE_KEY, store);
            }

            if (Array.isArray(cloudData.tasks) && typeof window.applyTaskSync === 'function') {
                window.applyTaskSync(cloudData.tasks, { source: 'cloud', render: false });
            }

            if (hasOwnCloudField(cloudData, 'audienceMetrics')) {
                audienceMetrics = Array.isArray(cloudData.audienceMetrics)
                    ? cloudData.audienceMetrics
                    : audienceMetrics;
                saveAudienceMetricsForScope(activeScopeKey, audienceMetrics);
            }

            if (cloudData.theme && typeof applyTheme === 'function' && !window.__spAppBooted && !hasStoredThemePreference()) {
                applyTheme(cloudData.theme, { persist: true, syncRemote: false });
            }

            if (!options.provisional && hasCompleteCoreCloudSnapshot(cloudData)) {
                markWorkspaceHydrated(activeScopeKey, true, {
                    source: options.source || 'cloud',
                    keys: Object.keys(cloudData)
                });
            } else if (options.provisional && activeScopeKey) {
                markWorkspaceHydrated(activeScopeKey, false, { source: options.source || 'provisional' });
            }

            syncWindowState();
        }

        function loadUserData(options = {}) {
            updateCurrentManagerContext();
            const activeScopeKey = getActiveDataScopeKey();
            const initialSnapshot = options.snapshot || window._SP_cloudData || null;
            window._SP_cloudData = null;
            applyCloudSnapshotToRuntime(initialSnapshot, activeScopeKey, {
                provisional: options.provisional === true,
                source: options.source || 'loadUserData'
            });
            if (options.provisional !== true) {
                window.__spDataHydrationPending = false;
                window.__spDataLoaded = true;
                document.body.classList.remove('sp-data-hydration-pending');
            }
            window._SP_syncFromCloud = function(data) {
                applyCloudSnapshotToRuntime(data, getActiveDataScopeKey(), { source: 'cloud-sync' });
                window.__spDataHydrationPending = false;
                window.__spDataLoaded = true;
                document.body.classList.remove('sp-data-hydration-pending');
            };
        }

        async function saveUserData() {
            if (!(currentUser && currentManagerId)) {
                return { cloudSynced: false, skipped: true, queued: false };
            }
            const hydrationBlock = guardWorkspaceHydrated('save workspace data');
            if (hydrationBlock) {
                return hydrationBlock;
            }
            bookings = ensureBookingArtistRefs(bookings, currentManagerId);
            expenses = ensureFinanceArtistRefs(expenses);
            otherIncome = ensureFinanceArtistRefs(otherIncome);
            markSearchIndexDirty();
            // Update window references
            window.bookings    = bookings;
            window.expenses    = expenses;
            window.otherIncome = otherIncome;
            window.artists     = artists;
            window.audienceMetrics = audienceMetrics;
            window.revenueGoals = revenueGoals;
            window.bbfData      = bbfData;
            // Cloud sync: push all data (bookings, expenses, income, artists,
            // tasks, goals, BBF, closing thoughts) to Supabase.
            return await syncCloudExtras();
        }

        window.SP_collectAllData = function collectAllData(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const includeTheme = opts.includeTheme === true;
            const scopeKey = getActiveDataScopeKey();
            const tasks = typeof window.loadTasks === 'function' ? window.loadTasks() : [];
            const theme = includeTheme
                ? (document.body.classList.contains('light-theme') ? 'light' : 'dark')
                : null;
            const revenueAmount = scopeKey ? Number(revenueGoals[scopeKey] || 0) : 0;
            const revenueGoal = {
                period: 'monthly',
                amount: Number.isFinite(revenueAmount) ? revenueAmount : 0,
            };

            const bbfEntries = [];
            if (scopeKey) {
                Object.keys(bbfData).forEach((key) => {
                    if (!key.startsWith(`${scopeKey}_`)) return;
                    const period = key.slice(scopeKey.length + 1);
                    if (!period) return;
                    const amount = Number(bbfData[key]) || 0;
                    bbfEntries.push({ period, amount });
                });
            }

            const closingThoughts = [];
            if (scopeKey) {
                const store = getClosingThoughtsStore();
                const scoped = store[scopeKey] || {};
                Object.keys(scoped).forEach((period) => {
                    const content = String(scoped[period] || '').trim();
                    if (!period || !content) return;
                    closingThoughts.push({ period, content });
                });
            }

            const payload = {
                bookings: Array.isArray(bookings) ? bookings : [],
                expenses: ensureFinanceArtistRefs(expenses),
                otherIncome: ensureFinanceArtistRefs(otherIncome),
                artists: Array.isArray(artists) ? artists : [],
                audienceMetrics: Array.isArray(audienceMetrics) ? audienceMetrics : [],
                tasks: Array.isArray(tasks) ? tasks : [],
                revenueGoal,
                bbfEntries,
                closingThoughts,
            };
            if (includeTheme) {
                payload.theme = theme;
            }
            return payload;
        };

        function syncCloudExtras(options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            if (!hasAuthenticatedCloudSession()) {
                window.__spLastCloudSyncPromise = Promise.resolve({
                    cloudSynced: false,
                    skipped: true,
                    queued: false,
                    reason: 'no-cloud-session'
                });
                return window.__spLastCloudSyncPromise;
            }
            if (typeof window.SP?.queueCloudSync !== 'function' && typeof window.SP?.saveAllData !== 'function') {
                window.__spLastCloudSyncPromise = Promise.resolve({
                    cloudSynced: false,
                    skipped: true,
                    queued: false,
                    reason: 'no-save-function'
                });
                return window.__spLastCloudSyncPromise;
            }
            if (typeof window.SP_collectAllData !== 'function') {
                window.__spLastCloudSyncPromise = Promise.resolve({
                    cloudSynced: false,
                    skipped: true,
                    queued: false,
                    reason: 'no-payload-collector'
                });
                return window.__spLastCloudSyncPromise;
            }
            const payload = window.SP_collectAllData({ includeTheme: opts.includeTheme === true });
            const saveFn = window.SP.queueCloudSync || window.SP.saveAllData;
            window.__spCloudSaveInFlightCount = (Number(window.__spCloudSaveInFlightCount) || 0) + 1;
            window.__spCloudSaveInFlight = true;
            window.__spLastCloudSyncPromise = Promise.resolve(saveFn(payload)).then((result) => {
                if (result && result.ok === false) {
                    return {
                        cloudSynced: false,
                        skipped: false,
                        queued: Boolean(result.queued || result.context?.queued),
                        error: result.error || null,
                        message: result.message || 'Cloud save failed.',
                        result,
                        payload
                    };
                }
                return {
                    cloudSynced: true,
                    skipped: Boolean(result?.context?.skippedDuplicate),
                    queued: false,
                    result: result || null,
                    payload
                };
            }).catch((err) => {
                console.warn('Cloud sync failed:', err);
                const syncResult = err?.syncResult || null;
                return {
                    cloudSynced: false,
                    skipped: false,
                    queued: Boolean(syncResult?.queued || syncResult?.context?.queued),
                    error: err,
                    result: syncResult,
                    payload
                };
            }).finally(() => {
                window.__spCloudSaveInFlightCount = Math.max(0, (Number(window.__spCloudSaveInFlightCount) || 1) - 1);
                window.__spCloudSaveInFlight = window.__spCloudSaveInFlightCount > 0;
            });
            return window.__spLastCloudSyncPromise;
        }

        function getCloudFailureMessage(result, fallback) {
            if (!result) return fallback || 'Cloud save failed.';
            return result.message || result.error?.message || fallback || 'Cloud save failed.';
        }

        async function persistMutationWithCloudFeedback(operation, options = {}) {
            let result = null;
            if (typeof operation === 'function') {
                result = await operation();
            } else if (operation && typeof operation.then === 'function') {
                result = await operation;
            } else {
                result = await saveUserData();
            }

            if (result?.ok || result?.cloudSynced) {
                if (!options.suppressSuccessToast) {
                    toastSuccess(options.successMessage || 'Saved to cloud!');
                }
                return result;
            }

            const message = getCloudFailureMessage(result, options.failureMessage);
            const error = result?.error instanceof Error ? result.error : new Error(message);
            error.syncResult = result || null;
            throw error;
        }

        // Navigation
        function showSection(section, el) {
            section = normalizeAppSection(section);
            // Map sub-sections to their parent section div
            const PARENT_MAP = {
                financials: 'money', expenses: 'money', otherIncome: 'money', reports: 'money',
                global: 'schedule', bookings: 'schedule', calendar: 'schedule'
            };
            const NAV_SECTION_MAP = {
                financials: 'money', expenses: 'money', otherIncome: 'money', reports: 'money',
                global: 'schedule', bookings: 'schedule', calendar: 'schedule'
            };

            const parentSection = PARENT_MAP[section] || section;

            // Idempotency guard: capture-phase and app-side data-action bridges can
            // fire showSection twice for the same click. Skip the heavy DOM work if we're
            // already on this section, but still allow the renderers below to refresh data.
            const parentElement = document.getElementById(parentSection);
            const parentIsActive = parentElement?.classList.contains('active') === true;
            const _spSameSection = window._spCurrentSection === section && parentIsActive;
            window._spCurrentSection = section;

            if (!_spSameSection) {
                document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === parentSection));
            }
            persistAppSectionRoute(section);

            // Scroll to top on every section change
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            const mc = document.querySelector('.main-content');
            if (mc) mc.scrollTop = 0;

            const target = el || null;
            target?.classList.add('active');

            // ── Push to in-app navigation history stack ───────────────
            if (!window._spNavSkip) {
                if (window._spNavStack) {
                    window._spNavStack = window._spNavStack.slice(0, window._spNavIndex + 1);
                    window._spNavStack.push(section);
                    window._spNavIndex = window._spNavStack.length - 1;
                    updateNavHistButtons();
                }
            }
            window._spNavSkip = false;

            // ── Sync bottom nav (map sub-sections to parent nav entry) ──
            const navKey = NAV_SECTION_MAP[section] || section;
            requestAnimationFrame(() => {
                document.querySelectorAll('.bottom-nav-item').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.section === navKey);
                });
                document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
                    const isActive = btn.dataset.section === navKey;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
                });
            });
            // Legacy active-class loop (now merged into the rAF above) intentionally removed below.
            (function _spLegacyNoop(){})(); // keep line count stable for downstream patches

            // ── Sync sidebar nav active state ──────────────────────────
            // Always show lists when navigating to sections
            if (section === 'bookings') {
                document.getElementById('addBookingForm')?.style.setProperty('display', 'none');
                document.getElementById('bookingsListCard')?.style.setProperty('display', 'block');
            } else if (section === 'expenses') {
                document.getElementById('addExpenseForm')?.style.setProperty('display', 'none');
                document.getElementById('expensesListCard')?.style.setProperty('display', 'block');
            } else if (section === 'otherIncome') {
                document.getElementById('addOtherIncomeForm')?.style.setProperty('display', 'none');
                document.getElementById('otherIncomeListCard')?.style.setProperty('display', 'block');
            } else if (section === 'artists') {
                document.getElementById('addArtistForm')?.style.setProperty('display', 'none');
                document.getElementById('artistsListCard')?.style.setProperty('display', 'block');
            }

            const titles = {
                'dashboard':  'Dashboard',
                'money':      'Money',
                'financials': 'Money - Overview',
                'artists':    'Artists',
                'schedule':   'Schedule',
                'global':     'Schedule - Global',
                'bookings':   'Schedule - Bookings',
                'expenses':   'Money - Expenses',
                'otherIncome':'Money - Other Income',
                'calendar':   'Schedule - Calendar',
                'reports':    'Reports',
                'tasks':      'Tasks',
                'settings':   'Settings',
            };

            const titleEl = document.getElementById('pageTitle');
            const nextTitle = titles[section] || section;
            if (titleEl) {
                titleEl.textContent = nextTitle;
            }
            updateAppHeaderIcon(section);
            document.title = `Star Paper | ${nextTitle}`;

            const dataHydrationPending = window.__spDataHydrationPending === true;
            if (section === 'financials') {
                activateMoneyTab('financials');
            } else if (section === 'expenses') {
                activateMoneyTab('expenses');
            } else if (section === 'otherIncome') {
                activateMoneyTab('otherIncome');
            } else if (section === 'reports') {
                activateMoneyTab('reports');
            } else if (section === 'global') {
                activateScheduleTab('global');
            } else if (section === 'bookings') {
                activateScheduleTab('bookings');
            } else if (section === 'calendar') {
                activateScheduleTab('calendar');
            }

            if (dataHydrationPending && section !== 'settings') {
                if (typeof window.__spUpdateSyncIndicator === 'function') {
                    window.__spUpdateSyncIndicator('syncing');
                }
            } else {
                if (section === 'dashboard') {
                    updateDashboard();
                } else if (section === 'financials') {
                    updateDashboard();
                    renderPerformanceMap();
                } else if (section === 'expenses') {
                    renderExpenses();
                } else if (section === 'otherIncome') {
                    renderOtherIncome();
                } else if (section === 'reports') {
                    updateReportsSection();
                } else if (section === 'global') {
                    renderPerformanceMap();
                } else if (section === 'bookings') {
                    renderBookings();
                } else if (section === 'calendar') {
                    renderCalendar();
                } else if (section === 'artists') {
                    renderArtists();
                } else if (section === 'tasks') {
                    if (typeof window.renderTasks === 'function') {
                        window.renderTasks();
                    }
                } else if (section === 'settings') {
                    refreshProfileUI();
                }
            }

            if (window.innerWidth <= 1024) {
                closeSidebar();
            }

            document.getElementById('quickAddPanel')?.classList.remove('active');
        }

        function checkAuth() {
            if (window.__spCloudBootstrapPending || window.__spSupabaseBootPromise || window.__spAuthRedirectInProgress) {
                return;
            }
            return;
        }

        function restoreSession() {
            return;
        }

        function cacheDrafts() {
            const drafts = {
                booking: {
                    event: document.getElementById('bookingEvent')?.value || '',
                    artist: document.getElementById('bookingArtist')?.value || '',
                    date: document.getElementById('bookingDate')?.value || '',
                    fee: document.getElementById('bookingFee')?.value || '',
                    deposit: document.getElementById('bookingDeposit')?.value || '',
                    balance: document.getElementById('bookingBalance')?.value || '',
                    contact: document.getElementById('bookingContact')?.value || '',
                    status: document.getElementById('bookingStatus')?.value || '',
                    notes: document.getElementById('bookingNotes')?.value || '',
                    locationType: document.getElementById('bookingLocationType')?.value || 'uganda',
                    locationUg: document.getElementById('bookingUgandaLocation')?.value || '',
                    locationAbroad: document.getElementById('bookingAbroadLocation')?.value || '',
                    formOpen: document.getElementById('addBookingForm')?.style.display === 'block'
                },
                expense: {
                    desc: document.getElementById('expenseDesc')?.value || '',
                    amount: document.getElementById('expenseAmount')?.value || '',
                    date: document.getElementById('expenseDate')?.value || '',
                    artist: document.getElementById('expenseArtist')?.value || '',
                    category: document.getElementById('expenseCategory')?.value || 'transport',
                    formOpen: document.getElementById('addExpenseForm')?.style.display === 'block'
                },
                otherIncome: {
                    source: document.getElementById('otherIncomeSource')?.value || '',
                    amount: document.getElementById('otherIncomeAmount')?.value || '',
                    date: document.getElementById('otherIncomeDate')?.value || '',
                    artist: document.getElementById('otherIncomeArtist')?.value || '',
                    type: document.getElementById('otherIncomeType')?.value || 'tips',
                    payer: document.getElementById('otherIncomePayer')?.value || '',
                    method: document.getElementById('otherIncomeMethod')?.value || 'cash',
                    status: document.getElementById('otherIncomeStatus')?.value || 'received',
                    notes: document.getElementById('otherIncomeNotes')?.value || '',
                    formOpen: document.getElementById('addOtherIncomeForm')?.style.display === 'block'
                }
            };
            Storage.saveSync('starPaperDrafts', drafts);
        }

        function restoreDrafts() {
            const drafts = Storage.loadSync('starPaperDrafts', null);
            if (!drafts) return;

            if (drafts.booking) {
                const setVal = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.value = value;
                };
                setVal('bookingEvent', drafts.booking.event || '');
                setVal('bookingArtist', drafts.booking.artist || '');
                setVal('bookingDate', drafts.booking.date || '');
                setVal('bookingFee', drafts.booking.fee || '');
                setVal('bookingDeposit', drafts.booking.deposit || '');
                setVal('bookingBalance', drafts.booking.balance || '');
                setVal('bookingContact', drafts.booking.contact || '');
                setVal('bookingStatus', drafts.booking.status || '');
                setVal('bookingNotes', drafts.booking.notes || '');
                setVal('bookingLocationType', drafts.booking.locationType || 'uganda');
                updateLocationDropdown();
                setVal('bookingUgandaLocation', drafts.booking.locationUg || '');
                setVal('bookingAbroadLocation', drafts.booking.locationAbroad || '');
                if (drafts.booking.formOpen) {
                    showSection('schedule');
                    showAddBooking();
                }
            }

            if (drafts.expense) {
                const setVal = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.value = value;
                };
                setVal('expenseDesc', drafts.expense.desc || '');
                setVal('expenseAmount', drafts.expense.amount || '');
                setVal('expenseDate', drafts.expense.date || '');
                populateFinanceArtistDropdown(document.getElementById('expenseArtist'), drafts.expense.artist || '');
                setVal('expenseCategory', drafts.expense.category || 'transport');
                if (drafts.expense.formOpen) {
                    showSection('expenses');
                    showAddExpense();
                }
            }

            if (drafts.otherIncome) {
                const setVal = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.value = value;
                };
                setVal('otherIncomeSource', drafts.otherIncome.source || '');
                setVal('otherIncomeAmount', drafts.otherIncome.amount || '');
                setVal('otherIncomeDate', drafts.otherIncome.date || '');
                populateFinanceArtistDropdown(document.getElementById('otherIncomeArtist'), drafts.otherIncome.artist || '');
                setVal('otherIncomeType', drafts.otherIncome.type || 'tips');
                setVal('otherIncomePayer', drafts.otherIncome.payer || '');
                setVal('otherIncomeMethod', drafts.otherIncome.method || 'cash');
                setVal('otherIncomeStatus', drafts.otherIncome.status || 'received');
                setVal('otherIncomeNotes', drafts.otherIncome.notes || '');
                if (drafts.otherIncome.formOpen) {
                    showSection('otherIncome');
                    showAddOtherIncome();
                }
            }
        }

        // Tour Map
        function renderPerformanceMap(filtered = null, options = {}) {
            const sourceBookings = Array.isArray(filtered) ? filtered : bookings;
            const globalRoot = document.getElementById('globalScheduleGlobe');
            if (!options.fallbackOnly && window.SP_GLOBAL_GLOBE && typeof window.SP_GLOBAL_GLOBE.render === 'function') {
                try {
                    if (window.SP_GLOBAL_GLOBE.isFallback !== true) {
                        globalRoot?.classList.remove('sp-global-schedule--fallback');
                    }
                    window.SP_GLOBAL_GLOBE.render(sourceBookings, options);
                } catch (err) {
                    console.warn('[StarPaper] Global globe render failed:', err);
                    globalRoot?.classList.add('sp-global-schedule--fallback');
                }
            } else if (globalRoot && (options.fallbackOnly || !window.SP_GLOBAL_GLOBE)) {
                globalRoot.classList.add('sp-global-schedule--fallback');
            }
            const map = document.getElementById('performanceMap');
            if (!map) {
                return;
            }
            map.replaceChildren();
            const showLocationList = options.showLocationList === true;
            const showPinnedPanel = options.showPinnedPanel !== false;

            const today = new Date();
            const allBookings = sourceBookings.filter(b => b.date);
            const hasInternational = allBookings.some(b => b.locationType === 'abroad');

            const createDiv = (className, text = null) => {
                const el = document.createElement('div');
                el.className = className;
                if (text !== null) el.textContent = text;
                return el;
            };

            const appendTooltipLine = (root, label, value) => {
                const line = createDiv('tooltip-line');
                line.append(
                    Object.assign(document.createElement('span'), { className: 'tooltip-label', textContent: label }),
                    Object.assign(document.createElement('span'), { className: 'tooltip-value', textContent: value })
                );
                root.appendChild(line);
            };

            const buildPinTooltip = (location, bookingList) => {
                const tooltip = createDiv('map-pin-tooltip');
                const title = document.createElement('strong');
                title.textContent = location;
                tooltip.append(title, document.createElement('br'));
                bookingList.forEach((booking) => {
                    appendTooltipLine(tooltip, 'Show', booking.event || 'Unknown');
                    appendTooltipLine(tooltip, 'Date', booking.date ? formatDisplayDate(booking.date) : 'Unknown date');
                    appendTooltipLine(tooltip, 'Status', booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : 'Unknown');
                });
                return tooltip;
            };

            const renderPanelContent = (panel, location, bookingList) => {
                if (!panel) return;
                if (!location || bookingList.length === 0) {
                    panel.replaceChildren(
                        createDiv('map-info-title', 'Performance Details'),
                        createDiv('map-info-empty', 'Hover a pin to see show details.')
                    );
                    return;
                }
                const nodes = [createDiv('map-info-title', location)];
                bookingList.forEach((booking) => {
                    const item = createDiv('map-info-item');
                    const eventLine = document.createElement('div');
                    const eventName = document.createElement('strong');
                    eventName.textContent = booking.event || 'Unknown show';
                    eventLine.appendChild(eventName);
                    item.append(
                        eventLine,
                        createDiv('', booking.date ? formatDisplayDate(booking.date) : 'Unknown date'),
                        createDiv('', `Status: ${booking.status ? booking.status.charAt(0).toUpperCase() + booking.status.slice(1) : 'Unknown'}`)
                    );
                    nodes.push(item);
                });
                panel.replaceChildren(...nodes);
            };

            const buildLocationGroups = () => {
                const groups = {};
                allBookings.forEach(booking => {
                    const location = booking.location || 'Unknown';
                    if (!groups[location]) {
                        groups[location] = { count: 0, bookings: [], hasUpcoming: false };
                    }
                    groups[location].count++;
                    groups[location].bookings.push(booking);
                    if (new Date(booking.date) >= today) {
                        groups[location].hasUpcoming = true;
                    }
                });
                return groups;
            };

            const buildLegendRow = (kind, label) => {
                const row = createDiv('map-legend-row');
                row.append(createDiv(`map-legend-dot map-legend-dot--${kind}`), document.createTextNode(label));
                return row;
            };

            const buildLegend = (title, count) => {
                const legend = createDiv('map-legend');
                legend.append(
                    createDiv('map-legend-title', title),
                    buildLegendRow('upcoming', 'Upcoming shows'),
                    buildLegendRow('past', 'Past shows'),
                    createDiv('map-legend-count', `Showing ${count} shows`),
                    createDiv('map-legend-note', 'Hover pins for details')
                );
                return legend;
            };

            const appendPins = (locationGroups, coordsByLocation, fallbackCoords) => {
                Object.keys(locationGroups).forEach(location => {
                    const coords = coordsByLocation[location] || fallbackCoords;
                    const data = locationGroups[location];

                    const pin = document.createElement('div');
                    pin.className = `map-pin ${data.hasUpcoming ? 'upcoming' : 'past'}`;
                    pin.style.left = `${coords.x}%`;
                    pin.style.top = `${coords.y}%`;
                    if (!showPinnedPanel) {
                        pin.appendChild(buildPinTooltip(location, data.bookings));
                    }
                    if (showPinnedPanel && pinnedPanel) {
                        pin.addEventListener('mouseenter', () => {
                            renderPanelContent(pinnedPanel, location, data.bookings);
                        });
                    }
                    map.appendChild(pin);
                });
            };

            let pinnedPanel = null;
            if (showPinnedPanel) {
                pinnedPanel = document.createElement('div');
                pinnedPanel.className = 'map-info-panel';
                renderPanelContent(pinnedPanel, null, []);
                map.appendChild(pinnedPanel);
            }

            const locationGroups = buildLocationGroups();
            if (hasInternational) {
                const worldCoords = {
                    'Kampala': { x: 50, y: 60 },
                    'Entebbe': { x: 50, y: 61 },
                    'Jinja': { x: 51, y: 60 },
                    'Mbarara': { x: 49, y: 62 },
                    'Nigeria': { x: 45, y: 55 },
                    'Kenya': { x: 52, y: 60 },
                    'Tanzania': { x: 51, y: 63 },
                    'Dubai (UAE)': { x: 60, y: 52 },
                    'South Africa': { x: 50, y: 75 },
                    'United Kingdom': { x: 42, y: 30 },
                    'United States': { x: 20, y: 40 },
                    'Ghana': { x: 43, y: 55 },
                    'Rwanda': { x: 51, y: 61 }
                };
                appendPins(locationGroups, worldCoords, { x: 50, y: 50 });
                map.appendChild(buildLegend('WORLD VIEW', allBookings.length));
            } else {
                const ugandaCoords = {
                    'Kampala': { x: 30, y: 50 },
                    'Wakiso': { x: 28, y: 48 },
                    'Entebbe': { x: 25, y: 52 },
                    'Jinja': { x: 42, y: 50 },
                    'Mbale': { x: 50, y: 48 },
                    'Gulu': { x: 32, y: 20 },
                    'Lira': { x: 38, y: 30 },
                    'Mbarara': { x: 15, y: 70 },
                    'Masaka': { x: 22, y: 62 },
                    'Soroti': { x: 48, y: 42 },
                    'Hoima': { x: 18, y: 42 },
                    'Arua': { x: 20, y: 15 },
                    'Kabale': { x: 12, y: 78 },
                    'Fort Portal': { x: 10, y: 48 },
                    'Kasese': { x: 8, y: 55 },
                    'Tororo': { x: 52, y: 50 },
                    'Busia': { x: 55, y: 50 }
                };
                appendPins(locationGroups, ugandaCoords, { x: 30, y: 50 });
                map.appendChild(buildLegend('UGANDA VIEW', allBookings.length));
            }

            if (showLocationList) {
                const locationList = Array.from(new Set(allBookings.map(b => (b.location || 'Unknown').trim())))
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));
                const listWrap = createDiv('map-location-list');
                listWrap.appendChild(createDiv('map-location-list-title', 'Locations'));
                if (locationList.length === 0) {
                    listWrap.appendChild(createDiv('map-location-list-item', '- None'));
                } else {
                    locationList.forEach((location) => {
                        listWrap.appendChild(createDiv('map-location-list-item', `- ${location}`));
                    });
                }
                map.appendChild(listWrap);
            }
        }

        function bindCalendarGridActions(grid) {
            if (!grid || grid.dataset.spCalendarActionsBound === '1') return;
            grid.dataset.spCalendarActionsBound = '1';

            const activateDay = (dayEl) => {
                const dateStr = dayEl?.dataset?.date || '';
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
                selectCalendarDate(dateStr);
            };

            grid.addEventListener('click', (event) => {
                const dayEl = event.target?.closest?.('.calendar-day[data-date]');
                if (!dayEl || !grid.contains(dayEl)) return;
                activateDay(dayEl);
            });

            grid.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const dayEl = event.target?.closest?.('.calendar-day[data-date]');
                if (!dayEl || !grid.contains(dayEl)) return;
                event.preventDefault();
                activateDay(dayEl);
            });
        }

        // Calendar Functions - More Interactive - More Interactive - More Interactive
        function renderCalendar() {
            const year = currentCalendarDate.getFullYear();
            const month = currentCalendarDate.getMonth();
            
            const calendarMonth = document.getElementById('calendarMonth');
            if (calendarMonth) {
                calendarMonth.textContent = currentCalendarDate.toLocaleDateString('en', { month: 'long', year: 'numeric' });
            }

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysInPrevMonth = new Date(year, month, 0).getDate();

            const grid = document.getElementById('calendarGrid');
            if (!grid) return;
            bindCalendarGridActions(grid);
            grid.innerHTML = `
                <div class="calendar-day-label">Sun</div>
                <div class="calendar-day-label">Mon</div>
                <div class="calendar-day-label">Tue</div>
                <div class="calendar-day-label">Wed</div>
                <div class="calendar-day-label">Thu</div>
                <div class="calendar-day-label">Fri</div>
                <div class="calendar-day-label">Sat</div>
            `;

            // Previous month days
            for (let i = firstDay - 1; i >= 0; i--) {
                const day = daysInPrevMonth - i;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const allBookings = getAllBookings();
                const hasEvent = allBookings.some(b => b.date === dateStr);
                
                grid.innerHTML += `
                    <div class="calendar-day other-month ${hasEvent ? 'has-event' : ''}" data-date="${dateStr}"
                         role="button" tabindex="0">
                        ${day}
                        ${hasEvent ? '<div class="event-indicator"></div>' : ''}
                        ${hasEvent ? buildEventTooltip(dateStr) : ''}
                    </div>
                `;
            }

            // Current month days
            const today = new Date();
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const allBookings = getAllBookings();
                const dayEvents = allBookings.filter(b => b.date === dateStr);
                const hasEvent = dayEvents.length > 0;
                
                const isToday = today.getDate() === day && 
                               today.getMonth() === month && 
                               today.getFullYear() === year;

                const classes = ['calendar-day'];
                if (hasEvent) classes.push('has-event');
                if (isToday) classes.push('today');

                grid.innerHTML += `
                    <div class="${classes.join(' ')}" data-date="${dateStr}" role="button" tabindex="0">
                        ${day}
                        ${hasEvent ? `<div class="event-count">${dayEvents.length}</div>` : ''}
                        ${hasEvent ? '<div class="event-indicator"></div>' : ''}
                        ${hasEvent ? buildEventTooltip(dateStr) : ''}
                    </div>
                `;
            }

            // Next month days
            const remainingCells = 42 - (firstDay + daysInMonth);
            for (let day = 1; day <= remainingCells; day++) {
                const nextMonth = month + 2 > 12 ? 1 : month + 2;
                const nextYear = month + 2 > 12 ? year + 1 : year;
                const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const allBookings = getAllBookings();
                const hasEvent = allBookings.some(b => b.date === dateStr);
                
                grid.innerHTML += `
                    <div class="calendar-day other-month ${hasEvent ? 'has-event' : ''}" data-date="${dateStr}"
                         role="button" tabindex="0">
                        ${day}
                        ${hasEvent ? '<div class="event-indicator"></div>' : ''}
                        ${hasEvent ? buildEventTooltip(dateStr) : ''}
                    </div>
                `;
            }
        }

        function buildEventTooltip(dateStr) {
            const allBookings = getAllBookings();
            const dayEvents = allBookings.filter(b => b.date === dateStr);
            if (dayEvents.length === 0) return '';
            const lines = dayEvents.map(evt => `- ${escapeHtml(evt.event || 'Untitled event')} - ${escapeHtml(evt.artist || 'Roster / Shared')}`).join('<br>');
            return `<div class="event-tooltip">${lines}</div>`;
        }

        function selectCalendarDate(dateStr) {
            selectedCalendarDate = dateStr;
            
            // Highlight selected date
            document.querySelectorAll('.calendar-day').forEach(day => {
                day.classList.remove('selected', 'show-tooltip');
            });

            const dayEl = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
            if (dayEl) {
                dayEl.classList.add('selected');
                if (dayEl.querySelector('.event-tooltip')) {
                    dayEl.classList.add('show-tooltip');
                }
            }
        }

        function openBookingFormWithPrefill(prefill = {}) {
            showSection('schedule');
            const applyPrefill = () => {
                showAddBooking();
                if (prefill.artistName) {
                    const artistField = document.getElementById('bookingArtist');
                    if (artistField) artistField.value = prefill.artistName;
                }
                if (prefill.date) {
                    const dateField = document.getElementById('bookingDate');
                    if (dateField) dateField.value = prefill.date;
                    selectedCalendarDate = prefill.date;
                }
                document.getElementById('bookingEvent')?.focus();
            };
            setTimeout(applyPrefill, 50);
            setTimeout(applyPrefill, 180);
        }

        function showAddEventForm(dateStr) {
            // Navigate directly to booking form and prefill date.
            openBookingFormWithPrefill({ date: dateStr });
        }

        function showAddEventToCalendar() {
            if (guardReadOnly('add bookings')) return;
            if (!selectedCalendarDate) {
                toastError('Please select a date first.');
                return;
            }
            showAddEventForm(selectedCalendarDate);
        }

        function previousMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar();
            selectedCalendarDate = null;
            document.getElementById('calendarEventDetails').innerHTML = '<p class="calendar-empty-note">Click on a date with events to see details</p>';
        }

        function nextMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
            selectedCalendarDate = null;
            document.getElementById('calendarEventDetails').innerHTML = '<p class="calendar-empty-note">Click on a date with events to see details</p>';
        }

        function goToToday() {
            currentCalendarDate = new Date();
            renderCalendar();
            selectedCalendarDate = null;
            document.getElementById('calendarEventDetails').innerHTML = '<p class="calendar-empty-note">Click on a date with events to see details</p>';
        }

        function getReportPeriodData(period, options = {}) {
            const {
                sortNewestFirst = false,
                selectedArtist = '',
                artist = null,
                artistId = '',
                artistName = '',
                dateStart = '',
                dateEnd = ''
            } = options;
            const normalizedDateStart = String(dateStart || '').trim();
            const normalizedDateEnd = String(dateEnd || '').trim();
            const hasExplicitDateRange = Boolean(normalizedDateStart || normalizedDateEnd);
            const maybeSort = (items) => {
                if (!sortNewestFirst) return items;
                return [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
            };

            const filterDateRange = (items, dateField = 'date') => {
                if (!hasExplicitDateRange) return items;
                return items.filter((item) => {
                    const value = String(item?.[dateField] || '').trim();
                    if (!value) return false;
                    if (normalizedDateStart && value < normalizedDateStart) return false;
                    if (normalizedDateEnd && value > normalizedDateEnd) return false;
                    return true;
                });
            };

            let filteredBookings = hasExplicitDateRange ? [...bookings] : filterByPeriod(bookings, period);
            let filteredExpenses = hasExplicitDateRange ? [...expenses] : filterByPeriod(expenses, period);
            let filteredOtherIncome = hasExplicitDateRange ? [...otherIncome] : filterByPeriod(otherIncome, period);

            const artistScope = resolveArtistScope({
                selectedArtist,
                artist,
                artistId,
                artistName
            });
            const selectedArtistName = artistScope.artistName;
            if (artistScope.hasArtist) {
                filteredBookings = filteredBookings.filter((booking) => financeRecordMatchesArtist(booking, artistScope));
                filteredExpenses = filteredExpenses.filter((expense) =>
                    financeRecordMatchesArtist(expense, artistScope) || isFinanceRecordShared(expense)
                );
                filteredOtherIncome = filteredOtherIncome.filter((income) => financeRecordMatchesArtist(income, artistScope));
            }

            filteredBookings = maybeSort(filterDateRange(filteredBookings, 'date'));
            filteredExpenses = maybeSort(filterDateRange(ensureFinanceArtistRefs(filteredExpenses), 'date'));
            filteredOtherIncome = maybeSort(filterDateRange(ensureFinanceArtistRefs(filteredOtherIncome), 'date'));

            const totalBookings = filteredBookings.length;
            const totalIncome = filteredBookings.reduce((sum, b) => sum + (Math.round(Number(b.fee) || 0)), 0);
            const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Math.round(Number(e.amount) || 0)), 0);
            const totalOtherIncome = filteredOtherIncome.reduce((sum, i) => sum + (Math.round(Number(i.amount) || 0)), 0);
            const periodNetProfit = (totalIncome + totalOtherIncome) - totalExpenses;
            const balancesDue = filteredBookings.reduce((sum, b) => sum + (Math.round(Number(b.balance) || 0)), 0);
            const reportStartPeriod = typeof window.getReportStartPeriodKey === 'function'
                ? window.getReportStartPeriodKey(period, normalizedDateStart, {
                    filteredBookings,
                    filteredExpenses,
                    filteredOtherIncome
                })
                : (normalizedDateStart ? normalizedDateStart.slice(0, 7) : new Date().toISOString().slice(0, 7));
            const resolvedArtist = artist
                || artistScope.artist
                || (artistId ? findArtistById(artistId) : null)
                || (selectedArtistName ? findArtistByName(selectedArtistName) : null);
            const bbfContext = typeof getActiveBBFContext === 'function'
                ? getActiveBBFContext({
                    period: reportStartPeriod,
                    artist: resolvedArtist,
                    artistId: artistId || resolvedArtist?.id,
                    artistName: selectedArtistName || resolvedArtist?.name,
                    fallbackToGlobal: !artistScope.hasArtist
                })
                : null;
            const bbf = bbfContext
                ? Number(bbfContext.amount) || 0
                : (typeof getCurrentBBF === 'function'
                    ? Number(getCurrentBBF({
                        period: reportStartPeriod,
                        artistId: artistId || resolvedArtist?.id,
                        artistName: selectedArtistName || resolvedArtist?.name,
                        fallbackToGlobal: !artistScope.hasArtist
                    })) || 0
                    : 0);
            const closingBalance = bbf + periodNetProfit;

            return {
                filteredBookings,
                filteredExpenses,
                filteredOtherIncome,
                totalBookings,
                totalIncome,
                totalExpenses,
                totalOtherIncome,
                netProfit: periodNetProfit,
                periodNetProfit,
                balancesDue,
                bbf,
                closingBalance,
                bbfPeriod: bbfContext?.period || reportStartPeriod,
                bbfSourcePeriodLabel: bbfContext?.sourcePeriodLabel || ''
            };
        }

        // Add this function to update report statistics
        function updateReportStatistics() {
            const periodEl = document.getElementById('reportPeriod');
            if (!periodEl) return;
            const period = periodEl.value;
            const selectedArtist = String(document.getElementById('spRptArtistFilter')?.value || document.getElementById('spPdfArtistSelect')?.value || '').trim();
            const selectedArtistId = selectedArtist ? (findArtistByName(selectedArtist)?.id || '') : '';
            const {
                totalBookings,
                totalIncome,
                totalExpenses,
                totalOtherIncome,
                netProfit,
                balancesDue
            } = getReportPeriodData(period, { sortNewestFirst: false, selectedArtist, artistId: selectedArtistId });
            
            const reportBookings = document.getElementById('reportBookings');
            const reportIncome = document.getElementById('reportIncome');
            const reportOtherIncome = document.getElementById('reportOtherIncome');
            const reportExpenses = document.getElementById('reportExpenses');
            const reportProfit = document.getElementById('reportProfit');
            const reportBalancesDue = document.getElementById('reportBalancesDue');
            const setValueTone = (el, tone) => {
                if (!el) return;
                el.classList.remove('income-green', 'deposit-blue', 'expense-red', 'profit-blue');
                if (tone) el.classList.add(tone);
            };
            if (reportBookings) reportBookings.textContent = totalBookings;
            if (reportIncome) reportIncome.textContent = `UGX ${totalIncome.toLocaleString()}`;
            if (reportOtherIncome) reportOtherIncome.textContent = `UGX ${totalOtherIncome.toLocaleString()}`;
            if (reportExpenses) reportExpenses.textContent = `UGX ${totalExpenses.toLocaleString()}`;
            if (reportProfit) reportProfit.textContent = `UGX ${netProfit.toLocaleString()}`;
            if (reportBalancesDue) reportBalancesDue.textContent = `UGX ${balancesDue.toLocaleString()}`;
            setValueTone(reportIncome, 'income-green');
            setValueTone(reportOtherIncome, 'income-green');
            setValueTone(reportExpenses, 'expense-red');
            setValueTone(reportBalancesDue, 'expense-red');
            setValueTone(reportProfit, netProfit >= 0 ? 'income-green' : 'expense-red');
        }

        function populateAudienceArtistDropdown() {
            const select = document.getElementById('audienceArtistSelect');
            if (!select) return;
            const current = select.value;
            const artistList = getArtists();
            select.innerHTML = '<option value="">Select Artist</option>' +
                artistList.map(artist => {
                    const id = escapeHtml(artist?.id || '');
                    const name = escapeHtml(artist?.name || '');
                    return `<option value="${id}">${name}</option>`;
                }).join('');
            if (current) {
                select.value = current;
            }
            const periodEl = document.getElementById('audienceMetricPeriod');
            if (periodEl && !periodEl.value) {
                periodEl.value = new Date().toISOString().slice(0, 7);
            }
        }

        function getLatestAudienceMetricEntry(artistId) {
            if (!artistId) return null;
            const entries = Array.isArray(audienceMetrics)
                ? audienceMetrics.filter(entry => String(entry?.artistId || '') === String(artistId))
                : [];
            if (!entries.length) return null;
            return entries.slice().sort((a, b) => {
                const aKey = String(a?.period || a?.updatedAt || a?.createdAt || '');
                const bKey = String(b?.period || b?.updatedAt || b?.createdAt || '');
                return aKey.localeCompare(bKey);
            })[entries.length - 1] || null;
        }

        function isAudienceMetricEntryEmpty(entry) {
            const social = Math.round(Number(entry?.socialFollowers) || 0);
            const spotify = Math.round(Number(entry?.spotifyListeners) || 0);
            const youtube = Math.round(Number(entry?.youtubeListeners) || 0);
            return social <= 0 && spotify <= 0 && youtube <= 0;
        }

        function isAudienceMetricEntryStale(entry) {
            if (!entry) return true;
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            let periodDate = null;
            if (entry.period) {
                const [y, m] = String(entry.period).split('-');
                const yearNum = Number(y);
                const monthNum = Number(m);
                if (Number.isFinite(yearNum) && Number.isFinite(monthNum)) {
                    periodDate = new Date(yearNum, Math.max(0, monthNum - 1), 1);
                }
            }
            const updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : null;
            const staleByPeriod = !periodDate || periodDate < currentMonthStart;
            const staleByUpdated = updatedAt && Number.isFinite(updatedAt.getTime())
                ? (now - updatedAt) > (1000 * 60 * 60 * 24 * 45)
                : false;
            return staleByPeriod || staleByUpdated;
        }

        async function fetchPublicAudienceMetrics(artist) {
            if (!artist) return null;
            if (typeof window.fetchPublicAudienceMetrics === 'function') {
                try {
                    return await window.fetchPublicAudienceMetrics(artist);
                } catch (err) {
                    console.warn('Public audience metrics provider failed:', err);
                }
            }
            const endpoint = window.__spAudienceMetricsEndpoint;
            if (endpoint && typeof endpoint === 'string') {
                try {
                    const url = `${endpoint}?artist=${encodeURIComponent(artist.name || artist.id || '')}`;
                    const resp = await fetch(url, { cache: 'no-store' });
                    if (!resp.ok) return null;
                    const data = await resp.json();
                    if (!data || typeof data !== 'object') return null;
                    return {
                        socialFollowers: Number(data.socialFollowers),
                        spotifyListeners: Number(data.spotifyListeners),
                        youtubeListeners: Number(data.youtubeListeners)
                    };
                } catch (err) {
                    console.warn('Public audience metrics fetch failed:', err);
                }
            }
            return null;
        }

        function applyAudienceMetricsToInputs(entry) {
            const socialEl = document.getElementById('audienceSocialFollowers');
            const spotifyEl = document.getElementById('audienceSpotifyListeners');
            const youtubeEl = document.getElementById('audienceYouTubeListeners');
            if (socialEl) socialEl.value = Math.round(Number(entry?.socialFollowers) || 0) || 0;
            if (spotifyEl) spotifyEl.value = Math.round(Number(entry?.spotifyListeners) || 0) || 0;
            if (youtubeEl) youtubeEl.value = Math.round(Number(entry?.youtubeListeners) || 0) || 0;
        }

        async function handleAudienceArtistChange() {
            const artistSelect = document.getElementById('audienceArtistSelect');
            const periodEl = document.getElementById('audienceMetricPeriod');
            if (!artistSelect || !periodEl) return;

            const artistId = String(artistSelect.value || '').trim();
            if (!artistId) return;
            const artist = findArtistById(artistId);

            if (!periodEl.value) {
                periodEl.value = new Date().toISOString().slice(0, 7);
            }
            const currentPeriod = String(periodEl.value || '').trim();

            const exactEntry = audienceMetrics.find(entry =>
                String(entry?.artistId || '') === artistId && String(entry?.period || '') === currentPeriod
            ) || null;

            let entry = exactEntry || getLatestAudienceMetricEntry(artistId);
            const needsRefresh = !entry || isAudienceMetricEntryEmpty(entry) || isAudienceMetricEntryStale(entry);

            if (needsRefresh && artist) {
                const publicMetrics = await fetchPublicAudienceMetrics(artist);
                if (publicMetrics && typeof publicMetrics === 'object') {
                    entry = {
                        ...(entry || {}),
                        artistId,
                        artist: artist?.name || entry?.artist || '',
                        period: currentPeriod,
                        socialFollowers: Number(publicMetrics.socialFollowers) || entry?.socialFollowers || 0,
                        spotifyListeners: Number(publicMetrics.spotifyListeners) || entry?.spotifyListeners || 0,
                        youtubeListeners: Number(publicMetrics.youtubeListeners) || entry?.youtubeListeners || 0,
                    };
                }
            }

            if (entry) {
                applyAudienceMetricsToInputs(entry);
            } else {
                applyAudienceMetricsToInputs({ socialFollowers: 0, spotifyListeners: 0, youtubeListeners: 0 });
            }
        }

        function bindAudienceArtistSelect() {
            const select = document.getElementById('audienceArtistSelect');
            if (!select || select.dataset.bound === '1') return;
            select.dataset.bound = '1';
            select.addEventListener('change', () => {
                handleAudienceArtistChange();
            });
        }

        function renderAudienceMetrics() {
            const list = document.getElementById('audienceMetricList');
            if (!list) return;
            const items = Array.isArray(audienceMetrics) ? [...audienceMetrics] : [];
            if (!items.length) {
                list.innerHTML = '<p class="audience-metric-empty">No audience metrics yet.</p>';
                return;
            }
            items.sort((a, b) => {
                const periodCompare = String(b.period || '').localeCompare(String(a.period || ''));
                if (periodCompare !== 0) return periodCompare;
                return String(a.artist || '').localeCompare(String(b.artist || ''));
            });
            const rows = items.slice(0, 6).map((item) => {
                const metricId = item.id || createRuntimeId('aud', `${item.artistId || item.artist || 'metric'}-${item.period || 'period'}`);
                if (!item.id) item.id = metricId; // FIXED: inline cloud edits need stable record metadata.
                const social = Math.round(Number(item.socialFollowers) || 0);
                const spotify = Math.round(Number(item.spotifyListeners) || 0);
                const youtube = Math.round(Number(item.youtubeListeners) || 0);
                const artistLabel = escapeHtml(item.artist || 'Artist');
                const periodLabel = escapeHtml(item.period || '');
                return `
                    <div class="audience-metric-row" data-audience-metric-id="${escapeHtml(metricId)}">
                        <div class="audience-metric-row__meta">
                            <strong class="audience-metric-row__artist">${artistLabel}</strong>
                            <span class="audience-metric-row__period sp-inline-editable" ${inlineEditAttrs('audienceMetric', metricId, 'period', 'Period')}>${periodLabel}</span>
                        </div>
                        <div class="audience-metric-row__stats">
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">Social Media</span> <span class="audience-metric-row__value sp-inline-editable" ${inlineEditAttrs('audienceMetric', metricId, 'socialFollowers', 'Social Media Followers')}>${social.toLocaleString()}</span></span>
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">Spotify</span> <span class="audience-metric-row__value sp-inline-editable" ${inlineEditAttrs('audienceMetric', metricId, 'spotifyListeners', 'Spotify Listeners')}>${spotify.toLocaleString()}</span></span>
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">YouTube</span> <span class="audience-metric-row__value sp-inline-editable" ${inlineEditAttrs('audienceMetric', metricId, 'youtubeListeners', 'YouTube Listeners')}>${youtube.toLocaleString()}</span></span>
                        </div>
                    </div>
                `;
            }).join('');
            list.innerHTML = rows;
        }

        function saveAudienceMetricEntry() {
            if (saveAudienceMetricEntry._busy) return;
            saveAudienceMetricEntry._busy = true;
            setTimeout(() => { saveAudienceMetricEntry._busy = false; }, 0);
            if (guardReadOnly('save audience metrics')) return;
            const artistSelect = document.getElementById('audienceArtistSelect');
            const periodEl = document.getElementById('audienceMetricPeriod');
            if (!artistSelect || !periodEl) return;

            const artistId = String(artistSelect.value || '').trim();
            const artist = artistId ? findArtistById(artistId) : null;
            const period = String(periodEl.value || '').trim();
            const socialFollowers = Math.round(Number(document.getElementById('audienceSocialFollowers')?.value) || 0);
            const spotifyListeners = Math.round(Number(document.getElementById('audienceSpotifyListeners')?.value) || 0);
            const youtubeListeners = Math.round(Number(document.getElementById('audienceYouTubeListeners')?.value) || 0);

            if (!artistId || !artist) {
                toastError('Please select an artist.');
                return;
            }
            if (!period) {
                toastError('Please select a month.');
                return;
            }

            const nowIso = new Date().toISOString();
            const existingIndex = audienceMetrics.findIndex(entry =>
                String(entry?.artistId || '') === artistId && String(entry?.period || '') === period
            );
            const baseEntry = existingIndex >= 0 ? audienceMetrics[existingIndex] : null;
            const entry = {
                id: baseEntry?.id || createRuntimeId('aud', `${artistId}-${period}`),
                artistId,
                artist: artist?.name || '',
                period,
                socialFollowers,
                spotifyListeners,
                youtubeListeners,
                createdAt: baseEntry?.createdAt || nowIso,
                updatedAt: nowIso,
            };

            if (existingIndex >= 0) {
                audienceMetrics[existingIndex] = entry;
            } else {
                audienceMetrics.push(entry);
            }

            const scopeKey = getActiveDataScopeKey();
            saveAudienceMetricsForScope(scopeKey, audienceMetrics);
            window.audienceMetrics = audienceMetrics;
            renderAudienceMetrics();
            syncCloudExtras();
            toastSuccess('Audience metrics saved.');
        }

        // Update the filterByPeriod function to include "prevMonth"
        function filterByPeriod(items, period) {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            return items.filter(item => {
                const itemDate = new Date(item.date);
                
                switch(period) {
                    case 'month':
                        return itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear;
                    case 'prevMonth':
                        // Calculate previous month
                        let prevMonth = currentMonth - 1;
                        let prevYear = currentYear;
                        if (prevMonth < 0) {
                            prevMonth = 11; // December
                            prevYear = currentYear - 1;
                        }
                        return itemDate.getMonth() === prevMonth && itemDate.getFullYear() === prevYear;
                    case 'quarter':
                        const quarterStart = Math.floor(currentMonth / 3) * 3;
                        const quarterEnd = quarterStart + 2;
                        return itemDate.getMonth() >= quarterStart && 
                               itemDate.getMonth() <= quarterEnd && 
                               itemDate.getFullYear() === currentYear;
                    case 'year':
                        return itemDate.getFullYear() === currentYear;
                    case 'prevYear':
                        return itemDate.getFullYear() === (currentYear - 1);
                    case 'all':
                    default:
                        return true;
                }
            });
        }

        // Get period string for report period labels
        function getPeriodString(period) {
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];
            
            switch(period) {
                case 'month':
                    return `${monthNames[currentMonth]}-${currentYear}`;
                case 'prevMonth':
                    let prevMonth = currentMonth - 1;
                    let prevYear = currentYear;
                    if (prevMonth < 0) {
                        prevMonth = 11;
                        prevYear = currentYear - 1;
                    }
                    return `${monthNames[prevMonth]}-${prevYear}`;
                case 'quarter':
                    const quarter = Math.floor(currentMonth / 3) + 1;
                    return `Q${quarter}-${currentYear}`;
                case 'year':
                    return `${currentYear}`;
                case 'prevYear':
                    return `${currentYear - 1}`;
                case 'all':
                    return 'All-Time';
                default:
                    return 'Report';
            }
        }

        function getReportPeriodSelection() {
            const periodEl = document.getElementById('reportPeriod');
            const period = periodEl?.value || 'month';
            const periodLabel = periodEl?.selectedOptions?.[0]?.textContent || getPeriodString(period);
            return { periodEl, period, periodLabel };
        }

        function getMonthYearLabel(offsetMonths = 0) {
            const base = new Date();
            const target = new Date(base.getFullYear(), base.getMonth() + Number(offsetMonths || 0), 1);
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
            return `${monthNames[target.getMonth()]} ${target.getFullYear()}`;
        }

        function updateMonthContextLabels() {
            const currentLabel = getMonthYearLabel(0);
            const prevLabel = getMonthYearLabel(-1);

            const glanceLabel = document.getElementById('glancePeriodLabel');
            if (glanceLabel) glanceLabel.textContent = currentLabel;

            const revenueLabel = document.getElementById('dashboardRevenueLabel');
            if (revenueLabel) revenueLabel.textContent = `${currentLabel} Revenue`;

            const expensesLabel = document.getElementById('dashboardExpensesLabel');
            if (expensesLabel) expensesLabel.textContent = `Expenses (${currentLabel})`;

            const cashflowLabel = document.getElementById('cashflowPeriodLabel');
            if (cashflowLabel) cashflowLabel.textContent = currentLabel;

            const reportPeriod = document.getElementById('reportPeriod');
            if (reportPeriod) {
                const currentOpt = document.getElementById('reportPeriodCurrentOption');
                if (currentOpt) currentOpt.textContent = currentLabel;
                const prevOpt = document.getElementById('reportPeriodPrevOption');
                if (prevOpt) prevOpt.textContent = prevLabel;
            }
        }

        function getClosingThoughtsStore() {
            const rawStore = Storage.loadSync(CLOSING_THOUGHTS_STORAGE_KEY, {});
            if (!rawStore || typeof rawStore !== 'object' || Array.isArray(rawStore)) {
                return {};
            }
            return rawStore;
        }

        function getClosingThoughtsForPeriod(period = null) {
            const { period: selectedPeriod } = getReportPeriodSelection();
            const periodKey = period || selectedPeriod;
            const store = getClosingThoughtsStore();
            const managerKey = getActiveDataScopeKey() || 'default';
            const managerStore = store[managerKey];
            if (!managerStore || typeof managerStore !== 'object' || Array.isArray(managerStore)) {
                return '';
            }
            return String(managerStore[periodKey] || '');
        }

        function updateClosingThoughtsMeta() {
            const input = document.getElementById('closingThoughtsInput');
            const countEl = document.getElementById('closingThoughtsCount');
            const statusEl = document.getElementById('closingThoughtsStatus');
            if (!input) return;

            if (countEl) {
                countEl.textContent = `${input.value.length} / 600`;
            }

            if (!statusEl) return;
            const savedValue = input.dataset.savedValue || '';
            if (input.value === savedValue) {
                statusEl.textContent = input.value.trim() ? 'Saved' : 'Not saved';
                return;
            }
            statusEl.textContent = 'Unsaved changes';
        }

        function loadClosingThoughtsForPeriod(period = null) {
            const panel = document.getElementById('closingThoughtsPanel');
            const input = document.getElementById('closingThoughtsInput');
            const statusEl = document.getElementById('closingThoughtsStatus');
            if (!panel || !input) return;

            const { period: selectedPeriod, periodLabel } = getReportPeriodSelection();
            const periodKey = period || selectedPeriod;
            const savedText = getClosingThoughtsForPeriod(periodKey);
            input.value = savedText;
            input.dataset.savedValue = savedText;

            if (statusEl) {
                statusEl.textContent = savedText.trim()
                    ? `Saved for ${periodLabel}`
                    : 'Not saved';
            }
            updateClosingThoughtsMeta();
        }

        function handleReportPeriodChange() {
            updateReportStatistics();
            loadClosingThoughtsForPeriod();
        }

        function toggleClosingThoughts() {
            const panel = document.getElementById('closingThoughtsPanel');
            if (!panel) return;
            const isHidden = panel.style.display === 'none' || !panel.style.display;
            panel.style.display = isHidden ? 'block' : 'none';
            if (!isHidden) return;

            loadClosingThoughtsForPeriod();
            setTimeout(() => {
                document.getElementById('closingThoughtsInput')?.focus();
            }, 20);
        }

        function saveClosingThoughts() {
            if (guardReadOnly('update closing thoughts')) return;
            if (saveClosingThoughts._busy) return;
            saveClosingThoughts._busy = true;
            setTimeout(() => { saveClosingThoughts._busy = false; }, 0);
            const input = document.getElementById('closingThoughtsInput');
            const statusEl = document.getElementById('closingThoughtsStatus');
            if (!input) return;

            const { period, periodLabel } = getReportPeriodSelection();
            const managerKey = getActiveDataScopeKey() || 'default';
            const normalizedValue = String(input.value || '').trim();
            const store = getClosingThoughtsStore();
            const managerStore = (store[managerKey] && typeof store[managerKey] === 'object' && !Array.isArray(store[managerKey]))
                ? store[managerKey]
                : {};

            if (normalizedValue) {
                managerStore[period] = normalizedValue;
            } else {
                delete managerStore[period];
            }

            if (Object.keys(managerStore).length === 0) {
                delete store[managerKey];
            } else {
                store[managerKey] = managerStore;
            }

            Storage.saveSync(CLOSING_THOUGHTS_STORAGE_KEY, store);
            input.value = normalizedValue;
            input.dataset.savedValue = normalizedValue;
            if (statusEl) {
                statusEl.textContent = normalizedValue ? `Saved for ${periodLabel}` : 'Not saved';
            }
            updateClosingThoughtsMeta();
            toastSuccess(normalizedValue ? 'Closing thoughts saved.' : 'Closing thoughts cleared.');
            syncCloudExtras();
        }

        function clearClosingThoughts() {
            if (guardReadOnly('clear closing thoughts')) return;
            if (clearClosingThoughts._busy) return;
            clearClosingThoughts._busy = true;
            setTimeout(() => { clearClosingThoughts._busy = false; }, 0);
            const input = document.getElementById('closingThoughtsInput');
            if (!input) return;

            const { period } = getReportPeriodSelection();
            const managerKey = getActiveDataScopeKey() || 'default';
            const store = getClosingThoughtsStore();
            const managerStore = store[managerKey];

            if (managerStore && typeof managerStore === 'object' && !Array.isArray(managerStore)) {
                delete managerStore[period];
                if (Object.keys(managerStore).length === 0) {
                    delete store[managerKey];
                } else {
                    store[managerKey] = managerStore;
                }
                Storage.saveSync(CLOSING_THOUGHTS_STORAGE_KEY, store);
            }

            input.value = '';
            input.dataset.savedValue = '';
            updateClosingThoughtsMeta();
            toastSuccess('Closing thoughts cleared.');
            syncCloudExtras();
        }

        const reportLogoDataUrlCache = new Map();
        const reportLogoDataUrlPromise = new Map();

        function blobToDataUrl(blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                reader.onerror = () => reject(reader.error || new Error('Failed to read logo blob'));
                reader.readAsDataURL(blob);
            });
        }

        function imageToDataUrl(img) {
            const width = Number(img?.naturalWidth || img?.width || 0);
            const height = Number(img?.naturalHeight || img?.height || 0);
            if (!width || !height) return '';
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.drawImage(img, 0, 0, width, height);
            return canvas.toDataURL('image/png');
        }

        function loadLogoDataUrlFromImage(logoSrc) {
            return new Promise((resolve) => {
                const img = new Image();
                img.decoding = 'async';
                img.onload = () => {
                    try {
                        resolve(imageToDataUrl(img) || '');
                    } catch (err) {
                        console.warn(`Report logo image decode failed (${logoSrc}):`, err);
                        resolve('');
                    }
                };
                img.onerror = () => resolve('');
                img.src = logoSrc;
            });
        }

        function normalizeReportLogoTheme(options = {}) {
            const normalizedOptions = options || {};
            const rawTheme = typeof normalizedOptions === 'string'
                ? normalizedOptions
                : (normalizedOptions.themeMode || normalizedOptions.theme || normalizedOptions.mode || '');
            return String(rawTheme).toLowerCase() === 'light' ? 'light' : 'dark';
        }

        function buildReportLogoCandidates(themeMode, withOrigin) {
            const primaryLogo = themeMode === 'light' ? 'star_paper_black.png' : 'star_paper_white.png';
            const candidateNames = ['star_paper_transparent.png', primaryLogo, 'star_paper_512.png'];
            return [
                ...candidateNames.map((name) => withOrigin(`/star_paper_logo_pack/${name}?v=${REPORT_LOGO_ASSET_VERSION}`)),
                ...candidateNames.map((name) => `/star_paper_logo_pack/${name}?v=${REPORT_LOGO_ASSET_VERSION}`)
            ];
        }

        async function getReportLogoDataUrl(options = {}) {
            const themeMode = normalizeReportLogoTheme(options);
            if (reportLogoDataUrlCache.has(themeMode)) return reportLogoDataUrlCache.get(themeMode);
            if (reportLogoDataUrlPromise.has(themeMode)) return reportLogoDataUrlPromise.get(themeMode);

            const pendingLogoLoad = (async () => {
                try {
                    const origin = window.location.origin && window.location.origin !== 'null'
                        ? window.location.origin
                        : '';
                    const withOrigin = (path) => origin ? `${origin}${path}` : path;
                    const candidateList = buildReportLogoCandidates(themeMode, withOrigin);
                    const isFileProtocol = window.location.protocol === 'file:';
                    for (const logoSrc of candidateList) {
                        if (!isFileProtocol) {
                            try {
                                const response = await fetch(logoSrc, { cache: 'reload' });
                                if (response.ok) {
                                    const blob = await response.blob();
                                    const logoDataUrl = await blobToDataUrl(blob);
                                    if (logoDataUrl) {
                                        reportLogoDataUrlCache.set(themeMode, logoDataUrl);
                                        return logoDataUrl;
                                    }
                                }
                            } catch (err) {
                                console.warn(`Report logo fetch candidate failed (${logoSrc}):`, err);
                            }
                        }

                        const imageDataUrl = await loadLogoDataUrlFromImage(logoSrc);
                        if (imageDataUrl) {
                            reportLogoDataUrlCache.set(themeMode, imageDataUrl);
                            return imageDataUrl;
                        }
                    }
                    console.warn('Report logo unavailable: all logo candidates failed.');
                    return '';
                } finally {
                    reportLogoDataUrlPromise.delete(themeMode);
                }
            })();
            reportLogoDataUrlPromise.set(themeMode, pendingLogoLoad);

            return pendingLogoLoad;
        }

        // ── CSV Export ──────────────────────────────────────────────────────
        function escapeCSVField(field) {
            const str = String(field ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        function arrayToCSV(rows, columns) {
            const header = columns.map(c => escapeCSVField(c.label)).join(',');
            const body = rows.map(row =>
                columns.map(c => escapeCSVField(c.value(row))).join(',')
            ).join('\n');
            return header + '\n' + body;
        }

        function exportCSV() {
            const { period } = getReportPeriodSelection();
            const selectedArtist = String(document.getElementById('spRptArtistFilter')?.value || document.getElementById('spPdfArtistSelect')?.value || '').trim();
            const selectedArtistId = selectedArtist ? (findArtistByName(selectedArtist)?.id || '') : '';
            const data = getReportPeriodData(period, { sortNewestFirst: true, selectedArtist, artistId: selectedArtistId });
            const fmtMoney = (v) => Math.round(Number(v) || 0);
            const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '';

            const bookingsCSV = arrayToCSV(data.filteredBookings, [
                { label: 'Date',    value: b => fmtDate(b.date) },
                { label: 'Event',   value: b => b.event || b.name || '' },
                { label: 'Artist',  value: b => b.artist || '' },
                { label: 'Capacity', value: b => Math.round(Number(b.capacity) || 0) },
                { label: 'Venue',   value: b => b.venue || '' },
                { label: 'Fee (UGX)',     value: b => fmtMoney(b.fee) },
                { label: 'Deposit (UGX)', value: b => fmtMoney(b.deposit) },
                { label: 'Balance (UGX)', value: b => fmtMoney(b.balance) },
                { label: 'Status',  value: b => b.status || '' },
            ]);

            const expensesCSV = arrayToCSV(data.filteredExpenses, [
                { label: 'Date',     value: e => fmtDate(e.date) },
                { label: 'Artist',   value: e => getFinanceArtistLabel(e) },
                { label: 'Category', value: e => e.category || '' },
                { label: 'Description', value: e => e.description || e.name || '' },
                { label: 'Amount (UGX)', value: e => fmtMoney(e.amount) },
            ]);

            const otherIncomeCSV = arrayToCSV(data.filteredOtherIncome, [
                { label: 'Date',   value: i => fmtDate(i.date) },
                { label: 'Artist', value: i => getFinanceArtistLabel(i) },
                { label: 'Source', value: i => i.source || i.name || '' },
                { label: 'Description', value: i => i.description || '' },
                { label: 'Amount (UGX)', value: i => fmtMoney(i.amount) },
            ]);

            const combined = '=== BOOKINGS ===\n' + bookingsCSV +
                '\n\n=== EXPENSES ===\n' + expensesCSV +
                '\n\n=== OTHER INCOME ===\n' + otherIncomeCSV +
                '\n\n=== SUMMARY ===\n' +
                'Total Income (UGX),' + fmtMoney(data.totalIncome) + '\n' +
                'Total Expenses (UGX),' + fmtMoney(data.totalExpenses) + '\n' +
                'Total Other Income (UGX),' + fmtMoney(data.totalOtherIncome) + '\n' +
                'Net Profit (UGX),' + fmtMoney(data.netProfit) + '\n' +
                'Balances Due (UGX),' + fmtMoney(data.balancesDue);

            const blob = new Blob([combined], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `star-paper-report-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            if (typeof window.toastSuccess === 'function') {
                window.toastSuccess('CSV report downloaded');
            }
        }

        function showAddExpense() {
            if (guardTeamPermission('finance', 'add expenses')) return;
            // Ensure money section + expenses tab are active before showing form
            if (typeof showSection === 'function') showSection('expenses');
            if (typeof switchMoneyTab === 'function') switchMoneyTab('expenses');
            populateFinanceArtistDropdown(document.getElementById('expenseArtist'));
            document.getElementById('addExpenseForm').style.display = 'block';
            const listCard = document.getElementById('expensesListCard');
            if (listCard) listCard.style.display = 'none';
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { document.getElementById('expenseDesc')?.focus(); }, 50);
        }

        function cancelExpense() {
            document.getElementById('addExpenseForm').style.display = 'none';
            clearExpenseForm();
            editingExpenseId = null;
            const saveBtn = document.getElementById('saveExpenseBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Save Expense';
            }
            const listCard = document.getElementById('expensesListCard');
            if (listCard) {
                listCard.style.display = 'block';
            }
        }

        function clearExpenseForm() {
            document.getElementById('expenseDesc').value = '';
            document.getElementById('expenseAmount').value = '';
            document.getElementById('expenseDate').value = '';
            document.getElementById('expenseCategory').value = 'transport';
            const artistSelect = document.getElementById('expenseArtist');
            if (artistSelect) artistSelect.value = '';
            document.getElementById('expenseReceipt').value = '';
            document.getElementById('receiptPreview').style.display = 'none';
            document.getElementById('receiptPreview').src = '';
        }

        async function previewReceipt(event) {
            const file = event.target.files[0];
            if (!file) return;
            const result = await readValidatedImageDataUrl(file, {
                label: 'Receipt image',
                maxBytes: SP_RECEIPT_UPLOAD_MAX_BYTES
            });
            if (!result) return;
            const preview = document.getElementById('receiptPreview');
            preview.src = result;
            preview.style.display = 'block';
        }

        async function saveExpense() {
            if (guardTeamPermission('finance', 'save expenses')) return;

            let previousExpenses = [];
            try {
                previousExpenses = expenses.slice();
                const receiptSrc = normalizeSafeImageSource(document.getElementById('receiptPreview').src) || null;
                const existingExpense = editingExpenseId ? expenses.find(e => isSameRecordId(e.id, editingExpenseId)) : null;
                const isEdit = Boolean(editingExpenseId);
                let expense = {
                    id: editingExpenseId || Date.now(),
                    description: sanitizeTextInput(document.getElementById('expenseDesc').value),
                    amount: Math.round(Number(document.getElementById('expenseAmount').value) || 0),
                    date: document.getElementById('expenseDate').value,
                    category: sanitizeTextInput(document.getElementById('expenseCategory').value),
                    receipt: receiptSrc,
                    createdAt: existingExpense?.createdAt || Date.now()
                };
                expense = applyFinanceArtistSelection(expense, getFinanceArtistSelection('expenseArtist'));

                if (!expense.description || !expense.amount || !expense.date) {
                    toastError('Please fill in all required fields.');
                    return;
                }

                if (editingExpenseId) {
                    const idx = expenses.findIndex(e => isSameRecordId(e.id, editingExpenseId));
                    if (idx !== -1) {
                        expenses[idx] = expense;
                    } else {
                        expenses.push(expense);
                    }
                    editingExpenseId = null;
                } else {
                    expenses.push(expense);
                }
                const saveBtn = document.getElementById('saveExpenseBtn');
                if (saveBtn) {
                    saveBtn.textContent = 'Save Expense';
                }
                // Optimistic UI: render immediately, then persist
                renderExpenses();
                cancelExpense();
                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.saveExpenses === 'function') {
                        return window.SP.saveExpenses(expenses);
                    }
                    return saveUserData();
                }, {
                    successMessage: isEdit ? 'Expense updated in cloud.' : 'Expense saved to cloud.'
                });
                updateDashboard();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveExpense failed:', err);
                expenses = previousExpenses;
                window.expenses = expenses;
                renderExpenses();
                updateDashboard();
                updateReportStatistics();
                toastError(getCloudFailureMessage(err?.syncResult, 'Expense could not be saved to the cloud. Your last change was undone.'));
            }
        }

        function renderExpenses() {
            const tbody = document.querySelector('#expensesTable tbody');
            const sortedExpenses = sortNewestFirst(ensureFinanceArtistRefs(expenses));

            if (sortedExpenses.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6">${emptyState({
                    icon: 'ph-receipt',
                    title: 'No expenses yet',
                    sub: 'Track your costs - travel, equipment, studio time, and more.',
                    ctaLabel: '+ Log Expense',
                    ctaAction: 'showAddExpense'
                })}</td></tr>`;
                const cards = document.getElementById('expensesCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-receipt',
                    title: 'No expenses yet',
                    sub: 'Track your costs - travel, equipment, studio time, and more.',
                    ctaLabel: '+ Log Expense',
                    ctaAction: 'showAddExpense'
                });
                return;
            }

            tbody.innerHTML = sortedExpenses.map(expense => `
                <tr class="expense-edit-trigger" data-expense-id="${escapeHtml(expense.id)}">
                    <td class="sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'description', 'Description')}>${escapeHtml(expense.description || '-')}</td>
                    <td>${escapeHtml(getFinanceArtistLabel(expense))}</td>
                    <td class="sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'category', 'Category')}>${escapeHtml(formatInlineTitle(expense.category))}</td>
                    <td class="expense-red sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'amount', 'Amount')}>${escapeHtml(formatInlineMoney(expense.amount))}</td>
                    <td class="sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'date', 'Date')}>${escapeHtml(formatDisplayDate(expense.date))}</td>
                    <td>
                        ${expense.receipt ?
                            `<button class="action-btn icon-btn" data-receipt-view="1" data-receipt="${escapeHtml(expense.id)}" data-receipt-type="expense" aria-label="View receipt" title="View receipt"><i class="ph ph-eye" aria-hidden="true"></i></button>` :
                            '-'}
                    </td>
                </tr>
            `).join('');

            const cards = document.getElementById('expensesCards');
            if (cards) {
                cards.innerHTML = sortedExpenses.map(expense => `
                    <div class="expense-card card-animate expense-edit-trigger" data-expense-id="${escapeHtml(expense.id)}">
                        <div class="booking-card-header">
                            <div class="booking-title sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'description', 'Description')}>${escapeHtml(expense.description || '-')}</div>
                            <span class="status-badge status-pending sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'category', 'Category')}>${escapeHtml(expense.category || 'other')}</span>
                        </div>
                        <div class="expense-meta">
                            <div class="expense-field"><span>Artist</span>${escapeHtml(getFinanceArtistLabel(expense))}</div>
                            <div class="expense-field sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'category', 'Category')}><span>Category</span>${escapeHtml(formatInlineTitle(expense.category))}</div>
                            <div class="expense-field expense-red sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'amount', 'Amount')}><span>Amount</span>${escapeHtml(formatInlineMoney(expense.amount))}</div>
                            <div class="expense-field sp-inline-editable" ${inlineEditAttrs('expense', expense.id, 'date', 'Date')}><span>Date</span>${escapeHtml(formatDisplayDate(expense.date))}</div>
                            <div class="expense-field"><span>Receipt</span>${expense.receipt ? 'Attached' : 'None'}</div>
                        </div>
                        <div class="expense-actions">
                            ${expense.receipt ? `<button class="action-btn icon-btn" data-receipt-view="1" data-receipt="${escapeHtml(expense.id)}" data-receipt-type="expense" aria-label="View receipt" title="View receipt"><i class="ph ph-eye" aria-hidden="true"></i></button>` : ''}
                            <button class="action-btn icon-btn delete-btn" ${deleteRecordAttrs('expense', expense.id)} aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                `).join('');
            }
        }

        async function deleteExpense(id, silent = false) {
            if (!silent && guardTeamPermission('finance', 'delete expenses')) return;
            if (!silent && !confirm('Are you sure you want to delete this expense?')) {
                return;
            }
            const previousExpenses = expenses.slice();
            expenses = expenses.filter(e => !isSameRecordId(e.id, id)); // FIXED: delete works for Supabase UUID IDs.
            window.expenses = expenses;
            renderExpenses();
            try {
                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.deleteExpense === 'function') {
                        return window.SP.deleteExpense(id);
                    }
                    return saveUserData();
                }, {
                    successMessage: 'Expense deleted from the cloud.'
                });
                updateDashboard();
                updateReportStatistics();
            } catch (err) {
                expenses = previousExpenses;
                window.expenses = expenses;
                renderExpenses();
                updateDashboard();
                updateReportStatistics();
                toastError(getCloudFailureMessage(err?.syncResult, 'Expense deletion failed in the cloud. Your last change was undone.'));
            }
        }

        function editExpense(id) {
            if (guardTeamPermission('finance', 'edit expenses')) return;
            const expense = expenses.find(e => isSameRecordId(e.id, id)); // FIXED: edit works for UUID and legacy IDs.
            if (!expense) return;

            editingExpenseId = id;
            const saveBtn = document.getElementById('saveExpenseBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Update Expense';
            }
            document.getElementById('expenseDesc').value = expense.description;
            document.getElementById('expenseAmount').value = expense.amount;
            document.getElementById('expenseDate').value = expense.date;
            document.getElementById('expenseCategory').value = expense.category;
            setFinanceArtistSelectValue('expenseArtist', expense);

            const safeReceipt = normalizeSafeImageSource(expense.receipt);
            if (safeReceipt) {
                document.getElementById('receiptPreview').src = safeReceipt;
                document.getElementById('receiptPreview').style.display = 'block';
            }

            showAddExpense();
        }

        function viewReceipt(receiptData) {
            const safeReceipt = normalizeSafeImageSource(receiptData);
            if (!safeReceipt) {
                toastError('Receipt image is unavailable or unsafe.');
                return;
            }
            const modal = document.getElementById('receiptModal');
            const img = document.getElementById('receiptModalImage');
            img.src = safeReceipt;
            modal.style.display = 'flex';
        }

        function viewReceiptById(id, type) {
            let data;
            if (type === 'expense') {
                const item = expenses.find(e => String(e.id) === String(id));
                data = item?.receipt;
            } else if (type === 'otherIncome') {
                const item = otherIncome.find(i => String(i.id) === String(id));
                data = item?.proof;
            }
            if (data) viewReceipt(data);
        }

        if (!window.__spReceiptViewActionsBound) {
            window.__spReceiptViewActionsBound = true;
            document.addEventListener('click', (event) => {
                const button = event.target?.closest?.('[data-receipt-view][data-receipt]');
                if (!button) return;
                event.preventDefault();
                event.stopPropagation();
                const receiptType = button.dataset.receiptType === 'otherIncome' ? 'otherIncome' : 'expense';
                viewReceiptById(button.dataset.receipt, receiptType);
            });
        }

        function closeReceiptModal() {
            document.getElementById('receiptModal').style.display = 'none';
        }

        // Other Income Functions
        function showAddOtherIncome() {
            if (guardTeamPermission('finance', 'add other income')) return;
            // Ensure money section + otherIncome tab are active before showing form
            if (typeof showSection === 'function') showSection('otherIncome');
            if (typeof switchMoneyTab === 'function') switchMoneyTab('otherIncome');
            populateFinanceArtistDropdown(document.getElementById('otherIncomeArtist'));
            document.getElementById('addOtherIncomeForm').style.display = 'block';
            const listCard = document.getElementById('otherIncomeListCard');
            if (listCard) listCard.style.display = 'none';
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { document.getElementById('otherIncomeSource')?.focus(); }, 50);
        }

        function cancelOtherIncome() {
            document.getElementById('addOtherIncomeForm').style.display = 'none';
            clearOtherIncomeForm();
            editingOtherIncomeId = null;
            const saveBtn = document.getElementById('saveOtherIncomeBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Save Other Income';
            }
            const listCard = document.getElementById('otherIncomeListCard');
            if (listCard) {
                listCard.style.display = 'block';
            }
        }

        function clearOtherIncomeForm() {
            document.getElementById('otherIncomeSource').value = '';
            document.getElementById('otherIncomeAmount').value = '';
            document.getElementById('otherIncomeDate').value = '';
            const artistSelect = document.getElementById('otherIncomeArtist');
            if (artistSelect) artistSelect.value = '';
            document.getElementById('otherIncomeType').value = 'tips';
            document.getElementById('otherIncomePayer').value = '';
            document.getElementById('otherIncomeMethod').value = 'cash';
            document.getElementById('otherIncomeStatus').value = 'received';
            document.getElementById('otherIncomeNotes').value = '';
            document.getElementById('otherIncomeProof').value = '';
            document.getElementById('otherIncomeProofPreview').style.display = 'none';
            document.getElementById('otherIncomeProofPreview').src = '';
        }

        async function previewOtherIncomeProof(event) {
            const file = event.target.files[0];
            if (!file) return;
            const result = await readValidatedImageDataUrl(file, {
                label: 'Proof image',
                maxBytes: SP_RECEIPT_UPLOAD_MAX_BYTES
            });
            if (!result) return;
            const preview = document.getElementById('otherIncomeProofPreview');
            preview.src = result;
            preview.style.display = 'block';
        }

        async function saveOtherIncome() {
            if (guardTeamPermission('finance', 'save other income')) return;

            let previousOtherIncome = [];
            try {
                previousOtherIncome = otherIncome.slice();
                const proofSrc = normalizeSafeImageSource(document.getElementById('otherIncomeProofPreview').src) || null;
                const existingIncome = editingOtherIncomeId ? otherIncome.find(i => isSameRecordId(i.id, editingOtherIncomeId)) : null;
                const isEdit = Boolean(editingOtherIncomeId);
                let incomeItem = {
                    id: editingOtherIncomeId || Date.now(),
                    source: sanitizeTextInput(document.getElementById('otherIncomeSource').value),
                    amount: Math.round(Number(document.getElementById('otherIncomeAmount').value) || 0),
                    date: document.getElementById('otherIncomeDate').value,
                    type: sanitizeTextInput(document.getElementById('otherIncomeType').value),
                    payer: sanitizeTextInput(document.getElementById('otherIncomePayer').value),
                    method: sanitizeTextInput(document.getElementById('otherIncomeMethod').value),
                    status: sanitizeTextInput(document.getElementById('otherIncomeStatus').value),
                    notes: sanitizeTextInput(document.getElementById('otherIncomeNotes').value),
                    proof: proofSrc,
                    createdAt: existingIncome?.createdAt || Date.now()
                };
                incomeItem = applyFinanceArtistSelection(incomeItem, getFinanceArtistSelection('otherIncomeArtist'));

                if (!incomeItem.source || !incomeItem.amount || !incomeItem.date) {
                    toastError('Please fill in all required fields.');
                    return;
                }

                if (editingOtherIncomeId) {
                    const idx = otherIncome.findIndex(i => isSameRecordId(i.id, editingOtherIncomeId));
                    if (idx !== -1) {
                        otherIncome[idx] = incomeItem;
                    } else {
                        otherIncome.push(incomeItem);
                    }
                    editingOtherIncomeId = null;
                } else {
                    otherIncome.push(incomeItem);
                }

                const saveBtn = document.getElementById('saveOtherIncomeBtn');
                if (saveBtn) {
                    saveBtn.textContent = 'Save Other Income';
                }
                renderOtherIncome();
                cancelOtherIncome();
                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.saveOtherIncome === 'function') {
                        return window.SP.saveOtherIncome(otherIncome);
                    }
                    return saveUserData();
                }, {
                    successMessage: isEdit ? 'Other income updated in cloud.' : 'Other income saved to cloud.'
                });
                updateDashboard();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveOtherIncome failed:', err);
                otherIncome = previousOtherIncome;
                window.otherIncome = otherIncome;
                renderOtherIncome();
                updateDashboard();
                updateReportStatistics();
                toastError(getCloudFailureMessage(err?.syncResult, 'Other income could not be saved to the cloud. Your last change was undone.'));
            }
        }

        function renderOtherIncome() {
            const tbody = document.querySelector('#otherIncomeTable tbody');
            if (!tbody) return;

            const sortedOtherIncome = sortNewestFirst(ensureFinanceArtistRefs(otherIncome));

            if (sortedOtherIncome.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9">${emptyState({
                    icon: 'ph-plus-circle',
                    title: 'No other income yet',
                    sub: 'Log sponsorships, royalties, merch sales, and other revenue streams.',
                    ctaLabel: '+ Log Income',
                    ctaAction: 'showAddOtherIncome'
                })}</td></tr>`;
                const cards = document.getElementById('otherIncomeCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-plus-circle',
                    title: 'No other income yet',
                    sub: 'Log sponsorships, royalties, merch sales, and other revenue streams.',
                    ctaLabel: '+ Log Income',
                    ctaAction: 'showAddOtherIncome'
                });
                return;
            }

            tbody.innerHTML = sortedOtherIncome.map(item => {
                const statusClass = item.status === 'received' ? 'status-confirmed' : 'status-pending';
                return `
                    <tr class="other-income-edit-trigger" data-other-income-id="${escapeHtml(item.id)}">
                        <td class="sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'source', 'Source')}>${escapeHtml(item.source || '-')}</td>
                        <td>${escapeHtml(getFinanceArtistLabel(item))}</td>
                        <td class="sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'type', 'Type')}>${escapeHtml(formatInlineTitle(item.type))}</td>
                        <td class="income-green sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'amount', 'Amount')}>${escapeHtml(formatInlineMoney(item.amount))}</td>
                        <td class="sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'date', 'Date')}>${escapeHtml(formatDisplayDate(item.date))}</td>
                        <td class="sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'payer', 'Payer')}>${escapeHtml(item.payer || '-')}</td>
                        <td class="sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'method', 'Method')}>${escapeHtml(item.method ? item.method.toUpperCase() : '-')}</td>
                        <td><span class="status-badge ${statusClass} sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'status', 'Status')}>${escapeHtml(item.status || 'received')}</span></td>
                        <td>
                            ${item.proof ?
                                `<button class="action-btn icon-btn" data-receipt-view="1" data-receipt="${escapeHtml(item.id)}" data-receipt-type="otherIncome" aria-label="View proof" title="View proof"><i class="ph ph-eye" aria-hidden="true"></i></button>` :
                                '-'}
                        </td>
                    </tr>
                `;
            }).join('');

            const cards = document.getElementById('otherIncomeCards');
            if (cards) {
                cards.innerHTML = sortedOtherIncome.map(item => {
                    const statusClass = item.status === 'received' ? 'status-confirmed' : 'status-pending';
                    return `
                        <div class="expense-card card-animate other-income-edit-trigger" data-other-income-id="${escapeHtml(item.id)}">
                            <div class="booking-card-header">
                                <div class="booking-title sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'source', 'Source')}>${escapeHtml(item.source || '-')}</div>
                                <span class="status-badge ${statusClass} sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'status', 'Status')}>${escapeHtml(item.status || 'received')}</span>
                            </div>
                            <div class="expense-meta">
                                <div class="expense-field"><span>Artist</span>${escapeHtml(getFinanceArtistLabel(item))}</div>
                                <div class="expense-field sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'type', 'Type')}><span>Type</span>${escapeHtml(formatInlineTitle(item.type))}</div>
                                <div class="expense-field income-green sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'amount', 'Amount')}><span>Amount</span>${escapeHtml(formatInlineMoney(item.amount))}</div>
                                <div class="expense-field sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'date', 'Date')}><span>Date</span>${escapeHtml(formatDisplayDate(item.date))}</div>
                                <div class="expense-field sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'payer', 'Payer')}><span>Payer/Brand</span>${escapeHtml(item.payer || '-')}</div>
                                <div class="expense-field sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'method', 'Method')}><span>Method</span>${escapeHtml(item.method ? item.method.toUpperCase() : '-')}</div>
                                <div class="expense-field sp-inline-editable" ${inlineEditAttrs('otherIncome', item.id, 'notes', 'Notes')}><span>Notes</span>${escapeHtml(item.notes || 'None')}</div>
                            </div>
                            <div class="expense-actions">
                                ${item.proof ? `<button class="action-btn icon-btn" data-receipt-view="1" data-receipt="${escapeHtml(item.id)}" data-receipt-type="otherIncome" aria-label="View proof" title="View proof"><i class="ph ph-eye" aria-hidden="true"></i></button>` : ''}
                                <button class="action-btn icon-btn delete-btn" ${deleteRecordAttrs('otherIncome', item.id)} aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        async function deleteOtherIncome(id, silent = false) {
            if (!silent && guardTeamPermission('finance', 'delete other income')) return;
            if (!silent && !confirm('Are you sure you want to delete this entry?')) {
                return;
            }
            const previousOtherIncome = otherIncome.slice();
            otherIncome = otherIncome.filter(i => !isSameRecordId(i.id, id)); // FIXED: delete works for Supabase UUID IDs.
            window.otherIncome = otherIncome;
            renderOtherIncome();
            try {
                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.deleteOtherIncome === 'function') {
                        return window.SP.deleteOtherIncome(id);
                    }
                    return saveUserData();
                }, {
                    successMessage: 'Other income deleted from the cloud.'
                });
                updateDashboard();
                updateReportStatistics();
            } catch (err) {
                otherIncome = previousOtherIncome;
                window.otherIncome = otherIncome;
                renderOtherIncome();
                updateDashboard();
                updateReportStatistics();
                toastError(getCloudFailureMessage(err?.syncResult, 'Other income deletion failed in the cloud. Your last change was undone.'));
            }
        }

        function editOtherIncome(id) {
            if (guardTeamPermission('finance', 'edit other income')) return;
            const item = otherIncome.find(i => isSameRecordId(i.id, id)); // FIXED: edit works for UUID and legacy IDs.
            if (!item) return;

            editingOtherIncomeId = id;
            const saveBtn = document.getElementById('saveOtherIncomeBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Update Other Income';
            }
            document.getElementById('otherIncomeSource').value = item.source;
            document.getElementById('otherIncomeAmount').value = item.amount;
            document.getElementById('otherIncomeDate').value = item.date;
            document.getElementById('otherIncomeType').value = item.type;
            document.getElementById('otherIncomePayer').value = item.payer || '';
            document.getElementById('otherIncomeMethod').value = item.method || 'cash';
            document.getElementById('otherIncomeStatus').value = item.status || 'received';
            document.getElementById('otherIncomeNotes').value = item.notes || '';
            setFinanceArtistSelectValue('otherIncomeArtist', item);

            const safeProof = normalizeSafeImageSource(item.proof);
            if (safeProof) {
                document.getElementById('otherIncomeProofPreview').src = safeProof;
                document.getElementById('otherIncomeProofPreview').style.display = 'block';
            }

            showAddOtherIncome();
        }

        // Artists Functions
        function showAddArtistForm() {
            if (guardReadOnly('add artists')) return;
            // Ensure artists section is active before showing form
            if (typeof showSection === 'function') showSection('artists');
            editingArtistId = null;
            clearArtistForm();
            setArtistFormMode(false);
            document.getElementById('addArtistForm').style.display = 'block';
            const listCard = document.getElementById('artistsListCard');
            if (listCard) listCard.style.display = 'none';
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { document.getElementById('artistName')?.focus(); }, 50);
        }

        function setArtistFormMode(isEditing) {
            const titleEl = document.querySelector('#addArtistForm .section-title');
            const saveBtn = document.querySelector('#addArtistForm [data-action="saveArtist"]');
            if (titleEl) {
                titleEl.textContent = isEditing ? 'Edit Artist' : 'Add New Artist';
            }
            if (saveBtn) {
                saveBtn.textContent = isEditing ? 'Update Artist' : 'Save Artist';
            }
        }

        function showEditArtistForm(artistId) {
            const artist = artists.find((entry) => String(entry?.id || '') === String(artistId || ''));
            if (!artist) {
                toastError('Artist not found.');
                return;
            }

            editingArtistId = artist.id;
            setArtistFormMode(true);
            document.getElementById('artistName').value = artist.name || '';
            document.getElementById('artistEmail').value = artist.email || '';
            document.getElementById('artistPhone').value = artist.phone || '';
            document.getElementById('artistSpecialty').value = artist.specialty || '';
            document.getElementById('artistBio').value = artist.bio || '';
            document.getElementById('artistStrategicGoal').value = artist.strategicGoal || '';
            pendingArtistAvatarValue = '';
            updateArtistAvatarPreview(resolveDisplayArtistAvatar(artist));
            const avatarUpload = document.getElementById('artistAvatarUpload');
            if (avatarUpload) avatarUpload.value = '';

            document.getElementById('addArtistForm').style.display = 'block';
            const listCard = document.getElementById('artistsListCard');
            if (listCard) {
                listCard.style.display = 'none';
            }
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
                document.getElementById('artistName')?.focus();
            }, 50);
        }

        function cancelAddArtist() {
            document.getElementById('addArtistForm').style.display = 'none';
            editingArtistId = null;
            setArtistFormMode(false);
            clearArtistForm();
            const listCard = document.getElementById('artistsListCard');
            if (listCard) {
                listCard.style.display = 'block';
            }
        }

        function clearArtistForm() {
            document.getElementById('artistName').value = '';
            document.getElementById('artistEmail').value = '';
            document.getElementById('artistPhone').value = '';
            document.getElementById('artistSpecialty').value = '';
            document.getElementById('artistBio').value = '';
            document.getElementById('artistStrategicGoal').value = '';
            pendingArtistAvatarValue = '';
            updateArtistAvatarPreview('');
            const avatarUpload = document.getElementById('artistAvatarUpload');
            if (avatarUpload) avatarUpload.value = '';
        }

        function saveArtist() {
            if (guardReadOnly('save artists')) return;

            try {
                const artistName = sanitizeTextInput(document.getElementById('artistName').value);
                const artistEmail = sanitizeTextInput(document.getElementById('artistEmail').value);
                const artistPhone = sanitizeTextInput(document.getElementById('artistPhone').value);
                const artistSpecialty = sanitizeTextInput(document.getElementById('artistSpecialty').value);
                const artistBio = sanitizeTextInput(document.getElementById('artistBio').value);
                const artistStrategicGoal = sanitizeTextInput(document.getElementById('artistStrategicGoal').value);

                if (!artistName) {
                    toastError('Please enter the artist name.');
                    return;
                }

                if (!currentManagerId) {
                    toastError('Please sign in first.');
                    return;
                }

                const duplicateArtist = artists.find((artist) =>
                    String(artist?.name || '').trim().toLowerCase() === artistName.toLowerCase()
                    && String(artist?.id || '') !== String(editingArtistId || '')
                );
                if (duplicateArtist) {
                    toastError('An artist with that name already exists.');
                    return;
                }

                if (editingArtistId) {
                    const artistIndex = artists.findIndex((artist) => String(artist?.id || '') === String(editingArtistId));
                    if (artistIndex === -1) {
                        toastError('Artist not found.');
                        return;
                    }
                    const existingArtist = artists[artistIndex];
                    const previousName = existingArtist?.name || '';
                    artists[artistIndex] = {
                        ...existingArtist,
                        name: artistName,
                        email: artistEmail,
                        phone: artistPhone,
                        specialty: artistSpecialty,
                        bio: artistBio,
                        strategicGoal: artistStrategicGoal,
                        avatar: pendingArtistAvatarValue || normalizeSafeImageSource(existingArtist.avatar) || ''
                    };

                    if (previousName !== artistName) {
                        bookings = bookings.map((booking) => {
                            if (!booking || typeof booking !== 'object') return booking;
                            const sameArtistId = String(booking.artistId || '') === String(existingArtist.id || '');
                            const sameArtistName = String(booking.artist || '').trim().toLowerCase() === String(previousName || '').trim().toLowerCase();
                            if (!sameArtistId && !sameArtistName) return booking;
                            return {
                                ...booking,
                                artist: artistName,
                                artistId: existingArtist.id || booking.artistId || null
                            };
                        });
                        const renameFinanceRows = (rows) => (Array.isArray(rows) ? rows.map((entry) => {
                            if (!entry || typeof entry !== 'object') return entry;
                            const sameArtistId = String(entry.artistId || '') === String(existingArtist.id || '');
                            const sameArtistName = String(entry.artist || entry.artistName || '').trim().toLowerCase() === String(previousName || '').trim().toLowerCase();
                            if (!sameArtistId && !sameArtistName) return entry;
                            return {
                                ...entry,
                                artist: artistName,
                                artistId: existingArtist.id || entry.artistId || null
                            };
                        }) : []);
                        expenses = renameFinanceRows(expenses);
                        otherIncome = renameFinanceRows(otherIncome);
                        window.expenses = expenses;
                        window.otherIncome = otherIncome;
                        saveUserData();
                    }

                    Storage.saveSync('starPaperArtists', artists);
                    markSearchIndexDirty();
                    renderArtists();
                    populateArtistDropdown();
                    cancelAddArtist();
                    toastSuccess('Artist updated successfully!');
                    return;
                }

                artists.push({
                    id: createRuntimeId('artist', artistName),
                    name: artistName,
                    managerId: currentManagerId,
                    createdAt: new Date().toISOString(),
                    email: artistEmail,
                    phone: artistPhone,
                    specialty: artistSpecialty,
                    bio: artistBio,
                    strategicGoal: artistStrategicGoal,
                    avatar: pendingArtistAvatarValue || ''
                });

                Storage.saveSync('starPaperArtists', artists);
                markSearchIndexDirty();
                renderArtists();
                populateArtistDropdown();
                cancelAddArtist();
                toastSuccess('Artist added successfully!');
        
            } catch (err) {
                console.error('[StarPaper] saveArtist failed:', err);
                toastError('Something went wrong. Check the console for details.');
            }
        }

        function renderArtists() {
            const grid = document.getElementById('artistGrid');
            const artistList = getArtists();
            
            if (artistList.length === 0) {
                grid.innerHTML = emptyState({
                    icon: 'ph-microphone-stage',
                    title: 'No artists yet',
                    sub: 'Add your first artist to start tracking bookings and performance.',
                    ctaLabel: '+ Add Artist',
                    ctaAction: 'showAddArtistForm'
                });
                return;
            }

            grid.innerHTML = artistList.map((artist) => {
                const artistId = escapeHtml(artist.id || '');
                const artistName = escapeHtml(artist.name || 'Unknown Artist');
                const artistSpecialty = escapeHtml(artist.specialty || 'No specialty set');
                const artistBio = escapeHtml(artist.bio || 'No bio available');
                const artistGoal = escapeHtml(artist.strategicGoal || '');
                const artistEmail = escapeHtml(artist.email || '');
                const artistPhone = escapeHtml(artist.phone || '');
                const artistInitial = escapeHtml(String(artist.name || '?').charAt(0).toUpperCase());
                const artistAvatarSrc = escapeHtml(resolveDisplayArtistAvatar(artist));
                const artistAvatarMarkup = artistAvatarSrc
                    ? `<img class="artist-avatar-img" src="${artistAvatarSrc}" alt="${artistName} photo">`
                    : artistInitial;
                return `
                <div class="artist-card artist-card--editable" data-artist-id="${artistId}" data-artist-name="${artistName}" tabindex="0" role="button" aria-label="Edit ${artistName}">
                    <div class="artist-avatar">${artistAvatarMarkup}</div>
                    <h4 class="sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'name', 'Artist Name')}>${artistName}</h4>
                    <p class="artist-specialty sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'specialty', 'Specialty')}>${artistSpecialty}</p>
                    <p class="artist-bio sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'bio', 'Bio')}>${artistBio}</p>
                    <p class="artist-bio artist-bio--goal sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'strategicGoal', 'Strategic Goal')}>Goal: ${artistGoal || 'Set a strategic goal'}</p>
                    <div class="artist-contact">
                        <div class="sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'email', 'Email')}><i class="ph ph-envelope-simple" aria-hidden="true"></i> ${artistEmail || 'No email'}</div>
                        <div class="sp-inline-editable" ${inlineEditAttrs('artist', artist.id, 'phone', 'Phone')}><i class="ph ph-phone" aria-hidden="true"></i> ${artistPhone || 'No phone'}</div>
                    </div>
                    <button type="button" class="action-btn delete-btn artist-remove-btn" data-action="deleteArtistCard" data-artist-id="${artistId}">Remove Artist</button>
                </div>`;
            }).join('');
        }

        function deleteArtist(artistIdOrName) {
            if (guardReadOnly('remove artists')) return;
            const targetArtist = artists.find((artist) =>
                String(artist?.id || '') === String(artistIdOrName || '')
                || String(artist?.name || '') === String(artistIdOrName || '')
            );
            if (!targetArtist) {
                toastError('Artist not found.');
                return;
            }
            if (confirm(`Are you sure you want to remove ${targetArtist.name}?`)) {
                artists = artists.filter((artist) => String(artist?.id || '') !== String(targetArtist.id || ''));
                audienceMetrics = audienceMetrics.filter((entry) => {
                    const sameId = String(entry?.artistId || '') === String(targetArtist.id || '');
                    const sameName = String(entry?.artist || '').trim().toLowerCase() === String(targetArtist.name || '').trim().toLowerCase();
                    return !(sameId || sameName);
                });
                saveAudienceMetricsForScope(getActiveDataScopeKey(), audienceMetrics);
                window.audienceMetrics = audienceMetrics;
                Storage.saveSync('starPaperArtists', artists);
                if (window.SP?.deleteArtist) {
                    window.SP.deleteArtist(targetArtist.id).catch((err) => {
                        console.warn('Cloud delete artist failed:', err);
                    });
                }
                saveUserData();
                markSearchIndexDirty();
                renderArtists();
                populateArtistDropdown();
            }
        }

        function populateArtistDropdown() {
            const select = document.getElementById('bookingArtist');
            if (!select) {
                console.error('Booking artist select element not found!');
                return;
            }
            
            const artistList = getArtists();
            select.innerHTML = '<option value="">Select Artist</option>' + 
                artistList.map(artist => {
                    const name = escapeHtml(artist?.name || 'Artist');
                    return `<option value="${name}">${name}</option>`;
                }).join('');
            populateAudienceArtistDropdown();
            populateFinanceArtistDropdowns();
        }

        // Bookings Functions
        function calculateBalance() {
            const fee = Math.round(Number(document.getElementById('bookingFee').value) || 0);
            const deposit = Math.round(Number(document.getElementById('bookingDeposit').value) || 0);
            const balance = fee - deposit;
            document.getElementById('bookingBalance').value = balance;
        }

        function showAddBooking() {
            if (guardReadOnly('add bookings')) return;
            // Ensure schedule section + bookings tab are active before showing form
            if (typeof showSection === 'function') showSection('bookings');
            if (typeof activateScheduleTab === 'function') activateScheduleTab('bookings');
            document.getElementById('addBookingForm').style.display = 'block';
            const listCard = document.getElementById('bookingsListCard');
            if (listCard) listCard.style.display = 'none';
            (document.querySelector('.main-content') || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { document.getElementById('bookingEvent')?.focus(); }, 50);
        }

        function cancelBooking() {
            document.getElementById('addBookingForm').style.display = 'none';
            clearBookingForm();
            editingBookingId = null;
            const saveBtn = document.getElementById('saveBookingBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Save Booking';
            }
            const listCard = document.getElementById('bookingsListCard');
            if (listCard) {
                listCard.style.display = 'block';
            }
        }

        function clearBookingForm() {
            document.getElementById('bookingEvent').value = '';
            document.getElementById('bookingArtist').value = '';
            document.getElementById('bookingDate').value = '';
            document.getElementById('bookingFee').value = '';
            document.getElementById('bookingDeposit').value = '';
            document.getElementById('bookingBalance').value = '';
            document.getElementById('bookingCapacity').value = '';
            document.getElementById('bookingContact').value = '';
            document.getElementById('bookingStatus').value = 'confirmed';
            document.getElementById('bookingNotes').value = '';
            document.getElementById('bookingLocationType').value = 'uganda';
            updateLocationDropdown();
        }

        async function saveBooking() {
            if (guardReadOnly('save bookings')) return;

            let previousBookings = [];
            let previousArtists = [];
            let bookingSaved = false;
            try {
                previousBookings = bookings.slice();
                previousArtists = artists.slice();
                const locationType = document.getElementById('bookingLocationType').value;
                const location = locationType === 'uganda' 
                    ? document.getElementById('bookingUgandaLocation').value
                    : document.getElementById('bookingAbroadLocation').value;
                const feeValue = Math.round(Number(document.getElementById('bookingFee').value) || 0);
                const depositValue = Math.round(Number(document.getElementById('bookingDeposit').value) || 0);
                const capacityValue = Math.round(Number(document.getElementById('bookingCapacity').value) || 0);
                const balanceValue = feeValue - depositValue;
                const existingBooking = editingBookingId ? bookings.find(b => isSameRecordId(b.id, editingBookingId)) : null;

                const booking = {
                    id: editingBookingId || Date.now(),
                    event: sanitizeTextInput(document.getElementById('bookingEvent').value),
                    artist: sanitizeTextInput(document.getElementById('bookingArtist').value),
                    artistId: null,
                    date: document.getElementById('bookingDate').value,
                    capacity: capacityValue,
                    fee: feeValue,
                    deposit: depositValue,
                    balance: balanceValue,
                    contact: sanitizeTextInput(document.getElementById('bookingContact').value),
                    status: sanitizeTextInput(document.getElementById('bookingStatus').value),
                    notes: sanitizeTextInput(document.getElementById('bookingNotes').value),
                    locationType: sanitizeTextInput(locationType),
                    location: sanitizeTextInput(location),
                    createdAt: existingBooking?.createdAt || Date.now()
                };

                if (!booking.event || !booking.artist || !booking.date || !booking.fee) {
                    toastError('Please fill in all required fields.');
                    return;
                }

                const linkedArtist = ensureArtistForBookingName(booking.artist, currentManagerId);
                booking.artistId = linkedArtist?.id || booking.artistId;
                const artistsChanged = previousArtists.length !== artists.length || previousArtists.some((artist, index) => artist !== artists[index]);

                const isEdit = !!editingBookingId; // capture before it gets nulled
                if (editingBookingId) {
                    const idx = bookings.findIndex(b => isSameRecordId(b.id, editingBookingId));
                    if (idx !== -1) {
                        bookings[idx] = booking;
                    } else {
                        bookings.push(booking);
                    }
                    editingBookingId = null;
                } else {
                    bookings.push(booking);
                }
                const saveBtn = document.getElementById('saveBookingBtn');
                if (saveBtn) {
                    saveBtn.textContent = 'Save Booking';
                }
                // Optimistic UI: render list immediately so user sees result instantly
                renderBookings();
                cancelBooking();
                showSection('schedule');
                let artistSyncResult = { ok: true };
                if (artistsChanged) {
                    if (typeof window.SP?.saveArtists === 'function') {
                        artistSyncResult = await window.SP.saveArtists(artists);
                    } else {
                        artistSyncResult = await saveUserData();
                    }
                    const syncedArtist = typeof findArtistByName === 'function' ? findArtistByName(booking.artist) : null;
                    if (syncedArtist?.id) {
                        booking.artistId = syncedArtist.id;
                    }
                }

                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.saveBookings === 'function') {
                        return window.SP.saveBookings(bookings);
                    }
                    return saveUserData();
                }, {
                    suppressSuccessToast: true,
                    successMessage: isEdit ? 'Booking updated in cloud.' : 'Booking saved to cloud.'
                });
                bookingSaved = true;

                if (artistSyncResult && !(artistSyncResult.ok || artistSyncResult.cloudSynced)) {
                    toastWarn(`Booking saved to cloud, but artist sync needs attention. ${getCloudFailureMessage(artistSyncResult, 'Please retry artist sync.')}`);
                } else {
                    toastSuccess(isEdit ? 'Booking updated in cloud.' : 'Booking saved to cloud.');
                }
                if (booking.status === 'confirmed') triggerGoldDust();
                updateDashboard();
                renderCalendar();
                renderPerformanceMap();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveBooking failed:', err);
                if (!bookingSaved) {
                    bookings = previousBookings;
                    artists = previousArtists;
                    window.bookings = bookings;
                    window.artists = artists;
                    renderBookings();
                    if (typeof window.renderArtists === 'function') {
                        window.renderArtists();
                    }
                    updateDashboard();
                    renderCalendar();
                    renderPerformanceMap();
                    updateReportStatistics();
                    toastError(getCloudFailureMessage(err?.syncResult, 'Booking could not be saved to the cloud. Your last change was undone.'));
                }
            }
        }

        function getWeatherRenderKey(booking, index = 0) {
            const rawId = booking?.id;
            if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
                return String(rawId).replace(/[^a-zA-Z0-9_-]/g, '_');
            }
            const eventPart = String(booking?.event || 'booking')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 24) || 'booking';
            const datePart = String(booking?.date || '')
                .replace(/[^0-9]/g, '')
                .slice(0, 8) || 'nodate';
            return `${eventPart}-${datePart}-${index}`;
        }

        function renderBookings() {
            const tbody = document.querySelector('#bookingsTable tbody');
            const sortedBookings = sortNewestFirst(bookings);

            if (sortedBookings.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11">${emptyState({
                    icon: 'ph-calendar-check',
                    title: 'No bookings yet',
                    sub: 'Log your first show to start tracking fees, deposits, and balances.',
                    ctaLabel: '+ Add Booking',
                    ctaAction: 'showAddBooking'
                })}</td></tr>`;
                const cards = document.getElementById('bookingsCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-calendar-check',
                    title: 'No bookings yet',
                    sub: 'Log your first show to start tracking fees, deposits, and balances.',
                    ctaLabel: '+ Add Booking',
                    ctaAction: 'showAddBooking'
                });
                return;
            }

            const renderedBookings = sortedBookings.map((booking, index) => ({
                booking,
                weatherKey: getWeatherRenderKey(booking, index)
            }));
            tbody.innerHTML = renderedBookings.map(({ booking, weatherKey }) => `
                <tr class="booking-edit-trigger" data-booking-id="${escapeHtml(booking.id)}">
                    <td class="td-event sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'event', 'Event')}>${escapeHtml(booking.event || '-')}</td>
                    <td class="sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'artist', 'Artist')}>${escapeHtml(booking.artist || '-')}</td>
                    <td class="td-date sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'date', 'Date')}>${escapeHtml(formatDisplayDate(booking.date))}</td>
                    <td class="td-capacity sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'capacity', 'Capacity')}>${booking.capacity ? escapeHtml(Number(booking.capacity).toLocaleString()) : '-'}</td>
                    <td class="sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'location', 'Location')}>${escapeHtml(booking.location || '-')} ${booking.locationType === 'abroad' ? '<i class="ph ph-globe" aria-hidden="true"></i>' : 'UG'} <span class="show-weather-slot" id="bookingWeatherTable-${weatherKey}"></span></td>
                    <td class="income-green td-fee sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'fee', 'Total Fee')}>${escapeHtml(formatInlineMoney(booking.fee))}</td>
                    <td class="deposit-blue td-deposit sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'deposit', 'Deposit')}>${escapeHtml(formatInlineMoney(booking.deposit))}</td>
                    <td data-label="Balance Due" class="${booking.balance > 0 ? 'expense-red' : 'income-green'} td-balance">
                        ${escapeHtml(formatInlineMoney(booking.balance))}
                    </td>
                    <td class="td-contact sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'contact', 'Contact')}>${escapeHtml(booking.contact || '-')}</td>
                    <td data-label="Status" class="td-status">
                        <span class="status-badge status-${escapeHtml(booking.status)} sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'status', 'Status')}>
                            ${escapeHtml(formatInlineTitle(booking.status))}
                        </span>
                    </td>
                    <td class="notes-cell sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'notes', 'Notes')}>${escapeHtml(booking.notes || '-')}</td>
                </tr>
            `).join('');

            const cards = document.getElementById('bookingsCards');
            if (cards) {
                cards.innerHTML = renderedBookings.map(({ booking, weatherKey }) => `
                    <div class="booking-card card-animate booking-edit-trigger" data-booking-id="${escapeHtml(booking.id)}">
                        <div class="booking-card-header">
                            <div class="booking-title sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'event', 'Event')}>${escapeHtml(booking.event || '-')}</div>
                            <span class="status-badge status-${escapeHtml(booking.status)} sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'status', 'Status')}>
                                ${escapeHtml(formatInlineTitle(booking.status))}
                            </span>
                        </div>
                        <div class="booking-meta">
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'artist', 'Artist')}><span>Artist</span>${escapeHtml(booking.artist || '-')}</div>
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'date', 'Date')}><span>Date</span>${escapeHtml(formatDisplayDate(booking.date))}</div>
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'capacity', 'Capacity')}><span>Capacity</span>${booking.capacity ? escapeHtml(Number(booking.capacity).toLocaleString()) : '-'}</div>
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'location', 'Location')}><span>Location</span>${escapeHtml(booking.location || '-')} ${booking.locationType === 'abroad' ? '<i class="ph ph-globe" aria-hidden="true"></i>' : 'UG'} <span class="show-weather-slot" id="bookingWeatherCard-${weatherKey}"></span></div>
                            <div class="booking-field income-green sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'fee', 'Total Fee')}><span>Total Fee</span>${escapeHtml(formatInlineMoney(booking.fee))}</div>
                            <div class="booking-field deposit-blue sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'deposit', 'Deposit')}><span>Deposit</span>${escapeHtml(formatInlineMoney(booking.deposit))}</div>
                            <div class="booking-field ${booking.balance > 0 ? 'expense-red' : 'income-green'}"><span>Balance Due</span>${escapeHtml(formatInlineMoney(booking.balance))}</div>
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'contact', 'Contact')}><span>Contact</span>${escapeHtml(booking.contact || '-')}</div>
                            <div class="booking-field sp-inline-editable" ${inlineEditAttrs('booking', booking.id, 'notes', 'Notes')}><span>Notes</span>${escapeHtml(booking.notes || '-')}</div>
                        </div>
                        <div class="booking-actions">
                            <button class="action-btn icon-btn delete-btn" ${deleteRecordAttrs('booking', booking.id)} aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                `).join('');
            }

            renderedBookings.forEach(({ booking, weatherKey }) => {
                const locationLabel = booking?.location || '';
                const tableHolder = document.getElementById(`bookingWeatherTable-${weatherKey}`);
                const cardHolder = document.getElementById(`bookingWeatherCard-${weatherKey}`);
                if (tableHolder) {
                    tableHolder.innerHTML = renderWeatherIndicatorMarkup(
                        null,
                        String(locationLabel).trim() ? `Loading weather for ${locationLabel}` : 'Location missing'
                    );
                }
                if (cardHolder) {
                    cardHolder.innerHTML = renderWeatherIndicatorMarkup(
                        null,
                        String(locationLabel).trim() ? `Loading weather for ${locationLabel}` : 'Location missing'
                    );
                }
                if (!String(locationLabel).trim()) return;
                fetchWeatherSnapshot(locationLabel, booking.date).then((weather) => {
                    const markup = weather
                        ? renderWeatherIndicatorMarkup(weather)
                        : renderWeatherIndicatorMarkup(null, `Forecast unavailable for ${locationLabel}`);
                    if (tableHolder && tableHolder.isConnected) tableHolder.innerHTML = markup;
                    if (cardHolder && cardHolder.isConnected) cardHolder.innerHTML = markup;
                }).catch(() => {
                    const fallbackMarkup = renderWeatherIndicatorMarkup(null, `Forecast unavailable for ${locationLabel}`);
                    if (tableHolder && tableHolder.isConnected) tableHolder.innerHTML = fallbackMarkup;
                    if (cardHolder && cardHolder.isConnected) cardHolder.innerHTML = fallbackMarkup;
                });
            });
        }

        function updatePerformanceChart() {
            // Check if Chart.js is loaded
            if (typeof Chart === 'undefined') {
                if (typeof window.__spLoadDeferredLibrary === 'function') {
                    window.__spLoadDeferredLibrary('chart')
                        .then(() => updatePerformanceChart())
                        .catch((err) => console.warn('Chart.js deferred load failed:', err));
                    return;
                }
                console.warn('Chart.js is not loaded; skipping performance chart render.');
                return;
            }
            
            const ctx = document.getElementById('performanceChart');
            if (!ctx) {
                console.error('Performance chart canvas not found!');
                return;
            }
            
            // Get last 12 months of data (rolling)
            const monthlyIncome = new Array(12).fill(0);
            const monthlyExpenses = new Array(12).fill(0);
            const monthlyOtherIncome = new Array(12).fill(0);
            const monthLabels = [];
            
            const today = new Date();
            for (let i = 11; i >= 0; i--) {
                const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const monthName = date.toLocaleDateString('en', { month: 'short' });
                const year = String(date.getFullYear()).slice(-2);
                monthLabels.push(`${monthName}'${year}`);
            }
            
            bookings.forEach(booking => {
                const date = new Date(booking.date);
                const monthsDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
                if (monthsDiff >= 0 && monthsDiff < 12) {
                    monthlyIncome[11 - monthsDiff] += Math.round(Number(booking.fee) || 0);
                }
            });

            expenses.forEach(expense => {
                const date = new Date(expense.date);
                const monthsDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
                if (monthsDiff >= 0 && monthsDiff < 12) {
                    monthlyExpenses[11 - monthsDiff] += Math.round(Number(expense.amount) || 0);
                }
            });

            otherIncome.forEach(item => {
                const date = new Date(item.date);
                const monthsDiff = (today.getFullYear() - date.getFullYear()) * 12 + (today.getMonth() - date.getMonth());
                if (monthsDiff >= 0 && monthsDiff < 12) {
                    monthlyOtherIncome[11 - monthsDiff] += Math.round(Number(item.amount) || 0);
                }
            });
            
            if (window.performanceChart && typeof window.performanceChart.destroy === 'function') {
                window.performanceChart.destroy();
            }

            try {
                const isLightTheme = document.body.classList.contains('light-theme');
                const chartTheme = window.SP_CHART_THEME && typeof window.SP_CHART_THEME.get === 'function'
                    ? window.SP_CHART_THEME.get(isLightTheme ? 'light' : 'dark')
                    : null;
                const palette = chartTheme || {
                    legend: isLightTheme ? '#17130b' : '#f8eed2',
                    tooltipBg: isLightTheme ? 'rgba(255,250,239,0.98)' : 'rgba(13,14,18,0.96)',
                    tooltipBorder: isLightTheme ? 'rgba(184,137,47,0.64)' : 'rgba(212,168,67,0.58)',
                    tooltipTitle: isLightTheme ? '#8a6d1a' : '#f2cf75',
                    tooltipBody: isLightTheme ? '#17130b' : '#f8eed2',
                    yTick: isLightTheme ? '#665334' : '#b9aa83',
                    xTick: isLightTheme ? '#665334' : '#b9aa83',
                    yGrid: isLightTheme ? 'rgba(95,74,33,0.18)' : 'rgba(248,237,207,0.10)',
                    xGrid: isLightTheme ? 'rgba(95,74,33,0.12)' : 'rgba(248,237,207,0.08)',
                    pointBorder: isLightTheme ? '#fff9ed' : '#101116',
                    revenue: isLightTheme ? '#8a6d1a' : '#f2cf75',
                    revenueFill: isLightTheme ? 'rgba(184,137,47,0.18)' : 'rgba(212,168,67,0.18)',
                    other: isLightTheme ? '#52677f' : '#b8bdc7',
                    otherFill: isLightTheme ? 'rgba(82,103,127,0.14)' : 'rgba(184,189,199,0.12)',
                    expense: isLightTheme ? '#9a3412' : '#f59e72',
                    expenseFill: isLightTheme ? 'rgba(154,52,18,0.14)' : 'rgba(245,158,114,0.13)',
                    fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif"
                };
                palette.legend ??= palette.ink;
                palette.tooltipTitle ??= palette.goldBright;
                palette.tooltipBody ??= palette.ink;
                palette.yTick ??= palette.muted;
                palette.xTick ??= palette.muted;
                palette.yGrid ??= palette.grid;
                palette.xGrid ??= palette.grid;
                palette.pointBorder ??= palette.surface;
                palette.income = palette.revenue || palette.income;
                palette.incomeFill = palette.revenueFill || palette.incomeFill;

                window.performanceChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: monthLabels,
                        datasets: [
                            {
                                label: 'Income (UGX)',
                                data: monthlyIncome,
                                borderColor: palette.income,
                                backgroundColor: palette.incomeFill,
                                tension: 0.42,
                                fill: true,
                                borderWidth: 3,
                                pointRadius: 5,
                                pointBackgroundColor: palette.income,
                                pointBorderColor: palette.pointBorder,
                                pointBorderWidth: 2
                            },
                            {
                                label: 'Other Income (UGX)',
                                data: monthlyOtherIncome,
                                borderColor: palette.other,
                                backgroundColor: palette.otherFill,
                                tension: 0.42,
                                fill: true,
                                borderWidth: 3,
                                pointRadius: 5,
                                pointBackgroundColor: palette.other,
                                pointBorderColor: palette.pointBorder,
                                pointBorderWidth: 2
                            },
                            {
                                label: 'Expenses (UGX)',
                                data: monthlyExpenses,
                                borderColor: palette.expense,
                                backgroundColor: palette.expenseFill,
                                tension: 0.42,
                                fill: true,
                                borderWidth: 3,
                                pointRadius: 5,
                                pointBackgroundColor: palette.expense,
                                pointBorderColor: palette.pointBorder,
                                pointBorderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        },
                        plugins: {
                            legend: {
                                labels: { 
                                    color: palette.legend,
                                    font: { size: 13, weight: '700', family: palette.fontFamily },
                                    padding: 16,
                                    usePointStyle: true,
                                    pointStyle: 'rectRounded'
                                }
                            },
                            tooltip: {
                                backgroundColor: palette.tooltipBg,
                                borderColor: palette.tooltipBorder,
                                borderWidth: 1,
                                titleColor: palette.tooltipTitle,
                                bodyColor: palette.tooltipBody,
                                padding: 12,
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': UGX ' + context.parsed.y.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: { 
                                    color: palette.yTick,
                                    font: { weight: '700', family: palette.fontFamily },
                                    callback: function(value) {
                                        return 'UGX ' + (value / 1000000).toFixed(1) + 'M';
                                    }
                                },
                                grid: { color: palette.yGrid }
                            },
                            x: {
                                ticks: { 
                                    color: palette.xTick,
                                    font: { weight: '700', family: palette.fontFamily },
                                    maxRotation: 45,
                                    minRotation: 45
                                },
                                grid: { color: palette.xGrid }
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating performance chart:', error);
            }
        }

        function getAllBookings() {
            return Array.isArray(bookings) ? bookings.slice() : [];
        }

        function updateAvailabilityArtists() {
            const select = document.getElementById('availabilityArtist');
            if (!select) return;
            
            const artists = getArtists().map((artist) => artist.name);
            select.textContent = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select Artist';
            select.appendChild(placeholder);
            artists.forEach((artist) => {
                const option = document.createElement('option');
                option.value = String(artist || '');
                option.textContent = String(artist || '');
                select.appendChild(option);
            });
        }

        function checkAvailability() {
            const artistName = document.getElementById('availabilityArtist').value;
            const date = document.getElementById('availabilityDate').value;
            const resultDiv = document.getElementById('availabilityResult');

            if (!artistName || !date) {
                resultDiv.textContent = '';
                const message = document.createElement('p');
                message.style.color = '#ff9800';
                message.textContent = 'Please select both artist and date';
                resultDiv.appendChild(message);
                return;
            }

            // Get all bookings for all managers
            const allBookings = getAllBookings();

            // Check if artist has booking on that date
            const artistBookings = allBookings.filter(b => b.artist === artistName && b.date === date);

            if (artistBookings.length > 0) {
                resultDiv.textContent = '';
                const panel = document.createElement('div');
                panel.className = 'availability-result-panel availability-result-panel--blocked';
                const status = document.createElement('strong');
                status.className = 'availability-result-status availability-result-status--blocked';
                status.textContent = 'NOT AVAILABLE';
                const summary = document.createElement('p');
                summary.className = 'availability-result-summary';
                summary.textContent = `${artistName} is already booked on ${formatDisplayDate(date)}`;
                panel.append(status, summary);
                artistBookings.forEach((booking) => {
                    const item = document.createElement('div');
                    item.className = 'availability-result-booking';
                    const eventLine = document.createElement('div');
                    const eventName = document.createElement('strong');
                    eventName.textContent = booking.event || 'Untitled booking';
                    eventLine.appendChild(eventName);
                    const locationLine = document.createElement('div');
                    locationLine.className = 'availability-result-location';
                    locationLine.textContent = booking.location
                        ? `${booking.location} ${booking.locationType === 'abroad' ? '(Abroad)' : '(Uganda)'}`
                        : 'Location not set';
                    item.append(eventLine, locationLine);
                    panel.appendChild(item);
                });
                resultDiv.appendChild(panel);
            } else {
                resultDiv.textContent = '';
                const panel = document.createElement('div');
                panel.className = 'availability-result-panel availability-result-panel--available';
                const status = document.createElement('strong');
                status.className = 'availability-result-status availability-result-status--available';
                status.textContent = 'AVAILABLE';
                const summary = document.createElement('p');
                summary.className = 'availability-result-summary';
                summary.textContent = `${artistName} is free on ${formatDisplayDate(date)}`;
                const bookButton = document.createElement('button');
                bookButton.className = 'add-btn availability-result-book-button';
                bookButton.type = 'button';
                bookButton.dataset.availabilityBook = '1';
                bookButton.textContent = 'Book Now';
                bookButton.addEventListener('click', () => bookArtistFromAvailability(artistName, date));
                panel.append(status, summary, bookButton);
                resultDiv.appendChild(panel);
            }
        }

        function bookArtistFromAvailability(artistName, date) {
            openBookingFormWithPrefill({ artistName, date });
        }

        function updateReportsSection() {
            handleReportPeriodChange();
        }

        function editBooking(id) {
            if (guardReadOnly('edit bookings')) return;
            const booking = bookings.find(b => isSameRecordId(b.id, id)); // FIXED: edit works for UUID and legacy IDs.
            if (!booking) return;

            editingBookingId = id;
            const saveBtn = document.getElementById('saveBookingBtn');
            if (saveBtn) {
                saveBtn.textContent = 'Update Booking';
            }
            document.getElementById('bookingEvent').value = booking.event;
            document.getElementById('bookingArtist').value = booking.artist;
            document.getElementById('bookingDate').value = booking.date;
            document.getElementById('bookingFee').value = booking.fee;
            document.getElementById('bookingDeposit').value = booking.deposit;
            document.getElementById('bookingBalance').value = booking.balance;
            document.getElementById('bookingCapacity').value = booking.capacity || '';
            document.getElementById('bookingContact').value = booking.contact;
            document.getElementById('bookingStatus').value = booking.status;
            document.getElementById('bookingNotes').value = booking.notes;
            
            // Set location fields
            document.getElementById('bookingLocationType').value = booking.locationType || 'uganda';
            updateLocationDropdown();
            if (booking.locationType === 'abroad') {
                document.getElementById('bookingAbroadLocation').value = booking.location || '';
            } else {
                document.getElementById('bookingUgandaLocation').value = booking.location || '';
            }

            showAddBooking();
        }

        // Custom delete confirmation — avoids browser confirm() dialog
        function confirmDeleteBooking(id) {
            const modal = document.getElementById('confirmDeleteModal');
            const body  = document.getElementById('confirmDeleteBody');
            const booking = bookings.find(b => isSameRecordId(b.id, id));
            body.textContent = booking
                ? `Delete "${booking.event}"? This cannot be undone.`
                : 'This action cannot be undone.';
            modal.style.display = 'flex';
            document.getElementById('confirmDeleteYes').onclick = function() {
                modal.style.display = 'none';
                deleteBooking(id, true);
            };
            document.getElementById('confirmDeleteNo').onclick = function() {
                modal.style.display = 'none';
            };
        }

        async function deleteBooking(id, silent = false) {
            if (guardReadOnly('delete bookings')) return;
            if (!silent && !confirm('Are you sure you want to delete this booking?')) return;
            const previousBookings = bookings.slice();
            bookings = bookings.filter(b => !isSameRecordId(b.id, id)); // FIXED: delete works for Supabase UUID IDs.
            window.bookings = bookings;
            renderBookings();
            try {
                await persistMutationWithCloudFeedback(() => {
                    if (typeof window.SP?.deleteBooking === 'function') {
                        return window.SP.deleteBooking(id);
                    }
                    return saveUserData();
                }, {
                    successMessage: 'Booking deleted from the cloud.'
                });
                updateDashboard();
                renderCalendar();
                updateReportStatistics();
            } catch (err) {
                bookings = previousBookings;
                window.bookings = bookings;
                renderBookings();
                updateDashboard();
                renderCalendar();
                updateReportStatistics();
                toastError(getCloudFailureMessage(err?.syncResult, 'Booking deletion failed in the cloud. Your last change was undone.'));
            }
        }

        function getCurrentMonthData() {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const parseValidDate = (value) => {
                if (!value) return null;
                const date = new Date(value);
                return Number.isNaN(date.getTime()) ? null : date;
            };

            const isCurrentMonthDate = (value) => {
                const date = parseValidDate(value);
                if (!date) return false;
                return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            };

            const asAmount = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.round(parsed) : 0;
            };

            const isConfirmedBooking = (booking) => String(booking?.status || '').toLowerCase() === 'confirmed';
            const isUpcomingStatus = (booking) => {
                const status = String(booking?.status || '').toLowerCase();
                return status === 'confirmed' || status === 'pending';
            };

            const monthBookings = bookings.filter((booking) => isCurrentMonthDate(booking.date));
            const monthConfirmedBookings = monthBookings.filter(isConfirmedBooking);
            const monthOtherIncome = otherIncome.filter((entry) =>
                isCurrentMonthDate(entry.date) && String(entry?.status || '').toLowerCase() === 'received'
            );
            const monthExpenses = expenses.filter((entry) => isCurrentMonthDate(entry.date));

            const depositsReceived = monthConfirmedBookings.reduce((sum, booking) => sum + asAmount(booking.deposit), 0);
            const balancesReceived = monthConfirmedBookings.reduce((sum, booking) => {
                const feeValue = asAmount(booking.fee);
                const depositValue = asAmount(booking.deposit);
                const balanceOutstanding = asAmount(booking.balance);
                const collectedBeyondDeposit = feeValue - depositValue - balanceOutstanding;
                return sum + (collectedBeyondDeposit > 0 ? collectedBeyondDeposit : 0);
            }, 0);
            const balancesDue = monthConfirmedBookings.reduce((sum, booking) => {
                const balanceValue = asAmount(booking.balance);
                return sum + (balanceValue > 0 ? balanceValue : 0);
            }, 0);
            const otherIncomeTotal = monthOtherIncome.reduce((sum, entry) => sum + asAmount(entry.amount), 0);
            const expensesTotal = monthExpenses.reduce((sum, entry) => sum + asAmount(entry.amount), 0);
            const totalIncome = depositsReceived + balancesReceived + otherIncomeTotal;
            const netProfit = totalIncome - expensesTotal;
            const cashAtHand = (depositsReceived + otherIncomeTotal) - expensesTotal;
            const upcomingShows = monthBookings.filter((booking) => {
                const bookingDate = parseValidDate(booking.date);
                return bookingDate && bookingDate >= now && isUpcomingStatus(booking);
            }).length;
            const activeArtists = new Set(
                monthBookings
                    .map((booking) => String(booking?.artist || '').trim())
                    .filter(Boolean)
            ).size;

            return {
                totalIncome,
                depositsReceived,
                balancesReceived,
                balancesDue,
                otherIncome: otherIncomeTotal,
                expenses: expensesTotal,
                netProfit,
                cashAtHand,
                upcomingShows,
                activeArtists
            };
        }

        function getRangeMetrics(startDate, endDateExclusive) {
            const start = startDate instanceof Date ? startDate : new Date(startDate);
            const end = endDateExclusive instanceof Date ? endDateExclusive : new Date(endDateExclusive);
            const asAmount = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.round(parsed) : 0;
            };
            const inRange = (value) => {
                if (!value) return false;
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) return false;
                return date >= start && date < end;
            };
            const isConfirmedBooking = (booking) => String(booking?.status || '').toLowerCase() === 'confirmed';

            const rangeBookings = bookings.filter((booking) => isConfirmedBooking(booking) && inRange(booking.date));
            const rangeOtherIncome = otherIncome.filter((entry) => inRange(entry.date));
            const rangeExpenses = expenses.filter((entry) => inRange(entry.date));

            const showIncome = rangeBookings.reduce((sum, booking) => sum + asAmount(booking.fee), 0);
            const deposits = rangeBookings.reduce((sum, booking) => sum + asAmount(booking.deposit), 0);
            const other = rangeOtherIncome.reduce((sum, entry) => sum + asAmount(entry.amount), 0);
            const expenseTotal = rangeExpenses.reduce((sum, entry) => sum + asAmount(entry.amount), 0);
            const totalIncome = showIncome + other;
            const net = totalIncome - expenseTotal;

            return {
                showIncome,
                deposits,
                otherIncome: other,
                expenses: expenseTotal,
                totalIncome,
                net
            };
        }

        function setMetricTone(el, positive) {
            if (!el) return;
            el.classList.remove('income-green', 'deposit-blue', 'expense-red', 'profit-blue');
            el.classList.add(positive ? 'income-green' : 'expense-red');
        }

        function updateMainstage(monthData) {
            const now = new Date();
            const nowTs = now.getTime();
            const sevenDaysAhead = new Date(nowTs + (7 * 24 * 60 * 60 * 1000));
            const asAmount = (value) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.round(parsed) : 0;
            };
            const isConfirmedBooking = (booking) => String(booking?.status || '').toLowerCase() === 'confirmed';
            const withPositiveBalance = (booking) => {
                const feeValue = asAmount(booking?.fee);
                const depositValue = asAmount(booking?.deposit);
                return (feeValue - depositValue) > 0;
            };
            const bookingDate = (booking) => {
                const parsed = new Date(booking?.date || '');
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            };

            const upcoming7 = bookings.filter((booking) => {
                if (!isConfirmedBooking(booking)) return false;
                const date = bookingDate(booking);
                return date && date >= now && date <= sevenDaysAhead;
            }).length;

            const depositsPending = bookings.filter((booking) => isConfirmedBooking(booking) && withPositiveBalance(booking)).length;
            const balanceAlerts = bookings.filter((booking) => withPositiveBalance(booking)).length;
            const overdueBalances = bookings.filter((booking) => {
                if (!withPositiveBalance(booking)) return false;
                const date = bookingDate(booking);
                return date && date < now;
            }).length;

            const updatedEl = document.getElementById('mainstageLiveDate');
            const upcomingEl = document.getElementById('mainstageUpcomingCount');
            const pendingEl = document.getElementById('mainstageDepositPending');
            const alertsEl = document.getElementById('mainstageBalanceAlerts');
            const overdueEl = document.getElementById('mainstageOverdueCount');

            if (updatedEl) updatedEl.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            if (upcomingEl) upcomingEl.textContent = String(upcoming7);
            if (pendingEl) pendingEl.textContent = String(depositsPending);
            if (alertsEl) alertsEl.textContent = String(balanceAlerts);
            if (overdueEl) overdueEl.textContent = String(overdueBalances);

            const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const currentMetrics = getRangeMetrics(currentStart, nextStart);
            const previousMetrics = getRangeMetrics(previousStart, currentStart);
            const formatCurrency = (value) => formatCurrencyDisplay(value);
            const formatPercent = (value) => `${Math.round(value)}%`;

            const revenuePaceEl = document.getElementById('mainstageRevenuePace');
            const revenueHintEl = document.getElementById('mainstageRevenuePaceHint');
            const collectionsEl = document.getElementById('mainstageCollectionsHealth');
            const collectionsHintEl = document.getElementById('mainstageCollectionsHint');
            const burnEl = document.getElementById('mainstageBurnRate');
            const burnHintEl = document.getElementById('mainstageBurnHint');
            const profitEl = document.getElementById('mainstageProfitTrend');
            const profitHintEl = document.getElementById('mainstageProfitHint');

            const revenueDelta = currentMetrics.totalIncome - previousMetrics.totalIncome;
            const collectionRate = currentMetrics.showIncome > 0 ? (currentMetrics.deposits / currentMetrics.showIncome) * 100 : 0;
            const burnRate = currentMetrics.totalIncome > 0 ? (currentMetrics.expenses / currentMetrics.totalIncome) * 100 : 0;
            const profitDelta = currentMetrics.net - previousMetrics.net;

            if (revenuePaceEl) revenuePaceEl.textContent = formatCurrency(currentMetrics.totalIncome);
            if (revenueHintEl) revenueHintEl.textContent = `${revenueDelta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(revenueDelta))} vs previous month`;
            if (collectionsEl) collectionsEl.textContent = formatPercent(collectionRate);
            if (collectionsHintEl) collectionsHintEl.textContent = `${formatCurrency(currentMetrics.deposits)} collected from bookings`;
            if (burnEl) burnEl.textContent = formatPercent(burnRate);
            if (burnHintEl) burnHintEl.textContent = `${formatCurrency(currentMetrics.expenses)} spent this month`;
            if (profitEl) profitEl.textContent = formatCurrency(currentMetrics.net);
            if (profitHintEl) profitHintEl.textContent = `${profitDelta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(profitDelta))} vs previous month`;

            setMetricTone(revenuePaceEl, revenueDelta >= 0);
            setMetricTone(collectionsEl, collectionRate >= 55);
            setMetricTone(burnEl, burnRate <= 60);
            setMetricTone(profitEl, currentMetrics.net >= 0);
        }

        // Dashboard Functions
        function shouldLoadDashboardWeather() {
            return window.innerWidth > 1024;
        }

        function getDashboardShowDateKey(value) {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '';
            return date.toISOString().slice(0, 10);
        }

        function isWithinSevenDays(value) {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return false;
            const now = new Date();
            const diffMs = date.getTime() - now.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 7;
        }

        async function fetchGeoCoordinates(locationLabel) {
            const normalized = String(locationLabel || '').trim().toLowerCase();
            if (!normalized) return null;
            if (dashboardWeatherCache.geocode.has(normalized)) {
                return dashboardWeatherCache.geocode.get(normalized);
            }
            try {
                const query = encodeURIComponent(String(locationLabel).trim());
                const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=en&format=json`);
                if (!response.ok) {
                    dashboardWeatherCache.geocode.set(normalized, null);
                    return null;
                }
                const payload = await response.json();
                const first = payload?.results?.[0];
                if (!first || !Number.isFinite(first.latitude) || !Number.isFinite(first.longitude)) {
                    dashboardWeatherCache.geocode.set(normalized, null);
                    return null;
                }
                const coordinates = { latitude: first.latitude, longitude: first.longitude };
                dashboardWeatherCache.geocode.set(normalized, coordinates);
                return coordinates;
            } catch (_error) {
                dashboardWeatherCache.geocode.set(normalized, null);
                return null;
            }
        }

        async function fetchWeatherSnapshot(locationLabel, bookingDate) {
            const dayKey = getDashboardShowDateKey(bookingDate);
            if (!dayKey) return null;
            const geo = await fetchGeoCoordinates(locationLabel);
            if (!geo) return null;
            const forecastKey = `${geo.latitude},${geo.longitude},${dayKey}`;
            if (dashboardWeatherCache.forecast.has(forecastKey)) {
                return dashboardWeatherCache.forecast.get(forecastKey);
            }
            try {
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&start_date=${dayKey}&end_date=${dayKey}`);
                if (!response.ok) {
                    dashboardWeatherCache.forecast.set(forecastKey, null);
                    return null;
                }
                const payload = await response.json();
                const tempMax = payload?.daily?.temperature_2m_max?.[0];
                const rainChance = payload?.daily?.precipitation_probability_max?.[0];
                if (!Number.isFinite(tempMax) && !Number.isFinite(rainChance)) {
                    dashboardWeatherCache.forecast.set(forecastKey, null);
                    return null;
                }
                const snapshot = {
                    temperature: Number.isFinite(tempMax) ? Math.round(tempMax) : null,
                    rainChance: Number.isFinite(rainChance) ? Math.round(rainChance) : null
                };
                dashboardWeatherCache.forecast.set(forecastKey, snapshot);
                return snapshot;
            } catch (_error) {
                dashboardWeatherCache.forecast.set(forecastKey, null);
                return null;
            }
        }

        function renderWeatherIndicatorMarkup(weather, fallbackTooltip = 'Forecast unavailable for this date') {
            if (!weather) {
                const tooltip = fallbackTooltip || 'Forecast unavailable for this date';
                return `<span class="show-weather-indicator is-fallback" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}"><i class="ph ph-cloud" aria-hidden="true"></i></span>`;
            }
            const rain = Number.isFinite(weather.rainChance) ? weather.rainChance : null;
            const icon = rain !== null && rain >= 45 ? '<i class="ph ph-cloud-rain" aria-hidden="true"></i>' : '<i class="ph ph-cloud" aria-hidden="true"></i>';
            const tempText = Number.isFinite(weather.temperature) ? `${weather.temperature} C` : 'N/A';
            const rainText = rain !== null ? `${rain}%` : 'N/A';
            const tooltip = `Temp: ${tempText} | Rain chance: ${rainText}`;
            return `<span class="show-weather-indicator" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">${icon}</span>`;
        }

        function hydrateUpcomingShowsWeather(upcomingShows) {
            upcomingShows.forEach((entry, index) => {
                const booking = entry?.booking || entry;
                const renderKey = entry?.renderKey || getWeatherRenderKey(booking, index);
                const holder = document.getElementById(`weatherIndicator-${renderKey}`);
                if (!holder) return;
                const locationLabel = booking?.location || '';
                if (!String(locationLabel).trim()) {
                    holder.innerHTML = renderWeatherIndicatorMarkup(null, 'Location missing');
                    return;
                }
                holder.innerHTML = renderWeatherIndicatorMarkup(null, `Loading weather for ${locationLabel}`);
                fetchWeatherSnapshot(locationLabel, booking.date).then((weather) => {
                    if (!holder.isConnected) return;
                    holder.innerHTML = weather
                        ? renderWeatherIndicatorMarkup(weather)
                        : renderWeatherIndicatorMarkup(null, `Forecast unavailable for ${locationLabel}`);
                }).catch(() => {
                    if (!holder.isConnected) return;
                    holder.innerHTML = renderWeatherIndicatorMarkup(null, `Forecast unavailable for ${locationLabel}`);
                });
            });
        }

        // Dashboard: Upcoming Shows section
        function renderDashboardUpcomingShows(limit = 7) {
            const list = document.getElementById('dashboardUpcomingList');
            if (!list) return;

            const now = new Date();
            const upcoming = bookings
                .filter((booking) => {
                    const status = String(booking?.status || '').toLowerCase();
                    const date = new Date(booking?.date || '');
                    return (status === 'confirmed' || status === 'pending') && !Number.isNaN(date.getTime()) && date >= now;
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            if (!upcoming.length) {
                list.innerHTML = '<p class="sp-list-empty-note">No upcoming confirmed shows.</p>';
                return;
            }

            const upcomingSlice = upcoming.slice(0, limit);
            const renderedUpcoming = upcomingSlice.map((booking, index) => ({
                booking,
                renderKey: getWeatherRenderKey(booking, index)
            }));
            list.innerHTML = renderedUpcoming.map(({ booking, renderKey }) => {
                const status = String(booking?.status || 'pending').toLowerCase();
                const statusClass = status === 'confirmed' ? 'status-confirmed' : 'status-pending';
                const weatherHolder = `<span class="show-weather-slot" id="weatherIndicator-${renderKey}"></span>`;
                const eventLabel = escapeHtml(booking.event || 'Untitled Event');
                const locationLabel = escapeHtml(booking.location || 'Venue TBC');
                const artistLabel = escapeHtml(booking.artist || 'Artist');
                return `
                <div class="timeline-item dashboard-stream-item dashboard-upcoming-item">
                    <div class="timeline-meta">
                        <div class="timeline-title">${eventLabel} ${weatherHolder}</div>
                        <div class="timeline-sub">${escapeHtml(formatDisplayDate(booking.date))}  -  ${locationLabel}  -  ${artistLabel}</div>
                    </div>
                    <div class="timeline-amount">
                        <span class="booking-status-pill ${statusClass}">${escapeHtml(status.toUpperCase())}</span>
                        <span class="timeline-fee income-green">UGX ${(Math.round(Number(booking.fee) || 0)).toLocaleString()}</span>
                    </div>
                </div>
                `;
            }).join('');
            hydrateUpcomingShowsWeather(renderedUpcoming);
        }

        // Dashboard: Recent Activity section
        function renderDashboardActivityFeed(limit = 7) {
            const list = document.getElementById('dashboardActivityFeed');
            if (!list) return;

            const items = [];

            bookings.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit).forEach((booking) => {
                const status = String(booking?.status || 'pending').toLowerCase();
                const statusClass = status === 'confirmed' ? 'status-confirmed' : 'status-pending';
                items.push({
                    date: booking.date,
                    title: `Booking: ${booking.event || 'Show'}`,
                    sub: `${booking.artist || 'Artist'}  -  ${booking.location || 'Venue TBC'}`,
                    type: 'booking',
                    badge: (booking.status || 'pending').toUpperCase(),
                    badgeClass: statusClass,
                    amountLabel: `UGX ${(Math.round(Number(booking.fee) || 0)).toLocaleString()}`,
                    amountClass: 'income-green'
                });
            });

            bookings
                .filter((booking) => (Math.round(Number(booking.deposit) || 0)) > 0)
                .slice()
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, limit)
                .forEach((booking) => {
                    items.push({
                        date: booking.date,
                        title: `Payment Update: ${booking.event || 'Show'}`,
                        sub: `${booking.artist || 'Artist'}  -  Deposit logged`,
                        type: 'payment',
                        badge: 'DEPOSIT',
                        badgeClass: 'status-confirmed',
                        amountLabel: `UGX ${(Math.round(Number(booking.deposit) || 0)).toLocaleString()}`,
                        amountClass: 'deposit-blue'
                    });
                });

            const sorted = items
                .filter(item => item.date && !Number.isNaN(new Date(item.date).getTime()))
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, limit);

            if (!sorted.length) {
                list.innerHTML = emptyState({
                    icon: 'ph-clipboard-text',
                    title: 'No recent activity',
                    sub: 'Your bookings, expenses, and income will appear here as you add them.',
                });
                return;
            }

            list.innerHTML = sorted.map((item) => {
                const relTime = item.createdAt ? timeAgo(item.createdAt) : '';
                const timeLabel = relTime ? `<span class="activity-time-ago">${relTime}</span>` : '';
                return `
                <div class="timeline-item dashboard-stream-item dashboard-upcoming-item dashboard-activity-item ${escapeHtml(item.type)}">
                    <div class="timeline-meta">
                        <div class="timeline-title">${escapeHtml(item.title)} ${timeLabel}</div>
                        <div class="timeline-sub">${escapeHtml(formatDisplayDate(item.date))}  -  ${escapeHtml(item.sub)}</div>
                    </div>
                    <div class="timeline-amount">
                        <span class="booking-status-pill ${escapeHtml(item.badgeClass)}">${escapeHtml(item.badge)}</span>
                        <span class="timeline-fee ${escapeHtml(item.amountClass)}">${escapeHtml(item.amountLabel)}</span>
                    </div>
                </div>`;
            }).join('');
        }

        function updateDashboard() {
            const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
            const formatCurrency = (value) => `UGX ${value.toLocaleString()}`;
            const monthData = getCurrentMonthData();

            const financialHeadingEl = document.getElementById('dashboardFinancialHeading');
            const totalIncomeEl = document.getElementById('totalIncome');
            const dashboardDepositsReceivedEl = document.getElementById('dashboardDepositsReceived');
            const otherIncomeTotalEl = document.getElementById('otherIncomeTotal');
            const depositsReceivedEl = document.getElementById('depositsReceived');
            const balancesOverdueEl = document.getElementById('balancesOverdue');
            const upcomingShowsEl = document.getElementById('upcomingShows');
            const dashboardExpensesEl = document.getElementById('dashboardExpenses');
            const dashboardCashAtHandEl = document.getElementById('dashboardCashAtHand');
            const financialsExpensesEl = document.getElementById('financialsExpenses');
            const financialsCashAtHandEl = document.getElementById('financialsCashAtHand');
            const financialsBalancesDueEl = document.getElementById('financialsBalancesDue');
            const activeArtistsCountEl = document.getElementById('activeArtistsCount');
            const dashboardBBFEl = document.getElementById('dashboardBBF');
            const bbfMonthLabelEl = document.getElementById('bbfMonthLabel');
            const bbfContext = getActiveBBFContext();

            if (financialHeadingEl) financialHeadingEl.textContent = `${monthLabel} Financials`;
            if (totalIncomeEl) countUp(totalIncomeEl, monthData.totalIncome);
            if (dashboardDepositsReceivedEl) countUp(dashboardDepositsReceivedEl, monthData.depositsReceived);
            if (otherIncomeTotalEl) countUp(otherIncomeTotalEl, monthData.otherIncome);
            if (depositsReceivedEl) countUp(depositsReceivedEl, monthData.depositsReceived);
            if (balancesOverdueEl) countUp(balancesOverdueEl, monthData.balancesDue);
            if (upcomingShowsEl) { upcomingShowsEl.querySelector?.('.sp-skeleton')?.remove(); upcomingShowsEl.textContent = monthData.upcomingShows; }
            if (dashboardExpensesEl) countUp(dashboardExpensesEl, monthData.expenses);
            if (dashboardCashAtHandEl) countUp(dashboardCashAtHandEl, monthData.netProfit);
            if (financialsExpensesEl) countUp(financialsExpensesEl, monthData.expenses);
            if (financialsCashAtHandEl) countUp(financialsCashAtHandEl, monthData.netProfit);
            if (financialsBalancesDueEl) countUp(financialsBalancesDueEl, monthData.balancesDue);
            if (activeArtistsCountEl) { activeArtistsCountEl.querySelector?.('.sp-skeleton')?.remove(); activeArtistsCountEl.textContent = String(monthData.activeArtists); }
            if (dashboardBBFEl) {
                applyInlineEditMetadata(dashboardBBFEl, 'bbf', 'current', 'amount', 'Balance Brought Forward');
                countUp(dashboardBBFEl, bbfContext.amount);
                dashboardBBFEl.title = `Click to edit BBF for ${bbfContext.periodLabel}${bbfContext.artist?.name ? ` (${bbfContext.artist.name})` : ''}`;
            }
            if (bbfMonthLabelEl) {
                bbfMonthLabelEl.textContent = `(from ${bbfContext.sourcePeriodLabel})`;
                bbfMonthLabelEl.title = `Applied to ${bbfContext.periodLabel}`;
            }
            setMetricTone(dashboardCashAtHandEl, monthData.netProfit >= 0);
            setMetricTone(financialsCashAtHandEl, monthData.netProfit >= 0);
            setMetricTone(balancesOverdueEl, monthData.balancesDue <= 0);
            setMetricTone(financialsBalancesDueEl, monthData.balancesDue <= 0);

            const monthlyGoal = getCurrentMonthlyRevenueGoal();
            const currentRevenue = monthData.totalIncome;
            const goalPercentRaw = monthlyGoal > 0 ? (currentRevenue / monthlyGoal) * 100 : 0;
            const goalPercent = Number.isFinite(goalPercentRaw) ? Math.max(0, Math.round(goalPercentRaw)) : 0;
            const progressWidth = Math.max(0, Math.min(goalPercentRaw, 100));
            const goalWidgets = [
                {
                    amountId: 'monthlyGoalAmount',
                    currentId: 'monthlyGoalCurrentRevenue',
                    percentId: 'monthlyGoalPercent',
                    progressId: 'monthlyGoalProgressBar'
                },
                {
                    amountId: 'financialsMonthlyGoalAmount',
                    currentId: 'financialsMonthlyGoalCurrentRevenue',
                    percentId: 'financialsMonthlyGoalPercent',
                    progressId: 'financialsMonthlyGoalProgressBar'
                }
            ];
            goalWidgets.forEach((widget) => {
                const goalAmountEl = document.getElementById(widget.amountId);
                const currentRevenueEl = document.getElementById(widget.currentId);
                const goalPercentEl = document.getElementById(widget.percentId);
                const goalProgressBarEl = document.getElementById(widget.progressId);
                if (goalAmountEl) {
                    applyInlineEditMetadata(goalAmountEl, 'revenueGoal', 'current', 'amount', 'Monthly Revenue Goal'); // FIXED: goal amounts edit inline on dashboard/financials.
                    countUp(goalAmountEl, monthlyGoal);
                }
                if (currentRevenueEl) countUp(currentRevenueEl, currentRevenue);
                if (goalPercentEl) goalPercentEl.textContent = `${goalPercent}%`;
                if (goalProgressBarEl) {
                    goalProgressBarEl.style.width = `${progressWidth}%`;
                }
            });
            updateMainstage(monthData);

            renderCashFlowTimeline();
            renderDashboardCashflow();
            renderDashboardUpcomingShows();
            renderDashboardActivityFeed();
            // Refresh nudge banners whenever data changes
            if (typeof window.updateTodayBoard === 'function') window.updateTodayBoard();
            // Update velocity gauge
            updateVelocityGauge();

            // Delay chart rendering to ensure DOM is ready
            setTimeout(() => {
                updatePerformanceChart();
            }, 100);
        }

        function sendLocalNotification(title, body) {
            if (!('Notification' in window)) return;
            if (Notification.permission !== 'granted') return;
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(reg => {
                    if (reg) {
                        reg.showNotification(title, {
                            body,
                            icon: '/star_paper_logo_pack/star_paper_transparent.png?v=3',
                            badge: '/star_paper_logo_pack/star_paper_transparent.png?v=3'
                        });
                    } else {
                        new Notification(title, { body });
                    }
                });
            } else {
                new Notification(title, { body });
            }
        }

        function shouldSendReminder(key, intervalMs) {
            const last = Storage.loadSync(key, 0);
            const now = Date.now();
            if (now - last >= intervalMs) {
                Storage.saveSync(key, now);
                return true;
            }
            return false;
        }

        function scheduleReminderChecks() {
            runReminderChecks();
            if (window.reminderInterval) {
                clearInterval(window.reminderInterval);
            }
            window.reminderInterval = setInterval(runReminderChecks, 15 * 60 * 1000);
        }

        function runReminderChecks() {
            if (!currentUser) return;
            const now = new Date();
            const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
            const thirtySixHoursMs = 36 * 60 * 60 * 1000;

            bookings.forEach(booking => {
                if (!booking.date) return;
                const bookingDate = new Date(booking.date);
                const diff = bookingDate - now;
                const location = booking.location || 'Unknown location';
                const dateStr = formatDisplayDate(bookingDate);

                if (diff <= twoDaysMs && diff > (twoDaysMs - (6 * 60 * 60 * 1000))) {
                    const key = `reminder_show_2d_${booking.id}`;
                    if (shouldSendReminder(key, twoDaysMs)) {
                        sendLocalNotification(
                            'Upcoming Show',
                            `The King blesses her subjects in two days! at ${location}, ${dateStr}`
                        );
                    }
                }

                if (diff <= 0 && diff > - (6 * 60 * 60 * 1000)) {
                    const key = `reminder_show_day_${booking.id}`;
                    if (shouldSendReminder(key, 24 * 60 * 60 * 1000)) {
                        sendLocalNotification(
                            'Show Today',
                            `The King blesses her subjects today! at ${location}`
                        );
                    }
                }

                const feeValue = Math.round(Number(booking.fee) || 0);
                const depositValue = Math.round(Number(booking.deposit) || 0);
                const balanceValue = Number.isFinite(Number(booking.balance))
                    ? Math.round(Number(booking.balance))
                    : (feeValue - depositValue);

                if (balanceValue > 0) {
                    const key = `reminder_balance_${booking.id}`;
                    if (shouldSendReminder(key, thirtySixHoursMs)) {
                        const contact = booking.contact || booking.event || booking.artist || 'Contact';
                        sendLocalNotification(
                            'Pending Balance',
                            `Towola ndongo! ${contact} owes UGX ${balanceValue.toLocaleString()}`
                        );
                    }
                }
            });
        }
        function renderCashFlowTimeline() {
            const list = document.getElementById('cashFlowTimeline');
            if (!list) return;

            const items = [];
            bookings.forEach(booking => {
                items.push({
                    date: booking.date,
                    title: `${booking.event} (${booking.artist})`,
                    sub: booking.location ? `Show income  -  ${booking.location}` : 'Show income',
                    amount: Math.round(Number(booking.fee) || 0),
                    type: 'income'
                });
            });

            otherIncome.forEach(item => {
                items.push({
                    date: item.date,
                    title: item.source,
                    sub: `Other income  -  ${item.type}`,
                    amount: Math.round(Number(item.amount) || 0),
                    type: 'income'
                });
            });

            expenses.forEach(expense => {
                items.push({
                    date: expense.date,
                    title: expense.description,
                    sub: `Expense  -  ${expense.category}`,
                    amount: Math.round(Number(expense.amount) || 0),
                    type: 'expense'
                });
            });

            items.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (items.length === 0) {
                list.innerHTML = emptyState({
                    icon: 'ph-currency-circle-dollar',
                    title: 'No cash flow yet',
                    sub: 'Log your first booking or expense and it will show up here.',
                });
                return;
            }

            list.innerHTML = items.slice(0, 12).map(item => `
                <div class="timeline-item">
                    <div class="timeline-meta">
                        <div class="timeline-title">${escapeHtml(item.title)}</div>
                        <div class="timeline-sub">${escapeHtml(formatDisplayDate(item.date))}  -  ${escapeHtml(item.sub)}</div>
                    </div>
                    <div class="timeline-amount ${item.type === 'expense' ? 'expense-red' : 'income-green'}">
                        ${item.type === 'expense' ? '-' : '+'}UGX ${item.amount.toLocaleString()}
                    </div>
                </div>
            `).join('');
        }

        function renderDashboardCashflow() {
            const list = document.getElementById('dashboardCashflowTimeline');
            if (!list) return;

            const items = [];
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

            // Get bookings from last 2 months
            bookings.forEach(booking => {
                const bookingDate = new Date(booking.date);
                if (bookingDate >= twoMonthsAgo) {
                    items.push({
                        date: booking.date,
                        title: booking.event,
                        sub: `Booking  -  ${booking.artist}`,
                        amount: Math.round(Number(booking.fee) || 0),
                        type: 'income'
                    });
                }
            });

            // Get other income from last 2 months
            otherIncome.forEach(item => {
                const itemDate = new Date(item.date);
                if (itemDate >= twoMonthsAgo) {
                    items.push({
                        date: item.date,
                        title: item.source,
                        sub: `Other income  -  ${item.type}`,
                        amount: Math.round(Number(item.amount) || 0),
                        type: 'income'
                    });
                }
            });

            // Get expenses from last 2 months
            expenses.forEach(expense => {
                const expenseDate = new Date(expense.date);
                if (expenseDate >= twoMonthsAgo) {
                    items.push({
                        date: expense.date,
                        title: expense.description,
                        sub: `Expense  -  ${expense.category}`,
                        amount: Math.round(Number(expense.amount) || 0),
                        type: 'expense'
                    });
                }
            });

            // Sort by date descending
            items.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (items.length === 0) {
                list.innerHTML = '<p class="sp-list-empty-note">No cash flow entries in the last 2 months.</p>';
                return;
            }

            // Show last 12 items
            list.innerHTML = items.slice(0, 12).map(item => `
                <div class="timeline-item">
                    <div class="timeline-meta">
                        <div class="timeline-title">${escapeHtml(item.title)}</div>
                        <div class="timeline-sub">${escapeHtml(formatDisplayDate(item.date))}  -  ${escapeHtml(item.sub)}</div>
                    </div>
                    <div class="timeline-amount ${item.type === 'expense' ? 'expense-red' : 'income-green'}">
                        ${item.type === 'expense' ? '-' : '+'}UGX ${item.amount.toLocaleString()}
                    </div>
                </div>
            `).join('');
        }


        const customSelectState = new WeakMap();
        let customSelectGlobalListenerAttached = false;

        function closeAllCustomSelects(exceptWrapper = null) {
            document.querySelectorAll('.custom-select.open').forEach(wrapper => {
                if (wrapper === exceptWrapper) return;
                wrapper.classList.remove('open');
                const trigger = wrapper.querySelector('.custom-select__trigger');
                if (trigger) {
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });
        }

        function shouldUseNativeSelects() {
            return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
        }

        function isSelectForcedNative(select) {
            const mode = String(select?.dataset?.native || '').toLowerCase();
            return mode === 'true' || mode === 'always';
        }

        function destroyCustomSelect(select) {
            const state = customSelectState.get(select);
            if (!state) return;
            const { wrapper, observer } = state;
            observer?.disconnect();
            if (wrapper && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(select, wrapper);
                wrapper.remove();
            }
            select.classList.remove('custom-select__native');
            customSelectState.delete(select);
        }

        function syncCustomSelect(select) {
            const state = customSelectState.get(select);
            if (!state) return;

            const { trigger, menu } = state;
            const selectedOption = select.options[select.selectedIndex];
            const label = selectedOption ? selectedOption.textContent : 'Select';

            trigger.textContent = label;
            trigger.setAttribute('data-value', select.value || '');

            menu.querySelectorAll('.custom-select__option').forEach(optionBtn => {
                const isSelected = optionBtn.dataset.index === String(select.selectedIndex);
                optionBtn.classList.toggle('selected', isSelected);
                optionBtn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }

        function rebuildCustomSelect(select) {
            const state = customSelectState.get(select);
            if (!state) return;

            const { menu } = state;
            menu.innerHTML = '';

            Array.from(select.options).forEach((option, index) => {
                const optionBtn = document.createElement('button');
                optionBtn.type = 'button';
                optionBtn.className = 'custom-select__option';
                optionBtn.textContent = option.textContent;
                optionBtn.dataset.value = option.value;
                optionBtn.dataset.index = String(index);
                optionBtn.setAttribute('role', 'option');
                if (option.disabled) {
                    optionBtn.disabled = true;
                }
                menu.appendChild(optionBtn);
            });

            syncCustomSelect(select);
        }

        function initializeCustomSelect(select) {
            if (!select || customSelectState.has(select) || isSelectForcedNative(select)) return;
            if (shouldUseNativeSelects()) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select';

            Array.from(select.classList)
                .filter(className => className.startsWith('sp-csp-style-'))
                .forEach(className => {
                    wrapper.classList.add(className);
                    select.classList.remove(className);
                });
            select.removeAttribute('style');

            select.classList.add('custom-select__native');
            select.parentNode.insertBefore(wrapper, select);
            wrapper.appendChild(select);

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'custom-select__trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');

            const menu = document.createElement('div');
            menu.className = 'custom-select__menu';
            menu.setAttribute('role', 'listbox');
            menu.tabIndex = -1;

            wrapper.appendChild(trigger);
            wrapper.appendChild(menu);

            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                const isOpen = wrapper.classList.toggle('open');
                trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                if (isOpen) {
                    closeAllCustomSelects(wrapper);
                }
            });

            trigger.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    wrapper.classList.add('open');
                    trigger.setAttribute('aria-expanded', 'true');
                    closeAllCustomSelects(wrapper);
                    const firstOption = menu.querySelector('.custom-select__option:not([disabled])');
                    if (firstOption) {
                        firstOption.focus();
                    }
                }
                if (event.key === 'Escape') {
                    wrapper.classList.remove('open');
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });

            menu.addEventListener('click', (event) => {
                const rawTarget = event && event.target;
                const elementTarget = rawTarget && rawTarget.nodeType === Node.TEXT_NODE
                    ? rawTarget.parentElement
                    : rawTarget;
                if (!elementTarget || typeof elementTarget.closest !== 'function') return;
                const optionBtn = elementTarget.closest('.custom-select__option');
                if (!optionBtn || optionBtn.disabled) return;
                const optionIndex = Number(optionBtn.dataset.index);
                if (!Number.isNaN(optionIndex)) {
                    select.selectedIndex = optionIndex;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                wrapper.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            });

            menu.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    wrapper.classList.remove('open');
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.focus();
                }
            });

            select.addEventListener('change', () => syncCustomSelect(select));

            const observer = new MutationObserver(() => rebuildCustomSelect(select));
            observer.observe(select, { childList: true, subtree: true, attributes: true });

            customSelectState.set(select, { wrapper, trigger, menu, observer });
            rebuildCustomSelect(select);

            if (!customSelectGlobalListenerAttached) {
                customSelectGlobalListenerAttached = true;
                document.addEventListener('click', () => closeAllCustomSelects());
            }
        }

        function initializeCustomSelects(root = document) {
            if (shouldUseNativeSelects()) {
                root.querySelectorAll('select').forEach(select => {
                    destroyCustomSelect(select);
                    if (String(select?.dataset?.native || '').toLowerCase() !== 'always') {
                        select.dataset.native = 'true';
                    }
                });
                return;
            }

            root.querySelectorAll('select').forEach(select => {
                if (String(select?.dataset?.native || '').toLowerCase() === 'true') {
                    delete select.dataset.native;
                }
                initializeCustomSelect(select);
            });
        }

        function setActiveScreen(activeScreenId) {
            const screenDisplayModes = {
                landingScreen: 'flex',
                loginScreen: 'flex',
                appContainer: 'block'
            };
            Object.entries(screenDisplayModes).forEach(([screenId, displayMode]) => {
                const screen = document.getElementById(screenId);
                if (!screen) return;
                const isActive = screenId === activeScreenId;
                screen.style.display = isActive ? displayMode : 'none';
                screen.classList.toggle('screen-active', isActive);
            });
            // Reset tab title when landing is shown
            if (activeScreenId === 'landingScreen') {
                document.title = 'Star Paper';
            }
            if (activeScreenId === 'appContainer') {
                setAppShellBootContext();
                window.__spBootContext = 'app-refresh';
            } else {
                clearAppShellBootContext();
                window.__spBootContext = 'cold-start';
            }
            updateLandingTopControlsVisibility();
        }
        window.setActiveScreen = setActiveScreen;

        function updateLandingTopControlsVisibility() {
            const controls = document.querySelector('.landing-top-controls');
            const landingScreen = document.getElementById('landingScreen');
            if (!controls || !landingScreen) return;
            const landingVisible = landingScreen.style.display !== 'none';
            if (controls.dataset.inline === '1') {
                controls.classList.toggle('is-hidden', !landingVisible);
                return;
            }
            controls.classList.toggle('is-hidden', !landingVisible || window.scrollY > 18);
        }

        function harmonizeSectionIcons() {
            document.querySelectorAll('.section-title[data-icon]').forEach((title) => {
                if (title.querySelector('.section-title-icon')) return;
                const iconKey = title.dataset.icon;
                const icon = getSectionIconMarkup(iconKey);
                if (!icon) return;
                const iconWrap = document.createElement('span');
                iconWrap.className = 'section-title-icon';
                iconWrap.innerHTML = icon;
                title.prepend(iconWrap);
            });
        }

        function updateAppHeaderIcon(sectionKey) {
            const iconHost = document.getElementById('appTitleIcon');
            if (!iconHost) return;
            iconHost.innerHTML = getSectionIconMarkup(sectionKey);
        }

        window.addEventListener('load', () => {
            initializeCustomSelects();
        });
        let customSelectResizeTimer = null;
        window.addEventListener('resize', () => {
            if (customSelectResizeTimer) {
                clearTimeout(customSelectResizeTimer);
            }
            customSelectResizeTimer = setTimeout(() => {
                initializeCustomSelects(document);
            }, 120);
        });

        // Close modal when clicking outside
        document.getElementById('receiptModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeReceiptModal();
            }
        });
        document.getElementById('profileModal')?.addEventListener('click', function(e) {
            if (e.target === this) {
                closeProfileModal();
            }
        });

        // ── Premium Toast System ──────────────────────────────────────────────
        function showToast(message, type = 'info', opts = {}) {
            const stack = document.getElementById('spToastStack');
            if (!stack) return;

            const icons = { success: '<i class="ph ph-check-circle" aria-hidden="true"></i>', error: '<i class="ph ph-x-circle" aria-hidden="true"></i>', info: '<i class="ph ph-info" aria-hidden="true"></i>', warning: '<i class="ph ph-warning" aria-hidden="true"></i>' };
            const toastType = Object.prototype.hasOwnProperty.call(icons, type) ? type : 'info';
            const requestedDuration = Number(opts.duration);
            const dur = Number.isFinite(requestedDuration) && requestedDuration > 0
                ? Math.min(requestedDuration, 30000)
                : (toastType === 'error' ? 5000 : 3200);
            const durSec = (dur / 1000).toFixed(1) + 's';
            const titleText = opts.title == null ? '' : String(opts.title);
            const messageText = message == null ? '' : String(message);

            const toast = document.createElement('div');
            toast.className = `sp-toast sp-toast--${toastType}`;
            toast.setAttribute('role', 'status');
            toast.innerHTML = `
                <span class="sp-toast__icon">${icons[toastType]}</span>
                <div class="sp-toast__body">
                    <div class="sp-toast__title"></div>
                    <div class="sp-toast__msg"></div>
                </div>
                <button class="sp-toast__close" aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button>
                <div class="sp-toast__bar"></div>
            `;
            toast.querySelector('.sp-toast__bar')?.style.setProperty('--sp-toast-dur', durSec);
            const titleEl = toast.querySelector('.sp-toast__title');
            const messageEl = toast.querySelector('.sp-toast__msg');
            if (titleText) {
                titleEl.textContent = titleText;
                messageEl.textContent = messageText;
            } else {
                titleEl.textContent = messageText;
                messageEl.remove();
            }

            stack.appendChild(toast);
            // Animate in
            requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('sp-toast--visible')));

            const dismiss = () => {
                toast.classList.add('sp-toast--out');
                toast.addEventListener('transitionend', () => toast.remove(), { once: true });
            };
            toast.querySelector('.sp-toast__close').addEventListener('click', dismiss);
            const timer = setTimeout(dismiss, dur);
            toast.addEventListener('mouseenter', () => clearTimeout(timer));
            toast.addEventListener('mouseleave', () => setTimeout(dismiss, 800));
        }

        // Typed convenience wrappers
        function toastSuccess(msg, title) { showToast(msg, 'success', { title }); }
        function toastError(msg, title)   { showToast(msg, 'error',   { title }); }
        function toastInfo(msg, title)    { showToast(msg, 'info',    { title }); }
        function toastWarn(msg, title)    { showToast(msg, 'warning', { title }); }

        // ── Relative timestamps ───────────────────────────────────────────────
        function timeAgo(dateInput) {
            if (!dateInput) return '';
            const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
            if (isNaN(date)) return '';
            const secs = Math.floor((Date.now() - date.getTime()) / 1000);
            if (secs < 45)   return 'just now';
            if (secs < 90)   return '1 min ago';
            if (secs < 3600) return `${Math.floor(secs / 60)} mins ago`;
            if (secs < 7200) return '1 hour ago';
            if (secs < 86400) return `${Math.floor(secs / 3600)} hours ago`;
            if (secs < 172800) return 'yesterday';
            if (secs < 604800) return `${Math.floor(secs / 86400)} days ago`;
            if (secs < 1209600) return '1 week ago';
            if (secs < 2592000) return `${Math.floor(secs / 604800)} weeks ago`;
            if (secs < 5184000) return '1 month ago';
            return `${Math.floor(secs / 2592000)} months ago`;
        }

        // ── Empty state builder ───────────────────────────────────────────────
        const EMPTY_STATE_ACTIONS = {
            showAddExpense: () => showAddExpense(),
            showAddOtherIncome: () => showAddOtherIncome(),
            showAddArtistForm: () => showAddArtistForm(),
            showAddBooking: () => showAddBooking()
        };

        function normalizeEmptyStateAction(action) {
            const key = String(action || '').trim().replace(/\(\)\s*;?$/, '');
            return Object.prototype.hasOwnProperty.call(EMPTY_STATE_ACTIONS, key) ? key : '';
        }

        document.addEventListener('click', (event) => {
            const button = event.target?.closest?.('.sp-empty__cta[data-empty-action]');
            if (!button) return;
            const handler = EMPTY_STATE_ACTIONS[button.dataset.emptyAction || ''];
            if (!handler) return;
            event.preventDefault();
            handler();
        });

        function emptyState({ icon, title, sub, ctaLabel, ctaAction }) {
            // icon = Phosphor class name e.g. 'ph-receipt' OR legacy emoji (renders as text fallback)
            const safeIcon = String(icon || '');
            const isPhosphor = /^ph-[a-z0-9-]+$/i.test(safeIcon);
            const iconHTML = isPhosphor
                ? `<i class="ph ${escapeHtml(safeIcon)} sp-empty__ph-icon" aria-hidden="true"></i>`
                : `<svg class="sp-empty__art" viewBox="0 0 72 72" fill="none"><circle cx="36" cy="36" r="35" stroke="rgba(255,179,0,0.15)" stroke-width="1.5"/><text x="36" y="44" text-anchor="middle" font-size="28" fill="rgba(255,179,0,0.45)">${escapeHtml(safeIcon)}</text></svg>`;
            const actionKey = normalizeEmptyStateAction(ctaAction);
            return `<div class="sp-empty">
                ${iconHTML}
                <p class="sp-empty__title">${escapeHtml(title)}</p>
                <p class="sp-empty__sub">${escapeHtml(sub)}</p>
                ${ctaLabel && actionKey ? `<button class="sp-empty__cta" type="button" data-empty-action="${escapeHtml(actionKey)}">${escapeHtml(ctaLabel)}</button>` : ''}
            </div>`;
        }

        // ── Revenue Pulse — countUp animation ────────────────────────────────
        function countUp(el, targetValue, prefix = null, duration = 900) {
            if (!el) return;
            const formatValue = (value) => {
                if (typeof prefix === 'string') {
                    return prefix + Math.round(value).toLocaleString();
                }
                return formatCurrencyDisplay(value);
            };
            // Clear any shimmer skeleton first
            const skel = el.querySelector('.sp-skeleton');
            if (skel) skel.remove();
            const prev = Number(el.dataset.countTarget || '0');
            // Skip if same value
            if (prev === targetValue) { el.textContent = formatValue(targetValue); return; }
            el.dataset.countTarget = targetValue;
            const start = Date.now();
            const from = 0; // always roll from 0 for drama
            function step() {
                const elapsed = Date.now() - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const ease = 1 - Math.pow(1 - progress, 3);
                const current = Math.round(from + (targetValue - from) * ease);
                el.textContent = formatValue(current);
                if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        // ── Tab switchers: Money ──────────────────────────────────────────────
        function activateMoneyTab(tabId) {
            document.querySelectorAll('#moneyTabs .sp-tab').forEach(btn => {
                btn.classList.toggle('sp-tab--active', btn.dataset.tab === tabId);
            });
            document.querySelectorAll('#money .sp-tab-panel').forEach(panel => {
                const panelTab = panel.id.replace('moneyPanel-', '');
                panel.classList.toggle('sp-tab-panel--active', panelTab === tabId);
            });
        }

        function switchMoneyTab(tab) {
            if (!isMoneyTabSection(tab)) return;
            showSection(tab);
        }
        window.switchMoneyTab = switchMoneyTab;

        // ── Dedicated tab listener (bypasses all action dispatchers) ─────────
        // Runs at capture phase so it fires before any dispatcher can swallow it
        document.addEventListener('click', function spTabListener(e) {
            const btn = e.target.closest('[data-action="switchMoneyTab"],[data-action="switchScheduleTab"]');
            if (!btn) return;
            const action = btn.dataset.action;
            const tab = btn.dataset.tab;
            if (!tab) return;
            e.stopImmediatePropagation();
            if (action === 'switchMoneyTab') switchMoneyTab(tab);
            else if (action === 'switchScheduleTab') switchScheduleTab(tab);
        }, true); // capture phase = runs first

        // ── Tab switchers: Schedule ───────────────────────────────────────────
        function activateScheduleTab(tabId) {
            document.querySelectorAll('#scheduleTabs .sp-tab').forEach(btn => {
                btn.classList.toggle('sp-tab--active', btn.dataset.tab === tabId);
            });
            document.querySelectorAll('#schedule .sp-tab-panel').forEach(panel => {
                const panelTab = panel.id.replace('schedulePanel-', '');
                panel.classList.toggle('sp-tab-panel--active', panelTab === tabId);
            });
        }

        function switchScheduleTab(tab) {
            if (!isScheduleTabSection(tab)) return;
            showSection(tab);
        }
        window.switchScheduleTab = switchScheduleTab;

        // ── About Modal ───────────────────────────────────────────────────────
        function showAboutModal() {
            const modal = document.getElementById('spAboutModal');
            if (!modal) return;
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            const close = () => {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            };
            document.getElementById('spAboutClose')?.addEventListener('click', close, { once: true });
            document.getElementById('spAboutBackdrop')?.addEventListener('click', close, { once: true });
        }

        // ── Admin Settings Modal ──────────────────────────────────────────────
        function showAdminSettings() {
            const modal = document.getElementById('spAdminModal');
            if (!modal) return;
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            // Render user list from localStorage
            const allManagers = Storage.loadSync('spManagers', []);
            const pendingUsers = Storage.loadSync('spPendingUsers', []);
            const allUsers = [
                ...allManagers.map(m => ({ ...m, status: 'active' })),
                ...pendingUsers.map(u => ({ ...u, status: 'pending' }))
            ];
            const listEl = document.getElementById('spAdminUserList');
            if (listEl) {
                if (allUsers.length === 0) {
                    listEl.innerHTML = '<div class="sp-admin-empty">No users found.</div>';
                } else {
                    listEl.innerHTML = `
                        <table class="sp-admin-table">
                            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>${allUsers.map(u => `
                                <tr>
                                    <td>${escapeHtml(u.name || u.email || '-')}</td>
                                    <td class="sp-admin-email-cell">${escapeHtml(u.email || '-')}</td>
                                    <td><span class="sp-admin-pill sp-admin-pill--${u.status === 'pending' ? 'pending' : 'active'}">${escapeHtml(u.status === 'pending' ? 'pending' : 'active')}</span></td>
                                    <td><div class="sp-admin-actions">
                                        ${u.status === 'pending' ? `<button class="sp-admin-btn sp-admin-btn--approve" data-admin-action="approve" data-admin-user="${escapeHtml(u.id || u.email || '')}">Approve</button>` : ''}
                                        <button class="sp-admin-btn sp-admin-btn--delete" data-admin-action="delete" data-admin-user="${escapeHtml(u.id || u.email || '')}">Delete</button>
                                    </div></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>`;
                    listEl.querySelectorAll('[data-admin-action][data-admin-user]').forEach((button) => {
                        button.addEventListener('click', () => {
                            const idOrEmail = button.dataset.adminUser || '';
                            if (button.dataset.adminAction === 'approve') adminApproveUser(idOrEmail);
                            if (button.dataset.adminAction === 'delete') adminDeleteUser(idOrEmail);
                        });
                    });
                }
            }

            const close = () => {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            };
            document.getElementById('spAdminClose')?.addEventListener('click', close, { once: true });
            document.getElementById('spAdminBackdrop')?.addEventListener('click', close, { once: true });
        }

        function adminApproveUser(idOrEmail) {
            const pending = Storage.loadSync('spPendingUsers', []);
            const user = pending.find(u => u.id === idOrEmail || u.email === idOrEmail);
            if (!user) { toastError('User not found.'); return; }
            const managers = Storage.loadSync('spManagers', []);
            managers.push({ ...user, id: user.id || Date.now() });
            Storage.saveSync('spManagers', managers);
            Storage.saveSync('spPendingUsers', pending.filter(u => u.id !== idOrEmail && u.email !== idOrEmail));
            toastSuccess(`${user.name || user.email} approved.`);
            showAdminSettings();
        }

        function adminDeleteUser(idOrEmail) {
            ['spManagers','spPendingUsers'].forEach(key => {
                const list = Storage.loadSync(key, []);
                Storage.saveSync(key, list.filter(u => u.id !== idOrEmail && u.email !== idOrEmail));
            });
            toastSuccess('User removed.');
            showAdminSettings();
        }
        window.adminApproveUser = adminApproveUser;
        window.adminDeleteUser = adminDeleteUser;

        // ── Booking Velocity Gauge ────────────────────────────────────────────
        function updateVelocityGauge() {
            const fillEl   = document.getElementById('velocityGaugeFill');
            const needleEl = document.getElementById('velocityGaugeNeedle');
            const thisEl   = document.getElementById('velocityThisMonth');
            const lastEl   = document.getElementById('velocityLastMonth');
            const deltaEl  = document.getElementById('velocityDelta');
            if (!fillEl || !needleEl) return;

            const now = new Date();
            const cm = now.getMonth(), cy = now.getFullYear();
            const lm = cm === 0 ? 11 : cm - 1;
            const ly = cm === 0 ? cy - 1 : cy;

            const allBookings = typeof bookings !== 'undefined' ? bookings : [];
            const thisCount = allBookings.filter(b => {
                if (!b.date) return false;
                const d = new Date(b.date);
                return d.getMonth() === cm && d.getFullYear() === cy;
            }).length;
            const lastCount = allBookings.filter(b => {
                if (!b.date) return false;
                const d = new Date(b.date);
                return d.getMonth() === lm && d.getFullYear() === ly;
            }).length;

            // Arc: 0–180 degrees mapped to 0–max shows
            // Arc total length ≈ 251px (π * 80)
            const ARC_LEN = 251;
            const maxShows = Math.max(thisCount, lastCount, 1);
            const ratio = Math.min(thisCount / maxShows, 1);
            const filled = ratio * ARC_LEN;
            fillEl.setAttribute('stroke-dasharray', `${filled.toFixed(1)} ${(ARC_LEN - filled).toFixed(1)}`);

            // Needle: -90deg (left) to +90deg (right)
            const needleDeg = -90 + ratio * 180;
            needleEl.style.transform = `rotate(${needleDeg}deg)`;

            // Text
            if (thisEl) thisEl.textContent = thisCount;
            if (lastEl) lastEl.textContent = lastCount;
            if (deltaEl) {
                const diff = thisCount - lastCount;
                if (diff > 0) {
                    deltaEl.textContent = `+ ${diff} more`;
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--up';
                } else if (diff < 0) {
                    deltaEl.textContent = `- ${Math.abs(diff)} fewer`;
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--down';
                } else {
                    deltaEl.textContent = 'Same pace';
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--flat';
                }
            }
        }

        // ── Today Board + Nudge Engine ────────────────────────────────────────
        window.updateTodayBoard = function updateTodayBoard() {
            const now = new Date();
            const hour = now.getHours();
            const dayEl    = document.getElementById('todayBoardDay');
            const dateEl   = document.getElementById('todayBoardDate');
            const statEl   = document.getElementById('todayBoardStatus');
            const alertsEl = document.getElementById('todayBoardAlerts');

            if (dayEl) dayEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
            if (dateEl) {
                const mm = String(now.getMonth()+1).padStart(2,'0');
                const dd = String(now.getDate()).padStart(2,'0');
                const yy = now.getFullYear();
                dateEl.textContent = `${mm}-${dd}-${yy}`;
            }

            const allBookings = typeof bookings !== 'undefined' ? bookings : [];
            const todayStr = now.toISOString().slice(0, 10);
            const nudges = [];

            // ── Midnight Whisper (9 PM – 4 AM) ───────────────────────────────
            if (hour >= 21 || hour < 4) {
                const liveCount = allBookings.filter(b => b.status === 'confirmed' && b.date === todayStr).length;
                nudges.push({
                    type: 'info', icon: 'ph-moon', id: 'nudge-midnight',
                    text: liveCount > 0
                        ? `The night is young. ${liveCount} artist${liveCount > 1 ? 's are' : ' is'} currently live.`
                        : `The night is young. Keep building.`
                });
            }

            // ── Collection Nudge ──────────────────────────────────────────────
            const unpaid = allBookings.filter(b => (Math.round(Number(b.balance) || 0)) > 0);
            if (unpaid.length > 0) {
                const total = unpaid.reduce((s, b) => s + (Math.round(Number(b.balance) || 0)), 0);
                nudges.push({
                    type: 'warning', icon: 'ph-money', id: 'nudge-collection',
                    text: `${unpaid.length} booking${unpaid.length > 1 ? 's have' : ' has'} unpaid balances (UGX ${Math.round(total).toLocaleString()}). Follow up?`,
                    action: 'followUpUnpaid',
                    actionId: String(unpaid[0]?.id ?? '')
                });
            }

            // ── Show Nudge — show in ≤5 days with balance due ─────────────────
            allBookings.filter(b => {
                if (!b.date || (Math.round(Number(b.balance) || 0)) <= 0) return false;
                const diff = (new Date(b.date) - now) / 86400000;
                return diff >= 0 && diff <= 5;
            }).forEach(b => {
                const diff = Math.max(0, Math.ceil((new Date(b.date) - now) / 86400000));
                nudges.push({
                    type: 'alert', icon: 'ph-microphone-stage', id: `nudge-show-${b.id}`,
                    text: `"${b.event}" is in ${diff} day${diff !== 1 ? 's' : ''}. Balance still due: UGX ${(Math.round(Number(b.balance) || 0)).toLocaleString()}.`,
                    action: 'openBooking',
                    actionId: String(b.id ?? '')
                });
            });

            // ── Momentum Nudge — 3+ confirmed bookings in 3 months ───────────
            const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
            const recent = allBookings.filter(b => b.status === 'confirmed' && b.date && new Date(b.date) >= cutoff);
            if (recent.length >= 3) {
                const cnt = {};
                recent.forEach(b => { cnt[b.artist] = (cnt[b.artist] || 0) + 1; });
                const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
                nudges.push({
                    type: 'success', icon: 'ph-fire', id: 'nudge-momentum',
                    text: `${recent.length}-booking streak in 3 months! Your busiest artist: ${top[0]}.`
                });
            }

            // ── Render ────────────────────────────────────────────────────────
            if (!alertsEl) return;
            let dismissed = [];
            try {
                dismissed = JSON.parse(sessionStorage.getItem('sp_dismissed_nudges') || '[]');
                if (!Array.isArray(dismissed)) dismissed = [];
            } catch (_err) {
                dismissed = [];
            }
            const visible = nudges.filter(n => !dismissed.includes(n.id));

            if (statEl) {
                if (visible.length === 0) {
                    statEl.textContent = 'All Clear';
                    statEl.className = 'today-board__status today-board__status--clear';
                } else {
                    statEl.textContent = `${visible.length} Alert${visible.length > 1 ? 's' : ''}`;
                    statEl.className = 'today-board__status today-board__status--alerts';
                }
            }

            if (visible.length === 0) {
                alertsEl.innerHTML = `<div class="nudge-item nudge-item--clear">
                    <span class="nudge-icon"><i class="ph ph-check-circle" aria-hidden="true"></i></span>
                    <span class="nudge-text">All Clear - No urgent items require your attention today.</span>
                </div>`;
                return;
            }

            alertsEl.innerHTML = visible.map(n => {
                const itemClasses = ['nudge-item', `nudge-item--${escapeHtml(n.type)}`];
                if (n.action) itemClasses.push('nudge-item--clickable');
                const actionAttrs = n.action
                    ? ` data-nudge-action="${escapeHtml(n.action)}" data-nudge-action-id="${escapeHtml(n.actionId || '')}" tabindex="0" role="button"`
                    : '';
                const nudgeIconClass = normalizePhosphorIconClass(n.icon);
                const iconHtml = nudgeIconClass
                    ? `<i class="ph ${escapeHtml(nudgeIconClass)}" aria-hidden="true"></i>`
                    : escapeHtml(n.icon);
                return `
                <div class="${itemClasses.join(' ')}" data-nudge-id="${escapeHtml(n.id)}"${actionAttrs}>
                    <span class="nudge-icon">${iconHtml}</span>
                    <span class="nudge-text">${escapeHtml(n.text)}</span>
                    <button class="nudge-dismiss" data-nudge-dismiss="1" aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button>
                </div>`;
            }).join('');
        };

        function dismissNudgeFromButton(button) {
            const item = button?.closest?.('[data-nudge-id]');
            const id = item?.dataset?.nudgeId;
            if (!id) return;
            let dismissed = [];
            try {
                dismissed = JSON.parse(sessionStorage.getItem('sp_dismissed_nudges') || '[]');
                if (!Array.isArray(dismissed)) dismissed = [];
            } catch (_err) {
                dismissed = [];
            }
            if (!dismissed.includes(id)) dismissed.push(id);
            sessionStorage.setItem('sp_dismissed_nudges', JSON.stringify(dismissed));
            item.remove();
            window.updateTodayBoard();
        }

        function resolveBookingId(rawId) {
            const allBookings = typeof bookings !== 'undefined' ? bookings : [];
            const cleanId = String(rawId || '').trim();
            if (!cleanId) return null;

            const maybeNumber = Number(cleanId);
            if (Number.isFinite(maybeNumber)) {
                const numericMatch = allBookings.find((booking) => booking.id === maybeNumber);
                if (numericMatch) return numericMatch.id;
            }

            const stringMatch = allBookings.find((booking) => String(booking.id) === cleanId);
            return stringMatch ? stringMatch.id : null;
        }

        function openBookingFromNudge(actionId) {
            const bookingId = resolveBookingId(actionId);
            showSection('bookings');
            setTimeout(() => {
                const bookingsCard = document.getElementById('bookingsListCard') || document.getElementById('bookingsTable');
                bookingsCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (bookingId !== null && typeof editBooking === 'function') {
                    editBooking(bookingId);
                } else if (typeof toastInfo === 'function') {
                    toastInfo('Review bookings with balances due.');
                }
            }, 80);
        }

        function followUpUnpaidFromNudge(actionId) {
            let bookingId = resolveBookingId(actionId);
            if (bookingId === null) {
                const allBookings = typeof bookings !== 'undefined' ? bookings : [];
                const firstUnpaid = allBookings.find((booking) => (Math.round(Number(booking.balance) || 0)) > 0);
                bookingId = firstUnpaid ? firstUnpaid.id : null;
            }
            openBookingFromNudge(bookingId);
        }

        function handleNudgeFollowUp(action, actionId) {
            if (!action) return;
            if (action === 'openBooking') {
                openBookingFromNudge(actionId);
                return;
            }
            if (action === 'followUpUnpaid') {
                followUpUnpaidFromNudge(actionId);
            }
        }

        if (!window.__spNudgeFollowUpBound) {
            window.__spNudgeFollowUpBound = true;

            document.addEventListener('click', function(e) {
                const dismissBtn = e.target?.closest?.('[data-nudge-dismiss]');
                if (dismissBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    dismissNudgeFromButton(dismissBtn);
                    return;
                }
                const target = e.target?.closest?.('.nudge-item[data-nudge-action]');
                if (!target) return;
                handleNudgeFollowUp(target.dataset.nudgeAction, target.dataset.nudgeActionId || '');
            });

            document.addEventListener('keydown', function(e) {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const target = e.target?.closest?.('.nudge-item[data-nudge-action]');
                if (!target) return;
                e.preventDefault();
                handleNudgeFollowUp(target.dataset.nudgeAction, target.dataset.nudgeActionId || '');
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeReceiptModal();
                closeProfileModal();
            }
        });

        // ── In-app navigation history button state ────────────────────────────
        function updateNavHistButtons() {
            const back = document.getElementById('navBackBtn');
            const fwd  = document.getElementById('navFwdBtn');
            if (!back || !fwd) return;
            back.disabled = !window._spNavStack || window._spNavIndex <= 0;
            fwd.disabled  = !window._spNavStack || window._spNavIndex >= window._spNavStack.length - 1;
        }

        // ── Falling Gold Coins canvas animation ───────────────────────────────
        function drawCoinDollarMark(ctx, radius, scaleX) {
            if (radius < 4.8) return;
            const safeScaleX = Math.max(scaleX, 0.08);
            const markScaleX = Math.max(0.72, Math.min(1.02, 0.78 + (safeScaleX * 0.42)));
            ctx.save();
            ctx.scale(1 / safeScaleX, 1);
            ctx.scale(markScaleX, 1);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.max(9, Math.round(radius * 1.34))}px Georgia, serif`;
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(1.1, radius * 0.12);
            ctx.strokeStyle = 'rgba(255, 247, 184, 0.92)';
            ctx.shadowColor = 'rgba(78, 46, 0, 0.42)';
            ctx.shadowBlur = Math.max(1.3, radius * 0.18);
            ctx.strokeText('$', 0, -0.1);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(94, 56, 0, 0.98)';
            ctx.fillText('$', 0, 0.16);
            ctx.lineWidth = Math.max(0.6, radius * 0.05);
            ctx.strokeStyle = 'rgba(255, 222, 118, 0.40)';
            ctx.strokeText('$', 0, -0.18);
            ctx.restore();
        }

        // Landing coin rain intentionally removed to reduce visual noise.

        (function initMainstageCoinRain() {
            const canvas = document.getElementById('mainstageCoinRainCanvas');
            const host = document.getElementById('welcomeMessage');
            if (!canvas || !host) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            let W = 1;
            let H = 1;
            const COIN_COUNT = 16;
            const GOLD_STOPS = [
                { pos: 0,    color: '#fff8a0' },
                { pos: 0.28, color: '#ffd700' },
                { pos: 0.55, color: '#c9920a' },
                { pos: 0.80, color: '#d4a820' },
                { pos: 1,    color: '#7a5500' },
            ];
            const coins = [];
            let seeded = false;
            let frameCount = 0;

            function resize() {
                const rect = host.getBoundingClientRect();
                const nextW = Math.max(1, Math.floor(rect.width));
                const nextH = Math.max(1, Math.floor(rect.height));
                if (nextW === W && nextH === H) return;
                W = canvas.width = nextW;
                H = canvas.height = nextH;
            }

            function makeCoin(seedY) {
                const r = 5 + Math.random() * 7;
                const x = Math.random() * (W + 24) - 12;
                const y = seedY !== undefined ? seedY : (-r - Math.random() * 60);
                const spd = 0.45 + Math.random() * 0.8;
                const spin = (Math.random() - 0.5) * 0.06;
                const tilt = Math.random() * Math.PI;
                const drift = (Math.random() - 0.5) * 0.22;
                const opacity = 0.34 + Math.random() * 0.32;
                return { x, y, r, spd, spin, tilt, drift, opacity };
            }

            function drawCoin(coin) {
                ctx.save();
                ctx.translate(coin.x, coin.y);
                ctx.globalAlpha = coin.opacity;
                const scaleX = Math.abs(Math.cos(coin.tilt)) || 0.04;
                const grad = ctx.createRadialGradient(
                    -coin.r * 0.3 * scaleX, -coin.r * 0.3, 0,
                     coin.r * 0.1 * scaleX,  coin.r * 0.1, coin.r * 1.1
                );
                GOLD_STOPS.forEach(stop => grad.addColorStop(stop.pos, stop.color));
                ctx.scale(scaleX, 1);
                ctx.beginPath();
                ctx.ellipse(0, 0, coin.r, coin.r, 0, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,210,60,0.36)';
                ctx.lineWidth = 1 / scaleX;
                ctx.stroke();
                drawCoinDollarMark(ctx, coin.r, scaleX);
                ctx.restore();
            }

            function ensureSeeded() {
                if (seeded) return;
                for (let i = 0; i < COIN_COUNT; i += 1) {
                    coins.push(makeCoin(Math.random() * H));
                }
                seeded = true;
            }

            function isVisible() {
                return !(host.style.display === 'none' || host.offsetParent === null);
            }

            function tick() {
                frameCount = (frameCount + 1) % 180;
                if (W <= 1 || H <= 1 || frameCount === 0) {
                    resize();
                }
                if (!isVisible()) {
                    ctx.clearRect(0, 0, W, H);
                    requestAnimationFrame(tick);
                    return;
                }

                ensureSeeded();
                ctx.clearRect(0, 0, W, H);
                for (const coin of coins) {
                    coin.y += coin.spd;
                    coin.x += coin.drift;
                    coin.tilt += coin.spin;
                    if (coin.y - coin.r > H || coin.x < -32 || coin.x > W + 32) {
                        Object.assign(coin, makeCoin());
                    }
                    drawCoin(coin);
                }
                requestAnimationFrame(tick);
            }

            window.addEventListener('resize', resize, { passive: true });
            resize();
            tick();
        })();

        (function initLandingFeatureCarousel() {
            const carousel = document.getElementById('landingFeatureCarousel');
            const track = carousel?.querySelector('.landing-feature-strip');
            const prevBtn = carousel?.querySelector('[data-action="landingFeaturePrev"]');
            const nextBtn = carousel?.querySelector('[data-action="landingFeatureNext"]');
            const dotsRoot = document.getElementById('landingFeatureDots');
            if (!carousel || !track || !prevBtn || !nextBtn || !dotsRoot) return;

            const cards = Array.from(track.querySelectorAll('.landing-feature-card'));
            if (!cards.length) return;

            dotsRoot.innerHTML = cards.map((_, index) =>
                `<button type="button" class="landing-feature-dot${index === 0 ? ' is-active' : ''}" data-index="${index}" aria-label="View feature ${index + 1}"></button>`
            ).join('');
            const dots = Array.from(dotsRoot.querySelectorAll('.landing-feature-dot'));

            const isMobileCarousel = () => window.innerWidth <= 1024;
            const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
            const getStepWidth = () => Math.max(track.clientWidth || 0, 1);

            function getActiveIndex() {
                if (!isMobileCarousel()) return 0;
                const index = Math.round(track.scrollLeft / getStepWidth());
                return clamp(index, 0, cards.length - 1);
            }

            function scrollToIndex(index) {
                const nextIndex = clamp(index, 0, cards.length - 1);
                const left = nextIndex * getStepWidth();
                track.scrollTo({ left, behavior: 'smooth' });
                updateControls(nextIndex);
            }

            function updateControls(forcedIndex) {
                const mobileMode = isMobileCarousel();
                const activeIndex = typeof forcedIndex === 'number' ? forcedIndex : getActiveIndex();
                prevBtn.disabled = !mobileMode || activeIndex <= 0;
                nextBtn.disabled = !mobileMode || activeIndex >= cards.length - 1;
                dots.forEach((dot, index) => {
                    dot.classList.toggle('is-active', mobileMode && index === activeIndex);
                });
                if (!mobileMode) {
                    track.scrollLeft = 0;
                }
            }

            prevBtn.addEventListener('click', () => {
                scrollToIndex(getActiveIndex() - 1);
            });
            nextBtn.addEventListener('click', () => {
                scrollToIndex(getActiveIndex() + 1);
            });
            dotsRoot.addEventListener('click', (event) => {
                const dot = event.target?.closest?.('.landing-feature-dot[data-index]');
                if (!dot) return;
                const index = parseInt(dot.dataset.index, 10);
                if (Number.isNaN(index)) return;
                scrollToIndex(index);
            });

            let touchStartX = null;
            track.addEventListener('touchstart', (event) => {
                if (!isMobileCarousel()) return;
                touchStartX = event.touches?.[0]?.clientX ?? null;
            }, { passive: true });
            track.addEventListener('touchend', (event) => {
                if (!isMobileCarousel() || touchStartX == null) return;
                const touchEndX = event.changedTouches?.[0]?.clientX;
                if (typeof touchEndX !== 'number') return;
                const delta = touchStartX - touchEndX;
                touchStartX = null;
                if (Math.abs(delta) < 34) return;
                scrollToIndex(getActiveIndex() + (delta > 0 ? 1 : -1));
            }, { passive: true });

            let scrollTimer = null;
            track.addEventListener('scroll', () => {
                if (!isMobileCarousel()) return;
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    updateControls();
                }, 60);
            }, { passive: true });

            window.addEventListener('resize', updateControls, { passive: true });
            updateControls();
        })();

        (function initLandingMobileSliders() {
            const sliders = Array.from(document.querySelectorAll('.landing-mobile-slider'));
            if (!sliders.length) return;

            const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
            const isMobile = () => window.innerWidth < 768;

            sliders.forEach((slider) => {
                const track = slider.querySelector('.landing-mobile-slider-track');
                const prevBtn = slider.querySelector('[data-action="landingSliderPrev"]');
                const nextBtn = slider.querySelector('[data-action="landingSliderNext"]');
                const cards = Array.from(track?.children || []);
                if (!track || !prevBtn || !nextBtn || !cards.length) return;

                const getGap = () => {
                    const styles = window.getComputedStyle(track);
                    const gap = parseFloat(styles.columnGap || styles.gap || '0');
                    return Number.isFinite(gap) ? gap : 0;
                };

                const getStepWidth = () => {
                    const firstCard = cards[0];
                    if (!firstCard) return Math.max(track.clientWidth || 1, 1);
                    return Math.max(firstCard.getBoundingClientRect().width + getGap(), 1);
                };

                const getActiveIndex = () => {
                    if (!isMobile()) return 0;
                    return clamp(Math.round(track.scrollLeft / getStepWidth()), 0, cards.length - 1);
                };

                const updateButtons = (forcedIndex) => {
                    const activeIndex = typeof forcedIndex === 'number' ? forcedIndex : getActiveIndex();
                    const mobile = isMobile();
                    prevBtn.disabled = !mobile || activeIndex <= 0;
                    nextBtn.disabled = !mobile || activeIndex >= cards.length - 1;
                    if (!mobile) {
                        track.scrollLeft = 0;
                    }
                };

                const scrollToIndex = (index) => {
                    const targetIndex = clamp(index, 0, cards.length - 1);
                    track.scrollTo({
                        left: targetIndex * getStepWidth(),
                        behavior: 'smooth'
                    });
                    updateButtons(targetIndex);
                };

                prevBtn.addEventListener('click', () => {
                    scrollToIndex(getActiveIndex() - 1);
                });

                nextBtn.addEventListener('click', () => {
                    scrollToIndex(getActiveIndex() + 1);
                });

                let scrollTimer = null;
                track.addEventListener('scroll', () => {
                    if (!isMobile()) return;
                    if (scrollTimer) clearTimeout(scrollTimer);
                    scrollTimer = setTimeout(() => updateButtons(), 60);
                }, { passive: true });

                window.addEventListener('resize', updateButtons, { passive: true });
                updateButtons();
            });
        })();

        // ── Gold Dust burst — triggered on booking confirmed ──────────────────
        function triggerGoldDust() {
            if (!document.body) return;
            document.querySelector('.sp-gold-dust-canvas')?.remove();
            const canvas = document.createElement('canvas');
            canvas.className = 'sp-gold-dust-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            document.body.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            const W = canvas.width  = window.innerWidth;
            const H = canvas.height = window.innerHeight;

            const GOLD_STOPS = [
                { pos: 0,    color: '#fff8a0' },
                { pos: 0.28, color: '#ffd700' },
                { pos: 0.55, color: '#c9920a' },
                { pos: 0.80, color: '#d4a820' },
                { pos: 1,    color: '#7a5500' },
            ];

            const particles = Array.from({ length: 80 }, () => ({
                x: W / 2 + (Math.random() - 0.5) * W * 0.6,
                y: H * 0.4,
                r: 4 + Math.random() * 10,
                vx: (Math.random() - 0.5) * 12,
                vy: -8 - Math.random() * 10,
                gravity: 0.35,
                tilt: Math.random() * Math.PI,
                spin: (Math.random() - 0.5) * 0.15,
                opacity: 1,
            }));

            const startTime = Date.now();
            const duration = 2200;

            function burstTick() {
                const elapsed = Date.now() - startTime;
                if (elapsed > duration) {
                    ctx.clearRect(0, 0, W, H);
                    canvas.remove();
                    return;
                }
                ctx.clearRect(0, 0, W, H);
                const fade = Math.max(0, 1 - elapsed / duration);
                for (const p of particles) {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += p.gravity;
                    p.vx *= 0.98;
                    p.tilt += p.spin;
                    p.opacity = fade;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.globalAlpha = p.opacity;
                    const scaleX = Math.abs(Math.cos(p.tilt)) || 0.04;
                    const grad = ctx.createRadialGradient(-p.r*0.3*scaleX, -p.r*0.3, 0, p.r*0.1*scaleX, p.r*0.1, p.r*1.1);
                    GOLD_STOPS.forEach(s => grad.addColorStop(s.pos, s.color));
                    ctx.scale(scaleX, 1);
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.r, p.r, 0, 0, Math.PI * 2);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,210,60,0.58)';
                    ctx.lineWidth = 1.2 / scaleX;
                    ctx.stroke();
                    drawCoinDollarMark(ctx, p.r, scaleX);
                    ctx.restore();
                }
                requestAnimationFrame(burstTick);
            }
            requestAnimationFrame(burstTick);
        }

        // ══ COMMAND PALETTE & KEYBOARD SHORTCUTS ══════════════════════════════

        (function initCommandPalette() {

            // ── Section registry ──────────────────────────────────────────────
            const SECTIONS = [
                { id: 'dashboard',   label: 'Dashboard',    icon: 'ph-house',                  sub: 'Overview & KPIs',                key: 'D' },
                { id: 'money',       label: 'Money',        icon: 'ph-currency-circle-dollar', sub: 'Financials, Expenses & Reports', key: 'M' },
                { id: 'schedule',    label: 'Schedule',     icon: 'ph-calendar-blank',         sub: 'Bookings & Calendar',            key: 'S' },
                { id: 'artists',     label: 'Artists',      icon: 'ph-microphone-stage', sub: 'Roster & profiles',              key: 'A' },
                { id: 'tasks',       label: 'Tasks',        icon: 'ph-clipboard-text',    sub: 'To-dos & reminders',             key: 'T' },
                { id: 'settings',    label: 'Settings',     icon: 'ph-gear-six',          sub: 'Profile, preferences & admin', key: 'P' },
            ];

            const ACTIONS = [
                { label: 'Add Booking',    icon: 'ph-calendar-plus',       sub: 'Log a new show',       action: () => { showSection('schedule');    setTimeout(() => showAddBooking?.(), 80); } },
                { label: 'Add Expense',    icon: 'ph-receipt',             sub: 'Log a cost or bill',   action: () => { if (guardTeamPermission('finance', 'add expenses')) return; showSection('expenses');    setTimeout(() => showAddExpense?.(), 80); } },
                { label: 'Add Artist',     icon: 'ph-microphone-stage',    sub: 'Add to your roster',   action: () => { showSection('artists');     setTimeout(() => showAddArtistForm?.(), 80); } },
                { label: 'Add Income',     icon: 'ph-plus-circle',         sub: 'Log other income',      action: () => { if (guardTeamPermission('finance', 'add other income')) return; showSection('otherIncome'); } },
                { label: 'Open Quick Launcher',   icon: 'ph-command',      sub: 'Cmd/Ctrl+K',           action: () => openPalette() },
            ];

            // ── DOM refs ──────────────────────────────────────────────────────
            const palette   = document.getElementById('spPalette');
            const backdrop  = document.getElementById('spPaletteBackdrop');
            const input     = document.getElementById('spPaletteInput');
            const resultsList = document.getElementById('spPaletteResults');
            const kbdHint   = document.getElementById('spKbdHint');
            if (!palette || !input || !resultsList) return;

            let isOpen = false;
            let selectedIdx = -1;
            let currentResults = [];

            // ── Open / close ──────────────────────────────────────────────────
            function isAppActive() {
                const app = document.getElementById('appContainer');
                return app && app.style.display !== 'none' && currentUser;
            }

            function openPalette() {
                if (!isAppActive()) return;
                isOpen = true;
                selectedIdx = -1;
                palette.style.display = 'block';
                backdrop.classList.add('sp-palette-backdrop--visible');
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    palette.classList.add('sp-palette--visible');
                    input.value = '';
                    input.focus();
                    renderResults('');
                }));
            }

            function closePalette() {
                isOpen = false;
                palette.classList.remove('sp-palette--visible');
                backdrop.classList.remove('sp-palette-backdrop--visible');
                palette.addEventListener('transitionend', () => {
                    if (!isOpen) palette.style.display = 'none';
                }, { once: true });
            }

            // ── Search & render ───────────────────────────────────────────────
            function highlight(text, query) {
                const source = String(text ?? '');
                const needle = String(query ?? '');
                if (!needle) return escapeHtml(source);
                const idx = source.toLowerCase().indexOf(needle.toLowerCase());
                if (idx < 0) return escapeHtml(source);
                return escapeHtml(source.slice(0, idx)) +
                    '<mark>' + escapeHtml(source.slice(idx, idx + needle.length)) + '</mark>' +
                    escapeHtml(source.slice(idx + needle.length));
            }

            function buildResults(query) {
                const q = query.trim().toLowerCase();
                const items = [];

                if (!q) {
                    // Default: show all sections + quick actions
                    items.push({ type: 'group', label: 'Navigate' });
                    SECTIONS.forEach(s => items.push({ type: 'section', ...s, query: '' }));
                    items.push({ type: 'group', label: 'Quick Actions' });
                    ACTIONS.slice(0, 4).forEach(a => items.push({ type: 'action', ...a, query: '' }));
                    return items;
                }

                // Section matches
                const matchSections = SECTIONS.filter(s =>
                    s.label.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q)
                );
                if (matchSections.length) {
                    items.push({ type: 'group', label: 'Sections' });
                    matchSections.forEach(s => items.push({ type: 'section', ...s, query: q }));
                }

                // Action matches
                const matchActions = ACTIONS.filter(a =>
                    a.label.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q)
                );
                if (matchActions.length) {
                    items.push({ type: 'group', label: 'Actions' });
                    matchActions.forEach(a => items.push({ type: 'action', ...a, query: q }));
                }

                // Artist matches
                const artistList = typeof getArtists === 'function' ? getArtists() : (typeof artists !== 'undefined' ? artists : []);
                const matchArtists = artistList.filter(a => String(a.name || '').toLowerCase().includes(q)).slice(0, 4);
                if (matchArtists.length) {
                    items.push({ type: 'group', label: 'Artists' });
                    matchArtists.forEach(a => items.push({
                        type: 'artist', label: a.name, icon: 'ph-microphone-stage',
                        sub: a.specialty || 'Artist', query: q,
                        action: () => { showSection('artists'); }
                    }));
                }

                // Booking matches
                const bookingList = typeof bookings !== 'undefined' ? bookings : [];
                const matchBookings = bookingList.filter(b =>
                    b.event?.toLowerCase().includes(q) ||
                    b.artist?.toLowerCase().includes(q) ||
                    b.location?.toLowerCase().includes(q)
                ).slice(0, 4);
                if (matchBookings.length) {
                    items.push({ type: 'group', label: 'Bookings' });
                    matchBookings.forEach(b => items.push({
                        type: 'booking', label: b.event || 'Untitled booking', icon: 'ph-calendar-check',
                        sub: `${b.artist || 'Roster / Shared'} - ${b.date || ''}`, query: q,
                        action: () => { showSection('schedule'); }
                    }));
                }

                if (!items.length) {
                    items.push({ type: 'empty' });
                }
                return items;
            }

            function renderResults(query) {
                const items = buildResults(query);
                currentResults = items.filter(i => i.type !== 'group' && i.type !== 'empty');
                selectedIdx = currentResults.length ? 0 : -1;

                resultsList.innerHTML = items.map((item, globalIdx) => {
                    if (item.type === 'group') {
                        return `<li class="sp-palette__group-label" role="presentation">${escapeHtml(item.label)}</li>`;
                    }
                    if (item.type === 'empty') {
                        return `<li class="sp-palette__empty" role="option">No results for "<strong>${escapeHtml(query)}</strong>"</li>`;
                    }
                    const resultIdx = currentResults.indexOf(item);
                    const isSelected = resultIdx === selectedIdx;
                    const iconClass = normalizePhosphorIconClass(item.icon);
                    const kbdHtml = item.key
                        ? `<span class="sp-palette__result-kbd">G+${escapeHtml(item.key)}</span>` : '';
                    const iconHtml = iconClass
                        ? `<i class="ph ${escapeHtml(iconClass)}" aria-hidden="true"></i>`
                        : '<i class="ph ph-dot-outline" aria-hidden="true"></i>';
                    return `<li class="sp-palette__result" role="option"
                        aria-selected="${isSelected}"
                        data-result-idx="${resultIdx}">
                        <div class="sp-palette__result-icon">${iconHtml}</div>
                        <div class="sp-palette__result-body">
                            <div class="sp-palette__result-title">${highlight(item.label, item.query)}</div>
                            <div class="sp-palette__result-sub">${escapeHtml(item.sub || '')}</div>
                        </div>
                        ${kbdHtml}
                    </li>`;
                }).join('');

                // Bind click on result items
                resultsList.querySelectorAll('.sp-palette__result').forEach(el => {
                    el.addEventListener('mouseenter', () => {
                        selectedIdx = parseInt(el.dataset.resultIdx, 10);
                        updateSelection();
                    });
                    el.addEventListener('click', () => {
                        executeResult(parseInt(el.dataset.resultIdx, 10));
                    });
                });
            }

            function updateSelection() {
                resultsList.querySelectorAll('.sp-palette__result').forEach(el => {
                    const match = parseInt(el.dataset.resultIdx, 10) === selectedIdx;
                    el.setAttribute('aria-selected', match ? 'true' : 'false');
                    if (match) el.scrollIntoView({ block: 'nearest' });
                });
            }

            function executeResult(idx) {
                const item = currentResults[idx];
                if (!item) return;
                closePalette();
                if (item.type === 'section') {
                    showSection(item.id);
                } else if (typeof item.action === 'function') {
                    item.action();
                }
            }

            // ── Input handler ─────────────────────────────────────────────────
            input.addEventListener('input', () => {
                selectedIdx = -1;
                renderResults(input.value);
            });

            // ── Keyboard navigation inside palette ────────────────────────────
            input.addEventListener('keydown', e => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1);
                    updateSelection();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIdx = Math.max(selectedIdx - 1, 0);
                    updateSelection();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedIdx >= 0) executeResult(selectedIdx);
                } else if (e.key === 'Escape') {
                    closePalette();
                }
            });

            // Close on backdrop click
            backdrop.addEventListener('click', closePalette);

            // ── Global keyboard shortcuts ─────────────────────────────────────
            let gPressed = false;
            let gTimer = null;

            document.addEventListener('keydown', e => {
                const tag = document.activeElement?.tagName?.toLowerCase();
                const inInput = ['input','textarea','select'].includes(tag) ||
                    document.activeElement?.isContentEditable;

                // Cmd/Ctrl+K — open palette
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                    e.preventDefault();
                    if (isOpen) closePalette(); else openPalette();
                    return;
                }

                // Skip all other shortcuts when typing in fields or palette is open
                if (inInput || isOpen) return;
                if (!isAppActive()) return;

                // G+<key> navigation
                if (e.key === 'g' || e.key === 'G') {
                    gPressed = true;
                    clearTimeout(gTimer);
                    gTimer = setTimeout(() => { gPressed = false; }, 1200);
                    return;
                }

                    const keyMap = {
                        'd': 'dashboard', 'b': 'schedule', 'f': 'money',
                        'e': 'expenses',  'i': 'otherIncome', 'a': 'artists',
                        'c': 'calendar',  'r': 'reports',   't': 'tasks',
                        'm': 'money',     's': 'schedule',  'p': 'settings'
                    };
                if (gPressed) {
                    const target = keyMap[e.key.toLowerCase()];
                    if (target) {
                        e.preventDefault();
                        gPressed = false;
                        clearTimeout(gTimer);
                        const section = SECTIONS.find(s => s.id === target);
                        showSection(target);
                        showKbdHint(`-> ${section?.label || target}`);
                        return;
                    }
                }
            });

            // ── Keyboard hint display ─────────────────────────────────────────
            let hintTimer = null;
            function showKbdHint(text) {
                if (!kbdHint) return;
                kbdHint.textContent = text;
                kbdHint.classList.add('sp-kbd-hint--visible');
                clearTimeout(hintTimer);
                hintTimer = setTimeout(() => kbdHint.classList.remove('sp-kbd-hint--visible'), 1600);
            }

            // Expose openPalette globally for CTA buttons
            window.openCommandPalette = openPalette;

        })();

        // ══ PHASE 5: DENSITY TOGGLE ═══════════════════════════════════════════

        (function initDensityToggle() {
            const STORAGE_KEY = 'sp_density';
            const comfyBtn    = document.getElementById('densityComfortableBtn');
            const compactBtn  = document.getElementById('densityCompactBtn');
            if (!comfyBtn || !compactBtn) return;

            function applyDensity(mode) {
                document.body.classList.toggle('sp-density--compact', mode === 'compact');
                comfyBtn.classList.toggle('active', mode !== 'compact');
                compactBtn.classList.toggle('active', mode === 'compact');
                Storage.saveSync(STORAGE_KEY, mode); // FIXED: density is volatile/cloud-safe, not localStorage-backed business state.
            }

            // Restore persisted preference
            let saved = Storage.loadSync(STORAGE_KEY, 'comfortable');
            applyDensity(saved);

            comfyBtn.addEventListener('click',   () => applyDensity('comfortable'));
            compactBtn.addEventListener('click',  () => applyDensity('compact'));
        })();

        // ══ PHASE 5: GOAL PROGRESS PULSE ══════════════════════════════════════

        // Wrap goal progress bar updates to add pulse animation
        (function patchGoalProgressPulse() {
            const bars = ['monthlyGoalProgressBar', 'financialsMonthlyGoalProgressBar'];
            bars.forEach(barId => {
                const bar = document.getElementById(barId);
                if (!bar) return;
                // Observe style changes (updateDashboard sets width inline)
                const observer = new MutationObserver(() => {
                    bar.classList.remove('sp-progress--pulse');
                    void bar.offsetWidth; // reflow
                    bar.classList.add('sp-progress--pulse');
                });
                observer.observe(bar, { attributes: true, attributeFilter: ['style'] });
            });
        })();

        // ══ PHASE 5: KEYBOARD CHEAT SHEET ════════════════════════════════════

        (function initCheatSheet() {
            const sheet    = document.getElementById('spCheatsheet');
            const backdrop = document.getElementById('spCheatsheetBackdrop');
            const closeBtn = document.getElementById('spCheatsheetClose');
            if (!sheet || !backdrop) return;

            let isOpen = false;

            function openSheet() {
                isOpen = true;
                sheet.style.display = 'block';
                backdrop.classList.add('sp-cheatsheet-backdrop--visible');
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    sheet.classList.add('sp-cheatsheet--visible');
                }));
            }

            function closeSheet() {
                isOpen = false;
                sheet.classList.remove('sp-cheatsheet--visible');
                backdrop.classList.remove('sp-cheatsheet-backdrop--visible');
                sheet.addEventListener('transitionend', () => {
                    if (!isOpen) sheet.style.display = 'none';
                }, { once: true });
            }

            closeBtn?.addEventListener('click', closeSheet);
            backdrop.addEventListener('click', closeSheet);

            // ? key opens cheat sheet — only when not in input and app is active
            document.addEventListener('keydown', e => {
                const tag = document.activeElement?.tagName?.toLowerCase();
                const inInput = ['input','textarea','select'].includes(tag) ||
                    document.activeElement?.isContentEditable;
                // Check palette isn't open (palette has its own Esc handler)
                const paletteOpen = document.getElementById('spPalette')?.classList.contains('sp-palette--visible');
                if (inInput || paletteOpen) return;

                if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                    e.preventDefault();
                    if (isOpen) closeSheet(); else openSheet();
                    return;
                }
                if (e.key === 'Escape' && isOpen) {
                    closeSheet();
                }
            });
        })();

        // ── Typewriter headline animation ─────────────────────────────────────
        (function normalizeNavOrder() {
            const sidebarNav = document.querySelector('.sidebar-nav');
            if (sidebarNav) {
                const tasksBtn = sidebarNav.querySelector('.nav-item[data-section="tasks"]');
                const artistsBtn = sidebarNav.querySelector('.nav-item[data-section="artists"]');
                if (tasksBtn && artistsBtn) {
                    sidebarNav.insertBefore(tasksBtn, artistsBtn);
                }
            }

        })();

        (function initTypewriter() {
            const heading = document.querySelector('#landingScreen .landing-hero-heading');
            if (heading && !heading.dataset.twDone) {
                heading.dataset.twDone = '1';
                const textNodes = [];
                const walker = document.createTreeWalker(
                    heading,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode(node) {
                            return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                        }
                    }
                );
                while (walker.nextNode()) textNodes.push(walker.currentNode);

                let wordIndex = 0;
                textNodes.forEach(node => {
                    const parts = node.nodeValue.split(/(\s+)/);
                    const fragment = document.createDocumentFragment();
                    parts.forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) {
                            fragment.appendChild(document.createTextNode(part));
                            return;
                        }
                        const word = document.createElement('span');
                        word.className = 'tw-word';
                        word.style.setProperty('--tw-word-delay', `${(wordIndex * 0.08).toFixed(2)}s`);
                        word.textContent = part;
                        fragment.appendChild(word);
                        wordIndex += 1;
                    });
                    node.parentNode.replaceChild(fragment, node);
                });
            }

            const subtitle = document.querySelector('#landingScreen .landing-hero-subtitle');
            if (!subtitle || subtitle.dataset.twRotatorDone) return;
            // Pages can opt out of the rotating typewriter by marking the
            // subtitle with data-tw-static="1". Used on the home page so the
            // headline reads as a single confident anchor instead of cycling.
            if (subtitle.dataset.twStatic === '1') return;
            subtitle.dataset.twRotatorDone = '1';

            const originalText = subtitle.textContent.trim();
            const lines = [
                originalText,
                'Switch between artists, bookings, and payouts without losing context.',
                'Track revenue, expenses, and balances from one live operational view.',
                'Keep every artist profile, deadline, and decision in one manager mainstage.'
            ].filter(Boolean);
            const uniqueLines = Array.from(new Set(lines));
            if (!uniqueLines.length) return;

            const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReducedMotion) {
                subtitle.textContent = originalText;
                return;
            }

            // ── Cursor-safe structure: text lives in a <span>, cursor is a sibling <i>
            // We NEVER overwrite subtitle.innerHTML so the cursor element persists.
            subtitle.classList.add('landing-hero-subtitle--typing');
            subtitle.innerHTML = '<span class="tw-text"></span><i class="ph ph-cursor-text tw-cursor" aria-hidden="true"></i>';
            const textEl   = subtitle.querySelector('.tw-text');

            function setStableSubtitleHeight() {
                if (!textEl || !subtitle.isConnected) return;
                const probe = document.createElement('span');
                probe.className = 'tw-text';
                probe.setAttribute('aria-hidden', 'true');
                probe.style.position = 'absolute';
                probe.style.visibility = 'hidden';
                probe.style.pointerEvents = 'none';
                probe.style.left = '0';
                probe.style.right = '0';
                probe.style.top = '0';
                probe.style.display = 'block';
                probe.style.width = '100%';
                probe.style.whiteSpace = 'normal';
                subtitle.appendChild(probe);

                let maxHeight = 0;
                uniqueLines.forEach(line => {
                    probe.textContent = line;
                    maxHeight = Math.max(maxHeight, Math.ceil(probe.getBoundingClientRect().height));
                });
                probe.remove();

                const computed = window.getComputedStyle(subtitle);
                const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
                subtitle.style.setProperty('--tw-subtitle-min-height', `${Math.max(maxHeight, Math.ceil(lineHeight * 2))}px`);
            }

            let lineIndex = 0;
            let charIndex = 0;
            let deleting  = false;

            const TYPE_SPEED   = 34;
            const DELETE_SPEED = 20;
            const HOLD_DELAY   = 1500;
            const SWITCH_DELAY = 320;

            function schedule(delay) {
                setTimeout(tick, delay);
            }

            setStableSubtitleHeight();
            let resizeTimer = null;
            window.addEventListener('resize', () => {
                window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(setStableSubtitleHeight, 120);
            }, { passive: true });

            function tick() {
                const landing = document.getElementById('landingScreen');
                if (!landing || landing.style.display === 'none') {
                    schedule(260);
                    return;
                }

                const fullText = uniqueLines[lineIndex];
                if (!deleting) {
                    charIndex = Math.min(fullText.length, charIndex + 1);
                    textEl.textContent = fullText.slice(0, charIndex);
                    if (charIndex >= fullText.length) {
                        deleting = true;
                        schedule(HOLD_DELAY);
                        return;
                    }
                    schedule(TYPE_SPEED + Math.random() * 18);
                    return;
                }

                charIndex = Math.max(0, charIndex - 1);
                textEl.textContent = fullText.slice(0, charIndex);
                if (charIndex === 0) {
                    deleting = false;
                    lineIndex = (lineIndex + 1) % uniqueLines.length;
                    schedule(SWITCH_DELAY);
                    return;
                }
                schedule(DELETE_SPEED);
            }

            // charIndex starts at 0 — tick() will type from empty naturally
            tick();
        })();

        // ── Collapsible sidebar (desktop ≥1025px) ────────────────────────────
        (function initSidebarCollapse() {
            const STORAGE_KEY = 'sp_sidebar_collapsed';
            const btn = document.getElementById('sidebarCollapseBtn');
            if (!btn) return;

            const EXPANDED_LEFT = 265; // 280px sidebar width - 15px (half button)
            const COLLAPSED_LEFT = 49; // 64px icon rail - 15px (half button)

            const logoutBtn = document.getElementById('sidebarLogoutBtn');
            if (logoutBtn) logoutBtn.setAttribute('data-tooltip', 'Logout');

            const isDesktop = () => window.innerWidth >= 1025;

            function updateBtnPosition(collapsed, animate) {
                if (!isDesktop()) { btn.style.left = ''; return; }
                if (!animate) btn.style.transition = 'background 0.18s, box-shadow 0.18s, transform 0.18s';
                btn.style.left = (collapsed ? COLLAPSED_LEFT : EXPANDED_LEFT) + 'px';
                if (!animate) {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        btn.style.transition = '';
                    }));
                }
            }

            const setCollapsed = (val) => {
                document.body.classList.toggle('sidebar--collapsed', val);
                updateBtnPosition(val, true);
                Storage.saveSync(STORAGE_KEY, val ? '1' : '0'); // FIXED: sidebar preference no longer writes app-owned localStorage.
            };

            // Restore saved state — set position without transition
            if (isDesktop()) {
                let saved = Storage.loadSync(STORAGE_KEY, '0');
                const isCollapsed = saved === '1';
                if (isCollapsed) document.body.classList.add('sidebar--collapsed');
                updateBtnPosition(isCollapsed, false);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                setCollapsed(!document.body.classList.contains('sidebar--collapsed'));
            });

            window.addEventListener('resize', () => {
                if (!isDesktop()) {
                    document.body.classList.remove('sidebar--collapsed');
                    btn.style.left = '';
                } else {
                    let saved = Storage.loadSync(STORAGE_KEY, '0');
                    const isCollapsed = saved === '1';
                    if (isCollapsed) document.body.classList.add('sidebar--collapsed');
                    updateBtnPosition(isCollapsed, false);
                }
            });
        })();

        (function publishAppBootHelpersReady() {
            window.showApp = showApp;
            window.loadUserData = loadUserData;
            window.restorePostBootUiState = restorePostBootUiState;
            window.__spAppBootHelpersReady = true;
            try {
                window.dispatchEvent(new CustomEvent('sp:app-boot-helpers-ready'));
            } catch (_err) {
                // Non-fatal: supabase.js also polls the ready flag.
            }
        })();

        if ('serviceWorker' in navigator) {
            // AUTH FIXPACK 2 2026-04-27 (Fix 7): the controllerchange auto-reload
            // (introduced in Fix 6 on 2026-04-26) was triggering reload loops during
            // the OAuth redirect dance and killing in-flight clicks (sidebar collapse,
            // logout). The marginal benefit (auto-pick-up of new SW) is not worth the
            // regression risk. Reverted to the canonical CLAUDE.md §2 approach: users
            // get a fresh shell on next manual reload after the new SW activates.
            window.addEventListener('load', () => {
                const assetManifest = window.SP_BROWSER_ASSETS;
                if (!assetManifest || typeof assetManifest.url !== 'function') {
                    console.warn('Service worker registration skipped: browser asset manifest is unavailable.');
                    return;
                }
                navigator.serviceWorker.register(assetManifest.url('sw.js')).then((registration) => {
                    registration?.update?.().catch(() => {});
                }).catch((error) => {
                    console.warn('Service worker registration failed:', error);
                });
            });
        }

/* ------------------------------------------------------------
   Landing notebook ink-reveal (B6c) — additive, no critical-path
   dependency. Runs at DOMContentLoaded, honours reduced motion,
   and is a no-op if the notebook isn't on the page.
   ------------------------------------------------------------ */
(function initNotebookMainstage() {
    function flagHomePage() {
        // B7b: tag #landingScreen as the home page so the no-scroll grid kicks in.
        // Only the home (index.html) renders both the hero stage and #landingScreen.
        var screen = document.getElementById('landingScreen');
        var stage = document.querySelector('.landing-hero-stage');
        if (screen && stage) {
            screen.classList.add('landing-home-page');
        }
    }
    function reveal() {
        flagHomePage();
        var notebook = document.querySelector('#landingScreen .landing-notebook');
        if (!notebook) return;
        var entries = notebook.querySelectorAll('.landing-notebook__entry');
        if (!entries.length) return;
        var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion || typeof IntersectionObserver !== 'function') {
            notebook.classList.add('is-revealed-all');
            // Tag entries inked synchronously so per-entry rotation transform applies.
            Array.prototype.forEach.call(entries, function (entry) { entry.classList.add('is-inked'); });
            return;
        }
        var io = new IntersectionObserver(function (records) {
            records.forEach(function (record) {
                if (!record.isIntersecting) return;
                io.unobserve(record.target);
                // Stagger reveal: 90ms each (faster for 22 entries vs original 140ms x 5).
                Array.prototype.forEach.call(entries, function (entry, index) {
                    setTimeout(function () { entry.classList.add('is-inked'); }, 90 * index);
                });
            });
        }, { threshold: 0.2 });
        io.observe(notebook);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', reveal, { once: true });
    } else {
        reveal();
    }
})();
