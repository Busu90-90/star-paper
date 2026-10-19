(function applyLogoSpinBeforePaint() {
  // Gold Record logo spin: 'off' pauses it, 'on' keeps it spinning even with reduced motion.
  try {
    var spin = localStorage.getItem('sp_logo_spin');
    if (spin === 'off') document.documentElement.setAttribute('data-logo-spin', 'paused');
    else if (spin === 'on') document.documentElement.setAttribute('data-logo-spin', 'on');
  } catch (_err) {}
})();
