// Simulated calcium-imaging field of view.
//
// Each soma integrates spikes into a calcium signal that decays exponentially;
// the rendered fluorescence is a saturating function of that signal, as with a
// GCaMP-type indicator. Spikes come from three sources:
//   - basal Poisson firing in every neuron,
//   - assembly events: a spatially clustered group fires together, the activity
//     spreading outward from the assembly's centre as a travelling wave,
//   - a "stimulus" under the pointer that raises the local firing rate,
//   - an evoked burst around each click or tap.
// When the visitor prefers reduced motion, spontaneous activity is off: the
// field starts as a still frame and only moves in response to the pointer.
(function () {
  "use strict";

  var BG = [255, 253, 252];       // --off-white
  var REST = [235, 231, 230];     // --grey-2
  var ACTIVE = [255, 68, 0];      // --primary

  var SPACING = 22;               // px between neighbouring somata
  var MAX_NEURONS = 900;
  var BASAL_RATE = 0.025;         // spikes / s / neuron
  var ASSEMBLY_AREA = 30000;      // px^2 of field per assembly
  var ASSEMBLY_RATE = 0.1;        // events / s / assembly
  var ASSEMBLY_SIGMA = 70;        // px, spatial spread of membership
  var ASSEMBLY_P_FIRE = 0.8;      // probability a member joins an event
  var WAVE_SPEED = 500;           // px / s
  var STIM_RATE = 6;              // peak spikes / s under the pointer
  var STIM_SIGMA = 45;            // px
  var EVOKED_SIGMA = 55;          // px, spread of the click / tap burst
  var EVOKED_SPIKES = 2;          // spikes per recruited neuron
  var TAU_DECAY = 0.9;            // s, calcium decay
  var TAU_RISE = 0.05;            // s, indicator rise
  var K_D = 0.8;                  // indicator half-saturation, in spikes
  var PREWARM = 3;                // s simulated before the first frame

  window.p5Sketches = window.p5Sketches || {};

  window.p5Sketches.neurons = function (p, opts) {
    var el = opts.el;
    var neurons = [];
    var assemblies = [];
    var pending = [];             // scheduled spikes: {t, n}
    var t = 0;
    var pointerInside = false;

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
            x: x + p.random(-0.35, 0.35) * s,
            y: y + p.random(-0.35, 0.35) * s,
            r: p.random(2.2, 4.2),
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

    p.setup = function () {
      p.createCanvas(el.clientWidth, el.clientHeight);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.canvas.style.display = "block";
      p.canvas.setAttribute("aria-hidden", "true");
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
      if (opts.reducedMotion) p.noLoop();
    };

    p.draw = function () {
      if (p.frameCount > 1) step(Math.min(p.deltaTime / 1000, 0.05));

      p.background(BG[0], BG[1], BG[2]);
      p.noStroke();

      neurons.forEach(function (n) {
        if (n.f < 0.03) return;
        p.fill(ACTIVE[0], ACTIVE[1], ACTIVE[2], 30 * n.f);
        p.circle(n.x, n.y, n.r * (5 + 6 * n.f));
        p.fill(ACTIVE[0], ACTIVE[1], ACTIVE[2], 60 * n.f);
        p.circle(n.x, n.y, n.r * (3 + 2 * n.f));
      });

      neurons.forEach(function (n) {
        p.fill(
          REST[0] + (ACTIVE[0] - REST[0]) * n.f,
          REST[1] + (ACTIVE[1] - REST[1]) * n.f,
          REST[2] + (ACTIVE[2] - REST[2]) * n.f
        );
        p.circle(n.x, n.y, n.r * 2 * (1 + 0.3 * n.f));
      });

      if (stimulusOn()) {
        p.noFill();
        p.stroke(ACTIVE[0], ACTIVE[1], ACTIVE[2], 70);
        p.strokeWeight(1);
        p.circle(p.mouseX, p.mouseY, STIM_SIGMA * 2);
      }

      if (opts.reducedMotion && settled()) p.noLoop();
    };

    p.windowResized = function () {
      if (el.clientWidth === p.width && el.clientHeight === p.height) return;
      p.resizeCanvas(el.clientWidth, el.clientHeight);
      layout();
      prewarm();
      if (opts.reducedMotion) p.redraw();
    };
  };
})();
