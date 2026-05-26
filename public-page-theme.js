(function publicPageThemeBoot() {
  'use strict';

  var storageKey = 'starPaperTheme';

  function getSavedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (_err) {
      return null;
    }
  }

  function applyTheme(theme, options) {
    var settings = options || {};
    var normalizedTheme = theme === 'light' ? 'light' : 'dark';
    var isLight = normalizedTheme === 'light';
    var toggle = document.getElementById('landingThemeToggle');
    var icon = toggle ? toggle.querySelector('i') : null;

    document.body.classList.toggle('light-theme', isLight);
    if (icon) icon.className = isLight ? 'ph ph-sun' : 'ph ph-moon';

    if (settings.persist !== false) {
      try {
        localStorage.setItem(storageKey, normalizedTheme);
      } catch (_err) {}
    }
  }

  function bindToggle() {
    var toggle = document.getElementById('landingThemeToggle');
    if (!toggle || toggle.dataset.publicThemeBound === '1') return;
    toggle.dataset.publicThemeBound = '1';
    applyTheme(getSavedTheme() === 'light' ? 'light' : 'dark', { persist: false });
    toggle.addEventListener('click', function onThemeToggleClick() {
      applyTheme(document.body.classList.contains('light-theme') ? 'dark' : 'light');
    });
  }

  applyTheme(getSavedTheme() === 'light' ? 'light' : 'dark', { persist: false });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle, { once: true });
  } else {
    bindToggle();
  }
})();
