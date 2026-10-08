// A larval zebrafish, seen from above, swimming into the bottom right
// corner of its frame, for the lateral-line publication: on its card
// (site/layouts/publications/li.html) and on its page (single.html).
// Mounts every element marked data-drawing="zebrafish"; with
// data-fit="card" the element fills the card's empty space, from below
// the text to the bottom of the padding, and is refit whenever the card
// changes size.
//
// The body rests in a gentle curve. The fish swims on the spot: a slow
// wave runs down its body from the head to the tail. Each frame bends the
// one straight painting of the fish along the spine of that moment, which
// keeps the body's length: WebGL draws the painting on a strip of
// triangles laid along the spine, so the swim is smooth at any frame rate
// and every frame has the same brush marks. Without WebGL the painting is
// bent pixel by pixel on the CPU.
//
// The neuromasts sense the water the tail pushes: as the wave carries
// each part of the tail sideways, the neuromasts on the side that pushes
// into the water light up, so the light runs down the tail with each
// beat, on one side and then the other. The brain lights up with them,
// above all the medial octavolateralis nucleus (MON) of the hindbrain on
// the far side: neuromasts on the left of the tail light the right MON,
// and the left MON only faintly. The tectum, the telencephalon and the
// rest of the hindbrain light up a little too, by a random amount on each
// beat, the far tectum most.
//
// The tail leaves a wake, drawn plainly: at each end of its stroke it
// lets go of a faint watercolour crescent, which drifts back from the tail,
// widening and fading, like a ripple. The crescents face back and out to
// the side the tail swung to, so they come in two rows; those on one side
// are a deep blue, on the other a light one.
//
// Motion policy (see site/static/js/p5-mount.js): at rest the drawing is
// still and unlit, with no wake. While the card (or, on the page, the drawing) is
// hovered or focused, the fish swims and the neuromasts light, gathering
// speed as the hover starts and running down when it ends. With reduced
// motion the drawing is a still frame, with the neuromasts lit as at the
// height of a beat and
// the wake of a few beats behind it.
//
// The straight fish and the glow come from /img/zebrafish.webp (white,
// alpha = pigment density), painted with p5.brush by
// tools/zebrafish-atlas.html.
(function () {
  "use strict";

  // Atlas layout and the body's curve; keep in sync with
  // tools/zebrafish-atlas.html.
  var ATLAS_SRC = "/img/zebrafish.webp";
  var FISH_W = 512;
  var FISH_H = 260;
  var LAYERS = 4;                 // base, wash, brain, neuromasts
  var SEGMENTS = 160;              // of the strip along the spine
  var GLOW = 64;
  var MID = 100;                  // the straight fish's midline, tile px
  var NOSE_X = 472;
  var TAIL_X = 18;
  var BEND = 0.2;
  var SWIM = 0.07;
  var WAVE = 1.3;
  var SPINE_STEP = 2;
  var REACH = 64;                 // tile px either side of the spine that bend with it
  var PROFILE = [[40, 2], [60, 6], [150, 11], [250, 16], [330, 22], [372, 28], [395, 32], [430, 31], [455, 26], [468, 15], [472, 0]];
  var NM_X = [345, 300, 255, 210, 165, 120, 82];
  var NM_TIP = [[52, -3], [48, 4]];

  var SWIM_HZ = 0.8;              // beats per second at full speed

  // Colour, opacity and passes of each fish layer at rest, over a paper
  // white underlay: the body (laid twice, as its pigment is thin), dark
  // eyes, the brain faint, the neuromasts as dark dots.
  var PAPER = "#ffffff";
  var LAYER_TINTS = [["#4a4a4e", 0.7, 2], ["#151517", 0.9, 1], ["#2f2f31", 0.35, 1], ["#202022", 0.85, 1]];
  var FLASH = "#fca311";          // the theme orange

  // Placement, as fractions of the frame, and the heading: the fish
  // swims down and to the right, its tail up and to the left.
  var HEADING = 58 * Math.PI / 180;
  var PLACES = {
    card: { nose: [0.86, 0.9], len: [0.46, 0.55] },   // length: of the width, of the height, whichever is less
    page: { nose: [0.8, 0.88], len: [0.85, 0.42] }
  };

  // Neuromasts: each lights as its side of the body moves into the water,
  // once that motion passes LIT_FROM of its peak; motion counts more
  // towards the tail, which swings most. Each light rises with time
  // constant RISE s and fades with FALL s. Each region of the brain
  // follows the brightest neuromast on each side of the body times its
  // gain for that side, whichever is more, and fades with BRAIN_FALL s.
  // The MON's gains are fixed: CONTRA for the far side, IPSI for its own.
  // The other regions' gains are drawn from GAINS each time a side starts
  // to light: [low, high] for the far side and for the near side.
  var LIT_FROM = 0.5;
  var RISE = 0.05;
  var FALL = 0.25;
  var BRAIN_FALL = 0.4;
  var GLOW_SIZE = 0.075;          // of a fish length
  var BRAIN_PEAK = 0.9;
  var CONTRA = 1;
  var IPSI = 0.25;

  // The regions of the brain, as soft ellipses on the straight fish (tile
  // px): centre, radii, and the side of the midline each is on (-1, +1,
  // or 0 for both). Keep in sync with the brain in the atlas tool.
  var REGIONS = [
    { name: "mon", c: [382, MID - 6], r: [20, 6], side: -1 },
    { name: "mon", c: [382, MID + 6], r: [20, 6], side: 1 },
    { name: "tectum", c: [423, MID - 12], r: [18, 12], side: -1 },
    { name: "tectum", c: [423, MID + 12], r: [18, 12], side: 1 },
    { name: "telencephalon", c: [455, MID], r: [11, 12], side: 0 },
    { name: "hindbrain", c: [380, MID], r: [32, 13], side: 0 }
  ];
  var GAINS = {
    tectum: [[0.2, 0.55], [0, 0.2]],
    telencephalon: [[0, 0.3], [0, 0.3]],
    hindbrain: [[0.05, 0.3], [0.05, 0.3]]
  };

  // How much of the pixel at (x, y), on the straight fish, belongs to
  // region i: 1 inside its ellipse, fading out over its outer part.
  function inRegion(i, x, y) {
    var g = REGIONS[i], dx = (x - g.c[0]) / g.r[0], dy = (y - g.c[1]) / g.r[1];
    var d = Math.sqrt(dx * dx + dy * dy), t = Math.min(1, Math.max(0, (d - 0.7) / 0.3));
    return 1 - t * t * (3 - 2 * t);
  }

  // The wake, in tile px of the straight fish (the fish's own frame) and
  // s. A crescent is let go at the tail tip as the tip turns back. Its
  // middle drifts back at DRIFT; it widens from RING[0] to RING[1] px
  // across over its RING_LIFE s, fading in over RING_IN s and out over the
  // last RING_OUT; it faces back, turned RING_TURN rad out to its side.
  var DRIFT = 110;
  var RING = [30, 170];
  var RING_LIFE = 3.4;
  var RING_IN = 0.2;
  var RING_OUT = 2;
  var RING_TURN = 0.55;
  var RING_ALPHA = 0.9;
  var RING_ART = 256;             // px across a crescent sprite
  var RING_KINDS = 3;             // sprites of each blue, each its own shape
  // The two blues: deep, light.
  var RING_INKS = [[24, 70, 150], [120, 175, 220]];
  var RING_EDGE = 36;             // CSS px over which a crescent fades out before the frame's sides

  // How fast the drawing gathers speed and runs down: the natural
  // frequency (1/s) of a critically damped spring, as on the other cards.
  var SPIN_UP = 12;
  var RUN_DOWN = 7;
  var GAP = 8;                    // px between the card's text and the drawing

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function halfWidth(x) {
    for (var i = 1; i < PROFILE.length; i++) {
      if (x <= PROFILE[i][0]) {
        var a = PROFILE[i - 1], b = PROFILE[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return 0;
  }

  // The spine for a phase of the beat, as in the atlas tool: points every
  // SPINE_STEP px of length from the nose, each with its unit normal.
  function spine(phase) {
    var L = NOSE_X - TAIL_X, pts = [];
    var x = NOSE_X, y = MID;
    for (var s = 0; s <= L + 40; s += SPINE_STEP) {
      var u = Math.min(1, s / L), psi = 2 * Math.PI * (u / WAVE - phase);
      var slope = 2 * u * (BEND + SWIM * Math.sin(psi)) + u * u * SWIM * 2 * Math.PI / WAVE * Math.cos(psi);
      var a = Math.atan(slope);
      pts.push([x, y, Math.sin(a), Math.cos(a)]);
      x -= SPINE_STEP * Math.cos(a);
      y += SPINE_STEP * Math.sin(a);
    }
    return pts;
  }

  // A point of the straight fish -> the fish bent along a spine.
  function bendPt(sp, x, y) {
    var s = Math.max(0, (NOSE_X - x) / SPINE_STEP);
    var i = Math.min(sp.length - 2, Math.floor(s)), f = s - i;
    var a = sp[i], b = sp[i + 1], v = y - MID;
    return [a[0] + (b[0] - a[0]) * f + v * (a[2] + (b[2] - a[2]) * f),
            a[1] + (b[1] - a[1]) * f + v * (a[3] + (b[3] - a[3]) * f)];
  }

  // The neuromasts on the straight fish, and where each pose puts them.
  var NEUROMASTS = [];
  NM_X.forEach(function (x) {
    [-1, 1].forEach(function (s) { NEUROMASTS.push([x, MID + s * Math.max(2, halfWidth(x) - 1.5)]); });
  });
  NM_TIP.forEach(function (q) { NEUROMASTS.push([q[0], MID + q[1]]); });
  function canvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // A region of the atlas in one ink.
  function tinted(atlas, sx, sy, sw, sh, ink) {
    var c = canvas(sw, sh);
    var ctx = c.getContext("2d");
    ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, sw, sh);
    return c;
  }

  // The straight fish at rest, over a paper white underlay, and its brain
  // lit; and a lit neuromast.
  function sprites(atlas) {
    var fish = canvas(FISH_W, FISH_H), ctx = fish.getContext("2d");
    ctx.drawImage(tinted(atlas, 0, 0, FISH_W, FISH_H, PAPER), 0, 0);
    LAYER_TINTS.forEach(function (t, l) {
      var layer = tinted(atlas, l * FISH_W, 0, FISH_W, FISH_H, t[0]);
      ctx.globalAlpha = t[1];
      for (var pass = 0; pass < t[2]; pass++) ctx.drawImage(layer, 0, 0);
    });
    return {
      fish: fish,
      brain: tinted(atlas, 2 * FISH_W, 0, FISH_W, FISH_H, FLASH),
      glow: tinted(atlas, 0, FISH_H, GLOW, GLOW, FLASH),
      rings: RING_INKS.map(function (ink, i) {
        var kinds = [];
        for (var k = 0; k < RING_KINDS; k++) kinds.push(crescent(ink, 1 + i * RING_KINDS + k));
        return kinds;
      })
    };
  }

  // Bends the fish with WebGL: the straight fish, and its brain lit, as
  // textures on a strip of triangles that runs along the spine, REACH px
  // either side of it, from the back of the tile behind the tail to its
  // front edge ahead of the nose. draw(sp, brain), brain being how lit
  // each of REGIONS is, returns a canvas the
  // size of a fish tile holding the bent fish. Null without WebGL.
  function glBender(art) {
    var c = canvas(FISH_W, FISH_H);
    var gl = c.getContext("webgl", { premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    function shader(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER,
      "attribute vec2 pos; attribute vec2 uv; varying vec2 vUv; uniform vec2 size;" +
      "void main() { vUv = uv; gl_Position = vec4(pos.x / size.x * 2.0 - 1.0, 1.0 - pos.y / size.y * 2.0, 0.0, 1.0); }"));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER,
      "precision mediump float; varying vec2 vUv; uniform sampler2D fish; uniform sampler2D brain;" +
      "uniform vec4 regions[6]; uniform float lit[6]; uniform vec2 tile;" +
      "void main() { vec4 f = texture2D(fish, vUv); vec2 p = vUv * tile; float l = 0.0;" +
      "  for (int i = 0; i < 6; i++) {" +
      "    float d = length((p - regions[i].xy) / regions[i].zw);" +
      "    l = max(l, lit[i] * (1.0 - smoothstep(0.7, 1.0, d))); }" +
      "  vec4 b = texture2D(brain, vUv) * l;" +
      "  gl_FragColor = b + f * (1.0 - b.a); }"));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("zebrafish: WebGL program did not link; bending on the CPU", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);
    function texture(src, unit) {
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    texture(art.fish, 0);
    texture(art.brain, 1);
    gl.uniform1i(gl.getUniformLocation(prog, "fish"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "brain"), 1);
    gl.uniform2f(gl.getUniformLocation(prog, "size"), FISH_W, FISH_H);
    gl.uniform2f(gl.getUniformLocation(prog, "tile"), FISH_W, FISH_H);
    var litAt = gl.getUniformLocation(prog, "lit");
    gl.uniform4fv(gl.getUniformLocation(prog, "regions"), new Float32Array([].concat.apply([], REGIONS.map(function (g) {
      return [g.c[0], g.c[1], g.r[0], g.r[1]];
    }))));
    // Pairs of vertices across the strip: [x, y, u, v] each.
    var count = 2 * (SEGMENTS + 2);
    var verts = new Float32Array(count * 4);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    var posAt = gl.getAttribLocation(prog, "pos"), uvAt = gl.getAttribLocation(prog, "uv");
    gl.enableVertexAttribArray(posAt);
    gl.enableVertexAttribArray(uvAt);
    gl.vertexAttribPointer(posAt, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(uvAt, 2, gl.FLOAT, false, 16, 8);
    gl.viewport(0, 0, FISH_W, FISH_H);
    gl.clearColor(0, 0, 0, 0);
    function pair(k, x, y, sp) {
      [-REACH, REACH].forEach(function (v, side) {
        var b = sp ? bendPt(sp, x, MID + v) : [x, MID + v];
        var q = 4 * (2 * k + side);
        verts[q] = b[0];
        verts[q + 1] = b[1];
        verts[q + 2] = x / FISH_W;
        verts[q + 3] = (MID + v) / FISH_H;
      });
    }
    return {
      draw: function (sp, brain) {
        // The head end of the strip, ahead of the nose, does not bend.
        pair(0, FISH_W, 0, null);
        for (var i = 0; i <= SEGMENTS; i++) pair(i + 1, NOSE_X - i * NOSE_X / SEGMENTS, 0, sp);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
        gl.uniform1fv(litAt, new Float32Array(brain));
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
        return c;
      }
    };
  }

  // A watercolour crescent in one blue, on a RING_ART px square, facing +x:
  // a ring a little ragged at its edges, thinning to nothing at its ends,
  // darker where the pigment pools at its edges, with the grain of the
  // paper. `seed` gives each sprite its own shape.
  function crescent(ink, seed) {
    var n = RING_ART, c = canvas(n, n), ctx = c.getContext("2d");
    var img = ctx.createImageData(n, n), d = img.data;
    function hash(x, y) {
      var v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
      return v - Math.floor(v);
    }
    function noise(x, y) {
      var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      var a = hash(i, j), b = hash(i + 1, j), e = hash(i, j + 1), f = hash(i + 1, j + 1);
      return a + (b - a) * fx + (e - a) * fy + (a - b - e + f) * fx * fy;
    }
    var R = n * 0.33, T = n * 0.065, SPAN = 1.3;   // radius, half-width, half the arc (rad)
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var dx = x - n / 2, dy = y - n / 2, r = Math.sqrt(dx * dx + dy * dy), th = Math.atan2(dy, dx);
        var along = Math.abs(th) / SPAN;
        if (along >= 1) continue;
        // Thick in the middle of the arc, thin at its ends; ragged edges.
        var half = T * Math.pow(Math.cos(along * Math.PI / 2), 0.8) * (0.7 + 0.6 * noise(th * 3, 1.5));
        var off = (r - R - T * 0.6 * (noise(th * 5, 4.5) - 0.5)) / Math.max(0.5, half);
        if (Math.abs(off) >= 1) continue;
        var edge = Math.abs(off);
        var body = Math.pow(1 - edge * edge, 2);
        var rim = Math.pow(edge, 2) * body;
        var grain = 0.8 + 0.4 * noise(x * 0.35, y * 0.35);
        var a = (0.35 + 0.2 * noise(x * 0.06, y * 0.06) + 0.45 * rim) * body * grain;
        var q = 4 * (y * n + x);
        d[q] = ink[0];
        d[q + 1] = ink[1];
        d[q + 2] = ink[2];
        d[q + 3] = Math.round(255 * Math.min(1, a));
      }
    }
    ctx.putImageData(img, 0, 0);
    var soft = canvas(n, n), sctx = soft.getContext("2d");
    sctx.filter = "blur(" + Math.round(n * 0.025) + "px)";   // diffuse edges
    sctx.drawImage(c, 0, 0);
    return soft;
  }

  // Bends the fish on the CPU, for browsers without WebGL: each pixel of
  // the bent fish takes its colour from where the bend carried it from.
  function cpuBender(art) {
    var straight = canvas(FISH_W, FISH_H), sctx = straight.getContext("2d");
    var out = canvas(FISH_W, FISH_H), octx = out.getContext("2d");
    var img = octx.createImageData(FISH_W, FISH_H);
    // The lit brain, and how much each pixel of it belongs to each region.
    var bctx = canvas(FISH_W, FISH_H).getContext("2d");
    bctx.drawImage(art.brain, 0, 0);
    var lit = bctx.getImageData(0, 0, FISH_W, FISH_H), litSrc = lit.data.slice();
    var weights = REGIONS.map(function (g, i) {
      var wt = new Float32Array(FISH_W * FISH_H);
      for (var y = 0; y < FISH_H; y++) {
        for (var x = 0; x < FISH_W; x++) wt[y * FISH_W + x] = inRegion(i, x, y);
      }
      return wt;
    });
    function pixels(src, brain) {
      sctx.clearRect(0, 0, FISH_W, FISH_H);
      sctx.drawImage(art.fish, 0, 0);
      if (Math.max.apply(null, brain) >= 0.005) {
        for (var k = 0; k < FISH_W * FISH_H; k++) {
          var l = 0;
          for (var i = 0; i < REGIONS.length; i++) l = Math.max(l, brain[i] * weights[i][k]);
          lit.data[4 * k + 3] = litSrc[4 * k + 3] * l;
        }
        bctx.putImageData(lit, 0, 0);
        sctx.drawImage(bctx.canvas, 0, 0);
      }
      return sctx.getImageData(0, 0, FISH_W, FISH_H).data;
    }
    return {
      draw: function (sp, brain) {
        var src = pixels(art.fish, brain), d = img.data;
        d.fill(0);
        // Every point within REACH of the straight spine, in half-pixel
        // steps, carried to the bent fish, so no pixel is missed.
        for (var s = -(FISH_W - NOSE_X); s <= NOSE_X; s += 0.5) {
          for (var v = -REACH; v <= REACH; v += 0.5) {
            var x0 = NOSE_X - s, y0 = MID + v;
            var b = s < 0 ? [x0, y0] : bendPt(sp, x0, y0);
            var x = Math.round(b[0]), y = Math.round(b[1]);
            if (x < 0 || y < 0 || x >= FISH_W || y >= FISH_H) continue;
            var sx = Math.min(FISH_W - 1, Math.max(0, Math.round(x0 + x - b[0])));
            var sy = Math.min(FISH_H - 1, Math.max(0, Math.round(y0 + y - b[1])));
            var q = 4 * (y * FISH_W + x), r = 4 * (sy * FISH_W + sx);
            d[q] = src[r]; d[q + 1] = src[r + 1]; d[q + 2] = src[r + 2]; d[q + 3] = src[r + 3];
          }
        }
        octx.putImageData(img, 0, 0);
        return out;
      }
    };
  }

  function mount(el, art) {
    var fitCard = el.getAttribute("data-fit") === "card";
    var card = fitCard ? el.closest(".publication-card") : null;
    var host = card || el;
    var place = PLACES[fitCard ? "card" : "page"];
    var cv = canvas(1, 1);
    cv.style.display = "block";
    el.appendChild(cv);
    var ctx = cv.getContext("2d");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var bender = glBender(art) || cpuBender(art);
    var w = 0, h = 0, len = 1, nose = [0, 0];
    var t = 0;                    // s of running time, scaled by the speed
    var rate = 0, rateV = 0, rateTarget = 0;
    var lights = NEUROMASTS.map(function () { return 0; });
    var brain = REGIONS.map(function () { return 0; });  // how lit each region is
    // Each side's gain for each region, redrawn when that side starts to
    // light; and how lit each side was, to see it start.
    var gains = [regionGains(-1), regionGains(1)];
    var lastPeak = [0, 0];
    var running = false, raf = 0, last = 0;
    var rings = [];               // the wake
    var lastTip = null, tipDir = 0;

    function layout() {
      var nw, nh;
      if (card) {
        var box = card.getBoundingClientRect();
        var cs = getComputedStyle(card);
        var padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
        var padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
        var padB = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
        var textBottom = box.top;
        Array.prototype.forEach.call(card.children, function (c) {
          if (c === el || c.classList.contains("publication-more")) return;
          if (!c.getClientRects().length) return;   // no box: the abstract's <template>
          textBottom = Math.max(textBottom, c.getBoundingClientRect().bottom);
        });
        nw = Math.max(40, Math.floor(box.width - padL - padR));
        nh = Math.max(40, Math.floor(box.bottom - padB - textBottom - GAP));
        el.style.left = padL + "px";
        el.style.width = nw + "px";
        el.style.top = (textBottom + GAP - box.top) + "px";
        el.style.height = nh + "px";
      } else {
        nw = Math.floor(el.clientWidth);
        nh = Math.floor(el.clientHeight);
      }
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + "px";
      cv.style.height = h + "px";
      len = Math.min(place.len[0] * w, place.len[1] * h);
      nose = [place.nose[0] * w, place.nose[1] * h];
      render();
    }

    // Straight-fish tile px -> frame px, for a point already bent.
    function toFrame(p) {
      var k = len / (NOSE_X - TAIL_X);
      var lx = (p[0] - NOSE_X) * k, ly = (p[1] - MID) * k;
      var c = Math.cos(HEADING), s = Math.sin(HEADING);
      return [nose[0] + lx * c - ly * s, nose[1] + lx * s + ly * c];
    }

    // Fraction of the way from the nose to the tail at tile x.
    function down(x) { return Math.min(1, Math.max(0, (NOSE_X - x) / (NOSE_X - TAIL_X))); }

    // How hard each neuromast's side of the body pushes into the water
    // now, from 0 to 1, at speed `drive`: the sideways speed of the
    // swimming wave there, signed towards the neuromast's side, past
    // LIT_FROM of its peak.
    function pushes(drive) {
      return NEUROMASTS.map(function (n) {
        var u = down(n[0]);
        var side = n[1] > MID ? 1 : -1;
        var v = -Math.cos(2 * Math.PI * (u / WAVE - SWIM_HZ * t)) * drive * (0.4 + 0.6 * u);
        return Math.max(0, (side * v - LIT_FROM) / (1 - LIT_FROM));
      });
    }

    // Each region's gain for neuromasts on one side of the body (-1, +1):
    // the MON's fixed, the far one's most; the others' drawn at random.
    function regionGains(side) {
      return REGIONS.map(function (g) {
        var far = g.side === -side;
        if (g.name === "mon") return far ? CONTRA : IPSI;
        var range = GAINS[g.name][far || !g.side ? 0 : 1];
        return range[0] + Math.random() * (range[1] - range[0]);
      });
    }

    // Moves the lights towards how hard each neuromast is pushed.
    function light(dt, drive) {
      var p = pushes(drive), peak = [0, 0];
      lights = lights.map(function (l, i) {
        var side = NEUROMASTS[i][1] > MID ? 1 : 0;
        peak[side] = Math.max(peak[side], p[i]);
        return l + (p[i] - l) * (1 - Math.exp(-dt / (p[i] > l ? RISE : FALL)));
      });
      [0, 1].forEach(function (s) {
        if (lastPeak[s] < 0.05 && peak[s] >= 0.05) gains[s] = regionGains(s ? 1 : -1);
        lastPeak[s] = peak[s];
      });
      brain = brain.map(function (b, i) {
        var target = Math.max(peak[0] * gains[0][i], peak[1] * gains[1][i]);
        return b + (target - b) * (1 - Math.exp(-dt / (target > b ? RISE : BRAIN_FALL)));
      });
    }

    // Lets go of a crescent at the tail tip as it turns back, and moves and
    // ages the wake by dt s. `drive` is the speed of the swim.
    function wake(dt, drive) {
      var tip = bendPt(spine(((SWIM_HZ * t) % 1 + 1) % 1), TAIL_X, MID);
      if (lastTip) {
        var dir = tip[1] > lastTip[1] ? 1 : tip[1] < lastTip[1] ? -1 : 0;
        if (dir && tipDir && dir !== tipDir && drive > 0.2) {
          var side = tipDir;    // the side the tip turned back from
          rings.push({ x: tip[0], y: tip[1], side: side, strength: drive, age: 0,
            kind: Math.floor(Math.random() * RING_KINDS) });
        }
        if (dir) tipDir = dir;
      }
      lastTip = tip;
      rings = rings.filter(function (g) {
        g.x -= DRIFT * dt;
        g.age += dt;
        return g.age < RING_LIFE;
      });
    }

    // The wake in the frame, behind the fish.
    function drawWake() {
      var k = len / (NOSE_X - TAIL_X);
      rings.forEach(function (g) {
        var f = g.age / RING_LIFE;
        var alpha = RING_ALPHA * g.strength * Math.min(1, g.age / RING_IN) *
          Math.min(1, (RING_LIFE - g.age) / RING_OUT);
        var p = toFrame([g.x, g.y]);
        // The sprite's ring is 0.66 of its size across.
        var size = (RING[0] + (RING[1] - RING[0]) * Math.sqrt(f)) / 0.66 * k;
        // Gone before any part of it can reach a side of the frame: the
        // sprite reaches 0.45 of its size from its middle.
        var room = Math.min(p[0], p[1], w - p[0], h - p[1]) - 0.45 * size;
        alpha *= Math.max(0, Math.min(1, room / RING_EDGE));
        if (alpha < 0.005) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p[0], p[1]);
        ctx.rotate(HEADING + Math.PI - g.side * RING_TURN);
        ctx.drawImage(art.rings[g.side > 0 ? 1 : 0][g.kind], -size / 2, -size / 2, size, size);
        ctx.restore();
      });
    }

    function dark() {
      return Math.max.apply(null, brain) < 0.005 && lights.every(function (l) { return l < 0.005; });
    }

    function render() {
      // The spine at this moment of the beat, and the fish bent along it.
      var sp = spine(((SWIM_HZ * t) % 1 + 1) % 1);
      var body = bender.draw(sp, brain.map(function (b) { return BRAIN_PEAK * b; }));
      var k = len / (NOSE_X - TAIL_X);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      drawWake();
      ctx.translate(nose[0], nose[1]);
      ctx.rotate(HEADING);
      ctx.drawImage(body, -NOSE_X * k, -MID * k, FISH_W * k, FISH_H * k);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var g = GLOW_SIZE * len;
      lights.forEach(function (v, i) {
        if (v < 0.005) return;
        var p = toFrame(bendPt(sp, NEUROMASTS[i][0], NEUROMASTS[i][1]));
        ctx.globalAlpha = v;
        for (var pass = 0; pass < 2; pass++) ctx.drawImage(art.glow, p[0] - g / 2, p[1] - g / 2, g, g);
      });
      ctx.globalAlpha = 1;
    }

    // Moves the speed towards its target along a critically damped
    // spring, with its exact solution.
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

    function frame(now) {
      if (!running) return;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      spin(dt);
      t += dt * rate;
      light(dt, rate);
      wake(dt, rate);
      render();
      if (!rateTarget && !rate && dark() && !rings.length) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    // With reduced motion, light the neuromasts as a beat at full speed
    // would, and lay the wake of the beats before this frame.
    if (reducedMotion) {
      for (var warm = 0; warm < 20; warm++) light(0.05, 1);
      for (t = -RING_LIFE * 0.9; t < 0; t += 0.02) wake(0.02, 1);
      t = 0;
    }
    layout();
    if ("ResizeObserver" in window) new ResizeObserver(layout).observe(host);
    else window.addEventListener("resize", layout);
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
    host.addEventListener("mouseenter", function () { set(1, true); });
    host.addEventListener("mouseleave", function () { set(1, false); });
    host.addEventListener("focusin", function () { set(2, true); });
    host.addEventListener("focusout", function () { set(2, false); });
  }

  function init() {
    var els = document.querySelectorAll('[data-drawing="zebrafish"]');
    if (!els.length) return;
    var img = new Image();
    img.onload = function () {
      var art = sprites(img);
      Array.prototype.forEach.call(els, function (el) { mount(el, art); });
    };
    img.onerror = function () { console.warn("could not load " + ATLAS_SRC + "; the zebrafish is not drawn"); };
    img.src = ATLAS_SRC;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
