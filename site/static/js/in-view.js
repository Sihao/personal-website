// On screens with no hover (phones, tablets), runs the animation in view,
// in place of the hover that starts it elsewhere. Each animated drawing
// (the header's washes and the publication cards) registers with
// window.inView.watch(el, set): set(true) when it starts to run, set(false)
// when it stops. The drawing then eases in and runs down as it does for a
// hover.
//
// What runs is chosen by a focus line across the viewport that moves from
// its top to its bottom as the page scrolls from its top to its bottom, so
// the first drawing on the page and the last each get their turn. The
// drawings that the line crosses run: one card on a phone, a row of cards
// on a wider screen. If the line crosses none, the nearest to it runs.
// A drawing runs only while at least SHOWN of it is in view, counted
// against its own height or the viewport's, whichever is less. The choice
// changes only once the page holds still for DWELL, so a fast scroll past
// the cards does not start each one on its way. Nothing runs while the
// page is hidden.
//
// On screens with hover, and with reduced motion, nothing runs: there the
// motion policy of site/static/js/p5-mount.js holds unchanged. The hover
// test is live, so it follows a switch of device mode in the browser's
// developer tools.
(function () {
  "use strict";

  var SHOWN = 0.6;
  var DWELL = 150;                // ms the page must hold still before the choice changes

  var hoverQuery = window.matchMedia && window.matchMedia("(hover: none)");
  var reducedMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var items = [];                 // {el, set, on}
  var timer = 0;
  var listening = false;

  function enabled() {
    return !!(hoverQuery && hoverQuery.matches) && !reducedMotion && !document.hidden;
  }

  function pick() {
    var vh = window.innerHeight;
    var range = document.documentElement.scrollHeight - vh;
    var focus = range > 0 ? vh * Math.min(1, Math.max(0, window.scrollY / range)) : vh / 2;
    var chosen = [];
    if (enabled()) {
      var best = Infinity;
      items.forEach(function (it) {
        var r = it.el.getBoundingClientRect();
        var room = Math.min(r.height, vh);
        var seen = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (room <= 0 || seen / room < SHOWN) return;
        var d = focus < r.top ? r.top - focus : focus > r.bottom ? focus - r.bottom : 0;
        if (d < best - 0.5) { best = d; chosen = [it]; }
        else if (Math.abs(d - best) <= 0.5) chosen.push(it);
      });
    }
    items.forEach(function (it) {
      var on = chosen.indexOf(it) >= 0;
      if (on !== it.on) { it.on = on; it.set(on); }
    });
  }

  function later() {
    clearTimeout(timer);
    timer = setTimeout(pick, DWELL);
  }

  window.inView = {
    watch: function (el, set) {
      if (!hoverQuery || reducedMotion) return;
      items.push({ el: el, set: set, on: false });
      if (!listening) {
        listening = true;
        window.addEventListener("scroll", later, { passive: true });
        window.addEventListener("resize", later);
        document.addEventListener("visibilitychange", pick);
        if (hoverQuery.addEventListener) hoverQuery.addEventListener("change", pick);
        else if (hoverQuery.addListener) hoverQuery.addListener(pick);
      }
      later();
    }
  };
})();
