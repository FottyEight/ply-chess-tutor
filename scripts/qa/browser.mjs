// Shared headless-Chrome helper for the QA scripts (uses the Chromium build bundled in @sparticuz/chromium).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export async function launch() {
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--enable-unsafe-swiftshader'],
    headless: true,
    defaultViewport: null,
  });
}

export async function page(browser, { width, height, mobile = true, dark = false }) {
  const p = await browser.newPage();
  await p.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  if (dark) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  return { p, errors };
}

/** Center of a board square in page coordinates (board orientation aware). */
export async function squareCenter(p, sq, selector = '.board') {
  return p.evaluate((sq, selector) => {
    const el = document.querySelector(`${selector} [data-sq="${sq}"]`);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sq, selector);
}

export async function tapMove(p, from, to) {
  const a = await squareCenter(p, from);
  const b = await squareCenter(p, to);
  await p.mouse.click(a.x, a.y);
  await new Promise((r) => setTimeout(r, 120));
  await p.mouse.click(b.x, b.y);
}

export async function dragMove(p, from, to) {
  const a = await squareCenter(p, from);
  const b = await squareCenter(p, to);
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await p.mouse.up();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
