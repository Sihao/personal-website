// Abstract watercolour washes that flare like cells in a calcium recording.
//
// The field is a composition of watercolour blots in diagonal streams, with
// trails of dust behind them and jagged pencil lines over them, on a ground
// with a fine grain and soft, long streaks, like brushed paper. Each blot is
// a "cell" with its own calcium signal: calcium decays exponentially, and the
// rendered fluorescence is a saturating function of it, as with a GCaMP-type
// indicator. A fluorescent blot turns orange; its size never changes.
//
// Events come from four sources:
//   - spontaneous events in single blots,
//   - waves that start at one blot and spread outwards, recruiting each blot
//     with a probability that falls off with distance,
//   - a "stimulus" under the pointer that raises the local event rate,
//   - a wave evoked from each click or tap.
// The field rests as a still frame, part way through its activity. It
// comes alive only while the pointer is over it (or for a while after a
// tap, or, on a touch screen, while it is the drawing most in view; see
// site/static/js/in-view.js): events start, easing in. When the hover ends, events ease off and
// stop, the blots that are lit fade back as their calcium decays, and the
// field stops once all of them are dark. With reduced motion it stays a
// still frame and never moves.
//
// Elements marked data-sketch-clear (the logotype and the menu button in
// the see-through header over the field) keep the large light blots away:
// none is placed where its pigment would reach into one, padded by the
// attribute's value in px. Dark blots, dust and lines may pass behind
// them. An element marked data-sketch-over (the header's bar) lies over
// the top of the field, and sizes follow the height of the field below
// its min-height (the bar's own height; on the home page the element is
// taller, to hold the hanging logotype).
//
// The sprites come from /img/washes.webp (white, alpha = pigment density),
// painted ahead of time with p5.brush by tools/wash-atlas.html.
(function () {
  "use strict";

  // Atlas layout; keep in sync with tools/wash-atlas.html.
  var ATLAS_SRC = "/img/washes.webp";
  var TILE = 200;
  var COLS = 7;
  var BLOBS = 16;
  var SPRAYS = 4;
  var ZIGZAGS = 8;

  var BG = "#14213d";             // --prussian-blue
  var BG_RGB = [20, 33, 61];
  var ACTIVE = "#fca311";         // --orange
  // Resting colours of the blots, with their weights: alabaster, white,
  // black, and two tints of Prussian blue towards alabaster.
  var BLOT_COLOURS = [["#e5e5e5", 2], ["#ffffff", 2], ["#000000", 3], ["#8790a6", 2], ["#4d5874", 2]];
  // The light ones, kept away from the elements marked data-sketch-clear.
  var LIGHT = ["#e5e5e5", "#ffffff", "#8790a6"];
  var LINE_COLOURS = [["#e5e5e5", 3], ["#ffffff", 1], ["#000000", 2], ["#8790a6", 1]];

  var STREAKS = "horizontal";     // direction of the ground's streaks: "horizontal" or "vertical"
  var GRAIN = 3;                  // +/- levels of per-pixel grain, of 255
  var STREAK_DEPTH = 5;           // levels darker at the core of a streak

  var FLOW = 0.5;                 // rad, mean direction of the streams (down to the right)
  var STREAM_GAP = 38;            // px between streams, at a field height of 220 px
  var BLOT_SIZE = [42, 98];       // px, sprite size range, at a field height of 220 px
  var CLEARING = 0.35;            // noise level below which a stream has gaps
  var LINES_PER_100K = 9;         // zigzags per 100,000 px^2
  var DUST = 0.35;                // fraction of blots with a dust trail

  var RATE = 0.06;                // spontaneous events / s / blot
  var TAU_RISE = 0.07;            // s, indicator rise
  var TAU_DECAY = [0.35, 0.8];    // s, calcium decay, from small to large blots
  var WAVE_RATE = 0.05;           // spontaneous waves / s per 100,000 px^2
  var WAVE_SPEED = 220;           // px / s
  var WAVE_LAMBDA = 140;          // px, length constant of recruitment
  var STIM_RATE = 2.5;            // peak events / s / blot under the pointer
  var STIM_SIGMA = 70;            // px
  var EVOKED_LAMBDA = 120;        // px, recruitment by a click / tap wave
  var EVOKED_EVENTS = 1.5;        // calcium per recruited blot
  var K_D = 0.8;                  // indicator half-saturation
  var PREWARM = 3;                // s simulated before the first frame
  var TAP_HOLD = 2.5;             // s a tap keeps the field alive
  // How fast events ease in and off: the natural frequency (1/s) of a
  // critically damped spring on their rate. As in usv-card.js.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;

  function ramp(e0, e1, x) {
    var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  function tileOrigin(i) {
    return { x: (i % COLS) * TILE, y: Math.floor(i / COLS) * TILE };
  }

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // Copy of the atlas in a single colour, keeping its alpha.
  function tinted(src, colour) {
    var c = canvas(src.width, src.height);
    var ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Used if the painted atlas cannot be loaded: soft ellipses and plain
  // zigzags in the same tile layout.
  function fallbackAtlas() {
    var count = BLOBS + SPRAYS + ZIGZAGS;
    var c = canvas(COLS * TILE, Math.ceil(count / COLS) * TILE);
    var ctx = c.getContext("2d");
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    for (var i = 0; i < count; i++) {
      var o = tileOrigin(i);
      ctx.save();
      ctx.translate(o.x + TILE / 2, o.y + TILE / 2);
      if (i < BLOBS) {
        ctx.filter = "blur(4px)";
        ctx.beginPath();
        ctx.ellipse(0, 0, TILE * 0.28, TILE * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (i >= BLOBS + SPRAYS) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var k = 0; k <= 6; k++) ctx.lineTo(-TILE * 0.4 + k * TILE * 0.13, (k % 2 ? 1 : -1) * TILE * 0.08);
        ctx.stroke();
      }
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

  window.p5Sketches.washes = function (p, opts) {
    var el = opts.el;
    var dust = [];                // sprites drawn first
    var blots = [];               // the cells
    var lines = [];               // sprites drawn last
    var pending = [];             // scheduled events: {t, blot, amount}
    var t = 0;
    var pointerInside = false;
    var viewing = false;          // the one in view on a touch screen (in-view.js)
    var holdUntil = 0;            // ms, performance.now() until which a tap keeps it alive
    var drive = 0, driveV = 0;    // how strongly events arrive, 0 to 1, and its rate of change
    var atlas = null;
    var activeAtlas = null;
    var restLayer = null;         // p5.Graphics: background and resting sprites

    function weighted(list) {
      var total = list.reduce(function (s, c) { return s + c[1]; }, 0);
      var r = p.random(total);
      for (var i = 0; i < list.length; i++) {
        if ((r -= list[i][1]) < 0) return list[i][0];
      }
      return list[0][0];
    }

    // How far the sticky bar (data-sketch-over) is stuck below where it
    // sits at the top of the page: its header does not stick. A reload part
    // way down the page restores the scroll before the field lays out, so
    // the bar, and the elements in it, are measured where they sit.
    function stuck(over) {
      return over ? over.getBoundingClientRect().top - over.parentElement.getBoundingClientRect().top : 0;
    }

    // The parts of the field to keep clear, in field px: the boxes of the
    // elements marked data-sketch-clear, padded, where they sit with the
    // page at the top. Measured against the frame, not the canvas, which
    // the parallax header moves within it.
    function clearings(over) {
      var box = el.getBoundingClientRect();
      return Array.prototype.map.call(document.querySelectorAll("[data-sketch-clear]"), function (e) {
        var r = e.getBoundingClientRect(), pad = parseFloat(e.getAttribute("data-sketch-clear")) || 0;
        var dy = over && over.contains(e) ? stuck(over) : 0;
        return { x0: r.left - box.left - pad, y0: r.top - dy - box.top - pad,
                 x1: r.right - box.left + pad, y1: r.bottom - dy - box.top + pad };
      }).filter(function (z) { return z.x1 > 0 && z.y1 > 0 && z.x0 < p.width && z.y0 < p.height; });
    }

    // Whether pigment reaching `reach` px from (x, y) would fall in a clearing.
    function inClearing(zones, x, y, reach) {
      return zones.some(function (z) {
        return x + reach > z.x0 && x - reach < z.x1 && y + reach > z.y0 && y - reach < z.y1;
      });
    }

    // Streams run across the field at angle FLOW, spaced STREAM_GAP apart,
    // and bend gently with noise. Blots are strung along them with gaps
    // where the noise is low, so the field has clusters and clearings.
    function layout() {
      var w = p.width;
      var h = p.height;
      // A header over the top of the field leaves less of it to size by.
      var over = document.querySelector("[data-sketch-over]");
      var zones = clearings(over);
      var top = over ? Math.max(0, over.getBoundingClientRect().top - stuck(over) - el.getBoundingClientRect().top +
        (parseFloat(getComputedStyle(over).minHeight) || over.getBoundingClientRect().height)) : 0;
      var k = (Math.min(h, Math.max(h - top, 0.5 * h))) / 220;
      var gap = STREAM_GAP * k;
      var dx = Math.cos(FLOW);
      var dy = Math.sin(FLOW);
      var nx = -dy;
      var ny = dx;
      var reach = Math.hypot(w, h);
      var cx = w / 2;
      var cy = h / 2;
      var off, s, x, y, bend, a, size;

      dust = [];
      blots = [];
      lines = [];
      pending = [];
      p.noiseSeed(Math.floor(p.random(1e6)));
      for (off = -reach / 2; off <= reach / 2; off += gap * p.random(0.8, 1.2)) {
        for (s = -reach / 2; s <= reach / 2; ) {
          bend = (p.noise(off * 0.01, s * 0.004) - 0.5) * 1.2;
          a = FLOW + bend * 0.5;
          x = cx + nx * off + dx * s + nx * bend * gap;
          y = cy + ny * off + dy * s + ny * bend * gap;
          size = k * p.random(BLOT_SIZE[0], BLOT_SIZE[1]);
          s += size * p.random(0.3, 0.55);
          if (x < -size || x > w + size || y < -size || y > h + size) continue;
          if (p.noise(x * 0.009 + 50, y * 0.009) < CLEARING) continue;
          var colour = weighted(BLOT_COLOURS);
          if (LIGHT.indexOf(colour) >= 0 && inClearing(zones, x, y, 0.4 * size)) continue;
          var blot = {
            x: x + p.random(-0.15, 0.15) * gap,
            y: y + p.random(-0.15, 0.15) * gap,
            tile: Math.floor(p.random(BLOBS)),
            rot: a + p.random(-0.2, 0.2),
            flip: p.random() < 0.5 ? -1 : 1,
            size: size,
            colour: colour,
            alpha: p.random(0.55, 0.95),
            decay: TAU_DECAY[0] + (TAU_DECAY[1] - TAU_DECAY[0]) *
              (size / k - BLOT_SIZE[0]) / (BLOT_SIZE[1] - BLOT_SIZE[0]),
            c: 0,
            f: 0
          };
          blots.push(blot);
          if (p.random() < DUST) {
            dust.push({
              x: blot.x - dx * size * 0.5, y: blot.y - dy * size * 0.5,
              tile: BLOBS + Math.floor(p.random(SPRAYS)),
              rot: blot.rot, flip: 1, size: size * p.random(1.4, 2),
              colour: weighted(LINE_COLOURS), alpha: p.random(0.35, 0.7)
            });
          }
        }
      }
      // Larger blots underneath smaller ones.
      blots.sort(function (a, b) { return b.size - a.size; });

      var n = Math.round(LINES_PER_100K * w * h / 1e5);
      for (var i = 0; i < n; i++) {
        lines.push({
          x: p.random(w), y: p.random(h),
          tile: BLOBS + SPRAYS + Math.floor(p.random(ZIGZAGS)),
          rot: FLOW + p.random(-0.35, 0.35), flip: p.random() < 0.5 ? -1 : 1,
          size: k * p.random(40, 80),
          colour: weighted(LINE_COLOURS), alpha: p.random(0.35, 0.7)
        });
      }
    }

    function sprite(ctx, src, s, alpha) {
      var o = tileOrigin(s.tile);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(s.flip, 1);
      ctx.drawImage(src, o.x, o.y, TILE, TILE, -s.size / 2, -s.size / 2, s.size, s.size);
      ctx.restore();
    }

    // The ground, per device pixel: the background colour with a fine grain,
    // and soft, long streaks a few pixels wide that fade in and out along
    // their length. The streak field is sampled once per device pixel across
    // the streaks and every 8 CSS px along them, and interpolated.
    function ground(g) {
      var c = g.elt;
      var w = c.width;
      var h = c.height;
      var k = w / p.width;
      var horizontal = STREAKS === "horizontal";
      var across = horizontal ? h : w;
      var along = horizontal ? w : h;
      var step = 8 * k;
      var na = Math.ceil(along / step) + 2;
      var field = new Float32Array(across * na);
      var phase = p.random(1000);
      var i, j, u, v;
      for (i = 0; i < across; i++) {
        u = i / k;
        for (j = 0; j < na; j++) {
          v = j * step / k;
          // Fine streaks, faded in and out along their length, over
          // broader, fainter bands.
          field[i * na + j] = 0.75 * ramp(0.42, 0.66, p.noise(phase + u * 0.15, v * 0.004)) *
            ramp(0.25, 0.55, p.noise(phase + 50 + u * 0.02, v * 0.002)) +
            0.35 * ramp(0.4, 0.7, p.noise(phase + 90 + u * 0.04, v * 0.0015));
        }
      }
      var ctx = c.getContext("2d");
      var img = ctx.createImageData(w, h);
      var d = img.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var a = horizontal ? y : x;
          var f = (horizontal ? x : y) / step;
          var j0 = Math.floor(f);
          var t = f - j0;
          var streak = field[a * na + j0] * (1 - t) + field[a * na + j0 + 1] * t;
          var off = -STREAK_DEPTH * streak + (Math.random() * 2 - 1) * GRAIN;
          var o = 4 * (y * w + x);
          d[o] = BG_RGB[0] + off;
          d[o + 1] = BG_RGB[1] + off;
          d[o + 2] = BG_RGB[2] + off;
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // The resting composition. Each sprite is tinted through one scratch
    // tile, so no tinted copy of the whole atlas is kept per colour.
    function drawRestLayer() {
      if (!restLayer) {
        restLayer = p.createGraphics(p.width, p.height);
        restLayer.elt.setAttribute("aria-hidden", "true");
      } else {
        restLayer.resizeCanvas(p.width, p.height);
      }
      var ctx = restLayer.drawingContext;
      var scratch = canvas(TILE, TILE);
      var sctx = scratch.getContext("2d");
      ground(restLayer);
      ctx.save();
      dust.concat(blots, lines).forEach(function (s) {
        var o = tileOrigin(s.tile);
        sctx.globalCompositeOperation = "copy";
        sctx.drawImage(atlas, o.x, o.y, TILE, TILE, 0, 0, TILE, TILE);
        sctx.globalCompositeOperation = "source-in";
        sctx.fillStyle = s.colour;
        sctx.fillRect(0, 0, TILE, TILE);
        sprite(ctx, scratch, { x: s.x, y: s.y, rot: s.rot, flip: s.flip, size: s.size, tile: 0 }, s.alpha);
      });
      ctx.restore();
    }

    // Spreads a wave from (x, y): each blot joins with a probability that
    // falls off with distance, when the wave front reaches it.
    function wave(x, y, lambda, amount) {
      blots.forEach(function (b) {
        var d = Math.hypot(b.x - x, b.y - y);
        if (Math.random() < Math.exp(-d / lambda)) {
          pending.push({ t: t + d / WAVE_SPEED, blot: b, amount: amount });
        }
      });
    }

    function stimulusOn() {
      return pointerInside &&
        p.mouseX >= 0 && p.mouseX <= p.width &&
        p.mouseY >= 0 && p.mouseY <= p.height;
    }

    function step(dt) {
      var stim = stimulusOn();
      var k = 1 / (2 * STIM_SIGMA * STIM_SIGMA);
      var rise = 1 - Math.exp(-dt / TAU_RISE);

      t += dt;

      if (blots.length &&
          Math.random() < drive * WAVE_RATE * (p.width * p.height / 1e5) * dt) {
        var origin = blots[Math.floor(Math.random() * blots.length)];
        wave(origin.x, origin.y, WAVE_LAMBDA, 1);
      }

      pending = pending.filter(function (e) {
        if (e.t > t) return true;
        e.blot.c += e.amount;
        return false;
      });

      blots.forEach(function (b) {
        var rate = RATE;
        if (stim) {
          var d2 = (b.x - p.mouseX) * (b.x - p.mouseX) + (b.y - p.mouseY) * (b.y - p.mouseY);
          rate += STIM_RATE * Math.exp(-d2 * k);
        }
        rate *= drive;
        if (Math.random() < rate * dt) b.c += 1;
        b.c *= Math.exp(-dt / b.decay);
        b.f += (b.c / (b.c + K_D) - b.f) * rise;
      });
    }

    function alive() {
      return pointerInside || viewing || performance.now() < holdUntil;
    }

    // Moves the drive towards its target along a critically damped
    // spring, with its exact solution. As in usv-card.js.
    function spin(dt) {
      var target = alive() ? 1 : 0;
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

    // Runs the field for a while with events at full strength, for the
    // still frame it rests on.
    function prewarm() {
      var was = drive;
      drive = 1;
      for (var i = 0; i < PREWARM * 30; i++) step(1 / 30);
      drive = was;
    }

    p.setup = function () {
      p.createCanvas(el.clientWidth, el.clientHeight);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.canvas.style.display = "block";
      p.canvas.style.visibility = "hidden";
      p.canvas.setAttribute("aria-hidden", "true");
      el.style.backgroundColor = BG;
      if (!opts.reducedMotion) {
        el.addEventListener("pointerenter", function (e) {
          if (e.pointerType !== "mouse") return;
          pointerInside = true;
          p.loop();
        });
        el.addEventListener("pointerleave", function () { pointerInside = false; });
        // No hover on a touch screen: run while most in view.
        if (window.inView) window.inView.watch(el, function (on) {
          viewing = on;
          if (on) p.loop();
        });
        el.addEventListener("pointerdown", function (e) {
          // The canvas, not the frame: the parallax header moves the canvas within it.
          var rect = p.canvas.getBoundingClientRect();
          wave(e.clientX - rect.left, e.clientY - rect.top, EVOKED_LAMBDA, EVOKED_EVENTS);
          holdUntil = performance.now() + TAP_HOLD * 1000;
          p.loop();
        });
      }
      layout();
      prewarm();
      loadAtlas().then(function (img) {
        atlas = img;
        activeAtlas = tinted(img, ACTIVE);
        drawRestLayer();
        p.canvas.style.visibility = "visible";
        p.redraw();
      });
      p.noLoop();
    };

    p.draw = function () {
      if (!restLayer) return;
      // Small steps keep the briefest transients smooth at low frame rates.
      var looping = p.isLooping();
      if (looping && p.frameCount > 1) {
        var dt = Math.min(p.deltaTime / 1000, 0.1);
        spin(dt);
        var n = Math.ceil(dt / 0.02);
        for (var i = 0; i < n; i++) step(dt / n);
      }

      var ctx = p.drawingContext;
      p.image(restLayer, 0, 0, p.width, p.height);
      blots.forEach(function (b) {
        if (b.f >= 0.02) sprite(ctx, activeAtlas, b, Math.min(1, 1.4 * b.f));
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

      if (looping && !alive() && !drive && dark()) p.noLoop();
    };

    p.windowResized = function () {
      if (el.clientWidth === p.width && el.clientHeight === p.height) return;
      p.resizeCanvas(el.clientWidth, el.clientHeight);
      layout();
      prewarm();
      if (atlas) drawRestLayer();
      p.redraw();
    };
  };
})();
