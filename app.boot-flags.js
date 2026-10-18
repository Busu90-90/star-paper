(function applyPolishFlagsBeforePaint() {
  // The legacy premium/shell polish layers are retired: the app shell is styled by
  // styles.app.css on the Forest & Foil tokens. The gated legacy rules stay off.
  try {
    var html = document.documentElement;
    html.classList.add('sp-prem-off', 'sp-handcraft-off', 'sp-shell-off');
    html.classList.remove('sp-shell-refined');
  } catch (_err) {}
  // Gold Record logo spin: 'off' pauses it, 'on' keeps it spinning even with reduced motion.
  try {
    var spin = localStorage.getItem('sp_logo_spin');
    if (spin === 'off') document.documentElement.setAttribute('data-logo-spin', 'paused');
    else if (spin === 'on') document.documentElement.setAttribute('data-logo-spin', 'on');
  } catch (_err2) {}
})();
