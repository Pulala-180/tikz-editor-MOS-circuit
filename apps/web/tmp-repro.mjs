import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (msg) => console.log('console', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('pageerror', err?.stack || err?.message || String(err)));
await page.goto('http://localhost:4173/');
await page.waitForSelector('[data-testid="tab-strip"]');

async function setSource(src, label) {
  const count = await page.locator('.cm-content').count();
  console.log(label, 'cm-count', count);
  const editor = page.locator('.cm-content').first();
  await editor.click({ timeout: 10000 });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(src);
}

const source2 = String.raw`\\documentclass{article}
\\begin{document}
\\begin{tikzpicture}
  \\draw (0,0) -- (1,0);
\\end{tikzpicture}
\\begin{tikzpicture}
  \\draw (0,0) -- (0,1);
\\end{tikzpicture}
\\end{document}`;

const source1 = String.raw`\\documentclass{article}
\\begin{document}
\\begin{tikzpicture}
  \\draw (0,0) -- (1,0);
\\end{tikzpicture}
\\end{document}`;

await setSource(source2,'before-1');
await page.waitForTimeout(1200);
console.log('figure buttons', await page.getByRole('button', { name: /Figure 2/ }).count());
await page.getByRole('button', { name: 'Figure 2' }).click();
await page.waitForTimeout(500);
await setSource(source1,'before-2');
await page.waitForTimeout(1200);
console.log('done cm', await page.locator('.cm-content').count());

await browser.close();
