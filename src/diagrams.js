// Renders Mermaid diagram source to PNG images with a headless browser.
// If no browser is available, rendering returns null and the Word file shows the
// Mermaid source as a code block instead, so generation never fails because of a diagram.
const path = require('path');

const MERMAID_JS = path.join(path.dirname(require.resolve('mermaid/package.json')), 'dist', 'mermaid.min.js');

const THEME = {
  theme: 'base',
  themeVariables: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '14px',
    primaryColor: '#F4E8DE',
    primaryBorderColor: '#7A4E2D',
    primaryTextColor: '#2B1D12',
    lineColor: '#7A4E2D',
    secondaryColor: '#FBF6F1',
    tertiaryColor: '#FFFFFF',
    actorBkg: '#F4E8DE',
    actorBorder: '#7A4E2D',
    noteBkgColor: '#FBF6F1',
    noteBorderColor: '#9A6542',
  },
};

async function launchBrowser() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    return null;
  }
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  try {
    return await playwright.chromium.launch(opts);
  } catch (err) {
    console.warn(`[diagrams] Could not start a browser, diagrams will be shown as source: ${err.message}`);
    return null;
  }
}

// sources: array of Mermaid strings. Returns an array of {png, width, height} or null per diagram.
async function renderDiagrams(sources) {
  if (!sources.length) return [];
  const browser = await launchBrowser();
  if (!browser) return sources.map(() => null);

  const results = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1000 } });
    await page.setContent('<!doctype html><html><body style="margin:0;background:#fff"><div id="out"></div></body></html>');
    await page.addScriptTag({ path: MERMAID_JS });
    await page.evaluate((cfg) => window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...cfg }), THEME);

    for (let i = 0; i < sources.length; i++) {
      try {
        const ok = await page.evaluate(async ({ src, id }) => {
          const out = document.getElementById('out');
          out.innerHTML = '';
          const { svg } = await window.mermaid.render(id, src);
          out.innerHTML = svg;
          const el = out.querySelector('svg');
          el.style.maxWidth = '900px'; // close to the 7-inch page width, so text is not shrunk much
          el.style.background = '#fff';
          return true;
        }, { src: sources[i], id: `d${i}` });
        if (!ok) throw new Error('render failed');
        const el = await page.$('#out svg');
        const box = await el.boundingBox();
        const png = await el.screenshot({ type: 'png', omitBackground: false });
        results.push({ png, width: box.width, height: box.height });
      } catch (err) {
        console.warn(`[diagrams] Diagram ${i + 1} could not be rendered, using source instead: ${err.message.split('\n')[0]}`);
        results.push(null);
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

module.exports = { renderDiagrams };
