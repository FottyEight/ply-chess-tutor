// Not part of `npm test` (slow). Run: npx vitest run --config vitest.slow.config.ts
// Measures how each opponent level behaves: per-move accuracy and blunder rate (judged by a separate
// depth-12 engine), plus a mini round robin between the levels.
import { test } from 'vitest';
import { Chess } from 'chess.js';
import fs from 'node:fs';
import { nodeEngine } from './nodeEngine';
import { LEVELS, pickMove, type Level } from '../src/engine/levels';
import { lineCp, winPct, moveAccuracy } from '../src/coach/classify';

test('opponent levels', async () => {
  const player = nodeEngine(); const judge = nodeEngine();
  await player.whenReady(); await judge.whenReady();
  let seed = 7; const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const stats: Record<string, { moves: number; acc: number; blunders: number; mistakes: number; ms: number }> = {};
  for (const l of LEVELS) stats[l.id] = { moves: 0, acc: 0, blunders: 0, mistakes: 0, ms: 0 };
  const score: Record<string, number> = Object.fromEntries(LEVELS.map((l) => [l.id, 0]));
  const games: any[] = [];
  async function play(w: Level, b: Level) {
    const c = new Chess();
    while (!c.isGameOver() && c.history().length < 160) {
      const lvl = c.turn() === 'w' ? w : b;
      const fen = c.fen();
      const t0 = Date.now();
      const mv = await pickMove(player, fen, lvl, rand);
      stats[lvl.id].ms += Date.now() - t0;
      const before = await judge.analyse(fen, { multipv: 1, depth: 12 });
      c.move({ from: mv.uci.slice(0, 2), to: mv.uci.slice(2, 4), promotion: mv.uci[4] || undefined });
      let wpAfter: number;
      if (c.isCheckmate()) wpAfter = 100; else if (c.isGameOver()) wpAfter = 50;
      else { const a = await judge.analyse(c.fen(), { multipv: 1, depth: 12 }); wpAfter = 100 - winPct(lineCp(a.lines[0])); }
      const loss = Math.max(0, winPct(lineCp(before.lines[0])) - wpAfter);
      const s = stats[lvl.id]; s.moves++; s.acc += moveAccuracy(loss); if (loss > 20) s.blunders++; else if (loss > 10) s.mistakes++;
    }
    const res = c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') : '1/2-1/2';
    if (res === '1-0') score[w.id] += 1; else if (res === '0-1') score[b.id] += 1; else { score[w.id] += 0.5; score[b.id] += 0.5; }
    games.push({ white: w.id, black: b.id, result: res, plies: c.history().length });
    console.log(w.id, 'vs', b.id, res, c.history().length);
  }
  for (let i = 0; i < LEVELS.length; i++) for (let j = i + 1; j < LEVELS.length; j++) { await play(LEVELS[i], LEVELS[j]); await play(LEVELS[j], LEVELS[i]); }
  const report = LEVELS.map((l) => { const s = stats[l.id]; return { level: l.name, elo: l.elo, moves: s.moves, accuracy: +(s.acc / s.moves).toFixed(1), blundersPer100: +(100 * s.blunders / s.moves).toFixed(1), mistakesPer100: +(100 * s.mistakes / s.moves).toFixed(1), msPerMove: Math.round(s.ms / s.moves), roundRobinPoints: score[l.id] }; });
  console.table(report);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/levels.json', JSON.stringify({ report, games }, null, 1));
  player.terminate(); judge.terminate();
}, 1_800_000);
