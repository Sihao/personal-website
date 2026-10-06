// Watercolor astrocytes, driven by a simulated calcium-imaging model.
//
// Each cell is split into compartments: the soma, each process, and the
// microdomains in the haze of fine processes around them (and in the
// neuropil between cells). Somatic and microdomain signals are largely
// decoupled in astrocytes, so every compartment has its own calcium signal,
// its own rate of spontaneous events and its own kinetics: microdomain
// events are the most frequent and the briefest, somatic events the rarest
// and the longest. Calcium decays exponentially; the rendered fluorescence
// is a saturating function of it, as with a GCaMP-type indicator.
//
// Events come from four sources:
//   - spontaneous events in single compartments,
//   - intercellular calcium waves that start at one cell and spread outwards,
//     recruiting each compartment with a probability that falls off with
//     distance,
//   - a "stimulus" under the pointer that raises the local event rate,
//   - a wave evoked from each click or tap.
// When the visitor prefers reduced motion, spontaneous activity is off: the
// field starts as a still frame and only moves in response to the pointer.
//
// The cells are sprites from /img/astrocytes.webp (white, alpha = pigment
// density) with a matching label map, /img/astrocytes-labels.png, both made
// by tools/astrocyte-atlas.html. Activity changes only a compartment's
// colour, never its size.
(function () {
  "use strict";

  // Atlas layout; keep in sync with tools/astrocyte-atlas.html.
  var ATLAS_SRC = "/img/astrocytes.webp";
  var LABELS_SRC = "/img/astrocytes-labels.png";
  var CELL = 320;
  var COLS = 4;
  var ASTROCYTES = 6;
  var NEUROPIL = 2;
  var SOMA = 1;                   // label values in the red channel
  var DOMAIN0 = 100;              // 2..99 are processes

  var BG = "#14213d";             // --prussian-blue
  var REST = "#e5e5e5";           // --alabaster-grey
  var ACTIVE = [252, 163, 17];    // --orange
  var REST_ALPHA = 0.42;
  var NEUROPIL_ALPHA = 0.1;
  var NEUROPIL_ACTIVE = 0.75;     // peak opacity of a lit neuropil microdomain
  var DOMAIN_GAMMA = 0.6;         // < 1 lifts faint haze when it lights up
  var DOMAIN_GAIN = 1.8;          // and so does this
  var FEATHER = { soma: 5, process: 5, domain: 8 };  // atlas px of soft border

  var SPACING = 160;              // px between astrocyte centres
  var SPRITE = 1.0;               // sprite size, in units of SPACING
  var STAGGER = 0.2;              // vertical offset of alternate cells, in units of SPACING
  var NEUROPIL_SPACING = 110;     // px

  // Kinetics per compartment type. rate: spontaneous events / s; rise:
  // indicator time constant, s; decay: calcium time constant, s.
  var KINDS = {
    soma: { rate: 0.03, rise: 0.12, decay: 0.9 },
    process: { rate: 0.06, rise: 0.08, decay: 0.5 },
    domain: { rate: 0.1, rise: 0.05, decay: 0.3 }
  };
  var NEUROPIL_RATE = 0.4;        // scales the domain rate in neuropil
  var WAVE_RATE = 0.05;           // spontaneous waves / s per 100,000 px^2
  var WAVE_SPEED = 160;           // px / s
  var WAVE_LAMBDA = 200;          // px, length constant of recruitment
  var STIM_RATE = 2;              // peak events / s / compartment under the pointer
  var STIM_SIGMA = 70;            // px
  var EVOKED_LAMBDA = 160;        // px, recruitment by a click / tap wave
  var EVOKED_EVENTS = 1.5;        // calcium per recruited compartment
  var K_D = 0.8;                  // indicator half-saturation
  var PREWARM = 3;                // s simulated before the first frame

  function cellOrigin(i) {
    return { x: (i % COLS) * CELL, y: Math.floor(i / COLS) * CELL };
  }

  function kindOf(label) {
    return label === SOMA ? "soma" : label < DOMAIN0 ? "process" : "domain";
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

  // Used if the painted atlas cannot be loaded: blurred stars.
  function fallbackAtlas() {
    var rows = Math.ceil((ASTROCYTES + NEUROPIL) / COLS);
    var c = canvas(COLS * CELL, rows * CELL);
    var ctx = c.getContext("2d");
    var i, k, o, a;
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

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  // Softens a 0/1 mask with two passes of a box blur of radius r. The
  // blurred masks of neighbouring compartments still sum to 1, so their
  // borders fade into each other instead of showing as hard edges.
  function feather(mask, w, h, r) {
    var a = mask;
    var b = new Float32Array(w * h);
    for (var pass = 0; pass < 4; pass++) {
      var horiz = pass % 2 === 0;
      var n = horiz ? w : h;
      var lines = horiz ? h : w;
      var at = function (line, i) {
        i = Math.min(n - 1, Math.max(0, i));
        return horiz ? line * w + i : i * w + line;
      };
      for (var line = 0; line < lines; line++) {
        var sum = 0;
        for (var i = -r; i <= r; i++) sum += a[at(line, i)];
        for (i = 0; i < n; i++) {
          b[at(line, i)] = sum / (2 * r + 1);
          sum += a[at(line, i + r + 1)] - a[at(line, i - r)];
        }
      }
      var t = a; a = b; b = t;
    }
    return a;
  }

  function pixelsOf(img) {
    var c = canvas(img.width, img.height);
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  }

  // Splits each atlas tile into compartments. Each compartment gets an
  // orange sprite of its own pixels, cropped to its bounding box, and a
  // centroid relative to the tile centre. Without a label map, every tile is
  // a single process-like compartment.
  function compartments(atlas, labelImg) {
    var w = atlas.width;
    var density = pixelsOf(atlas);
    var labels = labelImg && labelImg.width === w && labelImg.height === atlas.height ?
      pixelsOf(labelImg) : null;
    var tiles = [];
    for (var s = 0; s < ASTROCYTES + NEUROPIL; s++) {
      var o = cellOrigin(s);
      var byLabel = {};
      var x, y, k, l, b;
      for (y = 0; y < CELL; y++) {
        for (x = 0; x < CELL; x++) {
          k = 4 * ((o.y + y) * w + o.x + x);
          if (!density[k + 3]) continue;
          l = labels ? labels[k] : 2;
          if (!l) continue;
          b = byLabel[l] || (byLabel[l] = { x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0, n: 0 });
          b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
          b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
          b.sx += x; b.sy += y; b.n++;
        }
      }
      var comps = [];
      Object.keys(byLabel).forEach(function (key) {
        var label = +key;
        var c = byLabel[key];
        var kind = kindOf(label);
        var m = FEATHER[kind];
        c.x0 = Math.max(0, c.x0 - m); c.x1 = Math.min(CELL - 1, c.x1 + m);
        c.y0 = Math.max(0, c.y0 - m); c.y1 = Math.min(CELL - 1, c.y1 + m);
        var cw = c.x1 - c.x0 + 1;
        var ch = c.y1 - c.y0 + 1;
        var mask = new Float32Array(cw * ch);
        var xx, yy, src;
        for (yy = 0; yy < ch; yy++) {
          for (xx = 0; xx < cw; xx++) {
            src = 4 * ((o.y + c.y0 + yy) * w + o.x + c.x0 + xx);
            mask[yy * cw + xx] = !labels || labels[src] === label ? 1 : 0;
          }
        }
        if (labels) mask = feather(mask, cw, ch, m);
        var spr = canvas(cw, ch);
        var ctx = spr.getContext("2d");
        var img = ctx.createImageData(cw, ch);
        for (yy = 0; yy < ch; yy++) {
          for (xx = 0; xx < cw; xx++) {
            src = 4 * ((o.y + c.y0 + yy) * w + o.x + c.x0 + xx);
            var a = density[src + 3] / 255;
            var dst = 4 * (yy * cw + xx);
            img.data[dst] = ACTIVE[0];
            img.data[dst + 1] = ACTIVE[1];
            img.data[dst + 2] = ACTIVE[2];
            img.data[dst + 3] = Math.round(255 * mask[yy * cw + xx] *
              (kind === "domain" ? Math.min(1, DOMAIN_GAIN * Math.pow(a, DOMAIN_GAMMA)) : a));
          }
        }
        ctx.putImageData(img, 0, 0);
        comps.push({
          kind: kind,
          sprite: spr,
          x0: c.x0, y0: c.y0, w: cw, h: ch,
          cx: c.sx / c.n - CELL / 2,
          cy: c.sy / c.n - CELL / 2
        });
      });
      // Haze underneath, processes over it, soma on top.
      var order = { domain: 0, process: 1, soma: 2 };
      comps.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
      tiles.push(comps);
    }
    return tiles;
  }

  window.p5Sketches = window.p5Sketches || {};

  window.p5Sketches.astrocytes = function (p, opts) {
    var el = opts.el;
    var cells = [];               // sprite instances: astrocytes then neuropil
    var units = [];               // one per compartment of each instance
    var pending = [];             // scheduled events: {t, unit, amount}
    var t = 0;
    var pointerInside = false;
    var restAtlas = null;
    var tiles = null;
    var restLayer = null;         // p5.Graphics: background, neuropil, resting cells

    function layout() {
      var w = p.width;
      var h = p.height;
      var rowStep = SPACING * 0.87;
      var rows = Math.max(1, Math.round(h / rowStep));
      var y0 = (h - (rows - 1) * rowStep) / 2;
      var r, i, x, y;

      // Neuropil first so that it is drawn underneath. The astrocytes sit in
      // staggered rows, extending past the edges so that cells are cropped by
      // the field of view rather than missing from it.
      cells = [];
      for (y = 0; y < h + NEUROPIL_SPACING; y += NEUROPIL_SPACING) {
        for (x = 0; x < w + NEUROPIL_SPACING; x += NEUROPIL_SPACING) {
          cells.push({
            x: x + p.random(-0.4, 0.4) * NEUROPIL_SPACING,
            y: y + p.random(-0.4, 0.4) * NEUROPIL_SPACING,
            sprite: ASTROCYTES + Math.floor(p.random(NEUROPIL)),
            rot: p.random(p.TWO_PI),
            flip: 1,
            size: NEUROPIL_SPACING * 1.6,
            neuropil: true
          });
        }
      }
      for (r = 0; r < rows; r++) {
        for (i = 0, x = (r % 2 ? SPACING / 2 : 0); x < w + SPACING / 2; i++, x += SPACING) {
          cells.push({
            x: x + p.random(-0.08, 0.08) * SPACING,
            y: y0 + r * rowStep + (i % 2 ? 1 : -1) * STAGGER * SPACING + p.random(-0.05, 0.05) * SPACING,
            sprite: Math.floor(p.random(ASTROCYTES)),
            rot: p.random(p.TWO_PI),
            flip: p.random() < 0.5 ? -1 : 1,
            size: SPACING * SPRITE * p.random(0.85, 1.1),
            neuropil: false
          });
        }
      }
      placeUnits();
    }

    // Compartments in canvas coordinates. Needs the atlas, so it runs again
    // once that has loaded.
    function placeUnits() {
      units = [];
      pending = [];
      if (!tiles) return;
      cells.forEach(function (s) {
        var k = s.size / CELL;
        var cos = Math.cos(s.rot);
        var sin = Math.sin(s.rot);
        tiles[s.sprite].forEach(function (comp) {
          var u = comp.cx * s.flip * k;
          var v = comp.cy * k;
          var kind = KINDS[comp.kind];
          units.push({
            cell: s,
            comp: comp,
            x: s.x + u * cos - v * sin,
            y: s.y + u * sin + v * cos,
            rate: kind.rate * (s.neuropil ? NEUROPIL_RATE : 1),
            rise: kind.rise,
            decay: kind.decay,
            peak: s.neuropil ? NEUROPIL_ACTIVE : 1,
            c: 0,
            f: 0
          });
        });
      });
    }

    function transform(ctx, s) {
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.scale(s.flip, 1);
    }

    function drawRestLayer() {
      if (!restLayer) restLayer = p.createGraphics(p.width, p.height);
      else restLayer.resizeCanvas(p.width, p.height);
      var ctx = restLayer.drawingContext;
      ctx.save();
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, p.width, p.height);
      cells.forEach(function (s) {
        var o = cellOrigin(s.sprite);
        ctx.save();
        ctx.globalAlpha = s.neuropil ? NEUROPIL_ALPHA : REST_ALPHA;
        transform(ctx, s);
        ctx.drawImage(restAtlas, o.x, o.y, CELL, CELL, -s.size / 2, -s.size / 2, s.size, s.size);
        ctx.restore();
      });
      ctx.restore();
    }

    // Spreads a wave from (x, y): each compartment joins with a probability
    // that falls off with distance, when the wave front reaches it.
    function wave(x, y, lambda, amount) {
      units.forEach(function (u) {
        var d = Math.hypot(u.x - x, u.y - y);
        if (Math.random() < Math.exp(-d / lambda)) {
          pending.push({ t: t + d / WAVE_SPEED, unit: u, amount: amount });
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
        units.every(function (u) { return u.f < 0.01; });
    }

    function step(dt) {
      var stim = stimulusOn();
      var k = 1 / (2 * STIM_SIGMA * STIM_SIGMA);

      t += dt;

      if (!opts.reducedMotion && units.length &&
          Math.random() < WAVE_RATE * (p.width * p.height / 1e5) * dt) {
        var origin = cells[Math.floor(Math.random() * cells.length)];
        wave(origin.x, origin.y, WAVE_LAMBDA, 1);
      }

      pending = pending.filter(function (e) {
        if (e.t > t) return true;
        e.unit.c += e.amount;
        return false;
      });

      units.forEach(function (u) {
        var rate = opts.reducedMotion ? 0 : u.rate;
        if (stim) {
          var d2 = (u.x - p.mouseX) * (u.x - p.mouseX) + (u.y - p.mouseY) * (u.y - p.mouseY);
          rate += STIM_RATE * Math.exp(-d2 * k);
        }
        if (Math.random() < rate * dt) u.c += 1;
        u.c *= Math.exp(-dt / u.decay);
        u.f += (u.c / (u.c + K_D) - u.f) * (1 - Math.exp(-dt / u.rise));
      });
    }

    function prewarm() {
      for (var i = 0; i < PREWARM * 30; i++) step(1 / 30);
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
      Promise.all([loadImage(ATLAS_SRC), loadImage(LABELS_SRC)]).then(function (imgs) {
        var atlas = imgs[0];
        if (!atlas) {
          console.warn("could not load " + ATLAS_SRC + "; using plain shapes");
          atlas = fallbackAtlas();
        }
        restAtlas = tinted(atlas, REST);
        tiles = compartments(atlas, imgs[0] && imgs[1]);
        placeUnits();
        prewarm();
        drawRestLayer();
        p.canvas.style.visibility = "visible";
        p.redraw();
      });
      if (opts.reducedMotion) p.noLoop();
    };

    p.draw = function () {
      if (!restLayer) return;
      // Small steps keep the briefest transients smooth at low frame rates.
      if (p.frameCount > 1) {
        var dt = Math.min(p.deltaTime / 1000, 0.1);
        var n = Math.ceil(dt / 0.02);
        for (var i = 0; i < n; i++) step(dt / n);
      }

      var ctx = p.drawingContext;
      p.image(restLayer, 0, 0, p.width, p.height);
      units.forEach(function (u) {
        if (u.f < 0.02) return;
        var s = u.cell;
        var c = u.comp;
        var k = s.size / CELL;
        ctx.save();
        ctx.globalAlpha = Math.min(1, u.f) * u.peak;
        transform(ctx, s);
        ctx.drawImage(c.sprite, -s.size / 2 + c.x0 * k, -s.size / 2 + c.y0 * k, c.w * k, c.h * k);
        ctx.restore();
      });

      if (stimulusOn()) {
        ctx.save();
        ctx.strokeStyle = "rgb(" + ACTIVE.join(",") + ")";
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
