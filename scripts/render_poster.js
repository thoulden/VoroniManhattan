// scripts/render_poster.js
// Renders your GitHub Pages site to an A3 PDF using Puppeteer.

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const url = process.env.URL || 'http://localhost:8080/';
  const outfile = process.env.OUTPUT || 'poster_a3.pdf';

  // Launch Chromium
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Optional: make sure the canvas gets a big raster backing store
  await page.setViewport({ width: 1600, height: 2400, deviceScaleFactor: 2 });

  // Go to your page and wait for network to be quiet
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });

  // Wait until the page says it’s done rendering
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#status');
        return el && /Done\./i.test(el.textContent || el.innerText);
      },
      { timeout: 180000 } // up to 3 minutes for heavy renders
    );
  } catch (e) {
    console.warn('Timed out waiting for "Done." in #status — continuing anyway.');
  }

  // Ensure controls/headers don’t eat margins in PDF (optional)
  await page.addStyleTag({ content: `
    @page { size: A3; margin: 0; }
    body { margin: 0 !important; }
    header, #status { display: none !important; }
    #container { position: relative !important; height: 100vh !important; }
    canvas { width: 100vw !important; height: 100vh !important; }
    #bigTitle { 
      font-size: clamp(28px, 5vw, 120px) !important;
      text-shadow:
        -1px -1px 0 #fff, 1px -1px 0 #fff,
        -1px  1px 0 #fff, 1px  1px 0 #fff,
        0 0 6px #fff !important;
    }
  `});

  // Save as A3 PDF at full bleed
  await page.pdf({
    path: outfile,
    printBackground: true,
    width: '297mm',
    height: '420mm',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  });

  await browser.close();

  console.log(`Wrote ${path.resolve(outfile)}`);
})();
