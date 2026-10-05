// Watercolor astrocytes, driven by a simulated calcium-imaging model.
//
// Each astrocyte integrates calcium events into a signal that decays
// exponentially; the rendered fluorescence is a saturating function of that
// signal, as with a GCaMP-type indicator. Events come from four sources:
//   - spontaneous events in single cells,
//   - intercellular calcium waves that start at one cell and spread to its
//     neighbours, recruiting fewer cells with distance,
//   - a "stimulus" under the pointer that raises the local event rate,
//   - a wave evoked from each click or tap.
// When the visitor prefers reduced motion, spontaneous activity is off: the
// field starts as a still frame and only moves in response to the pointer.
//
// The cells are sprites from /img/astrocytes.webp, painted ahead of time with
// p5.brush by tools/astrocyte-atlas.html: white, with alpha = pigment
// density. Activity changes only a cell's colour, never its size.
(function () {
  "use strict";

  // Atlas layout; keep in sync with tools/astrocyte-atlas.html.
  var ATLAS_SRC = "/img/astrocytes.webp";
  var CELL = 320;
  var COLS = 4;
  var ASTROCYTES = 6;
  var NEUROPIL = 2;

  var BG = "#14213d";             // --prussian-blue
  var REST = "#e5e5e5";           // --alabaster-grey
  var ACTIVE = "#fca311";         // --orange
  var REST_ALPHA = 0.42;
  var NEUROPIL_ALPHA = 0.1;

  var SPACING = 170;              // px between astrocyte centres
  var SPRITE = 1.3;               // sprite size, in units of SPACING
  var STAGGER = 0.2;              // vertical offset of alternate cells, in units of SPACING
  var NEUROPIL_SPACING = 110;     // px
  var BASAL_RATE = 0.03;          // events / s / cell
  var WAVE_RATE = 0.05;           // spontaneous waves / s per 100,000 px^2
  var WAVE_SPEED = 120;           // px / s
  var WAVE_LAMBDA = 220;          // px, length constant of recruitment
  var STIM_RATE = 3;              // peak events / s under the pointer
  var STIM_SIGMA = 70;            // px
  var EVOKED_LAMBDA = 180;        // px, recruitment by a click / tap wave
  var EVOKED_EVENTS = 1.5;        // calcium per recruited cell
  var TAU_DECAY = 2.0;            // s, calcium decay
  var TAU_RISE = 0.35;            // s, indicator rise
  var K_D = 0.8;                  // indicator half-saturation
  var PREWARM = 6;                // s simulated before the first frame

  function cellOrigin(i) {
    return { x: (i % COLS) * CELL, y: Math.floor(i / COLS) * CELL };
  }

  // Copy of the atlas in a single colour, keeping its alpha.
  function tinted(src, colour) {
    var c = document.createElement("canvas");
    var ctx = c.getContext("2d");
    c.width = src.width;
    c.height = src.height;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Used if the painted atlas cannot be loaded: blurred stars.
  function fallbackAtlas() {
    var rows = Math.ceil((ASTROCYTES + NEUROPIL) / COLS);
    var c = document.createElement("canvas");
    var ctx = c.getContext("2d");
    var i, k, o, a;
    c.width = COLS * CELL;
    c.height = rows * CELL;
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    ctx.filter = "blur(3px)";
    ctx.lineCap = "round";
    for (i = 0; i < ASTROCYTES; i++) {
      o = cellOrigin(i);
      ctx.save();
      ctx.translate(o.x + CELL / 2, o.y + CELL / 2);
      for (k = 0; k < 8; k++) {
        a = (k / 8) * Math.PI * 2 + i;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = CELL * 0.04;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * CELL * 0.35, Math.sin(a) * CELL * 0.35);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, CELL * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return c;
  }

  function loadAtlas() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        console.warn("could not load " + ATLAS_SRC + "; using plain shapes");
        resolve(fallbackAtlas());
      };
      img.src = ATLAS_SRC;
    });
  }

  window.p5Sketches = window.p5Sketches || {};

  window.p5Sketches.astrocytes = function (p, opts) {
    var el = opts.el;
    var cells = [];
    var neuropil = [];
    var pending = [];             // scheduled events: {t, cell, amount}
    var t = 0;
    var pointerInside = false;
    var restAtlas = null;
    var activeAtlas = null;
    var restLayer = null;         // p5.Graphics: background, neuropil, resting cells

    function layout() {
      var w = p.width;
      var h = p.height;
      var rowStep = SPACING * 0.87;
      var rows = Math.max(1, Math.round(h / rowStep));
      var y0 = (h - (rows - 1) * rowStep) / 2;
      var r, i, x, y;

      // Staggered rows, extending past the edges so cells are cropped by the
      // field of view rather than missing from it.
      cells = [];
      pending = [];
      for (r = 0; r < rows; r++) {
        for (i = 0, x = (r % 2 ? SPACING / 2 : 0); x < w + SPACING / 2; i++, x += SPACING) {
          cells.push({
            x: x + p.random(-0.08, 0.08) * SPACING,
            y: y0 + r * rowStep + (i % 2 ? 1 : -1) * STAGGER * SPACING + p.random(-0.05, 0.05) * SPACING,
            sprite: Math.floor(p.random(ASTROCYTES)),
            rot: p.random(p.TWO_PI),
            flip: p.random() < 0.5 ? -1 : 1,
            size: SPACING * SPRITE * p.random(0.85, 1.1),
            c: 0,
            f: 0
          });
        }
      }

      neuropil = [];
      for (y = 0; y < h + NEUROPIL_SPACING; y += NEUROPIL_SPACING) {
        for (x = 0; x < w + NEUROPIL_SPACING; x += NEUROPIL_SPACING) {
          neuropil.push({
            x: x + p.random(-0.4, 0.4) * NEUROPIL_SPACING,
            y: y + p.random(-0.4, 0.4) * NEUROPIL_SPACING,
            sprite: ASTROCYTES + Math.floor(p.random(NEUROPIL)),
            rot: p.random(p.TWO_PI),
            flip: 1,
            size: NEUROPIL_SPACING * 1.6
          });
        }
      }
    }

    function sprite(ctx, src, s, alpha) {
      var o = cellOrigin(s.sprite);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(s.flip, 1);
      ctx.drawImage(src, o.x, o.y, CELL, CELL, -s.size / 2, -s.size / 2, s.size, s.size);
      ctx.restore();
    }

    function drawRestLayer() {
      if (!restLayer) restLayer = p.createGraphics(p.width, p.height);
      else restLayer.resizeCanvas(p.width, p.height);
      var ctx = restLayer.drawingContext;
      ctx.save();
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, p.width, p.height);
      neuropil.forEach(function (s) { sprite(ctx, restAtlas, s, NEUROPIL_ALPHA); });
      cells.forEach(function (s) { sprite(ctx, restAtlas, s, REST_ALPHA); });
      ctx.restore();
    }

    // Spreads a wave from (x, y): each cell joins with a probability that
    // falls off with distance. Cells whose territory contains (x, y) join at
    // once; the others when the wave front reaches their territory.
    function wave(x, y, lambda, amount) {
      var territory = SPACING / 2;
      cells.forEach(function (c) {
        var d = Math.hypot(c.x - x, c.y - y);
        if (d < territory || Math.random() < Math.exp(-d / lambda)) {
          pending.push({ t: t + Math.max(0, d - territory) / WAVE_SPEED, cell: c, amount: amount });
        }
      });
    }

    function stimulusOn() {
      return pointerInside &&
        p.mouseX >= 0 && p.mouseX <= p.width &&
        p.mouseY >= 0 && p.mouseY <= p.height;
    }

    function settled() {
      return !pointerInside && pending.length === 0 &&
        cells.every(function (c) { return c.f < 0.01; });
    }

    function step(dt) {
      var decay = Math.exp(-dt / TAU_DECAY);
      var rise = 1 - Math.exp(-dt / TAU_RISE);
      var stim = stimulusOn();
      var k = 1 / (2 * STIM_SIGMA * STIM_SIGMA);

      t += dt;

      if (!opts.reducedMotion && cells.length &&
          Math.random() < WAVE_RATE * (p.width * p.height / 1e5) * dt) {
        var origin = cells[Math.floor(Math.random() * cells.length)];
        wave(origin.x, origin.y, WAVE_LAMBDA, 1);
      }

      pending = pending.filter(function (e) {
        if (e.t > t) return true;
        e.cell.c += e.amount;
        return false;
      });

      cells.forEach(function (c) {
        var rate = opts.reducedMotion ? 0 : BASAL_RATE;
        if (stim) {
          var d2 = (c.x - p.mouseX) * (c.x - p.mouseX) + (c.y - p.mouseY) * (c.y - p.mouseY);
          rate += STIM_RATE * Math.exp(-d2 * k);
        }
        if (Math.random() < rate * dt) c.c += 1;
        c.c *= decay;
        c.f += (c.c / (c.c + K_D) - c.f) * rise;
      });
    }

    function prewarm() {
      for (var i = 0; i < PREWARM * 20; i++) step(1 / 20);
    }

    p.setup = function () {
      p.createCanvas(el.clientWidth, el.clientHeight);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.canvas.style.display = "block";
      p.canvas.style.visibility = "hidden";
      p.canvas.setAttribute("aria-hidden", "true");
      el.style.backgroundColor = BG;
      el.addEventListener("pointerenter", function () {
        pointerInside = true;
        if (opts.reducedMotion) p.loop();
      });
      el.addEventListener("pointerleave", function () { pointerInside = false; });
      el.addEventListener("pointerdown", function (e) {
        var rect = el.getBoundingClientRect();
        wave(e.clientX - rect.left, e.clientY - rect.top, EVOKED_LAMBDA, EVOKED_EVENTS);
        if (opts.reducedMotion) p.loop();
      });
      layout();
      prewarm();
      loadAtlas().then(function (atlas) {
        restAtlas = tinted(atlas, REST);
        activeAtlas = tinted(atlas, ACTIVE);
        drawRestLayer();
        p.canvas.style.visibility = "visible";
        p.redraw();
      });
      if (opts.reducedMotion) p.noLoop();
    };

    p.draw = function () {
      if (!restLayer) return;
      if (p.frameCount > 1) step(Math.min(p.deltaTime / 1000, 0.05));

      var ctx = p.drawingContext;
      p.image(restLayer, 0, 0, p.width, p.height);
      cells.forEach(function (c) {
        if (c.f >= 0.02) sprite(ctx, activeAtlas, c, c.f);
      });

      if (stimulusOn()) {
        ctx.save();
        ctx.strokeStyle = ACTIVE;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.mouseX, p.mouseY, STIM_SIGMA, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (opts.reducedMotion && settled()) p.noLoop();
    };

    p.windowResized = function () {
      if (el.clientWidth === p.width && el.clientHeight === p.height) return;
      p.resizeCanvas(el.clientWidth, el.clientHeight);
      layout();
      prewarm();
      if (restAtlas) drawRestLayer();
      if (opts.reducedMotion) p.redraw();
    };
  };
})();
