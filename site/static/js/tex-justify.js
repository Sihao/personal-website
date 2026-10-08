// Justifies the paragraphs marked data-tex-justify as TeX would: lines
// broken over the whole paragraph with the Knuth-Plass algorithm, and
// words hyphenated with TeX's US English patterns (at least 2 letters
// before a break and 3 after), by tex-linebreak (loaded before this
// script; see layouts/partials/short-text.html). The library fixes each
// line with a <br> and sets its word spacing, so it runs again when the
// paragraph's width changes, and after the web fonts load, as the widths
// of the words change with them.
// As in TeX, a word with a hyphen of its own (multi-photon) breaks only
// after that hyphen, and the break adds no second one.
// Without the library the browser's own justification and hyphenation
// (.about-text in src/css/imports/_styles.css) remain.
(function () {
  var lib = window.texLineBreak_lib;
  var patterns = window["texLineBreak_hyphens_en-us"];
  if (!lib || !patterns) return;
  var els = Array.prototype.slice.call(document.querySelectorAll("[data-tex-justify]"));
  if (!els.length) return;
  var patternHyphenate = lib.createHyphenator(patterns);
  var widths = new Map(), raf = 0;

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

  function justify() {
    raf = 0;
    els.forEach(function (el) { lib.unjustifyContent(el); });
    lib.justifyContent(els, hyphenate);
    els.forEach(dropDoubleHyphens);
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(justify);
  }

  justify();
  if (document.fonts) document.fonts.ready.then(schedule);
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) {
        var w = Math.round(e.contentRect.width);
        if (widths.has(e.target) && widths.get(e.target) !== w) schedule();
        widths.set(e.target, w);
      });
    });
    els.forEach(function (el) { ro.observe(el); });
  } else {
    window.addEventListener("resize", schedule);
  }
})();
