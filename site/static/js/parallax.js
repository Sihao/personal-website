// Parallax for elements marked data-parallax, for browsers without
// scroll-driven animations (the CSS in src/css/imports/_styles.css does
// the work where they exist). Once the top of the sketch's frame reaches
// the top of the window, the painting moves down within the frame by
// --parallax-rate times the scroll, so it leaves the screen more slowly
// than the page, and the strip that opens above it stays off screen.
//
// Off with reduced motion: scroll-linked motion is the kind that setting
// is for.
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.CSS && CSS.supports && CSS.supports("animation-timeline: view()")) return;

  function init() {
    var items = Array.prototype.map.call(document.querySelectorAll("[data-parallax]"), function (el) {
      return { el: el, rate: parseFloat(getComputedStyle(el).getPropertyValue("--parallax-rate")) || 0.25, frame: null };
    });
    if (!items.length) return;
    var queued = false;

    function update() {
      queued = false;
      items.forEach(function (it) {
        it.frame = it.frame || it.el.querySelector("[data-p5-sketch], [data-parallax-frame]");
        if (!it.frame) return;
        var box = it.frame.getBoundingClientRect();
        var scrolled = Math.min(box.height, Math.max(0, -box.top));
        it.frame.style.setProperty("--parallax", (scrolled * it.rate).toFixed(1) + "px");
        it.frame.style.setProperty("--parallax-y", scrolled.toFixed(1) + "px");
      });
    }
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
