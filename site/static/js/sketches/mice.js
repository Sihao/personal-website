// Two abstract mice on white, in the manner of an ink painting, dark grey
// silhouettes with a fan of whiskers: one calls, the other
// listens. Hovering over a mouse (or tapping it) makes it call: a steady
// stream of ultrasonic vocalisation syllables, as spectrogram contours
// (time along x, frequency up), leaves its snout and travels along a
// smooth, winding path to the other mouse's ear. The stream matches the
// one on the publication cards (usv-card.js): the syllables grow and fan
// out a little as they go, slow towards the end and fade out as they
// near the other mouse, gone before they reach it. Each syllable flicks
// the caller's ears as it leaves, and they settle back with a slow, soft
// twitch: each ear is turned about its base by a small warp of the
// painted mouse that fades out towards the head, so it shows no seam.
// At rest the mice sit still with no syllables; a stream runs only while
// its mouse calls. With reduced motion the sketch is a still frame of the
// caller's stream in full flow and never moves. A call has inertia,
// as on the cards: it gathers speed when a mouse starts calling, and when
// the call ends it runs down to a stop, all of it slowing together, as a
// tape does, and fades out as it goes.
//
// In a tall frame the mice are stacked, facing opposite ways and a little
// askew; in a wide frame they face each other across the middle.
//
// The syllables follow the usual classification of mouse USVs (flat, down,
// up, U-shaped, inverted U, complex, complex 2 to 5, harmonic and
// unclassified), weighted towards the complex types.
//
// The mice and syllables come from /img/mice.webp (white, alpha = pigment
// density), painted ahead of time with p5.brush by tools/mouse-atlas.html.
//
// A variant (data-p5-variant on the frame) puts another caller in the
// first mouse's place: "computer" is a cartoon computer with mouse ears,
// from /img/computer.webp (tools/computer-atlas.html), for synthetic
// vocalisations.
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

  var BG = "#ffffff";
  // Colour, opacity and number of passes of each layer of a mouse, all
  // dark grey: the silhouette (laid twice, as its pigment is thin), darker
  // pools, whiskers and dust, and lighter blooms.
  var LAYER_TINTS = [["#2f2f31", 1, 2], ["#151517", 0.5, 1], ["#202022", 0.9, 1], ["#6a6a6c", 0.3, 1]];
  // Inks of the syllables, with their weights: the theme orange, and a
  // deeper shade of it.
  var USV_INKS = [["#fca311", 3], ["#d98a06", 2]];

  var TALL = 1.4;                 // height / width above which the mice are stacked
  var TAP_HOLD = 2.5;             // s a tapped mouse keeps calling
  // The stream; keep in sync with usv-card.js. The path is a sine wave
  // along the line from the snout to the ear, whose amplitude shrinks
  // until its heading swings by at most MAX_TURN, so it never knots, and
  // until it stays inside the frame. It leaves the snout and enters the
  // ear along that line.
  var INTERVAL = [0.35, 0.6];     // s between syllables
  var SPEED = 87;                 // px/s along the path, on average
  var END_SPEED = 0.4;            // speed at the ear, as a fraction of the speed at the snout
  var SIZE = [0.2, 0.72];         // syllable size at the snout and at the ear, in mouse widths
  var FAN = 0.1;                  // sideways spread at the ear, in mouse widths
  var ALPHA = 0.95;
  var GONE = 0.8;                 // fraction of the path by which a syllable has faded out, before the ear
  var FADE_OUT = 0.7;             // s for a stream to fade out once its mouse stops calling
  var MAX_TURN = 60;              // degrees
  var HALF_WAVE = 150;            // px along the line per bend, roughly
  // How fast a call gathers speed and runs down: the natural frequency
  // (1/s) of a critically damped spring on its speed.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;

  // Where a syllable leaves and arrives, in tile fractions (the mouse
  // faces left in its tile): just in front of the snout, and the near ear.
  // One for each mouse.
  var SNOUT = [{ u: 0.08, v: 0.68 }, { u: 0.08, v: 0.68 }];
  var EAR = [{ u: 0.3, v: 0.3 }, { u: 0.3, v: 0.3 }];

  // The ears of each mouse, in tile px (400 x 280, facing left): the
  // ellipse that holds each ear and the pivot at its base. The warp turns
  // an ear fully inside its ellipse and fades to nothing at EAR_FADE times
  // its radii. The listener's ears are pricked, so they sit differently.
  var EARS = [
    [{ c: [66, 86], r: [26, 36], pivot: [90, 122] },    // caller: near ear
     { c: [120, 70], r: [27, 45], pivot: [128, 120] }], //         far ear
    [{ c: [64, 86], r: [30, 34], pivot: [92, 120] },    // listener: near ear
     { c: [120, 62], r: [30, 46], pivot: [130, 115] }]  //           far ear
  ];
  var EAR_FADE = 1.6;
  // Each ear is a damped spring in its angle. Keep in sync with
  // usv-card.js.
  var EAR_HZ = 1.8;
  var EAR_DAMPING = 0.35;
  var EAR_KICK = 0.07;            // rad, about the largest turn of one flick
  var EAR_LAG = 0.08;             // s the far ear follows the near one

  // The mouse in its tile, for hit testing: an ellipse round body and ears,
  // in tile fractions (the mouse faces left in the tile). One for each mouse.
  var HIT = [{ x: 0.53, y: 0.52, rx: 0.47, ry: 0.46 }, { x: 0.53, y: 0.52, rx: 0.47, ry: 0.46 }];

  // Callers that take the first mouse's place, each from an atlas in the
  // layout of one mouse row of mice.webp, with its own mouth, ears and
  // outline. Keep in sync with tools/computer-atlas.html.
  var VARIANTS = {
    computer: {
      src: "/img/computer.webp",
      snout: { u: 0.196, v: 0.495 },    // the mouth on the screen
      inks: [["#14213d", 3], ["#2b4170", 2]], // Prussian blue, and a lighter shade
      ear: { u: 0.3, v: 0.2 },
      ears: [{ c: [92, 47], r: [22, 26], pivot: [97, 69] },
             { c: [149, 46], r: [26, 29], pivot: [151, 71] }],
      hit: { x: 0.5, y: 0.46, rx: 0.43, ry: 0.42 }
    }
  };

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

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () {
        console.warn("could not load " + src);
        resolve(null);
      };
      img.src = src;
    });
  }

  // The atlas, with the variant's caller laid over the first mouse row.
  // Without the variant's image the mouse stays; without the atlas the
  // plain shapes take its place.
  function loadAtlas(variant) {
    return Promise.all([loadImage(ATLAS_SRC), variant ? loadImage(variant.src) : null]).then(function (imgs) {
      var base = imgs[0] || fallbackAtlas();
      if (!imgs[1]) return base;
      var c = canvas(base.width, base.height);
      var ctx = c.getContext("2d");
      ctx.drawImage(base, 0, 0);
      ctx.clearRect(0, 0, LAYERS * MOUSE_W, MOUSE_H);
      ctx.drawImage(imgs[1], 0, 0, LAYERS * MOUSE_W, MOUSE_H, 0, 0, LAYERS * MOUSE_W, MOUSE_H);
      return c;
    });
  }

  // Mouse with its ears turned: a copy of `src` (ImageData of one mouse)
  // warped into `out`. Each pixel samples the source where the ears'
  // turns would have carried it from. Same as earWarp in usv-card.js.
  function earWarp(src, out, ears, angles) {
    var W = src.width, H = src.height, a = src.data, b = out.data;
    b.set(a);
    var x0 = W, y0 = H, x1 = 0, y1 = 0;
    ears.forEach(function (e) {
      x0 = Math.min(x0, Math.floor(e.c[0] - e.r[0] * EAR_FADE));
      x1 = Math.max(x1, Math.ceil(e.c[0] + e.r[0] * EAR_FADE));
      y0 = Math.min(y0, Math.floor(e.c[1] - e.r[1] * EAR_FADE));
      y1 = Math.max(y1, Math.ceil(e.c[1] + e.r[1] * EAR_FADE));
    });
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var sx = x, sy = y;
        for (var k = 0; k < ears.length; k++) {
          var e = ears[k];
          var dx = (x - e.c[0]) / e.r[0], dy = (y - e.c[1]) / e.r[1];
          var t = Math.min(1, Math.max(0, (EAR_FADE - Math.sqrt(dx * dx + dy * dy)) / (EAR_FADE - 1)));
          var th = -angles[k] * t * t * (3 - 2 * t);
          if (!th) continue;
          var px = x - e.pivot[0], py = y - e.pivot[1];
          var cos = Math.cos(th), sin = Math.sin(th);
          sx += px * cos - py * sin - px;
          sy += px * sin + py * cos - py;
        }
        if (sx === x && sy === y) continue;
        // Bilinear sample, transparent outside the image.
        var fx = Math.floor(sx), fy = Math.floor(sy), u = sx - fx, v = sy - fy;
        var q = 4 * (y * W + x);
        for (var ch = 0; ch < 4; ch++) {
          var acc = 0;
          for (var j = 0; j < 2; j++) {
            for (var i = 0; i < 2; i++) {
              var X = fx + i, Y = fy + j;
              if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
              acc += a[4 * (Y * W + X) + ch] * (i ? u : 1 - u) * (j ? v : 1 - v);
            }
          }
          b[q + ch] = acc;
        }
      }
    }
  }

  window.p5Sketches = window.p5Sketches || {};

  window.p5Sketches.mice = function (p, opts) {
    var el = opts.el;
    var variant = VARIANTS[el.getAttribute("data-p5-variant")] || null;
    // Each mouse's mouth, ear, ears and outline, the caller's from the
    // variant if there is one.
    var inks = variant && variant.inks || USV_INKS;
    var snouts = SNOUT.slice(), earAt = EAR.slice(), earSets = EARS.slice(), hits = HIT.slice();
    if (variant) {
      snouts[0] = variant.snout;
      earAt[0] = variant.ear;
      earSets[0] = variant.ears;
      hits[0] = variant.hit;
    }
    var mice = [];                // {x, y, w, rot, flip, tile, holdUntil, next, rate, rateV}
    // Each mouse painted whole, and with its ears where they are now:
    // {src (ImageData), out (ImageData), canvas, ears: [{a, v}], lagged, still}
    var painted = [];
    var syllables = [];           // {from, route, q (fraction of the travel time), size, side, tile, ink}
    var routes = [];              // per caller: {path, travel}
    var t = 0;
    var pointer = null;           // {x, y} while the pointer is over the frame
    var hovered = -1;
    var atlas = null;
    var inkAtlases = [];
    var restLayer = null;

    // Places the mice for the frame's shape.
    function layout() {
      var w = p.width;
      var h = p.height;
      if (h / w >= TALL) {
        var mw = Math.min(w * 0.92, h * 0.34);
        mice = [
          { x: w / 2, y: h * 0.13, w: mw, rot: -0.07, flip: 1 },
          { x: w / 2, y: h * 0.87, w: mw, rot: -0.1, flip: -1 }
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
        m.next = 0;
        m.rate = 0;
        m.rateV = 0;
      });
      routes = mice.map(function (m, i) {
        var c = path(i, 1 - i);
        return { path: c, travel: Math.max(1, c.cum[c.cum.length - 1] / SPEED) };
      });
      syllables = [];
      // With reduced motion the sketch rests on the caller's stream in full
      // flow; otherwise it starts empty, and a stream appears with a call.
      if (opts.reducedMotion) prime(0);
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

    // The path from the snout of mouse a to the ear of mouse b, as on the
    // cards: a sine wave along the line between them that fades in at the
    // snout and out at the ear. Its first bend goes up where the line runs
    // across the frame, and the way the caller faces where it runs down.
    // Returned as a polyline with its cumulative length, so syllables move
    // along it at an even pace.
    function path(a, b) {
      var ma = mice[a];
      var p0 = fromTile(ma, snouts[ma.tile].u, snouts[ma.tile].v);
      var p1 = fromTile(mice[b], earAt[mice[b].tile].u, earAt[mice[b].tile].v);
      var ex = p1.x - p0.x, ey = p1.y - p0.y;
      var len = Math.hypot(ex, ey) || 1;
      var ax = ex / len, ay = ey / len;
      var nx = -ay, ny = ax;
      var f = facing(ma);
      if (Math.abs(ny) > 0.5 ? ny > 0 : nx * f.x < 0) { nx = -nx; ny = -ny; }
      // Keep the largest syllables inside the frame, as far as it allows.
      var margin = Math.min(SIZE[1] * ma.w / 2 + FAN * ma.w, 0.2 * Math.min(p.width, p.height));
      function outside(x, y) {
        return Math.max(0, margin - x, x - (p.width - margin), margin - y, y - (p.height - margin));
      }
      var bends = Math.max(1, Math.round(len / HALF_WAVE));
      // Start from the amplitude at which a plain sine wave swings by MAX_TURN.
      var amp = len * Math.tan(MAX_TURN / 2 * Math.PI / 180) / (Math.PI * bends);
      var pts;
      for (var tries = 0; tries < 30; tries++, amp *= 0.9) {
        pts = [];
        var ok = true, lo = Infinity, hi = -Infinity;
        for (var i = 0; i <= 128; i++) {
          var t = i / 128, ramp = Math.min(1, t / 0.2, (1 - t) / 0.2);
          var o = amp * ramp * ramp * Math.sin(Math.PI * bends * t);
          var bx = p0.x + ex * t, by = p0.y + ey * t;
          var x = bx + nx * o, y = by + ny * o;
          // The wave may not carry the path out of the frame; the line
          // itself may run near its edge, at the mice.
          if (outside(x, y) > outside(bx, by) + 0.5) ok = false;
          if (i) {
            var dx = x - pts[i - 1].x, dy = y - pts[i - 1].y;
            var hd = Math.atan2(dx * ny - dy * nx, dx * ax + dy * ay) * 180 / Math.PI;
            lo = Math.min(lo, hd);
            hi = Math.max(hi, hd);
          }
          pts.push({ x: x, y: y });
        }
        if (ok && hi - lo <= MAX_TURN) break;
      }
      var cum = [0];
      for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      return { pts: pts, cum: cum };
    }

    // Fraction of the path reached at fraction u of the travel time: the
    // speed falls linearly to END_SPEED of its speed at the snout, with
    // the whole travel taking the same time. As in usv-card.js.
    function eased(u) {
      var a = 2 / (1 + END_SPEED);
      return a * u - a * (1 - END_SPEED) * u * u / 2;
    }

    // Point and unit normal at fraction q of a path's length.
    function along(c, q) {
      var target = q * c.cum[c.cum.length - 1];
      var i = 1;
      while (i < c.cum.length - 1 && c.cum[i] < target) i++;
      var a = c.pts[i - 1], b = c.pts[i];
      var seg = c.cum[i] - c.cum[i - 1] || 1;
      var u = Math.min(1, Math.max(0, (target - c.cum[i - 1]) / seg));
      var tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
      return { x: a.x + tx * u, y: a.y + ty * u, nx: -ty / len, ny: tx / len };
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
        var hit = hits[mice[i].tile];
        var du = (q.u - hit.x) / hit.rx, dv = (q.v - hit.y) / hit.ry;
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

    // Each mouse, its layers tinted through one scratch tile and laid
    // into a canvas of its own, which the ear warp then works on.
    function paintMice() {
      var scratch = canvas(MOUSE_W, MOUSE_H);
      var sctx = scratch.getContext("2d");
      painted = [];
      for (var i = 0; i < MICE; i++) {
        var c = canvas(MOUSE_W, MOUSE_H);
        var ctx = c.getContext("2d");
        for (var l = 0; l < LAYERS; l++) {
          var tile = mouseTile(i, l);
          sctx.globalCompositeOperation = "copy";
          sctx.drawImage(atlas, tile.x, tile.y, tile.w, tile.h, 0, 0, tile.w, tile.h);
          sctx.globalCompositeOperation = "source-in";
          sctx.fillStyle = LAYER_TINTS[l][0];
          sctx.fillRect(0, 0, tile.w, tile.h);
          ctx.globalAlpha = LAYER_TINTS[l][1];
          for (var pass = 0; pass < LAYER_TINTS[l][2]; pass++) ctx.drawImage(scratch, 0, 0);
        }
        painted.push({
          src: ctx.getImageData(0, 0, MOUSE_W, MOUSE_H),
          out: ctx.createImageData(MOUSE_W, MOUSE_H),
          canvas: c,
          ears: earSets[i].map(function () { return { a: 0, v: 0 }; }),
          lagged: [],
          still: true
        });
      }
    }

    // The background.
    function drawRestLayer() {
      if (!restLayer) {
        restLayer = p.createGraphics(p.width, p.height);
        restLayer.elt.setAttribute("aria-hidden", "true");
      } else {
        restLayer.resizeCanvas(p.width, p.height);
      }
      var ctx = restLayer.drawingContext;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, p.width, p.height);
    }

    // Flicks the ears of mouse i back, by a varying amount; the far ear
    // follows a moment later.
    function flick(i) {
      var e = painted[i];
      if (!e) return;
      var kick = EAR_KICK * p.random(0.6, 1) * 2 * Math.PI * EAR_HZ;
      e.ears[0].v += kick;
      e.lagged.push({ t: EAR_LAG, kick: kick * 0.8 });
    }

    // Steps the ears' springs, in small steps for stability.
    function moveEars(dt) {
      var w0 = 2 * Math.PI * EAR_HZ;
      painted.forEach(function (e) {
        e.lagged.forEach(function (l) {
          l.t -= dt;
          if (l.t <= 0) e.ears[1].v += l.kick;
        });
        e.lagged = e.lagged.filter(function (l) { return l.t > 0; });
        var steps = Math.ceil(dt / 0.004);
        for (var n = 0; n < steps; n++) {
          var step = dt / steps;
          e.ears.forEach(function (ear) {
            ear.v += (-w0 * w0 * ear.a - 2 * EAR_DAMPING * w0 * ear.v) * step;
            ear.a += ear.v * step;
          });
        }
      });
    }

    function earsStill(e) {
      return !e.lagged.length && e.ears.every(function (ear) { return Math.abs(ear.a) < 1e-4 && Math.abs(ear.v) < 1e-3; });
    }

    // The mice, with their ears where they are now. The warp runs only
    // while an ear moves, and once more as it comes to rest.
    function drawMice(ctx) {
      mice.forEach(function (m, i) {
        var e = painted[m.tile];
        var still = earsStill(e);
        if (!(still && e.still)) {
          earWarp(e.src, e.out, earSets[m.tile], e.ears.map(function (ear) { return ear.a; }));
          e.canvas.getContext("2d").putImageData(e.out, 0, 0);
        }
        e.still = still;
        drawMouse(ctx, e.canvas, m, { x: 0, y: 0, w: MOUSE_W, h: MOUSE_H }, 1);
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

    // A syllable from mouse i, at its snout; it flicks the mouse's ears.
    function spawn(i) {
      syllables.push({
        from: i, route: routes[i], q: 0, size: mice[i].w, side: p.random(-1, 1),
        tile: weighted(SYLLABLE_WEIGHTS),
        ink: weighted(inks.map(function (c) { return c[1]; }))
      });
      flick(mice[i].tile);
    }

    // The caller's stream in full flow, along the whole path: the still
    // frame the sketch shows with reduced motion.
    function prime(i) {
      var gap = (INTERVAL[0] + INTERVAL[1]) / 2;
      for (var age = gap; age < routes[i].travel; age += gap) {
        syllables.push({
          from: i, route: routes[i], q: age / routes[i].travel, size: mice[i].w, side: p.random(-1, 1),
          tile: weighted(SYLLABLE_WEIGHTS),
          ink: weighted(inks.map(function (c) { return c[1]; }))
        });
      }
    }

    function calling(i) {
      return i === hovered || t < mice[i].holdUntil;
    }

    function step(dt) {
      t += dt;
      for (var i = 0; i < mice.length; i++) {
        var m = mice[i];
        spin(m, calling(i) ? 1 : 0, dt);
        // The whole stream runs at its mouse's speed: syllables and the
        // time between them.
        m.next -= dt * m.rate;
        if (m.rate > 0 && m.next <= 0) {
          spawn(i);
          m.next = p.random(INTERVAL[0], INTERVAL[1]);
        }
      }
      moveEars(dt);
      // A stream whose mouse no longer calls fades out as it runs down.
      syllables.forEach(function (s) {
        s.q += dt * mice[s.from].rate / s.route.travel;
        if (s.fading === undefined && !calling(s.from)) s.fading = t;
      });
      syllables = syllables.filter(function (s) {
        return s.q < 1 && !(s.fading !== undefined && t - s.fading >= FADE_OUT);
      });
    }

    // Moves mouse m's speed towards target along a critically damped
    // spring, with its exact solution: no overshoot, no jolt when the
    // target changes midway. As in usv-card.js.
    function spin(m, target, dt) {
      var w0 = target > m.rate ? SPIN_UP : RUN_DOWN;
      var c1 = m.rate - target, c2 = m.rateV + w0 * c1;
      var decay = Math.exp(-w0 * dt);
      m.rate = target + (c1 + c2 * dt) * decay;
      m.rateV = (c2 - w0 * (c1 + c2 * dt)) * decay;
      if (Math.abs(m.rate - target) < 1e-3 && Math.abs(m.rateV) < 1e-2) {
        m.rate = target;
        m.rateV = 0;
      }
      m.rate = Math.max(0, Math.min(1, m.rate));
    }

    // Nothing moves: no mouse calls or runs down, and the ears are still.
    function idle() {
      return mice.every(function (m, i) { return !calling(i) && !m.rate; }) &&
        painted.every(earsStill) &&
        syllables.every(function (s) { return s.fading === undefined; });
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
      // With reduced motion the sketch is a still frame and ignores the
      // pointer.
      if (!opts.reducedMotion) {
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
      }
      layout();
      loadAtlas(variant).then(function (img) {
        atlas = img;
        inkAtlases = inks.map(function (c) { return inkSyllables(img, c[0]); });
        paintMice();
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
      drawMice(ctx);
      syllables.forEach(function (s) {
        var at = eased(s.q);
        var pt = along(s.route.path, at);
        var size = (SIZE[0] + (SIZE[1] - SIZE[0]) * at) * s.size;
        var spread = s.side * FAN * s.size * at;
        var x = pt.x + pt.nx * spread - size / 2;
        var y = pt.y + pt.ny * spread - size / 2;
        ctx.save();
        var out = s.fading === undefined ? 1 : Math.max(0, 1 - (t - s.fading) / FADE_OUT);
        ctx.globalAlpha = ALPHA * out * Math.min(1, at / 0.08) * Math.max(0, Math.min(1, (GONE - at) / 0.2));
        // Twice, to deepen the thin washes, as on the cards.
        for (var pass = 0; pass < 2; pass++) ctx.drawImage(inkAtlases[s.ink], s.tile * SYL, 0, SYL, SYL, x, y, size, size);
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
