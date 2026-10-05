// Watercolor field of neurons, driven by a simulated calcium-imaging model.
//
// Each soma integrates spikes into a calcium signal that decays exponentially;
// the rendered fluorescence is a saturating function of that signal, as with a
// GCaMP-type indicator. Spikes come from four sources:
//   - basal Poisson firing in every neuron,
//   - assembly events: a spatially clustered group fires together, the activity
//     spreading outward from the assembly's centre as a travelling wave,
//   - a "stimulus" under the pointer that raises the local firing rate,
//   - an evoked burst around each click or tap.
// When the visitor prefers reduced motion, spontaneous activity is off: the
// field starts as a still frame and only moves in response to the pointer.
//
// Rendering: p5.brush's watercolor fill is far too expensive to run per frame,
// so a few somata and blooms are painted once, in black on white, into an
// offscreen atlas. The atlas is converted to an alpha mask (pigment density)
// and each neuron is drawn as a tinted, rotated sprite from it. Without
// p5.brush (no WebGL2, or the CDN fails) the atlas is drawn with soft
// procedural blots instead.
(function () {
  "use strict";

  var BG = [20, 33, 61];          // --prussian-blue
  var REST = [229, 229, 229];     // --alabaster-grey
  var REST_ALPHA = 60;            // 0-255
  var ACTIVE = [252, 163, 17];    // --orange
  var BLOOM_ALPHA = 150;          // 0-255, at full fluorescence

  var SPACING = 46;               // px between neighbouring somata
  var MAX_NEURONS = 260;
  var R_MIN = 7;                  // px, soma radius range
  var R_MAX = 15;
  var BASAL_RATE = 0.04;          // spikes / s / neuron
  var ASSEMBLY_AREA = 50000;      // px^2 of field per assembly
  var ASSEMBLY_RATE = 0.1;        // events / s / assembly
  var ASSEMBLY_SIGMA = 90;        // px, spatial spread of membership
  var ASSEMBLY_P_FIRE = 0.8;      // probability a member joins an event
  var WAVE_SPEED = 400;           // px / s
  var STIM_RATE = 6;              // peak spikes / s under the pointer
  var STIM_SIGMA = 60;            // px
  var EVOKED_SIGMA = 70;          // px, spread of the click / tap burst
  var EVOKED_SPIKES = 2;          // spikes per recruited neuron
  var TAU_DECAY = 0.9;            // s, calcium decay
  var TAU_RISE = 0.05;            // s, indicator rise
  var K_D = 0.8;                  // indicator half-saturation, in spikes
  var PREWARM = 3;                // s simulated before the first frame

  var CELL = 128;                 // px, atlas cell
  var SOMA_VARIANTS = 8;
  var BLOOM_VARIANTS = 4;
  var ATLAS_COLS = 4;
  var SOMA_R = 0.2;               // painted soma radius, fraction of a cell
  var BLOOM_R = 0.26;             // painted bloom radius, fraction of a cell

  window.p5Sketches = window.p5Sketches || {};

  window.p5Sketches.neurons = function (p, opts) {
    var el = opts.el;
    var useBrush = !!(opts.libs && opts.libs.brush && window.brush);
    var neurons = [];
    var assemblies = [];
    var pending = [];             // scheduled spikes: {t, n}
    var t = 0;
    var pointerInside = false;
    var painting = null;          // offscreen p5.brush target until it is read
    var atlas = null;             // p5.Image: white, alpha = pigment density
    var restLayer = null;         // p5.Framebuffer: background + resting somata

    if (useBrush) window.brush.instance(p);

    function cellOrigin(i) {
      return { x: (i % ATLAS_COLS) * CELL, y: Math.floor(i / ATLAS_COLS) * CELL };
    }

    function atlasSize() {
      var n = SOMA_VARIANTS + BLOOM_VARIANTS;
      return { w: ATLAS_COLS * CELL, h: Math.ceil(n / ATLAS_COLS) * CELL };
    }

    // Queues the watercolor painting. p5.brush composites it into the target
    // when setup() returns, so the pixels are read on the first draw().
    function paintAtlas() {
      var size = atlasSize();
      var pg = p.createGraphics(size.w, size.h, p.WEBGL);
      var i, o, cx, cy;

      pg.pixelDensity(1);
      pg.background(255);
      window.brush.load(pg);
      window.brush.noStroke();

      for (i = 0; i < SOMA_VARIANTS + BLOOM_VARIANTS; i++) {
        o = cellOrigin(i);
        cx = o.x + CELL / 2 - size.w / 2;
        cy = o.y + CELL / 2 - size.h / 2;
        if (i < SOMA_VARIANTS) {
          window.brush.fill(0, 0, 0, 170);
          window.brush.fillBleed(p.random(0.2, 0.3), "out");
          window.brush.fillTexture(0.6, 0.7);
          window.brush.circle(cx, cy, CELL * SOMA_R, 0.3);
          // Nucleus: a smaller, offset glaze inside the soma.
          window.brush.fill(0, 0, 0, 110);
          window.brush.fillBleed(0.05, "out");
          window.brush.fillTexture(0.4, 0.5);
          window.brush.circle(
            cx + p.random(-0.04, 0.04) * CELL,
            cy + p.random(-0.04, 0.04) * CELL,
            CELL * SOMA_R * 0.4, 0.4
          );
        } else {
          window.brush.fill(0, 0, 0, 80);
          window.brush.fillBleed(p.random(0.3, 0.4), "out");
          window.brush.fillTexture(0.3, 0.25, false);
          window.brush.circle(cx, cy, CELL * BLOOM_R, 0.4);
        }
      }
      return pg;
    }

    // Converts painted pixels (dark pigment on white) to a white image whose
    // alpha is pigment density, normalised per cell.
    function buildAtlas(readPixel, size) {
      var img = p.createImage(size.w, size.h);
      var i, o, x, y, k, d, max;

      img.loadPixels();
      for (i = 0; i < SOMA_VARIANTS + BLOOM_VARIANTS; i++) {
        o = cellOrigin(i);
        max = 0;
        for (y = 0; y < CELL; y++) {
          for (x = 0; x < CELL; x++) {
            d = readPixel(o.x + x, o.y + y);
            if (d > max) max = d;
          }
        }
        max = max || 1;
        for (y = 0; y < CELL; y++) {
          for (x = 0; x < CELL; x++) {
            k = 4 * ((o.y + y) * size.w + o.x + x);
            d = readPixel(o.x + x, o.y + y) / max;
            img.pixels[k] = img.pixels[k + 1] = img.pixels[k + 2] = 255;
            img.pixels[k + 3] = Math.round(255 * Math.min(1, d));
          }
        }
      }
      img.updatePixels();
      return img;
    }

    function atlasFromPainting(pg) {
      var size = atlasSize();
      pg.loadPixels();
      var px = pg.pixels;
      return buildAtlas(function (x, y) {
        var k = 4 * (y * size.w + x);
        return 1 - (px[k] + px[k + 1] + px[k + 2]) / 765;
      }, size);
    }

    // Fallback: radial blots with a darker rim, drawn on a 2D canvas.
    function atlasFromBlots() {
      var size = atlasSize();
      var c = document.createElement("canvas");
      var ctx = c.getContext("2d");
      var i, o, r, g;

      c.width = size.w;
      c.height = size.h;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size.w, size.h);
      for (i = 0; i < SOMA_VARIANTS + BLOOM_VARIANTS; i++) {
        o = cellOrigin(i);
        r = CELL * (i < SOMA_VARIANTS ? SOMA_R : BLOOM_R * 1.4);
        g = ctx.createRadialGradient(o.x + CELL / 2, o.y + CELL / 2, 0, o.x + CELL / 2, o.y + CELL / 2, r);
        if (i < SOMA_VARIANTS) {
          g.addColorStop(0, "rgba(0,0,0,0.55)");
          g.addColorStop(0.8, "rgba(0,0,0,0.7)");
          g.addColorStop(1, "rgba(0,0,0,0)");
        } else {
          g.addColorStop(0, "rgba(0,0,0,0.4)");
          g.addColorStop(1, "rgba(0,0,0,0)");
        }
        ctx.fillStyle = g;
        ctx.fillRect(o.x, o.y, CELL, CELL);
      }
      var px = ctx.getImageData(0, 0, size.w, size.h).data;
      return buildAtlas(function (x, y) {
        return 1 - px[4 * (y * size.w + x)] / 255;
      }, size);
    }

    function layout() {
      var w = p.width;
      var h = p.height;
      var s = Math.max(SPACING, Math.sqrt((w * h) / MAX_NEURONS));
      var nAssemblies = Math.max(2, Math.round((w * h) / ASSEMBLY_AREA));
      var x, y, i;

      neurons = [];
      pending = [];
      for (y = s / 2; y < h; y += s) {
        for (x = s / 2; x < w; x += s) {
          neurons.push({
            x: x + p.random(-0.3, 0.3) * s,
            y: y + p.random(-0.3, 0.3) * s,
            r: p.random(R_MIN, R_MAX),
            rot: p.random(p.TWO_PI),
            soma: Math.floor(p.random(SOMA_VARIANTS)),
            bloom: SOMA_VARIANTS + Math.floor(p.random(BLOOM_VARIANTS)),
            c: 0,
            f: 0
          });
        }
      }

      assemblies = [];
      for (i = 0; i < nAssemblies; i++) {
        var cx = p.random(w);
        var cy = p.random(h);
        var members = [];
        neurons.forEach(function (n) {
          var d2 = (n.x - cx) * (n.x - cx) + (n.y - cy) * (n.y - cy);
          if (Math.random() < Math.exp(-d2 / (2 * ASSEMBLY_SIGMA * ASSEMBLY_SIGMA))) {
            members.push({ n: n, delay: Math.sqrt(d2) / WAVE_SPEED + Math.random() * 0.05 });
          }
        });
        assemblies.push(members);
      }
    }

    function stimulusOn() {
      return pointerInside &&
        p.mouseX >= 0 && p.mouseX <= p.width &&
        p.mouseY >= 0 && p.mouseY <= p.height;
    }

    function evoke(e) {
      var rect = el.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var k = 1 / (2 * EVOKED_SIGMA * EVOKED_SIGMA);
      neurons.forEach(function (n) {
        var d2 = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
        if (Math.random() < Math.exp(-d2 * k)) n.c += EVOKED_SPIKES;
      });
    }

    function settled() {
      return !pointerInside && pending.length === 0 &&
        neurons.every(function (n) { return n.f < 0.01; });
    }

    function step(dt) {
      var decay = Math.exp(-dt / TAU_DECAY);
      var rise = 1 - Math.exp(-dt / TAU_RISE);
      var stim = stimulusOn();
      var mx = p.mouseX;
      var my = p.mouseY;
      var k = 1 / (2 * STIM_SIGMA * STIM_SIGMA);

      t += dt;

      assemblies.forEach(function (members) {
        if (!opts.reducedMotion && Math.random() < ASSEMBLY_RATE * dt) {
          members.forEach(function (m) {
            if (Math.random() < ASSEMBLY_P_FIRE) pending.push({ t: t + m.delay, n: m.n });
          });
        }
      });

      pending = pending.filter(function (s) {
        if (s.t > t) return true;
        s.n.c += 1;
        return false;
      });

      neurons.forEach(function (n) {
        var rate = opts.reducedMotion ? 0 : BASAL_RATE;
        if (stim) {
          var d2 = (n.x - mx) * (n.x - mx) + (n.y - my) * (n.y - my);
          rate += STIM_RATE * Math.exp(-d2 * k);
        }
        if (Math.random() < rate * dt) n.c += 1;
        n.c *= decay;
        n.f += (n.c / (n.c + K_D) - n.f) * rise;
      });
    }

    function prewarm() {
      for (var i = 0; i < PREWARM * 20; i++) step(1 / 20);
    }

    function sprite(cell, x, y, d, rot, rgb, alpha) {
      var o = cellOrigin(cell);
      p.push();
      p.translate(x, y);
      p.rotate(rot);
      p.tint(rgb[0], rgb[1], rgb[2], alpha);
      p.image(atlas, 0, 0, d, d, o.x, o.y, CELL, CELL);
      p.pop();
    }

    // Sprite size that makes the painted soma radius equal n.r.
    function somaSize(n) {
      return n.r / SOMA_R;
    }

    function drawRestLayer() {
      restLayer.begin();
      p.background(BG[0], BG[1], BG[2]);
      p.push();
      p.translate(-p.width / 2, -p.height / 2);
      neurons.forEach(function (n) {
        sprite(n.soma, n.x, n.y, somaSize(n), n.rot, REST, REST_ALPHA);
      });
      p.pop();
      restLayer.end();
    }

    p.setup = function () {
      p.createCanvas(el.clientWidth, el.clientHeight, p.WEBGL);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.canvas.style.display = "block";
      p.canvas.style.visibility = "hidden";
      el.style.backgroundColor = "rgb(" + BG.join(",") + ")";
      p.canvas.setAttribute("aria-hidden", "true");
      p.imageMode(p.CENTER);
      el.addEventListener("pointerenter", function () {
        pointerInside = true;
        if (opts.reducedMotion) p.loop();
      });
      el.addEventListener("pointerleave", function () { pointerInside = false; });
      el.addEventListener("pointerdown", function (e) {
        evoke(e);
        if (opts.reducedMotion) p.loop();
      });
      layout();
      prewarm();
      if (useBrush) {
        try {
          painting = paintAtlas();
        } catch (e) {
          console.warn("p5.brush painting failed; using plain blots", e);
          painting = null;
        }
      }
      if (opts.reducedMotion) p.noLoop();
    };

    function init() {
      if (painting) {
        try {
          window.brush.load();
          atlas = atlasFromPainting(painting);
        } catch (e) {
          console.warn("reading the p5.brush painting failed; using plain blots", e);
        }
        painting.remove();
        painting = null;
      }
      if (!atlas) atlas = atlasFromBlots();
      restLayer = p.createFramebuffer();
      drawRestLayer();
      p.canvas.style.visibility = "visible";
    }

    p.draw = function () {
      if (!atlas) init();
      else step(Math.min(p.deltaTime / 1000, 0.05));

      p.background(BG[0], BG[1], BG[2]);
      p.noTint();
      p.image(restLayer, 0, 0, p.width, p.height);

      p.push();
      p.translate(-p.width / 2, -p.height / 2);
      neurons.forEach(function (n) {
        if (n.f < 0.02) return;
        var d = somaSize(n);
        sprite(n.bloom, n.x, n.y, d * (1.1 + 0.5 * n.f), -n.rot, ACTIVE, BLOOM_ALPHA * n.f);
        sprite(n.soma, n.x, n.y, d * (1 + 0.12 * n.f), n.rot, ACTIVE, 255 * n.f);
      });

      if (stimulusOn()) {
        p.noFill();
        p.stroke(ACTIVE[0], ACTIVE[1], ACTIVE[2], 80);
        p.strokeWeight(1);
        p.circle(p.mouseX, p.mouseY, STIM_SIGMA * 2);
      }
      p.pop();

      if (opts.reducedMotion && settled()) p.noLoop();
    };

    p.windowResized = function () {
      if (el.clientWidth === p.width && el.clientHeight === p.height) return;
      p.resizeCanvas(el.clientWidth, el.clientHeight);
      layout();
      prewarm();
      if (restLayer) drawRestLayer();
      if (opts.reducedMotion) p.redraw();
    };
  };
})();
