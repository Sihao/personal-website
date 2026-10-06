# Hugo template for Netlify CMS with Netlify Identity

This is a small business template built with [Victor Hugo](https://github.com/netlify/victor-hugo) and [Netlify CMS](https://github.com/netlify/netlify-cms), designed and developed by [Darin Dimitroff](http://www.darindimitroff.com/), [spacefarm.digital](https://www.spacefarm.digital).

## Getting started

Use our deploy button to get your own copy of the repository. 

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/one-click-hugo-cms&stack=cms)

This will setup everything needed for running the CMS:

* A new repository in your GitHub account with the code
* Full Continuous Deployment to Netlify's global CDN network
* Control users and access with Netlify Identity
* Manage content with Netlify CMS

Once the initial build finishes, you can invite yourself as a user. Go to the Identity tab in your new site, click "Invite" and send yourself an invite.

Now you're all set, and you can start editing content!

## Local Development

Clone this repository, and run `yarn` or `npm install` from the new folder to install all required dependencies.

Then start the development server with `yarn start` or `npm start`.

## Layouts

The template is based on small, content-agnostic partials that can be mixed and matched. The pre-built pages showcase just a few of the possible combinations. Refer to the `site/layouts/partials` folder for all available partials.

Use Hugo’s `dict` functionality to feed content into partials and avoid repeating yourself and creating discrepancies.

## CSS

The template uses a custom fork of Tachyons and PostCSS with cssnext and cssnano. To customize the template for your brand, refer to `src/css/imports/_variables.css` where most of the important global variables like colors and spacing are stored.

## SVG

All SVG icons stored in `site/static/img/icons` are automatically optimized with SVGO (gulp-svgmin) and concatenated into a single SVG sprite stored as a a partial called `svg.html`. Make sure you use consistent icons in terms of viewport and art direction for optimal results. Refer to an SVG via the `<use>` tag like so:

```
<svg width="16px" height="16px" class="db">
  <use xlink:href="#SVG-ID"></use>
</svg>
```

## p5.js sketches

[p5.js](https://p5js.org) sketches run in the browser and are served as static files, outside the Webpack pipeline. p5.js is loaded from jsDelivr only on pages that embed a sketch.

* Add a sketch as `site/static/js/sketches/<name>.js`. It registers itself on `window.p5Sketches.<name>` as a function `(p, opts)` that assigns `p.setup`, `p.draw`, and so on, in p5 [instance mode](https://github.com/processing/p5.js/wiki/Global-and-instance-mode). `opts.el` is the container and `opts.reducedMotion` is true when the visitor prefers reduced motion. See `washes.js`.
* Embed it in a template with `{{ partial "p5-sketch" (dict "name" "<name>" "page" . "height" 240 "label" "Description for screen readers" "caption" "Optional caption") }}`.
* Embed it in Markdown content with `{{< p5 sketch="<name>" height="240" label="..." caption="..." >}}`.

`site/static/js/p5-mount.js` instantiates each sketch and pauses it while it is scrolled out of view. To upgrade p5.js, change the version and the `integrity` hash in `site/layouts/_default/baseof.html`.

Sketches can declare libraries with the `requires` parameter (`"requires" "brush"` in the partial, `requires="brush"` in the shortcode). `p5-mount.js` loads them before starting the sketch and passes `opts.libs.<name>` (true or false) so the sketch can fall back. The only library is currently [p5.brush](https://github.com/acamposuribe/p5.brush), loaded from jsDelivr when the browser supports WebGL2. p5.brush hooks into every p5 instance on a page and expects a WEBGL canvas, so every sketch on a page that requires it must use `WEBGL`. Library versions and `integrity` hashes live in `LIBS` in `p5-mount.js`.

The homepage washes are sprites from `site/static/img/washes.webp`, painted with p5.brush ahead of time rather than in the visitor's browser, because watercolor fills are too slow to paint at load. The sketch tints each sprite and arranges blots, dust and pencil lines into a composition at load. To repaint the sprites, open `tools/wash-atlas.html` in a browser with WebGL2, download the result, and replace `site/static/img/washes.webp`. Change `SEED` in the tool for a different set of sprites, and keep its atlas layout constants in sync with `washes.js`.

Publication pages use the same approach. The two mice on the page for *Composite receptive fields in the mouse auditory cortex* come from `site/static/img/mice.webp`, painted by `tools/mouse-atlas.html` and drawn by `mice.js`. Each mouse is four layers, tinted at load: pale pigment, ink wash, ink line, and pale pigment over the ink. The atlas also holds the ultrasonic vocalisation syllables that appear when a visitor hovers over or taps a mouse. Repaint the atlas the same way as the washes, and keep its layout constants in sync with `mice.js`.

## Publication pages

Each publication is a Markdown file in `site/content/publications/`, rendered by `site/layouts/publications/single.html`: a narrow column with a sketch (front matter `sketch` and `sketchLabel`) beside the text. On phones, the sketch is a short band above the text. The front matter also holds `authors` (Markdown), `journal`, `doi` and `preprint` (a DOI). Pages marked `draft: true` appear in Netlify deploy previews but not on the live site.

The landing page lists the latest six publications as cards, three per row on wide screens and one per row on phones (`site/layouts/publications/li.html`): upright golden rectangles, white, outlined in Prussian blue, with a small mouse from the painting in the corner and syllables rising from its mouth. The mouse is `site/static/img/mouse-card.webp`; after repainting `mice.webp` or changing its tints in `mice.js`, regenerate it with `tools/mouse-card.html` (serve the repository root over HTTP and open the tool), and copy the snout position it prints into `SNOUT` in `site/static/js/usv-card.js`, which animates the syllables.
