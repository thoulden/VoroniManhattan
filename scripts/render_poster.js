// scripts/render_poster.js
// Render your GitHub Pages app to an A3 PDF using Puppeteer.
// Usage examples:
//   URL=https://<user>.github.io/<repo>/ node scripts/render_poster.js
//   URL=http://localhost:8080/ OUTPUT=poster_a3.pdf node scripts/render_poster.js

const path = require("path");
const puppeteer = require("puppeteer");

(async () => {
  // ---- Inputs (env overrides) ----
  const BASE_URL    = process.env.URL || "http://localhost:8080/";
  const OUTFILE     = process.env.OUTPUT || "poster_a3.pdf";
  const TITLE_ALIGN = (process.env.TITLE_ALIGN || "right").toLowerCase(); // 'right' | 'left'
  const TITLE_SCALE = parseFloat(process.env.TITLE_SCALE || "1.5");        // e.g. 1.5
  const RES         = parseInt(process.env.RES || "1", 10);                // pixel step (1 = small pixels)
  const ANGLE       = parseFloat(process.env.ANGLE || "29");               // L1 slider default (deg)

  // Build URL with poster query params, preserving any existing ones
  const u = new URL(BASE_URL);
  u.searchParams.set("poster", "1");
  u.searchParams.set("titleAlign", TITLE_ALIGN);
  u.searchParams.set("titleScale", String(TITLE_SCALE));
  u.searchParams.set("res", String(RES));
  // If your page reads the slider value, this sets its default:
  u.searchParams.set("angle", String(ANGLE));

  // ---- Launch headless Chromium ----
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: "new",
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Big backing store; deviceScaleFactor=3 gives very crisp output
  await page.setViewport({ width: 1600, height: 2400, deviceScaleFactor: 3 });

  // Go to your page and wait for quiet network
  await page.goto(u.toString(), { waitUntil: "networkidle0", timeout: 0 });

  // Let the app know we want poster defaults from query params (defensive)
  await page.evaluate(() => {
    // If your app reads ?angle=?, sync the slider/UI once.
    const params = new URLSearchParams(location.search);
    const angle = Number(params.get("angle"));
    const angleEl = document.getElementById("angle");
    if (angleEl && !Number.isNaN(angle)) {
      angleEl.value = String(angle);
      angleEl.dispatchEvent(new Event("input"));
    }
  });

  // Wait until your status bar contains "Done."
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("#status");
        const txt = el?.textContent || el?.innerText || "";
        return /Done\./i.test(txt);
      },
      { timeout: 3 * 60 * 1000 } // up to 3 minutes
    );
  } catch (e) {
    console.warn('Timed out waiting for "Done." in #status — continuing anyway.');
  }

  // Add print styles for full-bleed poster (hide UI, fill page)
  await page.addStyleTag({
    content: `
      @page { size: A3; margin: 0; }
      html, body { margin: 0 !important; height: 100% !important; }
      header, #status { display: none !important; }
      #container { position: relative !important; height: 100vh !important; }
      canvas { width: 100vw !important; height: 100vh !important; }
      /* Make the big title larger in print for punch */
      #bigTitle {
        font-size: font-size: clamp(24px, 3.6vw, 84px) !important;
        title.style.background = 'var(--bg)';
      }
    `,
  });

  // Emit A3 PDF (portrait), full bleed
  await page.pdf({
    path: OUTFILE,
    printBackground: true,
    width: "297mm",
    height: "420mm",
    margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
  });

  await browser.close();
  console.log(`Wrote ${path.resolve(OUTFILE)} from ${u.toString()}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

