// Two abstract mice on white, in the manner of an ink painting, dark grey
// silhouettes with a fan of whiskers: one calls, the other
// listens. Hovering over a mouse (or tapping it) makes it vocalise: bouts
// of ultrasonic vocalisation syllables, as spectrogram contours (time
// along x, frequency up), leave its snout and travel along a curve to the
// other mouse's ear, fading as they arrive. Each syllable is written out
// left to right as it leaves.
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
  // Colour, opacity and number of passes of each layer of a mouse, all
  // dark grey: the silhouette (laid twice, as its pigment is thin), darker
  // pools, whiskers and dust, and lighter blooms.
  var LAYER_TINTS = [["#2f2f31", 1, 2], ["#151517", 0.5, 1], ["#202022", 0.9, 1], ["#6a6a6c", 0.3, 1]];
  // Inks of the syllables, with their weights: Prussian blue, and a tint of
  // it towards alabaster.
  var USV_INKS = [["#14213d", 3], ["#4d5874", 2]];
  var USV_ALPHA = 0.8;

  var TALL = 1.4;                 // height / width above which the mice are stacked
  var TAP_HOLD = 2.5;             // s a tapped mouse keeps calling
  var BOUT = [3, 6];              // syllables in a bout
  var BOUT_GAP = [0.6, 1.0];      // s of silence between bouts
  var SYL_INTERVAL = [0.28, 0.42]; // s between syllable onsets in a bout
  var SYL_SIZE = 0.3;             // syllable size, as a fraction of mouse width
  var TRAVEL = 2.6;               // s for a syllable to reach the other mouse
  var SPREAD = 0.35;              // sideways scatter off the path, in syllable sizes
  var LIFE = 2.2;                 // s a syllable lasts when it does not move (reduced motion)
  var WRITE = 0.12;               // s to write a syllable out, left to right

  // Where a syllable leaves and arrives, in tile fractions (the mouse
  // faces left in its tile): just in front of the snout, and the near ear.
  var SNOUT = { u: 0.08, v: 0.68 };
  var EAR = { u: 0.3, v: 0.3 };

  // The mouse in its tile, for hit testing: an ellipse round body and ears,
  // in tile fractions (the mouse faces left in the tile).
  var HIT = { x: 0.53, y: 0.52, rx: 0.47, ry: 0.46 };

  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function mouseTile(m, layer) { return { x: layer * MOUSE_W, y: m * MOUSE_H, w: MOUSE_W, h: MOUSE_H }; }
  function sylTile(i) { return { x: i * SYL, y: MICE * MOUSE_H, w: SYL, h: SYL }; }

  // Used if the painted atlas cannot be loaded: a soft mouse silhouette
  // and plain contours, in the same layout.
  function fallbackAtlas() {
    var c = canvas(LAYERS * MOUSE_W, MICE * MOUSE_H + SYL);
    var ctx = c.getContext("2d");
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    for (var m = 0; m < MICE; m++) {
      var y = m * MOUSE_H;
      ctx.save();
      ctx.filter = "blur(4px)";
      ctx.beginPath();
      ctx.ellipse(235, y + 160, 155, 95, 0, 0, Math.PI * 2);
      ctx.ellipse(95, y + 175, 60, 45, -0.3, 0, Math.PI * 2);
      ctx.ellipse(85, y + 95, 26, 38, -0.2, 0, Math.PI * 2);
      ctx.ellipse(135, y + 85, 28, 48, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
    var mice = [];                // {x, y, w, rot, flip, tile, holdUntil, nextBout}
    var syllables = [];           // {path, size, sx, sy, off, travel, still, tile, ink, born}
    var t = 0;
    var pointer = null;           // {x, y} while the pointer is over the frame
    var hovered = -1;
    var atlas = null;
    var inkAtlases = [];
    var restLayer = null;
    var paths = [];               // [caller -> listener, listener -> caller]
    var bow = 0;                  // px, how far the paths arch upwards

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
        bow = 0;
      } else {
        var mw2 = Math.min(w * 0.4, h * 1.1);
        mice = [
          { x: w * 0.72, y: h * 0.48, w: mw2, rot: 0.08, flip: 1 },
          { x: w * 0.28, y: h * 0.55, w: mw2, rot: -0.1, flip: -1 }
        ];
        // Face to face, the paths arch over the gap between the mice.
        bow = -0.45 * h;
      }
      mice.forEach(function (m, i) {
        m.tile = i;
        m.holdUntil = -1;
        m.nextBout = 0;
      });
      syllables = [];
      paths = [path(0, 1), path(1, 0)];
    }

    // Tile fractions of mouse m -> frame coordinates.
    function fromTile(m, u, v) {
      var mh = m.w * MOUSE_H / MOUSE_W;
      var lx = (u - 0.5) * m.w * m.flip, ly = (v - 0.5) * mh;
      var c = Math.cos(m.rot), s = Math.sin(m.rot);
      return { x: m.x + lx * c - ly * s, y: m.y + lx * s + ly * c };
    }

    // Unit vector the way mouse m faces.
    function facing(m) {
      return { x: -m.flip * Math.cos(m.rot), y: -m.flip * Math.sin(m.rot) };
    }

    // A cubic Bezier from the snout of mouse a to the ear of mouse b. It
    // leaves the snout in the direction a faces and comes into the ear
    // from in front of b's head; control points stay inside the frame.
    function path(a, b) {
      var ma = mice[a], mb = mice[b];
      var p0 = fromTile(ma, SNOUT.u, SNOUT.v);
      var p3 = fromTile(mb, EAR.u, EAR.v);
      var fa = facing(ma), fb = facing(mb);
      var len = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      var margin = ma.w * SYL_SIZE * 0.6;
      function inside(q) {
        return {
          x: Math.min(p.width - margin, Math.max(margin, q.x)),
          y: Math.min(p.height - margin, Math.max(margin, q.y))
        };
      }
      return [p0,
        inside({ x: p0.x + fa.x * len * 0.45, y: p0.y + fa.y * len * 0.45 + bow }),
        inside({ x: p3.x + fb.x * len * 0.45, y: p3.y + fb.y * len * 0.45 + bow }),
        p3];
    }

    // Point and unit normal on a path at q in 0..1.
    function along(c, q) {
      var r = 1 - q;
      var a = r * r * r, b = 3 * r * r * q, d = 3 * r * q * q, e = q * q * q;
      var x = a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x;
      var y = a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y;
      var tx = 3 * r * r * (c[1].x - c[0].x) + 6 * r * q * (c[2].x - c[1].x) + 3 * q * q * (c[3].x - c[2].x);
      var ty = 3 * r * r * (c[1].y - c[0].y) + 6 * r * q * (c[2].y - c[1].y) + 3 * q * q * (c[3].y - c[2].y);
      var len = Math.hypot(tx, ty) || 1;
      return { x: x, y: y, nx: -ty / len, ny: tx / len };
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
          for (var pass = 0; pass < LAYER_TINTS[l][2]; pass++) {
            drawMouse(ctx, scratch, m, { x: 0, y: 0, w: tile.w, h: tile.h }, LAYER_TINTS[l][1]);
          }
        }
      });
    }

    // Copy of the syllable row of the atlas in one ink.
    function inkSyllables(src, ink) {
      var c = canvas(SYLLABLES * SYL, SYL);
      var ctx = c.getContext("2d");
      ctx.drawImage(src, 0, MICE * MOUSE_H, SYLLABLES * SYL, SYL, 0, 0, SYLLABLES * SYL, SYL);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, c.width, c.height);
      return c;
    }

    // Index drawn from a list of weights.
    function weighted(weights) {
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = p.random(total);
      for (var i = 0; i < weights.length; i++) {
        if ((r -= weights[i]) < 0) return i;
      }
      return 0;
    }

    // A bout from mouse i: a few syllables, one after another, along its
    // path to the other mouse. Returns the time the bout ends.
    function bout(i) {
      var m = mice[i];
      var size = m.w * SYL_SIZE;
      var n = Math.floor(p.random(BOUT[0], BOUT[1] + 1));
      var onset = t;
      for (var k = 0; k < n; k++) {
        syllables.push({
          path: i, size: size,
          sx: p.random(STRETCH_T[0], STRETCH_T[1]), sy: p.random(STRETCH_F[0], STRETCH_F[1]),
          off: p.random(-SPREAD, SPREAD) * size,
          travel: TRAVEL * p.random(0.9, 1.1),
          // Where a still syllable sits on the path, with reduced motion.
          still: (k + 1) / (n + 1),
          tile: weighted(SYLLABLE_WEIGHTS),
          ink: weighted(USV_INKS.map(function (c) { return c[1]; })),
          born: onset
        });
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
      syllables = syllables.filter(function (s) {
        return t - s.born < (opts.reducedMotion ? LIFE : s.travel);
      });
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
        inkAtlases = USV_INKS.map(function (c) { return inkSyllables(img, c[0]); });
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
        var q, alpha, written;
        if (opts.reducedMotion) {
          q = s.still;
          alpha = Math.min(1, age / 0.12) * Math.exp(-Math.max(0, age - 0.8) / 0.5);
          written = 1;
        } else {
          // Eased along the path; fades in as it leaves and out as it arrives.
          var f = age / s.travel;
          q = f * f * (3 - 2 * f) * 0.85 + f * 0.15;
          alpha = Math.min(1, f / 0.08) * Math.min(1, (1 - f) / 0.3);
          written = Math.min(1, age / WRITE);
        }
        var at = along(paths[s.path], q);
        // A little smaller as it leaves, full size on arrival.
        var grow = 0.8 + 0.2 * q;
        var w = s.size * s.sx * grow;
        var h = s.size * s.sy * grow;
        var x = at.x + at.nx * s.off - w / 2;
        var y = at.y + at.ny * s.off - h / 2;
        ctx.save();
        ctx.globalAlpha = USV_ALPHA * alpha;
        ctx.drawImage(inkAtlases[s.ink], s.tile * SYL, 0, SYL * written, SYL, x, y, w * written, h);
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
