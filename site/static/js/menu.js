// The header's menu (site/layouts/partials/nav.html): the button opens
// and closes the drawer (.site-menu.is-open; the CSS draws it). The list closes again on Escape (focus
// goes back to the button), on a click anywhere outside the menu, and
// once one of its links is followed, and when the button goes out of
// sight (on the home page the bar leaves with the painting, and the page
// has slid over the drawer). The drawer sits in a frame of its own
// (.menu-drawer), outside the bar, which gets is-open too.
(function () {
  "use strict";

  function init() {
    var menu = document.querySelector(".site-menu");
    if (!menu) return;
    var button = menu.querySelector(".menu-button");
    var list = document.getElementById(button.getAttribute("aria-controls"));
    var drawer = list.parentNode;

    function set(open) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      menu.classList.toggle("is-open", open);
      drawer.classList.toggle("is-open", open);
    }

    function isOpen() { return menu.classList.contains("is-open"); }

    button.addEventListener("click", function () { set(!isOpen()); });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
    window.addEventListener("scroll", function () {
      if (isOpen() && button.getBoundingClientRect().bottom <= 0) set(false);
    }, { passive: true });
    document.addEventListener("click", function (e) { if (!menu.contains(e.target) && !list.contains(e.target)) set(false); });
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
