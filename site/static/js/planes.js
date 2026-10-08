// Three imaging planes stacked in true isometric view, for the cortex-wide
// dynamics publication: on its card (site/layouts/publications/li.html)
// and on its page (site/layouts/publications/single.html). Each plane is
// a sheet of paper painted after Alfred Jensen's number grids: a pencil
// grid and Prussian-blue watercolour squares on every other cell. Abstract neurons sit
// faintly in the open cells and flash like calcium transients, a fast rise
// and a slow decay: during a flash the cell fills with one of Jensen's
// colours and the neuron shows in paper white on it. Some flash on their
// own; ensembles that span all three planes flash together.
//
// Mounts every element marked data-three-sketch="planes". With
// data-fit="card" the element fills the card's empty space, from below the
// text to above "Read more", and is refit whenever the card changes size.
// At rest the planes stand in a close stack, directly above each other.
// While the card (or, on the page, the drawing) is hovered or focused they
// slide apart, stepping sideways and apart to suit the shape of the space,
// and slide back together after.
//
// The paint comes from the atlas /img/planes.webp, painted ahead of time
// with p5.brush by tools/planes-atlas.html.
//
// three.js loads only when the page has such an element. At rest the
// drawing is still, part way through its flashes. Hover or focus slides
// the planes apart and runs the flashes, which gather speed as they start
// and run down to a stop after. With reduced motion the drawing shows the
// end of the slide, the planes apart, and never moves.
(function () {
  "use strict";

  var THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js";

  // Atlas layout; keep in sync with tools/planes-atlas.html.
  var ATLAS_SRC = "/img/planes.webp";
  var PLANES = 3;
  var GRID = 9;                   // cells along each side of a plane
  var TEX = 512;                  // plane tile and texture size, px
  var MARGIN = 0.04;              // paper outside the grid, as a fraction of the plane
  var CELL = 96;                  // px, one wash or neuron tile
  var WASHES = 8, SHAPES = 8;
  var COATS = { square: 3, wash: 3, neuron: 3 };

  var GAP_RANGE = [0.5, 1.4];     // distance between planes, in plane widths
  var OFFSET_RANGE = [0.15, 0.6]; // sideways step between planes, in plane widths
  var REST_GAP = 0.25;            // distance between planes at rest, in plane widths
  // The slide is a critically damped spring: it starts from rest, eases
  // in and out with no overshoot, and a hover that ends mid-slide turns
  // the planes back without a jolt. At this stiffness they cover 95% of
  // the way in about 1.6 s.
  var SPRING = 3;                 // 1/s, natural frequency
  // How fast the flashes gather speed and run down: the natural frequency
  // (1/s) of a critically damped spring on their speed. As in usv-card.js.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;
  var FIT_MARGIN = 0.04;          // space around the stack, as a fraction of its size
  var GAP = 8;                    // px between the card's text and the drawing

  var PAPER = "#fbfaf5";
  var SQUARE = "#14213d";         // prussian blue; keep in sync with --prussian-blue
  var GRID_INK = "#2453a6";
  var GRID_ALPHA = 0.5;
  var EDGE = 0x14213d;
  // Jensen's primaries, with the theme orange for his yellow.
  var INKS = [["#fca311", 3], ["#d0342c", 2], ["#2453a6", 2], ["#4a2c6e", 1]];

  var NEURONS = 14;               // per plane
  var REST = 0.75;                // alpha of a neuron at rest
  var RATE = 0.08;                // spontaneous flashes per neuron per s
  var ENSEMBLES = 6, ENSEMBLE_SIZE = 7;
  var ENSEMBLE_INTERVAL = [0.6, 1.4]; // s between ensemble flashes
  var TAU = [0.55, 0.95];         // s, decay of a flash

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // A small seeded generator, so each plane is painted the same way on
  // every visit.
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function weighted(rand, weights) {
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = rand() * total;
    for (var i = 0; i < weights.length; i++) {
      if ((r -= weights[i]) < 0) return i;
    }
    return 0;
  }

  // A tile of the atlas in one ink, on a canvas of its own: the tile at
  // (sx, sy), size s, drawn at size `size`, turned by `angle`. Each coat
  // lays the tile down again, to deepen thin washes.
  function inked(atlas, sx, sy, s, size, ink, angle, coats) {
    var c = document.createElement("canvas");
    c.width = c.height = Math.ceil(size);
    var ctx = c.getContext("2d");
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle || 0);
    for (var k = 0; k < (coats || 1); k++) ctx.drawImage(atlas, sx, sy, s, s, -size / 2, -size / 2, size, size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // The plane without its neurons: paper, the plane's squares, the grid.
  function paintBase(atlas, t) {
    var c = document.createElement("canvas");
    c.width = c.height = TEX;
    var ctx = c.getContext("2d");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, TEX, TEX);
    ctx.drawImage(inked(atlas, t * TEX, 0, TEX, TEX, SQUARE, 0, COATS.square), 0, 0);
    ctx.globalAlpha = GRID_ALPHA;
    ctx.drawImage(inked(atlas, PLANES * TEX, 0, TEX, TEX, GRID_INK), 0, 0);
    return c;
  }

  // One plane: its painted base, its neurons and the canvas the texture
  // reads from.
  function makePlane(atlas, t, seed) {
    var rand = rng(seed);
    var base = paintBase(atlas, t);
    var m = MARGIN * TEX, cell = (TEX - 2 * m) / GRID;
    var open = [];
    for (var i = 0; i < GRID; i++) {
      for (var j = 0; j < GRID; j++) if ((i + j) % 2) open.push([i, j]);
    }
    for (var k = open.length - 1; k > 0; k--) {
      var s = Math.floor(rand() * (k + 1)), t = open[k];
      open[k] = open[s]; open[s] = t;
    }
    var neurons = open.slice(0, NEURONS).map(function (ij) {
      var ink = INKS[weighted(rand, INKS.map(function (c) { return c[1]; }))][0];
      var angle = rand() * Math.PI * 2;
      var wash = Math.floor(rand() * WASHES), shape = WASHES + Math.floor(rand() * SHAPES);
      return {
        x: m + (ij[0] + 0.5) * cell, y: m + (ij[1] + 0.5) * cell,
        square: inked(atlas, wash * CELL, TEX, CELL, cell, ink, Math.floor(rand() * 4) * Math.PI / 2, COATS.wash),
        rest: inked(atlas, shape * CELL, TEX, CELL, cell, ink, angle, COATS.neuron),
        lit: inked(atlas, shape * CELL, TEX, CELL, cell, PAPER, angle, COATS.neuron),
        a: 0, tau: TAU[0] + rand() * (TAU[1] - TAU[0])
      };
    });
    var canvas = document.createElement("canvas");
    canvas.width = canvas.height = TEX;
    return { base: base, neurons: neurons, canvas: canvas, ctx: canvas.getContext("2d"), cell: cell };
  }

  function paintPlane(p) {
    var ctx = p.ctx, cell = p.cell;
    ctx.globalAlpha = 1;
    ctx.drawImage(p.base, 0, 0);
    p.neurons.forEach(function (n) {
      var x = n.x - cell / 2, y = n.y - cell / 2;
      ctx.globalAlpha = REST * (1 - n.a);
      ctx.drawImage(n.rest, x, y, cell, cell);
      if (n.a > 0.02) {
        ctx.globalAlpha = n.a;
        ctx.drawImage(n.square, x, y, cell, cell);
        ctx.drawImage(n.lit, x, y, cell, cell);
      }
    });
    ctx.globalAlpha = 1;
  }

  function mount(THREE, atlas, el) {
    var fitCard = el.getAttribute("data-fit") === "card";
    var card = fitCard ? el.closest(".publication-card") : null;
    var host = card || el;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    var aniso = renderer.capabilities.getMaxAnisotropy();

    var planes = [], meshes = [];
    for (var i = 0; i < PLANES; i++) {
      var p = makePlane(atlas, i, 1009 * (i + 1));
      paintPlane(p);
      var tex = new THREE.CanvasTexture(p.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      p.texture = tex;
      var geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: EDGE })));
      scene.add(mesh);
      planes.push(p);
      meshes.push(mesh);
    }

    // Ensembles: a few neurons from every plane that flash together.
    var all = [];
    planes.forEach(function (p) { all = all.concat(p.neurons); });
    var rand = rng(77);
    var ensembles = [];
    for (var e = 0; e < ENSEMBLES; e++) {
      var members = [];
      while (members.length < ENSEMBLE_SIZE) {
        var n = all[Math.floor(rand() * all.length)];
        if (members.indexOf(n) < 0) members.push(n);
      }
      ensembles.push(members);
    }

    // How far the planes are slid apart: 0 in the close stack, 1 apart.
    var spreadO = 0, spreadD = REST_GAP;
    var spread = 0, velocity = 0, target = 0, slideRaf = 0, slideLast = 0;
    // The camera's right, in world space, so the offset is purely sideways
    // on screen.
    var right = new THREE.Vector3(1, 0, -1).normalize();
    function place(e) {
      var o = spreadO * e, d = REST_GAP + (spreadD - REST_GAP) * e;
      meshes.forEach(function (mesh, k) {
        var mid = k - (PLANES - 1) / 2;
        mesh.position.copy(right).multiplyScalar(-mid * o);
        mesh.position.y = mid * d;
      });
    }
    // Advances the spring by dt with its exact solution, so the motion is
    // the same at any frame rate.
    function slide(now) {
      var dt = slideLast ? Math.min(0.1, (now - slideLast) / 1000) : 0;
      slideLast = now;
      var c1 = spread - target, c2 = velocity + SPRING * c1;
      var decay = Math.exp(-SPRING * dt);
      spread = target + (c1 + c2 * dt) * decay;
      velocity = (c2 - SPRING * (c1 + c2 * dt)) * decay;
      var settled = Math.abs(spread - target) < 1e-4 && Math.abs(velocity) < 1e-3;
      if (settled) { spread = target; velocity = 0; }
      place(spread);
      if (!running) render();
      slideRaf = settled ? 0 : requestAnimationFrame(slide);
    }
    function slideTo(t) {
      target = t;
      if (!slideRaf) {
        slideLast = 0;
        slideRaf = requestAnimationFrame(slide);
      }
    }

    var w = 0, h = 0;
    function layout() {
      if (card) {
        var box = card.getBoundingClientRect();
        var cs = getComputedStyle(card);
        var top = box.top, more = null;
        Array.prototype.forEach.call(card.children, function (child) {
          if (child === el) return;
          if (child.classList.contains("publication-more")) { more = child; return; }
          if (!child.getClientRects().length) return;   // no box: the abstract's <template>
          top = Math.max(top, child.getBoundingClientRect().bottom);
        });
        var bottom = box.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth);
        if (more) bottom = more.getBoundingClientRect().top + parseFloat(getComputedStyle(more).paddingTop);
        var origin = box.top + parseFloat(cs.borderTopWidth);
        el.style.top = (top + GAP - origin) + "px";
        el.style.height = Math.max(0, bottom - GAP - top - GAP) + "px";
      }
      var nw = Math.floor(el.clientWidth), nh = Math.floor(el.clientHeight);
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      if (!w || !h) return;
      renderer.setSize(w, h);

      // Fit the stack to the space. Each plane stands sqrt(2/3) tall and
      // sqrt(2) wide on screen; the planes are d apart in height and o apart
      // sideways, the top one to the left. A wide space spreads them
      // sideways first, a tall one apart in height.
      var r = h / w, unit = Math.sqrt(2 / 3);
      var d = GAP_RANGE[0];
      var o = (unit * (1 + 2 * d) / r - Math.SQRT2) / (PLANES - 1);
      if (o < OFFSET_RANGE[0]) {
        o = OFFSET_RANGE[0];
        d = (r * (Math.SQRT2 + (PLANES - 1) * o) / unit - 1) / (PLANES - 1);
      }
      spreadO = Math.min(OFFSET_RANGE[1], o);
      spreadD = Math.min(GAP_RANGE[1], Math.max(GAP_RANGE[0], d));

      // True isometric: the camera looks down the (1, 1, 1) diagonal. The
      // view fits the planes slid apart, which also holds the close stack.
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      place(1);
      var lo = new THREE.Vector2(Infinity, Infinity), hi = new THREE.Vector2(-Infinity, -Infinity);
      meshes.forEach(function (mesh) {
        [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(function (xz) {
          var v = new THREE.Vector3(xz[0], 0, xz[1]).add(mesh.position).applyMatrix4(camera.matrixWorldInverse);
          lo.min(new THREE.Vector2(v.x, v.y));
          hi.max(new THREE.Vector2(v.x, v.y));
        });
      });
      place(spread);
      var cx = (lo.x + hi.x) / 2, cy = (lo.y + hi.y) / 2;
      var sw = (hi.x - lo.x) * (1 + 2 * FIT_MARGIN), sh = (hi.y - lo.y) * (1 + 2 * FIT_MARGIN);
      var scale = Math.max(sw / w, sh / h);  // world units per px
      camera.left = cx - w * scale / 2;
      camera.right = cx + w * scale / 2;
      camera.top = cy + h * scale / 2;
      camera.bottom = cy - h * scale / 2;
      camera.updateProjectionMatrix();
      render();
    }

    function render() {
      if (w && h) renderer.render(scene, camera);
    }

    var nextEnsemble = 0;
    function step(dt) {
      all.forEach(function (n) {
        n.a *= Math.exp(-dt / n.tau);
        if (Math.random() < RATE * dt) n.a = 1;
      });
      nextEnsemble -= dt;
      if (nextEnsemble <= 0) {
        ensembles[Math.floor(Math.random() * ensembles.length)].forEach(function (n) {
          if (Math.random() < 0.85) n.a = 1;
        });
        nextEnsemble = ENSEMBLE_INTERVAL[0] + Math.random() * (ENSEMBLE_INTERVAL[1] - ENSEMBLE_INTERVAL[0]);
      }
      planes.forEach(function (p) {
        paintPlane(p);
        p.texture.needsUpdate = true;
      });
    }

    var running = false, raf = 0, last = 0;
    var rate = 0, rateV = 0, rateTarget = 0; // speed of the flashes, 0 to 1
    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      spin(dt);
      step(dt * rate);
      render();
      if (!rateTarget && !rate) {
        stop();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    // Moves the flashes' speed towards its target along a critically
    // damped spring, with its exact solution. As in usv-card.js.
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
    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    // Start part way through, with some neurons already lit. With reduced
    // motion, show the end of the slide.
    for (var warm = 0; warm < 40; warm++) step(0.05);
    if (reducedMotion) spread = target = 1;
    layout();
    if ("ResizeObserver" in window) new ResizeObserver(layout).observe(host);
    else window.addEventListener("resize", layout);
    if (reducedMotion) return;

    // Hover and focus slide the planes apart and run the flashes.
    var active = 0;               // pointer over, focus within, in view on a touch screen: a bit each
    var set = function (bit, on) {
      var was = active;
      active = on ? active | bit : active & ~bit;
      if (!was && active) {
        slideTo(1);
        rateTarget = 1;
        start();
      } else if (was && !active) {
        slideTo(0);
        rateTarget = 0;           // the frame loop runs down and stops
      }
    };
    host.addEventListener("mouseenter", function () { set(1, true); });
    host.addEventListener("mouseleave", function () { set(1, false); });
    host.addEventListener("focusin", function () { set(2, true); });
    host.addEventListener("focusout", function () { set(2, false); });
    // No hover on a touch screen: run while most in view (in-view.js).
    if (window.inView) window.inView.watch(host, function (on) { set(4, on); });
  }

  function init() {
    var els = document.querySelectorAll('[data-three-sketch="planes"]');
    if (!els.length) return;
    var atlas = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = ATLAS_SRC;
    });
    Promise.all([import(THREE_SRC), atlas]).then(function (loaded) {
      Array.prototype.forEach.call(els, function (el) { mount(loaded[0], loaded[1], el); });
    }, function () {
      console.warn("three.js or the planes atlas could not be loaded; the planes are not drawn");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
