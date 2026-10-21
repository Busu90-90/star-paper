// Landing stage lights: the visitor runs the rig.
// - Follow spot: the centre lamp holds still until the visitor moves, then
//   stays locked on their cursor or thumb anywhere on the page, throwing a
//   pool of light on the wall where it points.
// - Bee Eye heads: the side lamps throw fans of mixed-colour beamlets, pan
//   on their own side of the stage, tilt front and back (flaring when they
//   face the audience), and have a short throw, so they never wash over the
//   follow spot.
// - Cues: every hero slide has its own lighting state, with a short blackout
//   between them.
// - Shadows: the active headline casts a soft shadow away from the lamps.
// - Finale: the rig shines down the whole page and closes in on Start free
//   when the closing panel comes into view.
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

  // The side lamps dance like disco heads: two waves at odd speeds so the
  // pattern never quite repeats, and always on their own side of the stage
  // (6 to 62 degrees outwards), so they never cross the follow spot.
  var DISCO = {
    l: { side: 1, phase: 0 },
    r: { side: -1, phase: 2.1 }
  };

  // Tilt of a Bee Eye head in degrees: mostly hanging down and nodding a
  // little, now and then swinging round to shoot straight out at the
  // audience (positive) or back at the wall (negative).
  function tiltAt(name, now) {
    var d = DISCO[name];
    var t = now / 1000;
    var front = Math.pow(Math.max(0, Math.sin(t * 0.42 + d.phase)), 8);
    var back = Math.pow(Math.max(0, Math.sin(t * 0.31 + d.phase * 2.3 + 1.2)), 10);
    var nod = 14 * Math.sin(t * 1.25 + d.phase * 1.7);
    return clamp(nod + 90 * front - 70 * back, -80, 90);
  }

  function discoAt(name, now) {
    var d = DISCO[name];
    var t = now / 1000;
    return d.side * (34 + 20 * Math.sin(t * 1.7 + d.phase) + 8 * Math.sin(t * 3.1 + d.phase * 1.6));
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
    var stage = root.querySelector('.lp-main');
    var show = root.querySelector('[data-lp-show]');
    var rig = stage && stage.querySelector('.lp-rig');
    var wall = stage && stage.querySelector('.lp-wall');
    var finale = root.querySelector('[data-lp-finale]');
    var finaleTarget = finale && finale.querySelector('[data-lp-finale-target]');
    if (!stage || !show || !rig || !wall) return null;
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
          makeDial(beam, [{ opacity: 0 }, { opacity: 1 }], 100, '::before')
        ];
        dials[key] = {
          aim: function (deg) { aims.forEach(function (dial) { dial((deg + 70) * 10); }); },
          level: function (value) { levels.forEach(function (dial) { dial(value * 100); }); }
        };
        // Bee Eye heads also tilt front and back: the beam fan shortens
        // towards the lens and, facing the audience, the lens flares.
        if (key !== 'c') {
          var flare = rig.querySelector('.lp-rig__flare--' + key);
          var reach = makeDial(beam, [{ scale: '1 0.04' }, { scale: '1 1' }], 100);
          var burst = makeDial(flare, [{ opacity: 0, rotate: '0deg' }, { opacity: 1, rotate: '45deg' }], 100);
          dials[key].tilt = function (length, glare) { reach(length * 100); burst(glare * 100); };
        }
      });
    } catch (_err) {
      return null;
    }
    var slides = Array.prototype.slice.call(show.querySelectorAll('[data-lp-slide]'));
    var PCT = { l: 0.19, c: 0.5, r: 0.81 };
    var PIVOT = 31;
    var lamps = {
      l: { aim: 34, level: 0, target: 34, want: 1, rate: 6 },
      c: { aim: 0, level: 0, target: 0, want: 1, rate: 3 },
      r: { aim: -34, level: 0, target: -34, want: 1, rate: 6 }
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

    var inFinale = false;
    var finaleSince = 0;
    var spot = wall.querySelector('.lp-wall__spot');
    var SPOT = 360;

    stage.setAttribute('data-lp-lights', '');
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
      return clamp(-deg(Math.atan2(point.x - pivot.x, Math.max(24, point.y - pivot.y))), -70, 70);
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
      var closing = Boolean(finaleTarget && finale.classList.contains('is-lit'));
      if (closing !== inFinale) {
        inFinale = closing;
        rig.classList.toggle('is-finale', closing);
        wall.classList.toggle('is-finale', closing);
      }
      if (closing && !finaleSince) finaleSince = now;
      if (!closing) finaleSince = 0;
      // Once the visitor has moved, the centre lamp is theirs for good. In the
      // finale it joins the others on Start free until they move again.
      var following = pointer.at > 0 && !(closing && pointer.at < finaleSince);
      var slide = slides[activeSlide()];
      lamps.c.rate = 3;
      lamps.l.rate = lamps.r.rate = 6;
      lamps.l.want = lamps.c.want = lamps.r.want = 1;
      lamps.l.target = discoAt('l', now);
      lamps.r.target = discoAt('r', now);
      // The centre lamp never sways on its own: it rests straight down.
      lamps.c.target = 0;

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
        lamps.l.want = lamps.r.want = 0.35;
      } else if (name === 'proof') {
        var stats = slide ? slide.querySelectorAll('.lp-stat') : [];
        if (stats[0]) lamps.c.target = aimAt(piv.c, centreOf(stats[0]));
        lamps.c.rate = 9;
      } else if (name === 'voices') {
        var front = slide ? slide.querySelector('[data-lp-quote][data-pos="front"]') : null;
        if (front) lamps.c.target = aimAt(piv.c, centreOf(front));
        lamps.l.want = lamps.r.want = 0.14;
        lamps.c.want = 0.9;
      }

      // Finale: the follow spot swings onto Start free; the side heads keep dancing.
      if (closing) {
        lamps.c.target = aimAt(piv.c, centreOf(finaleTarget));
        lamps.c.want = 1;
        lamps.c.rate = 2.4;
      }

      // The follow spot wins over any cue while the visitor is steering it.
      if (following) {
        lamps.c.target = aimAt(piv.c, pointer);
        lamps.c.want = 1;
        lamps.c.rate = 12;
      }
      return following;
    }

    // The pool of light where the follow spot lands: placed along the centre
    // beam's current angle at the pointer's distance, so it trails the lamp
    // exactly. Only this one small element moves; its bricks stay put.
    var spotShown = false;
    function placeSpot(piv, following, level) {
      if (!spot) return;
      if (!following || level < 0.05) {
        if (spotShown) { spot.classList.remove('is-on'); spotShown = false; }
        lightText(null);
        return;
      }
      var dx = pointer.x - piv.c.x;
      var dy = pointer.y - piv.c.y;
      var dist = Math.max(60, Math.hypot(dx, dy));
      var rad = lamps.c.aim * Math.PI / 180;
      var box = wall.getBoundingClientRect();
      var x = piv.c.x - dist * Math.sin(rad) - box.left - SPOT / 2;
      var y = piv.c.y + dist * Math.cos(rad) - box.top - SPOT / 2;
      setVars(spot, { '--lp-sx': Math.round(x) + 'px', '--lp-sy': Math.round(y) + 'px' });
      if (!spotShown) { spot.classList.add('is-on'); spotShown = true; }
      lightText({ x: piv.c.x - dist * Math.sin(rad), y: piv.c.y + dist * Math.cos(rad) });
    }

    // Text caught in the follow spot (or under the visitor's thumb) lights up
    // and glows. Looked up a few times a second, not every frame.
    var litEl = null;
    var litAt = 0;
    var TEXT_TAGS = /^(H1|H2|H3|H4|P|LI|A|BUTTON|EM|STRONG|SPAN|BLOCKQUOTE|FIGCAPTION|SMALL|LABEL|DT|DD)$/;
    function ownText(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 && c.nodeValue.trim()) return true;
      }
      return false;
    }
    function textAt(x, y) {
      var hits = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
      for (var i = 0; i < hits.length; i += 1) {
        var el = hits[i];
        if (!root.contains(el) || el.closest('.lp-rig, .lp-wall, .lp-header')) continue;
        // Filled buttons keep their own colours.
        if (el.closest('.lp-btn--gold, .lp-btn--foil')) return null;
        for (var up = 0; el && up < 4 && el !== root; up += 1, el = el.parentElement) {
          if (TEXT_TAGS.test(el.tagName) && ownText(el)) return el;
        }
        return null;
      }
      return null;
    }
    function lightText(point) {
      var now = performance.now();
      if (point && now - litAt < 90) return;
      litAt = now;
      var next = point ? textAt(point.x, point.y) : null;
      if (next === litEl) return;
      if (litEl) litEl.classList.remove('is-beamlit');
      litEl = next;
      if (litEl) litEl.classList.add('is-beamlit');
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
      var following = plan(now, piv);
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
      slideWashes();
      placeSpot(piv, following, lamps.c.level);
      ['l', 'c', 'r'].forEach(function (key) {
        dials[key].aim(lamps[key].aim);
        if (key === 'c') {
          dials[key].level(lamps[key].level);
          return;
        }
        // Tilted front or back, less of the fan reaches the wall.
        var tilt = tiltAt(key, now);
        var length = Math.abs(Math.cos(tilt * Math.PI / 180));
        var glare = tilt > 0 ? smooth(clamp((tilt - 40) / 45, 0, 1)) : 0;
        dials[key].level(lamps[key].level * (0.35 + 0.65 * length));
        dials[key].tilt(Math.max(0.04, length), glare * lamps[key].level);
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

    // Keeps the screen-tall washes over the part of the wall on screen.
    var washHeight = 0;
    function slideWashes() {
      var box = wall.getBoundingClientRect();
      if (!washHeight) washHeight = wall.querySelector('.lp-wall__wash').offsetHeight || window.innerHeight;
      var off = clamp(-box.top, 0, Math.max(0, box.height - washHeight));
      setVars(wall, { '--lp-off': Math.round(off) + 'px' });
    }
    window.addEventListener('resize', function () { washHeight = 0; }, { passive: true });

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

    // Anywhere on the page: the cursor, or a thumb touching or dragging.
    document.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') steer(event);
    }, { passive: true });
    function steerTouch(event) {
      if (event.touches && event.touches[0]) steer(event.touches[0]);
    }
    document.addEventListener('touchstart', steerTouch, { passive: true });
    document.addEventListener('touchmove', steerTouch, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      }).observe(stage);
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

  // ── Finale: the rig closes in on Start free ─────────────────────────────
  // This marks the panel lit while Start free is well into view; setupRig
  // swings the lamps onto it, and the panel dims around the button.
  function setupFinale(root) {
    var panel = root.querySelector('[data-lp-finale]');
    var target = panel && panel.querySelector('[data-lp-finale-target]');
    if (!panel || !target) return;

    function measure() {
      var box = panel.getBoundingClientRect();
      if (!box.width) return;
      var t = centreOf(target);
      setVars(panel, {
        '--lp-fin-x': (t.x - box.left).toFixed(0) + 'px',
        '--lp-fin-y': (t.y - box.top).toFixed(0) + 'px'
      });
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
