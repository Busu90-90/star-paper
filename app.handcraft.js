(function initStarPaperHandcraft() {
  'use strict';

  var root = document.documentElement;
  var FIRST_PROOF_LINE = 'Built for artist managers, labels, and teams';
  var PROOF_LINES = [
    FIRST_PROOF_LINE,
    'Switch between artists, bookings, and payouts without losing context.',
    'Track revenue, expenses, and balances from one live operational view.',
    'Keep every artist profile, deadline, and decision in one manager mainstage.'
  ];

  function storageEquals(key, value) {
    try {
      return window.localStorage && window.localStorage.getItem(key) === value;
    } catch (_err) {
      return false;
    }
  }

  function mediaMatches(query) {
    return Boolean(window.matchMedia && window.matchMedia(query).matches);
  }

  function onReady(work) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', work, { once: true });
      return;
    }
    work();
  }

  if (storageEquals('sp_handcraft_off', '1') || storageEquals('sp_prem_off', '1')) {
    root.classList.add('sp-handcraft-off');
    return;
  }

  root.classList.remove('sp-handcraft-off');

  onReady(function mountHandcraftLayer() {
    var landing = document.getElementById('landingScreen');
    if (!landing) return;

    resetLandingScrollTop(landing);
    landing.classList.add('sp-handcraft-mounted');
    setupAbHarness();
    setupProofTypewriter(landing);
    setupNotebookMotion(landing);
    setupTestimonialMarquee(landing);
    setupBentoReveal(landing);
    setupBentoMarquee(landing);
    setupMagneticLinks(landing);
    setupCursorFollower();
    setupScrollProgress(landing);
    setupCountUpTrio(landing);
    setupChorusRotation(landing);
    setupTrioUnderlineReveal(landing);
  });

  function resetLandingScrollTop(landing) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch (_err) {
      window.scrollTo(0, 0);
    }

    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    if (landing) landing.scrollTop = 0;

    requestAnimationFrame(function () {
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (landing) landing.scrollTop = 0;
    });
  }

  function setupProofTypewriter(landing) {
    var proofCopies = landing.querySelectorAll('.sp-handcraft-proof-copy');
    if (!proofCopies.length) return;

    var reduceMotion = mediaMatches('(prefers-reduced-motion: reduce)');
    Array.prototype.forEach.call(proofCopies, function initProof(copy, copyIndex) {
      if (copy.dataset.handcraftTwDone === '1') return;
      copy.dataset.handcraftTwDone = '1';
      copy.textContent = FIRST_PROOF_LINE;

      reserveProofHeight(copy);

      if (reduceMotion) {
        copy.classList.add('sp-handcraft-proof-copy--static');
        return;
      }

      var lineIndex = 0;
      var charIndex = FIRST_PROOF_LINE.length;
      var deleting = false;
      var initialDelay = copyIndex * 220;
      var inViewport = true;

      if ('IntersectionObserver' in window) {
        inViewport = false;
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            inViewport = entry.isIntersecting;
          });
        }, { threshold: 0.05 });
        io.observe(copy);
      }

      function isVisible() {
        var rect = copy.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return inViewport;
      }

      function schedule(delay) {
        window.setTimeout(tick, delay);
      }

      function tick() {
        if (!landing || landing.style.display === 'none' || !isVisible()) {
          schedule(420);
          return;
        }

        var fullText = PROOF_LINES[lineIndex];
        if (!deleting) {
          charIndex = Math.min(fullText.length, charIndex + 1);
          copy.textContent = fullText.slice(0, charIndex);
          if (charIndex >= fullText.length) {
            deleting = true;
            schedule(1900);
            return;
          }
          schedule(30 + Math.random() * 16);
          return;
        }

        charIndex = Math.max(0, charIndex - 1);
        copy.textContent = fullText.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          lineIndex = (lineIndex + 1) % PROOF_LINES.length;
          schedule(280);
          return;
        }
        schedule(18);
      }

      schedule(2300 + initialDelay);
    });

    function reserveProofHeight(copy) {
      if (!copy.isConnected) return;
      var probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.left = '0';
      probe.style.right = '0';
      probe.style.top = '0';
      probe.style.display = 'block';
      probe.style.whiteSpace = 'normal';
      probe.style.font = window.getComputedStyle(copy).font;
      copy.parentNode.appendChild(probe);
      var maxHeight = 0;
      PROOF_LINES.forEach(function (line) {
        probe.textContent = line;
        maxHeight = Math.max(maxHeight, Math.ceil(probe.getBoundingClientRect().height));
      });
      probe.parentNode.removeChild(probe);
      if (maxHeight > 0) {
        copy.style.setProperty('--sp-handcraft-proof-min-height', maxHeight + 'px');
        copy.style.minHeight = maxHeight + 'px';
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Notebook motion: scroll-reveal + mouse-parallax tilt + idle bob
  //   - Tilt is driven by pointermove on the hero stage parent so
  //     the notebook reacts to the cursor approaching from the copy
  //     column, not just direct hover.
  //   - Idle bob fades in when the mouse goes quiet (>600 ms).
  //   - RAF loop is paused via IntersectionObserver when offscreen.
  //   - Skipped entirely on touch devices and prefers-reduced-motion.
  // ──────────────────────────────────────────────────────────────
  function setupNotebookMotion(landing) {
    if (mediaMatches('(prefers-reduced-motion: reduce)')) return;

    var book = landing.querySelector('.landing-notebook');
    if (!book) return;

    var stage = book.parentElement || landing;
    var touch = mediaMatches('(pointer: coarse)');

    book.classList.add('is-handcraft-pending');

    function reveal() {
      book.classList.remove('is-handcraft-pending');
      book.classList.add('is-handcraft-revealed');
    }

    if (touch) {
      // Touch: skip parallax entirely, just reveal once visible.
      var ioTouch = new IntersectionObserver(function (rows) {
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].isIntersecting) {
            reveal();
            ioTouch.disconnect();
            break;
          }
        }
      }, { threshold: 0.15 });
      ioTouch.observe(book);
      return;
    }

    var raf = 0;
    var inView = false;
    var revealed = false;
    var startedAt = 0;
    var mouseTx = 0, mouseTy = 0;
    var curTx = 0, curTy = 0;
    var lastMouseAt = 0;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function tick(now) {
      if (!startedAt) startedAt = now;
      var elapsed = (now - startedAt) * 0.001;

      curTx = lerp(curTx, mouseTx, 0.07);
      curTy = lerp(curTy, mouseTy, 0.07);

      // Idle Y bob, suppressed when the mouse has moved recently.
      var sinceMouse = now - lastMouseAt;
      var idleness = sinceMouse > 600 ? 1 : Math.max(0, (sinceMouse - 200) / 400);
      var floatY = Math.sin(elapsed * 0.85) * 4 * idleness;

      book.style.transform =
        'translate3d(0,' + floatY.toFixed(2) + 'px,0) ' +
        'rotateX(' + curTx.toFixed(2) + 'deg) ' +
        'rotateY(' + curTy.toFixed(2) + 'deg)';

      if (inView) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    }

    function start() {
      inView = true;
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function stop() {
      inView = false;
    }

    stage.addEventListener('pointermove', function onStageMove(event) {
      var rect = stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      var px = (event.clientX - rect.left) / rect.width - 0.5;
      var py = (event.clientY - rect.top) / rect.height - 0.5;
      // Keep tilt subtle — the .webp already bakes in a 3D angle.
      mouseTx = py * -5;
      mouseTy = px * 7;
      lastMouseAt = performance.now();
    }, { passive: true });

    stage.addEventListener('pointerleave', function onStageLeave() {
      mouseTx = 0;
      mouseTy = 0;
    }, { passive: true });

    var io = new IntersectionObserver(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.isIntersecting) {
          if (!revealed) {
            revealed = true;
            // Defer one frame so the pending state paints first.
            requestAnimationFrame(reveal);
          }
          start();
        } else {
          stop();
        }
      }
    }, { threshold: 0.15 });
    io.observe(book);
  }

  // ──────────────────────────────────────────────────────────────
  // Testimonial marquee: wrap the existing grid, clone its children
  // once, and let the CSS animation produce a seamless infinite loop.
  //   - No-ops on pages without `.landing-testimonials-grid`.
  //   - Idempotent: re-runs are safe (checks dataset flag).
  //   - Mobile + reduced-motion fall back to the original grid via
  //     CSS overrides on `.is-marquee[data-handcraft-clone]`.
  // ──────────────────────────────────────────────────────────────
  function setupTestimonialMarquee(landing) {
    var grid = landing.querySelector('.landing-testimonials-grid');
    if (!grid) return;
    if (grid.dataset.handcraftMarquee === '1') return;
    grid.dataset.handcraftMarquee = '1';

    var cards = Array.prototype.slice.call(
      grid.querySelectorAll('.landing-testimonial-card')
    );
    if (cards.length === 0) return;

    // Wrap the grid in a marquee container (so we can clip + fade).
    var wrap = document.createElement('div');
    wrap.className = 'sp-handcraft-marquee';
    if (grid.parentNode) {
      grid.parentNode.insertBefore(wrap, grid);
      wrap.appendChild(grid);
    }

    grid.classList.add('is-marquee');

    // Duplicate each card once for a seamless 50% translate loop.
    cards.forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.dataset.handcraftClone = '1';
      // Strip any IDs to avoid DOM duplication warnings.
      clone.removeAttribute('id');
      var nestedIds = clone.querySelectorAll('[id]');
      Array.prototype.forEach.call(nestedIds, function (el) {
        el.removeAttribute('id');
      });
      grid.appendChild(clone);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Bento marquee — inject prev/next arrow buttons that scroll the
  // grid one card at a time. Arrow disabled state reflects scroll
  // position. Idempotent (dataset flag).
  // ──────────────────────────────────────────────────────────────
  function setupBentoMarquee(landing) {
    var grid = landing.querySelector('.sp-handcraft-bento-grid');
    if (!grid) return;
    if (grid.dataset.handcraftMarqueeBound === '1') return;
    grid.dataset.handcraftMarqueeBound = '1';

    var bento = landing.querySelector('.sp-handcraft-bento');
    if (!bento) return;
    bento.style.position = 'relative';

    function makeArrow(dir, label, iconClass) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sp-handcraft-bento-arrow sp-handcraft-bento-arrow--' + dir;
      btn.setAttribute('aria-label', label);
      var icon = document.createElement('i');
      String(iconClass || '').split(/\s+/).forEach(function (token) {
        if (/^[a-z0-9_-]+$/i.test(token)) icon.classList.add(token);
      });
      icon.setAttribute('aria-hidden', 'true');
      btn.appendChild(icon);
      return btn;
    }
    var prev = makeArrow('prev', 'Previous cards', 'ph ph-caret-left');
    var next = makeArrow('next', 'Next cards', 'ph ph-caret-right');

    function getStep() {
      var card = grid.querySelector('.sp-handcraft-bento-card');
      if (!card) return 320;
      var rect = card.getBoundingClientRect();
      var styles = window.getComputedStyle(grid);
      var gap = parseFloat(styles.columnGap || styles.gap || '18') || 18;
      return rect.width + gap;
    }

    function updateState() {
      var max = grid.scrollWidth - grid.clientWidth;
      var atStart = grid.scrollLeft <= 4;
      var atEnd = grid.scrollLeft >= max - 4;
      if (max <= 4) {
        prev.setAttribute('disabled', '');
        next.setAttribute('disabled', '');
        return;
      }
      if (atStart) prev.setAttribute('disabled', ''); else prev.removeAttribute('disabled');
      if (atEnd) next.setAttribute('disabled', ''); else next.removeAttribute('disabled');
    }

    prev.addEventListener('click', function () {
      grid.scrollBy({ left: -getStep(), behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      grid.scrollBy({ left: getStep(), behavior: 'smooth' });
    });

    grid.addEventListener('scroll', function () {
      requestAnimationFrame(updateState);
    }, { passive: true });
    window.addEventListener('resize', function () {
      requestAnimationFrame(updateState);
    }, { passive: true });

    bento.appendChild(prev);
    bento.appendChild(next);

    // Initial state after layout settles
    requestAnimationFrame(function () {
      requestAnimationFrame(updateState);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Gold cursor follower with magnetic state on interactive elements.
  //   - Skipped on touch + reduced-motion.
  //   - RAF runs only while the pointer is moving (last move + 1.2 s).
  // ──────────────────────────────────────────────────────────────
  function setupCursorFollower() {
    if (mediaMatches('(prefers-reduced-motion: reduce)')) return;
    if (mediaMatches('(pointer: coarse)')) return;

    var dot = document.createElement('div');
    dot.className = 'sp-handcraft-cursor';
    dot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);

    var x = 0, y = 0, tx = 0, ty = 0;
    var raf = 0;
    var lastMoveAt = 0;

    function loop(now) {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      dot.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      if (now - lastMoveAt < 1200) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    }

    document.addEventListener('pointermove', function onPointerMove(event) {
      tx = event.clientX;
      ty = event.clientY;
      lastMoveAt = performance.now();
      if (!dot.classList.contains('is-visible')) {
        x = tx;
        y = ty;
        dot.classList.add('is-visible');
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    document.addEventListener('pointerleave', function onPointerLeave() {
      dot.classList.remove('is-visible');
    });
    document.addEventListener('pointercancel', function onPointerCancel() {
      dot.classList.remove('is-visible');
    });

    var hotSelector = [
      'a',
      'button',
      '.landing-btn',
      '.landing-handcraft-nav-cta',
      '[data-action]',
      '[role="button"]'
    ].join(',');

    function bindMagnetic(scope) {
      var hot = scope.querySelectorAll(hotSelector);
      Array.prototype.forEach.call(hot, function (el) {
        if (el.dataset.handcraftMagBound === '1') return;
        el.dataset.handcraftMagBound = '1';
        el.addEventListener('pointerenter', function () {
          dot.classList.add('is-mag');
        });
        el.addEventListener('pointerleave', function () {
          dot.classList.remove('is-mag');
        });
      });
    }

    bindMagnetic(document);

    // Re-bind when the SPA injects new CTAs (cheap idempotent rescan).
    var rebindRaf = 0;
    function scheduleRebind() {
      if (rebindRaf) return;
      rebindRaf = requestAnimationFrame(function () {
        rebindRaf = 0;
        bindMagnetic(document);
      });
    }
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(scheduleRebind);
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Top scroll-progress hairline (gold gradient, RAF-throttled).
  // ──────────────────────────────────────────────────────────────
  function setupScrollProgress(landing) {
    var bar = document.createElement('div');
    bar.className = 'sp-handcraft-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    var scrollSource = landing && landing.classList.contains('landing-snap-page')
      ? landing
      : document.documentElement;

    var raf = 0;
    function update() {
      var max = scrollSource.scrollHeight - scrollSource.clientHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, scrollSource.scrollTop / max)) : 0;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      raf = 0;
    }

    scrollSource.addEventListener('scroll', function onScroll() {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener('resize', function onResize() {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });

    update();
  }

  // ──────────────────────────────────────────────────────────────
  // Bento card scroll-reveal stagger + radial-glow mouse tracking.
  //   - Each card adds .is-handcraft-pending until 25 % visible,
  //     then flips to .is-handcraft-revealed in a 90 ms-staggered
  //     wave so the eye reads them in cascade.
  //   - On hover, --mx / --my custom props drive the radial glow
  //     pseudo-element (CSS reads them).
  //   - Reduced-motion / off-screen pause / idempotent.
  // ──────────────────────────────────────────────────────────────
  function setupBentoReveal(landing) {
    var cards = landing.querySelectorAll('.sp-handcraft-bento-card');
    if (!cards.length) return;

    var reduce = mediaMatches('(prefers-reduced-motion: reduce)');

    Array.prototype.forEach.call(cards, function (card, i) {
      if (card.dataset.handcraftBentoBound === '1') return;
      card.dataset.handcraftBentoBound = '1';

      if (!reduce) {
        card.classList.add('is-handcraft-pending');
        // Stagger via inline transition-delay (overrides nothing — class fallback safe).
        card.style.transitionDelay = (i * 90) + 'ms';
      }

      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var mx = ((event.clientX - rect.left) / rect.width) * 100;
        var my = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mx', mx.toFixed(1) + '%');
        card.style.setProperty('--my', my.toFixed(1) + '%');
      }, { passive: true });
    });

    if (reduce) return;

    var io = new IntersectionObserver(function (rows) {
      rows.forEach(function (row) {
        if (!row.isIntersecting) return;
        // Defer one frame so the pending state paints first.
        var target = row.target;
        requestAnimationFrame(function () {
          target.classList.remove('is-handcraft-pending');
          target.classList.add('is-handcraft-revealed');
        });
        io.unobserve(target);
      });
    }, { threshold: 0.25 });

    Array.prototype.forEach.call(cards, function (card) {
      io.observe(card);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Footer Caveat tagline reveal — flips a clip-path inset from
  // 100% to 0% as the footer enters viewport. Each line has its
  // own staggered transition-delay (set in CSS).
  // ──────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────
  // Magnetic links: subtle translate toward the cursor (max ~8 px)
  // for any element with [data-handcraft-magnetic]. Skipped on
  // touch + reduced-motion. Uses inline transform — does NOT touch
  // .landing-btn (cursor follower already provides that signal).
  // ──────────────────────────────────────────────────────────────
  function setupMagneticLinks(landing) {
    if (mediaMatches('(prefers-reduced-motion: reduce)')) return;
    if (mediaMatches('(pointer: coarse)')) return;

    var targets = landing.querySelectorAll('[data-handcraft-magnetic]');
    if (!targets.length) return;

    Array.prototype.forEach.call(targets, function (el) {
      if (el.dataset.handcraftMagInit === '1') return;
      el.dataset.handcraftMagInit = '1';

      var raf = 0;
      var tx = 0, ty = 0, cx = 0, cy = 0;
      var kind = el.getAttribute('data-handcraft-magnetic');
      // Cards get a softer pull than links; both stay subtle.
      var strength = kind === 'card' ? 6 : 9;

      function lerp(a, b, t) { return a + (b - a) * t; }

      function tick() {
        cx = lerp(cx, tx, 0.18);
        cy = lerp(cy, ty, 0.18);
        el.style.transform =
          'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
        if (Math.abs(cx - tx) > 0.08 || Math.abs(cy - ty) > 0.08) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = 0;
        }
      }

      el.addEventListener('pointermove', function (event) {
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        var dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        var dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        // Clamp to [-1, 1] then scale.
        tx = Math.max(-1, Math.min(1, dx)) * strength;
        ty = Math.max(-1, Math.min(1, dy)) * strength;
        if (!raf) raf = requestAnimationFrame(tick);
      }, { passive: true });

      el.addEventListener('pointerleave', function () {
        tx = 0;
        ty = 0;
        if (!raf) raf = requestAnimationFrame(tick);
      }, { passive: true });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // A/B query-param harness.
  //   - Reads ?ab=foo,bar from URL → sets data-ab-foo / data-ab-bar
  //     on <html>, persists to localStorage so subsequent navigation
  //     keeps the variant. URL: ?ab=reset clears it.
  //   - CSS targets via [data-ab-foo] selectors. JS modules can read
  //     `document.documentElement.dataset.abFoo === '1'` to gate.
  //   - Independent of auth / session — purely cosmetic.
  // ──────────────────────────────────────────────────────────────
  function setupAbHarness() {
    var STORAGE_KEY = 'sp_ab';
    var html = document.documentElement;
    var flags = [];

    try {
      var params = new URLSearchParams(window.location.search);
      var qp = params.get('ab');
      if (qp === 'reset' || qp === 'off') {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch (_e1) {}
        return;
      }
      if (qp) {
        flags = qp.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        try { window.localStorage.setItem(STORAGE_KEY, flags.join(',')); } catch (_e2) {}
      } else {
        try {
          var saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved) {
            flags = saved.split(',').filter(Boolean);
          }
        } catch (_e3) {}
      }
    } catch (_outerErr) {
      // URLSearchParams may not exist on truly ancient browsers; skip silently.
      return;
    }

    flags.forEach(function (flag) {
      // Convert kebab to camel for dataset key — `ab-glow-cta` → `abGlowCta`.
      var clean = flag.replace(/[^A-Za-z0-9-]/g, '');
      if (!clean) return;
      var key = 'ab' + clean.charAt(0).toUpperCase() + clean.slice(1).replace(/-([a-z])/g, function (_m, c) { return c.toUpperCase(); });
      html.dataset[key] = '1';
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Counting-Up Trio (proof hero) — Cormorant numerals count from
  // 0 → target on intersection. Reduced-motion + no-IO fall back to
  // the final value rendered immediately.
  // ──────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} landing
   */
  function setupCountUpTrio(landing) {
    var nums = landing.querySelectorAll('.sp-trio__num[data-sp-count-to]');
    if (!nums.length) return;

    var reduce = mediaMatches('(prefers-reduced-motion: reduce)');
    if (reduce || !('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nums, function (n) {
        n.textContent = n.dataset.spCountTo || n.textContent;
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var target = parseInt(entry.target.dataset.spCountTo, 10) || 0;
        var start = performance.now();
        var duration = 900;
        function tick(now) {
          var t = Math.min(1, (now - start) / duration);
          var eased = 1 - Math.pow(1 - t, 3);
          entry.target.textContent = Math.round(target * eased).toString();
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.45 });

    Array.prototype.forEach.call(nums, function (n) { io.observe(n); });
  }

  // ──────────────────────────────────────────────────────────────
  // Chorus rotation (testimonials hero) — promotes the next quote
  // card to [data-active] every 6 seconds. Reduced-motion keeps the
  // first card pinned without rotation.
  // ──────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} landing
   */
  function setupChorusRotation(landing) {
    var stack = landing.querySelector('.sp-hero-preview--chorus .sp-chorus');
    if (!stack) return;
    var cards = stack.querySelectorAll('.sp-chorus__card');
    if (cards.length < 1) return;

    cards[0].setAttribute('data-active', '');
    if (cards.length < 2) return;
    if (mediaMatches('(prefers-reduced-motion: reduce)')) return;

    var idx = 0;
    window.setInterval(function () {
      cards[idx].removeAttribute('data-active');
      idx = (idx + 1) % cards.length;
      cards[idx].setAttribute('data-active', '');
    }, 6000);
  }

  // ──────────────────────────────────────────────────────────────
  // Trio underline reveal — adds [data-revealed] to each row when
  // it enters the viewport, growing the 1px gold hairline 0 → 72%.
  // Pairs with the count-up animation for a single coordinated moment.
  // ──────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} landing
   */
  function setupTrioUnderlineReveal(landing) {
    var rows = landing.querySelectorAll('.sp-trio__row');
    if (!rows.length) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(rows, function (row) { row.setAttribute('data-revealed', ''); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-revealed', '');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.45 });
    Array.prototype.forEach.call(rows, function (row) { io.observe(row); });
  }
})();
