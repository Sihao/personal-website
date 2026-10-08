// Publication cards on the landing page: a click on a card, or on its
// "Read abstract" button, opens a popup (the <dialog> in
// layouts/partials/publications.html) with the card's text, the abstract
// and the DOI, from the card's <template>. The close button, Escape, or a
// click outside the popup closes it. The dialog gives focus back to
// whatever had it (the card's button, when opened from the keyboard).
(function () {
  function init() {
    var dialog = document.querySelector(".publication-dialog");
    if (!dialog) return;
    var body = dialog.querySelector(".publication-dialog-body");

    function open(card) {
      body.textContent = "";
      Array.prototype.forEach.call(card.children, function (el) {
        if (el.matches(".eyebrow, .fine, h2, .authors")) body.appendChild(el.cloneNode(true));
      });
      var title = body.querySelector("h2");
      title.id = "publication-dialog-title";
      title.classList.remove("f4");
      title.classList.add("f3");
      body.querySelector(".authors").classList.remove("mb4");
      body.appendChild(card.querySelector("template.publication-abstract").content.cloneNode(true));
      dialog.showModal();
      dialog.focus();             // not the close button, which would show its ring
      dialog.scrollTop = 0;
      // Justified as TeX would, as the About text is (tex-justify.js), now
      // that the popup is laid out.
      if (window.texJustify) window.texJustify(body.querySelectorAll(".publication-abstract-text p"));
    }

    document.querySelectorAll(".publication-card").forEach(function (card) {
      card.addEventListener("click", function () {
        if (String(window.getSelection())) return;
        open(card);
      });
    });
    dialog.querySelector(".publication-dialog-close").addEventListener("click", function () {
      dialog.close();
    });
    // A click on the backdrop lands on the dialog itself.
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) dialog.close();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
