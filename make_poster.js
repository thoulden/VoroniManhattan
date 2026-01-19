// make_poster.js
//
// Renders your existing index.html to a high-definition A3 PDF
// using headless Chromium (Puppeteer). Works with your current
// controls and code—no edits to index.html needed.
//
// Usage (after install steps below):
//   node make_poster.js
//   node make_poster.js --dataset museums --metric l1 --angle 29 --res 1 --out poster_a3_museums.pdf
//   node make_poster.js --scheme all   # generates 4 posters with different color schemes
//
// Options:
//   --dataset  stations | museums        (default: stations)
//   --metric   l1 | l2                   (default: l1)
//   --angle    integer degrees           (default: 29)   (used only for L1)
//   --res      1 | 2 | 3 | 4             (default: 1)    (pixel step size)
//   --title    on | off                  (default: on)   (keeps big overlay title)
//   --scheme   mta|ocean|sunset|earth|all (default: all) (color scheme, 'all' generates 4 posters)
//   --out      filename.pdf              (default: poster_a3.pdf, ignored when --scheme all)
//   --port     number                    (default: auto)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

// -------- CLI args (very light parsing) --------
const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.findIndex(a => a === `--${name}`);
  if (i !== -1 && i + 1 < args.length) return args[i + 1];
  return def;
}
const dataset = getArg("dataset", "stations");   // stations | museums
const metric  = getArg("metric", "l1");          // l1 | l2
const angle   = parseInt(getArg("angle", "29"), 10);
const res     = parseInt(getArg("res",   "1"), 10);
const titleOn = (getArg("title", "on") !== "off");
const scheme  = getArg("scheme", "all");         // mta | ocean | sunset | earth | all
const outFile = getArg("out", "poster_a3.pdf");
const forcedPort = getArg("port", null);

// Available color schemes
const ALL_SCHEMES = ["mta", "ocean", "sunset", "earth"];

// -------- tiny static file server (no deps) --------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = __dirname; // serve the repo folder where this file lives

function serveFile(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(reqUrl.pathname);

  if (pathname.endsWith("/")) pathname += "index.html";
  const fullPath = path.join(rootDir, pathname);

  fs.stat(fullPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end("Not found");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const type =
      ext === ".html" ? "text/html; charset=utf-8" :
      ext === ".js"   ? "text/javascript; charset=utf-8" :
      ext === ".css"  ? "text/css; charset=utf-8" :
      ext === ".json" ? "application/json; charset=utf-8" :
      ext === ".geojson" ? "application/geo+json; charset=utf-8" :
      "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(fullPath).pipe(res);
  });
}

function getFreePort(start = 5000) {
  return new Promise((resolve) => {
    const server = http.createServer(() => {}).listen(start, () => {
      const p = server.address().port;
      server.close(() => resolve(p));
    }).on("error", () => resolve(getFreePort(start + 1)));
  });
}

async function generatePoster(browser, port, colorScheme, outputFile) {
  const page = await browser.newPage();

  try {
    // A3 @ 300 DPI → ~3508 x 4961 px
    await page.setViewport({ width: 3508, height: 4961, deviceScaleFactor: 1 });

    // Load page with poster mode and color scheme
    const url = `http://localhost:${port}/index.html?poster&scheme=${colorScheme}`;
    await page.goto(url, { waitUntil: "networkidle0" });

    // Hide header/footer, keep big title depending on flag, make canvas fill
    await page.addStyleTag({
      content: `
        header, #status { display: none !important; }
        #container { position: fixed !important; inset: 0 !important; }
        canvas#c { width: 100% !important; height: 100% !important; }
        ${titleOn ? "" : "#bigTitle{ display:none !important; }"}
      `
    });

    // Set controls programmatically and trigger redraw
    await page.evaluate(({ dataset, metric, angle, res }) => {
      const d = document.getElementById("dataset");
      const m = document.getElementById("metric");
      const a = document.getElementById("angle");
      const r = document.getElementById("res");
      if (d) d.value = dataset;
      if (m) m.value = metric;
      if (a) a.value = String(angle);
      if (r) r.value = String(res);

      // Re-run UI handlers so the page picks up changes
      if (m) m.dispatchEvent(new Event("change"));
      if (a) a.dispatchEvent(new Event("input"));

      const btn = document.getElementById("redraw");
      if (btn) btn.click();
      // Force resize pass to ensure canvas backing store matches A3 viewport
      window.dispatchEvent(new Event("resize"));
    }, { dataset, metric, angle, res });

    // Wait until the page says "Done." in the status element
    await page.waitForFunction(() => {
      const el = document.getElementById('status');
      return el && /^Done\./.test(el.textContent || "");
    }, { timeout: 0 });

    // Export to a vector PDF page sized exactly A3 with zero margins
    await page.pdf({
      path: outputFile,
      printBackground: true,
      width: "297mm",
      height: "420mm",
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: false
    });

    console.log(`✅ Wrote ${outputFile}`);
  } finally {
    await page.close();
  }
}

(async () => {
  const port = forcedPort ? parseInt(forcedPort, 10) : await getFreePort(5173);
  const server = http.createServer(serveFile);
  await new Promise(r => server.listen(port, r));

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    if (scheme === "all") {
      // Generate posters for all color schemes
      console.log("Generating posters for all color schemes...\n");
      for (const colorScheme of ALL_SCHEMES) {
        const outputFile = `poster_a3_${colorScheme}.pdf`;
        await generatePoster(browser, port, colorScheme, outputFile);
      }
      console.log("\n✅ All posters generated!");
    } else {
      // Generate single poster with specified scheme
      await generatePoster(browser, port, scheme, outFile);
    }
  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error("❌ Poster generation failed:", err);
  process.exit(1);
});
