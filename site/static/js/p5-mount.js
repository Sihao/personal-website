// Mounts every element marked with data-p5-sketch="<name>" as a p5 instance.
// Sketches register themselves on window.p5Sketches[name] as a function
// (p, opts) that assigns p.setup / p.draw, where opts = {el, reducedMotion}.
// Sketches pause while scrolled out of view.
(function () {
  "use strict";

  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function mount(el) {
    var name = el.getAttribute("data-p5-sketch");
    var sketch = (window.p5Sketches || {})[name];

    if (typeof window.p5 === "undefined" || !sketch) {
      console.warn("p5 sketch \"" + name + "\" could not be mounted");
      return;
    }

    var instance = new window.p5(function (p) {
      sketch(p, { el: el, reducedMotion: reducedMotion });
    }, el);

    if (!reducedMotion && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) instance.loop();
          else instance.noLoop();
        });
      }).observe(el);
    }
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-p5-sketch]"), mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
