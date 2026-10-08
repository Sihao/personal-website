// Mounts every element marked with data-p5-sketch="<name>" as a p5 instance.
// Sketches register themselves on window.p5Sketches[name] as a function
// (p, opts) that assigns p.setup / p.draw, where
// opts = {el, reducedMotion, libs: {<name>: loaded}}.
//
// data-p5-requires="brush" loads p5.brush first, but only where it can run
// (WebGL2). opts.libs.brush tells the sketch whether it is available, so the
// sketch can fall back. p5.brush hooks into every p5 instance on the page and
// expects a WEBGL canvas, so every sketch on such a page must use WEBGL.
//
// Motion policy, shared by every animation on the site: with reduced
// motion a sketch shows its end state and never moves; otherwise it rests
// still and moves only while hovered (or, on touch screens, after a tap,
// and while it is the drawing most in view: site/static/js/in-view.js).
// Each sketch starts and stops its own loop to obey this.
(function () {
  "use strict";

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var LIBS = {
    brush: {
      src: "https://cdn.jsdelivr.net/npm/p5.brush@2.2.3/dist/p5.brush.js",
      integrity: "sha384-kwWM3zLjD/CdRap70WTKAsSsnuRP+m8UUSUCTvKE0YT9kCV50Lf9T33B819pu4hh",
      supported: hasWebGL2
    }
  };
  var loading = {};

  function hasWebGL2() {
    try {
      var gl = document.createElement("canvas").getContext("webgl2");
      var lose = gl && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  // Resolves to true once the library has loaded, false if it cannot be used.
  function loadLib(name) {
    var lib = LIBS[name];
    if (!lib) return Promise.resolve(false);
    if (!loading[name]) {
      loading[name] = !lib.supported() ? Promise.resolve(false) : new Promise(function (resolve) {
        var s = document.createElement("script");
        s.src = lib.src;
        s.integrity = lib.integrity;
        s.crossOrigin = "anonymous";
        s.onload = function () { resolve(true); };
        s.onerror = function () { resolve(false); };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  function mount(el) {
    var name = el.getAttribute("data-p5-sketch");
    var sketch = (window.p5Sketches || {})[name];
    var requires = (el.getAttribute("data-p5-requires") || "").split(/\s+/).filter(Boolean);

    if (typeof window.p5 === "undefined" || !sketch) {
      console.warn("p5 sketch \"" + name + "\" could not be mounted");
      return;
    }

    Promise.all(requires.map(loadLib)).then(function (results) {
      var libs = {};
      requires.forEach(function (lib, i) { libs[lib] = results[i]; });

      new window.p5(function (p) {
        sketch(p, { el: el, reducedMotion: reducedMotion, libs: libs });
      }, el);
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-p5-sketch]"), mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
