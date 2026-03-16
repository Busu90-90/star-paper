(function () {
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

    function handleClick(event) {
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
            case 'showHelpCenterAlert':
                alert('Help documentation coming soon!');
                return;
            case 'showContactAlert':
                alert('Contact: support@starpaper.com');
                return;
            default:
                invokeAction(action);
        }
    }

    function handleChange(event) {
        const elementTarget = getElementTarget(event);
        if (!elementTarget || typeof elementTarget.closest !== 'function') return;
        const target = elementTarget.closest('[data-change-action]');
        if (!target) return;
        const action = target.dataset.changeAction;
        if (!action) return;
        invokeAction(action, [event]);
    }

    function handleInput(event) {
        const elementTarget = getElementTarget(event);
        if (!elementTarget || typeof elementTarget.closest !== 'function') return;
        const target = elementTarget.closest('[data-input-action]');
        if (!target) return;
        const action = target.dataset.inputAction;
        if (!action) return;
        invokeAction(action, [event]);
    }

    function bindDeclarativeActions() {
        if (window.__starPaperActionsBound) return;
        window.__starPaperActionsBound = true;
        document.addEventListener('click', handleClick);
        document.addEventListener('change', handleChange);
        document.addEventListener('input', handleInput);
    }

    window.bindStarPaperDeclarativeActions = bindDeclarativeActions;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindDeclarativeActions, { once: true });
    } else {
        bindDeclarativeActions();
    }
})();
