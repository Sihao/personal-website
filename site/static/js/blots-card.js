// Neurons and astrocytes as watercolour blots, for the astrocyte
// receptive-field publication: on its card (site/layouts/publications/li.html).
// The blots are the hero's (sketches/washes.js), from the same atlas.
// Blue blots are neurons, yellow ones astrocytes.
//
// From the bottom right corner, where the mouse sits on the other cards,
// small blots fan out towards the top left along a short, gently winding
// path, as the syllables do from the mouse (usv-card.js): they grow and
// scatter wider as they go.
//
// Each blot is a cell with its own calcium signal, as in the hero: calcium
// decays exponentially and the fluorescence is a saturating function of
// it. A fluorescent blot flashes in a bright shade of its own colour, blue
// or yellow. Neurons flash briefly; astrocytes rise and decay more slowly,
// and each of their events carries more calcium, so their flashes are as
// clear as the neurons'. Events come singly, and in waves that start at
// the corner and travel out along the path, recruiting some blots as they
// pass; astrocytes join a wave a little late.
//
// The layout is the same on every load: it comes from a seeded random
// sequence. The canvas fills the card's empty space below the text, down to
// the bottom right corner, and is laid out again whenever the card changes
// size. At rest all the blots are dark and still. While the card is hovered
// or focused they flash, a wave at once; when the hover ends, events stop
// and the lit blots fade. With reduced motion the card stays still.
(function () {
  "use strict";

  // Atlas layout; keep in sync with sketches/washes.js.
  var ATLAS_SRC = "/img/washes.webp";
  var TILE = 200;
  var COLS = 7;
  var BLOBS = 16;
  var DUSTY = [7, 9, 11];         // blob tiles with a trail of dust, not used here

  // Rest and flash colours. Neurons rest in Prussian blue and two tints of
  // it towards alabaster, as in the hero; astrocytes in a pale yellow.
  var NEURON = { rest: [["#14213d", 2], ["#4d5874", 2], ["#8790a6", 1]], flash: "#1f63d6" };
  var ASTROCYTE = { rest: [["#fce2a4", 1]], flash: "#ffb000" };
  var ASTRO_FRACTION = 0.3;       // of the blots along the path

  var STREAM = [20, 46];          // px, pigment size at the corner and at the end of the path
  var REACH = 380;                // px, the path's greatest length
  var FAN = 72;                   // px, sideways scatter at the end of the path
  var SPACING = 0.6;              // distance along the path between blots, in blot sizes
  var END = [0.92, 1];            // the path's end, as in usv-card.js
  var MAX_TURN = 60;              // degrees, as in usv-card.js
  var HALF_WAVE = 150;            // px along the line per bend, roughly
  var GAP = 8;                    // px between the text and the canvas
  var CLEAR = 6;                  // px kept clear around "Read abstract"
  var SEED = 20260109;

  var CELLS = {
    neuron: { rate: 0.35, rise: 0.05, decay: 0.4, join: 0.6, lag: 0, amount: 1 },
    astrocyte: { rate: 0.3, rise: 0.15, decay: 1.2, join: 0.6, lag: 0.3, amount: 1.6 }
  };
  var WAVE_RATE = 0.6;            // waves / s from the corner
  var WAVE_SPEED = 180;           // px / s along the path
  var K_D = 0.8;                  // indicator half-saturation
  // How fast events ease in and off, as the natural frequency (1/s) of a
  // critically damped spring on their rate. As in usv-card.js.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // A small seeded generator (mulberry32), so the layout is the same on
  // every load.
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weighted(list, rnd) {
    var total = list.reduce(function (s, c) { return s + c[1]; }, 0);
    var r = rnd() * total;
    for (var i = 0; i < list.length; i++) {
      if ((r -= list[i][1]) < 0) return list[i][0];
    }
    return list[0][0];
  }

  // The box of each blob tile's pigment, in tile px: its width, its height,
  // and its centre from the tile's centre. Blots are sized and placed by
  // their pigment, not by their tile.
  function pigmentSizes(atlas) {
    var c = document.createElement("canvas");
    c.width = atlas.width;
    c.height = atlas.height;
    var ctx = c.getContext("2d");
    ctx.drawImage(atlas, 0, 0);
    var sizes = [];
    for (var i = 0; i < BLOBS; i++) {
      var ox = (i % COLS) * TILE, oy = Math.floor(i / COLS) * TILE;
      var d = ctx.getImageData(ox, oy, TILE, TILE).data;
      var x0 = TILE, y0 = TILE, x1 = 0, y1 = 0;
      for (var y = 0; y < TILE; y++) {
        for (var x = 0; x < TILE; x++) {
          if (d[4 * (y * TILE + x) + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      sizes.push({ w: x1 - x0 + 1, h: y1 - y0 + 1, x: (x0 + x1 + 1 - TILE) / 2, y: (y0 + y1 + 1 - TILE) / 2 });
    }
    return sizes;
  }

  // A polyline with its cumulative length. As in usv-card.js.
  function measured(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts: pts, cum: cum };
  }

  // The wave from (0, 0) to (ex, ey), kept within x in [minX, 0] and y in
  // [minY, 0] (x right, y down). As in usv-card.js.
  function wave(ex, ey, minX, minY) {
    var len = Math.hypot(ex, ey) || 1;
    var ax = ex / len, ay = ey / len;
    var nx = -ay, ny = ax;        // unit normal
    if (ny > 0) { nx = -nx; ny = -ny; } // bend up first, away from "Read abstract"
    var bends = Math.max(1, Math.round(len / HALF_WAVE));
    var amp = len * Math.tan(MAX_TURN / 2 * Math.PI / 180) / (Math.PI * bends);
    var pts;
    for (var tries = 0; tries < 30; tries++, amp *= 0.9) {
      pts = [];
      var inside = true, lo = Infinity, hi = -Infinity;
      for (var i = 0; i <= 96; i++) {
        var t = i / 96, ramp = Math.min(1, t / 0.2);
        var o = amp * ramp * ramp * Math.sin(Math.PI * bends * t);
        var x = ex * t + nx * o, y = ey * t + ny * o;
        if (x > 0.5 || y > 0.5 || x < minX || y < minY) inside = false;
        if (i) {
          var dx = x - pts[i - 1][0], dy = y - pts[i - 1][1];
          var h = Math.atan2(dx * ny - dy * nx, dx * ax + dy * ay) * 180 / Math.PI;
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        pts.push([x, y]);
      }
      if (inside && hi - lo <= MAX_TURN) break;
    }
    return measured(pts);
  }

  // Point and unit normal at distance s along the path.
  function along(c, s) {
    var i = 1;
    while (i < c.cum.length - 1 && c.cum[i] < s) i++;
    var a = c.pts[i - 1], b = c.pts[i];
    var u = Math.min(1, Math.max(0, (s - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1] || 1)));
    var tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    return { x: a[0] + tx * u, y: a[1] + ty * u, nx: -ty / len, ny: tx / len };
  }

  // One tile of the atlas in a single colour, keeping its alpha; cached.
  function tinter(atlas) {
    var cache = {};
    return function (tile, colour) {
      var key = tile + colour;
      if (cache[key]) return cache[key];
      var c = document.createElement("canvas");
      c.width = c.height = TILE;
      var ctx = c.getContext("2d");
      ctx.drawImage(atlas, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, TILE, TILE);
      return (cache[key] = c);
    };
  }

  function mount(el, atlas, pigment) {
    var card = el.closest(".publication-card");
    var ctx = el.getContext("2d");
    var tint = tinter(atlas);
    var tiles = [];
    for (var i = 0; i < BLOBS; i++) if (DUSTY.indexOf(i) < 0) tiles.push(i);
    var w = 0, h = 0, dpr = 1;
    var blots = [];
    var t = 0, last = 0, raf = 0, running = false;
    var drive = 0, driveV = 0, target = 0;
    var pending = [];             // scheduled events: {t, blot, amount}

    function blot(kind, x, y, px, tile, rot, colour, s) {
      var type = kind === "neuron" ? NEURON : ASTROCYTE;
      var p = pigment[tile], k = px / Math.max(1, p.w, p.h);
      return {
        kind: kind, cell: CELLS[kind], x: x, y: y, s: s, px: px,
        pw: p.w * k, ph: p.h * k, dx: p.x * k, dy: p.y * k,
        size: TILE * k, rot: rot,
        rest: tint(tile, colour), lit: tint(tile, type.flash),
        alpha: kind === "neuron" ? 0.9 : 0.95, c: 0, f: 0, on: 0
      };
    }

    function layout() {
      var box = card.getBoundingClientRect();
      var cs = getComputedStyle(card);
      var padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      var padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
      var padB = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
      var textBottom = box.top, more = null;
      Array.prototype.forEach.call(card.children, function (child) {
        if (child === el) return;
        if (child.classList.contains("publication-more")) { more = child; return; }
        if (!child.getClientRects().length) return;   // no box: the abstract's <template>
        textBottom = Math.max(textBottom, child.getBoundingClientRect().bottom);
      });
      var nw = Math.max(2 * STREAM[1], Math.floor(box.width - padL - padR));
      var nh = Math.max(2 * STREAM[1], Math.floor(box.bottom - padB - textBottom - GAP));
      var nd = Math.min(2, window.devicePixelRatio || 1);
      if (nw === w && nh === h && nd === dpr && blots.length) return;
      w = nw; h = nh; dpr = nd;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = w + "px";
      el.style.height = h + "px";

      // "Read abstract", in canvas px, padded: no blot of the path on it.
      var no = null;
      if (more) {
        var r = more.getBoundingClientRect(), mcs = getComputedStyle(more);
        var left = box.right - padR - w, top = box.bottom - padB - h;
        no = { x0: r.left - left - CLEAR, y0: r.top + parseFloat(mcs.paddingTop) - top - CLEAR,
               x1: r.left - left + more.scrollWidth + CLEAR, y1: r.bottom - top + CLEAR };
      }

      var rnd = seeded(SEED);
      pending = [];

      // The path, from the bottom right corner towards the top left, no
      // longer than REACH.
      var ox = w - STREAM[0], oy = h - STREAM[0];
      var margin = STREAM[1] / 2 + FAN;
      var spanX = Math.max(0, ox - margin), spanY = Math.max(0, oy - margin);
      var ex = -END[0] * spanX, ey = -END[1] * spanY;
      var shrink = Math.min(1, REACH / (Math.hypot(ex, ey) || 1));
      var path = wave(ex * shrink, ey * shrink, -spanX, -spanY);
      var len = path.cum[path.cum.length - 1];
      var placed = [];
      for (var s = 0; s < len; ) {
        var q = s / len;
        var px = STREAM[0] + (STREAM[1] - STREAM[0]) * q;
        // More blots side by side as the stream fans out.
        var across = 1 + Math.round(q * 2.4);
        for (var n = 0; n < across; n++) {
          for (var attempt = 0; attempt < 6; attempt++) {
            var at = along(path, Math.min(len, s + (rnd() - 0.5) * px * 0.6));
            var side = (rnd() * 2 - 1) * (4 + FAN * q);
            var x = ox + at.x + at.nx * side, y = oy + at.y + at.ny * side;
            var size = px * (0.8 + 0.4 * rnd());
            var ok = x > size / 2 && y > size / 2 && x < w - size / 2 &&
              !(no && x + size / 2 > no.x0 && x - size / 2 < no.x1 && y + size / 2 > no.y0 && y - size / 2 < no.y1) &&
              placed.every(function (o) { return Math.hypot(o.x - x, o.y - y) > 0.55 * (o.px + size); });
            if (!ok) continue;
            var isAstro = rnd() < ASTRO_FRACTION;
            placed.push(blot(isAstro ? "astrocyte" : "neuron", x, y, size, tiles[Math.floor(rnd() * tiles.length)],
              rnd() * Math.PI * 2, isAstro ? ASTROCYTE.rest[0][0] : weighted(NEURON.rest, rnd), s));
            break;
          }
        }
        s += px * SPACING * (0.85 + 0.3 * rnd());
      }
      // Larger blots underneath smaller ones.
      placed.sort(function (a, b) { return b.px - a.px; });
      blots = placed;
      render();
    }

    function sprite(src, b, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.drawImage(src, -b.size / 2 - b.dx, -b.size / 2 - b.dy, b.size, b.size);
      ctx.restore();
    }

    // Overlaps glaze, as layers of wash do on paper. A lit blot's rest
    // colour gives way to its flash colour, so the flash is clean.
    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "multiply";
      blots.forEach(function (b) {
        b.on = b.f >= 0.02 ? Math.min(1, 2 * b.f) : 0;
        sprite(b.rest, b, b.alpha * (1 - b.on));
        if (b.on) sprite(b.lit, b, b.on);
      });
    }

    // A wave from the corner, out along the path.
    function waveOut() {
      blots.forEach(function (b, i) {
        if (Math.random() < b.cell.join) {
          pending.push({ t: t + b.s / WAVE_SPEED + b.cell.lag + Math.random() * 0.05, blot: i, amount: b.cell.amount });
        }
      });
    }

    function step(dt) {
      t += dt;
      if (Math.random() < drive * WAVE_RATE * dt) waveOut();
      pending = pending.filter(function (e) {
        if (e.t > t) return true;
        blots[e.blot].c += e.amount;
        return false;
      });
      blots.forEach(function (b) {
        if (Math.random() < drive * b.cell.rate * dt) b.c += b.cell.amount;
        b.c *= Math.exp(-dt / b.cell.decay);
        b.f += (b.c / (b.c + K_D) - b.f) * (1 - Math.exp(-dt / b.cell.rise));
      });
    }

    // Moves the drive towards its target along a critically damped
    // spring, with its exact solution. As in usv-card.js.
    function spin(dt) {
      var w0 = target > drive ? SPIN_UP : RUN_DOWN;
      var c1 = drive - target, c2 = driveV + w0 * c1;
      var decay = Math.exp(-w0 * dt);
      drive = target + (c1 + c2 * dt) * decay;
      driveV = (c2 - w0 * (c1 + c2 * dt)) * decay;
      if (Math.abs(drive - target) < 1e-3 && Math.abs(driveV) < 1e-2) {
        drive = target;
        driveV = 0;
      }
      drive = Math.max(0, Math.min(1, drive));
    }

    // Nothing left to fade: no events on their way, every blot dark.
    function dark() {
      return pending.length === 0 && blots.every(function (b) { return b.f < 0.01; });
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      spin(dt);
      // Small steps keep the brief flashes smooth at low frame rates.
      var n = Math.ceil(dt / 0.02);
      for (var i = 0; i < n; i++) step(dt / n);
      render();
      if (!target && !drive && dark()) { running = false; return; }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    layout();
    if ("ResizeObserver" in window) new ResizeObserver(layout).observe(card);
    else window.addEventListener("resize", layout);
    if (reducedMotion) return;

    var active = 0;               // pointer over, focus within, in view on a touch screen: a bit each
    var set = function (bit, on) {
      var was = active;
      active = on ? active | bit : active & ~bit;
      if (!was && active) {
        target = 1;
        waveOut();                // so the hover is not met by stillness
        start();
      } else if (was && !active) {
        target = 0;               // the frame loop fades the blots and stops
      }
    };
    card.addEventListener("mouseenter", function () { set(1, true); });
    card.addEventListener("mouseleave", function () { set(1, false); });
    card.addEventListener("focusin", function () { set(2, true); });
    card.addEventListener("focusout", function () { set(2, false); });
    // No hover on a touch screen: run while most in view (in-view.js).
    if (window.inView) window.inView.watch(card, function (on) { set(4, on); });
  }

  function init() {
    var els = document.querySelectorAll(".publication-blots");
    if (!els.length) return;
    var img = new Image();
    img.onload = function () {
      var pigment = pigmentSizes(img);
      Array.prototype.forEach.call(els, function (el) { mount(el, img, pigment); });
    };
    img.src = ATLAS_SRC;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
