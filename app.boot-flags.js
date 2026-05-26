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
})();
