// Ultrasonic vocalisation syllables rising from the mouse on publication
// cards (site/layouts/publications/li.html). Each card holds a canvas over
// its bottom right corner, where the mouse is a CSS background
// (/img/mouse-card.webp, 80 px wide). Syllables leave the mouse's mouth and
// rise along a winding spline, growing as they go, so the stream fans out
// in scale, with a little sideways scatter, and fade near the top.
//
// The syllables come from the painted atlas, /img/mice.webp. Cards pause
// while scrolled out of view; with reduced motion they show a still fan.
(function () {
  "use strict";

  // Atlas layout; keep in sync with site/static/js/sketches/mice.js.
  var ATLAS_SRC = "/img/mice.webp";
  var MICE = 2;
  var MOUSE_H = 280;
  var SYL = 128;
  var SYLLABLE_WEIGHTS = [1, 1, 1, 1, 1, 2, 2, 2, 1.5, 1.5, 1.5, 0.5];
  var INKS = [["#14213d", 3], ["#4d5874", 2]];

  // The mouse on the card; keep in sync with .publication-card in
  // src/css/imports/_styles.css and with tools/mouse-card.html.
  var MOUSE_PX = 80;              // CSS px, width of the mouse
  var MOUSE_ASPECT = 132 / 200;   // height / width of mouse-card.webp
  var SNOUT = { u: 0.066, v: 0.734 }; // in mouse-card.webp, as fractions

  // The path, through knots in mouse widths from the snout (x right, y
  // down): out in front of the face, back over it, out again, and up.
  var KNOTS = [[-0.04, -0.03], [-0.8, -0.32], [-0.1, -0.95], [-0.95, -1.6], [-0.25, -2.3]];
  var SIZE = [0.2, 0.72];         // syllable size at the mouth and at the top, in mouse widths
  var FAN = 0.1;                  // sideways spread at the top, in mouse widths
  var TRAVEL = 3.6;               // s from the mouth to the top
  var INTERVAL = [0.35, 0.6];     // s between syllables
  var ALPHA = 0.95;

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
    ctx.drawImage(img, 0, MICE * MOUSE_H, img.width, SYL, 0, 0, img.width, SYL);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // A Catmull-Rom spline through the knots, as a polyline with its
  // cumulative length, so syllables move at an even pace.
  function spline(knots) {
    var pts = [knots[0]];
    for (var i = 0; i < knots.length - 1; i++) {
      var k0 = knots[Math.max(0, i - 1)], k1 = knots[i], k2 = knots[i + 1], k3 = knots[Math.min(knots.length - 1, i + 2)];
      for (var j = 1; j <= 16; j++) {
        var t = j / 16, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1].map(function (d) {
          return 0.5 * (2 * k1[d] + (-k0[d] + k2[d]) * t + (2 * k0[d] - 5 * k1[d] + 4 * k2[d] - k3[d]) * t2 +
            (-k0[d] + 3 * k1[d] - 3 * k2[d] + k3[d]) * t3);
        }));
      }
    }
    var cum = [0];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts: pts, cum: cum };
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

  function mount(canvas, inks) {
    var path = spline(KNOTS.map(function (k) { return [k[0] * MOUSE_PX, k[1] * MOUSE_PX]; }));
    var half = SIZE[1] * MOUSE_PX / 2 + FAN * MOUSE_PX;
    var xs = path.pts.map(function (q) { return q[0]; }), ys = path.pts.map(function (q) { return q[1]; });
    var mouseH = MOUSE_PX * MOUSE_ASPECT;
    var snoutX = SNOUT.u * MOUSE_PX, snoutY = SNOUT.v * mouseH;
    // The canvas spans the path and the mouse; its bottom right corner is
    // the bottom right corner of the mouse image.
    var left = Math.min(0, snoutX + Math.min.apply(null, xs) - half);
    var top = Math.min(0, snoutY + Math.min.apply(null, ys) - half);
    var w = Math.ceil(MOUSE_PX - left), h = Math.ceil(mouseH - top);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    var ox = snoutX - left, oy = snoutY - top;
    var syllables = [];
    var next = 0;
    var running = false;
    var raf = 0;                  // the pending animation frame
    var last = 0;
    var t = 0;

    function spawn(at) {
      syllables.push({ born: at, tile: weighted(SYLLABLE_WEIGHTS), ink: weighted(INKS.map(function (c) { return c[1]; })), side: Math.random() * 2 - 1 });
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
      t += dt;
      if (t >= next) {
        spawn(t);
        next = t + INTERVAL[0] + Math.random() * (INTERVAL[1] - INTERVAL[0]);
      }
      syllables = syllables.filter(function (s) { return t - s.born < TRAVEL; });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      syllables.forEach(function (s) {
        var f = (t - s.born) / TRAVEL;
        draw(f, s, ALPHA * Math.min(1, f / 0.08) * Math.min(1, (1 - f) / 0.2));
      });
      raf = requestAnimationFrame(frame);
    }

    if (reducedMotion) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      [0.12, 0.34, 0.56, 0.78].forEach(function (q, i) {
        draw(q, { tile: [6, 3, 5, 7][i], ink: i % 2, side: [0, 0.6, -0.5, 0.4][i] }, ALPHA * (1 - 0.3 * q));
      });
      return;
    }

    // Start with the stream already flowing.
    for (var k = 0; k < 7; k++) spawn(-k * (INTERVAL[0] + INTERVAL[1]) / 2);
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
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) start();
          else stop();
        });
      }).observe(canvas);
    } else {
      start();
    }
  }

  function init() {
    var canvases = document.querySelectorAll(".publication-usv");
    if (!canvases.length) return;
    var img = new Image();
    img.onload = function () {
      var inks = INKS.map(function (c) { return inked(img, c[0]); });
      Array.prototype.forEach.call(canvases, function (c) { mount(c, inks); });
    };
    img.src = ATLAS_SRC;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
