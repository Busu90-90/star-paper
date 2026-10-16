(function applyPolishFlagsBeforePaint() {
  try {
    var premOff = localStorage.getItem('sp_prem_off') === '1';
    var handcraftOff = localStorage.getItem('sp_handcraft_off') === '1';
    var shellOff = localStorage.getItem('sp_shell_refined_off') === '1';
    if (premOff) document.documentElement.classList.add('sp-prem-off');
    if (handcraftOff || premOff) {
      document.documentElement.classList.add('sp-handcraft-off');
    }
    document.documentElement.classList.toggle('sp-shell-refined', !premOff && !handcraftOff && !shellOff);
    document.documentElement.classList.toggle('sp-shell-off', premOff || handcraftOff || shellOff);
  } catch (_err) {}
  // Gold Record logo spin: 'off' pauses it, 'on' keeps it spinning even with reduced motion.
  try {
    var spin = localStorage.getItem('sp_logo_spin');
    if (spin === 'off') document.documentElement.setAttribute('data-logo-spin', 'paused');
    else if (spin === 'on') document.documentElement.setAttribute('data-logo-spin', 'on');
  } catch (_err2) {}
})();
