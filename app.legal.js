// Privacy and Terms pages: match the visitor's light or dark choice before paint.
(function applyStoredThemeBeforePaint() {
  try {
    document.body.classList.toggle('light-theme', localStorage.getItem('starPaperTheme') === 'light');
  } catch (_err) {}
})();
