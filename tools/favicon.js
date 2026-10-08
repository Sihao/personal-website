// Renders the favicon and app icons from the logotype: the favicon on a
// transparent ground, the app icons (which their systems would fill with
// black or white) on a Prussian-blue square; drawn twice at 48 px and below
// so the pale watercolour holds up. Plus a multi-size favicon.ico
// (PNG-in-ICO).
// Usage (needs playwright-core, and E = a Chrome executable):
//   E=/path/to/chrome node tools/favicon.js site/static/img/logotype.webp <out-dir>
// then copy favicon.ico, favicon-32.png, apple-touch-icon.png,
// android-chrome-*.png and mstile-150x150.png into site/static/img/.
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path");
(async () => {
  const [logo, out] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.E });
  const p = await b.newPage();
  const src = "data:image/webp;base64," + fs.readFileSync(logo).toString("base64");
  // name, size, corner radius (fraction; null: no ground), glyph height (fraction)
  const specs = [["favicon-16", 16, null, 1], ["favicon-32", 32, null, 1], ["favicon-48", 48, null, 1],
    ["apple-touch-icon", 180, 0, .72], ["android-chrome-192x192", 192, 0, .72], ["android-chrome-512x512", 512, 0, .72],
    ["mstile-150x150", 150, 0, .6]];
  const urls = await p.evaluate(async ([src, specs]) => {
    const img = new Image(); img.src = src; await img.decode();
    return specs.map(([name, n, r, g]) => {
      const c = document.createElement("canvas"); c.width = c.height = n;
      const x = c.getContext("2d");
      if (r != null) {
        x.fillStyle = "#14213d";
        x.beginPath(); x.roundRect(0, 0, n, n, r * n); x.fill();
      }
      const h = g * n, w = h * img.width / img.height;
      x.imageSmoothingQuality = "high";
      for (let k = 0; k < (n <= 48 ? 2 : 1); k++) x.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
      return [name, c.toDataURL("image/png")];
    });
  }, [src, specs]);
  const png = {};
  for (const [name, url] of urls) {
    png[name] = Buffer.from(url.split(",")[1], "base64");
    fs.writeFileSync(path.join(out, name + ".png"), png[name]);
  }
  // ICO: header, one 16-byte entry per image, then the PNG data.
  const imgs = [[16, png["favicon-16"]], [32, png["favicon-32"]], [48, png["favicon-48"]]];
  const head = Buffer.alloc(6 + 16 * imgs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length;
  imgs.forEach(([n, d], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(d.length, e + 8); head.writeUInt32LE(off, e + 12); off += d.length;
  });
  fs.writeFileSync(path.join(out, "favicon.ico"), Buffer.concat([head, ...imgs.map(i => i[1])]));
  await b.close();
})();
