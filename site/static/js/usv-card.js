// Ultrasonic vocalisation syllables rising from the mouse on publication
// cards (site/layouts/publications/li.html). Each card holds a canvas over
// the empty space below its text, down to the bottom right corner, where
// the mouse is a CSS background (/img/mouse-card.webp, 80 px wide).
// Syllables leave the mouse's mouth and rise along a gently winding line
// that fills that space, growing and slowing as they go, so the stream fans out in scale,
// with a little sideways scatter, and fade near the top. The canvas and the
// path are rebuilt whenever the card changes size; the syllables keep
// their place along the path.
//
// The canvas also draws the mouse, in place of the card's CSS background,
// so its ears can move: each syllable that leaves the mouth flicks them,
// and they settle back with a short, damped wiggle. The ears are painted
// into the same layer as the head, so each one is turned about its base
// by a small warp that fades out towards the head, with no seam.
//
// The syllables come from the painted atlas, /img/mice.webp. The card
// rests as a still frame of the stream in full flow. The stream runs only
// while the card is hovered or focused, from where it last stopped, with
// a little inertia: it gathers speed when the hover starts and runs down
// to a stop when it ends, all of it slowing together, as a tape does.
// With reduced motion the card stays a still frame.
//
// A canvas with data-mouse="computer" draws the cartoon computer of the
// BiWaveGAN publication in the mouse's place (/img/computer-card.webp).
(function () {
  "use strict";

  // Atlas layout; keep in sync with site/static/js/sketches/mice.js.
  var ATLAS_SRC = "/img/mice.webp";
  var ATLAS_MICE = 2;
  var MOUSE_H = 280;
  var SYL = 128;
  var SYLLABLE_WEIGHTS = [1, 1, 1, 1, 1, 2, 2, 2, 1.5, 1.5, 1.5, 0.5];
  // Inks of the syllables, with their weights: the theme orange and a
  // deeper shade of it. A caller may have its own. Keep in sync with
  // USV_INKS and VARIANTS in sketches/mice.js.
  var INKS = [["#fca311", 3], ["#d98a06", 2]];

  // The mouse on the card; keep in sync with .publication-card in
  // src/css/imports/_styles.css and with tools/mouse-card.html.
  var MOUSE_PX = 80;              // CSS px, width of the mouse
  // Each caller: its image, its height / width, its mouth in the image
  // as fractions, and its ears in image px. tools/mouse-card.html prints
  // the mouth and the ears. Each ear is the ellipse that holds it and the
  // pivot at its base. The warp turns the ear fully inside its ellipse
  // and fades to nothing at FADE times its radii.
  var MICE = {
    mouse: {
      src: "/img/mouse-card.webp",
      aspect: 132 / 200,
      snout: { u: 0.066, v: 0.734 },
      ears: [
        { c: [32, 44], r: [16, 17], pivot: [46, 59] },   // near ear
        { c: [60, 32], r: [14, 22], pivot: [65, 58] }    // far ear
      ]
    },
    computer: {
      src: "/img/computer-card.webp",
      aspect: 148 / 200,
      snout: { u: 0.109, v: 0.513 },   // the mouth on the screen
      // Prussian blue, and a lighter shade of it.
      inks: [["#14213d", 3], ["#2b4170", 2]],
      ears: [
        { c: [29, 25], r: [12, 14], pivot: [32, 38] },
        { c: [61, 25], r: [14, 16], pivot: [62, 39] }
      ]
    }
  };
  var FADE = 1.6;
  // Each ear is a damped spring in its angle: a slow, soft twitch that
  // swings back past rest once, gently, and settles. A flick turns it by
  // up to about EAR_KICK radians; the far ear follows the near one a
  // little late. Keep in sync with sketches/mice.js.
  var EAR_HZ = 1.8;
  var EAR_DAMPING = 0.35;
  var EAR_KICK = 0.07;
  var EAR_LAG = 0.08;             // s

  // The path: a sine wave along the line from the snout to its end, given
  // as fractions of the space from the snout to the far left and to the
  // top of the canvas. The first lobe bends up, away from "Read more" in
  // the bottom left corner. The wave's amplitude shrinks until its heading
  // swings by at most MAX_TURN over the whole path, so no bend is sharper
  // than that, and until the wave stays inside the canvas.
  var END = [0.92, 1];
  var MAX_TURN = 60;              // degrees
  var HALF_WAVE = 150;            // px along the line per bend, roughly
  var SIZE = [0.2, 0.72];         // syllable size at the mouth and at the top, in mouse widths
  var FAN = 0.1;                  // sideways spread at the top, in mouse widths
  var SPEED = 87;                 // px/s along the path, on average
  // Syllables slow steadily as they rise, to END_SPEED of their speed at
  // the mouth, and so close up a little near the top, where they fade.
  var END_SPEED = 0.4;
  var GAP = 8;                    // px between the text and the canvas
  var INTERVAL = [0.35, 0.6];     // s between syllables
  var ALPHA = 0.95;
  // How fast the stream gathers speed and runs down, as the natural
  // frequency (1/s) of a critically damped spring on its speed: just
  // enough that the stream does not snap on or off. At 12 it is up to
  // speed in about 0.4 s; at 7 it takes about 0.7 s to stop.
  // Keep in sync with sketches/mice.js.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function weighted(weights) {
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < weights.length; i++) {
      if ((r -= weights[i]) < 0) return i;
    }
    return 0;
  }

  // The syllable row of the atlas in one ink.
  function inked(img, ink) {
    var c = document.createElement("canvas");
    c.width = img.width;
    c.height = SYL;
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, ATLAS_MICE * MOUSE_H, img.width, SYL, 0, 0, img.width, SYL);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Fraction of the path reached at fraction u of the travel time: the
  // speed falls linearly from a at the mouth to END_SPEED * a at the top,
  // with a set so the whole travel still takes the same time.
  function eased(u) {
    var a = 2 / (1 + END_SPEED);
    return a * u - a * (1 - END_SPEED) * u * u / 2;
  }

  // A polyline with its cumulative length, so syllables move at an even
  // pace.
  function measured(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts: pts, cum: cum };
  }

  // The wave from the snout, at (0, 0), to (ex, ey), kept within x in
  // [minX, 0] and y in [minY, 0] (x right, y down).
  function wave(ex, ey, minX, minY) {
    var len = Math.hypot(ex, ey) || 1;
    var ax = ex / len, ay = ey / len;
    var nx = -ay, ny = ax;        // unit normal
    if (ny > 0) { nx = -nx; ny = -ny; } // bend up first
    var bends = Math.max(1, Math.round(len / HALF_WAVE));
    // Start from the amplitude at which a plain sine wave swings by MAX_TURN.
    var amp = len * Math.tan(MAX_TURN / 2 * Math.PI / 180) / (Math.PI * bends);
    var pts;
    for (var tries = 0; tries < 30; tries++, amp *= 0.9) {
      pts = [];
      var inside = true, lo = Infinity, hi = -Infinity;
      for (var i = 0; i <= 96; i++) {
        // The wave fades in over the first fifth, so the path leaves the
        // mouth along the line and does not swing over the mouse or below it.
        var t = i / 96, ramp = Math.min(1, t / 0.2);
        var o = amp * ramp * ramp * Math.sin(Math.PI * bends * t);
        var x = ex * t + nx * o, y = ey * t + ny * o;
        if (x > 0.5 || y > 0.5 || x < minX || y < minY) inside = false;
        if (i) {
          // Heading relative to the line, in degrees.
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

  // Point and unit normal at fraction q of the path's length.
  function along(c, q) {
    var target = q * c.cum[c.cum.length - 1];
    var i = 1;
    while (i < c.cum.length - 1 && c.cum[i] < target) i++;
    var a = c.pts[i - 1], b = c.pts[i];
    var u = Math.min(1, Math.max(0, (target - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1] || 1)));
    var tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    return { x: a[0] + tx * u, y: a[1] + ty * u, nx: -ty / len, ny: tx / len };
  }

  // The mouse with its ears turned: a copy of `src` (ImageData of the
  // mouse) warped into `out` (ImageData of the same size). Each pixel
  // samples the source where the ears' turns would have carried it from.
  function earWarp(src, out, EARS, angles) {
    var W = src.width, H = src.height, a = src.data, b = out.data;
    b.set(a);
    var x0 = W, y0 = H, x1 = 0, y1 = 0;
    EARS.forEach(function (e) {
      x0 = Math.min(x0, Math.floor(e.c[0] - e.r[0] * FADE));
      x1 = Math.max(x1, Math.ceil(e.c[0] + e.r[0] * FADE));
      y0 = Math.min(y0, Math.floor(e.c[1] - e.r[1] * FADE));
      y1 = Math.max(y1, Math.ceil(e.c[1] + e.r[1] * FADE));
    });
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var sx = x, sy = y;
        for (var k = 0; k < EARS.length; k++) {
          var e = EARS[k];
          var dx = (x - e.c[0]) / e.r[0], dy = (y - e.c[1]) / e.r[1];
          var t = Math.min(1, Math.max(0, (FADE - Math.sqrt(dx * dx + dy * dy)) / (FADE - 1)));
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

  function mount(canvas, inks, spec, mouse) {
    var card = canvas.parentNode;
    var MOUSE_ASPECT = spec.aspect, SNOUT = spec.snout, EARS = spec.ears;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = 0, h = 0;             // canvas size, CSS px
    var ox = 0, oy = 0;           // the snout, in canvas px
    var path = null;
    var travel = 1;               // s from the mouth to the top
    var syllables = [];           // {q (fraction of the travel time), tile, ink, side}
    var next = 0;
    var running = false;
    var raf = 0;                  // the pending animation frame
    var last = 0;
    // The stream's speed, from 0 (stopped) to 1, its rate of change, and
    // the speed it is heading for.
    var rate = 1, rateV = 0, rateTarget = 1;
    // The ears: angle (rad) and angular velocity of each, and a flick
    // waiting to reach the far ear.
    var ears = EARS.map(function () { return { a: 0, v: 0 }; });
    var lagged = [];
    var mouseCanvas = document.createElement("canvas");
    mouseCanvas.width = mouse.width;
    mouseCanvas.height = mouse.height;
    var mctx = mouseCanvas.getContext("2d");
    mctx.drawImage(mouse, 0, 0);
    var mouseSrc = mctx.getImageData(0, 0, mouse.width, mouse.height);
    var mouseOut = mctx.createImageData(mouse.width, mouse.height);
    var earsStill = true;
    card.classList.add("usv-live");

    // Fits the canvas to the space between the text and the bottom of the
    // card's padding, and stretches the path across it.
    function layout() {
      var box = card.getBoundingClientRect();
      var cs = getComputedStyle(card);
      var padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      var padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
      var padB = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
      var textBottom = box.top;
      Array.prototype.forEach.call(card.children, function (el) {
        if (el === canvas || el.classList.contains("publication-more")) return;
        if (!el.getClientRects().length) return;   // no box: the abstract's <template>
        textBottom = Math.max(textBottom, el.getBoundingClientRect().bottom);
      });
      var mouseH = MOUSE_PX * MOUSE_ASPECT;
      var nw = Math.max(MOUSE_PX, Math.floor(box.width - padL - padR));
      var nh = Math.max(mouseH, Math.floor(box.bottom - padB - textBottom - GAP));
      if (nw === w && nh === h && path) return;
      w = nw;
      h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ox = w - MOUSE_PX + SNOUT.u * MOUSE_PX;
      oy = h - mouseH + SNOUT.v * mouseH;
      // Keep the largest syllables, at the top, inside the canvas.
      var margin = SIZE[1] * MOUSE_PX / 2 + FAN * MOUSE_PX;
      var spanX = Math.max(0, ox - margin), spanY = Math.max(0, oy - margin);
      path = wave(-END[0] * spanX, -END[1] * spanY, -spanX, -spanY);
      travel = Math.max(1, path.cum[path.cum.length - 1] / SPEED);
      render();
    }

    function spawn(q) {
      syllables.push({ q: q, tile: weighted(SYLLABLE_WEIGHTS), ink: weighted(spec.inks.map(function (c) { return c[1]; })), side: Math.random() * 2 - 1 });
    }

    function draw(q, s, alpha) {
      var at = along(path, q);
      var size = (SIZE[0] + (SIZE[1] - SIZE[0]) * q) * MOUSE_PX;
      var spread = s.side * FAN * MOUSE_PX * q;
      var x = ox + at.x + at.nx * spread - size / 2;
      var y = oy + at.y + at.ny * spread - size / 2;
      ctx.globalAlpha = alpha;
      // Twice, to deepen the thin washes at this small size.
      for (var pass = 0; pass < 2; pass++) ctx.drawImage(inks[s.ink], s.tile * SYL, 0, SYL, SYL, x, y, size, size);
    }

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      spin(dt);
      // The whole stream runs at the current speed: syllables and the
      // time between them.
      var st = dt * rate;
      next -= st;
      if (next <= 0) {
        spawn(0);
        next = INTERVAL[0] + Math.random() * (INTERVAL[1] - INTERVAL[0]);
        flick();
      }
      moveEars(dt);
      syllables.forEach(function (s) { s.q += st / travel; });
      syllables = syllables.filter(function (s) { return s.q < 1; });
      render();
      // Run down to a stop, then pause once the ears are still.
      if (!rateTarget && !rate && earsAtRest()) {
        stop();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    // Moves the speed towards its target along a critically damped
    // spring, with its exact solution: no overshoot, no jolt when the
    // target changes midway.
    function spin(dt) {
      var w0 = rateTarget > rate ? SPIN_UP : RUN_DOWN;
      var c1 = rate - rateTarget, c2 = rateV + w0 * c1;
      var decay = Math.exp(-w0 * dt);
      rate = rateTarget + (c1 + c2 * dt) * decay;
      rateV = (c2 - w0 * (c1 + c2 * dt)) * decay;
      if (Math.abs(rate - rateTarget) < 1e-3 && Math.abs(rateV) < 1e-2) {
        rate = rateTarget;
        rateV = 0;
      }
      rate = Math.max(0, Math.min(1, rate));
    }

    function earsAtRest() {
      return !lagged.length && ears.every(function (e) { return Math.abs(e.a) < 1e-4 && Math.abs(e.v) < 1e-3; });
    }

    // Each syllable flicks the ears back, by a varying amount; the far ear
    // follows a moment later.
    function flick() {
      var kick = EAR_KICK * (0.6 + 0.4 * Math.random()) * 2 * Math.PI * EAR_HZ;
      ears[0].v += kick;
      lagged.push({ t: EAR_LAG, kick: kick * 0.8 });
    }

    // Steps the ears' springs, in small steps for stability.
    function moveEars(dt) {
      var w0 = 2 * Math.PI * EAR_HZ;
      lagged.forEach(function (l) {
        l.t -= dt;
        if (l.t <= 0) ears[1].v += l.kick;
      });
      lagged = lagged.filter(function (l) { return l.t > 0; });
      var steps = Math.ceil(dt / 0.004);
      for (var n = 0; n < steps; n++) {
        var step = dt / steps;
        ears.forEach(function (e) {
          e.v += (-w0 * w0 * e.a - 2 * EAR_DAMPING * w0 * e.v) * step;
          e.a += e.v * step;
        });
      }
    }

    // The mouse, with its ears where they are now.
    function drawMouse() {
      var still = ears.every(function (e) { return Math.abs(e.a) < 1e-4 && Math.abs(e.v) < 1e-3; });
      if (!(still && earsStill)) {
        earWarp(mouseSrc, mouseOut, EARS, ears.map(function (e) { return e.a; }));
        mctx.putImageData(mouseOut, 0, 0);
      }
      earsStill = still;
      var mouseH = MOUSE_PX * MOUSE_ASPECT;
      ctx.globalAlpha = 1;
      ctx.drawImage(mouseCanvas, w - MOUSE_PX, h - mouseH, MOUSE_PX, mouseH);
    }

    // The mouse and the stream as they stand.
    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawMouse();
      syllables.forEach(function (s) {
        var at = eased(s.q);
        draw(at, s, ALPHA * Math.min(1, at / 0.08) * Math.min(1, (1 - at) / 0.2));
      });
    }

    // Start with the stream already flowing along the whole path.
    function prime() {
      syllables = [];
      next = 0;
      var gap = (INTERVAL[0] + INTERVAL[1]) / 2;
      for (var age = gap; age < travel; age += gap) spawn(age / travel);
    }
    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    // Cancels the pending frame, so a card that leaves view and comes
    // straight back runs one loop, not two.
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    layout();
    if ("ResizeObserver" in window) new ResizeObserver(layout).observe(card);
    else window.addEventListener("resize", layout);

    // The card shows the primed stream, paused. With reduced motion it
    // stays so. Otherwise it runs only while the pointer is over the card
    // or it has focus, gathering speed as it starts, and runs down to a
    // stop on the frame it reached, so the next hover carries on from it.
    rate = rateTarget = 0;
    prime();
    render();
    if (reducedMotion) return;
    var active = 0;               // pointer over, focus within: a bit each
    var set = function (bit, on) {
      var was = active;
      active = on ? active | bit : active & ~bit;
      if (!was && active) {
        rateTarget = 1;
        start();
      } else if (was && !active) {
        rateTarget = 0;           // the frame loop runs down and stops
      }
    };
    card.addEventListener("mouseenter", function () { set(1, true); });
    card.addEventListener("mouseleave", function () { set(1, false); });
    card.addEventListener("focusin", function () { set(2, true); });
    card.addEventListener("focusout", function () { set(2, false); });
  }

  function load(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function init() {
    var canvases = document.querySelectorAll(".publication-usv");
    if (!canvases.length) return;
    // If either image fails, the card keeps its CSS mouse and no stream.
    var atlas = load(ATLAS_SRC);
    Array.prototype.forEach.call(canvases, function (c) {
      var spec = MICE[c.getAttribute("data-mouse")] || MICE.mouse;
      spec.inks = spec.inks || INKS;
      Promise.all([atlas, load(spec.src)]).then(function (r) {
        mount(c, spec.inks.map(function (k) { return inked(r[0], k[0]); }), spec, r[1]);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
