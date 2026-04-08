/**
 * Star Paper - UI Initialization Engine
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Fade-In Animations (Intersection Observer)
    initScrollAnimations();
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

function hideBootLoaderElement() {
    const loader = document.getElementById('appBootLoader');
    if (!loader) return;
    loader.classList.add('hidden');
    setTimeout(() => {
        if (loader && loader.parentElement) {
            loader.remove();
        }
    }, 450);
}

function markRootLayoutReady() {
    document.body.classList.add('loaded', 'layout-root-ready');
    // Do NOT add layout-ready to appContainer here - only when user logs in
}

function initializeBootSequence() {
    let completed = false;
    const finishBoot = () => {
        if (completed) return;
        completed = true;
        markRootLayoutReady();
        hideBootLoaderElement();
    };

    if (document.readyState === 'complete') {
        setTimeout(finishBoot, 180);
    } else {
        window.addEventListener('load', () => {
            setTimeout(finishBoot, 180);
        }, { once: true });
    }

    // Fail-safe to avoid a blocked interface on slow or interrupted loads.
    setTimeout(finishBoot, 2200);
}

function getSectionIconMarkup(iconKey) {
        // All icons use Phosphor â€” <i class="ph ph-*"> for consistent rendering
        const phClass = {
            money:      'ph-currency-circle-dollar',
            schedule:   'ph-calendar-blank',
            dashboard:  'ph-squares-four',
            artists:    'ph-microphone-stage',
            bookings:   'ph-calendar-check',
            financials: 'ph-chart-bar',
            expenses:   'ph-receipt',
            tour:       'ph-globe',
            otherIncome:'ph-plus-circle',
            calendar:   'ph-calendar-blank',
            reports:    'ph-clipboard-text',
            tasks:      'ph-clipboard-text',
        };
        const cls = phClass[iconKey] || phClass.dashboard;
        return `<i class="ph ${cls}" aria-hidden="true"></i>`;
}

// Ensure all existing functions from your previous index.html 
// (e.g., showLoginForm, signup, saveBooking) are moved here.



        // Storage Helper
        const isCloudOnlyMode = () => Boolean(window.__spCloudOnly);
        const CLOUD_ONLY_STORAGE_KEYS = new Set([
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
            'starPaperTasks'
        ]);
        const closingThoughtsMemoryStore = {};
        function isCloudOnlyStorageKey(key) {
            return isCloudOnlyMode() && CLOUD_ONLY_STORAGE_KEYS.has(key);
        }

        const Storage = {
            saveSync(key, value) {
                try {
                    if (isCloudOnlyStorageKey(key)) return true;
                    localStorage.setItem(key, JSON.stringify(value));
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
                    if (isCloudOnlyStorageKey(key)) return fallback;
                    return JSON.parse(localStorage.getItem(key)) ?? fallback;
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

        if (typeof window.runStarPaperMigrations === 'function') {
            window.runStarPaperMigrations();
        }

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
        let users = Storage.loadSync('starPaperUsers', []);
        if (!Array.isArray(users)) users = [];
        let artists = Storage.loadSync('starPaperArtists', []);
        if (!Array.isArray(artists)) artists = [];
        let managerData = Storage.loadSync('starPaperManagerData', {});
        if (!managerData || typeof managerData !== 'object' || Array.isArray(managerData)) managerData = {};
        let credentials = Storage.loadSync('starPaperCredentials', {});
        if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) credentials = {};
        let revenueGoals = Storage.loadSync('starPaperRevenueGoals', {});
        if (!revenueGoals || typeof revenueGoals !== 'object' || Array.isArray(revenueGoals)) revenueGoals = {};
        let bbfData = Storage.loadSync('starPaperBBF', {});
        if (!bbfData || typeof bbfData !== 'object' || Array.isArray(bbfData)) bbfData = {};
        let bbfViewState = Storage.loadSync('starPaperBBFViewState', {});
        if (!bbfViewState || typeof bbfViewState !== 'object' || Array.isArray(bbfViewState)) bbfViewState = {};
        let audienceMetricsStore = Storage.loadSync('starPaperAudienceMetrics', {});
        if (!audienceMetricsStore || typeof audienceMetricsStore !== 'object' || Array.isArray(audienceMetricsStore)) audienceMetricsStore = {};
        let audienceMetrics = [];
        let currentUser = null;
        let currentManagerId = null;
        let currentTeamRole = null;
        let bookings = [];
        let expenses = [];
        let otherIncome = [];
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
        const MOCK_PORTFOLIO_VERSION = 'portfolio-seed-v1';
        const CLOSING_THOUGHTS_STORAGE_KEY = 'starPaperClosingThoughtsByPeriod';
        const EMBEDDED_REPORT_LOGO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAADnvSURBVHhe7Z0HVFVHE8ftYgPpvfdeBEE6AjYQlI4UpSpFpIOiolhARUURO7bYK3ZssQBWsPfYkph8SdSoMZYkhv935uLV57Wmi+7vnDnwHq9c9s7szs7OzjZpwmAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYjI+dxMTEwIyMDGPh8wzGRw+Aljo6Ok/MzMzWC//GYHz0REZGurZt2xYSEhKP0tLSJIV/ZzA+agwNDWc1bdoULVq0gKWl5UDh3xmMj5bKykpJBQWFO+QJkWhoaBwH0Ez4Ogbjo8TBwSGwVatWnPKTdOzYEfHx8Z2Er2MwPkq0tLS288pPQq6Qnp7eROHrGIyPjvT0dF0pKalfRQ2ARFFR8VsArYWvZzA+KhwcHIqaN2/O9fqiBiAmJgY3N7fewtczGB8NFPvX1NS8ySt9p06dHujr6z/l3SBdXd1twvcwGB8NkZGRvSn2TwrfrFmzp6NGjap2cHB4zD8nJSX1W25urqbwfQzGRwGt+vKuj5mZGfbv3//AysrqqZaWFhkEJzY2NsOE72MwGj1z5sxRlZWV/Zl3f/Ly8nDs2DEYGBjA3NwcCgoK3PMqKiqXADQVvp/BaNQ4OjoO5mP/7dq1w969e7F161bIyMhwo4GFhQVoctymTRsEBQW5Ct/PYDRqtLS0TvK9v6ur65MrV678unjxYi4VwtDQEI6Ojs9HAUNDw3Lh+xmMRktsbKyVuLg4H/L8vaio6O7ly5efTp48mXtOWVkZDg4O3ChAj6Wlpe9OnjyZJcgxPg6srKxm0gSXlFtJSQlVVVW/kf+fmZnJPUduj7W1NZydnbm0CHKFXF1dE4Wfw2A0Og4fPtxBQUHhG979CQ0NxcmTJ7Fv3z7y9flRgdYA4OLiwrlD9FhRUfGg8LMYjEaHt7d3EPXwvKLPmTMHBw4cQGVlJdfj889LSkrCzs6OE5osi4mJ/R4WFmYp/DwGo1FhaGhYySu5np4e1/Nv2rQJq1at4h7zfyMXycTEBE5OTpybRM8ZGxvPFH4eg9FoKC4u1peVlf2NV/K4uDjU1NRwyl9WVkaT3ecGQEJRIHt7e25dgB7Lycn9SHsHhJ/LYDQKrK2tC1q2bMkpM/387LPPuNg//czPz+dCoKIGQK4PKT8ZgYSEBPd3R0fHMOHnMhgfPJTarKioeJVXbory7N+/H8uWLUN5eTliY2NfUn5eNDQ0OAOgSTE9VlFR2S/8bAbjg8fd3d2dT3IjSU9Px549ezB37lzO/enZs+cryk/Svn17yhKFlZUVN2p06NDhaUJCgqnw8xmMDxptbe3VvFJ36NABK1aswMqVK1FSUoIJEyY8X/QS7gsg0dHRga2tLYVCuccODg5zhJ/PYHywjBkzRk1KSuoRr9Bubm5c2HPWrFkYP348hg4dCnl5+VcUnxcKidIoYGRkxD1WVlb+sba2to3wexiMDxIrK6sUfvJLMnz4cC7yM2nSJG7yS9Eg0b8LhUKi+vr6nBFQCgWtDPv4+AwQfg+D8UGiqqp6ildmCm1S1GfGjBkYPXo01/v7+Pi8ovRCkZWV5eYBmpqa3GN9ff0q4fcwGB8cwcHBjpTuzCtynz59ON+fXJ/c3FxuMkwRIaHCC4VCoLRXgNwg+l1cXPzX7OxsI+H3MRgfFCZGRmt4JaYJLvX6M2fOxIgRI5Camkr1fyi0+YrCv07k5OS41WEpKSnus2xsOk0Rfh+D8cGwbscOWXl5uV94BaaY/uzZszFmzBgu83PQoEFcApxobtDbpHXr1tx6gJqaGvdYUUH+f6x0CuOD4yzQblnJaD8Ha9OZLVq+WN3t27cvZs4sw9DcoUhKSkJ0dDS6du36iqK/TeTk5TkjoLIpYq3aIMC3V1lZyWhrAC2E18Fg/KuQEk7MjBoyeoDDtUlx7lCR6vBccZu3bIGhecMxblwRhqSlIDpmACLDw2FkYPCKkr9NxFq3gpaWJmRkZbnH+qrSmJDkhKH9bM9MGzkonO0fZvxnLJlX4lEQ7Yw5A03hY0lx/ReLWnoG+igunoLsnGGITUxESHgYNyJIS0m9ouSvF/qshs8TE2sDaamGxLlmTZog3EED44I0MDrKCYvmzWOrxIz/hrIRESvzA1QwM8kGLhYNqc2S4m0g1rI5fH19UFBYhIT0LERGx8EvKBhdnJ3Q5NnOsDfLyyvDcrJSv7k6Wt/KGhx3SE1R7nt6TldKElP766EoTBdTc8OnCa+LwfjHuXr1qnhpWrcfpoWrYngvGcwZFgo5KQnMGtEHFeN8UJLmiWFxPRAV5IlAX1f49OoKNdWGyezrpGmTJmjbuiWUO7ZDFyMlpEW4YMOcRHx/vvzX+qf779TXX/122byC+zQCDA+3QlE/fUyM0MCk5K4XAPoIBuNfZOLoXLspsS6YH6uLnO7yKI62wez8cOyZHYyb68NQN7MnNo1wxMyB5hgfoY/8YAOk9tTBQA9tRLpqIcxRAxHOWhjQVQsDu+sg1VsfwwONMTbMCHMHW6GmtDe+2pGE364UAk/XAqjG0Z2zHmUF2mBhuj1y+yhjepwuCuO6/FpSMslaeH0Mxj9KxZZN42Yke6MwVA+dtaXQz7YDdk70xYzMXhge5YDy3J5YnOWIRcnGWJRggoWDjDA/XgcL4gywIMYE5dHGWBBtjPkxJEYojzJAeZQeZkbpYXqUAeYOtsPK0V5YMzkS00dFw8/L5fdwF72nmyb0QKa3IvytFDAu1BDTs/vh888/ZxvoGf8ux06ccV0xaxK622hxLoyriSxGeMuhsiwOvbuawdRUF86OFujtbIA+XdQR4qSJhB76SPfRQ25fHeQFGGB4oCEnOX76SO2tgzgPDfh3VoWLoTyMlCQh217s+ZxAql0LrB4bgtJBxuhhJoHWTZrC39kU6z+bj6+/e8Amwox/n7qzl5KsbW25LY/S7doiwlYKEyL0sWFKfwR72cDKzh6m1rZo0ZoUuWGC26JJU7Rq1hRiLVtArGVLiLVoiVbNmqNpE1o/EJ0g0+/Nud9Vpdpi1TgvrB7pjHB7OahLN4Rb7R3sb31x7VoGmwMw/hN69eplIC4uwRkApSo463dEsosMSvsbYF62J3p3NYSknMwrE943y4vQJy9q0m2xfGwfnFoSisyeyjBX74gOEh2510lLy/w0ceJEeeF1MRj/Cnp6elP5glftxSWhZ2SCAe76yPNUxPRoPZRlO8FUXY77e/Om7wp/NvT2okZgpiaDHTPC8d3uBEyKMYWZiiTatW4NeWUVtGnXHq1atqQCWkOF18Vg/OPQqY7y8vJcXL55s+ZQUFCFp5cvevXwRF9bdYzorYSZMQZYNMwLnfRVG4ykbSsYKHaAlpQYtKXbQFuqFQyU2kGxI2WPkgG86P27W8jg9PrBeFw7EuXptrDWbhhJWjRvARVFFcjLNJROUVBQOMFcIMY/Rn19faujR4+q+Pr6qsTHx9tFRER4WVpa+jk6Oq7kqz1Tno6RkTGX6Kakqo7mzZog2FYNM0I0sS7XCivH9YajuQF0JFtj2xRPXNscgwvrInFlUxS2THCHd5eGiTSJkngLpIYY4vaR4Xh6fgQWDLVDZ52Xy6dISnSEmqo6V0WCUq+Tk5N7CK+bwXgJytupr69vO2nSpLalpaWKWVlZlgYGBpbBwcEB3bt3j1dUVBzk4OAwW1NTs1xKSmqxsbHxcQUFhVOSkpJXlJWV6RSXx7RhnXZokeLRLi1eISld2c3NFaamps+fo4ludDdjbCvwwPIh2lgy3AW5vfWwY6I7cH4kHh7Lwu9nhmPPpO4IslWFuUZ7DPJRx/apXsCZsfhhfzZKEjvBTu/V1IlmzZtxKdVUWp0eq6iofKWmplZuampa7ubmNk9bWzuJ/qfAwMAQBQUFSzs7O8uxY8dazpw5UzMsLKztkiVL2lJbkHEL24nRCPjuu+/kVq1apRQQEKCUkpJilZWV1dPe3r6ngYFB38DAwHwbG5t8cXHx/E6dOq20sLDYLiUltV1LS+uymprazXbt2t0UFxe/R0WpnpUg5H6+bnP6+wi9T1tbm9u99fJnNPjyAU66WJTpgNkJ6ijoI4+tRe54VJeL21VD8PPRHFSMs0dKNzlsm9IXF1cH4uSCPlg51BmDumtCR+7FxhqhUN0gSpPm5yCiQsbJZY+KiXGbaSj9moxFUlLycatWrW5KSEjcpLPK9PT0rklISFTq6upud3Nz266jo1MiLy+fb2trm9+nT59cCQmJXrq6uj2DgoJ6FhQU9AwODtbt1auX0tixY5VOnDihBIBNwP8KqampYl5eXmbW1tbmVlZWnWNiYmLs7e1jFRUVY21tbSfa2trOU1ZWnqeoqLjGzMzsBPm7YmJiJ1VUVO7Jy8s/atu27SPqlWkTOX+zKYdetHd+H+HfR4pCLgVVcaCenio102fTT3r+dft46XkqaPu2HH91hY4Id9FFendlbCl2xeO6XNypTuUMoaLIBdH20khy1UKSqzz8TNvBTPbNn8ULKT4ZAP3fwr/9FaHPpfagToF+p5/UHmRAbdu2/U1MTOwRbfhXVlZ+pKWl9VPHjh1PKSoqnjA3Nz+hpqa2XlJScp6BgcG8bt26zTM1Nc2Tk5OLpXs6cODAWA8PD2e617GxseYLFy40nz17tklxcbGKUC8+Gfz8/NypDiYpFjU0KbPQvfizwis1fSYpMO2uou9SVVWFuro66FwuKj/CC/XitP+W/kZCLga9h3d53jRC0J5f6o1ffv7lXpkiQErt2yDEWgLbit3x5MRQ/FidxhnAurFdkOQmhX5WUhjgIIdQW0UEOeohvEdneNqbQ0XhdWHUhmuha6Nrpv3DJGSspKz0f7/pev9NoWuge8nfW7ouMlhqL6qKQdceHBycL9SLT4bVq1e3dHZ2Hi2skck3Hv2kXogajW423WQ6TIIajj9bq3PnzlxBWVdXV3h6eqJ79+6c9OjRgxN6jjah0N/pFBaqt0PVFqguj7GxMVd9QVT5qRYP+fTUo7/OvRCVZ3t1RZ6j1z9LYW7ZAroybeCh0wFhdlJI9dJCsock1o93xi8nhj03gJXDbDHcSwHjgnQxLkgTE0I0MSvOCJtHuuHI/FAcXZmA7fNTMGlYCFydrX9r0azFk4bvaLg2Unq6dvp/qLy6l5cXAgMDER4ejsjISO6nv78/1yZUeZrajf5HUsi/o6P5s0JGYWBgsGLGjBnthHrxyUGej5qa2g3RBnJ3d+f20lIpkWnTpnFVFaZMmYLi4mKusNTYsWO5EiPDhg1DVlYWBg8ezJUbpBtO0RiqvEA3nZSfDIRXfDIaUnxyW6g6M40E/ISSlEJYr/Nt8rpetlXz5jCWaQ1fs44Y4a+NdSNccHxRIL6uTMLZtf1xYkUIfjqc+dwAVhc4YZivLEb6KGJ4TyUM91bB+GBNTIvRxaIhJtg+3gWnVobiXm0ufvl64S/H9s06Y2KoO6VZs2bHX2egpFhklDTS0dljZPi0D6F///5ITEzEkCFDOKHfaYcatRW1E3UktPOMOhmqaPdH2uGPCrmNDg4O2UI9+KTJyMiQ1dLSOsj72XQTEhISuFLiBQUF3H5aUnjeAOh3Uny6kTExMYiIiOBuJlVhoF7Qw8ODq79PRw/RzaVJKik/RWqoF6T9uuTi/FGlf700GIKahBi8jTtgSrQR6haG4F5VFn49PhQPj2bi/sEheHAkAz8dzsCd6iH4sSYVdw+l4bsDg3FteyzOrQ1H9SwfrBthj7I4XRRHamD+EAtsm9QLRxf1x5XNqbhfNxb4fiXqH+5ecbJmfnBvX9+hGhoqF8kQKJ361et6VcgNIQMh142MnzoCahvqIKidqGIFtRG5hWQMf2WkoO+i+0gdBd9ZSEtL34qMjIwQ3n9GQ8y9vZmZWTk1Ot+I1JPPnz+f6+HpRlEvRUodHBzMVVggw6CejE5eoaGelJ9GD1J+KjLLKz9VV6AbTjf+71H6F9KiWTN0VpdAZm8d7J8TjAdHh+JRbQ5+PJiKOzUp+PFAg9ytGoK7pPwHU5/L3YOpuH8kAw+OZeJRXTae1Gbjzv5UnF0Rie0T3bF2tAMOLQzHnUNF+P3rNcDdnQDOAr8fw/en5+yL7+d2pPlrRoK/Krz/Tu30upHmbUKvJ7eWDIhvZ/o8AwODq6zO6Xvg4uKSS5M5vkFJmZcsWYLS0lKEhIQ8P0CCbhD9Tj0WGQWVICQ/mHx9GxsbztUh//hZBOMP38j3kXYtWqCHiTSmxpvi622J+LkuBz9UpeL2gTTcPjAEt6sGNyh+1RDcqx6CezUNin+nZggndw81GEnD4xTcrR6M+zVD8OhoFh4ezcHXO5NxZHEIDi3uj6+PlQCPq/D0wV5crR6DA2Xe8HPUfuWa/kuhXp/cL5rk8u1No7qVldWeXbt2SQnvNeMN+Pj4xMrJyT3lG5b8WXJ/5s2bBzpdkXxavmoaL2QQfDjzbZGbv0vEWjRHoI0y5iVZ43/7s3GvKgG39ibi1v70ZwaQgttVyfjpYBoeH8vFwyNZz0cA3gB+PJiOe4cz8bAuFz8fy8b9mjTcraLRIgU/Vqdwo8NPtdm4uW8QTq6MxI4F0bi0LRM1ZT2wf3of2Osrv3Jd/5WQb08jNI2yIi4PuVelAJoL7zHjHURHR3uqqKjc4RuYJqtUXY2fEBcWFnKRDoqECG/GPytN0axJc4TZqWBivCmu78nGD3uT8N2eQbi1Nwm39qXi1oHBuF2dwCn1d7uHoGpGH5QPMcKBWT3xsDYXP9ak4edjOdgwzgVzh5hhy0R3nFgWiu/3peBh7TDcP5zFzRU4Q6kegp+OpeNG5SDsLvHGpXXROLfMFzum+0O24wt38b8Uugc0n6B5Ff8cjQL+/v4ZwvvK+AOkp6frq6urn+QnYtTLREVFcWXGyQBoQkxFpyg8Krwpf7+8CD/2NFdBaZQR9i2Jwf+qcvH19mh8t4dGgGTc2p+AO9XJuHcoFwfnhWBesimKw7WR060jtk/0wGNaB6hJ4wxhQZol97eyeCMUhqhgarQuKsa54frWBDyqHca5SLdrEvHgWBY+n+WDM6sG4GpFLK5t6o9Zw3q/5hr/faEen9xQ0XC2nJzcrUGDBvkJ7yfjT1BdXa1oYWGxW3TiSv4+RYeKioo4Q6CRga+g9s9JQ5xfUbIDSgfZYlmuLa5Vjca1TZH4ujIG3+0ehFufkwuUgHsHs7BjSm+Up1liaZYN5gyywsjeStgxqTseH39hAEuzLLis0aXpXVAaZYIxAdrI7i6J/L4K2DKhO77bl4InJ3NwY1syKgrdcXljNK5ujMI3u1MQ6d3pNdf47wn5+BRYIPdUdD1EW1v7i5ycHAvhfWT8RSwtLWeTj883NDU+RYHIAHgjoMUs4Y36uyW2uyE+y+qEvYsi8fW+bFzdEIovt0Xj253x+H5PAu7WpKJ6TiDWjHDDzuLuWJbdGXMGGWNkb1lsn9TjuQE8qhuKJZmdUBavg+VZnTAj2hjj+2kj308dud5qGNlXFTPidVG3OBxbC71RMd4TdUv74cb6MJxZnwA1edoY8+r1/RtCE1taR6HoGl8MmDooY2PjfaWlpWyy+0+hqamZIBompVBbQEAARo0ahYkTJ3Llx4WT479TJNq0wbw0Z6zMs8DZXcNwY3MUvqgIx/UtA3BzRxx++DwR17fFY8MYVxydG4rt492wPNsKCwebYpS3Aion9HzJBVqeaYHJkYZYnOGGBUmdMKW/Dsb4KaHAVxHF/XQxMVQbY/3VUBymg7UjHLGv1Bc314Vj9nDvZ9fUkHQnvM5/UkjhyeWhVXR+3YbuiY6OzixWqe5foHfv3nHS0tK/8jeEUhdoxZPmArRyTAdS0EKO8Mb9HWJnoIIt47th03hnfHFgFM6vDsXlDWG4uikSX22Pwa39SThUHoDPp/vg6PxA7Ch0xbq8zhgVaoEkZ3ku/ZnLBaIRoDYba0bZo5uxElSlOsLDQhlJPfRQEGSEScFamBqmg8mRepgcoYdp/Q1QnmiCjaMccGJJFJwsXuwh+DeF2prWVah9+XkZ/bS0tPx0c3r+Czw8PByUlJTu8OE28kEpH4ZWhWleMHLkSG7FV3gD/6r072GEvcWu2DmlB65WFeDM8gBcWBuKKxURuLE1iosEfV7qi6MLQnFkvi/2THTHkqyuMFOWQZiTMnZP8XjJANaNcoa9kcLzz2/apCm05SUQYK+Nov4WmBlriKkRupgcro9pUUZYleeAcQPd/vVen4QiPLRSLOpm0gTY19c3S3h/GP8Co0ePtlZSUrrM3wwamskv9fX15SbIVJv/7zaC/KjOqCnpir3TfHClZiROLvfD+ZVhuLwuAtc2DsDNyoHYPa0XTiwNx9FyX9RM64bxsV0g1qIFErrKo7KkB57wc4DaHFSM7gIX49dlfDaBkkx7xHrqYFasCUqiDTE1WgelKc7QU/63w74NIWhSftEwp7S09O3ExER/4X1h/It4e3tLa2hoHOEjRLQIRj0UrR7n5ORwtflFd2r9VSke7IQjM7pjz1QvfFGTjxPL/HF2eTDOr+6HL9ZH4ub2eOye5oW6Jf1Qt8gfB0u7YV62E1TaiyPBSRk7SjxeMoANo+3hbNxQ+flNYq4tjeGhBihL6IIuJg29b/PXvO6fEHJvaHGLEglF11u0tLSuDRs2zFJ4Pxj/AdevX5cwMTHZxE/IKFJEIVHyVQcOHMhljlpaWr5yc/+MTB7sjLrZvbBzsicuHhiN0ytDcHppX5xdGYRLa8Pw1bZYVM32R9Xsvji9NAgHpnXnQp/xXQ0Q1UUOu6d4irhADQbgZPT6EUBUpNuIwUiZ3x5JdYRefc3fLdSOlE5Cys+nptBzhoaGB/Pz86WF94HxH0JL7Z06dZrBb1SnEYFyUugG+vn5cdmj73M217tkdIw9Ts33xs6JLji+NRNfbE3CiUW9cWZFEDcKXFnfH+dWR2HrxG44vbwf9pf2QGWhK5bl2iHXRwk7J/Z4HgUiA9hYYA+XNxrA2yI8b3r+7xFyJym+T+3H73ajfCojI6O5tJ9Y2P6MDwR9ff14focWTZBphZjCdZQkR1Giv2oECX6dcHapD6qmOGPPnCB8WV2A2vl9cGpZEM6uCMWF1eG4ujkG+2f2xa4SHxyc54cthS5Ynm2Hgr4KqCzu9mIdoDYbW8a4wsWA96v//mS9PyO0g44CCuT68K4lKb+Li0uxsL0ZHyDBwcHRoqkRlJNCRkBuEKVO05AuvOnvloYe193OCKdWRaC6xAXrRzvh7LYsXKhIwrFy3wYjWBmK82si8EVFHCqLe2HbBG9sn9AVy8gA/JSwo7g7txHmR9oTXJuD9aO6oncnVbR+NnL910JtxUd6+GxOyqZ1dXWNFrYz4wOmX79+rhQm5W8s5alQj0ZRIdpjQJtjhDf/7dJgAHLS0ji1aThqStxQMdIei4e74NKu4TixuC/qFvvh9PJgnF0VgYsbInFtSwz2lfXGymHWKE+xRL6PvMAAcrE0xxqTYsxQPioMSRG9Hhtqazyg4levfv8/K/xoSfMmPt2cRF5e/paPj4+rsH0ZjYCxY8d2MjQ0/IFfK6CJHBkBhUppzwDtBRYqwvtIScHAn06uin28ZmgnlEYboCzNCec2JOHUogAcX9IXp1eE4+LaSFypiMQ3Owfh4poBqJzoiYn9VFBZ7PFSLtCKobaYFKaOsjhjzEy0/mXdlKj7U8el1CmpqqwVExN7/OJ73zYf+GtCbg7tkKNoGbk/9Bz1/lJSUkcSExO1he3KaETMnDlTT11d/TC/akkTOlrFJJeI/FzaIC5UiDdLgxJqqCg9uHRg+qOlmVaYHq7FFcQdGaiPg7ODcXJ5IE4sDcL5VZG4vC6SWxv4dtdA3DmQim92JOKbnYmc8lNZFDKAz7JsMDFEC2UxZhjVWxmDnaQQ5675w0A/27mZgwekWViZrhATa8UV4P0nhIIG1B50IDefYkIdhq6u7o7CwsKOwvZkNEJqa2vFzczMdvFGQOFS8nHJCEheLWvyNmnwi/PSY54cWZX1NKNrOyQ5KqCfuTiSPWSxfbIXzq+K4CbEF9eE4+qG/vhyWxS+2RmLO/sHcXuD71SlcvLgaDYqi7uiZIAmisN1MNJbGSlOsuhnIQFvQwl4d1K+l9rfvSw2qq+/jq7Wtlev5a8JTWxpRKSkQr6+EBmBoaHhHGEbMj4CDAwMZvE3moZ4WsbnFUB0C+b7SbPf1iwa983CUX2fhJu1QZSNFIKtxRHbRRyL021wbGEAzq4OwaV1/XBjczRu7ojH958n4E5VynMDuFM1BD9WDcGVDdE4PCcQFaPcMSPeHOndlOGr1w5Oii3gqNYG3S2UrpSMGliclzlgvbwcvxbw1yJG9P/SfIhCxXzHQAbRtWvXAmG7MT4i3NzcSkWVnSbHZACUQcqn9b6vtG3b9n717mXVk5M9akMt2iHCvAOirToiw1MOq0ba4/Ci3ji7NhhfbYvHNzsT8L99g3GrivYJp3C7vG5Xp+CHvYn4cms0Lq+PxNnloTg+1x+7Jnljfpo9UntooLt2W1hKNYO1shiKUno/rpiZC2Ptv7b5h0Y8mgdRxEdk6+IT2oYqbC/GR4iVldUg0ZRqSqSjSSC5RX/UCOTkZe9OmzklZu7oAatmxXTG1nxnHJ7nh8PzfLG7xB1bx3fF/uk+uLwhGrdrhuDe4TTcEhjA9c1ROL86DMe51Alv7J7kgc3jnbEh3xGzE2wxyEMHdmodYNihCeK6KGBqhg8szf5ctisZPPn8omkNmpqad4KCgpyE7cT4iPH394+UkJB4yCsBTY4p4YtcgrfV+XxZGtwQqlEamxCbXH9vd+LlyvSfauf64Mhsbxwo7YENI50xa6ARpkZrYVGODU6ujMBPRxtqA9FIwBvAhdVhXO5QTWkv7J7QFZtHdsHqTGt8lmKJBeldMHWQM/wsZWEl0wQ+ZjKYOToZtvadn13HuyNE1NPT3gnRkY6iP4qKikcLCgoMhO3D+AQICAjoLicn9wuvJDQ5pnkB5bwLFej10hRNnxlBs2YtINZBZtI3V/fn/3Jl8c91iwKxb5oHNo5xw6I0S8xIMMTOEj9sGOOEx8dzuN6fc4WqUvDtnoG4uD4MtYv8UFXaCzsndMXGkY5YkWmLBclmKIvVw8xYIywd2gNBLhqwVmiOoM6amD2jEMoqKg0K/sq1vRCa75C7Q/lR/I46iv5YW1vv3rJlC4v0fMp4enray8rK3uWVhXrH19UqfT9pChkZqf8tXDD2f49vrMLXO5Kxe6ITlqfYYHaSCY4sCseWia5cASwygJ+OZmL7ZHcsH2aDIwuDULckFNVlvbFjgjs2jHTE8ixrlCebccpfEqGLkv6GWDjKHyH2ynBTb47UyF4YnpeL5i1erVotKqTs5N7xeVIUCLC2tp4ubAvGJ4qxsfFsfjJIE0T+4Ik/Li9KCDrYmmBBUTRqyqOwtdAOi7O0cXB+f1QU9cCj49mcC/ToeA63aT7RoQ1G9FHEimG22F7kjp0TumP9CGcsy7TG/CRTlMUYYlqkHiYFa2NytDlmZnshyLwNAjrJYFhGEjq9I7+JXB0+tYFGgL59+84WtgHjE8bc3Hw5ryy04YN8ZaES/VnRUJRBYFcjFMbZ4tDCOGwo6obHJxoM4GFdNpbk2CHDQxHDeitg/0wf7J/ui6WZNlg/wgXLMjs/N4CSSD1MCdVDga88yrO6YnSwEfpbt4Ofuw083T3Q9C1V78i4KdJFcxsyBnt7+xhhGzA+YbS0tDaRotAcgPJgRMv6/V2iriiHmsUJ2FxEqRCUC9RQFeKzHAekucthZF8lnFoZjgdHM3FsUTDmDbHG0kx7lCdZoCzGGCWRBigO1UZRkAYm9tPHZ9nuSHTuiIAu6rAyM0Gbdm9fx6C0D35uo66uvkLYBoxPlPr6ejFVVdUvSTHI/6eEMEqP4P3lv0s0VRRQvTgBmwQGsDzHBkNcJTAuWBVfb4vDnZpkPKodgeq5IZg50AjliQIDCNbEqD6qWJLtjjFBuhjgpAJ1eWm0af/21WyK/lCEi35XUFD4EkBLYVswPkGmTp1qwFeYoB6SQqE0CvzR9YB3iaaKPKoXJWBTYdeGZLhn5wMsybJErp8WVhb0xN0qKpybxOUJPTg6DCuHdeHcn7JoI0yN0H8+ApABzEqyw+z4Tsjopgbljm3RtPnbDZb+L35/NM1z6Gw1YVswPkF69uzpRb4x+cnU8/MG8O5Q6LPwZ1P+cVM04X6n5191n8gADi55ZgBcOnSDAdAIENVV57d96yft/PlU3qP7hwfjzsGG+cGp5f0wOUIHZTFkAHooDtHhDGBMXzWURJliabo9RvbRharUu+uD0tyGkv9oDkBiaWkZJWwLxieInp7ecFJ+io5QpITcBHKDSGHeNg+gw7E93R0q+vbuka0gK8e5UA3y+gUpTRVZ1CwZiE1F7pwB3K1J40aCtSMdYKXUAhZWtlX135dff3gsreHcgEOp+G7fYMwYaIbpUXpcGHRSsC6KAjUxtq8qpvY3wMo8V4wKMoKy1Nv9fxLq9emsBL6Eoaam5gJhWzA+QTQ0NLgsS8qDp0gJGQCNAmQErzuBkQ+XGulrnqivr5eqr/9lzC8/131VNDISGqoNi1KvE01lWVQvim8wgGf7AcgQVo1yQCfNtmgpJo4L+4t+eVSb8axsOkkGyofYYHKENqaGaz8zAI1nBmCIdfmeGBNqCgXupPlXv1NUaJSjU2D49G8lJaVLdHaysD0YnxAXLlxor6ioeIsUghSDcmRotZSMgITfHCIUaWkpBAT4mtTX/2JWX3/+dv3Nz3Blayq2zU/CgAC3x5ISEq/k72soyaBqYSx3MvyLPcG5WDvaBV10KC+nGeo2Z+NxXeZzA7hTk465g60wOVwLU8JeGMCYPioojTHDhlGeGB1sConWb18II6HRjHZ7URIcPe7YseOvQ4cO1Re2CeMTIi4uzppcA+rVKRmODIB+khGQUDj0ZUVq6P2NDXTLAajX11+vfnp7Ow4v7IeVI7ogy0cV8W6aTwZ0s/jNTEMGbVu/mJiqKEhj38IkbJ5Ik+CG8wG4PcFjHWEs3x7OFvr4+UQB7h1K5laJ7x9Jw9eVCSiJ0sS0SB1M66ePySG6KAqiKJAyly26ucAdqb0N0ew9DwKhQra035f+X4pyeXh4sPWATxlzc/MB/KnqFCHhT43kjYDcIOFZYpLibR9fv1Q5D09P3wVO4OjaNCzPs8eE/sYYYKcAT/U28DLogLAuKoh01oKXuQI05SRgoCaNPfPjUUHnAzw3gIZJcIqvOk5tycXjY3n4sYYMIBmPj+ehqswXhcFKmNZf7yUDGNlHCesLemH98K7wtXv/QsC0FkAnZvLJfqampkuEbcL4hDAwMFhFikC5P7QfVvToVJoQkxHQJhERJfo9KT74+/r6k7/jSSW+rZ2CKzszcetAJsqzbOCl0xwuyq3hYyiJMEtJJLvIYZSPGgr89TE+yhgHZ/hiS6H7S9Wh6STI3dO747czec+PVLp/JBnf7U3DjDgjTInQx9RwPZSE6nCpEIWBGhgfoo1dU4MxO7EztOQp/v9+IwC5eXRsLF/eUElJ6QsAzYTtwvgEoAmgnJzcF/Qr9fhUJYL2xdIWSXKFaOFIuFOsVatWTy8cWfwD7q3Fr5dmonZNEu4dy8evp7Pw8FQu9s8PQ2ovbXRXawl/g/YY5KyI7J4qyPdRQ8kgA+yb4YNNInMAzgDSrLCl0BMPDmfi+6oE3DtMawEpWJJrg0nh+pg+wJhbA5jaTxuTQrSQ76uEhdnO2DHFF1k+OmjGKf/7HWNK7h7VR+KLAdCegKFDhxoK24bxCZCenm7RsWPH38kfpupnZADkI9MowBsBKYroySc+3ZyBnzbg9/MTcG5DAk6s7Y/fzo3CvSPp+PFwGp6czsTD2hHYNa0fhvpqItquLZLd5JDnrYlp0UaomhWCLRPc8Lhu6PNN8QvSrLGp0AMPjzUckkdHIy3O6oTi/nqYGWfOlUWfEqGHyeE6KAxWx4RwbVRO9sX8rM6w0nnXWsXLQn4/nRZP6wEi8wC2C+xTxM7OLp78f1rxpSNVqWgWXwqQd4VIREeA5WVZwFdl+LIyAZsm98GTCwX47Xw27h3Owt2DafixhnrwwfjldC7uHcnGkYVhmJ9qi3w/FRQEqGHDaC9sGOvK1Qa9XTWES4WYlWyIdQVO+KoyGZXF3TF7kClmxptgToI5ymKNGwwgnA7K0MLYQA1UjHLDunx3RHejaA71/m9eq3idkKHTkbL8vgADA4OlwrZhfALo6emtIwUgv5gO1KZqcdQz0lyAXCGaFJPwcwAFORl8Wzcd325NxLKh9kjrpYglw3ri2tY0/HZ6BJ7UZT87DzgFtw9QOkMyHtZl4ufaDHxZGYuauX5YOdwOB2Z74eej2Q1VIY5kYetENyzKtsDKEXZYnGGD5ZnWWDTYAnMHmnE5QGQAxWHaKAzSwIKULtgw0gFjYmwh1Y5fo+D9//ebB1ARADpfjV/pVlBQuFZfX99K2D6MjxgAbeTk5K7Rr9TbU2SERgGKk/OuED8f4CtORwW44Nq2LMxPtEC0vTR66bVCN7XWCDSTxJRB1ji5qj9+OjIUj+qy8GNNEm5XJeJWVTI3qb13OAk/12bi4bGhz48/bTglPg1frI9C9Uxv7JjogQ35tAfABgtTzDE3wYQ7PG9qpA6KI7QwL9EEq3KsMS+tC8zU/5jrIyqU5uHu7v78QEFxcfGn7PT2T4zw8HAzcm1ocYhWR8kAunTp8pIRkDskWjkuyt8Oc4Z0xkCbDgjUlYKfsTT8TGThayQJL92W6G8jjsnRRlxO/ze7kvHz0aGcT3+PToKn/b8HqAxKBn6syeCUvyHdIQ3nV4Vh//Qe2F7khvUjHbg9AOWDzTArXh/TowwxO94cy9OsUDHcDotzXNDZsOE0mYbJ76sK/i6hiTAdJ0VGTo/JwB0dHROEbcT4iOncuXMqTQLJCMgdoMM0yC+mCSItFJErRHMC0apxdCCFsWJH+JgoIMRcEgEm4vAzloGfqRRCraQQ10UFCfYySHXriPEh6lg+zAE1c/1xbWs85+8/OJaJR3UZuH8klVvo4ld7qXpc9QwvbBvvgjV5tlg0xBQLUkywNMMKq0fYYvNoG1SOdcTsDGdYafMbdWgv8qvK/T5CCk/GTv8rXw/IyMiIwsGMTwVVVdXVdOMp3aFHjx5cj8gbAY0INB8gAxCsAXAi1rw59GXE0V1fCoEWCgi2kEH/zpJIclFApqcKhnurY6SvOvK8FTHSRx7jg1RROtAYK/IcsWm8O86vGYD7Rxryfe4fyUTVjJ6oGGmLbeOcsb3QDZ9P6YmaGb1RNa0n9k12w65J3TAyoguUJBuiUaT4f1b5eSEDp/UAPsKlqqp6g80DPhGqq6vby8jI/I9uPLk6Xl5eFArkjIB3hWhSTP6/UHFEpXWL5tCVF0c3IznEOKsiqxcpvxrG+WhhvJ8OCgN0UBSohfEB6hjTVwWjfJQwxK0DNo6nQ/KGPV8HmJVojJV5XfDtrmTc2NgfV1b3xbllATg83w9LclzR04p89YYDuoXX8GeFXLtu3bo9H+FoQjx8+HB2sPWngL+/fxfq2ckFIvfH29ubUwaaGNIiERkBVY5+d73QBoVsTmXFpdvD00QBid30MS7ICNP66aIkRBvFIZooDtHAlCAVTApWQ66XLDZPeHFABhlAeYohNo+zx4NDafhhdzwurY7GwnxfRPvawEJPA81aCKM9f11oJdjT0/O5kVNItEePHsnCtmJ8hNjY2OTz/j+dJklnBfTs2ZMzAnILyBBoAixUmvcRco80ZNrC01QOCb30kRtgiIIQI4wNNca4UF3k9JTGtgkvl0dfkGqMBdm22FIWg8EhztBVknru4sgrqMDM3Aya6mpo+Y7SJ39EKBeIjF30tBwLC4u1wrZifIQYGBgcohtOYcDQ0FD06dOHGwV4IyB36E1p0O8j7TpIQ1PbAOYWJtDVVIJ0h9aQbNMMZspiyPGSx/ZJIunQdTlYnGOLIX6dEB4ejKDg/jAyNUczkQS8Du3aw1jfCGYmFn+hXMvLQh0ARbxo3sMviKmoqNwE0FrYXoyPiI0bN8rJycn9RDecwp0DBgyAv78/NxKQEdBo8Gd7fxpRyKXo0sWOm0DLyr44T1dCWg6Rgd7I66OObSIHZJABLMqyQl6YO0aNHYuyGbOwbevW+zk5OXtlZWVvP9+R1pRqkMpxcxb6jr9jvzItiJGx8zVCyeXLzMy0E7YZ4yPC29vbm9/lRdGfqKgoBAcHc6dI9u3bl5sQ/1Hl4mvs08SZhBLo+IoSVIDX39//zvSyOSgZm4ccLzVsm+jZcETSMwMoT7fAyAgPTJ8xHZs3bcGRgwe5HP1Zs2bpdOrUaa1oEV8KYVKSHhkvjWB8GPPPCO11oHkAvyBGn+3p6ZknbDPGR4SVlRWdcsgpaHh4OHdgXlhYGAIDAzl3iPKAhIryJiGFIeWhsCn505RCwU+caQ+Bpqbm6ejo6N6XLl3Krdi6G8WjhyGrpyp2Tu0JXBiNh3W5eHpmBBZkWCIv0gPlixdhQ8WWX+sOHnzpSCJvb+8gdXX1y/yKNAmFL2kFmxazRKs8/xEhw6UggOgh4mpqahtEv5vxkaGlpXWEbjSF/xITExETE8O5QZGRkZz7I6pkbxJySyidgHphCp3SRnPREynl5OQe29vbD+X96d27dw/cvmsfSgtHYKiXPD7LNMWR+T6ontULh+d6Y/oATYyIdcfyZQuxafOWh+fPn1cQXvetW7faGxsbFwsjUxTNIbeIMld5X/59heYBdO0U9uU3/XTs2PGbgwcPigm/n/ERUFpaqigtLf2IbjQpb0ZGBuLj4zkjiIuLe68D82jjDCkcTR4pXEr+OK949NPMzGxLdnb2S6XGa/bvcdu9Zw/mTJ+MMfEeyAm1RJafMTL9jJHtb4yckE4YmxGJtauXYsu2LRcBCgK9nqioKC91dfUTospOoxm5RXRdVNma37T/PkLXT6MAb1jkboWHh7sJv5fxEeDu7u7DbwWk3j43N5cbBZKTk7kJ8NsUhxSDMkNJ6anXJwPiK0jTiCArK3vNy8urH51WL/zeuroDptt37/llzqJVGDc2H8mpgxEfF4vYmGgMjItDetoQFE0owsr1Fdi8a+9e4fuF0Iqtra1ttoyMzM+i10xKTAl85BqJ7mF4m/A7xPgRjEYCU1PTocLvZHwEmJiYTCaFoZuckJDAGUBaWhqSkpLeWAyXelfaLUauAvn5NMml3paffFK41M7ObvbixYulhN/Hc+tCdfud2zffXrFiFSYXF2PYiBHIyMpCemYmMrOzMXzESJRMnYKdO7Zix46t+cL3v4nExEQjAwODbaKHefDuGfn1ND95l0tHhk2LfnylCBIlJaUtwu9iNHIANFFXVz9Kv1L0Iy8vDzk5ORgxYgTXowsVg4TcCerp+ZVh0WNEyQXR19evCw4OdhR+1+vYuXPngSNHjmDDhg1YsXwFlixegiVLGmT58uXYvHkLamtrceDAAS/he99Ft27dIpSVlf8nGhHij4KlSfKbjJuE3kP/I+UG8SFXSUnJH1avXt1O+D2MRkxRUZGypKTkz3SDafVz3LhxyM/PR2pq6isJb+Q+UDSIFJ96fUqM4zeRk8jIyDzw9PQc80cWjaqqqoz27ds3tKKiYtiWLVum7t27t2LXrl0V9LOysnLBtm3bhu3atSvh+vXr7/2ZosyfP19RT09vtnCSTG4a/S80v3nTsU80olFmKN8OZOT9+vXrIfwORiPG3d3dj5840sJXYWEhioqKuNVQXhH409JJGUjx6ScpBx8hIcXQ0tJak5CQ8MGep9WvX78gLS2tC6KVren6qdIdzQ1ET4XkhQyeIkGicxp7e/tC4WczGjFmZmZ0HBCnDCkpKSguLuYiQLwyUCydVoDJ1RG6O6QQKioq3/j4+DSKYrL19fUdHB0dJwqL+1IPTyMBLdSJLvZRG9CcgYyff05dXf2dk3FGI0JFReU43ViKeowZMwZjx47lekW6+VT/h0YCvlqCqLtDhuHk5LRs+fLlisLP/NCJjo6209DQ2C/q+tD/S/lEND+g/5OfN9DvNELwr5OQkPhu9erV4sLPZDRCUlJSVMXFxbmTIClHp7S0lEuDoJ6dQpv8BhgyBN7dIXeJVnIDAgI8hJ/XmKDJv5OTU6K8vPxt0Qp35CJRtIg2BNHIQG1B6Rx81OhZtqiD8PMYjRAbG5tA/saS/5+VlcX1grQIRD2+0CWQlpZ+bGtrO4o2zgs/q7FSWFiobm1tvVo0r4iEHtOoSPMAmh/w6wdkEJ07dx4v/BxGI8TAwKCMbiof/ycf/3VV38gITE1N9w4ePPij3Rnl4eHRm8ohioZMSdlJ8SnsK5oGrq2tfVj4fkYjg1wAZWXlU/Qr+fyU9EZDv2i4kBRAWVn5Ozc3t0Yxyf2rVFVVdTQzM5sh3PNAHQR1AnxgQFpa+uHChQvlhe9nNCLy8vI0JCQkntAN5X1eYfqApaXlosWLF6sK3/ux4+/v31VFReXQm5LoaB7g5eXVW/g+RiPCzc0t9HU3mOYEGhoaJ0NDQ72F7/mUoMrQHh4exdLS0lwnQcJ3EM8O1JgpfA+jEWFsbDxfuPAjLy//i52d3WhWBuQFAwYMsDQ0NKwSbgZSU1Mj95HRGKFUBU1NzRv8zaSbq6uru5WqQgtfy+Daq6m7u3uCnJzc862YHTp0+Dk7O1tZ+FpGIyAjI8OKfHyKeMjJyX3l6Og4QPgaxqukp6erGBsbr6b1AXIVnZyc/ISvYTQCbG1tU2iF09bWduHq1aufRzMePnyoeOXKlf43btwou3DhwrCX3/Vp8eWXX3a8fPlywRdffEFtMfDWrVt6/N+sra17UApI586dP3v5XYxGgampqYaUlBR3+gnlx1y9ejXq/Pnzu+vq6u7X1dWB5OrVqzh9+nTZ23ZhfazQCTmnTp3aee3aNRw9ehTHjx/HsWPHfr148WLFzZs3A569rGXfvn2NBW9lNBbq6+ttLl++PO3EiRPfnjx5Evv378f69eu5HPyVK1fi888/x4kTJ57cvn27g/C9Hzs3b96UOn78+O979uzh2oLaZN26dbQngdoEp06dOnfz5s3M+vp6OeF7GR8wFNqj3v7cuXPHz5w5w/VuW7duxbJly7gNKJ999hl3w3fv3g3q/c6cOTNL+BmfAjTqnT17tuT69evYu3cv1qxZg6VLlz7fpLN9+3ZulDx8+PCD8+fPb7h27Vqg8DMYHxgXL16UPnPmzP4LFy6A79n4nVd0cysqKnDw4EHq3XD27NkvLl68OPxTPiWRjODSpUuxZ8+ePU1tcujQIa6N+M6ChEbM6upqai9qt8pPcbRsNFy4cGHUl19+iY0bN2LFihXPh3Xq4WhYr62t/encuXMbr1+/3petA7yANvN/++233c+fP7+xtrb2CRkDdSBr167ljIGEtnPSaHHu3Dk2EnyoXL582furr77ih26a4NLE7vezZ8/uvXr1avrt27dZTPsd3Lx5U/f69euDTp48efDo0aO/09yJRgBqT+pczp8/30f4HsYHxLlz54IuXry4+uLFi+tu3Lgx+PvvvzcXvobxfty8edOc2vD8+fPbLl26tOfcuXPhx44dayF8HYPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMN7J/wHMcigOk+U+9gAAAABJRU5ErkJggg==';
        const RETIRED_ARTIST_NAME_SET = new Set(['cinderella sanyu']);
        const dashboardWeatherCache = {
            geocode: new Map(),
            forecast: new Map()
        };

        function markSearchIndexDirty() {
            searchIndexDirty = true;
        }

        function refreshDataStoresFromStorage() {
            const loadedUsers = Storage.loadSync('starPaperUsers', []);
            users = Array.isArray(loadedUsers) ? loadedUsers : [];
            const loadedArtists = Storage.loadSync('starPaperArtists', []);
            artists = Array.isArray(loadedArtists) ? loadedArtists : [];
            const loadedManagerData = Storage.loadSync('starPaperManagerData', {});
            managerData = loadedManagerData && typeof loadedManagerData === 'object' && !Array.isArray(loadedManagerData) ? loadedManagerData : {};
            const loadedCredentials = Storage.loadSync('starPaperCredentials', {});
            credentials = loadedCredentials && typeof loadedCredentials === 'object' && !Array.isArray(loadedCredentials) ? loadedCredentials : {};
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
            Storage.saveSync('starPaperUsers', users);
            Storage.saveSync('starPaperArtists', artists);
            Storage.saveSync('starPaperCredentials', credentials);
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

        function findCredentialByUsername(username) {
            const direct = credentials?.[username];
            if (direct && typeof direct === 'object') {
                return { key: username, record: direct };
            }
            const normalized = normalizeUsername(username);
            if (!normalized || !credentials || typeof credentials !== 'object') return null;
            const matchKey = Object.keys(credentials).find((key) => normalizeUsername(key) === normalized);
            if (!matchKey) return null;
            const record = credentials[matchKey];
            if (!record || typeof record !== 'object') return null;
            return { key: matchKey, record };
        }

        const CREDENTIAL_PBKDF2_ITERATIONS = 120000;
        const CREDENTIAL_HASH_BITS = 256;
        const CREDENTIAL_SALT_BYTES = 16;

        function hasSecureCredentialCrypto() {
            return Boolean(
                window.crypto &&
                window.crypto.subtle &&
                typeof window.crypto.getRandomValues === 'function'
            );
        }

        function bufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 1) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }

        function base64ToUint8Array(base64) {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        function isHashedCredentialRecord(record) {
            return Boolean(
                record &&
                typeof record === 'object' &&
                typeof record.passwordHash === 'string' &&
                record.passwordHash.length > 0 &&
                typeof record.salt === 'string' &&
                record.salt.length > 0 &&
                Number.isFinite(Number(record.iterations))
            );
        }

        async function derivePasswordHashBase64(password, saltBase64, iterations = CREDENTIAL_PBKDF2_ITERATIONS) {
            if (!hasSecureCredentialCrypto()) {
                throw new Error('Secure credential crypto is unavailable.');
            }
            const encoder = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(String(password || '')),
                { name: 'PBKDF2' },
                false,
                ['deriveBits']
            );
            const bits = await window.crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: base64ToUint8Array(saltBase64),
                    iterations: Number(iterations) || CREDENTIAL_PBKDF2_ITERATIONS,
                    hash: 'SHA-256'
                },
                keyMaterial,
                CREDENTIAL_HASH_BITS
            );
            return bufferToBase64(bits);
        }

        async function createHashedCredentialRecord(password, existingRecord = null) {
            if (!hasSecureCredentialCrypto()) {
                throw new Error('Secure credential crypto is unavailable.');
            }
            const saltBytes = new Uint8Array(CREDENTIAL_SALT_BYTES);
            window.crypto.getRandomValues(saltBytes);
            const salt = bufferToBase64(saltBytes);
            const passwordHash = await derivePasswordHashBase64(password, salt, CREDENTIAL_PBKDF2_ITERATIONS);
            const nowIso = new Date().toISOString();
            const createdAt = (existingRecord && typeof existingRecord.createdAt === 'string')
                ? existingRecord.createdAt
                : nowIso;
            return {
                passwordHash,
                salt,
                iterations: CREDENTIAL_PBKDF2_ITERATIONS,
                createdAt,
                updatedAt: nowIso
            };
        }

        async function verifyCredentialPassword(record, candidatePassword) {
            if (!record || typeof record !== 'object') return false;
            if (isHashedCredentialRecord(record)) {
                const computedHash = await derivePasswordHashBase64(
                    candidatePassword,
                    record.salt,
                    record.iterations
                );
                return computedHash === record.passwordHash;
            }
            if (typeof record.password === 'string') {
                return record.password === candidatePassword;
            }
            return false;
        }

        async function hardenCredentialStore() {
            if (!hasSecureCredentialCrypto()) return;
            if (!credentials || typeof credentials !== 'object') return;

            let changed = false;
            const entries = Object.entries(credentials);
            for (const [username, record] of entries) {
                if (!record || typeof record !== 'object') continue;
                if (isHashedCredentialRecord(record)) continue;
                if (typeof record.password !== 'string' || !record.password) continue;
                try {
                    credentials[username] = await createHashedCredentialRecord(record.password, record);
                    changed = true;
                } catch (error) {
                    console.warn('Credential hardening skipped for user:', username, error);
                }
            }

            if (changed) {
                saveIdentityStores();
            }
        }

        function findUserById(id) {
            return users.find((user) => user?.id === id) || null;
        }

        function getCurrentUserRecord() {
            return findUserByUsername(currentUser);
        }

        function avatarDataUriFromSymbol(symbol) {
            const token = String(symbol || '').trim();
            if (!token) return '';
            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
                    <defs>
                        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#FFB300" />
                            <stop offset="100%" stop-color="#D4AF37" />
                        </linearGradient>
                    </defs>
                    <rect width="256" height="256" rx="128" fill="url(#g)" />
                    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-size="118">${token}</text>
                </svg>
            `.trim();
            const encoded = window.btoa(unescape(encodeURIComponent(svg)));
            return `data:image/svg+xml;base64,${encoded}`;
        }

        function resolveDisplayAvatar(user) {
            const raw = String(user?.avatar || '').trim();
            if (!raw) return './logo.png';
            if (raw.startsWith('data:image/') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('./') || raw.startsWith('/')) {
                return raw;
            }
            return avatarDataUriFromSymbol(raw);
        }

        function resolveDisplayArtistAvatar(artist) {
            const raw = String(artist?.avatar || '').trim();
            if (raw) {
                if (raw.startsWith('data:image/') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('./') || raw.startsWith('/')) {
                    return raw;
                }
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

        function handleArtistAvatarUpload(event) {
            const file = event?.target?.files?.[0];
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                toastError('Please upload a valid image file.');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                if (!result) return;
                pendingArtistAvatarValue = result;
                updateArtistAvatarPreview(result);
            };
            reader.readAsDataURL(file);
        }

        function updateHeaderGreeting() {
            const userNameEl = document.getElementById('userName');
            if (!userNameEl) return;
            if (!currentUser) {
                userNameEl.textContent = '';
                userNameEl.style.display = 'none';
                return;
            }
            userNameEl.textContent = `Hi, ${currentUser}`;
            userNameEl.style.display = 'inline';
        }

        function refreshProfileUI() {
            const user = getCurrentUserRecord();
            const sidebarName = document.getElementById('sidebarUserName');
            if (sidebarName) {
                sidebarName.textContent = user?.username || currentUser || 'Manager';
            }
            const avatarSrc = resolveDisplayAvatar(user);
            const sidebarAvatar = document.getElementById('sidebarAvatarImg');
            if (sidebarAvatar) {
                sidebarAvatar.src = avatarSrc;
            }
            const profilePreview = document.getElementById('profileAvatarPreview');
            if (profilePreview) {
                profilePreview.src = pendingProfileAvatarValue || avatarSrc;
            }
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
            if (avatarPreview) avatarPreview.src = resolveDisplayAvatar(user);
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

        function handleProfileAvatarUpload(event) {
            const file = event?.target?.files?.[0];
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                toastError('Please upload a valid image file.');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                if (!result) return;
                pendingProfileAvatarValue = result;
                const preview = document.getElementById('profileAvatarPreview');
                if (preview) preview.src = result;
            };
            reader.readAsDataURL(file);
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
            if (preview) preview.src = avatarUri;
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
                const conflictingUser = findUserByUsername(nextUsername) || findUserByUsernameInsensitive(nextUsername);
                if (nextUsername !== oldUsername && conflictingUser && conflictingUser.username !== oldUsername) {
                    toastError('That username is already in use.');
                    return;
                }

                user.username = nextUsername;
                user.email = nextEmail;
                user.phone = nextPhone;
                user.bio = nextBio;
                if (pendingProfileAvatarValue) {
                    user.avatar = pendingProfileAvatarValue;
                }

                const existingCred = (credentials[oldUsername] && typeof credentials[oldUsername] === 'object')
                    ? credentials[oldUsername]
                    : { createdAt: new Date().toISOString() };

                let nextCredential = existingCred;
                if (nextPassword) {
                    if (!hasSecureCredentialCrypto()) {
                        toastError('Secure password storage is not available in this browser.');
                        return;
                    }
                    nextCredential = await createHashedCredentialRecord(nextPassword, existingCred);
                } else if (!isHashedCredentialRecord(existingCred) && typeof existingCred.password === 'string' && existingCred.password) {
                    if (hasSecureCredentialCrypto()) {
                        try {
                            nextCredential = await createHashedCredentialRecord(existingCred.password, existingCred);
                        } catch (rehashError) {
                            console.warn('Profile credential hardening skipped:', rehashError);
                        }
                    }
                }

                if (nextUsername !== oldUsername) {
                    delete credentials[oldUsername];
                }
                credentials[nextUsername] = nextCredential;

                if (nextUsername !== oldUsername) {
                    currentUser = nextUsername;
                    Storage.saveSync('starPaperSessionUser', currentUser);
                    const remember = Storage.loadSync('starPaperRemember', false);
                    Storage.saveSync('starPaperCurrentUser', remember ? currentUser : null);
                }

                saveIdentityStores();
                updateCurrentManagerContext();
                markSearchIndexDirty();
                refreshProfileUI();
                closeProfileModal();
                toastSuccess('Profile updated');
            } catch (error) {
                console.error('Profile save failed:', error);
                toastError('Could not save profile changes.');
            }
        }

        function findArtistByName(name) {
            return artists.find((artist) => artist?.name === name) || null;
        }

        function findArtistById(id) {
            return artists.find((artist) => artist?.id === id) || null;
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

        function getManagerData(managerId) {
            const key = String(managerId || getActiveDataScopeKey() || '');
            if (!key) {
                return { bookings: [], expenses: [], otherIncome: [] };
            }
            if (!managerData[key] || typeof managerData[key] !== 'object') {
                managerData[key] = { bookings: [], expenses: [], otherIncome: [] };
            }
            managerData[key].bookings = Array.isArray(managerData[key].bookings) ? managerData[key].bookings : [];
            managerData[key].expenses = Array.isArray(managerData[key].expenses) ? managerData[key].expenses : [];
            managerData[key].otherIncome = Array.isArray(managerData[key].otherIncome) ? managerData[key].otherIncome : [];
            return managerData[key];
        }

        function saveManagerData(managerId, payload) {
            const key = String(managerId || getActiveDataScopeKey() || '');
            if (!key) return;
            const normalized = {
                bookings: Array.isArray(payload?.bookings) ? payload.bookings : [],
                expenses: Array.isArray(payload?.expenses) ? payload.expenses : [],
                otherIncome: Array.isArray(payload?.otherIncome) ? payload.otherIncome : []
            };
            managerData[key] = normalized;
            Storage.saveSync('starPaperManagerData', managerData);
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

        function getAllMemberNames() {
            const managerNames = getUsers().map((user) => user.username).filter(Boolean);
            const artistNames = getArtists().map((artist) => artist.name).filter(Boolean);
            return Array.from(new Set([...managerNames, ...artistNames]));
        }

        function updateCurrentManagerContext() {
            const manager = findUserByUsername(currentUser);
            currentManagerId = manager?.id || null;
        }

        function getActiveTeamId() {
            return typeof window.SP?.getActiveTeamId === 'function' ? window.SP.getActiveTeamId() : null;
        }

        function getActiveTeamRole() {
            return typeof window.SP?.getActiveTeamRole === 'function' ? window.SP.getActiveTeamRole() : null;
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

        function isViewerRole() {
            return currentTeamRole === 'viewer';
        }

        function ensureReadOnlyBanner() {
            let banner = document.getElementById('spReadOnlyBanner');
            if (banner) return banner;
            const container = document.querySelector('.main-content') || document.body;
            banner = document.createElement('div');
            banner.id = 'spReadOnlyBanner';
            banner.className = 'sp-readonly-banner';
            banner.textContent = 'Read-only access: viewer role cannot add, edit, or delete records.';
            container.insertBefore(banner, container.firstChild);
            return banner;
        }

        function applyReadOnlyMode() {
            const isViewer = isViewerRole();
            document.body.classList.toggle('sp-readonly', isViewer);
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
            currentTeamRole = role || null;
            window.currentTeamRole = currentTeamRole;
            applyReadOnlyMode();
        }
        window.setTeamRole = setTeamRole;

        function guardReadOnly(actionLabel) {
            if (!isViewerRole()) return false;
            if (typeof toastWarn === 'function') {
                toastWarn(`Read-only access: you cannot ${actionLabel}.`);
            } else if (typeof toastInfo === 'function') {
                toastInfo('Read-only access.');
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
            if (guardReadOnly('update revenue goals')) return;
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

        // â”€â”€ Balance Brought Forward (BBF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                fallbackToGlobal: true
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
            if (guardReadOnly('update the balance brought forward')) return;
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
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

        function normalizeAllManagerBookingReferences() {
            Object.keys(managerData || {}).forEach((managerId) => {
                const data = getManagerData(managerId);
                const managerHint = String(managerId || '').startsWith('team:') ? currentManagerId : managerId;
                const normalizedBookings = ensureBookingArtistRefs(data.bookings, managerHint);
                saveManagerData(managerId, {
                    bookings: normalizedBookings,
                    expenses: data.expenses,
                    otherIncome: data.otherIncome
                });
            });
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

            // â”€â”€ In-app navigation history stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Back / Forward navigation buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Scroll-to-top FAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Landing: sticky mini-nav on scroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const landingEl = document.getElementById('landingScreen');
            const miniNav   = document.getElementById('landingMiniNav');
            if (landingEl && miniNav) {
                landingEl.addEventListener('scroll', () => {
                    const show = landingEl.scrollTop > 260;
                    miniNav.classList.toggle('visible', show);
                    miniNav.setAttribute('aria-hidden', String(!show));
                }, { passive: true });
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
                    const card = target.closest('.artist-card[data-artist-id]');
                    if (!card) return;
                    event.preventDefault();
                    const artistId = card.dataset.artistId || '';
                    if (artistId) {
                        showEditArtistForm(artistId);
                    }
                });
            }
            document.getElementById('dashboardSearch')?.addEventListener('input', handleDashboardSearch);
            document.getElementById('dashboardSearch')?.addEventListener('focus', handleDashboardSearch);
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
            applyTheme(Storage.loadSync('starPaperTheme', 'dark'), { syncRemote: false });
            document.addEventListener('input', cacheDrafts);
            window.addEventListener('beforeunload', cacheDrafts);

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
            // This is non-fatal â€” the auth state self-heals â€” but without this handler
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

        // Seed demo data only when explicitly enabled and storage is empty.
        function initializeData() {
            if (Object.keys(users).length > 0) return;
            const shouldSeedDemo = localStorage.getItem('starPaperSeedDemo') === 'true';
            if (!shouldSeedDemo) {
                users = [];
                artists = [];
                managerData = {};
                credentials = {};
                Storage.saveSync('starPaperUsers', users);
                Storage.saveSync('starPaperArtists', artists);
                Storage.saveSync('starPaperManagerData', managerData);
                Storage.saveSync('starPaperCredentials', credentials);
                return;
            }
            users = {
                    'Admin': {
                        password: 'admin123',
                        userType: 'admin',
                        email: 'admin@starpaper.com',
                        phone: '+256 700 000000',
                        specialty: 'System Administrator',
                        bio: 'Managing the Star Paper artist management system',
                        bookings: [
                            {
                                id: 1,
                                event: 'Kampala Music Festival',
                                artist: 'Davido',
                                date: '2026-02-15',
                                fee: 15000000,
                                deposit: 7500000,
                                balance: 7500000,
                                contact: 'Event Manager: 0771234567',
                                status: 'confirmed',
                                notes: 'Main stage headliner, 90 min set',
                                locationType: 'uganda',
                                location: 'Kampala'
                            },
                            {
                                id: 2,
                                event: 'Lagos Afrobeat Festival',
                                artist: 'Burna Boy',
                                date: '2026-02-20',
                                fee: 25000000,
                                deposit: 12500000,
                                balance: 12500000,
                                contact: 'Lagos Events: +234 801 234 5678',
                                status: 'confirmed',
                                notes: 'International performance',
                                locationType: 'abroad',
                                location: 'Nigeria'
                            },
                            {
                                id: 3,
                                event: 'Entebbe Jazz Night',
                                artist: 'Wizkid',
                                date: '2026-02-25',
                                fee: 12000000,
                                deposit: 6000000,
                                balance: 6000000,
                                contact: 'Organizer: 0709876543',
                                status: 'pending',
                                notes: 'Acoustic set at lakeside venue',
                                locationType: 'uganda',
                                location: 'Entebbe'
                            },
                            {
                                id: 4,
                                event: 'Dubai Music Week',
                                artist: 'Tiwa Savage',
                                date: '2026-03-10',
                                fee: 30000000,
                                deposit: 15000000,
                                balance: 15000000,
                                contact: 'Dubai Events: +971 50 123 4567',
                                status: 'confirmed',
                                notes: 'Premium international show',
                                locationType: 'abroad',
                                location: 'Dubai (UAE)'
                            },
                            {
                                id: 5,
                                event: 'Jinja Beach Festival',
                                artist: 'Sheebah Karungi',
                                date: '2026-03-15',
                                fee: 8000000,
                                deposit: 4000000,
                                balance: 4000000,
                                contact: 'Festival Director: 0751112222',
                                status: 'confirmed',
                                notes: 'Local star performance',
                                locationType: 'uganda',
                                location: 'Jinja'
                            },
                            {
                                id: 6,
                                event: 'Mbarara Cultural Show',
                                artist: 'Bebe Cool',
                                date: '2026-03-20',
                                fee: 6000000,
                                deposit: 3000000,
                                balance: 3000000,
                                contact: 'Cultural Officer: 0783334444',
                                status: 'confirmed',
                                notes: 'Traditional fusion performance',
                                locationType: 'uganda',
                                location: 'Mbarara'
                            }
                            ,{
                                id: 7,
                                event: 'Gulu Heritage Gala',
                                artist: 'Davido',
                                date: '2025-10-18',
                                fee: 7000000,
                                deposit: 2500000,
                                balance: 4500000,
                                contact: 'Gulu Events: 0712345678',
                                status: 'confirmed',
                                notes: 'Outdoor cultural festival',
                                locationType: 'uganda',
                                location: 'Gulu'
                            },
                            {
                                id: 8,
                                event: 'Nairobi Fusion Night',
                                artist: 'Wizkid',
                                date: '2025-11-07',
                                fee: 18000000,
                                deposit: 7000000,
                                balance: 11000000,
                                contact: 'Nairobi Club: +254 701 222333',
                                status: 'pending',
                                notes: 'Club headline set',
                                locationType: 'abroad',
                                location: 'Kenya'
                            },
                            {
                                id: 9,
                                event: 'Kampala Christmas Jam',
                                artist: 'Sheebah Karungi',
                                date: '2025-12-20',
                                fee: 9000000,
                                deposit: 4500000,
                                balance: 4500000,
                                contact: 'Promoter: 0788001122',
                                status: 'confirmed',
                                notes: 'Holiday prime slot',
                                locationType: 'uganda',
                                location: 'Kampala'
                            },
                            {
                                id: 10,
                                event: 'New Year Countdown',
                                artist: 'Bebe Cool',
                                date: '2026-01-01',
                                fee: 11000000,
                                deposit: 5500000,
                                balance: 5500000,
                                contact: 'City Events: 0700112233',
                                status: 'confirmed',
                                notes: 'Midnight countdown performance',
                                locationType: 'uganda',
                                location: 'Kampala'
                            },
                            {
                                id: 11,
                                event: 'Accra Afrobeats Week',
                                artist: 'Burna Boy',
                                date: '2026-04-12',
                                fee: 22000000,
                                deposit: 10000000,
                                balance: 12000000,
                                contact: 'Accra Events: +233 201 445566',
                                status: 'pending',
                                notes: 'International tour stop',
                                locationType: 'abroad',
                                location: 'Ghana'
                            },
                            {
                                id: 12,
                                event: 'Fort Portal Jazz Weekend',
                                artist: 'Tiwa Savage',
                                date: '2026-05-09',
                                fee: 14000000,
                                deposit: 7000000,
                                balance: 7000000,
                                contact: 'Festival Office: 0779004433',
                                status: 'confirmed',
                                notes: 'Weekend headline slot',
                                locationType: 'uganda',
                                location: 'Fort Portal'
                            },
                            {
                                id: 13,
                                event: 'Zanzibar Beach Carnival',
                                artist: 'Wizkid',
                                date: '2026-06-21',
                                fee: 24000000,
                                deposit: 12000000,
                                balance: 12000000,
                                contact: 'Zanzibar Events: +255 701 778899',
                                status: 'confirmed',
                                notes: 'Sunset beach stage',
                                locationType: 'abroad',
                                location: 'Tanzania'
                            },
                            {
                                id: 14,
                                event: 'Lake Victoria Mega Show',
                                artist: 'Davido',
                                date: '2026-07-13',
                                fee: 20000000,
                                deposit: 8000000,
                                balance: 12000000,
                                contact: 'Mega Events: 0766554433',
                                status: 'pending',
                                notes: 'Regional mega show',
                                locationType: 'uganda',
                                location: 'Entebbe'
                            }

                        ],
                        expenses: [
                            {
                                id: 1,
                                description: 'Sound system rental - Kampala Festival',
                                amount: 1200000,
                                date: '2026-02-10',
                                category: 'equipment',
                                receipt: null
                            },
                            {
                                id: 2,
                                description: 'International flight tickets (Lagos)',
                                amount: 3500000,
                                date: '2026-02-18',
                                category: 'transport',
                                receipt: null
                            },
                            {
                                id: 3,
                                description: 'Hotel accommodation - Entebbe',
                                amount: 800000,
                                date: '2026-02-24',
                                category: 'accommodation',
                                receipt: null
                            },
                            {
                                id: 4,
                                description: 'Social media marketing campaign',
                                amount: 1500000,
                                date: '2026-02-05',
                                category: 'marketing',
                                receipt: null
                            },
                            {
                                id: 5,
                                description: 'Catering for crew (3 events)',
                                amount: 650000,
                                date: '2026-02-12',
                                category: 'food',
                                receipt: null
                            },
                            {
                                id: 6,
                                description: 'Stage lighting equipment',
                                amount: 2000000,
                                date: '2026-02-15',
                                category: 'equipment',
                                receipt: null
                            }
                            ,{
                                id: 7,
                                description: 'Stage design build - Christmas Jam',
                                amount: 2100000,
                                date: '2025-12-15',
                                category: 'equipment',
                                receipt: null
                            },
                            {
                                id: 8,
                                description: 'Artist travel allowances - Gulu Gala',
                                amount: 900000,
                                date: '2025-10-14',
                                category: 'transport',
                                receipt: null
                            },
                            {
                                id: 9,
                                description: 'Hotel block booking - Nairobi Fusion',
                                amount: 1600000,
                                date: '2025-11-03',
                                category: 'accommodation',
                                receipt: null
                            },
                            {
                                id: 10,
                                description: 'Streaming production crew',
                                amount: 1250000,
                                date: '2026-01-05',
                                category: 'equipment',
                                receipt: null
                            },
                            {
                                id: 11,
                                description: 'Artist styling & wardrobe',
                                amount: 750000,
                                date: '2026-04-08',
                                category: 'other',
                                receipt: null
                            },
                            {
                                id: 12,
                                description: 'Digital ads - Accra Week',
                                amount: 1350000,
                                date: '2026-04-10',
                                category: 'marketing',
                                receipt: null
                            },
                            {
                                id: 13,
                                description: 'Venue insurance & permits',
                                amount: 980000,
                                date: '2026-05-02',
                                category: 'other',
                                receipt: null
                            },
                            {
                                id: 14,
                                description: 'Fuel & logistics - Zanzibar',
                                amount: 1150000,
                                date: '2026-06-18',
                                category: 'transport',
                                receipt: null
                            },
                            {
                                id: 15,
                                description: 'Catering upgrade - Lake Victoria show',
                                amount: 820000,
                                date: '2026-07-09',
                                category: 'food',
                                receipt: null
                            }

                        ],
                        otherIncome: [
                            {
                                id: 1,
                                source: 'Merchandise sales - Kampala Festival',
                                amount: 1800000,
                                date: '2026-02-15',
                                type: 'merch',
                                payer: 'On-site booth',
                                method: 'cash',
                                status: 'received',
                                notes: 'Event T-shirts and caps',
                                proof: null
                            },
                            {
                                id: 2,
                                source: 'Brand endorsement advance',
                                amount: 5000000,
                                date: '2026-02-08',
                                type: 'endorsement',
                                payer: 'Orange Telecom',
                                method: 'bank',
                                status: 'received',
                                notes: 'Q1 campaign advance',
                                proof: null
                            },
                            {
                                id: 3,
                                source: 'Fan donations',
                                amount: 650000,
                                date: '2026-02-22',
                                type: 'donation',
                                payer: 'Online supporters',
                                method: 'mobile',
                                status: 'received',
                                notes: 'Live stream tips',
                                proof: null
                            }
                            ,{
                                id: 4,
                                source: 'New Year sponsorship bonus',
                                amount: 3200000,
                                date: '2026-01-02',
                                type: 'sponsorship',
                                payer: 'Nile Breweries',
                                method: 'bank',
                                status: 'received',
                                notes: 'Post-event bonus',
                                proof: null
                            },
                            {
                                id: 5,
                                source: 'Fan club subscriptions',
                                amount: 950000,
                                date: '2025-11-15',
                                type: 'donation',
                                payer: 'VIP supporters',
                                method: 'mobile',
                                status: 'received',
                                notes: 'Monthly fan club payment',
                                proof: null
                            },
                            {
                                id: 6,
                                source: 'Merchandise drop - Holiday edition',
                                amount: 2400000,
                                date: '2025-12-22',
                                type: 'merch',
                                payer: 'Online store',
                                method: 'online',
                                status: 'received',
                                notes: 'Hoodies, caps, tees',
                                proof: null
                            },
                            {
                                id: 7,
                                source: 'Brand content shoot',
                                amount: 1800000,
                                date: '2026-04-06',
                                type: 'endorsement',
                                payer: 'Galaxy Media',
                                method: 'bank',
                                status: 'received',
                                notes: 'Social media campaign',
                                proof: null
                            },
                            {
                                id: 8,
                                source: 'International booking deposit',
                                amount: 4200000,
                                date: '2026-06-10',
                                type: 'other',
                                payer: 'Zanzibar Carnival',
                                method: 'bank',
                                status: 'received',
                                notes: 'Performance deposit',
                                proof: null
                            },
                            {
                                id: 9,
                                source: 'VIP table sales',
                                amount: 1500000,
                                date: '2026-07-12',
                                type: 'gift',
                                payer: 'Corporate clients',
                                method: 'cash',
                                status: 'received',
                                notes: 'Lake Victoria show',
                                proof: null
                            }

                        ],
                        lastLogin: null
                    },
                    'Davido': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'davido@official.com',
                        phone: '+234 803 456 7890',
                        specialty: 'Afrobeats',
                        bio: 'Nigerian superstar and Afrobeats pioneer. Known for hits like "Fall", "If", and "Unavailable". Winner of multiple awards including BET and MTV Africa.',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    },
                    'Burna Boy': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'burnaboy@official.com',
                        phone: '+234 805 123 4567',
                        specialty: 'Afro-Fusion',
                        bio: 'Grammy-winning Nigerian artist. Known for "Ye", "Last Last", and "On The Low". Global ambassador for African music.',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    },
                    'Wizkid': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'wizkid@official.com',
                        phone: '+234 807 890 1234',
                        specialty: 'Afrobeats/R&B',
                        bio: 'International Afrobeats sensation. Collaborated with Drake, Beyonce, and Justin Bieber. Known for "Essence", "Ojuelegba".',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    },
                    'Tiwa Savage': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'tiwa@official.com',
                        phone: '+234 809 234 5678',
                        specialty: 'Afro-Pop',
                        bio: 'Queen of Afrobeats. First African female to sign with Universal Music. Known for "Somebody\'s Son", "Koroba", and "All Over".',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    },
                    'Sheebah Karungi': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'sheebah@official.com',
                        phone: '+256 772 123 4567',
                        specialty: 'Afropop/Dancehall',
                        bio: 'Uganda\'s Queen of Dance. Multiple award winner with hits like "Nkwatako", "Nakyuka", and "Wankona". Dynamic performer and style icon.',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    },
                    'Bebe Cool': {
                        password: 'artist123',
                        userType: 'artist',
                        email: 'bebecool@official.com',
                        phone: '+256 774 567 8901',
                        specialty: 'Reggae/Dancehall',
                        bio: 'Ugandan music legend and multiple award winner. Known for "Love You Everyday", "Coccidiosis", and social activism. Over 20 years in the industry.',
                        bookings: [],
                        expenses: [],
                        otherIncome: [],
                        lastLogin: null
                    }
                };
                Storage.saveSync('starPaperUsers', users);
        }

        initializeData();
        const usersShape = Storage.loadSync('starPaperUsers', []);
        if (!Array.isArray(usersShape)) {
            localStorage.setItem('starPaperSchemaVersion', '1');
            if (typeof window.runStarPaperMigrations === 'function') {
                window.runStarPaperMigrations();
            }
        }
        refreshDataStoresFromStorage();
        hardenCredentialStore().catch((error) => {
            console.warn('Credential hardening failed:', error);
        });
        normalizeAllManagerBookingReferences();
        checkAuth();

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
                            '[onclick*="showAddBooking"]',
                            '[onclick*="showAddEventToCalendar"]',
                            '[onclick*="bookArtistFromAvailability"]',
                            '.booking-edit-trigger'
                        ]
                    },
                    { id: 'addExpenseForm', cancel: cancelExpense, openSelectors: ['[data-action="showAddExpense"]', '[onclick*="showAddExpense"]', '.expense-edit-trigger'] },
                    { id: 'addOtherIncomeForm', cancel: cancelOtherIncome, openSelectors: ['[data-action="showAddOtherIncome"]', '[onclick*="showAddOtherIncome"]', '.other-income-edit-trigger'] },
                    { id: 'addArtistForm', cancel: cancelAddArtist, openSelectors: ['[data-action="showAddArtistForm"]', '[onclick*="showAddArtistForm"]', '.artist-card[data-artist-id]'] }
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
            showSection('schedule');
            
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
            toggleSidebar(false);
        }

        function applyTheme(theme, options = {}) {
            const opts = options && typeof options === 'object' ? options : {};
            const isLight = theme === 'light';
            const shouldPersist = opts.persist !== false;
            const shouldSync = shouldPersist && opts.syncRemote !== false;
            document.body.classList.toggle('light-theme', isLight);
            if (shouldPersist) {
                Storage.saveSync('starPaperTheme', isLight ? 'light' : 'dark');
            }
            updateThemeIcons(isLight);
            syncSidebarThemeButtonState(isLight);
            if (currentUser) {
                updateDashboard();
            }
            if (shouldSync) {
                syncCloudExtras();
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

function showLoginForm() {
            setActiveScreen('loginScreen');
            document.getElementById('loginForm').style.display = 'block';
            document.getElementById('signupForm').style.display = 'none';
            document.getElementById('forgotPasswordForm').style.display = 'none';
            const h = document.getElementById('loginBoxHeading');
            const s = document.getElementById('loginBoxSubtext');
            if (h) h.textContent = 'Welcome back to Star Paper';
            if (s) s.textContent = 'Sign in to continue to your dashboard.';
            const rememberMe = document.getElementById('rememberMe');
            if (rememberMe) {
                rememberMe.checked = Storage.loadSync('starPaperRemember', false);
            }
            clearLoginValidation();
            setLoginLoading(false);
        }

        function showSignupForm() {
            setActiveScreen('loginScreen');
            document.getElementById('signupForm').style.display = 'block';
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('forgotPasswordForm').style.display = 'none';
            const h = document.getElementById('loginBoxHeading');
            const s = document.getElementById('loginBoxSubtext');
            if (h) h.textContent = 'Welcome to Star Paper';
            if (s) s.textContent = 'Create your account to get started.';
            clearLoginValidation();
            setLoginLoading(false);
        }

        function showLanding() {
            setActiveScreen('landingScreen');
            clearForms();
        }

        function clearForms() {
            document.getElementById('loginName').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('signupName').value = '';
            document.getElementById('signupPassword').value = '';
            document.getElementById('signupEmail').value = '';
            document.getElementById('signupPhone').value = '';
        }

        async function attemptBackendLogin(username, password) {
            const apiBase = Storage.loadSync('starPaperApiBaseUrl', '');
            if (!apiBase) return null;
            const response = await fetch(`${apiBase.replace(/\/$/, '')}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (!response.ok) {
                throw new Error(`Backend login failed (${response.status})`);
            }
            return response.json();
        }

        function ensureSessionUserExists(username, profile = {}) {
            const normalized = String(username || '').trim();
            if (!normalized) return null;
            const existing = findUserByUsername(normalized) || findUserByUsernameInsensitive(normalized);
            if (existing) return existing;

            const user = {
                id: createRuntimeId('mgr', normalized),
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
            const remember = Boolean(options.remember);
            const cloudMode = Boolean(window.__spSupabaseConfigured) && !window.__spAllowLocalFallback;
            Storage.saveSync('starPaperRemember', remember);
            Storage.saveSync('starPaperCurrentUser', remember ? currentUser : null);
            if (cloudMode) {
                localStorage.removeItem('starPaper_session');
                localStorage.removeItem('starPaperSessionUser');
            } else {
                Storage.saveSync('starPaper_session', 'active');
                Storage.saveSync('starPaperSessionUser', currentUser);
            }
            window.currentUser = currentUser;
            window.currentManagerId = currentManagerId;
            return true;
        }

        function clearAuthSessionState() {
            currentUser = null;
            currentManagerId = null;
            Storage.saveSync('starPaperCurrentUser', null);
            Storage.saveSync('starPaperRemember', false);
            localStorage.removeItem('starPaper_session');
            localStorage.removeItem('starPaperSessionUser');
            window.currentUser = null;
            window.currentManagerId = null;
            // Reset boot flag so a same-tab re-login boots the full app cleanly.
            window.__spAppBooted = false;
        }

        window.applyAuthSession = applyAuthSession;
        window.clearAuthSessionState = clearAuthSessionState;

        window.addEventListener('storage', (event) => {
            const key = event?.key || '';
            if (!key) return;
            const shouldSync =
                key.startsWith('starPaper') ||
                key.startsWith('sp_') ||
                key.startsWith('sb-');
            if (!shouldSync) return;
            const authKeyChanged =
                key.startsWith('sb-') ||
                key === 'sp_logged_out' ||
                key === 'starPaper_session' ||
                key === 'starPaperSessionUser' ||
                key === 'starPaperRemember' ||
                key === 'starPaperCurrentUser';
            if (authKeyChanged && typeof checkAuth === 'function') {
                checkAuth();
                if (!window.__spAppBooted) return;
            }
            if (typeof loadUserData === 'function') {
                loadUserData();
            }
            if (window.__spAppBooted) {
                if (typeof updateDashboard === 'function') updateDashboard();
                if (typeof renderBookings === 'function') renderBookings();
                if (typeof renderExpenses === 'function') renderExpenses();
                if (typeof renderOtherIncome === 'function') renderOtherIncome();
                if (typeof renderArtists === 'function') renderArtists();
                if (typeof renderAudienceMetrics === 'function') renderAudienceMetrics();
                if (typeof updateTodayBoard === 'function') updateTodayBoard();
                if (typeof window.renderTasks === 'function') window.renderTasks();
            }
        });

        // â”€â”€ SAFE WINDOW EXPOSURE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // All functions below are global declarations (depth-0) and are already
        // on window automatically in browsers. We use ||= so app.actions.js (which
        // loads first) always wins if it defines its own version. We never override
        // what another module already set â€” this prevents regression on every deploy.

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

        // Edit (inline onclick inside template literals)
        window.editExpense     ||= editExpense;
        window.editBooking     ||= editBooking;
        window.editOtherIncome ||= editOtherIncome;

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
        window.generateCleanReport ||= generateCleanReport;
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

        // Data management
        window.loadMockPortfolioData ||= loadMockPortfolioData;
        window.clearMockData         ||= clearMockData;

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
            const tasks = JSON.parse(localStorage.getItem('sp_tasks') || '[]');
            tasks.push({ id: Date.now(), text, due: due?.value || '', done: false, createdAt: new Date().toISOString() });
            localStorage.setItem('sp_tasks', JSON.stringify(tasks));
            if (input) input.value = '';
            if (due)   due.value   = '';
            if (typeof window.renderTasks === 'function') window.renderTasks();
        };

        window.clearCompletedTasks ||= function() {
            const tasks = JSON.parse(localStorage.getItem('sp_tasks') || '[]');
            localStorage.setItem('sp_tasks', JSON.stringify(tasks.filter(t => !t.done)));
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
                bookings:    JSON.parse(localStorage.getItem('starPaperBookings')    || '[]'),
                expenses:    JSON.parse(localStorage.getItem('starPaperExpenses')    || '[]'),
                otherIncome: JSON.parse(localStorage.getItem('starPaperOtherIncome') || '[]'),
                artists:     JSON.parse(localStorage.getItem('starPaperArtists')     || '[]'),
                tasks:       JSON.parse(localStorage.getItem('sp_tasks')             || '[]'),
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
            if (!confirm('Delete ALL local data? This cannot be undone.')) return;
            ['starPaperBookings','starPaperExpenses','starPaperOtherIncome',
             'starPaperArtists','starPaperManagerData','sp_tasks',
             'starPaperUsers','starPaperCredentials'
            ].forEach(k => localStorage.removeItem(k));
            if (typeof window.loadUserData === 'function') window.loadUserData();
            if (typeof window.toastSuccess === 'function') window.toastSuccess('All local data cleared.');
        };

        // Login System
        // NOTE: This is the LOCAL-ONLY fallback login function.
        // When Supabase is configured, patchAppAuth() in supabase.js replaces
        // window.login ~100ms after DOMContentLoaded. That patched version handles
        // all cloud auth. This function is only invoked when Supabase is unavailable
        // (offline, not configured, or network error). Do NOT add Supabase calls here.
        async function login() {
            clearLoginValidation();
            const name = getInput('loginName');
            const password = getInput('loginPassword');

            let isValid = true;
            if (!name) {
                setValidationMessage('loginNameError', 'Name or email is required');
                setInputError('loginName', true);
                isValid = false;
            }
            if (!password) {
                setValidationMessage('loginPasswordError', 'Password is required');
                setInputError('loginPassword', true);
                isValid = false;
            }
            if (!isValid) return;

            setLoginLoading(true);
            try {
                const remember = document.getElementById('rememberMe')?.checked;

                // ── LOCAL FALLBACK (offline / Supabase not configured) ────────────────
                const user = findUserByUsername(name) || findUserByUsernameInsensitive(name);
                const credMatch = (user ? findCredentialByUsername(user.username) : null) || findCredentialByUsername(name);
                const cred = credMatch?.record;
                if (!user || !cred) {
                    toastError('Invalid credentials. Please try again.');
                    return;
                }
                let isPasswordValid = false;
                try {
                    isPasswordValid = await verifyCredentialPassword(cred, password);
                } catch (verificationError) {
                    console.error('Credential verification failed:', verificationError);
                    toastError('Secure password verification failed on this device.');
                    return;
                }
                if (!isPasswordValid) {
                    toastError('Invalid credentials. Please try again.');
                    return;
                }
                applyAuthSession(user.username, { remember: Boolean(remember) });
                loadUserData();
                showApp();
                showWelcomeMessage();

            } catch (err) {
                console.error(err);
                toastError('Login failed. Please try again.');
            } finally {
                setLoginLoading(false);
            }
        }

        async function signup() {
            try {
                const name = document.getElementById('signupName').value.trim();
                const password = document.getElementById('signupPassword').value;
                const email = document.getElementById('signupEmail').value.trim();
                const phone = document.getElementById('signupPhone').value.trim();

                if (!name || !password) {
                    toastError('Name and password are required.');
                    return;
                }
                if (!email) {
                    toastError('Email is required to create an account.');
                    return;
                }

                // ── SUPABASE PATH (primary) ───────────────────────────────────────────
                if (window.SP?.signup) {
                    try {
                        const data = await window.SP.signup(name, email, password, phone);
                        const needsConfirmation = data?.user && !data?.session;
                        if (needsConfirmation) {
                            toastSuccess('Account created! Check your email to confirm before logging in.');
                        } else if (data?.session) {
                            toastSuccess('Account created! Welcome to Star Paper.');
                            // Session is live — bootstrap will fire via onAuthStateChange.
                        } else {
                            toastSuccess('Account created! You can now log in.');
                        }
                        showLoginForm();
                        return;
                    } catch (spErr) {
                        const msg = spErr?.message || '';
                        if (msg.toLowerCase().includes('already')) {
                            toastError('An account with that email already exists.');
                        } else {
                            toastError(msg || 'Sign up failed. Please try again.');
                        }
                        return;
                    }
                }

                // ── LOCAL FALLBACK (offline / no Supabase) ────────────────────────────
                if (!hasSecureCredentialCrypto()) {
                    toastError('Secure password storage is not available in this browser.');
                    return;
                }
                if (findUserByUsername(name) || findUserByUsernameInsensitive(name)) {
                    toastError('That username is already taken.');
                    return;
                }
                const createdAt = new Date().toISOString();
                users.push({
                    id: createRuntimeId('mgr', name),
                    username: name,
                    email: email || '',
                    phone: phone || '',
                    bio: '',
                    avatar: '',
                    createdAt
                });
                credentials[name] = await createHashedCredentialRecord(password, { createdAt });
                saveIdentityStores();
                toastSuccess('Account created! You can now log in.');
                showLoginForm();

            } catch (error) {
                console.error('Signup failed:', error);
                toastError('Sign up failed. Please try again.');
            }
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
            saveUserData();
            clearAuthSessionState();
            Storage.saveSync('starPaperDrafts', null);
            refreshProfileUI();
            setActiveScreen('landingScreen');
            clearForms();
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

        function showApp() {
            try {
                console.log('=== SHOW APP STARTING ===');
                console.log('Current user:', currentUser);
                console.log('Users object:', users);
                console.log('Bookings:', bookings);
                console.log('Expenses:', expenses);
                
                setActiveScreen('appContainer');
                refreshProfileUI();
                console.log('Calling populateLocationDropdowns...');
                populateLocationDropdowns();
                
                console.log('Calling updateDashboard...');
                updateDashboard();
                updateMonthContextLabels();
                
                // Update Today Board
                if (typeof window.updateTodayBoard === 'function') {
                    window.updateTodayBoard();
                }
                
                console.log('Calling renderBookings...');
                renderBookings();
                
                console.log('Calling renderExpenses...');
                renderExpenses();

                console.log('Calling renderOtherIncome...');
                renderOtherIncome();
                
                console.log('Calling renderArtists...');
                renderArtists();
                
                console.log('Calling renderCalendar...');
                renderCalendar();
                
                console.log('Calling updateAvailabilityArtists...');
                updateAvailabilityArtists();
                
                console.log('Calling populateArtistDropdown...');
                populateArtistDropdown();
                populateAudienceArtistDropdown();
                renderAudienceMetrics();
                bindAudienceArtistSelect();
                handleAudienceArtistChange();

                console.log('Calling loadPushSettings...');
                loadPushSettings();
                toggleAdminOnlyUI();
                
                console.log('Calling renderPerformanceMap...');
                if (window.innerWidth <= 900) {
                    deferNonCriticalRender(() => renderPerformanceMap(), 500);
                } else {
                    setTimeout(() => {
                        renderPerformanceMap();
                    }, 200);
                }
                
                // report statistics
                console.log('Calling updateReportStatistics...');
                updateReportStatistics();
                requestNotificationPermission();
                scheduleReminderChecks();

                window.__spAppBooted = true;
                applyReadOnlyMode();
                
                console.log('=== SHOW APP COMPLETED ===');
            } catch (error) {
                console.error('ERROR IN SHOWAPP:', error);
                console.error('Error stack:', error.stack);
                toastError('Error loading app. Check console for details.');
            }
        }

        function toggleAdminOnlyUI() {
            const isAdmin = currentUser === 'Admin';
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = isAdmin ? 'block' : 'none';
            });
        }

        function loadUserData() {
            updateCurrentManagerContext();

            // â”€â”€ SUPABASE: if cloud data was injected by supabase.js, use it â”€â”€â”€â”€â”€â”€â”€â”€
            const cloudData = window._SP_cloudData;
            if (cloudData) {
                window._SP_cloudData = null; // consume it
                const activeScopeKey = getActiveDataScopeKey();
                const localFallback = getManagerData(activeScopeKey);
                const fallbackBookings = ensureBookingArtistRefs(localFallback.bookings || [], currentManagerId);
                const fallbackExpenses = Array.isArray(localFallback.expenses) ? localFallback.expenses : expenses;
                const fallbackOtherIncome = Array.isArray(localFallback.otherIncome) ? localFallback.otherIncome : otherIncome;
                const now = Date.now();
                const hasRecentLocal = (items) => Array.isArray(items) && items.some((item) => {
                    if (!item) return false;
                    if (typeof item.id === 'number') {
                        const created = Number(item.createdAt || item.id);
                        return Number.isFinite(created) && (now - created) < 120000;
                    }
                    return false;
                });

                const useLocalBookings = Array.isArray(cloudData.bookings) && cloudData.bookings.length === 0 && hasRecentLocal(fallbackBookings);
                const useLocalExpenses = Array.isArray(cloudData.expenses) && cloudData.expenses.length === 0 && hasRecentLocal(fallbackExpenses);
                const useLocalIncome = Array.isArray(cloudData.otherIncome) && cloudData.otherIncome.length === 0 && hasRecentLocal(fallbackOtherIncome);

                bookings    = Array.isArray(cloudData.bookings)    && !useLocalBookings ? cloudData.bookings    : fallbackBookings;
                expenses    = Array.isArray(cloudData.expenses)    && !useLocalExpenses ? cloudData.expenses    : fallbackExpenses;
                otherIncome = Array.isArray(cloudData.otherIncome) && !useLocalIncome   ? cloudData.otherIncome : fallbackOtherIncome;
                if (Array.isArray(cloudData.artists)) {
                    const teamId = getActiveTeamId();
                    if (teamId) {
                        artists = cloudData.artists;
                    } else if (cloudData.artists.length > 0) {
                        // Merge cloud artists with any locally created ones
                        const cloudIds = new Set(cloudData.artists.map(a => a.id));
                        const localOnly = artists.filter(a => a.managerId === currentManagerId && !cloudIds.has(a.id));
                        artists = [...cloudData.artists, ...localOnly];
                    }
                    Storage.saveSync('starPaperArtists', artists);
                }
                if (cloudData.revenueGoal && typeof cloudData.revenueGoal === 'object') {
                    const goalKey = getCurrentRevenueGoalKey();
                    const amount = Number(cloudData.revenueGoal.amount || 0);
                    revenueGoals[goalKey] = Number.isFinite(amount) ? amount : 0;
                    Storage.saveSync('starPaperRevenueGoals', revenueGoals);
                }
                if (Array.isArray(cloudData.bbfEntries)) {
                    const scopeKey = activeScopeKey;
                    Object.keys(bbfData).forEach((key) => {
                        if (key.startsWith(`${scopeKey}_`)) delete bbfData[key];
                    });
                    cloudData.bbfEntries.forEach((entry) => {
                        if (!entry?.period) return;
                        const amount = Number(entry.amount) || 0;
                        bbfData[`${scopeKey}_${entry.period}`] = amount;
                    });
                    Storage.saveSync('starPaperBBF', bbfData);
                }
                if (Array.isArray(cloudData.closingThoughts)) {
                    const scopeKey = activeScopeKey || 'default';
                    const store = getClosingThoughtsStore();
                    const nextStore = {};
                    cloudData.closingThoughts.forEach((entry) => {
                        if (!entry?.period || !entry?.content) return;
                        nextStore[entry.period] = String(entry.content);
                    });
                    store[scopeKey] = nextStore;
                    Storage.saveSync(CLOSING_THOUGHTS_STORAGE_KEY, store);
                }
                if (Array.isArray(cloudData.tasks) && typeof window.applyTaskSync === 'function') {
                    window.applyTaskSync(cloudData.tasks, { source: 'cloud' });
                }
                if (Array.isArray(cloudData.audienceMetrics)) {
                    audienceMetrics = cloudData.audienceMetrics;
                    saveAudienceMetricsForScope(activeScopeKey, audienceMetrics);
                } else {
                    audienceMetrics = getAudienceMetricsForScope(activeScopeKey);
                }
                if (cloudData.theme && typeof applyTheme === 'function') {
                    applyTheme(cloudData.theme, { persist: false });
                }
                // Also persist to localStorage as offline cache
                saveManagerData(activeScopeKey, { bookings, expenses, otherIncome });
            } else {
                // â”€â”€ FALLBACK: local storage (offline or pre-migration) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                const data = getManagerData(getActiveDataScopeKey());
                bookings    = ensureBookingArtistRefs(data.bookings, currentManagerId);
                expenses    = Array.isArray(data.expenses)    ? data.expenses    : [];
                otherIncome = Array.isArray(data.otherIncome) ? data.otherIncome : [];
                audienceMetrics = getAudienceMetricsForScope(getActiveDataScopeKey());
                purgeRetiredArtistsForCurrentManager();
                saveManagerData(getActiveDataScopeKey(), { bookings, expenses, otherIncome });
            }

            markSearchIndexDirty();
            // Expose to window for other modules and for supabase.js
            window.bookings     = bookings;
            window.expenses     = expenses;
            window.otherIncome  = otherIncome;
            window.artists      = artists;
            window.audienceMetrics = audienceMetrics;
            window.revenueGoals = revenueGoals;
            window.bbfData      = bbfData;
            window.currentManagerId = currentManagerId;
            window.currentUser  = currentUser;

            // â”€â”€ Sync bridge: lets supabase.js inject fresh cloud data any time â”€â”€â”€â”€
            window._SP_syncFromCloud = function(data) {
                window._SP_cloudData = null;
                if (Array.isArray(data.bookings))    { bookings    = data.bookings;    window.bookings    = bookings; }
                if (Array.isArray(data.expenses))    { expenses    = data.expenses;    window.expenses    = expenses; }
                if (Array.isArray(data.otherIncome)) { otherIncome = data.otherIncome; window.otherIncome = otherIncome; }
                if (Array.isArray(data.artists))     { artists     = data.artists;     window.artists     = artists; }
                if (data.revenueGoal && typeof data.revenueGoal === 'object') {
                    const goalKey = getCurrentRevenueGoalKey();
                    const amount = Number(data.revenueGoal.amount || 0);
                    revenueGoals[goalKey] = Number.isFinite(amount) ? amount : 0;
                    Storage.saveSync('starPaperRevenueGoals', revenueGoals);
                }
                if (Array.isArray(data.bbfEntries)) {
                    const scopeKey = getActiveDataScopeKey();
                    Object.keys(bbfData).forEach((key) => {
                        if (key.startsWith(`${scopeKey}_`)) delete bbfData[key];
                    });
                    data.bbfEntries.forEach((entry) => {
                        if (!entry?.period) return;
                        const amount = Number(entry.amount) || 0;
                        bbfData[`${scopeKey}_${entry.period}`] = amount;
                    });
                    Storage.saveSync('starPaperBBF', bbfData);
                }
                if (Array.isArray(data.closingThoughts)) {
                    const scopeKey = getActiveDataScopeKey() || 'default';
                    const store = getClosingThoughtsStore();
                    const nextStore = {};
                    data.closingThoughts.forEach((entry) => {
                        if (!entry?.period || !entry?.content) return;
                        nextStore[entry.period] = String(entry.content);
                    });
                    store[scopeKey] = nextStore;
                    Storage.saveSync(CLOSING_THOUGHTS_STORAGE_KEY, store);
                }
                if (Array.isArray(data.tasks) && typeof window.applyTaskSync === 'function') {
                    window.applyTaskSync(data.tasks, { source: 'cloud' });
                }
                if (Array.isArray(data.audienceMetrics)) {
                    audienceMetrics = data.audienceMetrics;
                    window.audienceMetrics = audienceMetrics;
                    saveAudienceMetricsForScope(getActiveDataScopeKey(), audienceMetrics);
                }
                if (data.theme && typeof applyTheme === 'function') {
                    applyTheme(data.theme, { persist: false });
                }
                saveManagerData(getActiveDataScopeKey(), { bookings, expenses, otherIncome });
                markSearchIndexDirty();
            };
        }

        function saveUserData() {
            if (currentUser && currentManagerId) {
                bookings = ensureBookingArtistRefs(bookings, currentManagerId);
                saveManagerData(getActiveDataScopeKey(), { bookings, expenses, otherIncome });
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
                // tasks, goals, BBF, closing thoughts) to Supabase in the background.
                syncCloudExtras();
            }
        }

        window.SP_collectAllData = function collectAllData() {
            const scopeKey = getActiveDataScopeKey();
            const tasks = typeof window.loadTasks === 'function' ? window.loadTasks() : [];
            const theme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
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

            return {
                bookings: Array.isArray(bookings) ? bookings : [],
                expenses: Array.isArray(expenses) ? expenses : [],
                otherIncome: Array.isArray(otherIncome) ? otherIncome : [],
                artists: Array.isArray(artists) ? artists : [],
                audienceMetrics: Array.isArray(audienceMetrics) ? audienceMetrics : [],
                tasks: Array.isArray(tasks) ? tasks : [],
                revenueGoal,
                bbfEntries,
                closingThoughts,
                theme,
            };
        };

        function syncCloudExtras() {
            if (typeof window.SP?.queueCloudSync !== 'function' && typeof window.SP?.saveAllData !== 'function') return;
            if (typeof window.SP_collectAllData !== 'function') return;
            const payload = window.SP_collectAllData();
            const saveFn = window.SP.queueCloudSync || window.SP.saveAllData;
            window.__spLastCloudSyncPromise = Promise.resolve(saveFn(payload)).catch((err) => {
                console.warn('Cloud sync failed:', err);
                if (typeof window.SP?.enqueueSave === 'function') {
                    window.SP.enqueueSave(payload);
                }
                return null;
            });
        }

        function getNextNumericRecordId(records) {
            if (!Array.isArray(records) || records.length === 0) {
                return Date.now();
            }
            const maxId = records.reduce((max, item) => {
                const value = Number(item?.id);
                return Number.isFinite(value) ? Math.max(max, value) : max;
            }, 0);
            return maxId > 0 ? (maxId + 1) : Date.now();
        }

        function dateOffsetFromToday(offsetDays) {
            const date = new Date();
            date.setHours(12, 0, 0, 0);
            date.setDate(date.getDate() + offsetDays);
            return date.toISOString().split('T')[0];
        }

        function loadMockPortfolioData() {
            if (!currentManagerId) {
                toastError('Please log in as a manager first.');
                return;
            }

            const mockArtists = [
                {
                    name: 'Cindy Sanyu',
                    email: 'cindy@starpaperdemo.com',
                    phone: '+256 770 112233',
                    specialty: 'Dancehall / Pop',
                    bio: 'Ugandan singer-songwriter and actress, widely known as \"The King Herself,\" a former Blu*3 member and an established solo dancehall-pop performer.',
                    strategicGoal: 'Secure 3 regional festival slots and two brand partnerships this quarter.',
                    avatar: avatarDataUriFromSymbol('C')
                },
                {
                    name: 'Kvan',
                    email: 'kvan@starpaperdemo.com',
                    phone: '+256 772 904411',
                    specialty: 'Dancehall / Afro-Fusion',
                    bio: 'Dancehall artist from Jinja (Bugisu origin), known as KVAN, a songwriter-performer active since age 8 with studio releases and regional collaborations.',
                    strategicGoal: 'Expand regional tour pipeline and secure 4 cross-border shows.',
                    avatar: avatarDataUriFromSymbol('K')
                },
                {
                    name: 'Spice Diana',
                    email: 'spice@starpaperdemo.com',
                    phone: '+256 774 563210',
                    specialty: 'Dancehall / Pop',
                    bio: 'Consistent chart performer with strong regional demand and repeat bookings for club and corporate circuits.',
                    strategicGoal: 'Strengthen corporate circuit bookings and grow streaming audience by 10%.',
                    avatar: avatarDataUriFromSymbol('S')
                },
                {
                    name: 'Cieska Lites',
                    email: 'cieska@starpaperdemo.com',
                    phone: '+256 780 553714',
                    specialty: 'Reggae / Ragga Dancehall',
                    bio: 'Ugandan reggae-ragga dancehall artist active since 2014, known for high-energy stage delivery, writing his own music, and recent releases in regional riddim projects.',
                    strategicGoal: 'Launch a new single run and lock two brand activations.',
                    avatar: avatarDataUriFromSymbol('C')
                }
            ];

            const monthOffset = (offsetMonths) => {
                const d = new Date();
                d.setDate(1);
                d.setMonth(d.getMonth() + offsetMonths);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            };

            const mockAudienceMetrics = [
                { artist: 'Cindy Sanyu', period: monthOffset(-2), socialFollowers: 1180000, spotifyListeners: 520000, youtubeListeners: 205000 },
                { artist: 'Cindy Sanyu', period: monthOffset(-1), socialFollowers: 1215000, spotifyListeners: 548000, youtubeListeners: 214000 },
                { artist: 'Kvan', period: monthOffset(-2), socialFollowers: 640000, spotifyListeners: 310000, youtubeListeners: 120000 },
                { artist: 'Kvan', period: monthOffset(-1), socialFollowers: 685000, spotifyListeners: 335000, youtubeListeners: 128000 },
                { artist: 'Spice Diana', period: monthOffset(-2), socialFollowers: 1920000, spotifyListeners: 610000, youtubeListeners: 285000 },
                { artist: 'Spice Diana', period: monthOffset(-1), socialFollowers: 1995000, spotifyListeners: 645000, youtubeListeners: 301000 },
                { artist: 'Cieska Lites', period: monthOffset(-2), socialFollowers: 420000, spotifyListeners: 145000, youtubeListeners: 68000 },
                { artist: 'Cieska Lites', period: monthOffset(-1), socialFollowers: 452000, spotifyListeners: 159000, youtubeListeners: 74200 }
            ];

            const mockBookings = [
                {
                    mockKey: 'seed-booking-cindy-crown-grounds',
                    event: 'Crown Grounds Live',
                    artist: 'Cindy Sanyu',
                    dateOffset: -19,
                    fee: 17600000,
                    deposit: 9000000,
                    capacity: 3500,
                    contact: 'Crown Grounds Team: 0701 118244',
                    status: 'confirmed',
                    notes: 'Headline dancehall set with full band and media pullout.',
                    locationType: 'uganda',
                    location: 'Kampala'
                },
                {
                    mockKey: 'seed-booking-cindy-victoria-nights',
                    event: 'Victoria Nights Showcase',
                    artist: 'Cindy Sanyu',
                    dateOffset: -7,
                    fee: 13200000,
                    deposit: 5400000,
                    capacity: 2200,
                    contact: 'Victoria Nights Desk: 0754 209611',
                    status: 'pending',
                    notes: 'Prime-time performance pending sponsor remittance.',
                    locationType: 'uganda',
                    location: 'Entebbe'
                },
                {
                    mockKey: 'seed-booking-azawi-kigali-crossroads',
                    event: 'Kigali Crossroads Sessions',
                    artist: 'Kvan',
                    dateOffset: -21,
                    fee: 16000000,
                    deposit: 8000000,
                    capacity: 2800,
                    contact: 'Rwanda Touring: +250 788 220100',
                    status: 'confirmed',
                    notes: 'Regional showcase appearance with media syndication.',
                    locationType: 'abroad',
                    location: 'Rwanda'
                },
                {
                    mockKey: 'seed-booking-azawi-acoustic-nexus',
                    event: 'Nexus Acoustic Night',
                    artist: 'Kvan',
                    dateOffset: -6,
                    fee: 9600000,
                    deposit: 3200000,
                    capacity: 1500,
                    contact: 'Nexus Promoter: 0788 450021',
                    status: 'pending',
                    notes: 'Soft ticket hold pending final sponsor confirmation.',
                    locationType: 'uganda',
                    location: 'Entebbe'
                },
                {
                    mockKey: 'seed-booking-spice-cityfest',
                    event: 'Mbarara City Fest',
                    artist: 'Spice Diana',
                    dateOffset: -12,
                    fee: 14000000,
                    deposit: 7000000,
                    capacity: 4000,
                    contact: 'City Fest Team: 0774 932201',
                    status: 'confirmed',
                    notes: 'Prime-time set with choreography team and pyros.',
                    locationType: 'uganda',
                    location: 'Mbarara'
                },
                {
                    mockKey: 'seed-booking-spice-youth-grounds',
                    event: 'Gulu Youth Grounds Concert',
                    artist: 'Spice Diana',
                    dateOffset: -4,
                    fee: 7200000,
                    deposit: 2600000,
                    capacity: 2500,
                    contact: 'Northern Stage Admin: 0762 600178',
                    status: 'pending',
                    notes: 'Outdoor youth concert with radio partner promotions.',
                    locationType: 'uganda',
                    location: 'Gulu'
                },
                {
                    mockKey: 'seed-booking-cieska-ragga-heights',
                    event: 'Ragga Heights Live',
                    artist: 'Cieska Lites',
                    dateOffset: -16,
                    fee: 11200000,
                    deposit: 5200000,
                    capacity: 1800,
                    contact: 'Ragga Heights Team: 0776 301144',
                    status: 'confirmed',
                    notes: 'Prime dancehall set with live MC and full sound package.',
                    locationType: 'uganda',
                    location: 'Kampala'
                },
                {
                    mockKey: 'seed-booking-cieska-lake-vibes',
                    event: 'Jinja Lake Vibes',
                    artist: 'Cieska Lites',
                    dateOffset: -2,
                    fee: 9800000,
                    deposit: 4000000,
                    capacity: 2000,
                    contact: 'Lake Vibes Coordinator: 0709 640880',
                    status: 'pending',
                    notes: 'Late-month headliner with dancehall showcase lineup.',
                    locationType: 'uganda',
                    location: 'Jinja'
                }
            ];

            const mockExpenses = [
                {
                    mockKey: 'seed-expense-stage-tech-package',
                    description: 'Stage technology package',
                    amount: 2400000,
                    dateOffset: -10,
                    category: 'equipment'
                },
                {
                    mockKey: 'seed-expense-kigali-travel-block',
                    description: 'Kigali travel and visa facilitation',
                    amount: 1800000,
                    dateOffset: -24,
                    category: 'transport'
                },
                {
                    mockKey: 'seed-expense-rehearsal-studio',
                    description: 'Band rehearsal studio blocks',
                    amount: 980000,
                    dateOffset: -5,
                    category: 'other'
                },
                {
                    mockKey: 'seed-expense-digital-campaign',
                    description: 'Digital campaign for March events',
                    amount: 1550000,
                    dateOffset: 1,
                    category: 'marketing'
                },
                {
                    mockKey: 'seed-expense-artist-accommodation',
                    description: 'Artist and crew accommodation',
                    amount: 1320000,
                    dateOffset: 14,
                    category: 'accommodation'
                },
                {
                    mockKey: 'seed-expense-tour-catering',
                    description: 'Backstage catering and rider supplies',
                    amount: 760000,
                    dateOffset: 17,
                    category: 'food'
                }
            ];

            const mockOtherIncome = [
                {
                    mockKey: 'seed-income-brand-integration',
                    source: 'Brand integration retainer',
                    amount: 4200000,
                    dateOffset: -12,
                    type: 'endorsement',
                    payer: 'City Spark Beverage',
                    method: 'bank',
                    status: 'received',
                    notes: 'Quarterly activation agreement.'
                },
                {
                    mockKey: 'seed-income-merch-drop',
                    source: 'Limited merch drop revenue',
                    amount: 2350000,
                    dateOffset: -7,
                    type: 'merch',
                    payer: 'Online fan store',
                    method: 'online',
                    status: 'received',
                    notes: 'Hoodies, jerseys, and caps.'
                },
                {
                    mockKey: 'seed-income-vip-upgrades',
                    source: 'VIP table upgrades',
                    amount: 1100000,
                    dateOffset: 6,
                    type: 'gift',
                    payer: 'Corporate hospitality desk',
                    method: 'cash',
                    status: 'pending',
                    notes: 'Pending final reconciliation.'
                },
                {
                    mockKey: 'seed-income-fan-support-pool',
                    source: 'Fan support pool',
                    amount: 680000,
                    dateOffset: 9,
                    type: 'donation',
                    payer: 'Community supporters',
                    method: 'mobile',
                    status: 'received',
                    notes: 'Collected during livestream campaign.'
                },
                {
                    mockKey: 'seed-income-tour-sponsor-bonus',
                    source: 'Regional tour sponsor bonus',
                    amount: 3600000,
                    dateOffset: 22,
                    type: 'sponsorship',
                    payer: 'Eastern Route Telecom',
                    method: 'bank',
                    status: 'pending',
                    notes: 'Payable after event settlement.'
                }
            ];

            const added = { artists: 0, bookings: 0, expenses: 0, otherIncome: 0, audienceMetrics: 0 };
            let artistsMutated = false;
            const replacementSeedProfile = mockArtists.find((profile) => profile.name === 'Kvan');
            if (replacementSeedProfile) {
                const legacySeedName = 'Azawi';
                const existingKvanRecord = artists.find((artist) =>
                    artist &&
                    artist.managerId === currentManagerId &&
                    artist.name === replacementSeedProfile.name
                );
                const removedLegacyArtistIds = new Set();

                for (let index = artists.length - 1; index >= 0; index -= 1) {
                    const artist = artists[index];
                    if (!artist || artist.managerId !== currentManagerId) continue;
                    if (artist.name !== legacySeedName || artist.mockSeedVersion !== MOCK_PORTFOLIO_VERSION) continue;

                    if (existingKvanRecord && existingKvanRecord.id !== artist.id) {
                        removedLegacyArtistIds.add(artist.id);
                        artists.splice(index, 1);
                        artistsMutated = true;
                        continue;
                    }

                    artist.name = replacementSeedProfile.name;
                    artist.email = replacementSeedProfile.email;
                    artist.phone = replacementSeedProfile.phone;
                    artist.specialty = replacementSeedProfile.specialty;
                    artist.bio = replacementSeedProfile.bio;
                    artistsMutated = true;
                }

                bookings.forEach((entry) => {
                    if (!entry || entry.mockSeedVersion !== MOCK_PORTFOLIO_VERSION) return;
                    if (entry.artist !== legacySeedName && !removedLegacyArtistIds.has(entry.artistId)) return;
                    entry.artist = replacementSeedProfile.name;
                    if (existingKvanRecord?.id) {
                        entry.artistId = existingKvanRecord.id;
                    }
                });
            }
            const retiredSeedArtistNames = new Set(['Cinderella Sanyu']);
            const removedRetiredArtistIds = new Set();
            for (let index = artists.length - 1; index >= 0; index -= 1) {
                const artist = artists[index];
                if (!artist || artist.managerId !== currentManagerId) continue;
                if (artist.mockSeedVersion !== MOCK_PORTFOLIO_VERSION) continue;
                if (!retiredSeedArtistNames.has(String(artist.name || '').trim())) continue;
                removedRetiredArtistIds.add(artist.id);
                artists.splice(index, 1);
                artistsMutated = true;
            }
            const previousBookingCount = bookings.length;
            bookings = bookings.filter((entry) => {
                if (!entry) return false;
                if (entry.mockSeedVersion !== MOCK_PORTFOLIO_VERSION) return true;
                const artistName = String(entry.artist || '').trim();
                if (retiredSeedArtistNames.has(artistName)) return false;
                if (removedRetiredArtistIds.has(entry.artistId)) return false;
                return true;
            });
            if (bookings.length !== previousBookingCount) {
                window.bookings = bookings;
            }

            mockArtists.forEach((profile) => {
                const existingArtist = findArtistByName(profile.name);
                if (existingArtist) {
                    const fields = ['email', 'phone', 'specialty', 'bio', 'strategicGoal', 'avatar'];
                    fields.forEach((field) => {
                        if (!existingArtist[field] && profile[field]) {
                            existingArtist[field] = profile[field];
                            artistsMutated = true;
                        }
                    });
                    return;
                }

                artists.push({
                    id: createRuntimeId('artist', profile.name),
                    name: profile.name,
                    managerId: currentManagerId,
                    createdAt: new Date().toISOString(),
                    email: profile.email,
                    phone: profile.phone,
                    specialty: profile.specialty,
                    bio: profile.bio,
                    strategicGoal: profile.strategicGoal || '',
                    avatar: profile.avatar || '',
                    mockSeedVersion: MOCK_PORTFOLIO_VERSION
                });
                added.artists += 1;
                artistsMutated = true;
            });

            const scopeKey = getActiveDataScopeKey();
            let scopedMetrics = getAudienceMetricsForScope(scopeKey);
            if (!Array.isArray(scopedMetrics)) scopedMetrics = [];
            const metricKeys = new Set(scopedMetrics.map((entry) => `${entry?.artistId || entry?.artist || ''}|${entry?.period || ''}`));
            mockAudienceMetrics.forEach((template) => {
                const artist = findArtistByName(template.artist);
                if (!artist || !template.period) return;
                const key = `${artist.id}|${template.period}`;
                if (metricKeys.has(key)) return;
                scopedMetrics.push({
                    id: createRuntimeId('aud', `${artist.id}-${template.period}`),
                    artistId: artist.id,
                    artist: artist.name,
                    period: template.period,
                    socialFollowers: Math.round(Number(template.socialFollowers) || 0),
                    spotifyListeners: Math.round(Number(template.spotifyListeners) || 0),
                    youtubeListeners: Math.round(Number(template.youtubeListeners) || 0),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    mockSeedVersion: MOCK_PORTFOLIO_VERSION
                });
                metricKeys.add(key);
                added.audienceMetrics += 1;
            });
            if (added.audienceMetrics > 0) {
                audienceMetrics = scopedMetrics;
                saveAudienceMetricsForScope(scopeKey, audienceMetrics);
                window.audienceMetrics = audienceMetrics;
            }

            const bookingKeys = new Set(bookings.map((entry) => entry?.mockKey).filter(Boolean));
            let nextBookingId = getNextNumericRecordId(bookings);
            mockBookings.forEach((template) => {
                if (bookingKeys.has(template.mockKey)) return;
                const fee = Number(template.fee) || 0;
                const deposit = Number(template.deposit) || 0;
                const linkedArtist = ensureArtistForBookingName(template.artist, currentManagerId);
                bookings.push({
                    id: nextBookingId++,
                    mockKey: template.mockKey,
                    mockSeedVersion: MOCK_PORTFOLIO_VERSION,
                    event: template.event,
                    artist: template.artist,
                    artistId: linkedArtist?.id || null,
                    date: dateOffsetFromToday(template.dateOffset),
                    fee,
                    deposit,
                    balance: Math.max(0, fee - deposit),
                    capacity: Math.round(Number(template.capacity) || 0),
                    contact: template.contact,
                    status: template.status,
                    notes: template.notes,
                    locationType: template.locationType,
                    location: template.location,
                    createdAt: Date.now()
                });
                bookingKeys.add(template.mockKey);
                added.bookings += 1;
            });

            const expenseKeys = new Set(expenses.map((entry) => entry?.mockKey).filter(Boolean));
            let nextExpenseId = getNextNumericRecordId(expenses);
            mockExpenses.forEach((template) => {
                if (expenseKeys.has(template.mockKey)) return;
                expenses.push({
                    id: nextExpenseId++,
                    mockKey: template.mockKey,
                    mockSeedVersion: MOCK_PORTFOLIO_VERSION,
                    description: template.description,
                    amount: Number(template.amount) || 0,
                    date: dateOffsetFromToday(template.dateOffset),
                    category: template.category,
                    receipt: null,
                    createdAt: Date.now()
                });
                expenseKeys.add(template.mockKey);
                added.expenses += 1;
            });

            const incomeKeys = new Set(otherIncome.map((entry) => entry?.mockKey).filter(Boolean));
            let nextOtherIncomeId = getNextNumericRecordId(otherIncome);
            mockOtherIncome.forEach((template) => {
                if (incomeKeys.has(template.mockKey)) return;
                otherIncome.push({
                    id: nextOtherIncomeId++,
                    mockKey: template.mockKey,
                    mockSeedVersion: MOCK_PORTFOLIO_VERSION,
                    source: template.source,
                    amount: Number(template.amount) || 0,
                    date: dateOffsetFromToday(template.dateOffset),
                    type: template.type,
                    payer: template.payer,
                    method: template.method,
                    status: template.status,
                    notes: template.notes,
                    proof: null,
                    createdAt: Date.now()
                });
                incomeKeys.add(template.mockKey);
                added.otherIncome += 1;
            });

            if (artistsMutated) {
                Storage.saveSync('starPaperArtists', artists);
            }
            saveUserData();

            renderArtists();
            populateArtistDropdown();
            updateAvailabilityArtists();
            renderBookings();
            renderExpenses();
            renderOtherIncome();
            renderCalendar();
            renderPerformanceMap();
            updateDashboard();
            updateReportStatistics();
            renderAudienceMetrics();
            if (typeof window.renderMomentumDashboard === 'function') {
                window.renderMomentumDashboard();
            }

            const periodEl = document.getElementById('reportPeriod');
            if (periodEl && typeof getReportPeriodData === 'function') {
                const currentPeriod = periodEl.value || 'month';
                const periodData = getReportPeriodData(currentPeriod, { sortNewestFirst: false });
                const hasPeriodData = (periodData.totalBookings || 0) + (periodData.totalExpenses || 0) + (periodData.totalOtherIncome || 0) > 0;
                const hasAnyData = bookings.length + expenses.length + otherIncome.length > 0;
                if (!hasPeriodData && hasAnyData) {
                    periodEl.value = 'all';
                    updateReportStatistics();
                    if (typeof window.renderMomentumDashboard === 'function') {
                        window.renderMomentumDashboard();
                    }
                }
            }

            const totalAdded = added.artists + added.bookings + added.expenses + added.otherIncome + added.audienceMetrics;
            if (totalAdded === 0) {
                toastInfo('Mock portfolio data is already loaded for this account.');
                return;
            }

            toastSuccess(`Mock data loaded: ${added.artists} artists, ${added.bookings} bookings, ${added.expenses} expenses, ${added.otherIncome} income entries, ${added.audienceMetrics} audience metrics.`);
        }

        function clearMockData() {
            if (!currentManagerId) {
                toastError('Please log in as a manager first.');
                return;
            }
            const before = {
                artists: artists.filter(a => a.mockSeedVersion === MOCK_PORTFOLIO_VERSION && a.managerId === currentManagerId).length,
                bookings: bookings.filter(b => b.mockSeedVersion === MOCK_PORTFOLIO_VERSION).length,
                expenses: expenses.filter(e => e.mockSeedVersion === MOCK_PORTFOLIO_VERSION).length,
                otherIncome: otherIncome.filter(o => o.mockSeedVersion === MOCK_PORTFOLIO_VERSION).length,
                audienceMetrics: audienceMetrics.filter(m => m.mockSeedVersion === MOCK_PORTFOLIO_VERSION).length
            };
            const total = before.artists + before.bookings + before.expenses + before.otherIncome + before.audienceMetrics;
            if (total === 0) {
                toastInfo('No mock data found to clear.');
                return;
            }
            if (!confirm(`Remove ${total} mock item(s): ${before.artists} artist(s), ${before.bookings} booking(s), ${before.expenses} expense(s), ${before.otherIncome} income entry/entries, ${before.audienceMetrics} audience metric(s). Continue?`)) return;

            artists = artists.filter(a => !(a.mockSeedVersion === MOCK_PORTFOLIO_VERSION && a.managerId === currentManagerId));
            Storage.saveSync('starPaperArtists', artists);
            bookings = bookings.filter(b => b.mockSeedVersion !== MOCK_PORTFOLIO_VERSION);
            expenses = expenses.filter(e => e.mockSeedVersion !== MOCK_PORTFOLIO_VERSION);
            otherIncome = otherIncome.filter(o => o.mockSeedVersion !== MOCK_PORTFOLIO_VERSION);
            audienceMetrics = audienceMetrics.filter(m => m.mockSeedVersion !== MOCK_PORTFOLIO_VERSION);
            saveAudienceMetricsForScope(getActiveDataScopeKey(), audienceMetrics);
            window.audienceMetrics = audienceMetrics;
            saveUserData();

            renderArtists();
            populateArtistDropdown();
            updateAvailabilityArtists();
            renderBookings();
            renderExpenses();
            renderOtherIncome();
            renderCalendar();
            renderPerformanceMap();
            updateDashboard();
            updateReportStatistics();
            renderAudienceMetrics();

            toastSuccess(`Mock data cleared: ${before.artists} artist(s), ${before.bookings} booking(s), ${before.expenses} expense(s), ${before.otherIncome} income entry/entries, ${before.audienceMetrics} audience metric(s) removed.`);
        }

        // Navigation
        function showSection(section, el) {
            // Map sub-sections to their parent section div
            const PARENT_MAP = {
                financials: 'money', expenses: 'money', otherIncome: 'money', reports: 'money',
                bookings: 'schedule', calendar: 'schedule'
            };
            const NAV_SECTION_MAP = {
                financials: 'money', expenses: 'money', otherIncome: 'money', reports: 'money',
                bookings: 'schedule', calendar: 'schedule'
            };

            const parentSection = PARENT_MAP[section] || section;

            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(parentSection)?.classList.add('active');
            Storage.saveSync('starPaperLastSection', section);

            // Scroll to top on every section change
            window.scrollTo({ top: 0, behavior: 'instant' });
            document.documentElement.scrollTop = 0;
            const mc = document.querySelector('.main-content');
            if (mc) mc.scrollTop = 0;

            const target = el || null;
            target?.classList.add('active');

            // â”€â”€ Push to in-app navigation history stack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (!window._spNavSkip) {
                if (window._spNavStack) {
                    window._spNavStack = window._spNavStack.slice(0, window._spNavIndex + 1);
                    window._spNavStack.push(section);
                    window._spNavIndex = window._spNavStack.length - 1;
                    updateNavHistButtons();
                }
            }
            window._spNavSkip = false;

            // â”€â”€ Sync bottom nav (map sub-sections to parent nav entry) â”€â”€
            const navKey = NAV_SECTION_MAP[section] || section;
            document.querySelectorAll('.bottom-nav-item').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.section === navKey);
            });

            // â”€â”€ Sync sidebar nav active state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.section === navKey);
            });

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
                'financials': 'Money â€” Overview',
                'artists':    'Artists',
                'schedule':   'Schedule',
                'bookings':   'Schedule â€” Bookings',
                'expenses':   'Money â€” Expenses',
                'otherIncome':'Money â€” Other Income',
                'calendar':   'Schedule â€” Calendar',
                'reports':    'Reports',
                'tasks':      'Tasks',
            };

            const titleEl = document.getElementById('pageTitle');
            const nextTitle = titles[section] || section;
            if (titleEl) {
                titleEl.textContent = nextTitle;
            }
            updateAppHeaderIcon(section);
            document.title = `Star Paper | ${nextTitle}`;

            if (section === 'dashboard') {
                updateDashboard();
            } else if (section === 'money') {
                activateMoneyTab('financials');
                updateDashboard();
                renderPerformanceMap();
            } else if (section === 'financials') {
                activateMoneyTab('financials');
                updateDashboard();
                renderPerformanceMap();
            } else if (section === 'expenses') {
                activateMoneyTab('expenses');
                renderExpenses();
            } else if (section === 'otherIncome') {
                activateMoneyTab('otherIncome');
                renderOtherIncome();
            } else if (section === 'reports') {
                activateMoneyTab('reports');
                updateReportsSection();
            } else if (section === 'schedule') {
                activateScheduleTab('bookings');
                renderBookings();
            } else if (section === 'bookings') {
                activateScheduleTab('bookings');
                renderBookings();
            } else if (section === 'calendar') {
                activateScheduleTab('calendar');
                renderCalendar();
            } else if (section === 'artists') {
                renderArtists();
            } else if (section === 'tasks') {
                if (typeof window.renderTasks === 'function') {
                    window.renderTasks();
                }
            }

            if (window.innerWidth <= 1024) {
                closeSidebar();
            }

            document.getElementById('quickAddPanel')?.classList.remove('active');
        }

        function checkAuth() {
            // Guard: if the user explicitly clicked logout, respect that choice.
            // Even if localStorage still has remember=true or a session key, we
            // must NOT auto-boot the app. The user will need to log in again.
            // This flag is set by supabaseLogout() and cleared by bootstrapFromSupabaseSession()
            // on the next successful login.
            if (localStorage.getItem('sp_logged_out') === '1') {
                // Still show landing — not the login form, not the app.
                if (typeof setActiveScreen === 'function') setActiveScreen('landingScreen');
                return;
            }

            const sessionActive = Storage.loadSync('starPaper_session', null) === 'active';
            const sessionUser = Storage.loadSync('starPaperSessionUser', null);
            const remember = Storage.loadSync('starPaperRemember', false);
            const rememberedUser = Storage.loadSync('starPaperCurrentUser', null);

            let savedUser = sessionActive ? sessionUser : (remember ? rememberedUser : null);
            let savedRecord = savedUser ? (findUserByUsername(savedUser) || findUserByUsernameInsensitive(savedUser)) : null;

            if (savedUser && !savedRecord) {
                const profileHint = window.SP?.getProfileState?.() || {};
                savedRecord = ensureSessionUserExists(savedUser, profileHint) || null;
            }

            const cloudMode = Boolean(window.__spSupabaseConfigured) && !window.__spAllowLocalFallback;
            if (cloudMode) {
                if (sessionActive) {
                    localStorage.removeItem('starPaper_session');
                    localStorage.removeItem('starPaperSessionUser');
                }
                savedUser = null;
                savedRecord = null;
            }

            // â”€â”€ NO LOCAL SESSION: delegate entirely to Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            // The old approach used a 12-retry setTimeout loop, which could miss
            // the sp-supabase-ready event if it fired before the listener was
            // registered. This replacement uses a Promise that can never be missed:
            // - If SP is already ready, it resolves immediately.
            // - If SP is not ready yet, it waits on the sp-supabase-ready event
            //   (which is dispatched exactly once and cannot be "missed" via a
            //   Promise resolver the way an event listener can).
            // - A hard 10-second timeout prevents infinite waiting on network fail.
            if (!savedUser || !savedRecord) {
                if (sessionActive) {
                    localStorage.removeItem('starPaper_session');
                    localStorage.removeItem('starPaperSessionUser');
                }

                // Fire-and-forget: don't block the synchronous call stack.
                (async () => {
                    if (window.__spAppBooted) return;

                    // Step 1: Wait for window.SP to be fully initialised.
                    // If the Supabase SDK was already in <head> (our fix), this
                    // resolves synchronously on the very first microtask tick.
                    if (!window.__spSupabaseReady) {
                        await new Promise((resolve) => {
                            // Already ready by the time we check?
                            if (window.__spSupabaseReady) { resolve(); return; }
                            const onReady = () => resolve();
                            window.addEventListener('sp-supabase-ready', onReady, { once: true });
                            // Hard cap: if Supabase never fires (CDN failure, etc.)
                            // stop waiting after 10 s so the landing page isn't frozen.
                            setTimeout(resolve, 10000);
                        });
                    }

                    if (window.__spAppBooted) return;

                    // Step 2: Ask Supabase for a live session. Because the SDK is
                    // already loaded synchronously, getSession() always resolves â€”
                    // even on the very first page load after an OAuth redirect.
                    try {
                        // Prefer the cached in-memory session (zero network round-trip).
                        let session = window.SP?.getSessionState?.() || null;
                        if (!session?.user && typeof window.SP?.getSession === 'function') {
                            session = await window.SP.getSession();
                        }

                        if (session?.user && typeof window.SP?.bootstrap === 'function') {
                            await window.SP.bootstrap(session, {
                                remember: true,
                                showWelcome: true,
                                runMigration: true,
                            });
                        }
                    } catch (err) {
                        // Non-fatal: user stays on landing; they can log in manually.
                        console.warn('[StarPaper] checkAuth Supabase fallback failed:', err);
                    }
                })();

                return;
            }

            // â”€â”€ VALID LOCAL SESSION: boot the app â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            currentUser = savedRecord.username;
            updateCurrentManagerContext();
            loadUserData();
            showApp();
            showWelcomeMessage();
            const allowedSections = new Set(['dashboard','money','schedule','artists','tasks','financials','expenses','otherIncome','reports','bookings','calendar']);
            const lastSectionRaw = Storage.loadSync('starPaperLastSection', 'dashboard');
            const lastSection = allowedSections.has(lastSectionRaw) ? lastSectionRaw : 'dashboard';
            showSection(lastSection);
            restoreDrafts();
        }

        function restoreSession() {
            checkAuth();
        }

        // Keep the sp-supabase-ready listener as a secondary safety net for
        // edge cases where checkAuth() ran before supabase.js finished (should
        // not happen with the SDK pre-loaded in <head>, but belt-and-suspenders).
        if (!window.__spSupabaseReadyListenerBound) {
            window.__spSupabaseReadyListenerBound = true;
            window.addEventListener('sp-supabase-ready', () => {
                if (!window.__spAppBooted) {
                    checkAuth();
                }
            });
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
                    category: document.getElementById('expenseCategory')?.value || 'transport',
                    formOpen: document.getElementById('addExpenseForm')?.style.display === 'block'
                },
                otherIncome: {
                    source: document.getElementById('otherIncomeSource')?.value || '',
                    amount: document.getElementById('otherIncomeAmount')?.value || '',
                    date: document.getElementById('otherIncomeDate')?.value || '',
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
            const map = document.getElementById('performanceMap');
            if (!map) {
                console.error('Performance map element not found!');
                return;
            }
            map.innerHTML = '';
            const showLabels = options.showLabels === true;
            const showLocationList = options.showLocationList === true;
            const showPinnedPanel = options.showPinnedPanel !== false;

            const today = new Date();
            const sourceBookings = Array.isArray(filtered) ? filtered : bookings;
            const allBookings = sourceBookings.filter(b => b.date);
            const hasInternational = allBookings.some(b => b.locationType === 'abroad');

            const buildTooltipLines = (bookingList) => {
                return bookingList.map(b => {
                    const dateStr = b.date ? formatDisplayDate(b.date) : 'Unknown date';
                    const status = b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : 'Unknown';
                    return `
                        <div class="tooltip-line">
                            <span class="tooltip-label">Show</span>
                            <span class="tooltip-value">${b.event || 'Unknown'}</span>
                        </div>
                        <div class="tooltip-line">
                            <span class="tooltip-label">Date</span>
                            <span class="tooltip-value">${dateStr}</span>
                        </div>
                        <div class="tooltip-line">
                            <span class="tooltip-label">Status</span>
                            <span class="tooltip-value">${status}</span>
                        </div>
                    `;
                }).join('');
            };

            const buildPanelContent = (location, bookingList) => {
                if (!location || bookingList.length === 0) {
                    return `<div class="map-info-title">Performance Details</div><div class="map-info-empty">Hover a pin to see show details.</div>`;
                }
                const blocks = bookingList.map(b => {
                    const dateStr = b.date ? formatDisplayDate(b.date) : 'Unknown date';
                    const status = b.status ? b.status.charAt(0).toUpperCase() + b.status.slice(1) : 'Unknown';
                    return `
                        <div class="map-info-item">
                            <div><strong>${b.event || 'Unknown show'}</strong></div>
                            <div>${dateStr}</div>
                            <div>Status: ${status}</div>
                        </div>
                    `;
                }).join('');
                return `
                    <div class="map-info-title">${location}</div>
                    ${blocks}
                `;
            };

            let pinnedPanel = null;
            if (showPinnedPanel) {
                pinnedPanel = document.createElement('div');
                pinnedPanel.className = 'map-info-panel';
                pinnedPanel.innerHTML = buildPanelContent(null, []);
                map.appendChild(pinnedPanel);
            }

            if (hasInternational) {
                const worldLocations = {};

                allBookings.forEach(booking => {
                    const location = booking.location || 'Unknown';
                    if (!worldLocations[location]) {
                        worldLocations[location] = { count: 0, bookings: [], hasUpcoming: false };
                    }
                    worldLocations[location].count++;
                    worldLocations[location].bookings.push(booking);
                    if (new Date(booking.date) >= today) {
                        worldLocations[location].hasUpcoming = true;
                    }
                });

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

                Object.keys(worldLocations).forEach(location => {
                    const coords = worldCoords[location] || { x: 50, y: 50 };
                    const data = worldLocations[location];

                    const pin = document.createElement('div');
                    pin.className = `map-pin ${data.hasUpcoming ? 'upcoming' : 'past'}`;
                    pin.style.left = `${coords.x}%`;
                    pin.style.top = `${coords.y}%`;
                    pin.innerHTML = showPinnedPanel ? '' : `
                        <div class="map-pin-tooltip">
                            <strong>${location}</strong><br>
                            ${buildTooltipLines(data.bookings)}
                        </div>
                    `;
                    if (showPinnedPanel && pinnedPanel) {
                        pin.addEventListener('mouseenter', () => {
                            pinnedPanel.innerHTML = buildPanelContent(location, data.bookings);
                        });
                    }
                    map.appendChild(pin);
                });

                const legend = document.createElement('div');
                legend.style.cssText = 'position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.9); padding: 12px; border-radius: 8px; border: 2px solid #ff9800; font-size: 12px; color: #fff;';
                legend.innerHTML = `
                    <div style="color: #ff9800; font-weight: bold; margin-bottom: 8px;">WORLD VIEW</div>
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <div style="width: 12px; height: 12px; background: #4caf50; border-radius: 50%; margin-right: 8px;"></div>
                        <span>Upcoming shows</span>
                    </div>
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <div style="width: 12px; height: 12px; background: #f44336; border-radius: 50%; margin-right: 8px;"></div>
                        <span>Past shows</span>
                    </div>
                    <div style="font-size: 10px; color: #aaa; margin-top: 5px;">Showing ${allBookings.length} shows</div>
                    <div style="font-size: 10px; color: #888;">Hover pins for details</div>
                `;
                map.appendChild(legend);
            } else {
                const ugandaLocations = {};

                allBookings.forEach(booking => {
                    const location = booking.location || 'Unknown';
                    if (!ugandaLocations[location]) {
                        ugandaLocations[location] = { count: 0, bookings: [], hasUpcoming: false };
                    }
                    ugandaLocations[location].count++;
                    ugandaLocations[location].bookings.push(booking);
                    if (new Date(booking.date) >= today) {
                        ugandaLocations[location].hasUpcoming = true;
                    }
                });

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

                Object.keys(ugandaLocations).forEach(location => {
                    const coords = ugandaCoords[location] || { x: 30, y: 50 };
                    const data = ugandaLocations[location];

                    const pin = document.createElement('div');
                    pin.className = `map-pin ${data.hasUpcoming ? 'upcoming' : 'past'}`;
                    pin.style.left = `${coords.x}%`;
                    pin.style.top = `${coords.y}%`;
                    pin.innerHTML = showPinnedPanel ? '' : `
                        <div class="map-pin-tooltip">
                            <strong>${location}</strong><br>
                            ${buildTooltipLines(data.bookings)}
                        </div>
                    `;
                    if (showPinnedPanel && pinnedPanel) {
                        pin.addEventListener('mouseenter', () => {
                            pinnedPanel.innerHTML = buildPanelContent(location, data.bookings);
                        });
                    }
                    map.appendChild(pin);
                });

                const legend = document.createElement('div');
                legend.style.cssText = 'position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.9); padding: 12px; border-radius: 8px; border: 2px solid #ff9800; font-size: 12px; color: #fff;';
                legend.innerHTML = `
                    <div style="color: #ff9800; font-weight: bold; margin-bottom: 8px;">UGANDA VIEW</div>
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <div style="width: 12px; height: 12px; background: #4caf50; border-radius: 50%; margin-right: 8px;"></div>
                        <span>Upcoming shows</span>
                    </div>
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                        <div style="width: 12px; height: 12px; background: #f44336; border-radius: 50%; margin-right: 8px;"></div>
                        <span>Past shows</span>
                    </div>
                    <div style="font-size: 10px; color: #aaa; margin-top: 5px;">Showing ${allBookings.length} shows</div>
                    <div style="font-size: 10px; color: #888;">Hover pins for details</div>
                `;
                map.appendChild(legend);
            }

            if (showLocationList) {
                const locationList = Array.from(new Set(allBookings.map(b => (b.location || 'Unknown').trim())))
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));
                const listWrap = document.createElement('div');
                listWrap.className = 'map-location-list';
                listWrap.innerHTML = `
                    <div class="map-location-list-title">Locations</div>
                    ${locationList.length === 0 ? '<div class="map-location-list-item">- None</div>' :
                        locationList.map(loc => `<div class="map-location-list-item">- ${loc}</div>`).join('')}
                `;
                map.appendChild(listWrap);
            }
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
                         onclick="selectCalendarDate('${dateStr}')">
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
                    <div class="${classes.join(' ')}" data-date="${dateStr}" onclick="selectCalendarDate('${dateStr}')">
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
                         onclick="selectCalendarDate('${dateStr}')">
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
            const lines = dayEvents.map(evt => `- ${evt.event} - ${evt.artist}`).join('<br>');
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
            document.getElementById('calendarEventDetails').innerHTML = '<p style="color: #888;">Click on a date with events to see details</p>';
        }

        function nextMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
            selectedCalendarDate = null;
            document.getElementById('calendarEventDetails').innerHTML = '<p style="color: #888;">Click on a date with events to see details</p>';
        }

        function goToToday() {
            currentCalendarDate = new Date();
            renderCalendar();
            selectedCalendarDate = null;
            document.getElementById('calendarEventDetails').innerHTML = '<p style="color: #888;">Click on a date with events to see details</p>';
        }

        function getReportPeriodData(period, options = {}) {
            const { sortNewestFirst = false } = options;
            const maybeSort = (items) => {
                if (!sortNewestFirst) return items;
                return [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
            };

            const filteredBookings = maybeSort(filterByPeriod(bookings, period));
            const filteredExpenses = maybeSort(filterByPeriod(expenses, period));
            const filteredOtherIncome = maybeSort(filterByPeriod(otherIncome, period));

            const totalBookings = filteredBookings.length;
            const totalIncome = filteredBookings.reduce((sum, b) => sum + (Math.round(Number(b.fee) || 0)), 0);
            const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Math.round(Number(e.amount) || 0)), 0);
            const totalOtherIncome = filteredOtherIncome.reduce((sum, i) => sum + (Math.round(Number(i.amount) || 0)), 0);
            const netProfit = (totalIncome + totalOtherIncome) - totalExpenses;
            const balancesDue = filteredBookings.reduce((sum, b) => sum + (Math.round(Number(b.balance) || 0)), 0);

            return {
                filteredBookings,
                filteredExpenses,
                filteredOtherIncome,
                totalBookings,
                totalIncome,
                totalExpenses,
                totalOtherIncome,
                netProfit,
                balancesDue
            };
        }

        // Add this function to update report statistics
        function updateReportStatistics() {
            const periodEl = document.getElementById('reportPeriod');
            if (!periodEl) return;
            const period = periodEl.value;
            const {
                totalBookings,
                totalIncome,
                totalExpenses,
                totalOtherIncome,
                netProfit,
                balancesDue
            } = getReportPeriodData(period, { sortNewestFirst: false });
            
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
                const social = Math.round(Number(item.socialFollowers) || 0);
                const spotify = Math.round(Number(item.spotifyListeners) || 0);
                const youtube = Math.round(Number(item.youtubeListeners) || 0);
                const artistLabel = escapeHtml(item.artist || 'Artist');
                const periodLabel = escapeHtml(item.period || '');
                return `
                    <div class="audience-metric-row">
                        <div class="audience-metric-row__meta">
                            <strong class="audience-metric-row__artist">${artistLabel}</strong>
                            <span class="audience-metric-row__period">${periodLabel}</span>
                        </div>
                        <div class="audience-metric-row__stats">
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">Social</span> <span class="audience-metric-row__value">${social.toLocaleString()}</span></span>
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">Spotify</span> <span class="audience-metric-row__value">${spotify.toLocaleString()}</span></span>
                            <span class="audience-metric-row__stat"><span class="audience-metric-row__label">YouTube</span> <span class="audience-metric-row__value">${youtube.toLocaleString()}</span></span>
                        </div>
                    </div>
                `;
            }).join('');
            list.innerHTML = rows;
        }

        function saveAudienceMetricEntry() {
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

        // Get period string for PDF filename
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

        let reportLogoDataUrlCache = null;
        let reportLogoDataUrlPromise = null;

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

        async function getReportLogoDataUrl() {
            if (reportLogoDataUrlCache) return reportLogoDataUrlCache;
            if (reportLogoDataUrlPromise) return reportLogoDataUrlPromise;

            reportLogoDataUrlPromise = (async () => {
                try {
                    const origin = window.location.origin && window.location.origin !== 'null'
                        ? window.location.origin
                        : '';
                    const withOrigin = (path) => origin ? `${origin}${path}` : path;
                    const logoCandidates = [
                        withOrigin('/logo-report.png?v=11'),
                        withOrigin('/logo.png?v=11'),
                        withOrigin('/logo-192.png?v=11'),
                        withOrigin('/logo-report.png'),
                        withOrigin('/logo.png'),
                        withOrigin('/logo-192.png'),
                        withOrigin('/log.jpg')
                    ];
                    const relativeFallbacks = [
                        './logo-report.png?v=11',
                        './logo.png?v=11',
                        './logo-192.png?v=11',
                        './logo-report.png',
                        './logo.png',
                        './logo-192.png',
                        './log.jpg'
                    ];
                    const candidateList = [...logoCandidates, ...relativeFallbacks];
                    const isFileProtocol = window.location.protocol === 'file:';
                    for (const logoSrc of candidateList) {
                        if (!isFileProtocol) {
                            try {
                                const response = await fetch(logoSrc, { cache: 'force-cache' });
                                if (response.ok) {
                                    const blob = await response.blob();
                                    reportLogoDataUrlCache = await blobToDataUrl(blob);
                                    if (reportLogoDataUrlCache) {
                                        return reportLogoDataUrlCache;
                                    }
                                }
                            } catch (err) {
                                console.warn(`Report logo fetch candidate failed (${logoSrc}):`, err);
                            }
                        }

                        const imageDataUrl = await loadLogoDataUrlFromImage(logoSrc);
                        if (imageDataUrl) {
                            reportLogoDataUrlCache = imageDataUrl;
                            return reportLogoDataUrlCache;
                        }
                    }
                    if (EMBEDDED_REPORT_LOGO_DATA_URL && EMBEDDED_REPORT_LOGO_DATA_URL.startsWith('data:image/')) {
                        reportLogoDataUrlCache = EMBEDDED_REPORT_LOGO_DATA_URL;
                        console.warn('Report logo loaded from embedded fallback.');
                        return reportLogoDataUrlCache;
                    }
                    console.warn('Report logo unavailable: all logo candidates failed.');
                    return '';
                } finally {
                    reportLogoDataUrlPromise = null;
                }
            })();

            return reportLogoDataUrlPromise;
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
            const data = getReportPeriodData(period, { sortNewestFirst: true });
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
                { label: 'Category', value: e => e.category || '' },
                { label: 'Description', value: e => e.description || e.name || '' },
                { label: 'Amount (UGX)', value: e => fmtMoney(e.amount) },
            ]);

            const otherIncomeCSV = arrayToCSV(data.filteredOtherIncome, [
                { label: 'Date',   value: i => fmtDate(i.date) },
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

        // Clean Report Generation (without +P)
        async function generateCleanReport() {
            if (generateCleanReport._busy) return;
            generateCleanReport._busy = true;
            try {
                if (typeof window.generateMomentumPDF === 'function' && window.generateMomentumPDF !== generateCleanReport) {
                    return await window.generateMomentumPDF();
                }
                const { period } = getReportPeriodSelection();
                const { jsPDF } = window.jspdf;
                const isMobileReportLayout = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;

                const pdf = new jsPDF({
                    orientation: isMobileReportLayout ? 'portrait' : 'landscape',
                    unit: 'mm',
                    format: 'a4',
                    putOnlyUsedFonts: true,
                    floatPrecision: 16
                });
                const reportLogoDataUrl = await getReportLogoDataUrl();
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const margin = isMobileReportLayout ? 10 : 12;
                const contentWidth = pageWidth - (margin * 2);
                const periodLabel = getPeriodString(period).replace(/-/g, ' ');
                const generatedLabel = formatDisplayDate(new Date());
                const closingThoughtsInput = document.getElementById('closingThoughtsInput');
                const draftClosingThoughts = String(closingThoughtsInput?.value || '').trim();
                const closingThoughts = draftClosingThoughts || getClosingThoughtsForPeriod(period).trim();
                const formatMoney = (value) => `UGX ${Math.round(Number(value) || 0).toLocaleString()}`;
                const palette = {
                    black: [20, 20, 20],
                    white: [255, 255, 255],
                    gold: [255, 179, 0],
                    goldDark: [198, 140, 0],
                    paper: [251, 247, 238],
                    line: [227, 217, 198],
                    text: [33, 33, 33],
                    muted: [105, 105, 105],
                    income: [46, 125, 50],
                    expense: [198, 40, 40],
                    neutral: [44, 62, 80]
                };
    
                const {
                    filteredBookings,
                    filteredExpenses,
                    filteredOtherIncome,
                    totalBookings,
                    totalIncome,
                    totalExpenses,
                    totalOtherIncome,
                    netProfit,
                    balancesDue
                } = getReportPeriodData(period, { sortNewestFirst: true });
    
                const drawHeader = (subtitle = 'Activity Report') => {
                    const headerHeight = isMobileReportLayout ? 26 : 24;
                    pdf.setFillColor(...palette.black);
                    pdf.rect(0, 0, pageWidth, headerHeight, 'F');
    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(isMobileReportLayout ? 15 : 16);
                    pdf.setTextColor(...palette.gold);
                    pdf.text('Star Paper', margin, 10);
    
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(isMobileReportLayout ? 8.5 : 10);
                    pdf.setTextColor(...palette.white);
                    const subtitleWidth = contentWidth - 24;
                    const subtitleLines = pdf.splitTextToSize(`${subtitle}  |  Period: ${periodLabel}`, subtitleWidth);
                    const subtitleStartY = isMobileReportLayout ? 14.8 : 16;
                    subtitleLines.slice(0, 2).forEach((line, index) => {
                        pdf.text(String(line), margin, subtitleStartY + (index * 3.7));
                    });
    
                    pdf.setFontSize(isMobileReportLayout ? 7.4 : 8.5);
                    pdf.setTextColor(224, 224, 224);
                    pdf.text(`Generated: ${generatedLabel}   User: ${currentUser || 'Manager'}`, margin, isMobileReportLayout ? 24 : 21);
                };
    
                const drawLogoOnCurrentPage = () => {
                    if (!reportLogoDataUrl) return;
                    try {
                        const logoSize = isMobileReportLayout ? 14 : 16;
                        const logoX = pageWidth - margin - logoSize;
                        const logoY = isMobileReportLayout ? 5 : 4;
                        const frameX = logoX - 0.8;
                        const frameY = logoY - 0.8;
                        const frameSize = logoSize + 1.6;
                        const imageFormat = /^data:image\/jpe?g/i.test(reportLogoDataUrl) ? 'JPEG' : 'PNG';
                        pdf.setFillColor(245, 239, 226);
                        pdf.setDrawColor(212, 170, 96);
                        pdf.setLineWidth(0.35);
                        pdf.roundedRect(frameX, frameY, frameSize, frameSize, 2, 2, 'FD');
                        pdf.addImage(reportLogoDataUrl, imageFormat, logoX, logoY, logoSize, logoSize);
                    } catch (err) {
                        console.warn('Report logo failed to render:', err);
                    }
                };
    
                const drawSectionTitle = (title, y) => {
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(11);
                    pdf.setTextColor(...palette.goldDark);
                    pdf.text(title, margin, y);
                    pdf.setDrawColor(...palette.line);
                    pdf.setLineWidth(0.5);
                    pdf.line(margin, y + 2, pageWidth - margin, y + 2);
                };
    
                const drawPanelFrame = (title, x, y, width, height) => {
                    pdf.setFillColor(...palette.paper);
                    pdf.roundedRect(x, y, width, height, 2, 2, 'F');
                    pdf.setDrawColor(...palette.line);
                    pdf.setLineWidth(0.35);
                    pdf.roundedRect(x, y, width, height, 2, 2, 'S');
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(9.5);
                    pdf.setTextColor(...palette.goldDark);
                    pdf.text(title, x + 3, y + 6);
                    return {
                        x: x + 2.5,
                        y: y + 8,
                        width: width - 5,
                        height: height - 10
                    };
                };
    
                drawHeader('Activity Report');
    
                const cards = [
                    { label: 'Total Bookings', value: `${totalBookings}`, color: palette.neutral },
                    { label: 'Show Income', value: formatMoney(totalIncome), color: palette.income },
                    { label: 'Other Income', value: formatMoney(totalOtherIncome), color: palette.income },
                    { label: 'Total Expenses', value: formatMoney(totalExpenses), color: palette.expense },
                    { label: 'Balance Brought Forward', value: formatMoney(getCurrentBBF()), color: palette.neutral },
                    { label: 'Net Profit', value: formatMoney(netProfit), color: netProfit >= 0 ? palette.income : palette.expense }
                ];
    
                const cardGap = 4;
                const cardColumns = isMobileReportLayout ? 2 : 3;
                const cardWidth = (contentWidth - (cardGap * (cardColumns - 1))) / cardColumns;
                const cardHeight = isMobileReportLayout ? 22 : 20;
                const cardRowGap = isMobileReportLayout ? 5 : 4;
                const cardY = 30;
    
                cards.forEach((card, index) => {
                    const col = index % cardColumns;
                    const row = Math.floor(index / cardColumns);
                    const x = margin + ((cardWidth + cardGap) * col);
                    const y = cardY + ((cardHeight + cardRowGap) * row);
    
                    pdf.setFillColor(...palette.paper);
                    pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'F');
                    pdf.setDrawColor(...palette.line);
                    pdf.setLineWidth(0.35);
                    pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'S');
    
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(8);
                    pdf.setTextColor(...palette.muted);
                    pdf.text(card.label, x + 3, y + 6);
    
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(11);
                    pdf.setTextColor(...card.color);
                    pdf.text(card.value, x + 3, y + 14);
                });
    
                const activityRows = [];
                filteredBookings.forEach((entry) => {
                    activityRows.push({
                        date: entry.date,
                        type: 'Booking',
                        detail: `${entry.event || 'Event'} (${entry.artist || 'Artist'})`,
                        amount: Number(entry.fee) || 0,
                        amountClass: 'income'
                    });
                });
                filteredExpenses.forEach((entry) => {
                    activityRows.push({
                        date: entry.date,
                        type: 'Expense',
                        detail: `${entry.description || 'Expense'} (${entry.category || 'other'})`,
                        amount: Number(entry.amount) || 0,
                        amountClass: 'expense'
                    });
                });
                filteredOtherIncome.forEach((entry) => {
                    activityRows.push({
                        date: entry.date,
                        type: 'Other Income',
                        detail: `${entry.source || 'Income'} (${entry.type || 'other'})`,
                        amount: Number(entry.amount) || 0,
                        amountClass: 'income'
                    });
                });
                activityRows.sort((a, b) => new Date(b.date) - new Date(a.date));
    
                const cardRows = Math.ceil(cards.length / cardColumns);
                const cardsBottom = cardY + (cardRows * cardHeight) + ((cardRows - 1) * cardRowGap);
                let tableY = cardsBottom + 13;
                drawSectionTitle('Transaction Ledger', tableY);
                tableY += 5;
    
                const columnDate = margin + 2;
                const columnType = margin + (isMobileReportLayout ? 24 : 32);
                const columnDetail = margin + (isMobileReportLayout ? 47 : 63);
                const columnAmountRight = pageWidth - margin - 2;
                const detailWidth = isMobileReportLayout ? Math.max(45, contentWidth - 78) : 118;
                const rowHeight = isMobileReportLayout ? 7 : 6;
                const tableBottomLimit = pageHeight - margin - (isMobileReportLayout ? 10 : 8);
    
                const drawLedgerHeader = (y) => {
                    pdf.setFillColor(245, 239, 226);
                    pdf.rect(margin, y - 4.2, contentWidth, rowHeight, 'F');
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(isMobileReportLayout ? 8 : 8.5);
                    pdf.setTextColor(...palette.text);
                    pdf.text('Date', columnDate, y);
                    pdf.text(isMobileReportLayout ? 'Type' : 'Type', columnType, y);
                    pdf.text('Description', columnDetail, y);
                    const amountWidth = pdf.getTextWidth('Amount');
                    pdf.text('Amount', columnAmountRight - amountWidth, y);
                    pdf.setDrawColor(...palette.line);
                    pdf.setLineWidth(0.3);
                    pdf.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
                };
    
                drawLedgerHeader(tableY);
                tableY += 6;
    
                if (activityRows.length === 0) {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...palette.muted);
                    pdf.text('No records for the selected period.', margin + 2, tableY + 2);
                } else {
                    activityRows.forEach((row) => {
                        if ((tableY + rowHeight) > tableBottomLimit) {
                            pdf.addPage();
                            drawHeader('Activity Report (Continued)');
                            drawSectionTitle('Transaction Ledger (Continued)', 30);
                            tableY = isMobileReportLayout ? 34 : 35;
                            drawLedgerHeader(tableY);
                            tableY += 6;
                        }
    
                        const safeDetail = String(row.detail || '-');
                        const compactDetail = pdf.splitTextToSize(safeDetail, detailWidth)[0] || '-';
                        const typeLabel = (isMobileReportLayout && row.type === 'Other Income') ? 'Other' : row.type;
                        const amountText = `${row.amountClass === 'expense' ? '-' : '+'}${formatMoney(row.amount).replace('UGX ', '')}`;
    
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(isMobileReportLayout ? 8 : 8.5);
                        pdf.setTextColor(...palette.text);
                        pdf.text(formatDisplayDate(row.date), columnDate, tableY);
                        pdf.text(typeLabel, columnType, tableY);
                        pdf.text(compactDetail, columnDetail, tableY);
    
                        pdf.setFont('helvetica', 'bold');
                        if (row.amountClass === 'expense') {
                            pdf.setTextColor(...palette.expense);
                        } else {
                            pdf.setTextColor(...palette.income);
                        }
                        const amountWidth = pdf.getTextWidth(amountText);
                        pdf.text(amountText, columnAmountRight - amountWidth, tableY);
    
                        pdf.setDrawColor(236, 230, 217);
                        pdf.setLineWidth(0.2);
                        pdf.line(margin, tableY + 1.5, pageWidth - margin, tableY + 1.5);
                        tableY += rowHeight;
                    });
                }
    
                pdf.addPage();
                drawHeader('Visual Insights');
    
                const panelY = 30;
                const panelGap = isMobileReportLayout ? 5 : 6;
                const panelWidth = isMobileReportLayout ? contentWidth : (contentWidth - panelGap) / 2;
                const panelHeight = isMobileReportLayout ? 64 : 76;
    
                const chartPanel = drawPanelFrame('Financial Performance', margin, panelY, panelWidth, panelHeight);
                const mapPanel = drawPanelFrame(
                    'Tour Map Coverage',
                    isMobileReportLayout ? margin : (margin + panelWidth + panelGap),
                    isMobileReportLayout ? (panelY + panelHeight + panelGap) : panelY,
                    panelWidth,
                    panelHeight
                );
    
                const monthTotals = new Map();
                const addToMonth = (dateStr, amount, key) => {
                    if (!dateStr) return;
                    const date = new Date(dateStr);
                    if (Number.isNaN(date.getTime())) return;
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    if (!monthTotals.has(monthKey)) {
                        monthTotals.set(monthKey, { income: 0, expenses: 0, other: 0 });
                    }
                    monthTotals.get(monthKey)[key] += amount;
                };
                filteredBookings.forEach((entry) => addToMonth(entry.date, Number(entry.fee) || 0, 'income'));
                filteredExpenses.forEach((entry) => addToMonth(entry.date, Number(entry.amount) || 0, 'expenses'));
                filteredOtherIncome.forEach((entry) => addToMonth(entry.date, Number(entry.amount) || 0, 'other'));
    
                const chartKeys = Array.from(monthTotals.keys()).sort().slice(-6);
                if (typeof Chart !== 'undefined' && chartKeys.length > 0) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 900;
                    canvas.height = 420;
                    const ctx = canvas.getContext('2d');
                    const chart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: chartKeys,
                            datasets: [
                                {
                                    label: 'Show Income',
                                    data: chartKeys.map((key) => monthTotals.get(key).income),
                                    borderColor: '#ffb300',
                                    backgroundColor: 'rgba(255, 179, 0, 0.12)',
                                    tension: 0.3,
                                    fill: true,
                                    borderWidth: 2
                                },
                                {
                                    label: 'Other Income',
                                    data: chartKeys.map((key) => monthTotals.get(key).other),
                                    borderColor: '#2e7d32',
                                    backgroundColor: 'rgba(46, 125, 50, 0.10)',
                                    tension: 0.3,
                                    fill: true,
                                    borderWidth: 2
                                },
                                {
                                    label: 'Expenses',
                                    data: chartKeys.map((key) => monthTotals.get(key).expenses),
                                    borderColor: '#c62828',
                                    backgroundColor: 'rgba(198, 40, 40, 0.10)',
                                    tension: 0.3,
                                    fill: true,
                                    borderWidth: 2
                                }
                            ]
                        },
                        options: {
                            responsive: false,
                            maintainAspectRatio: false,
                            animation: { duration: 0 },
                            plugins: {
                                legend: {
                                    labels: {
                                        color: '#2b2b2b',
                                        font: { size: 11 }
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: { color: '#444' },
                                    grid: { color: 'rgba(0,0,0,0.08)' }
                                },
                                x: {
                                    ticks: { color: '#444' },
                                    grid: { color: 'rgba(0,0,0,0.05)' }
                                }
                            }
                        }
                    });
                    chart.update();
                    await new Promise((resolve) => requestAnimationFrame(resolve));
                    const chartImg = canvas.toDataURL('image/png', 1.0);
                    pdf.addImage(chartImg, 'PNG', chartPanel.x, chartPanel.y, chartPanel.width, chartPanel.height);
                    chart.destroy();
                } else {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...palette.muted);
                    pdf.text('No chart data available for this period.', chartPanel.x + 2, chartPanel.y + 18);
                }
    
                const mapContainer = document.getElementById('performanceMap');
                if (mapContainer && window.html2canvas) {
                    const clone = mapContainer.cloneNode(true);
                    clone.style.width = '900px';
                    clone.style.height = '420px';
                    clone.style.position = 'fixed';
                    clone.style.left = '-9999px';
                    clone.style.top = '0';
                    document.body.appendChild(clone);
    
                    const originalMapHtml = mapContainer.innerHTML;
                    renderPerformanceMap(filteredBookings, { showLabels: false, showLocationList: true, showPinnedPanel: false });
                    clone.innerHTML = mapContainer.innerHTML;
                    mapContainer.innerHTML = originalMapHtml;
    
                    const mapCanvas = await html2canvas(clone, { backgroundColor: '#f6f0e2', scale: 2 });
                    const mapImg = mapCanvas.toDataURL('image/png', 0.95);
                    document.body.removeChild(clone);
                    pdf.addImage(mapImg, 'PNG', mapPanel.x, mapPanel.y, mapPanel.width, mapPanel.height);
    
                    // Restore the live map card to current dashboard state.
                    renderPerformanceMap();
                } else {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...palette.muted);
                    pdf.text('Map preview unavailable.', mapPanel.x + 2, mapPanel.y + 18);
                }
    
                let artistsPanel;
                let statusPanel;
                if (isMobileReportLayout) {
                    pdf.addPage();
                    drawHeader('Visual Insights (Continued)');
                    artistsPanel = drawPanelFrame('Top Artists by Show Income', margin, 30, contentWidth, 78);
                    statusPanel = drawPanelFrame('Booking Status Mix', margin, 116, contentWidth, 74);
                } else {
                    const bottomY = panelY + panelHeight + 10;
                    const lowerPanelHeight = 68;
                    artistsPanel = drawPanelFrame('Top Artists by Show Income', margin, bottomY, panelWidth, lowerPanelHeight);
                    statusPanel = drawPanelFrame('Booking Status Mix', margin + panelWidth + panelGap, bottomY, panelWidth, lowerPanelHeight);
                }
    
                const artistTotals = {};
                filteredBookings.forEach((entry) => {
                    const name = String(entry.artist || 'Unknown Artist');
                    artistTotals[name] = (artistTotals[name] || 0) + (Number(entry.fee) || 0);
                });
                const topArtists = Object.entries(artistTotals)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
    
                if (topArtists.length === 0) {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...palette.muted);
                    pdf.text('No booking income records available.', artistsPanel.x + 2, artistsPanel.y + 12);
                } else {
                    let lineY = artistsPanel.y + 8;
                    topArtists.forEach(([name, amount], index) => {
                        const label = `${index + 1}. ${name}`;
                        const labelWidthLimit = Math.max(35, artistsPanel.width - 46);
                        const compactLabel = pdf.splitTextToSize(label, labelWidthLimit)[0] || label;
                        const value = formatMoney(amount);
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(8.5);
                        pdf.setTextColor(...palette.text);
                        pdf.text(compactLabel, artistsPanel.x + 1, lineY);
                        pdf.setFont('helvetica', 'bold');
                        pdf.setTextColor(...palette.income);
                        const valueWidth = pdf.getTextWidth(value);
                        pdf.text(value, (artistsPanel.x + artistsPanel.width - 2) - valueWidth, lineY);
                        lineY += 9;
                    });
                }
    
                const statusCounts = filteredBookings.reduce((acc, entry) => {
                    const key = String(entry.status || 'pending').toLowerCase();
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});
                const statusRows = [
                    ['Confirmed', statusCounts.confirmed || 0, palette.income],
                    ['Pending', statusCounts.pending || 0, palette.goldDark],
                    ['Cancelled', statusCounts.cancelled || 0, palette.expense]
                ];
    
                let statusY = statusPanel.y + 8;
                statusRows.forEach(([label, count, tone]) => {
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(9);
                    pdf.setTextColor(...palette.text);
                    pdf.text(String(label), statusPanel.x + 1, statusY);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setTextColor(...tone);
                    const valueText = String(count);
                    const valueWidth = pdf.getTextWidth(valueText);
                    pdf.text(valueText, (statusPanel.x + statusPanel.width - 2) - valueWidth, statusY);
                    statusY += 10;
                });
    
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8.5);
                pdf.setTextColor(...palette.muted);
                pdf.text(`Balance brought forward: ${formatMoney(getCurrentBBF())}`, statusPanel.x + 1, statusY + 4);
                pdf.text(`Net profit trend: ${netProfit >= 0 ? 'Positive' : 'Negative'} (${formatMoney(netProfit)})`, statusPanel.x + 1, statusY + 11);
    
                if (closingThoughts) {
                    const frameTop = 34;
                    const frameHeight = pageHeight - frameTop - margin - 3;
                    const textX = margin + 4;
                    const textWidth = contentWidth - 8;
                    const lineHeight = 5;
                    const maxTextY = pageHeight - margin - 6;
    
                    const startClosingThoughtsPage = (continued = false) => {
                        pdf.addPage();
                        drawHeader(continued ? 'Closing Thoughts (Continued)' : 'Closing Thoughts');
                        drawSectionTitle(continued ? 'Manager Closing Thoughts (Continued)' : 'Manager Closing Thoughts', 30);
                        pdf.setFillColor(...palette.paper);
                        pdf.roundedRect(margin, frameTop, contentWidth, frameHeight, 2, 2, 'F');
                        pdf.setDrawColor(...palette.line);
                        pdf.setLineWidth(0.35);
                        pdf.roundedRect(margin, frameTop, contentWidth, frameHeight, 2, 2, 'S');
                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(9);
                        pdf.setTextColor(...palette.text);
                        return frameTop + 8;
                    };
    
                    let thoughtsY = startClosingThoughtsPage(false);
                    const paragraphs = closingThoughts.split(/\r?\n/);
                    paragraphs.forEach((paragraph, paragraphIndex) => {
                        const lines = paragraph.trim()
                            ? pdf.splitTextToSize(paragraph.trim(), textWidth)
                            : [''];
    
                        lines.forEach((line) => {
                            if (thoughtsY > maxTextY) {
                                thoughtsY = startClosingThoughtsPage(true);
                            }
                            if (line) {
                                pdf.text(String(line), textX, thoughtsY);
                            }
                            thoughtsY += lineHeight;
                        });
    
                        if (paragraphIndex < paragraphs.length - 1) {
                            thoughtsY += 1.5;
                        }
                    });
                }
    
                const totalPages = pdf.getNumberOfPages();
                for (let page = 1; page <= totalPages; page += 1) {
                    pdf.setPage(page);
                    drawLogoOnCurrentPage();
                }
                for (let page = 1; page <= totalPages; page += 1) {
                    pdf.setPage(page);
                    pdf.setDrawColor(...palette.line);
                    pdf.setLineWidth(0.25);
                    pdf.line(margin, pageHeight - 7, pageWidth - margin, pageHeight - 7);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(8);
                    pdf.setTextColor(...palette.muted);
                    const pageLabel = `Page ${page} of ${totalPages}`;
                    const pageLabelWidth = pdf.getTextWidth(pageLabel);
                    pdf.text(pageLabel, pageWidth - margin - pageLabelWidth, pageHeight - 3.6);
                }
    
                pdf.save(`StarPaper-Report-${getPeriodString(period).replace(/\s+/g, '-')}.pdf`);
            } finally {
                generateCleanReport._busy = false;
            }
        }

        function showAddExpense() {
            if (guardReadOnly('add expenses')) return;
            // Ensure money section + expenses tab are active before showing form
            if (typeof showSection === 'function') showSection('expenses');
            if (typeof switchMoneyTab === 'function') switchMoneyTab('expenses');
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
            document.getElementById('expenseReceipt').value = '';
            document.getElementById('receiptPreview').style.display = 'none';
            document.getElementById('receiptPreview').src = '';
        }

        function previewReceipt(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('receiptPreview');
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        }

        function saveExpense() {
            if (guardReadOnly('save expenses')) return;

            try {
                const receiptSrc = document.getElementById('receiptPreview').src || null;
                const existingExpense = editingExpenseId ? expenses.find(e => e.id === editingExpenseId) : null;
                const expense = {
                    id: editingExpenseId || Date.now(),
                    description: sanitizeTextInput(document.getElementById('expenseDesc').value),
                    amount: Math.round(Number(document.getElementById('expenseAmount').value) || 0),
                    date: document.getElementById('expenseDate').value,
                    category: sanitizeTextInput(document.getElementById('expenseCategory').value),
                    receipt: receiptSrc,
                    createdAt: existingExpense?.createdAt || Date.now()
                };

                if (!expense.description || !expense.amount || !expense.date) {
                    toastError('Please fill in all required fields.');
                    return;
                }

                if (editingExpenseId) {
                    const idx = expenses.findIndex(e => e.id === editingExpenseId);
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
                toastSuccess(editingExpenseId === null ? 'Expense saved!' : 'Expense updated!');
                saveUserData();
                updateDashboard();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveExpense failed:', err);
                toastError('Something went wrong. Check the console for details.');
            }
        }

        function renderExpenses() {
            const tbody = document.querySelector('#expensesTable tbody');
            const sortedExpenses = sortNewestFirst(expenses);

            if (sortedExpenses.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5">${emptyState({
                    icon: 'ph-receipt',
                    title: 'No expenses yet',
                    sub: 'Track your costs â€” travel, equipment, studio time, and more.',
                    ctaLabel: '+ Log Expense',
                    ctaAction: "showAddExpense()"
                })}</td></tr>`;
                const cards = document.getElementById('expensesCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-receipt',
                    title: 'No expenses yet',
                    sub: 'Track your costs â€” travel, equipment, studio time, and more.',
                    ctaLabel: '+ Log Expense',
                    ctaAction: "showAddExpense()"
                });
                return;
            }

            tbody.innerHTML = sortedExpenses.map(expense => `
                <tr class="expense-edit-trigger" data-expense-id="${expense.id}" onclick="editExpense(${expense.id})">
                    <td>${expense.description}</td>
                    <td>${expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}</td>
                    <td class="expense-red">UGX ${(Math.round(Number(expense.amount) || 0)).toLocaleString()}</td>
                    <td>${formatDisplayDate(expense.date)}</td>
                    <td>
                        ${expense.receipt ?
                            `<button class="action-btn icon-btn" data-receipt="${expense.id}" onclick="event.stopPropagation(); viewReceiptById(this.dataset.receipt, 'expense')" aria-label="View receipt" title="View receipt"><i class="ph ph-eye" aria-hidden="true"></i></button>` :
                            '-'}
                    </td>
                </tr>
            `).join('');

            const cards = document.getElementById('expensesCards');
            if (cards) {
                cards.innerHTML = sortedExpenses.map(expense => `
                    <div class="expense-card card-animate expense-edit-trigger" data-expense-id="${expense.id}" onclick="editExpense(${expense.id})">
                        <div class="booking-card-header">
                            <div class="booking-title">${expense.description}</div>
                            <span class="status-badge status-pending">${expense.category}</span>
                        </div>
                        <div class="expense-meta">
                            <div class="expense-field"><span>Category</span>${expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}</div>
                            <div class="expense-field expense-red"><span>Amount</span>UGX ${(Math.round(Number(expense.amount) || 0)).toLocaleString()}</div>
                            <div class="expense-field"><span>Date</span>${formatDisplayDate(expense.date)}</div>
                            <div class="expense-field"><span>Receipt</span>${expense.receipt ? 'Attached' : 'None'}</div>
                        </div>
                        <div class="expense-actions">
                            ${expense.receipt ? `<button class="action-btn icon-btn" onclick="event.stopPropagation(); viewReceipt('${expense.receipt}')" aria-label="View receipt" title="View receipt"><i class="ph ph-eye" aria-hidden="true"></i></button>` : ''}
                            <button class="action-btn icon-btn delete-btn" onclick="event.stopPropagation(); deleteExpense(${expense.id})" aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                `).join('');
            }
        }

        function deleteExpense(id, silent = false) {
            if (!silent && guardReadOnly('delete expenses')) return;
            if (!silent && !confirm('Are you sure you want to delete this expense?')) {
                return;
            }
            expenses = expenses.filter(e => e.id !== id);
            if (window.SP?.deleteExpense) {
                window.SP.deleteExpense(id).catch((err) => {
                    console.warn('Cloud delete expense failed:', err);
                });
            }
            saveUserData();
            renderExpenses();
            updateDashboard();
            updateReportStatistics();
        }

        function editExpense(id) {
            if (guardReadOnly('edit expenses')) return;
            const expense = expenses.find(e => e.id === id);
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

            if (expense.receipt) {
                document.getElementById('receiptPreview').src = expense.receipt;
                document.getElementById('receiptPreview').style.display = 'block';
            }

            showAddExpense();
        }

        function viewReceipt(receiptData) {
            const modal = document.getElementById('receiptModal');
            const img = document.getElementById('receiptModalImage');
            img.src = receiptData;
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

        function closeReceiptModal() {
            document.getElementById('receiptModal').style.display = 'none';
        }

        // Other Income Functions
        function showAddOtherIncome() {
            if (guardReadOnly('add other income')) return;
            // Ensure money section + otherIncome tab are active before showing form
            if (typeof showSection === 'function') showSection('otherIncome');
            if (typeof switchMoneyTab === 'function') switchMoneyTab('otherIncome');
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
            document.getElementById('otherIncomeType').value = 'tips';
            document.getElementById('otherIncomePayer').value = '';
            document.getElementById('otherIncomeMethod').value = 'cash';
            document.getElementById('otherIncomeStatus').value = 'received';
            document.getElementById('otherIncomeNotes').value = '';
            document.getElementById('otherIncomeProof').value = '';
            document.getElementById('otherIncomeProofPreview').style.display = 'none';
            document.getElementById('otherIncomeProofPreview').src = '';
        }

        function previewOtherIncomeProof(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('otherIncomeProofPreview');
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        }

        function saveOtherIncome() {
            if (guardReadOnly('save other income')) return;

            try {
                const proofSrc = document.getElementById('otherIncomeProofPreview').src || null;
                const existingIncome = editingOtherIncomeId ? otherIncome.find(i => i.id === editingOtherIncomeId) : null;
                const incomeItem = {
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

                if (!incomeItem.source || !incomeItem.amount || !incomeItem.date) {
                    toastError('Please fill in all required fields.');
                    return;
                }

                if (editingOtherIncomeId) {
                    const idx = otherIncome.findIndex(i => i.id === editingOtherIncomeId);
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
                saveUserData();
                renderOtherIncome();
                cancelOtherIncome();
                updateDashboard();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveOtherIncome failed:', err);
                toastError('Something went wrong. Check the console for details.');
            }
        }

        function renderOtherIncome() {
            const tbody = document.querySelector('#otherIncomeTable tbody');
            if (!tbody) return;

            const sortedOtherIncome = sortNewestFirst(otherIncome);

            if (sortedOtherIncome.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8">${emptyState({
                    icon: 'ph-plus-circle',
                    title: 'No other income yet',
                    sub: 'Log sponsorships, royalties, merch sales, and other revenue streams.',
                    ctaLabel: '+ Log Income',
                    ctaAction: "showAddOtherIncome()"
                })}</td></tr>`;
                const cards = document.getElementById('otherIncomeCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-plus-circle',
                    title: 'No other income yet',
                    sub: 'Log sponsorships, royalties, merch sales, and other revenue streams.',
                    ctaLabel: '+ Log Income',
                    ctaAction: "showAddOtherIncome()"
                });
                return;
            }

            tbody.innerHTML = sortedOtherIncome.map(item => {
                const statusClass = item.status === 'received' ? 'status-confirmed' : 'status-pending';
                return `
                    <tr class="other-income-edit-trigger" data-other-income-id="${item.id}" onclick="editOtherIncome(${item.id})">
                        <td>${item.source}</td>
                        <td>${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</td>
                        <td class="income-green">UGX ${(Math.round(Number(item.amount) || 0)).toLocaleString()}</td>
                        <td>${formatDisplayDate(item.date)}</td>
                        <td>${item.payer || '-'}</td>
                        <td>${item.method ? item.method.toUpperCase() : '-'}</td>
                        <td><span class="status-badge ${statusClass}">${item.status}</span></td>
                        <td>
                            ${item.proof ?
                                `<button class="action-btn icon-btn" data-receipt="${item.id}" onclick="event.stopPropagation(); viewReceiptById(this.dataset.receipt, 'otherIncome')" aria-label="View proof" title="View proof"><i class="ph ph-eye" aria-hidden="true"></i></button>` :
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
                        <div class="expense-card card-animate other-income-edit-trigger" data-other-income-id="${item.id}" onclick="editOtherIncome(${item.id})">
                            <div class="booking-card-header">
                                <div class="booking-title">${item.source}</div>
                                <span class="status-badge ${statusClass}">${item.status}</span>
                            </div>
                            <div class="expense-meta">
                                <div class="expense-field"><span>Type</span>${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</div>
                                <div class="expense-field income-green"><span>Amount</span>UGX ${(Math.round(Number(item.amount) || 0)).toLocaleString()}</div>
                                <div class="expense-field"><span>Date</span>${formatDisplayDate(item.date)}</div>
                                <div class="expense-field"><span>Payer/Brand</span>${item.payer || '-'}</div>
                                <div class="expense-field"><span>Method</span>${item.method ? item.method.toUpperCase() : '-'}</div>
                                <div class="expense-field"><span>Notes</span>${item.notes || 'None'}</div>
                            </div>
                            <div class="expense-actions">
                                ${item.proof ? `<button class="action-btn icon-btn" onclick="event.stopPropagation(); viewReceipt('${item.proof}')" aria-label="View proof" title="View proof"><i class="ph ph-eye" aria-hidden="true"></i></button>` : ''}
                                <button class="action-btn icon-btn delete-btn" onclick="event.stopPropagation(); deleteOtherIncome(${item.id})" aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        function deleteOtherIncome(id, silent = false) {
            if (!silent && guardReadOnly('delete other income')) return;
            if (!silent && !confirm('Are you sure you want to delete this entry?')) {
                return;
            }
            otherIncome = otherIncome.filter(i => i.id !== id);
            if (window.SP?.deleteOtherIncome) {
                window.SP.deleteOtherIncome(id).catch((err) => {
                    console.warn('Cloud delete other income failed:', err);
                });
            }
            saveUserData();
            renderOtherIncome();
            updateDashboard();
            updateReportStatistics();
        }

        function editOtherIncome(id) {
            if (guardReadOnly('edit other income')) return;
            const item = otherIncome.find(i => i.id === id);
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

            if (item.proof) {
                document.getElementById('otherIncomeProofPreview').src = item.proof;
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
                    toastError('Please log in as a manager first.');
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
                        avatar: pendingArtistAvatarValue || existingArtist.avatar || ''
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
                    ctaAction: "showAddArtistForm()"
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
                const artistAvatarSrc = artist.avatar ? escapeHtml(artist.avatar) : '';
                const artistAvatarMarkup = artistAvatarSrc
                    ? `<img class="artist-avatar-img" src="${artistAvatarSrc}" alt="${artistName} photo">`
                    : artistInitial;
                return `
                <div class="artist-card artist-card--editable" data-artist-id="${artistId}" data-artist-name="${artistName}" tabindex="0" role="button" aria-label="Edit ${artistName}">
                    <div class="artist-avatar">${artistAvatarMarkup}</div>
                    <h4>${artistName}</h4>
                    <p class="artist-specialty">${artistSpecialty}</p>
                    <p class="artist-bio">${artistBio}</p>
                    ${artistGoal ? `<p class="artist-bio" style="color:#c8a846;">Goal: ${artistGoal}</p>` : ''}
                    <div class="artist-contact">
                        ${artistEmail ? `<div><i class="ph ph-envelope-simple" aria-hidden="true"></i> ${artistEmail}</div>` : ''}
                        ${artistPhone ? `<div><i class="ph ph-phone" aria-hidden="true"></i> ${artistPhone}</div>` : ''}
                    </div>
                    <button type="button" class="action-btn delete-btn" data-action="deleteArtistCard" data-artist-id="${artistId}" style="width: 100%; margin-top: 10px;">Remove Artist</button>
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
            
            console.log('Populating artist dropdown with:', artistList.map((artist) => artist.name));
            select.innerHTML = '<option value="">Select Artist</option>' + 
                artistList.map(artist => `<option value="${artist.name}">${artist.name}</option>`).join('');
            populateAudienceArtistDropdown();
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

        function saveBooking() {
            if (guardReadOnly('save bookings')) return;

            try {
                const locationType = document.getElementById('bookingLocationType').value;
                const location = locationType === 'uganda' 
                    ? document.getElementById('bookingUgandaLocation').value
                    : document.getElementById('bookingAbroadLocation').value;
                const feeValue = Math.round(Number(document.getElementById('bookingFee').value) || 0);
                const depositValue = Math.round(Number(document.getElementById('bookingDeposit').value) || 0);
                const capacityValue = Math.round(Number(document.getElementById('bookingCapacity').value) || 0);
                const balanceValue = feeValue - depositValue;
                const existingBooking = editingBookingId ? bookings.find(b => b.id === editingBookingId) : null;

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

                const isEdit = !!editingBookingId; // capture before it gets nulled
                if (editingBookingId) {
                    const idx = bookings.findIndex(b => b.id === editingBookingId);
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
                if (booking.status === 'confirmed') triggerGoldDust();
                toastSuccess(isEdit ? 'Booking updated!' : 'ðŸŽ‰ Booking saved!');
                // Persist and refresh remaining views
                saveUserData();
                updateDashboard();
                renderCalendar();
                renderPerformanceMap();
                updateReportStatistics();
        
            } catch (err) {
                console.error('[StarPaper] saveBooking failed:', err);
                toastError('Something went wrong. Check the console for details.');
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
                    ctaAction: "showAddBooking()"
                })}</td></tr>`;
                const cards = document.getElementById('bookingsCards');
                if (cards) cards.innerHTML = emptyState({
                    icon: 'ph-calendar-check',
                    title: 'No bookings yet',
                    sub: 'Log your first show to start tracking fees, deposits, and balances.',
                    ctaLabel: '+ Add Booking',
                    ctaAction: "showAddBooking()"
                });
                return;
            }

            const renderedBookings = sortedBookings.map((booking, index) => ({
                booking,
                weatherKey: getWeatherRenderKey(booking, index)
            }));
            tbody.innerHTML = renderedBookings.map(({ booking, weatherKey }) => `
                <tr class="booking-edit-trigger" data-booking-id="${booking.id}" onclick="editBooking(${booking.id})">
                    <td data-label="Event" class="td-event">${booking.event}</td>
                    <td data-label="Artist">${booking.artist}</td>
                    <td data-label="Date" class="td-date">${formatDisplayDate(booking.date)}</td>
                    <td data-label="Capacity" class="td-capacity">${booking.capacity ? Number(booking.capacity).toLocaleString() : '-'}</td>
                    <td data-label="Location">${booking.location || '-'} ${booking.locationType === 'abroad' ? '<i class="ph ph-globe" aria-hidden="true"></i>' : 'UG'} <span class="show-weather-slot" id="bookingWeatherTable-${weatherKey}"></span></td>
                    <td data-label="Total Fee" class="income-green td-fee">UGX ${(Math.round(Number(booking.fee) || 0)).toLocaleString()}</td>
                    <td data-label="Deposit" class="deposit-blue td-deposit">UGX ${(Math.round(Number(booking.deposit) || 0)).toLocaleString()}</td>
                    <td data-label="Balance Due" class="${booking.balance > 0 ? 'expense-red' : 'income-green'} td-balance">
                        UGX ${(Math.round(Number(booking.balance) || 0)).toLocaleString()}
                    </td>
                    <td data-label="Contact" class="td-contact">${booking.contact || '-'}</td>
                    <td data-label="Status" class="td-status">
                        <span class="status-badge status-${booking.status}">
                            ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </span>
                    </td>
                    <td data-label="Notes" class="notes-cell">${booking.notes || '-'}</td>
                </tr>
            `).join('');

            const cards = document.getElementById('bookingsCards');
            if (cards) {
                cards.innerHTML = renderedBookings.map(({ booking, weatherKey }) => `
                    <div class="booking-card card-animate booking-edit-trigger" data-booking-id="${booking.id}" onclick="editBooking(${booking.id})">
                        <div class="booking-card-header">
                            <div class="booking-title">${booking.event}</div>
                            <span class="status-badge status-${booking.status}">
                                ${booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                            </span>
                        </div>
                        <div class="booking-meta">
                            <div class="booking-field"><span>Artist</span>${booking.artist}</div>
                            <div class="booking-field"><span>Date</span>${formatDisplayDate(booking.date)}</div>
                            <div class="booking-field"><span>Capacity</span>${booking.capacity ? Number(booking.capacity).toLocaleString() : '-'}</div>
                            <div class="booking-field"><span>Location</span>${booking.location || '-'} ${booking.locationType === 'abroad' ? '<i class="ph ph-globe" aria-hidden="true"></i>' : 'UG'} <span class="show-weather-slot" id="bookingWeatherCard-${weatherKey}"></span></div>
                            <div class="booking-field income-green"><span>Total Fee</span>UGX ${(Math.round(Number(booking.fee) || 0)).toLocaleString()}</div>
                            <div class="booking-field deposit-blue"><span>Deposit</span>UGX ${(Math.round(Number(booking.deposit) || 0)).toLocaleString()}</div>
                            <div class="booking-field ${booking.balance > 0 ? 'expense-red' : 'income-green'}"><span>Balance Due</span>UGX ${(Math.round(Number(booking.balance) || 0)).toLocaleString()}</div>
                            <div class="booking-field"><span>Contact</span>${booking.contact || '-'}</div>
                            <div class="booking-field"><span>Notes</span>${booking.notes || '-'}</div>
                        </div>
                        <div class="booking-actions">
                            <button class="action-btn icon-btn delete-btn" onclick="event.stopPropagation(); deleteBooking(${booking.id})" aria-label="Delete" title="Delete"><i class="ph ph-trash" aria-hidden="true"></i></button>
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
            console.log('=== UPDATE PERFORMANCE CHART STARTING ===');
            
            // Check if Chart.js is loaded
            if (typeof Chart === 'undefined') {
                console.error('Chart.js is not loaded! Cannot render chart.');
                return;
            }
            
            const ctx = document.getElementById('performanceChart');
            if (!ctx) {
                console.error('Performance chart canvas not found!');
                return;
            }
            
            console.log('Chart.js available, canvas found');
            console.log('Bookings for chart:', bookings);
            console.log('Expenses for chart:', expenses);
            console.log('Other income for chart:', otherIncome);

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
            
            console.log('Month labels:', monthLabels);
            
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
            
            console.log('Monthly income data:', monthlyIncome);
            console.log('Monthly expenses data:', monthlyExpenses);
            console.log('Monthly other income data:', monthlyOtherIncome);

            if (window.performanceChart && typeof window.performanceChart.destroy === 'function') {
                console.log('Destroying existing chart');
                window.performanceChart.destroy();
            }

            try {
                const isLightTheme = document.body.classList.contains('light-theme');
                const palette = isLightTheme
                    ? {
                        legend: '#2b1f08',
                        tooltipBg: 'rgba(255, 255, 255, 0.98)',
                        tooltipBorder: '#D4AF37',
                        tooltipTitle: '#6f5314',
                        tooltipBody: '#1f170d',
                        yTick: '#2b1f08',
                        xTick: '#2b1f08',
                        yGrid: 'rgba(111, 83, 20, 0.28)',
                        xGrid: 'rgba(111, 83, 20, 0.20)',
                        pointBorder: '#ffffff',
                        income: '#1f7a4d',
                        incomeFill: 'rgba(31, 122, 77, 0.14)',
                        other: '#2f6ebd',
                        otherFill: 'rgba(47, 110, 189, 0.14)',
                        expense: '#b45309',
                        expenseFill: 'rgba(180, 83, 9, 0.14)'
                    }
                    : {
                        legend: '#ffffff',
                        tooltipBg: 'rgba(0, 0, 0, 0.9)',
                        tooltipBorder: '#FFB300',
                        tooltipTitle: '#FFB300',
                        tooltipBody: '#ffffff',
                        yTick: '#ffffff',
                        xTick: '#ffffff',
                        yGrid: 'rgba(255, 255, 255, 0.1)',
                        xGrid: 'rgba(255, 255, 255, 0.05)',
                        pointBorder: '#ffffff',
                        income: '#4caf50',
                        incomeFill: 'rgba(76, 175, 80, 0.1)',
                        other: '#2196f3',
                        otherFill: 'rgba(33, 150, 243, 0.12)',
                        expense: '#ff9800',
                        expenseFill: 'rgba(255, 152, 0, 0.1)'
                    };

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
                                tension: 0.4,
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
                                tension: 0.4,
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
                                tension: 0.4,
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
                                    font: { size: 13 },
                                    padding: 15
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
                                    callback: function(value) {
                                        return 'UGX ' + (value / 1000000).toFixed(1) + 'M';
                                    }
                                },
                                grid: { color: palette.yGrid }
                            },
                            x: {
                                ticks: { 
                                    color: palette.xTick,
                                    maxRotation: 45,
                                    minRotation: 45
                                },
                                grid: { color: palette.xGrid }
                            }
                        }
                    }
                });
                console.log('Performance chart rendered successfully');
            } catch (error) {
                console.error('Error creating performance chart:', error);
            }
        }

        function getAllBookings() {
            return Object.values(managerData || {}).reduce((acc, record) => {
                const managerBookings = Array.isArray(record?.bookings) ? record.bookings : [];
                return acc.concat(managerBookings);
            }, []);
        }

        function updateAvailabilityArtists() {
            const select = document.getElementById('availabilityArtist');
            if (!select) return;
            
            const artists = getArtists().map((artist) => artist.name);
            select.innerHTML = '<option value="">Select Artist</option>' + 
                artists.map(artist => `<option value="${artist}">${artist}</option>`).join('');
        }

        function checkAvailability() {
            const artistName = document.getElementById('availabilityArtist').value;
            const date = document.getElementById('availabilityDate').value;
            const resultDiv = document.getElementById('availabilityResult');

            if (!artistName || !date) {
                resultDiv.innerHTML = '<p style="color: #ff9800;">Please select both artist and date</p>';
                return;
            }

            // Get all bookings for all managers
            const allBookings = getAllBookings();

            // Check if artist has booking on that date
            const artistBookings = allBookings.filter(b => b.artist === artistName && b.date === date);

            if (artistBookings.length > 0) {
                resultDiv.innerHTML = `
                    <div style="background: rgba(244, 67, 54, 0.1); border-left: 3px solid #f44336; padding: 15px; border-radius: 5px;">
                        <strong style="color: #f44336;">NOT AVAILABLE</strong>
                        <p style="color: #ccc; margin-top: 10px;">${artistName} is already booked on ${formatDisplayDate(date)}</p>
                        ${artistBookings.map(b => `
                            <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px;">
                                <div><strong>${b.event}</strong></div>
                                <div style="font-size: 12px; color: #888;">
                                    ${b.location ? `${b.location} ${b.locationType === 'abroad' ? '(Abroad)' : '(Uganda)'}` : 'Location not set'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div style="background: rgba(76, 175, 80, 0.1); border-left: 3px solid #4caf50; padding: 15px; border-radius: 5px;">
                        <strong style="color: #4caf50;">AVAILABLE</strong>
                        <p style="color: #ccc; margin-top: 10px;">${artistName} is free on ${formatDisplayDate(date)}</p>
                        <button class="add-btn" onclick="bookArtistFromAvailability('${artistName}', '${date}')" style="margin-top: 10px; width: auto;">Book Now</button>
                    </div>
                `;
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
            const booking = bookings.find(b => b.id === id);
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

        // Custom delete confirmation â€” avoids browser confirm() dialog
        function confirmDeleteBooking(id) {
            const modal = document.getElementById('confirmDeleteModal');
            const body  = document.getElementById('confirmDeleteBody');
            const booking = bookings.find(b => b.id === id);
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

        function deleteBooking(id, silent = false) {
            if (guardReadOnly('delete bookings')) return;
            if (!silent && !confirm('Are you sure you want to delete this booking?')) return;
            
            bookings = bookings.filter(b => b.id !== id);
            if (window.SP?.deleteBooking) {
                window.SP.deleteBooking(id).catch((err) => {
                    console.warn('Cloud delete booking failed:', err);
                });
            }
            saveUserData();
            renderBookings();
            updateDashboard();
            renderCalendar();
            updateReportStatistics();
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
                list.innerHTML = '<p style="color: #888; text-align: center; padding: 14px;">No upcoming confirmed shows.</p>';
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
                return `
                <div class="timeline-item dashboard-stream-item dashboard-upcoming-item">
                    <div class="timeline-meta">
                        <div class="timeline-title">${booking.event || 'Untitled Event'} ${weatherHolder}</div>
                        <div class="timeline-sub">${formatDisplayDate(booking.date)}  -  ${booking.location || 'Venue TBC'}  -  ${booking.artist || 'Artist'}</div>
                    </div>
                    <div class="timeline-amount">
                        <span class="booking-status-pill ${statusClass}">${status.toUpperCase()}</span>
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
                <div class="timeline-item dashboard-stream-item dashboard-upcoming-item dashboard-activity-item ${item.type}">
                    <div class="timeline-meta">
                        <div class="timeline-title">${item.title} ${timeLabel}</div>
                        <div class="timeline-sub">${formatDisplayDate(item.date)}  -  ${item.sub}</div>
                    </div>
                    <div class="timeline-amount">
                        <span class="booking-status-pill ${item.badgeClass}">${item.badge}</span>
                        <span class="timeline-fee ${item.amountClass}">${item.amountLabel}</span>
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
                if (goalAmountEl) countUp(goalAmountEl, monthlyGoal);
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
                            icon: 'StarPaperLogo-transparent.png',
                            badge: 'StarPaperLogo-transparent.png'
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
                        <div class="timeline-title">${item.title}</div>
                        <div class="timeline-sub">${formatDisplayDate(item.date)}  -  ${item.sub}</div>
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
                list.innerHTML = '<p style="color: #888; text-align: center; padding: 14px;">No cash flow entries in the last 2 months.</p>';
                return;
            }

            // Show last 12 items
            list.innerHTML = items.slice(0, 12).map(item => `
                <div class="timeline-item">
                    <div class="timeline-meta">
                        <div class="timeline-title">${item.title}</div>
                        <div class="timeline-sub">${formatDisplayDate(item.date)}  -  ${item.sub}</div>
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

            const inlineStyle = select.getAttribute('style');
            if (inlineStyle) {
                wrapper.setAttribute('style', inlineStyle);
                select.removeAttribute('style');
            }

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
            updateLandingTopControlsVisibility();
        }

        function updateLandingTopControlsVisibility() {
            const controls = document.querySelector('.landing-top-controls');
            const landingScreen = document.getElementById('landingScreen');
            if (!controls || !landingScreen) return;
            const landingVisible = landingScreen.style.display !== 'none';
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

        // â”€â”€ Premium Toast System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function showToast(message, type = 'info', opts = {}) {
            const stack = document.getElementById('spToastStack');
            if (!stack) return;

            const icons = { success: '<i class="ph ph-check-circle" aria-hidden="true"></i>', error: '<i class="ph ph-x-circle" aria-hidden="true"></i>', info: '<i class="ph ph-info" aria-hidden="true"></i>', warning: '<i class="ph ph-warning" aria-hidden="true"></i>' };
            const dur = opts.duration || (type === 'error' ? 5000 : 3200);
            const durSec = (dur / 1000).toFixed(1) + 's';

            const toast = document.createElement('div');
            toast.className = `sp-toast sp-toast--${type}`;
            toast.setAttribute('role', 'status');
            toast.innerHTML = `
                <span class="sp-toast__icon">${icons[type] || icons.info}</span>
                <div class="sp-toast__body">
                    <div class="sp-toast__title">${opts.title || ''}</div>
                    <div class="sp-toast__msg">${message}</div>
                </div>
                <button class="sp-toast__close" aria-label="Dismiss">âœ•</button>
                <div class="sp-toast__bar" style="--sp-toast-dur:${durSec}"></div>
            `;
            // If no title set, promote message to title
            if (!opts.title) {
                toast.querySelector('.sp-toast__title').textContent = message;
                toast.querySelector('.sp-toast__msg').remove();
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

        // â”€â”€ Relative timestamps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Empty state builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function emptyState({ icon, title, sub, ctaLabel, ctaAction }) {
            // icon = Phosphor class name e.g. 'ph-receipt' OR legacy emoji (renders as text fallback)
            const isPhosphor = typeof icon === 'string' && icon.startsWith('ph-');
            const iconHTML = isPhosphor
                ? `<i class="ph ${icon} sp-empty__ph-icon" aria-hidden="true"></i>`
                : `<svg class="sp-empty__art" viewBox="0 0 72 72" fill="none"><circle cx="36" cy="36" r="35" stroke="rgba(255,179,0,0.15)" stroke-width="1.5"/><text x="36" y="44" text-anchor="middle" font-size="28" fill="rgba(255,179,0,0.45)">${icon}</text></svg>`;
            return `<div class="sp-empty">
                ${iconHTML}
                <p class="sp-empty__title">${title}</p>
                <p class="sp-empty__sub">${sub}</p>
                ${ctaLabel ? `<button class="sp-empty__cta" onclick="${ctaAction}">${ctaLabel}</button>` : ''}
            </div>`;
        }

        // â”€â”€ Revenue Pulse â€” countUp animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Tab switchers: Money â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            if (!tab) return;
            activateMoneyTab(tab);
            if (tab === 'financials') { updateDashboard(); renderPerformanceMap(); }
            else if (tab === 'expenses') renderExpenses();
            else if (tab === 'otherIncome') renderOtherIncome();
            else if (tab === 'reports') updateReportsSection();
        }
        window.switchMoneyTab = switchMoneyTab;

        // â”€â”€ Dedicated tab listener (bypasses all action dispatchers) â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Tab switchers: Schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            if (!tab) return;
            activateScheduleTab(tab);
            if (tab === 'bookings') renderBookings();
            else if (tab === 'calendar') renderCalendar();
        }
        window.switchScheduleTab = switchScheduleTab;

        // â”€â”€ About Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â”€â”€ Admin Settings Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                                    <td>${u.name || u.email || 'â€”'}</td>
                                    <td style="color:var(--text-muted)">${u.email || 'â€”'}</td>
                                    <td><span class="sp-admin-pill sp-admin-pill--${u.status}">${u.status}</span></td>
                                    <td><div class="sp-admin-actions">
                                        ${u.status === 'pending' ? `<button class="sp-admin-btn sp-admin-btn--approve" onclick="adminApproveUser('${u.id || u.email}')">Approve</button>` : ''}
                                        <button class="sp-admin-btn sp-admin-btn--delete" onclick="adminDeleteUser('${u.id || u.email}')">Delete</button>
                                    </div></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>`;
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

        // â”€â”€ Booking Velocity Gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // Arc: 0â€“180 degrees mapped to 0â€“max shows
            // Arc total length â‰ˆ 251px (Ï€ * 80)
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
                    deltaEl.textContent = `â–² ${diff} more`;
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--up';
                } else if (diff < 0) {
                    deltaEl.textContent = `â–¼ ${Math.abs(diff)} fewer`;
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--down';
                } else {
                    deltaEl.textContent = 'â€” same pace';
                    deltaEl.className = 'velocity-gauge__delta velocity-gauge__delta--flat';
                }
            }
        }

        // â”€â”€ Today Board + Nudge Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Midnight Whisper (9 PM â€“ 4 AM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (hour >= 21 || hour < 4) {
                const liveCount = allBookings.filter(b => b.status === 'confirmed' && b.date === todayStr).length;
                nudges.push({
                    type: 'info', icon: 'ph-moon', id: 'nudge-midnight',
                    text: liveCount > 0
                        ? `The night is young. ${liveCount} artist${liveCount > 1 ? 's are' : ' is'} currently live.`
                        : `The night is young. Keep building.`
                });
            }

            // â”€â”€ Collection Nudge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Show Nudge â€” show in â‰¤5 days with balance due â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Momentum Nudge â€” 3+ confirmed bookings in 3 months â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (!alertsEl) return;
            const dismissed = JSON.parse(sessionStorage.getItem('sp_dismissed_nudges') || '[]');
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
                    <span class="nudge-text">All Clear â€” No urgent items require your attention today.</span>
                </div>`;
                return;
            }

            alertsEl.innerHTML = visible.map(n => {
                const itemClasses = ['nudge-item', `nudge-item--${escapeHtml(n.type)}`];
                if (n.action) itemClasses.push('nudge-item--clickable');
                const actionAttrs = n.action
                    ? ` data-nudge-action="${escapeHtml(n.action)}" data-nudge-action-id="${escapeHtml(n.actionId || '')}" tabindex="0" role="button"`
                    : '';
                return `
                <div class="${itemClasses.join(' ')}" data-nudge-id="${escapeHtml(n.id)}"${actionAttrs}>
                    <span class="nudge-icon">${n.icon && n.icon.startsWith('ph-') ? `<i class="ph ${n.icon}" aria-hidden="true"></i>` : escapeHtml(n.icon)}</span>
                    <span class="nudge-text">${escapeHtml(n.text)}</span>
                    <button class="nudge-dismiss" onclick="(function(btn, ev){
                        ev.stopPropagation();
                        const id = btn.closest('[data-nudge-id]').dataset.nudgeId;
                        const d = JSON.parse(sessionStorage.getItem('sp_dismissed_nudges')||'[]');
                        if (!d.includes(id)) d.push(id);
                        sessionStorage.setItem('sp_dismissed_nudges', JSON.stringify(d));
                        btn.closest('[data-nudge-id]').remove();
                        window.updateTodayBoard();
                    })(this, event)" aria-label="Dismiss"><i class="ph ph-x" aria-hidden="true"></i></button>
                </div>`;
            }).join('');
        };

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

        // â”€â”€ In-app navigation history button state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function updateNavHistButtons() {
            const back = document.getElementById('navBackBtn');
            const fwd  = document.getElementById('navFwdBtn');
            if (!back || !fwd) return;
            back.disabled = !window._spNavStack || window._spNavIndex <= 0;
            fwd.disabled  = !window._spNavStack || window._spNavIndex >= window._spNavStack.length - 1;
        }

        // â”€â”€ Falling Gold Coins canvas animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        (function initCoinRain() {
            const canvas = document.getElementById('coinRainCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let W = 0, H = 0;

            function resize() {
                W = canvas.width  = window.innerWidth;
                H = canvas.height = window.innerHeight;
            }
            window.addEventListener('resize', resize, { passive: true });
            resize();

            const COIN_COUNT = 30;
            const GOLD_STOPS = [
                { pos: 0,    color: '#fff8a0' },
                { pos: 0.28, color: '#ffd700' },
                { pos: 0.55, color: '#c9920a' },
                { pos: 0.80, color: '#d4a820' },
                { pos: 1,    color: '#7a5500' },
            ];

            function makeCoin(seedY) {
                const r     = 7  + Math.random() * 11;
                const x     = Math.random() * (W + 40) - 20;
                const y     = seedY !== undefined ? seedY : (-r - Math.random() * 80);
                const spd   = 0.65 + Math.random() * 1.0;
                const spin  = (Math.random() - 0.5) * 0.07;
                const tilt  = Math.random() * Math.PI;
                const drift = (Math.random() - 0.5) * 0.30;
                const opacity = 0.50 + Math.random() * 0.45;
                return { x, y, r, spd, spin, tilt, drift, opacity };
            }

            function drawCoin(c) {
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.globalAlpha = c.opacity;
                const scaleX = Math.abs(Math.cos(c.tilt)) || 0.04;
                const grad = ctx.createRadialGradient(
                    -c.r * 0.3 * scaleX, -c.r * 0.3, 0,
                     c.r * 0.1 * scaleX,  c.r * 0.1, c.r * 1.1
                );
                GOLD_STOPS.forEach(s => grad.addColorStop(s.pos, s.color));
                ctx.scale(scaleX, 1);
                ctx.beginPath();
                ctx.ellipse(0, 0, c.r, c.r, 0, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,210,60,0.50)';
                ctx.lineWidth = 1.2 / scaleX;
                ctx.stroke();
                if (scaleX > 0.35) {
                    ctx.scale(1 / scaleX, 1);
                    ctx.fillStyle = 'rgba(80,50,0,0.65)';
                    ctx.font = `bold ${Math.round(c.r * 0.92)}px Georgia,serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('$', 0, 0);
                }
                ctx.restore();
            }

            // Seed coins already on screen
            const coins = [];
            for (let i = 0; i < COIN_COUNT; i++) {
                coins.push(makeCoin(Math.random() * H));
            }

            function tick() {
                const landing = document.getElementById('landingScreen');
                if (!landing || landing.style.display === 'none') {
                    requestAnimationFrame(tick);
                    return;
                }
                ctx.clearRect(0, 0, W, H);
                for (const c of coins) {
                    c.y    += c.spd;
                    c.x    += c.drift;
                    c.tilt += c.spin;
                    if (c.y - c.r > H || c.x < -40 || c.x > W + 40) {
                        Object.assign(c, makeCoin());
                    }
                    drawCoin(c);
                }
                requestAnimationFrame(tick);
            }
            tick();
        })();

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
                if (scaleX > 0.38) {
                    ctx.scale(1 / scaleX, 1);
                    ctx.fillStyle = 'rgba(80,50,0,0.62)';
                    ctx.font = `bold ${Math.round(coin.r * 0.86)}px Georgia,serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('$', 0, 0);
                }
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

        // â”€â”€ Gold Dust burst â€” triggered on booking confirmed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function triggerGoldDust() {
            const canvas = document.getElementById('coinRainCanvas');
            if (!canvas) return;
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
                if (elapsed > duration) { ctx.clearRect(0, 0, W, H); return; }
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
                    ctx.restore();
                }
                requestAnimationFrame(burstTick);
            }
            requestAnimationFrame(burstTick);
        }

        // â•â• COMMAND PALETTE & KEYBOARD SHORTCUTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        (function initCommandPalette() {

            // â”€â”€ Section registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const SECTIONS = [
                { id: 'dashboard',   label: 'Dashboard',    icon: '<i class="ph ph-squares-four"></i>',              sub: 'Overview & KPIs',                key: 'D' },
                { id: 'money',       label: 'Money',        icon: '<i class="ph ph-currency-circle-dollar"></i>',   sub: 'Financials, Expenses & Reports', key: 'M' },
                { id: 'schedule',    label: 'Schedule',     icon: '<i class="ph ph-calendar-blank"></i>',           sub: 'Bookings & Calendar',            key: 'S' },
                { id: 'artists',     label: 'Artists',      icon: 'ph-microphone-stage', sub: 'Roster & profiles',              key: 'A' },
                { id: 'tasks',       label: 'Tasks',        icon: '<i class="ph ph-clipboard-text"></i>', sub: 'To-dos & reminders',             key: 'T' },
            ];

            const ACTIONS = [
                { label: 'Add Booking',    icon: '<i class="ph ph-calendar-plus"></i>', sub: 'Log a new show',       action: () => { showSection('schedule');    setTimeout(() => showAddBooking?.(), 80); } },
                { label: 'Add Expense',    icon: '<i class="ph ph-receipt"></i>', sub: 'Log a cost or bill',   action: () => { showSection('expenses');    setTimeout(() => showAddExpense?.(), 80); } },
                { label: 'Add Artist',     icon: '<i class="ph ph-microphone-stage"></i>', sub: 'Add to your roster',   action: () => { showSection('artists');     setTimeout(() => showAddArtistForm?.(), 80); } },
                { label: 'Add Income',     icon: '<i class="ph ph-plus-circle"></i>', sub: 'Log other income',      action: () => { showSection('otherIncome'); } },
                { label: 'Open Palette',   icon: '<i class="ph ph-command"></i>', sub: 'Cmd/Ctrl+K',           action: () => openPalette() },
            ];

            // â”€â”€ DOM refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const palette   = document.getElementById('spPalette');
            const backdrop  = document.getElementById('spPaletteBackdrop');
            const input     = document.getElementById('spPaletteInput');
            const resultsList = document.getElementById('spPaletteResults');
            const kbdHint   = document.getElementById('spKbdHint');
            if (!palette || !input || !resultsList) return;

            let isOpen = false;
            let selectedIdx = -1;
            let currentResults = [];

            // â”€â”€ Open / close â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Search & render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            function highlight(text, query) {
                if (!query) return text;
                const idx = text.toLowerCase().indexOf(query.toLowerCase());
                if (idx < 0) return text;
                return text.slice(0, idx) +
                    '<mark>' + text.slice(idx, idx + query.length) + '</mark>' +
                    text.slice(idx + query.length);
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
                const matchArtists = artistList.filter(a => a.name.toLowerCase().includes(q)).slice(0, 4);
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
                        type: 'booking', label: b.event, icon: 'ph-calendar-check',
                        sub: `${b.artist} Â· ${b.date || ''}`, query: q,
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
                        return `<li class="sp-palette__group-label" role="presentation">${item.label}</li>`;
                    }
                    if (item.type === 'empty') {
                        return `<li class="sp-palette__empty" role="option">No results for "<strong>${query}</strong>"</li>`;
                    }
                    const resultIdx = currentResults.indexOf(item);
                    const isSelected = resultIdx === selectedIdx;
                    const kbdHtml = item.key
                        ? `<span class="sp-palette__result-kbd">G+${item.key}</span>` : '';
                    return `<li class="sp-palette__result" role="option"
                        aria-selected="${isSelected}"
                        data-result-idx="${resultIdx}">
                        <div class="sp-palette__result-icon">${item.icon || 'â–¸'}</div>
                        <div class="sp-palette__result-body">
                            <div class="sp-palette__result-title">${highlight(item.label, item.query)}</div>
                            <div class="sp-palette__result-sub">${item.sub || ''}</div>
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

            // â”€â”€ Input handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            input.addEventListener('input', () => {
                selectedIdx = -1;
                renderResults(input.value);
            });

            // â”€â”€ Keyboard navigation inside palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            // â”€â”€ Global keyboard shortcuts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let gPressed = false;
            let gTimer = null;

            document.addEventListener('keydown', e => {
                const tag = document.activeElement?.tagName?.toLowerCase();
                const inInput = ['input','textarea','select'].includes(tag) ||
                    document.activeElement?.isContentEditable;

                // Cmd/Ctrl+K â€” open palette
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
                        'm': 'money',     's': 'schedule'
                    };
                if (gPressed) {
                    const target = keyMap[e.key.toLowerCase()];
                    if (target) {
                        e.preventDefault();
                        gPressed = false;
                        clearTimeout(gTimer);
                        const section = SECTIONS.find(s => s.id === target);
                        showSection(target);
                        showKbdHint(`â†’ ${section?.label || target}`);
                        return;
                    }
                }
            });

            // â”€â”€ Keyboard hint display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

        // â•â• PHASE 5: DENSITY TOGGLE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        (function initDensityToggle() {
            const STORAGE_KEY = 'sp_density';
            const comfyBtn    = document.getElementById('densityComfortableBtn');
            const compactBtn  = document.getElementById('densityCompactBtn');
            if (!comfyBtn || !compactBtn) return;

            function applyDensity(mode) {
                document.body.classList.toggle('sp-density--compact', mode === 'compact');
                comfyBtn.classList.toggle('active', mode !== 'compact');
                compactBtn.classList.toggle('active', mode === 'compact');
                try { localStorage.setItem(STORAGE_KEY, mode); } catch(e) {}
            }

            // Restore persisted preference
            let saved = 'comfortable';
            try { saved = localStorage.getItem(STORAGE_KEY) || 'comfortable'; } catch(e) {}
            applyDensity(saved);

            comfyBtn.addEventListener('click',   () => applyDensity('comfortable'));
            compactBtn.addEventListener('click',  () => applyDensity('compact'));
        })();

        // â•â• PHASE 5: GOAL PROGRESS PULSE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

        // â•â• PHASE 5: KEYBOARD CHEAT SHEET â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

            // ? key opens cheat sheet â€” only when not in input and app is active
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

        // â”€â”€ Typewriter headline animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        (function normalizeNavOrder() {
            const sidebarNav = document.querySelector('.sidebar-nav');
            if (sidebarNav) {
                const tasksBtn = sidebarNav.querySelector('.nav-item[data-section="tasks"]');
                const artistsBtn = sidebarNav.querySelector('.nav-item[data-section="artists"]');
                if (tasksBtn && artistsBtn) {
                    sidebarNav.insertBefore(tasksBtn, artistsBtn);
                }
            }

            const bottomNav = document.getElementById('bottomNav');
            if (bottomNav) {
                const moneyBtn = bottomNav.querySelector('.bottom-nav-item[data-section="money"]');
                const scheduleBtn = bottomNav.querySelector('.bottom-nav-item[data-section="schedule"]');
                if (moneyBtn && scheduleBtn) {
                    bottomNav.insertBefore(moneyBtn, scheduleBtn);
                }
            }
        })();

        (function initTypewriter() {
            const heading = document.querySelector('#landingScreen .landing-hero-heading');
            if (heading && !heading.dataset.twDone) {
                heading.dataset.twDone = '1';
                const words = heading.textContent.trim().split(/\s+/);
                heading.innerHTML = words.map((word, index) =>
                    `<span class="tw-word" style="animation-delay:${(index * 0.09).toFixed(2)}s">${word}&nbsp;</span>`
                ).join('');
            }

            const subtitle = document.querySelector('#landingScreen .landing-hero-subtitle');
            if (!subtitle || subtitle.dataset.twRotatorDone) return;
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

            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReducedMotion) {
                let index = 0;
                subtitle.textContent = uniqueLines[index];
                setInterval(() => {
                    const landing = document.getElementById('landingScreen');
                    if (!landing || landing.style.display === 'none') return;
                    index = (index + 1) % uniqueLines.length;
                    subtitle.textContent = uniqueLines[index];
                }, 3600);
                return;
            }

            // â”€â”€ Cursor-safe structure: text lives in a <span>, cursor is a sibling <i>
            // We NEVER overwrite subtitle.innerHTML so the cursor element persists.
            subtitle.classList.add('landing-hero-subtitle--typing');
            subtitle.innerHTML = '<span class="tw-text"></span><i class="ph ph-cursor-text tw-cursor" aria-hidden="true"></i>';
            const textEl   = subtitle.querySelector('.tw-text');
            const cursorEl = subtitle.querySelector('.tw-cursor');

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

            // charIndex starts at 0 â€” tick() will type from empty naturally
            tick();
        })();

        // â”€â”€ Collapsible sidebar (desktop â‰¥1025px) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                try { localStorage.setItem(STORAGE_KEY, val ? '1' : '0'); } catch(e) {}
            };

            // Restore saved state â€” set position without transition
            if (isDesktop()) {
                let saved = '0';
                try { saved = localStorage.getItem(STORAGE_KEY) || '0'; } catch(e) {}
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
                    let saved = '0';
                    try { saved = localStorage.getItem(STORAGE_KEY) || '0'; } catch(e) {}
                    const isCollapsed = saved === '1';
                    if (isCollapsed) document.body.classList.add('sidebar--collapsed');
                    updateBtnPosition(isCollapsed, false);
                }
            });
        })();

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js?v=38').then((registration) => {
                    registration.update().catch(() => {});
                }).catch((error) => {
                    console.warn('Service worker registration failed:', error);
                });
            });
        }
