// Functional browser checks: puzzle solving, a mistake with pause + try again, warn mode, lessons, review.
import { launch, page, tapMove, dragMove, sleep } from './browser.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4173';
const results = [];
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info}`); };
const b = await launch();
const { p, errors } = await page(b, { width: 390, height: 844 });

// ---- puzzle: solve a rated puzzle using the dataset
const idx = JSON.parse(fs.readFileSync('public/data/puzzles/index.json', 'utf8'));
const { Chess: C0 } = await import('chess.js');
const all = idx.bands.flatMap((x) => JSON.parse(fs.readFileSync(`public/data/puzzles/${x.file}`, 'utf8'))).map((r) => { const c = new C0(r[1]); c.move({ from: r[2].slice(0, 2), to: r[2].slice(2, 4), promotion: r[2][4] }); return [...r, c.fen()]; });
const findPz = (fen) => all.find((r) => r[1] === fen || r[5] === fen);
await p.goto(URL + '/#/puzzles/rated', { waitUntil: 'networkidle0' });
await sleep(1500);
const fenStart = await p.$eval('.board', (el) => el.dataset.fen);
const pz = findPz(fenStart);
if (!pz) ok('rated puzzle found in dataset', false, fenStart); else {
  await sleep(800);
  const moves = pz[2].split(' ');
  for (let i = 1; i < moves.length; i += 2) {
    await p.waitForFunction((n) => document.querySelector('.board')?.classList.contains('movable'), { timeout: 8000 }, i);
    await tapMove(p, moves[i].slice(0, 2), moves[i].slice(2, 4));
    if (moves[i].length === 5) { await sleep(200); await p.click('.promo button'); }
    await sleep(900);
  }
  const msg = await p.$eval('.puzzle-msg', (e) => e.textContent);
  ok('rated puzzle solved via tap-to-move', /Solved|Checkmate/.test(msg), msg.slice(0, 90));
  const delta = await p.$eval('.rating-big', (e) => e.textContent);
  ok('puzzle rating updates', /\+/.test(delta), delta);
}

// ---- puzzle: wrong move gets an explanation
await p.goto(URL + '/#/puzzles/themes/fork', { waitUntil: 'networkidle0' });
await sleep(1500);
const f2 = await p.$eval('.board', (el) => el.dataset.fen);
const pz2 = findPz(f2);
if (pz2) {
  const { Chess } = await import('chess.js');
  const c = new Chess(pz2[5]);
  const sol = pz2[2].split(' ')[1];
  const wrong = c.moves({ verbose: true }).find((m) => m.lan !== sol && !m.promotion);
  await p.waitForFunction(() => document.querySelector('.board')?.classList.contains('movable'), { timeout: 8000 });
  await dragMove(p, wrong.from, wrong.to);
  await sleep(3500);
  const msg = await p.$eval('.puzzle-msg', (e) => e.textContent);
  ok('wrong puzzle move explained (drag-and-drop)', /doesn’t work/.test(msg), msg.slice(0, 140));
  const hasRetry = await p.$$eval('.puzzle-side .btn', (bs) => bs.map((x) => x.textContent).join('|'));
  ok('retry / show solution offered', /Try again/.test(hasRetry) && /Show solution/.test(hasRetry), hasRetry);
}

// ---- tutor: blunder pauses the game in practice mode, try again works
await p.goto(URL + '/#/tutor', { waitUntil: 'networkidle0' });
await p.evaluate(() => { localStorage.clear(); });
const segs = await p.$$('.seg button');
await p.click('.btn.primary.big');
await sleep(1200);
await tapMove(p, 'e2', 'e4'); await sleep(3500);
await tapMove(p, 'd1', 'h5'); await sleep(3500);
// now try a real blunder: queen to a square attacked by a pawn or piece if possible
const fen3 = await p.$eval('.board', (el) => el.dataset.fen);
const { Chess } = await import('chess.js');
const c3 = new Chess(fen3);
const qMoves = c3.moves({ verbose: true }).filter((m) => m.piece === 'q');
const hang = qMoves.find((m) => { const t = new Chess(fen3); t.move(m.san); return t.moves({ verbose: true }).some((r) => r.to === m.to && r.captured === 'q' && r.piece !== 'q'); });
if (hang) {
  await tapMove(p, hang.from, hang.to);
  await p.waitForFunction(() => document.querySelector('.coach-card[data-v]'), { timeout: 20000 });
  await sleep(500);
  const v = await p.$eval('.coach-card', (e) => e.dataset.v);
  const txt = await p.$eval('.coach-card', (e) => e.innerText);
  ok('hanging the queen is a blunder/mistake', ['blunder', 'mistake', 'miss'].includes(v), `${hang.san}: ${v}`);
  ok('coach explains and shows the details open', /What happened/.test(txt) && /What to play instead/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 220));
  const paused = await p.$('.coach-actions .btn.primary');
  ok('game pauses after the mistake (Continue shown)', !!paused);
  await p.screenshot({ path: 'reports/screens/blunder-390.png' });
  // open the sheet to see the whole explanation
  await p.click('.sheet-handle'); await sleep(500);
  await p.screenshot({ path: 'reports/screens/blunder-sheet-390.png' });
  await p.click('.sheet-handle'); await sleep(400);
  const btns = await p.$$('.coach-actions .btn');
  for (const bt of btns) { const t = await bt.evaluate((e) => e.textContent); if (/Try again/.test(t)) { await bt.click(); break; } }
  await sleep(800);
  const fenAfterTry = await p.$eval('.board', (el) => el.dataset.fen);
  ok('try again restores the position', fenAfterTry === fen3);
  // show best move
} else ok('found a queen-hanging move', false);

// ---- warn mode
await p.goto(URL + '/#/more', { waitUntil: 'networkidle0' });
await sleep(500);
const toggles = await p.$$('.toggle');
for (const t of toggles) { const label = await t.evaluate((e) => e.textContent); if (/Warn me/.test(label)) { await t.click(); break; } }
await p.goto(URL + '/#/tutor', { waitUntil: 'networkidle0' });
await sleep(800);
const fen4 = await p.$eval('.board', (el) => el.dataset.fen);
const c4 = new Chess(fen4);
const hang4 = c4.moves({ verbose: true }).filter((m) => m.piece === 'q').find((m) => { const t = new Chess(fen4); t.move(m.san); return t.moves({ verbose: true }).some((r) => r.to === m.to && r.captured === 'q' && r.piece !== 'q'); });
if (hang4) {
  await tapMove(p, hang4.from, hang4.to);
  await p.waitForFunction(() => document.querySelector('.warn'), { timeout: 15000 }).catch(() => {});
  const warn = await p.$('.warn');
  ok('warn-before-blunder prompt appears', !!warn);
  if (warn) { await p.screenshot({ path: 'reports/screens/warn-390.png' }); await p.click('.warn .btn.primary'); await sleep(400); }
  const fenW = await p.$eval('.board', (el) => el.dataset.fen);
  ok('take it back keeps the position', fenW === fen4);
}
for (const t of await p.$$('.toggle')) { /* leave */ }

// ---- resign and review
await p.click('.sheet-handle'); await sleep(500);
await p.click('.game-ctrl .btn.danger'); await sleep(300);
await p.click('.dialog .btn.danger'); await sleep(800);
const rev = await p.$('.game-ctrl .btn.primary');
ok('game over offers review', !!rev);
if (rev) { await rev.click(); await sleep(1200); const h = await p.$eval('h1', (e) => e.textContent); ok('review screen opens', /You (won|lost)|Draw/.test(h), h); await p.screenshot({ path: 'reports/screens/review-390.png', fullPage: true }); }

// ---- lesson
await p.goto(URL + '/#/learn/lesson/fork', { waitUntil: 'networkidle0' });
await sleep(800);
await tapMove(p, 'd5', 'c7'); await sleep(500);
const lok = await p.$eval('.task-ok', (e) => e.textContent).catch(() => '');
ok('lesson exercise accepts the fork', /Correct/.test(lok), lok.slice(0, 60));

ok('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
fs.writeFileSync('reports/flows.json', JSON.stringify(results, null, 1));
await b.close();
