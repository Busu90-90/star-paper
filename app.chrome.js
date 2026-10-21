/* Star Paper app chrome: sheets (quick add, notifications, account), the
   notification feed, team entry points and small top-bar conveniences.
   Open/closed state is the `hidden` attribute plus an `is-open` class for the
   transition — never inline styles. */
(function spChrome() {
  'use strict';

  var openSheet = null;
  var lastTrigger = null;
  var CLOSE_MS = 220;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return document.getElementById(id); }

  function setTriggers(id, expanded) {
    document.querySelectorAll('[data-sp-sheet-open="' + id + '"]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', String(expanded));
    });
  }

  function open(id, trigger) {
    var sheet = $(id);
    if (!sheet) return;
    if (openSheet && openSheet !== sheet) close(true);
    if (openSheet === sheet) { close(); return; }
    openSheet = sheet;
    lastTrigger = trigger || null;
    var scrim = $('spSheetScrim');
    if (scrim) scrim.hidden = false;
    sheet.hidden = false;
    document.body.classList.add('sp-sheet-open');
    setTriggers(id, true);
    if (id === 'spNotifySheet') markNotificationsSeen();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.classList.add('is-open');
        if (scrim) scrim.classList.add('is-open');
        var focusable = sheet.querySelector('button:not([data-sp-sheet-dismiss]), [href], input');
        if (focusable) focusable.focus({ preventScroll: true });
      });
    });
  }

  function close(immediate) {
    var sheet = openSheet;
    if (!sheet) return;
    openSheet = null;
    var scrim = $('spSheetScrim');
    sheet.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    document.body.classList.remove('sp-sheet-open');
    setTriggers(sheet.id, false);
    var finish = function () {
      if (openSheet === sheet) return;
      sheet.hidden = true;
      if (scrim && !openSheet) scrim.hidden = true;
    };
    if (immediate === true || reduceMotion) finish(); else setTimeout(finish, CLOSE_MS);
    if (lastTrigger && immediate !== true && document.contains(lastTrigger)) {
      try { lastTrigger.focus({ preventScroll: true }); } catch (_e) {}
    }
    lastTrigger = null;
  }

  // ── Notifications: today's nudges + messages received this session ──────────
  var feed = [];          // { id, kind, icon, text, action, actionId }
  var seen = {};
  try { seen = JSON.parse(sessionStorage.getItem('sp_seen_notifications') || '{}') || {}; } catch (_e) { seen = {}; }

  var KIND_ICON = { warning: 'ph-money', alert: 'ph-microphone-stage', success: 'ph-fire', info: 'ph-moon-stars', message: 'ph-chat-circle-text' };

  function renderFeed() {
    var list = $('spNotifyList');
    var empty = $('spNotifyEmpty');
    var badge = $('spBellBadge');
    if (!list) return;
    list.replaceChildren();
    feed.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'nt-item nt-item--' + item.kind + (seen[item.id] ? '' : ' is-new');
      var ic = document.createElement('span');
      ic.className = 'nt-item__icon';
      var i = document.createElement('i');
      i.className = 'ph ' + (item.icon || KIND_ICON[item.kind] || 'ph-bell');
      i.setAttribute('aria-hidden', 'true');
      ic.appendChild(i);
      var tx = document.createElement('p');
      tx.className = 'nt-item__text';
      tx.textContent = item.text;
      if (item.action) {
        // The whole card is the link to the page the notification is about.
        var go = document.createElement('button');
        go.type = 'button';
        go.className = 'nt-item__go';
        go.setAttribute('data-nt-open', String(feed.indexOf(item)));
        var arrow = document.createElement('i');
        arrow.className = 'ph ph-caret-right nt-item__arrow';
        arrow.setAttribute('aria-hidden', 'true');
        go.append(ic, tx, arrow);
        li.classList.add('nt-item--link');
        li.appendChild(go);
      } else {
        li.append(ic, tx);
      }
      list.appendChild(li);
    });
    if (empty) empty.hidden = feed.length > 0;
    var unread = feed.filter(function (f) { return !seen[f.id]; }).length;
    if (badge) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.hidden = unread === 0;
    }
    var bell = $('spBellBtn');
    if (bell) bell.setAttribute('aria-label', unread ? 'Notifications, ' + unread + ' unread' : 'Notifications');
  }

  function markNotificationsSeen() {
    feed.forEach(function (f) { seen[f.id] = 1; });
    try { sessionStorage.setItem('sp_seen_notifications', JSON.stringify(seen)); } catch (_e) {}
    setTimeout(renderFeed, 600);
  }

  document.addEventListener('sp:nudges', function (e) {
    var nudges = (e.detail && e.detail.nudges) || [];
    var messages = feed.filter(function (f) { return f.kind === 'message'; });
    feed = messages.concat(nudges.map(function (n) {
      return { id: n.id + ':' + n.text, kind: n.type || 'info', icon: n.icon, text: n.text, action: n.action || '', actionId: n.actionId || '' };
    }));
    renderFeed();
  });

  document.addEventListener('sp:notify', function (e) {
    var d = e.detail || {};
    if (!d.text) return;
    feed.unshift({ id: 'msg:' + Date.now() + ':' + feed.length, kind: d.kind || 'info', text: d.text, action: d.action || '', actionId: d.actionId || '' });
    renderFeed();
  });

  function openNotification(item) {
    if (!item || !item.action) return;
    close(true);
    if (item.action === 'openChat') {
      if (window.SPCrew && typeof window.SPCrew.openConversation === 'function') window.SPCrew.openConversation(item.actionId);
      else if (typeof window.showSection === 'function') window.showSection('crew');
      return;
    }
    if (typeof window.SPNudgeAction === 'function') window.SPNudgeAction(item.action, item.actionId);
    else if (item.action === 'showSection' && typeof window.showSection === 'function') window.showSection(item.actionId);
  }

  // ── Clicks ────────────────────────────────────────────────────────────────
  // Capture phase: some app handlers stop propagation (the quick-add panel).
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;

    var ntOpen = t.closest('[data-nt-open]');
    if (ntOpen) {
      e.preventDefault();
      openNotification(feed[Number(ntOpen.getAttribute('data-nt-open'))]);
      return;
    }

    var opener = t.closest('[data-sp-sheet-open]');
    if (opener) {
      e.preventDefault();
      open(opener.getAttribute('data-sp-sheet-open'), opener);
      return;
    }
    if (t.closest('[data-sp-sheet-dismiss]')) {
      e.preventDefault();
      close();
      return;
    }
    if (t.closest('[data-sp-team]')) {
      e.preventDefault();
      close(true);
      var badge = $('spTeamChatBadge');
      if (badge) { badge.textContent = '0'; badge.hidden = true; }
      if (window.SP && typeof window.SP.showTeamModal === 'function') window.SP.showTeamModal();
      return;
    }
    if (t.closest('[data-sp-theme-toggle]')) {
      e.preventDefault();
      if (typeof window.toggleTheme === 'function') window.toggleTheme();
      return;
    }
    if (t.closest('[data-sp-quick="task"]')) {
      e.preventDefault();
      close(true);
      if (typeof window.showSection === 'function') window.showSection('tasks');
      setTimeout(function () { var input = $('taskInput'); if (input) input.focus(); }, 120);
      return;
    }
    // Any action inside an open sheet closes it after the action runs.
    if (openSheet && openSheet.contains(t) && t.closest('button[data-action]')) {
      setTimeout(function () { close(true); }, 0);
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openSheet) {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable)) return;
      var app = $('appContainer');
      var search = $('dashboardSearch');
      if (!app || app.hidden || !search) return;
      e.preventDefault();
      search.focus();
    }
  }, true);

  // Keep focus inside an open sheet.
  document.addEventListener('focusin', function (e) {
    if (!openSheet || openSheet.contains(e.target)) return;
    var first = openSheet.querySelector('button, [href], input');
    if (first) first.focus({ preventScroll: true });
  });

  // Phones: the bottom bar steps aside while the keyboard is up, so it never
  // sits over the field being typed in.
  function isTypingField(node) {
    if (!node || !node.tagName) return false;
    if (node.isContentEditable || node.tagName === 'TEXTAREA') return true;
    if (node.tagName !== 'INPUT') return false;
    return /^(text|search|email|tel|number|url|password)$/.test(node.type || 'text');
  }
  document.addEventListener('focusin', function (e) {
    if (isTypingField(e.target)) document.body.classList.add('sp-typing');
  });
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      if (!isTypingField(document.activeElement)) document.body.classList.remove('sp-typing');
    }, 120);
  });

  // Top bar gains a hairline + blur once content scrolls under it.
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle('sp-scrolled', y > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  window.SPChrome = { openSheet: open, closeSheets: function () { close(true); }, openNotification: openNotification };
})();
