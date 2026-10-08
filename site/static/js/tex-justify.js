// Justifies paragraphs as TeX would: lines broken over the whole paragraph
// with the Knuth-Plass algorithm, and words hyphenated with TeX's US
// English patterns (at least 2 letters before a break and 3 after), by
// tex-linebreak (loaded before this script; see
// layouts/partials/short-text.html). The library fixes each line with a
// <br> and sets its word spacing, so it runs again when a paragraph's
// width changes, and after the web fonts load, as the widths of the words
// change with them.
// As in TeX, a word with a hyphen of its own (multi-photon) breaks only
// after that hyphen, and the break adds no second one.
//
// The paragraphs marked data-tex-justify are justified on load. Others,
// added later (the abstracts in the publication popup, by
// publication-cards.js), are justified by window.texJustify(paragraphs),
// once they are laid out; paragraphs taken out of the page are let go.
// Without the library the browser's own justification and hyphenation
// (.about-text in src/css/imports/_styles.css) remain.
(function () {
  var lib = window.texLineBreak_lib;
  var patterns = window["texLineBreak_hyphens_en-us"];
  if (!lib || !patterns) return;
  var patternHyphenate = lib.createHyphenator(patterns);
  var els = [], widths = new Map(), raf = 0;
  var ro = "ResizeObserver" in window ? new ResizeObserver(function (entries) {
    entries.forEach(function (e) {
      var w = Math.round(e.contentRect.width);
      if (widths.has(e.target) && widths.get(e.target) !== w) schedule();
      widths.set(e.target, w);
    });
  }) : null;

  // "low-data" -> ["low-", "data"]; other words by the patterns.
  function hyphenate(word) {
    if (word.indexOf("-") < 0) return patternHyphenate(word);
    return word.split(/(?<=-)(?=.)/);
  }

  // The library ends every line broken inside a word with a "-" of its
  // own; after a hard hyphen, remove it and spread its width over the
  // line's spaces, so the line still meets the right margin.
  function dropDoubleHyphens(el) {
    var range = document.createRange();
    Array.prototype.forEach.call(el.querySelectorAll("span"), function (line) {
      var last = line.lastChild, prev = last && last.previousSibling;
      if (!last || last.nodeType !== 3 || last.nodeValue !== "-") return;
      if (!prev || prev.nodeType !== 3 || !/-$/.test(prev.nodeValue)) return;
      range.selectNode(last);
      var w = range.getBoundingClientRect().width;
      var spaces = (line.textContent.trim().match(/\s+/g) || []).length;
      line.removeChild(last);
      if (spaces) line.style.wordSpacing = (parseFloat(line.style.wordSpacing) || 0) + w / spaces + "px";
    });
  }

  function justify(list) {
    list.forEach(function (el) { lib.unjustifyContent(el); });
    lib.justifyContent(list, hyphenate);
    list.forEach(dropDoubleHyphens);
  }

  // Lets go of paragraphs no longer in the page; justifies the rest that
  // have a box (a closed popup's have none).
  function all() {
    raf = 0;
    els = els.filter(function (el) {
      if (el.isConnected) return true;
      if (ro) ro.unobserve(el);
      widths.delete(el);
      return false;
    });
    var shown = els.filter(function (el) { return el.getClientRects().length; });
    if (shown.length) justify(shown);
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(all);
  }

  function add(list) {
    list = Array.prototype.slice.call(list).filter(function (el) { return els.indexOf(el) < 0; });
    if (!list.length) return;
    els = els.concat(list);
    justify(list.filter(function (el) { return el.getClientRects().length; }));
    if (ro) list.forEach(function (el) { ro.observe(el); });
  }

  window.texJustify = add;
  add(document.querySelectorAll("[data-tex-justify]"));
  if (document.fonts) document.fonts.ready.then(schedule);
  if (!ro) window.addEventListener("resize", schedule);
})();
