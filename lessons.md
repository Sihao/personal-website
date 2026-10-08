# Lessons

## USV syllables on publication cards do not animate (2026-10-06)

**Symptom:** the syllables above the mouse on the publication cards stay still.

**Dead ends:**
- Static review of `site/static/js/usv-card.js` (spline, IntersectionObserver, rAF
  cancel, atlas layout 1600 x 688 = 2 mice x 280 + 128 syllable row). No defect.
- Local build in headless Chromium: the canvas animated. The code was not broken.

**Cause:** macOS Reduce Motion was on (`defaults read com.apple.universalaccess
reduceMotion` returns `1`). Every browser then matches
`prefers-reduced-motion: reduce`, and the script drew a still fan by design.

**Fix:** with reduced motion, the card shows the primed stream, paused, and runs
it only while the pointer is over the card or the card has focus. When the
pointer leaves, the stream pauses on its current frame, and the next hover
carries on from it. (A first version showed a separate still fan and primed a
new stream on each hover, so every hover jumped to new syllables.)

**Test tip:** before you debug "no animation", check the OS reduced-motion
setting. In Playwright, use `emulateMedia({ reducedMotion: 'reduce' })` to
reproduce it.

## Planes atlas (tools/planes-atlas.html): p5 global-mode name clashes

- Fault: the tool page stopped with "Cannot redefine property: GRID", then
  "Cannot redefine property: square". p5 2.x in global mode defines its
  constants and functions (GRID, square, ...) as non-writable globals, so a
  top-level `var GRID` or `function square` in the page breaks setup().
- Fix: rename top-level names that p5 already uses (GRID_N, cutSquare,
  ruleGrid). Check new top-level names against the p5 reference.
- Headless painting: Chromium with `--use-angle=swiftshader
  --enable-unsafe-swiftshader` runs p5.brush, but the atlas takes about
  5 min. The page's load event waits for setup(), so wait for
  `window.atlasDataURL` after `goto(..., {waitUntil: "commit"})`, not
  for "load".
- Thin washes at card size: the alpha-mask washes read grey, not Prussian
  blue. Lay each tile down 2-3 times at runtime (COATS in planes.js), as
  usv-card.js does, in place of repainting the atlas.

## Planes slide "snapped" in Arc but was smooth in headless Chromium

- Symptom: the hover slide looked like an instant snap in Arc, whatever the
  spring stiffness. A screenshot series in headless Chromium showed a
  smooth 2 s slide.
- Cause: macOS "Reduce motion" is on on the dev machine
  (`defaults read com.apple.universalaccess reduceMotion` → 1), and
  planes.js jumped straight to the end under prefers-reduced-motion.
- Fix: the slide is slow and only follows the visitor's own hover, so it
  now plays under reduced motion too. Before tuning an animation that
  "does not animate", check that setting first.
- Note: a WebGL canvas cannot be read back with drawImage after the frame
  (no preserveDrawingBuffer); measure motion from page screenshots.

## Parallax header showed a blank strip above the painting

- Symptom: a plain strip at the top of the header during scroll, worse
  when scrolling fast.
- Cause 1: the offset ran from the first pixel of scroll (rate x scrollY),
  but the header starts below the nav. The strip the offset opens above
  the painting was on screen for the first ~100 px of scroll.
- Cause 2: a rAF scroll handler sets the offset one frame after the
  compositor scrolls, so fast scrolls show the lag.
- Fix: start the offset only when the frame's top reaches the window's
  top (rate x max(0, -frameTop)); the strip then stays off screen. Drive
  it with a CSS scroll-driven animation (view-timeline, animation-range:
  exit), which the compositor runs in step with the scroll; keep the JS
  path only for browsers without animation-timeline.

## Computer atlas paint "hung" for 10+ minutes (tools/computer-atlas.html)

- Symptom: the headless paint (playwright-core + SwiftShader) never set
  `window.atlasDataURL`; it looked slow, but every Chrome process sat at 0% CPU.
- Did not work: raising the wait timeout. The page was dead, not slow.
- Hidden because the run was piped through `| tail` / `| grep | head`, which
  hold the `ERR` lines until the process exits, so the page errors never showed.
- Causes: (1) a missing `}` in helpers copied with `sed -n` line ranges from
  tools/mouse-atlas.html ("Unexpected end of input"); (2) p5 2.x global-mode name
  clashes again: `SCREEN`, `TOP`, `rect`, `box` ("Cannot redefine property").
- Fix: renamed globals (DISPLAY, CASE_TOP, boxPts, ...). Check first with
  `node --check` on the extracted script and a 60 s run that writes the log to a
  file. Check CPU (`ps -Ao pcpu`): ~0% means stuck, ~900% means painting.
- Avoid any top-level name that p5 defines (constants such as TOP, SCREEN, GRID,
  and functions such as rect, box, square).

## Headless p5.brush paints take minutes on SwiftShader, seconds on Metal

- Symptom: each atlas paint (tools/*-atlas.html) through playwright-core took
  3-10 min, with Chrome at ~900% CPU.
- Cause: `--use-angle=swiftshader` runs WebGL on the CPU, and p5.brush runs many
  full-canvas shader passes per glaze.
- Fix: launch headless Chrome for Testing with `--use-angle=metal --enable-gpu
  --ignore-gpu-blocklist` (scratchpad build/atlas-gpu.js). The 8-pose zebrafish
  atlas (2048 x 2144) painted in about 6 s.

## p5.brush throws faint spikes off a long, non-convex outline

- Symptom: faint triangular spikes along the bent zebrafish body in every pose.
- Did not work: a smaller fillBleed (the spikes stayed).
- Fix: record each base-layer shape's outline while painting, and in draw()
  keep pigment only inside the union of those outlines (filled, 3 px blur).

## Zebrafish body flickered when blending painted keyframes

- Symptom: the fish's body tone jumped several times a second while it swam
  (reported as seizure-inducing).
- Did not work: painting each keyframe pose with p5.brush from the same
  randomSeed/noiseSeed. p5.brush's pigment grain is not fixed by those seeds, so
  each pose had its own texture, and the blend ran through 8 textures ~6x/s.
- Fix: paint the fish once, straight; at load, bend that one painting into each
  pose with a per-pixel map (forward splat of the straight fish along the bent
  spine in half-pixel steps, then bilinear sampling). Every pose has the same
  pixels. Measured: mean body grey 105.3-105.9 over 90 frames, max change per
  frame 0.16 (of 255).
- Rule: never cross-fade between separately painted p5.brush images; warp one.

## zebrafish.js WebGL shader silently fell back to the CPU path

- Symptom: the drawing still rendered (CPU fallback), but slower; nothing in the
  console said why.
- Causes: (1) `half` used as a GLSL ES 1.0 variable name (it is reserved);
  (2) a uniform (`size`) declared in both shaders with different default
  precision (vertex highp, fragment mediump) fails to link.
- Fix: rename (`plus`), give the fragment shader its own uniform (`tile`), and
  console.warn the program info log when linking fails.
- Check: tests hook getProgramParameter(LINK_STATUS) via addInitScript and print
  whether the program linked (scratchpad build/zfcontra.js).

## Publication card grew suddenly at the end of its open animation

- Symptom: the card eased to a height, then jumped 176 px (11rem) taller
  when the animation ended.
- Cause: publication-cards.js measures the open card's height at once, but
  the button's `padding-top` (0 → 11rem when open) was still at its start
  value: the `.link` class sets `transition: all 150ms`, and a `<button>`
  never matches `.link:link`, which narrows it to color.
- Fix: `.publication-more { transition: color .15s ease-in; }`.
- Check: log `offsetHeight` on every frame (scratchpad build/frames.js);
  the last eased height must equal the height after the inline height is
  cleared.
- Rule: before measuring a box for a JS animation, make sure nothing
  inside it has a running CSS transition on a layout property.

## Header washes drew small blots on some reloads

- Symptom: the blots in the landing page's header painting were small on
  some loads and the right size on others; a hard refresh gave the right
  size.
- Cause: washes.js sizes the blots by the field left below the sticky bar
  (data-sketch-over), measured with getBoundingClientRect. A normal reload
  part way down the page (or at #publications) restores the scroll before
  setup, so the bar is stuck lower in the field: top 56 -> 206-235 px,
  k 1 -> 0.627. A hard refresh started at the top. The data-sketch-clear
  boxes (logotype, menu button, inside the bar) moved the same way.
- Fix: subtract how far the bar is stuck (its top minus its non-sticky
  header's top) from the bar's and the clearings' positions.
- Check: log top and k in layout() and reload at scrollY 0, 150, 1200
  and at /#publications (scratchpad build/hero.js); all give k = 1.
- Rule: never measure a sticky element's position for layout without
  removing the sticky offset.

## Card drawings sat too low after a window resize

- Symptom: after resizing the window, the zebrafish, computer and planes
  drawings started far below the card's text and were squashed (at 1280 px:
  top 370 px, 140 px tall, instead of 249 px, 261 px tall).
- Cause: usv-card.js, planes.js and zebrafish.js put the drawing below
  the lowest child of the card. The abstract's <template> (for the popup)
  has no box, and getBoundingClientRect() gives it bottom 0, in viewport
  coordinates. Once the card is above the top of the window (box.top < 0),
  that 0 is the "lowest" child. On first load, at the top of the page, the
  fault did not show.
- Fix: skip children with no box (`!el.getClientRects().length`).
- Check: resize 1280 -> 1100 -> 900 -> 700 -> 390 -> 1280 and log each
  drawing's box in its card (scratchpad build/rsz.js); the end matches
  the start.
