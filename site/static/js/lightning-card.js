// A population of neurons whose dendrites crackle like lightning, in
// watercolour, for the two-photon voltage imaging publication: on its card
// (site/layouts/publications/li.html). Voltage indicators catch each spike
// as it fires, as a flash catches a bolt.
//
// The cell bodies are small Prussian-blue watercolour blots clustered in
// the bottom right corner, from the hero's atlas (/img/washes.webp;
// sketches/washes.js). Each shows only while its neuron fires (or, for the
// resting neuron, at rest), and fades with its dendrite. A dendrite is a bolt of lightning: jagged
// Prussian-blue cores over continuous orange watercolour strokes, from the
// painted atlas /img/lightning.webp (white, alpha = pigment density),
// painted ahead of time with p5.brush by tools/lightning-atlas.html: tile i
// of the atlas's first row is a bolt's core, tile i of its second row the
// glow along it. The bolt's trunk lies on its cell body, and it fans out up
// and to the left, its branches splitting away from the cell body.
//
// All of it keeps within one fan: the fan the blots of the astrocyte card
// fill (blots-card.js), from the bottom right corner along a gently
// winding path to the top left, widening as it goes. The cell bodies lie
// in its narrow end, near its path; each dendrite points to its far end
// and spreads no wider than it. Nothing is cut off at the fan's edge
// (see lessons.md).
//
// One neuron fires at a time, chosen at random, with a bolt chosen at
// random: never the neuron or the bolt of the strike before. A strike
// crackles gently: its core brightens and dims two or three times, its
// glow swells with it and the cell body flashes bright blue with each
// pulse, then all fade, the glow more slowly, as a wash dries. The pulses
// are PULSE s apart, so the card never flashes more than three times a
// second (WCAG 2.3.1), and the core dims between them but never goes out.
//
// The canvas fills the card's empty space, from below the text to above
// "Read abstract", and is laid out again whenever the card changes size;
// the population's layout comes from a seeded random sequence, so it is
// the same on every load. At rest the card shows one neuron, still, its
// cell body and dendrite painted on the paper. While the card is
// hovered or focused (or, on a touch screen, in view; see in-view.js) it
// strikes: the first strike lights the resting dendrite, and the next ones
// follow, each once the last has faded. When the hover ends, no strike
// starts; once the last has faded the resting dendrite comes back. With
// reduced motion the card stays still.
(function () {
  "use strict";

  // Atlas layout; keep in sync with tools/lightning-atlas.html.
  var ATLAS_SRC = "/img/lightning.webp";
  var TILE_W = 320;
  var TILE_H = 384;
  var BOLTS = 10;

  var CORE = "#14213d";           // --prussian-blue
  var GLOW = "#fca311";           // --orange
  var TURN = 8 * Math.PI / 180;   // a strike's dendrite turns up to this far from the fan's end
  var STEEP = 50 * Math.PI / 180; // above the horizontal, the flattest a dendrite points
  var LENGTH = 0.95;              // of the distance from the cell body to the fan's end
  var INSET = 0.04;               // of the dendrite's length, its start inside the cell body

  // The fan the drawing keeps to: the same fan as the blots of the
  // astrocyte card (blots-card.js; keep in sync), from the bottom right
  // corner along a gently winding path to the top left, as wide either
  // side of the path as its blots scatter (4 px plus FAN at the end) plus
  // half a blot.
  var STREAM = [20, 46];
  var REACH = 380;
  var FAN = 72;
  var END = [0.92, 1];
  var MAX_TURN = 60;
  var HALF_WAVE = 150;
  var CELLS_WITHIN = 0.3;         // of the fan's length from the corner, where the cell bodies lie
  var SIDE = 0.5;                 // of the fan's half width, how far off its path a cell body lies

  // The cell bodies: tiles of the hero's atlas (atlas layout as in
  // sketches/washes.js; the compact blots, not those with a trail of
  // dust), their pigment CELL_PX across at its widest; their rest colour
  // and the bright blue they flash.
  var WASH_SRC = "/img/washes.webp";
  var WASH_TILE = 200;
  var WASH_COLS = 7;
  var CELL_TILES = [0, 1, 2, 5, 6, 8, 10, 13, 15];
  var CELL = { rest: "#14213d", flash: "#1f63d6", alpha: 0.9 };
  var POPULATION = 5;
  var CELL_PX = [14, 24];
  var SEED = 20260723;
  var REST_TILE = 3;              // the resting dendrite, on the cell nearest the corner

  // A strike: the levels of core and glow at its key times (s), eased
  // between; the first key is where it starts from. PULSE apart, the core
  // brightens; between, it dims to DIM.
  var PULSE = 0.48;
  var DIM = 0.45;
  var PULSES = [2, 3];
  var RISE = 0.2;                 // s to the first pulse
  var CORE_FADE = 0.5;            // s, after the last pulse
  var GLOW_FADE = 1.2;            // s, after the last pulse
  var REST = { core: 0.8, glow: 0.8 };
  var REST_BACK = 0.6;            // s for the resting dendrite to come back
  var REST_AWAY = 0.3;            // s for a resting dendrite part way back to go
  var WAIT = [0.05, 0.25];        // s between one strike's end and the next
  var GAP = 8;                    // px between the card's text and the drawing

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function between(r) { return r[0] + Math.random() * (r[1] - r[0]); }
  function ease(t) { return t * t * (3 - 2 * t); }

  // A small seeded generator (mulberry32), as in blots-card.js.
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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

  // One row of the atlas in a single colour, keeping its alpha.
  function row(atlas, r, colour) {
    var c = document.createElement("canvas");
    c.width = BOLTS * TILE_W;
    c.height = TILE_H;
    var ctx = c.getContext("2d");
    ctx.drawImage(atlas, 0, r * TILE_H, c.width, TILE_H, 0, 0, c.width, TILE_H);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, TILE_H);
    return c;
  }

  // The key times of a strike that starts from levels c0 and g0.
  function keys(c0, g0) {
    var k = [[0, c0, g0]], t = RISE, n = Math.round(between(PULSES));
    for (var i = 0; i < n; i++) {
      k.push([t, 1, i ? 1 : 0.7]);
      if (i < n - 1) k.push([t + PULSE / 2, DIM, 0.85]);
      t += PULSE;
    }
    t -= PULSE;
    k.push([t + CORE_FADE, 0, 0.45], [t + GLOW_FADE, 0, 0]);
    return k;
  }

  // Core and glow at time t of a strike, eased between its keys.
  function levels(k, t) {
    for (var i = 1; i < k.length; i++) {
      if (t < k[i][0]) {
        var a = k[i - 1], b = k[i], u = ease((t - a[0]) / (b[0] - a[0]));
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
    }
    return null;                  // over
  }

  function pick(n, not) {
    var i;
    do { i = Math.floor(Math.random() * n); } while (n > 1 && i === not);
    return i;
  }

  function mount(el, cores, glows, bodies) {
    var card = el.closest(".publication-card");
    var ctx = el.getContext("2d");
    var w = 0, h = 0, dpr = 1;
    var cells = [];               // {x, y, px, rot, body, heading, len}; cells[0] is nearest the corner
    var fan = null;               // {path, len, ox, oy, end}
    var strike = null;            // {cell, tile, flip, turn, keys, t, core, glow}
    var rest = 1;                 // how much of the resting dendrite shows
    var wait = 0;                 // s until the next strike
    var last = 0, raf = 0, running = false, active = 0;

    // From below the text to above "Read abstract", as in planes.js.
    function layout() {
      var box = card.getBoundingClientRect();
      var cs = getComputedStyle(card);
      var top = box.top, more = null;
      Array.prototype.forEach.call(card.children, function (child) {
        if (child === el) return;
        if (child.classList.contains("publication-more")) { more = child; return; }
        if (!child.getClientRects().length) return;   // no box: the abstract's <template>
        top = Math.max(top, child.getBoundingClientRect().bottom);
      });
      var bottom = box.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
      if (more) bottom = more.getBoundingClientRect().top + parseFloat(getComputedStyle(more).paddingTop);
      var padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
      var bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth);
      var nw = Math.max(0, Math.floor(box.width - bl - br - padL - padR));
      var nh = Math.max(0, Math.floor(bottom - GAP - top - GAP));
      el.style.left = padL + "px";
      el.style.top = (top + GAP - box.top - parseFloat(cs.borderTopWidth)) + "px";
      var nd = Math.min(2, window.devicePixelRatio || 1);
      if (nw === w && nh === h && nd === dpr) return;
      w = nw; h = nh; dpr = nd;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      el.style.width = w + "px";
      el.style.height = h + "px";
      shape();
      populate();
      render();
    }

    // Half the fan's width at fraction q of its length.
    function half(q) {
      return 4 + FAN * q + (STREAM[0] + (STREAM[1] - STREAM[0]) * q) / 2;
    }

    // The fan: its path, as in blots-card.js, and its far end.
    function shape() {
      var ox = w - STREAM[0], oy = h - STREAM[0];
      var margin = STREAM[1] / 2 + FAN;
      var spanX = Math.max(0, ox - margin), spanY = Math.max(0, oy - margin);
      var ex = -END[0] * spanX, ey = -END[1] * spanY;
      var shrink = Math.min(1, REACH / (Math.hypot(ex, ey) || 1));
      var path = wave(ex * shrink, ey * shrink, -spanX, -spanY);
      var len = path.cum[path.cum.length - 1];
      var tip = along(path, len);
      fan = { path: path, len: len, ox: ox, oy: oy, end: [ox + tip.x, oy + tip.y] };
    }

    // The cells, in the narrow end of the fan: each at a seeded place
    // along its first CELLS_WITHIN and within its width, none on another or
    // outside the canvas. Sorted nearest the corner first. Each dendrite
    // points to the fan's far end and reaches nearly to it.
    function populate() {
      var rnd = seeded(SEED);
      cells = [];
      for (var tries = 0; cells.length < POPULATION && tries < 400; tries++) {
        var px = CELL_PX[0] + (CELL_PX[1] - CELL_PX[0]) * rnd();
        var d = fan.len * CELLS_WITHIN * Math.pow(rnd(), 1.2);
        var at = along(fan.path, d), side = (rnd() * 2 - 1) * SIDE * Math.max(0, half(d / (fan.len || 1)) - px / 2);
        var x = fan.ox + at.x + at.nx * side, y = fan.oy + at.y + at.ny * side;
        var body = bodies[CELL_TILES[Math.floor(rnd() * CELL_TILES.length)]];
        var rot = rnd() * Math.PI * 2;
        if (x < px / 2 || y < px / 2 || x > w - px / 2 || y > h - px / 2) continue;
        if (cells.some(function (c) { return Math.hypot(c.x - x, c.y - y) < 0.6 * (c.px + px) + 3; })) continue;
        // Towards the fan's far end, but no flatter than STEEP, and no
        // longer than fits in the canvas.
        var dx = x - fan.end[0], dy = y - fan.end[1];
        var heading = Math.max(STEEP, Math.atan2(dy, dx));
        var len = LENGTH * Math.min(Math.hypot(dx, dy), (y - 4) / Math.sin(heading), (x - 4) / Math.cos(heading));
        cells.push({ x: x, y: y, px: px, rot: rot, body: body, heading: heading, len: len });
      }
      cells.sort(function (a, b) { return Math.hypot(w - a.x, h - a.y) - Math.hypot(w - b.x, h - b.y); });
    }

    // Draws tile `tile` of `src` as a dendrite of `cell`: its start (the
    // tile's top) on the cell body, reaching towards the fan's far end,
    // turned by `turn`; narrowed, where need be, so its branches spread no
    // wider than the fan does at its end.
    function sprite(src, cell, tile, flip, turn, alpha) {
      if (alpha < 0.005 || !cell) return;
      var heading = cell.heading + turn, c = Math.cos(heading), s = Math.sin(heading);
      var len = cell.len, bw = Math.min(len * TILE_W / TILE_H, 2 * half(1));
      var sx = cell.x - c * INSET * len, sy = cell.y - s * INSET * len;
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.translate(sx - c * len / 2, sy - s * len / 2);
      ctx.rotate(heading + Math.PI / 2);
      ctx.scale(flip ? -1 : 1, 1);
      ctx.drawImage(src, tile * TILE_W, 0, TILE_W, TILE_H, -bw / 2, -len / 2, bw, len);
      ctx.restore();
    }

    // A cell body, in its rest or its flash colour, sized and placed by its
    // pigment.
    function body(cell, lit, alpha) {
      if (alpha < 0.005) return;
      var b = cell.body, size = cell.px * WASH_TILE / b.size;
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.translate(cell.x, cell.y);
      ctx.rotate(cell.rot);
      ctx.drawImage(lit ? b.lit : b.rest, -size / 2 - b.dx * size / WASH_TILE, -size / 2 - b.dy * size / WASH_TILE, size, size);
      ctx.restore();
    }

    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      if (!w || !h || !cells.length) return;
      var home = cells[0];
      // The glow glazes the paper; the core lies on top.
      ctx.globalCompositeOperation = "multiply";
      sprite(glows, home, REST_TILE, false, 0, REST.glow * rest);
      if (strike) sprite(glows, cells[strike.cell], strike.tile, strike.flip, strike.turn, strike.glow);
      ctx.globalCompositeOperation = "source-over";
      sprite(cores, home, REST_TILE, false, 0, REST.core * rest);
      if (strike) sprite(cores, cells[strike.cell], strike.tile, strike.flip, strike.turn, strike.core);
      // The cell bodies over the dendrites' starts. A cell body shows only
      // with its dendrite: the resting one with the resting dendrite, the
      // firing one as long as its strike lasts, flashing with its pulses
      // and giving way to the bright blue.
      var lit = strike ? Math.max(0, Math.min(1, (strike.core - DIM / 2) / (1 - DIM / 2))) : 0;
      var seen = strike ? Math.min(1, Math.max(strike.core, strike.glow)) : 0;
      ctx.globalCompositeOperation = "multiply";
      cells.forEach(function (cell, i) {
        var firing = strike && strike.cell === i;
        var shown = Math.max(i === 0 ? rest : 0, firing ? seen : 0);
        var on = firing ? lit : 0;
        body(cell, false, CELL.alpha * shown * (1 - on));
        body(cell, true, on);
      });

    }

    function begin(first) {
      // The first lights the resting dendrite from where it stands.
      if (first) {
        strike = { cell: 0, tile: REST_TILE, flip: false, turn: 0, t: 0,
          keys: keys(REST.core * rest, REST.glow * rest), core: 0, glow: 0 };
        rest = 0;
        return;
      }
      var prev = strike || { cell: 0, tile: REST_TILE };
      strike = { cell: pick(cells.length, prev.cell), tile: pick(BOLTS, prev.tile), flip: Math.random() < 0.5,
        turn: (Math.random() * 2 - 1) * TURN, t: 0, keys: keys(0, 0), core: 0, glow: 0 };
    }

    function step(dt) {
      if (strike && strike.keys) {
        strike.t += dt;
        var l = levels(strike.keys, strike.t);
        if (l) {
          strike.core = l[0];
          strike.glow = l[1];
        } else {
          // Over: kept, unlit, so the next strike can avoid its neuron and bolt.
          strike = { cell: strike.cell, tile: strike.tile, core: 0, glow: 0 };
          wait = between(WAIT);
        }
      } else if (active) {
        // A hover that starts as the resting dendrite comes back sends it
        // away first, so no two dendrites show at once.
        rest = Math.max(0, rest - dt / REST_AWAY);
        wait -= dt;
        if (wait <= 0 && !rest) begin(false);
      } else {
        rest = Math.min(1, rest + dt / REST_BACK);
      }
    }

    function striking() { return !!(strike && strike.keys); }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      step(dt);
      render();
      if (!active && !striking() && rest >= 1) { running = false; return; }
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

    // pointer over, focus within, in view on a touch screen: a bit each
    var set = function (bit, on) {
      var was = active;
      active = on ? active | bit : active & ~bit;
      if (!was && active) {
        // Strike at once if the card rests; else wait for the strike under way.
        if (!striking() && rest >= 1) begin(true);
        else if (!striking()) wait = 0;
        start();
      }
      // When the hover ends, the strike under way plays out and the
      // resting dendrite comes back (step()).
    };
    card.addEventListener("mouseenter", function () { set(1, true); });
    card.addEventListener("mouseleave", function () { set(1, false); });
    card.addEventListener("focusin", function () { set(2, true); });
    card.addEventListener("focusout", function () { set(2, false); });
    // No hover on a touch screen: run while most in view (in-view.js).
    if (window.inView) window.inView.watch(card, function (on) { set(4, on); });
  }

  function load(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  // One tile of the hero's atlas in one colour, keeping its alpha.
  function tinted(atlas, tile, colour) {
    var c = document.createElement("canvas");
    c.width = c.height = WASH_TILE;
    var ctx = c.getContext("2d");
    ctx.drawImage(atlas, (tile % WASH_COLS) * WASH_TILE, Math.floor(tile / WASH_COLS) * WASH_TILE,
      WASH_TILE, WASH_TILE, 0, 0, WASH_TILE, WASH_TILE);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, WASH_TILE, WASH_TILE);
    return c;
  }

  // A cell body's tile in its two colours, with the box of its pigment:
  // the larger side, and its centre from the tile's centre (tile px), so
  // it is sized and placed by its pigment. As in blots-card.js.
  function cellBody(atlas, tile) {
    var rest = tinted(atlas, tile, CELL.rest);
    var d = rest.getContext("2d").getImageData(0, 0, WASH_TILE, WASH_TILE).data;
    var x0 = WASH_TILE, y0 = WASH_TILE, x1 = 0, y1 = 0;
    for (var y = 0; y < WASH_TILE; y++) {
      for (var x = 0; x < WASH_TILE; x++) {
        if (d[4 * (y * WASH_TILE + x) + 3] > 24) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
    }
    return { rest: rest, lit: tinted(atlas, tile, CELL.flash), size: Math.max(1, x1 - x0 + 1, y1 - y0 + 1),
             dx: (x0 + x1 + 1 - WASH_TILE) / 2, dy: (y0 + y1 + 1 - WASH_TILE) / 2 };
  }

  function init() {
    var els = document.querySelectorAll(".publication-lightning");
    if (!els.length) return;
    // If either image fails, the card stays blank.
    Promise.all([load(ATLAS_SRC), load(WASH_SRC)]).then(function (r) {
      var cores = row(r[0], 0, CORE), glows = row(r[0], 1, GLOW), bodies = {};
      CELL_TILES.forEach(function (t) { bodies[t] = cellBody(r[1], t); });
      Array.prototype.forEach.call(els, function (el) { mount(el, cores, glows, bodies); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
