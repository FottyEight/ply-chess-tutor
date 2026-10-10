// PWA install/offline check and engine performance (desktop vs throttled phone-class CPU).
import { launch, page, sleep } from './browser.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4173';
const b = await launch();
const out = {};
{
  const { p, errors } = await page(b, { width: 390, height: 844 });
  await p.goto(URL + '/#/puzzles', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), { timeout: 20000 });
  await sleep(4000);
  const manifest = await p.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); return l ? (await fetch(l.href)).json() : null; });
  out.manifest = manifest && { name: manifest.name, display: manifest.display, icons: manifest.icons.length, start_url: manifest.start_url };
  const cached = await p.evaluate(async () => { const keys = await caches.keys(); let n = 0; const want = []; for (const k of keys) { const c = await caches.open(k); const r = await c.keys(); n += r.length; want.push(...r.map((x) => x.url).filter((u) => /stockfish|p1000|openings/.test(u))); } return { n, want }; });
  out.precache = cached;
  await p.reload({ waitUntil: 'networkidle0' });
  await p.setOfflineMode(true);
  await p.goto(URL + '/#/tutor', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const title = await p.$eval('h1', (e) => e.textContent).catch(() => null);
  await p.click('.btn.primary.big');
  await sleep(1000);
  const a = await p.evaluate(() => { const s = document.querySelector('[data-sq="e2"]').getBoundingClientRect(); const t = document.querySelector('[data-sq="e4"]').getBoundingClientRect(); return [s.x + s.width / 2, s.y + s.height / 2, t.x + t.width / 2, t.y + t.height / 2]; });
  await p.mouse.click(a[0], a[1]); await sleep(100); await p.mouse.click(a[2], a[3]);
  const coached = await p.waitForFunction(() => document.querySelector('.coach-card[data-v]'), { timeout: 30000 }).then(() => true).catch(() => false);
  out.offline = { appShellLoads: !!title, engineCoachesOffline: coached };
  await p.goto(URL + '/#/puzzles/rated', { waitUntil: 'domcontentloaded' }); await sleep(2500);
  out.offline.puzzlesOffline = !!(await p.$('.puzzle .board'));
  out.pwaErrors = errors;
  await p.close();
}
for (const [label, rate] of [['desktop (no throttle)', 1], ['phone-class (4x CPU throttle)', 4], ['low-end phone (6x CPU throttle)', 6]]) {
  const { p } = await page(b, { width: 390, height: 844, mobile: rate > 1 });
  await p.goto(URL + '/#/more', { waitUntil: 'networkidle0' });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  if (rate > 1) await p.evaluate(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  await sleep(500);
  await p.click('#bench');
  await p.waitForFunction(() => /Longest/.test(document.querySelector('#bench-out')?.textContent || ''), { timeout: 120000 });
  out[label] = await p.$eval('#bench-out', (e) => e.textContent);
  console.log(label, out[label]);
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
fs.writeFileSync('reports/pwa-perf.json', JSON.stringify(out, null, 1));
await b.close();
