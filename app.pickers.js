/* Star Paper pickers: the searchable artist picker on the booking form and
   the emoji picker used by every chat composer. No dependencies; both build
   their own DOM and leave the app's existing fields in charge of the data. */
(function spPickers() {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(cls) {
    var i = el('i', 'ph ' + cls);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }

  function norm(v) { return String(v || '').trim().toLowerCase(); }

  // ── Artist picker ─────────────────────────────────────────────────────────
  // The hidden <select id="bookingArtist"> stays the source of truth: every
  // existing read and write of its value keeps working, and the picker mirrors it.
  var AP_SELECT = 'bookingArtist';
  var ap = null; // { select, wrap, input, list, clear, items, index, open }

  function artistList() {
    var list = typeof window.getArtists === 'function' ? window.getArtists() : window.artists;
    return Array.isArray(list) ? list.filter(function (a) { return a && String(a.name || '').trim(); }) : [];
  }

  function showCounts() {
    var counts = {};
    var all = Array.isArray(window.bookings) ? window.bookings : [];
    all.forEach(function (b) {
      var key = norm(b && b.artist);
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  function ensureOption(select, value) {
    var v = String(value || '');
    if (!v) return;
    for (var i = 0; i < select.options.length; i++) if (select.options[i].value === v) return;
    var opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }

  function initArtistPicker() {
    var select = $(AP_SELECT);
    if (!select || select.dataset.spPicker === '1') return;
    select.dataset.spPicker = '1';

    // Writes from app code (edit, prefill, clear, drafts) go through here, so a
    // booking whose artist isn't in the list yet still keeps its name.
    var desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (desc && desc.set && desc.get) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        get: function () { return desc.get.call(this); },
        set: function (v) { ensureOption(this, v); desc.set.call(this, v); syncInput(); }
      });
    }

    var wrap = el('div', 'ap');
    var field = el('div', 'ap__field');
    var input = el('input', 'ap__input');
    input.type = 'text';
    input.id = 'bookingArtistSearch';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Search artists';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'bookingArtistList');
    var clear = el('button', 'ap__clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear artist');
    clear.appendChild(icon('ph-x'));
    clear.hidden = true;
    var caret = el('button', 'ap__caret');
    caret.type = 'button';
    caret.tabIndex = -1;
    caret.setAttribute('aria-label', 'Show artists');
    caret.appendChild(icon('ph-caret-down'));
    field.append(icon('ph-microphone-stage ap__lead'), input, clear, caret);
    var list = el('ul', 'ap__list');
    list.id = 'bookingArtistList';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.append(field, list);

    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.insertAdjacentElement('afterend', wrap);
    var label = select.closest('.form-group') && select.closest('.form-group').querySelector('label');
    if (label) label.htmlFor = input.id;

    ap = { select: select, wrap: wrap, input: input, list: list, clear: clear, items: [], index: 0, open: false };
    syncInput();

    input.addEventListener('focus', function () { input.select(); openList(); });
    input.addEventListener('click', function () { if (!ap.open) openList(); });
    input.addEventListener('input', function () { ap.index = 0; openList(); });
    input.addEventListener('keydown', onKey);
    caret.addEventListener('mousedown', function (e) { e.preventDefault(); });
    caret.addEventListener('click', function () { if (ap.open) closeList(true); else { input.focus(); openList(true); } });
    clear.addEventListener('click', function () { choose(''); input.focus(); openList(true); });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the input
    list.addEventListener('click', function (e) {
      var opt = e.target.closest('[data-ap-index]');
      if (opt) pick(Number(opt.getAttribute('data-ap-index')));
    });
    wrap.addEventListener('focusout', function (e) {
      if (wrap.contains(e.relatedTarget)) return;
      closeList(true);
    });
  }

  function syncInput() {
    if (!ap) return;
    var v = ap.select.value;
    if (document.activeElement !== ap.input || !ap.open) ap.input.value = v;
    ap.clear.hidden = !v;
    ap.wrap.classList.toggle('has-value', !!v);
  }

  function buildItems(query, showAll) {
    var q = showAll ? '' : norm(query);
    var counts = showCounts();
    var artists = artistList().slice().sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    var hits = artists.filter(function (a) {
      if (!q) return true;
      return norm(a.name).indexOf(q) !== -1 || norm(a.specialty).indexOf(q) !== -1;
    });
    // Names that start with the query come first.
    if (q) hits.sort(function (a, b) { return (norm(a.name).indexOf(q) === 0 ? 0 : 1) - (norm(b.name).indexOf(q) === 0 ? 0 : 1); });
    var items = hits.map(function (a) {
      return { kind: 'artist', name: String(a.name).trim(), meta: a.specialty || '', shows: counts[norm(a.name)] || 0, avatar: a.avatar || '', artist: a };
    });
    var typed = String(query || '').trim();
    if (!showAll && typed && !artists.some(function (a) { return norm(a.name) === norm(typed); })) {
      items.push({ kind: 'add', name: typed });
    }
    return items;
  }

  function avatarFor(item) {
    var box = el('span', 'ap__avatar');
    var src = typeof window.SPArtistAvatar === 'function' ? window.SPArtistAvatar(item.artist) : item.avatar;
    if (src && typeof src === 'string' && /^(https?:|data:image\/|\.\/|\/)/.test(src)) {
      var img = el('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      box.appendChild(img);
    } else {
      box.textContent = item.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    }
    return box;
  }

  function openList(showAll) {
    if (!ap) return;
    var query = ap.input.value;
    // Opening on a chosen artist shows the whole list, not just that one name.
    var all = showAll || (query && norm(query) === norm(ap.select.value));
    ap.items = buildItems(query, all);
    ap.index = Math.max(0, Math.min(ap.index, ap.items.length - 1));
    if (all && ap.select.value) {
      var cur = ap.items.findIndex(function (it) { return norm(it.name) === norm(ap.select.value); });
      if (cur >= 0) ap.index = cur;
    }
    ap.list.replaceChildren();
    if (!ap.items.length) {
      var empty = el('li', 'ap__empty');
      empty.appendChild(icon('ph-microphone-stage'));
      empty.appendChild(el('span', '', artistList().length ? 'No artist matches that name.' : 'No artists yet. Type a name to add your first one.'));
      ap.list.appendChild(empty);
    }
    ap.items.forEach(function (it, i) {
      var li = el('li', 'ap__opt' + (it.kind === 'add' ? ' ap__opt--add' : ''));
      li.id = 'bookingArtistOpt' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('data-ap-index', String(i));
      if (it.kind === 'add') {
        var plus = el('span', 'ap__avatar ap__avatar--add');
        plus.appendChild(icon('ph-plus'));
        var txt = el('span', 'ap__name');
        txt.append('Add ', el('strong', '', '“' + it.name + '”'), ' as a new artist');
        li.append(plus, txt);
      } else {
        var body = el('span', 'ap__body');
        body.appendChild(el('span', 'ap__name', it.name));
        var meta = [it.meta, it.shows ? it.shows + (it.shows === 1 ? ' show' : ' shows') : ''].filter(Boolean).join(' · ');
        if (meta) body.appendChild(el('span', 'ap__meta', meta));
        li.append(avatarFor(it), body);
        if (norm(it.name) === norm(ap.select.value)) {
          li.classList.add('is-picked');
          li.appendChild(icon('ph-check ap__tick'));
        }
      }
      ap.list.appendChild(li);
    });
    var opening = !ap.open;
    ap.list.hidden = false;
    ap.open = true;
    ap.input.setAttribute('aria-expanded', 'true');
    ap.wrap.classList.add('is-open');
    if (opening) roomForList(true);
    highlight();
  }

  // Phones: the list opens below the field, so lift the field up the screen
  // and keep the list clear of the keyboard and the bottom bar.
  var phone = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
  function roomForList(lift) {
    if (!ap || !ap.open) return;
    if (!phone.matches) { ap.list.style.removeProperty('--ap-room'); return; }
    var vv = window.visualViewport;
    var bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    var nav = $('bottomNav');
    if (nav && nav.offsetParent !== null) {
      var navTop = nav.getBoundingClientRect().top;
      if (navTop > 0) bottom = Math.min(bottom, navTop);
    }
    var top = ap.input.getBoundingClientRect().bottom + 6;
    if (lift && bottom - top < 260) {
      ap.wrap.scrollIntoView({ block: 'start' });
      top = ap.input.getBoundingClientRect().bottom + 6;
    }
    ap.list.style.setProperty('--ap-room', Math.max(150, Math.floor(bottom - top - 10)) + 'px');
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () { roomForList(true); });
  }

  function highlight() {
    if (!ap) return;
    var opts = ap.list.querySelectorAll('.ap__opt');
    opts.forEach(function (o, i) {
      var on = i === ap.index;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) o.scrollIntoView({ block: 'nearest' });
    });
    if (opts[ap.index]) ap.input.setAttribute('aria-activedescendant', opts[ap.index].id);
    else ap.input.removeAttribute('aria-activedescendant');
  }

  function closeList(commit) {
    if (!ap) return;
    if (commit) {
      // Typing an existing artist's full name and leaving the field picks them.
      var typed = norm(ap.input.value);
      var exact = typed && artistList().find(function (a) { return norm(a.name) === typed; });
      if (exact) choose(String(exact.name).trim());
      else if (!typed) choose('');
    }
    ap.list.hidden = true;
    ap.open = false;
    ap.input.setAttribute('aria-expanded', 'false');
    ap.input.removeAttribute('aria-activedescendant');
    ap.wrap.classList.remove('is-open');
    syncInput();
  }

  function choose(name) {
    if (!ap) return;
    var before = ap.select.value;
    ap.select.value = name;
    ap.input.value = name;
    syncInput();
    if (before !== name) ap.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pick(i) {
    var it = ap && ap.items[i];
    if (!it) return;
    if (it.kind === 'add') {
      var added = typeof window.SPQuickAddArtist === 'function' ? window.SPQuickAddArtist(it.name) : null;
      if (!added) return;
      choose(added);
    } else {
      choose(it.name);
    }
    closeList(false);
    var next = $('bookingDate');
    if (next && !next.value) next.focus();
  }

  function onKey(e) {
    if (!ap) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!ap.open) { openList(); return; }
      var n = ap.items.length;
      if (!n) return;
      ap.index = (ap.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      highlight();
      return;
    }
    if (e.key === 'Enter') {
      if (ap.open && ap.items.length) { e.preventDefault(); pick(ap.index); }
      return;
    }
    if (e.key === 'Escape' && ap.open) {
      e.preventDefault();
      e.stopPropagation();
      ap.input.value = ap.select.value;
      closeList(false);
      return;
    }
    if (e.key === 'Tab' && ap.open) closeList(true);
  }

  // ── Emoji picker ──────────────────────────────────────────────────────────
  // Any button with data-sp-emoji-for="<textarea or input id>" opens it.
  var EMOJI = [
    { key: 'smileys', label: 'Smileys', icon: 'ph-smiley', list: '😀 grin|😃 happy|😄 smile|😁 beam|😆 laugh|😅 sweat relief|😂 tears joy lol|🤣 rofl|🙂 slight smile|😉 wink|😊 blush|😇 angel|🥰 love|😍 heart eyes|🤩 star struck|😘 kiss|😋 yum|😎 cool sunglasses|🤓 nerd|🤔 thinking|🤨 eyebrow|😐 neutral|😏 smirk|😴 sleep|😌 relieved|😮 wow|😲 shocked|🥺 pleading|😢 cry|😭 sob|😤 huff|😡 angry|🤯 mind blown|😳 flushed|🥵 hot|🥶 cold|😱 scream|🤗 hug|🤭 oops|🤫 shush|🙄 eye roll|😬 grimace|🫡 salute|🤝 deal|😷 sick|🤒 fever|🥳 party|🤠 cowboy|😈 devil|💀 dead skull|👀 eyes look' },
    { key: 'hands', label: 'Gestures', icon: 'ph-hand-waving', list: '👍 thumbs up yes|👎 thumbs down no|👌 ok|✌️ peace|🤞 fingers crossed luck|🤟 love you|🤘 rock|👏 clap|🙌 raise hands|👐 open hands|🙏 pray please thanks|💪 strong|👋 wave hello|🫶 heart hands|👊 fist bump|✊ fist|🤙 call me|👉 point right|👈 point left|👆 point up|👇 point down|☝️ one|✍️ write|🤳 selfie|💅 nails|🫵 you' },
    { key: 'hearts', label: 'Hearts', icon: 'ph-heart', list: '❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|❤️‍🔥 heart fire|💕 two hearts|💞 revolving hearts|💖 sparkle heart|💯 hundred|💥 boom|💫 dizzy|✨ sparkles|⭐ star|🌟 glowing star|🔥 fire lit hot|⚡ lightning|🌈 rainbow|☀️ sun|🌙 moon night' },
    { key: 'show', label: 'Show time', icon: 'ph-microphone-stage', list: '🎤 mic sing|🎧 headphones|🎶 notes music|🎵 note|🎹 piano keys|🥁 drum|🎸 guitar|🎷 sax|🎺 trumpet|🎻 violin|🪘 long drum|📻 radio|💿 cd album|📀 dvd|🎙️ studio mic|🎚️ fader|🎛️ mixer|🔊 loud speaker|📢 announce|🎬 film shoot|📸 camera photo|🎥 video|🎟️ ticket|🎫 ticket|🏟️ stadium|🎪 tent festival|💃 dance|🕺 dancer|🪩 mirror ball|🎉 party popper|🎊 confetti|🥂 cheers|🍾 champagne|🏆 trophy|🥇 gold medal|👑 crown king|🌹 rose' },
    { key: 'money', label: 'Money', icon: 'ph-money', list: '💰 money bag|💵 cash dollar|💶 euro|💷 pound|💴 yen|💸 money flying spend|🪙 coin|💳 card|🧾 receipt|🏦 bank|📈 up growth|📉 down|📊 chart|💹 market|🤑 money face|✅ done check paid|☑️ ticked|❌ no cross|⚠️ warning|❗ important|❓ question|⏳ waiting|⌛ time up|🔔 bell|📌 pin|📎 clip|🔒 locked|🔑 key' },
    { key: 'travel', label: 'Travel', icon: 'ph-airplane-tilt', list: '✈️ plane flight|🛫 departure|🛬 arrival|🚗 car|🚐 van|🚌 bus|🏍️ boda bike|🚕 taxi|⛽ fuel|🛣️ road|🗺️ map|📍 location pin|🧳 luggage|🏨 hotel|🏠 home|🌍 africa globe|🇺🇬 uganda flag|🇰🇪 kenya flag|🇹🇿 tanzania flag|🇷🇼 rwanda flag|🇳🇬 nigeria flag|🇿🇦 south africa flag|🇬🇧 uk flag|🇺🇸 usa flag|🌴 palm|🏖️ beach' },
    { key: 'things', label: 'Work', icon: 'ph-briefcase', list: '📅 calendar date|🗓️ schedule|⏰ alarm|🕒 time|📝 note memo|📋 clipboard|📄 page doc|📁 folder|✉️ email|📧 mail|📞 phone call|📱 mobile|💻 laptop|🖨️ print|🔗 link|📣 megaphone|🤳 post|🧠 idea brain|💡 bulb idea|🎯 target goal|🚀 launch|🛠️ tools|🧃 drink|🍕 pizza|🍔 burger|🍗 chicken|🍻 beers|☕ coffee|🍽️ dinner' }
  ];
  EMOJI.forEach(function (cat) {
    cat.items = cat.list.split('|').map(function (s) {
      var sp = s.indexOf(' ');
      return { ch: s.slice(0, sp), words: s.slice(sp + 1) };
    });
  });

  var RECENT_KEY = 'sp_recent_emoji';
  var pop = null;
  var target = null;   // { id, start, end }
  var anchorBtn = null;

  function readRecent() {
    try {
      var r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(r) ? r.slice(0, 24) : [];
    } catch (_e) { return []; }
  }

  function pushRecent(ch) {
    var r = readRecent().filter(function (x) { return x !== ch; });
    r.unshift(ch);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 24))); } catch (_e) { /* storage blocked */ }
  }

  function buildPop() {
    pop = el('div', 'sp-emoji');
    pop.id = 'spEmojiPicker';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Emoji');
    pop.hidden = true;

    var search = el('div', 'sp-emoji__search');
    search.appendChild(icon('ph-magnifying-glass'));
    var q = el('input', 'sp-emoji__q');
    q.type = 'search';
    q.placeholder = 'Search emoji';
    q.setAttribute('aria-label', 'Search emoji');
    q.autocomplete = 'off';
    search.appendChild(q);

    var tabs = el('div', 'sp-emoji__tabs');
    tabs.setAttribute('role', 'tablist');
    [{ key: 'recent', label: 'Recent', icon: 'ph-clock-counter-clockwise' }].concat(EMOJI).forEach(function (cat) {
      var t = el('button', 'sp-emoji__tab');
      t.type = 'button';
      t.setAttribute('data-emoji-tab', cat.key);
      t.setAttribute('aria-label', cat.label);
      t.title = cat.label;
      t.appendChild(icon(cat.icon));
      tabs.appendChild(t);
    });

    var grid = el('div', 'sp-emoji__grid');
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', 'Emoji');

    pop.append(search, tabs, grid);
    document.body.appendChild(pop);

    q.addEventListener('input', function () { renderGrid(q.value); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = grid.querySelector('[data-emoji]');
        if (first) insertEmoji(first.getAttribute('data-emoji'), !e.shiftKey);
      }
    });
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest('[data-emoji-tab]');
      if (!t) return;
      q.value = '';
      renderGrid('', t.getAttribute('data-emoji-tab'));
      var sec = grid.querySelector('[data-emoji-sec="' + t.getAttribute('data-emoji-tab') + '"]');
      if (sec) grid.scrollTop = sec.offsetTop; // the grid is the offset parent
    });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('[data-emoji]');
      // Shift-click adds several without closing.
      if (b) insertEmoji(b.getAttribute('data-emoji'), !e.shiftKey);
    });
    grid.addEventListener('scroll', markTab, { passive: true });
    pop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeEmoji(true); }
    });
  }

  function emojiButton(ch, words) {
    var b = el('button', 'sp-emoji__ch', ch);
    b.type = 'button';
    b.setAttribute('data-emoji', ch);
    b.setAttribute('role', 'option');
    b.title = words ? words.split(' ')[0] : '';
    b.setAttribute('aria-label', words ? words.split(' ').slice(0, 2).join(' ') : ch);
    return b;
  }

  function renderGrid(query, focusKey) {
    var grid = pop.querySelector('.sp-emoji__grid');
    grid.replaceChildren();
    var q = norm(query);
    if (q) {
      var hits = [];
      EMOJI.forEach(function (cat) {
        cat.items.forEach(function (it) { if (it.words.indexOf(q) !== -1) hits.push(it); });
      });
      // "fire" should find 🔥 before ❤️‍🔥: names starting with the query first, then any word.
      var rank = function (it) { return it.words.indexOf(q) === 0 ? 0 : (' ' + it.words).indexOf(' ' + q) !== -1 ? 1 : 2; };
      hits.sort(function (a, b) { return rank(a) - rank(b); });
      var sec = el('div', 'sp-emoji__sec');
      if (!hits.length) grid.appendChild(el('p', 'sp-emoji__none', 'No emoji found'));
      hits.forEach(function (it) { sec.appendChild(emojiButton(it.ch, it.words)); });
      grid.appendChild(sec);
      markTab();
      return;
    }
    var recent = readRecent();
    if (recent.length) {
      grid.appendChild(el('p', 'sp-emoji__head', 'Recent'));
      var rs = el('div', 'sp-emoji__sec');
      rs.setAttribute('data-emoji-sec', 'recent');
      recent.forEach(function (ch) { rs.appendChild(emojiButton(ch, '')); });
      grid.appendChild(rs);
    }
    EMOJI.forEach(function (cat) {
      var head = el('p', 'sp-emoji__head', cat.label);
      head.setAttribute('data-emoji-sec', cat.key);
      grid.appendChild(head);
      var s = el('div', 'sp-emoji__sec');
      cat.items.forEach(function (it) { s.appendChild(emojiButton(it.ch, it.words)); });
      grid.appendChild(s);
    });
    pop.querySelector('[data-emoji-tab="recent"]').hidden = !recent.length;
    if (!focusKey) grid.scrollTop = 0;
    markTab();
  }

  function markTab() {
    if (!pop) return;
    var grid = pop.querySelector('.sp-emoji__grid');
    var heads = grid.querySelectorAll('.sp-emoji__head[data-emoji-sec], .sp-emoji__sec[data-emoji-sec="recent"]');
    var current = null;
    heads.forEach(function (h) { if (h.offsetTop <= grid.scrollTop + 8) current = h.getAttribute('data-emoji-sec'); });
    if (!current && heads[0]) current = heads[0].getAttribute('data-emoji-sec');
    if (norm(pop.querySelector('.sp-emoji__q').value)) current = null;
    pop.querySelectorAll('[data-emoji-tab]').forEach(function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-emoji-tab') === current);
    });
  }

  function place(btn) {
    var r = btn.getBoundingClientRect();
    var w = pop.offsetWidth;
    var h = pop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    // Opens up from the button, lined up with its left edge.
    var left = Math.min(r.left, vw - w - 8);
    var top = r.top - h - 8;
    if (top < 8) top = Math.min(r.bottom + 8, vh - h - 8);
    pop.style.setProperty('left', Math.max(8, left) + 'px');
    pop.style.setProperty('top', Math.max(8, top) + 'px');
  }

  function openEmoji(btn) {
    var id = btn.getAttribute('data-sp-emoji-for');
    var field = $(id);
    if (!field) return;
    if (!pop) buildPop();
    if (!pop.hidden && anchorBtn === btn) { closeEmoji(true); return; }
    var len = String(field.value || '').length;
    target = {
      id: id,
      start: typeof field.selectionStart === 'number' ? field.selectionStart : len,
      end: typeof field.selectionEnd === 'number' ? field.selectionEnd : len
    };
    anchorBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    var q = pop.querySelector('.sp-emoji__q');
    q.value = '';
    renderGrid('');
    pop.hidden = false;
    place(btn);
    markTab(); // needs layout, so only once the picker is showing
    requestAnimationFrame(function () { pop.classList.add('is-open'); });
    // Phones would pop the keyboard over the grid; desktop gets search focus.
    if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) q.focus({ preventScroll: true });
  }

  function closeEmoji(refocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    pop.classList.remove('is-open');
    if (anchorBtn) anchorBtn.setAttribute('aria-expanded', 'false');
    anchorBtn = null;
    if (refocus && target) {
      var field = $(target.id);
      if (field) {
        field.focus({ preventScroll: true });
        try { field.setSelectionRange(target.start, target.end); } catch (_e) { /* not a text field */ }
      }
    }
  }

  function insertEmoji(ch, close) {
    if (!target) return;
    // The chat re-renders on new messages, so look the field up by id each time.
    var field = $(target.id);
    if (!field) { closeEmoji(false); return; }
    var v = String(field.value || '');
    var start = Math.min(target.start, v.length);
    var end = Math.min(Math.max(target.end, start), v.length);
    var max = field.maxLength > 0 ? field.maxLength : Infinity;
    if (v.length - (end - start) + ch.length > max) return;
    field.value = v.slice(0, start) + ch + v.slice(end);
    var caret = start + ch.length;
    target.start = caret;
    target.end = caret;
    pushRecent(ch);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    if (close) closeEmoji(true);
    else try { field.setSelectionRange(caret, caret); } catch (_e) { /* not a text field */ }
  }

  document.addEventListener('mousedown', function (e) {
    // Keep the caret where it was while the picker button takes the click.
    if (e.target.closest && e.target.closest('[data-sp-emoji-for]')) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-sp-emoji-for]');
    if (btn) {
      e.preventDefault();
      openEmoji(btn);
      return;
    }
    if (pop && !pop.hidden && !pop.contains(e.target)) closeEmoji(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pop && !pop.hidden && !pop.contains(e.target)) { e.preventDefault(); e.stopPropagation(); closeEmoji(true); }
  }, true);

  window.addEventListener('resize', function () { if (pop && !pop.hidden && anchorBtn && document.contains(anchorBtn)) place(anchorBtn); });

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() { initArtistPicker(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SPPickers = { syncArtist: syncInput, closeEmoji: closeEmoji };
})();
