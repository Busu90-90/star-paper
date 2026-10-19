// Landing stage lights: the visitor runs the rig.
// - Follow spot: the centre lamp tracks the cursor (or a tap) with an
//   operator's lag, then drifts back to its sweep.
// - Cues: every hero slide has its own lighting state, with a short blackout
//   between them.
// - Shadows: the active headline casts a soft shadow away from the lamps.
// - Finale: the three beams close in on Start free in the closing panel.
// - House lights: switching theme plays a lamps-on or house-lights-up cue.
// - Name in lights: a marquee sign with the visitor's artist, saved as a PNG.
// Each lamp, beam and wall wash is steered through a paused Web Animation
// whose time is set every frame (a "dial"), the same engine the CSS sweep
// runs on, so a new angle never restyles the lamp drawings. The markup
// carries no inline styles. With reduced motion, or without Web Animations,
// the CSS sweep in styles.landing.css runs on its own.
(function initStarPaperLandingLights() {
  'use strict';

  var reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var finePointer = Boolean(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  function onReady(work) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', work, { once: true });
      return;
    }
    work();
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function deg(rad) { return rad * 180 / Math.PI; }

  // Writes custom properties onto one element, skipping values that have not
  // changed since the last write.
  function setVars(el, vars) {
    var cache = el.lpVars || (el.lpVars = {});
    Object.keys(vars).forEach(function (key) {
      if (cache[key] === vars[key]) return;
      cache[key] = vars[key];
      el.style.setProperty(key, vars[key]);
    });
  }

  // The idle sweep, matching lp-head-* keyframes (alternate, eased per stop).
  var SWEEPS = {
    l: { ms: 4000, delay: 0, stops: [[0, 30], [0.45, -16], [0.6, -16], [1, 8]] },
    c: { ms: 5000, delay: -2000, stops: [[0, -12], [0.5, 6], [1, 12]] },
    r: { ms: 4500, delay: -4000, stops: [[0, -30], [0.45, 16], [0.6, 16], [1, -8]] }
  };

  function sweepAt(name, now) {
    var sweep = SWEEPS[name];
    var cycles = (now - sweep.delay) / sweep.ms;
    var whole = Math.floor(cycles);
    var p = cycles - whole;
    if (whole % 2) p = 1 - p;
    var stops = sweep.stops;
    for (var i = 1; i < stops.length; i += 1) {
      if (p <= stops[i][0]) {
        var a = stops[i - 1];
        var b = stops[i];
        var t = b[0] === a[0] ? 1 : (p - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * smooth(t);
      }
    }
    return stops[stops.length - 1][1];
  }

  // A lamp striking up: a flicker, then full.
  function strikeAt(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    var stops = [[0, 0.1], [0.14, 0.95], [0.24, 0.4], [0.4, 1], [1, 1]];
    for (var i = 1; i < stops.length; i += 1) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1];
        var b = stops[i];
        return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0]));
      }
    }
    return 1;
  }

  // Lamp level while the house lights come up: down, hold, back up.
  function dip(t) {
    if (t < 0 || t >= 2400) return 1;
    if (t < 300) return 1 - 0.8 * (t / 300);
    if (t < 1300) return 0.2;
    return 0.2 + 0.8 * smooth((t - 1300) / 1100);
  }

  // A paused animation scrubbed by value: dial(t) shows the frame at t ms.
  // Only writes when the frame actually changes.
  function makeDial(el, keyframes, span, pseudo) {
    if (!el) return function () {};
    var options = { duration: span, fill: 'both', easing: 'linear' };
    if (pseudo) options.pseudoElement = pseudo;
    var anim = el.animate(keyframes, options);
    anim.pause();
    var shown = null;
    return function (t) {
      var at = Math.round(clamp(t, 0, span));
      if (at === shown) return;
      shown = at;
      anim.currentTime = at;
    };
  }

  function centreOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  // ── Hero rig ────────────────────────────────────────────────────────────
  function setupRig(root) {
    var show = root.querySelector('[data-lp-show]');
    var rig = show && show.querySelector('.lp-rig');
    var wall = show && show.querySelector('.lp-wall');
    if (!show || !rig || !wall) return null;
    if (typeof rig.animate !== 'function') return null;
    var LAMP_SHADOW = 'drop-shadow(0 8px 10px rgb(0 0 0 / 0.5)) ';
    var SWING = [{ rotate: '-70deg' }, { rotate: '70deg' }];
    var dials = {};
    try {
      ['l', 'c', 'r'].forEach(function (key) {
        var beam = rig.querySelector('.lp-rig__beam--' + key);
        var lamp = rig.querySelector('.lp-rig__lamp--' + key);
        var wash = wall.querySelector('.lp-wall__wash--' + key);
        var cone = beam && beam.querySelector('.lp-rig__cone');
        var aims = [
          makeDial(lamp, SWING, 1400),
          makeDial(beam, SWING, 1400),
          makeDial(wash, [{ '--lp-aim': '-70deg' }, { '--lp-aim': '70deg' }], 1400)
        ];
        var levels = [
          makeDial(lamp, [{ filter: LAMP_SHADOW + 'brightness(0.4)' }, { filter: LAMP_SHADOW + 'brightness(1)' }], 100),
          makeDial(wash, [{ '--lp-lv': '0' }, { '--lp-lv': '1' }], 100),
          makeDial(cone, [{ opacity: 0 }, { opacity: 1 }], 100),
          makeDial(beam, [{ opacity: 0 }, { opacity: 1 }], 100, '::before'),
          makeDial(beam, [{ opacity: 0 }, { opacity: 1 }], 100, '::after')
        ];
        dials[key] = {
          aim: function (deg) { aims.forEach(function (dial) { dial((deg + 70) * 10); }); },
          level: function (value) { levels.forEach(function (dial) { dial(value * 100); }); }
        };
      });
    } catch (_err) {
      return null;
    }
    var slides = Array.prototype.slice.call(show.querySelectorAll('[data-lp-slide]'));
    var PCT = { l: 0.19, c: 0.5, r: 0.81 };
    var PIVOT = 31;
    var lamps = {
      l: { aim: 16, level: 0, target: 16, want: 1, rate: 3 },
      c: { aim: 0, level: 0, target: 0, want: 1, rate: 3 },
      r: { aim: -16, level: 0, target: -16, want: 1, rate: 3 }
    };
    var started = performance.now();
    var cue = { name: 'mainstage', since: started, changed: -1 };
    var pointer = { x: 0, y: 0, at: -1e9 };
    var shadow = { x: 0, y: 0, a: 0 };
    var shadowEl = null;
    // Lamps strike up this far apart; the theme cue spreads them out.
    var gap = 180;
    // The house-lights-up cue dims the lamps while the house lights are on.
    var dipAt = -1e9;
    var running = false;
    var visible = true;
    var last = 0;
    var cuesBySlide = ['mainstage', 'how', 'proof', 'voices'];

    show.setAttribute('data-lp-lights', '');

    function pivots() {
      var r = rig.getBoundingClientRect();
      var top = r.top + PIVOT;
      return {
        l: { x: r.left + r.width * PCT.l, y: top },
        c: { x: r.left + r.width * PCT.c, y: top },
        r: { x: r.left + r.width * PCT.r, y: top }
      };
    }

    function aimAt(pivot, point) {
      return clamp(-deg(Math.atan2(point.x - pivot.x, Math.max(24, point.y - pivot.y))), -58, 58);
    }

    function activeSlide() {
      for (var i = 0; i < slides.length; i += 1) if (slides[i].hasAttribute('data-active')) return i;
      return 0;
    }

    function setCue(name, now) {
      if (name === cue.name) return;
      cue = { name: name, since: now, changed: now };
      show.setAttribute('data-lp-cue', name);
      Array.prototype.forEach.call(show.querySelectorAll('.is-spot'), function (el) { el.classList.remove('is-spot'); });
      if (name === 'proof') {
        Array.prototype.forEach.call(show.querySelectorAll('.lp-stat'), function (el) {
          el.classList.remove('is-flash');
          void el.offsetWidth;
          el.classList.add('is-flash');
        });
      }
    }

    // Blackout between cues: down fast, hold, then strike back up.
    function master(now) {
      var boot = strikeAt((now - started) / 900);
      if (cue.changed < 0) return boot;
      var t = now - cue.changed;
      if (t < 160) return boot * (1 - 0.9 * (t / 160));
      if (t < 300) return boot * 0.1;
      return boot * (0.1 + 0.9 * strikeAt((t - 300) / 700));
    }

    function plan(now, piv) {
      var name = cue.name;
      var following = now - pointer.at < 3500;
      var slide = slides[activeSlide()];
      lamps.l.rate = lamps.c.rate = lamps.r.rate = 3;
      lamps.l.want = lamps.c.want = lamps.r.want = 1;
      lamps.l.target = sweepAt('l', now);
      lamps.c.target = sweepAt('c', now);
      lamps.r.target = sweepAt('r', now);

      if (name === 'how') {
        var moves = slide ? slide.querySelectorAll('.lp-moves li') : [];
        if (moves.length) {
          var step = Math.floor((now - cue.since - 300) / 2200);
          var index = clamp(step, 0, moves.length - 1);
          if (step >= 0) {
            Array.prototype.forEach.call(moves, function (li, i) { li.classList.toggle('is-spot', i === index); });
            lamps.c.target = aimAt(piv.c, centreOf(moves[index]));
          }
        }
        lamps.l.target = 34; lamps.r.target = -34;
        lamps.l.want = lamps.r.want = 0.35;
      } else if (name === 'proof') {
        var stats = slide ? slide.querySelectorAll('.lp-stat') : [];
        if (stats[0]) lamps.c.target = aimAt(piv.c, centreOf(stats[0]));
        if (stats[1]) lamps.l.target = aimAt(piv.l, centreOf(stats[1]));
        if (stats[2]) lamps.r.target = aimAt(piv.r, centreOf(stats[2]));
        lamps.l.rate = lamps.c.rate = lamps.r.rate = 9;
      } else if (name === 'voices') {
        var front = slide ? slide.querySelector('[data-lp-quote][data-pos="front"]') : null;
        if (front) lamps.c.target = aimAt(piv.c, centreOf(front));
        lamps.l.target = 36; lamps.r.target = -36;
        lamps.l.want = lamps.r.want = 0.14;
        lamps.c.want = 0.9;
      }

      // The follow spot wins over any cue while the visitor is steering it.
      // The side heads lean a little towards the cursor too.
      if (following) {
        lamps.c.target = aimAt(piv.c, pointer);
        lamps.c.want = 1;
        lamps.c.rate = 7;
        lamps.l.target += (aimAt(piv.l, pointer) - lamps.l.target) * 0.35;
        lamps.r.target += (aimAt(piv.r, pointer) - lamps.r.target) * 0.35;
      }
    }

    function castShadow(piv, dt) {
      var slide = slides[activeSlide()];
      var heading = slide ? slide.querySelector('.lp-display') : null;
      if (heading !== shadowEl) {
        if (shadowEl) setVars(shadowEl, { '--lp-sh-a': '0' });
        shadowEl = heading;
      }
      var goal = { x: 0, y: 0, a: 0 };
      if (heading) {
        var h = centreOf(heading);
        var sx = 0;
        var sy = 0;
        ['l', 'c', 'r'].forEach(function (key) {
          var lamp = lamps[key];
          var to = aimAt(piv[key], h);
          var hit = clamp(1 - Math.abs(lamp.aim - to) / 26, 0, 1) * lamp.level;
          var dx = h.x - piv[key].x;
          var dy = h.y - piv[key].y;
          var len = Math.hypot(dx, dy) || 1;
          sx += (dx / len) * hit;
          sy += (dy / len) * hit;
        });
        var power = Math.min(1, Math.hypot(sx, sy));
        var spread = 8 + 16 * power;
        var norm = Math.hypot(sx, sy) || 1;
        goal = { x: (sx / norm) * spread, y: (sy / norm) * spread, a: 0.55 * power };
      }
      var k = 1 - Math.exp(-dt * 8);
      shadow.x += (goal.x - shadow.x) * k;
      shadow.y += (goal.y - shadow.y) * k;
      shadow.a += (goal.a - shadow.a) * k;
    }

    function frame(now) {
      if (!running) return;
      var dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      var piv = pivots();
      setCue(cuesBySlide[activeSlide()] || 'mainstage', now);
      plan(now, piv);
      var m = master(now) * dip(now - dipAt);
      ['l', 'c', 'r'].forEach(function (key, i) {
        var lamp = lamps[key];
        var k = 1 - Math.exp(-dt * lamp.rate);
        lamp.aim += (lamp.target - lamp.aim) * k;
        // Lamps strike one after another on first light.
        var stagger = strikeAt((now - started - i * gap) / 900);
        var level = lamp.want * Math.min(m, stagger);
        lamp.level += (level - lamp.level) * (1 - Math.exp(-dt * 14));
      });
      castShadow(piv, dt);
      ['l', 'c', 'r'].forEach(function (key) {
        dials[key].aim(lamps[key].aim);
        dials[key].level(lamps[key].level);
      });
      if (shadowEl) {
        setVars(shadowEl, {
          '--lp-sh-x': Math.round(shadow.x) + 'px',
          '--lp-sh-y': Math.round(shadow.y) + 'px',
          '--lp-sh-a': (Math.round(shadow.a * 50) / 50).toFixed(2)
        });
      }
      requestAnimationFrame(frame);
    }

    function sync() {
      var should = visible && !document.hidden;
      if (should && !running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      } else if (!should) {
        running = false;
      }
    }

    function steer(event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.at = performance.now();
    }

    if (finePointer) {
      show.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') steer(event);
      }, { passive: true });
    }
    // On touch, a tap on the stage (not on a control) calls the spot there.
    show.addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'touch') return;
      if (event.target.closest && event.target.closest('a, button, input, [data-lp-quote]')) return;
      steer(event);
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }).observe(show);
    }
    document.addEventListener('visibilitychange', sync);
    show.setAttribute('data-lp-cue', cue.name);
    sync();

    return {
      // Lamps on: every lamp drops out, then they strike up one by one.
      restrike: function () {
        started = performance.now() + 350;
        gap = 450;
      },
      // House lights up: the lamps dim under the house lights, then return.
      dip: function () { dipAt = performance.now(); }
    };
  }

  // ── Finale: three beams close in on Start free ──────────────────────────
  function setupFinale(root) {
    var panel = root.querySelector('[data-lp-finale]');
    var target = panel && panel.querySelector('[data-lp-finale-target]');
    if (!panel || !target) return;
    var PCT = { l: 0.12, c: 0.5, r: 0.88 };

    function measure() {
      var box = panel.getBoundingClientRect();
      if (!box.width) return;
      var t = centreOf(target);
      var x = t.x - box.left;
      var y = t.y - box.top;
      var out = { '--lp-fin-x': x.toFixed(0) + 'px', '--lp-fin-y': y.toFixed(0) + 'px' };
      ['l', 'c', 'r'].forEach(function (key) {
        var px = box.width * PCT[key];
        var aim = -deg(Math.atan2(x - px, Math.max(24, y)));
        out['--lp-fin-' + key] = aim.toFixed(2) + 'deg';
        out['--lp-fin-len-' + key] = Math.hypot(x - px, y).toFixed(0) + 'px';
      });
      setVars(panel, out);
    }

    panel.setAttribute('data-lp-lights', '');
    measure();
    window.addEventListener('resize', measure, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(panel);

    if (reduceMotion || !('IntersectionObserver' in window)) {
      panel.classList.add('is-lit');
      return;
    }
    // Lit while Start free sits in the lower two thirds of the screen, so a
    // panel taller than a phone screen still gets its finale.
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) measure();
        panel.classList.toggle('is-lit', entry.isIntersecting);
      });
    }, { rootMargin: '-30% 0px -8% 0px', threshold: 1 }).observe(target);
  }

  // ── House lights on theme switch ────────────────────────────────────────
  function setupHouseLights(root, rig) {
    var house = root.querySelector('[data-lp-house]');
    if (!house || reduceMotion || !('MutationObserver' in window)) return;
    var wasLight = document.body.classList.contains('light-theme');
    new MutationObserver(function () {
      var isLight = document.body.classList.contains('light-theme');
      if (isLight === wasLight) return;
      wasLight = isLight;
      if (root.hidden || !root.getClientRects().length) return;
      house.classList.remove('is-up', 'is-down');
      void house.offsetWidth;
      house.classList.add(isLight ? 'is-up' : 'is-down');
      // Going dark, the rig hangs above the blackout so the lamps are seen
      // striking up one by one before the stage fades back in.
      root.classList.toggle('lp-house-cue', !isLight);
      if (rig) {
        if (isLight) rig.dip();
        else rig.restrike();
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    house.addEventListener('animationend', function () {
      house.classList.remove('is-up', 'is-down');
      root.classList.remove('lp-house-cue');
    });
  }

  // ── Name in lights ──────────────────────────────────────────────────────
  function setupMarquee(root) {
    var box = root.querySelector('[data-lp-marquee]');
    if (!box) return;
    var form = box.querySelector('[data-lp-marquee-form]');
    var input = box.querySelector('[data-lp-marquee-input]');
    var name = box.querySelector('[data-lp-marquee-name]');
    if (!form || !input || !name) return;
    var fallback = name.textContent;

    function current() {
      return String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    }

    input.addEventListener('input', function () {
      var value = current();
      name.textContent = value || fallback;
      box.classList.toggle('has-name', Boolean(value));
      box.classList.remove('is-flash');
      void box.offsetWidth;
      box.classList.add('is-flash');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = current() || fallback;
      drawPoster(value, name).then(function (blob) {
        if (!blob) return;
        var fileName = (value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-artist') + '-in-lights.png';
        var file = null;
        try { file = new File([blob], fileName, { type: 'image/png' }); } catch (_err) {}
        if (file && !finePointer && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: value + ' in lights' }).catch(function () {});
          return;
        }
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      });
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  // A 1200x630 poster: brick under a warm spot, a bulb-framed marquee, the name.
  function drawPoster(text, nameEl) {
    var family = window.getComputedStyle(nameEl).fontFamily || 'Georgia, serif';
    var fontsReady = document.fonts && document.fonts.load
      ? document.fonts.load('700 96px ' + family).catch(function () {})
      : Promise.resolve();
    return Promise.all([loadImage('assets/landing/brick-wall.webp'), fontsReady]).then(function (results) {
      var brick = results[0];
      var W = 1200;
      var H = 630;
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#070C0A';
      ctx.fillRect(0, 0, W, H);
      if (brick) {
        ctx.globalAlpha = 0.42;
        var tile = 420;
        var tileH = tile * (brick.height / brick.width);
        for (var y = 0; y < H; y += tileH) for (var x = 0; x < W; x += tile) ctx.drawImage(brick, x, y, tile, tileH);
        ctx.globalAlpha = 1;
      }
      // Darken everything outside the spot, then the warm spot itself.
      var shade = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, 640);
      shade.addColorStop(0, 'rgba(7,12,10,0)');
      shade.addColorStop(0.55, 'rgba(7,12,10,0.55)');
      shade.addColorStop(1, 'rgba(7,12,10,0.95)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      var spot = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, 460);
      spot.addColorStop(0, 'rgba(255,236,190,0.34)');
      spot.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);

      // The sign.
      var bw = 940;
      var bh = 330;
      var bx = (W - bw) / 2;
      var by = 120;
      roundRect(ctx, bx, by, bw, bh, 26);
      ctx.fillStyle = 'rgba(16,14,10,0.92)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#D9B45A';
      ctx.stroke();
      // Bulbs round the frame.
      ctx.shadowColor = 'rgba(255,214,120,0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#FFE7A8';
      var gap = 30;
      for (var bxp = bx + 26; bxp <= bx + bw - 26; bxp += gap) {
        bulb(ctx, bxp, by + 18); bulb(ctx, bxp, by + bh - 18);
      }
      for (var byp = by + 18 + gap; byp <= by + bh - 18 - gap / 2; byp += gap) {
        bulb(ctx, bx + 18, byp); bulb(ctx, bx + bw - 18, byp);
      }
      ctx.shadowBlur = 0;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#D9B45A';
      ctx.font = '600 22px "Inter Tight", system-ui, sans-serif';
      spaced(ctx, 'NOW SHOWING', W / 2, by + 70, 6);

      var size = 112;
      var label = text.toUpperCase();
      ctx.font = '700 ' + size + 'px ' + family;
      while (ctx.measureText(label).width > bw - 140 && size > 36) {
        size -= 4;
        ctx.font = '700 ' + size + 'px ' + family;
      }
      var foil = ctx.createLinearGradient(0, by + 120, 0, by + 230);
      foil.addColorStop(0, '#FFF3C9');
      foil.addColorStop(0.5, '#E9C46A');
      foil.addColorStop(1, '#B8862B');
      ctx.shadowColor = 'rgba(255,200,90,0.55)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = foil;
      ctx.fillText(label, W / 2, by + bh / 2 + 8);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(247,243,232,0.75)';
      ctx.font = '500 20px "Inter Tight", system-ui, sans-serif';
      spaced(ctx, 'MANAGED ON STAR PAPER', W / 2, by + bh - 62, 4);

      ctx.fillStyle = 'rgba(247,243,232,0.6)';
      ctx.font = '500 22px "Inter Tight", system-ui, sans-serif';
      ctx.fillText('Run the show. Own the money.  ·  star-paper.netlify.app', W / 2, H - 70);

      return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bulb(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function spaced(ctx, text, cx, cy, tracking) {
    var chars = text.split('');
    var widths = chars.map(function (ch) { return ctx.measureText(ch).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + tracking * (chars.length - 1);
    var x = cx - total / 2;
    var align = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach(function (ch, i) {
      ctx.fillText(ch, x, cy);
      x += widths[i] + tracking;
    });
    ctx.textAlign = align;
  }

  onReady(function mountLandingLights() {
    var root = document.getElementById('landingScreen');
    if (!root || !root.classList.contains('lp')) return;
    setupMarquee(root);
    var rig = reduceMotion ? null : setupRig(root);
    setupFinale(root);
    setupHouseLights(root, rig);
  });
})();
