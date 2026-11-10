/*
 * Start-Animation (SCRUM-283). Eigene Datei, weil die Content-Security-Policy kein Inline-Script erlaubt.
 * Die App blendet den Begrüßungsbildschirm über window.tkSplash.hide() aus (SplashService);
 * läuft sie nicht an, sorgt der Sicherheits-Timeout dafür, dass nichts hängen bleibt.
 */
(function () {
  var el = document.getElementById('tk-splash');
  if (!el) return;
  // Gewähltes Design schon jetzt anwenden (wie ThemeService), damit der Bildschirm nicht falsch aufblitzt.
  try {
    var stored = localStorage.getItem('teamkompass-theme');
    if (stored === 'dark' || stored === 'light') document.documentElement.setAttribute('data-theme', stored);
  } catch (e) {}
  var gone = false;
  var timers = [];
  function hide() {
    if (gone) return;
    gone = true;
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    el.classList.add('tk-splash-out');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 600);
  }
  // Nach 8 s: Hinweis. Nach 20 s: ausblenden, damit die App (oder ihre Fehlermeldung) sichtbar wird.
  timers.push(setTimeout(function () {
    var hint = document.getElementById('tk-splash-hint');
    if (hint && !gone) hint.textContent = 'Lädt länger als üblich …';
  }, 8000));
  timers.push(setTimeout(hide, 20000));
  window.tkSplash = { hide: hide };
})();
