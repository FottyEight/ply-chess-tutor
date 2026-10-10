// Visits every screen at the required viewports, checks layout invariants and saves screenshots.
import { launch, page, tapMove, sleep } from './browser.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4173';
const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: '844x390', width: 844, height: 390, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: true },
  { name: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1440x900-dark', width: 1440, height: 900, mobile: false, dark: true },
];
const ROUTES = ['/tutor', 'PLAY', '/puzzles', '/puzzles/rated', '/learn', '/learn/lesson/pin', '/learn/openings/ck-classical', '/progress', '/more', '/review'];
const out = [];
const b = await launch();
for (const vp of VIEWPORTS) {
  const { p, errors } = await page(b, vp);
  for (const r of ROUTES) {
    if (r === 'PLAY') {
      await p.goto(URL + '/#/tutor', { waitUntil: 'networkidle0' });
      await p.evaluate(() => (document.querySelector('.btn.primary.big') || document.querySelector('.game-ctrl .btn'))?.click());
      await sleep(1200);
      try { await tapMove(p, 'd2', 'd4'); } catch { /* playing black */ }
      await sleep(3500);
    } else {
      await p.goto(URL + '/#' + r, { waitUntil: 'networkidle0' });
      await sleep(1100);
    }
    const m = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const overflowX = document.scrollingElement.scrollWidth > vw + 1;
      const board = document.querySelector('.board');
      const br = board?.getBoundingClientRect();
      const tab = document.querySelector('.tabbar').getBoundingClientRect();
      const sheet = document.querySelector('.sheet');
      const sheetTop = sheet ? sheet.getBoundingClientRect().top : Infinity;
      const isRail = tab.height > tab.width;
      const clipped = br ? (br.left < -1 || br.right > vw + 1 || br.width < 120) : false;
      // is the board covered by the bottom bar or the sheet? (only meaningful for screens that fit on one screen)
      const covered = br && !isRail && document.querySelector('.tutor') ? (br.bottom > Math.min(tab.top, sheetTop) + 1) : false;
      const small = [...document.querySelectorAll('button, a.btn, a.row, a.tab, .chip')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 32 || r.width < 32) && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20));
      return { overflowX, clipped, covered, boardSize: br ? Math.round(br.width) : null, small: small.slice(0, 5) };
    });
    const file = `reports/screens/${vp.name}${r.replace(/\//g, '_') || '_root'}.png`;
    await p.screenshot({ path: file });
    out.push({ viewport: vp.name, route: r, ...m });
    console.log(vp.name, r, JSON.stringify(m));
  }
  out.push({ viewport: vp.name, consoleErrors: errors });
  if (errors.length) console.log('ERRORS', vp.name, errors);
  await p.close();
}
fs.writeFileSync('reports/devices.json', JSON.stringify(out, null, 1));
await b.close();
