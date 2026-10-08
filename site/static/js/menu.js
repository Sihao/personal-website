// The header's menu (site/layouts/partials/nav.html): the button opens
// and closes the drawer (.site-menu.is-open; the CSS draws it). The list closes again on Escape (focus
// goes back to the button), on a click anywhere outside the menu, and
// once one of its links is followed, and when the page scrolls (on the
// home page the bar stays put but the painting the drawer matches moves).
(function () {
  "use strict";

  function init() {
    var menu = document.querySelector(".site-menu");
    if (!menu) return;
    var button = menu.querySelector(".menu-button");
    var list = menu.querySelector(".menu-list");

    function set(open) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      menu.classList.toggle("is-open", open);
    }

    function isOpen() { return menu.classList.contains("is-open"); }

    button.addEventListener("click", function () { set(!isOpen()); });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    document.addEventListener("click", function (e) { if (!menu.contains(e.target)) set(false); });
    window.addEventListener("scroll", function () { if (isOpen()) set(false); }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        set(false);
        button.focus();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
