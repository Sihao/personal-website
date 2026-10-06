// Two mice on white, in the manner of an ink painting: one calls, the other
// listens. Hovering over a mouse (or tapping it) makes it vocalise:
// bouts of ultrasonic vocalisation syllables appear around it, alternately
// above and below, as rows of spectrogram contours (time along x,
// frequency up) written out left to right, which drift away and fade.
//
// In a tall frame the mice are stacked, facing opposite ways and a little
// askew; in a wide frame they face each other across the middle.
//
// The syllables follow the usual classification of mouse USVs (flat, down,
// up, U-shaped, inverted U, complex, complex 2 to 5, harmonic and
// unclassified), weighted towards the complex types, and are stretched a
// little in time and frequency so that repeats differ.
//
// The mice and syllables come from /img/mice.webp (white, alpha = pigment
// density), painted ahead of time with p5.brush by tools/mouse-atlas.html.
(function () {
  "use strict";

  // Atlas layout; keep in sync with tools/mouse-atlas.html.
  var ATLAS_SRC = "/img/mice.webp";
  var MOUSE_W = 400;
  var MOUSE_H = 280;
  var MICE = 2;                   // caller, listener
  var LAYERS = 4;                 // base, wash, line, highlight
  var SYL = 128;
  var SYLLABLES = 12;
  // Relative frequency of each syllable type, in atlas order.
  var SYLLABLE_WEIGHTS = [1, 1, 1, 1, 1, 2, 2, 2, 1.5, 1.5, 1.5, 0.5];
  var STRETCH_T = [0.85, 1.2];    // range of time stretch of a syllable
  var STRETCH_F = [0.9, 1.1];     // range of frequency stretch

  var BG = "#ffffff";
  // Colour and opacity of each layer of a mouse: a pale warm-grey wash for
  // the body (so a white mouse still reads on white), ink wash, ink line,
  // and a lighter grey over the ink for the ears, eye ring and cheek.
  var LAYER_TINTS = [["#b9b1a4", 0.5], ["#1f1a14", 0.9], ["#14110d", 0.95], ["#d2cbc0", 0.75]];
  var USV_INK = "#14213d";        // --prussian-blue
  var USV_ALPHA = 0.85;

  var TALL = 1.4;                 // height / width above which the mice are stacked
  var TAP_HOLD = 2.5;             // s a tapped mouse keeps calling
  var BOUT_GAP = [0.5, 0.9];      // s of silence between bouts
  var SYL_INTERVAL = [0.1, 0.16]; // s between syllable onsets in a bout
  var SYL_SPACING = [0.85, 1.15]; // syllable pitch along a row, in syllable sizes
  var SYL_SIZE = 0.3;             // syllable size, as a fraction of mouse width
  var LIFE = 2.2;                 // s a syllable lasts
  var WRITE = 0.12;               // s to write a syllable out, left to right
  var DRIFT = 14;                 // px a row drifts away from the mouse

  // The mouse in its tile, for hit testing: an ellipse round body and ears,
  // in tile fractions (the mouse faces left in the tile).
  var HIT = { x: 0.5, y: 0.52, rx: 0.48, ry: 0.46 };

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function mouseTile(m, layer) { return { x: layer * MOUSE_W, y: m * MOUSE_H, w: MOUSE_W, h: MOUSE_H }; }
  function sylTile(i) { return { x: i * SYL, y: MICE * MOUSE_H, w: SYL, h: SYL }; }

  // Used if the painted atlas cannot be loaded: a pale mouse shape with a
  // dark eye, and plain contours, in the same layout.
  function fallbackAtlas() {
    var c = canvas(LAYERS * MOUSE_W, MICE * MOUSE_H + SYL);
    var ctx = c.getContext("2d");
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    for (var m = 0; m < MICE; m++) {
      var y = m * MOUSE_H;
      ctx.save();
      ctx.filter = "blur(4px)";
      ctx.beginPath();
      ctx.ellipse(220, y + 160, 160, 95, 0, 0, Math.PI * 2);
      ctx.ellipse(80, y + 175, 60, 45, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(2 * MOUSE_W + 65, y + 170, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3 * MOUSE_W + 70, y + 90, 26, 38, -0.2, 0, Math.PI * 2);
      ctx.ellipse(3 * MOUSE_W + 120, y + 80, 28, 48, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 3;
    for (var i = 0; i < SYLLABLES; i++) {
      var o = sylTile(i);
      ctx.beginPath();
      for (var k = 0; k <= 20; k++) {
        ctx.lineTo(o.x + 20 + k * 4.4, o.y + 100 - 60 * Math.sin(Math.PI * k / 20 * (1 + i % 3) / 2));
      }
      ctx.stroke();
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

  window.p5Sketches.mice = function (p, opts) {
    var el = opts.el;
    var mice = [];                // {x, y, w, rot, flip, tile, holdUntil, nextBout, side}
    var syllables = [];           // {x, y, dy, size, sx, sy, tile, born}
    var t = 0;
    var pointer = null;           // {x, y} while the pointer is over the frame
    var hovered = -1;
    var atlas = null;
    var inkAtlas = null;
    var restLayer = null;

    // Places the mice for the frame's shape.
    function layout() {
      var w = p.width;
      var h = p.height;
      if (h / w >= TALL) {
        var mw = Math.min(w * 0.92, h * 0.34);
        mice = [
          { x: w / 2, y: h * 0.3, w: mw, rot: -0.07, flip: 1 },
          { x: w / 2, y: h * 0.7, w: mw, rot: -0.1, flip: -1 }
        ];
      } else {
        var mw2 = Math.min(w * 0.4, h * 1.1);
        mice = [
          { x: w * 0.72, y: h * 0.48, w: mw2, rot: 0.08, flip: 1 },
          { x: w * 0.28, y: h * 0.55, w: mw2, rot: -0.1, flip: -1 }
        ];
      }
      mice.forEach(function (m, i) {
        m.tile = i;
        m.holdUntil = -1;
        m.nextBout = 0;
        m.side = 1;
      });
      syllables = [];
    }

    // Frame coordinates -> tile fractions of mouse m (the mouse faces left
    // in its tile).
    function toTile(m, x, y) {
      var dx = x - m.x, dy = y - m.y;
      var c = Math.cos(-m.rot), s = Math.sin(-m.rot);
      var lx = (dx * c - dy * s) * m.flip;
      var ly = dx * s + dy * c;
      var mh = m.w * MOUSE_H / MOUSE_W;
      return { u: 0.5 + lx / m.w, v: 0.5 + ly / mh };
    }

    function hitTest(x, y) {
      for (var i = 0; i < mice.length; i++) {
        var q = toTile(mice[i], x, y);
        var du = (q.u - HIT.x) / HIT.rx, dv = (q.v - HIT.y) / HIT.ry;
        if (du * du + dv * dv <= 1) return i;
      }
      return -1;
    }

    function drawMouse(ctx, src, m, tile, alpha) {
      var mh = m.w * MOUSE_H / MOUSE_W;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      ctx.scale(m.flip, 1);
      ctx.drawImage(src, tile.x, tile.y, tile.w, tile.h, -m.w / 2, -mh / 2, m.w, mh);
      ctx.restore();
    }

    // The background and the mice, each layer tinted through one scratch
    // tile.
    function drawRestLayer() {
      if (!restLayer) restLayer = p.createGraphics(p.width, p.height);
      else restLayer.resizeCanvas(p.width, p.height);
      var ctx = restLayer.drawingContext;
      var scratch = canvas(MOUSE_W, MOUSE_H);
      var sctx = scratch.getContext("2d");
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, p.width, p.height);
      mice.forEach(function (m) {
        for (var l = 0; l < LAYERS; l++) {
          var tile = mouseTile(m.tile, l);
          sctx.globalCompositeOperation = "copy";
          sctx.drawImage(atlas, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
          sctx.globalCompositeOperation = "source-in";
          sctx.fillStyle = LAYER_TINTS[l][0];
          sctx.fillRect(0, 0, tile.w, tile.h);
          drawMouse(ctx, scratch, m, { x: 0, y: 0, w: tile.w, h: tile.h }, LAYER_TINTS[l][1]);
        }
      });
    }

    // Copy of the syllable row of the atlas in ink.
    function inkSyllables(src) {
      var c = canvas(SYLLABLES * SYL, SYL);
      var ctx = c.getContext("2d");
      ctx.drawImage(src, 0, MICE * MOUSE_H, SYLLABLES * SYL, SYL, 0, 0, SYLLABLES * SYL, SYL);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = USV_INK;
      ctx.fillRect(0, 0, c.width, c.height);
      return c;
    }

    function syllableType() {
      var total = SYLLABLE_WEIGHTS.reduce(function (a, b) { return a + b; }, 0);
      var r = p.random(total);
      for (var i = 0; i < SYLLABLES; i++) {
        if ((r -= SYLLABLE_WEIGHTS[i]) < 0) return i;
      }
      return 0;
    }

    // A bout from mouse i: a row of syllables just above or below it (the
    // other side from its last bout, if that fits in the frame), across
    // the width of the mouse, with onsets in sequence from left to right.
    // Returns the time the bout ends.
    function bout(i) {
      var m = mice[i];
      var mh = m.w * MOUSE_H / MOUSE_W;
      var size = m.w * SYL_SIZE;
      var reach = mh * 0.5 + size * 0.55;
      var fits = function (side) {
        var y = m.y + side * reach;
        return y - size / 2 >= 0 && y + size / 2 <= p.height;
      };
      var side = -m.side;
      if (!fits(side)) side = -side;
      if (!fits(side)) return t;
      m.side = side;
      var y = m.y + side * reach;
      var x0 = Math.max(size / 2, m.x - m.w * 0.6);
      var x1 = Math.min(p.width - size / 2, m.x + m.w * 0.6);
      var onset = t;
      var x = x0 + p.random(0, size * 0.3);
      while (x <= x1) {
        var sx = p.random(STRETCH_T[0], STRETCH_T[1]);
        syllables.push({
          x: x, y: y, dy: side, size: size, sx: sx, sy: p.random(STRETCH_F[0], STRETCH_F[1]),
          tile: syllableType(), born: onset
        });
        x += size * sx * p.random(SYL_SPACING[0], SYL_SPACING[1]);
        onset += p.random(SYL_INTERVAL[0], SYL_INTERVAL[1]);
      }
      return onset;
    }

    function calling(i) {
      return i === hovered || t < mice[i].holdUntil;
    }

    function step(dt) {
      t += dt;
      for (var i = 0; i < mice.length; i++) {
        if (calling(i) && t >= mice[i].nextBout) {
          mice[i].nextBout = bout(i) + p.random(BOUT_GAP[0], BOUT_GAP[1]);
        }
      }
      syllables = syllables.filter(function (s) { return t - s.born < LIFE; });
    }

    function idle() {
      return syllables.length === 0 && mice.every(function (m, i) { return !calling(i); });
    }

    function updateHover() {
      var h = pointer ? hitTest(pointer.x, pointer.y) : -1;
      if (h !== hovered) {
        hovered = h;
        el.style.cursor = h >= 0 ? "pointer" : "";
        if (h >= 0) p.loop();
      }
    }

    function local(e) {
      var rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    p.setup = function () {
      p.createCanvas(el.clientWidth, el.clientHeight);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.canvas.style.display = "block";
      p.canvas.style.visibility = "hidden";
      p.canvas.setAttribute("aria-hidden", "true");
      el.style.backgroundColor = BG;
      el.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        pointer = local(e);
        updateHover();
      });
      el.addEventListener("pointerleave", function () {
        pointer = null;
        updateHover();
      });
      // Taps (and clicks) set the mouse calling for a while.
      el.addEventListener("pointerdown", function (e) {
        var q = local(e);
        var i = hitTest(q.x, q.y);
        if (i < 0) return;
        mice[i].holdUntil = t + TAP_HOLD;
        p.loop();
      });
      layout();
      loadAtlas().then(function (img) {
        atlas = img;
        inkAtlas = inkSyllables(img);
        drawRestLayer();
        p.canvas.style.visibility = "visible";
        p.redraw();
      });
      p.noLoop();
    };

    p.draw = function () {
      if (!restLayer) return;
      if (p.isLooping()) step(Math.min(p.deltaTime / 1000, 0.1));

      var ctx = p.drawingContext;
      p.image(restLayer, 0, 0, p.width, p.height);
      syllables.forEach(function (s) {
        var age = t - s.born;
        if (age < 0) return;
        var alpha = USV_ALPHA * Math.min(1, age / 0.12) * Math.exp(-Math.max(0, age - 0.5) / 0.45);
        var written = opts.reducedMotion ? 1 : Math.min(1, age / WRITE);
        var drift = opts.reducedMotion ? 0 : DRIFT * age / LIFE;
        var w = s.size * s.sx;
        var h = s.size * s.sy;
        var x = s.x - w / 2;
        var y = s.y + s.dy * drift - h / 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(inkAtlas, s.tile * SYL, 0, SYL * written, SYL, x, y, w * written, h);
        ctx.restore();
      });

      if (idle()) p.noLoop();
    };

    p.windowResized = function () {
      if (el.clientWidth === p.width && el.clientHeight === p.height) return;
      p.resizeCanvas(el.clientWidth, el.clientHeight);
      layout();
      if (atlas) drawRestLayer();
      p.redraw();
    };
  };
})();
