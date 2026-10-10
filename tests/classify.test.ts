import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { nodeEngine } from './nodeEngine';
import { coachMove } from '../src/coach/coach';
import { classify, evaluateMove, winPct, moveAccuracy } from '../src/coach/classify';
import type { Engine, Analysis } from '../src/engine/uci';
import { CLASSIFY_CASES, CALIBRATION_CASES } from './positions';
import fs from 'node:fs';

let e: Engine;
const results: { name: string; expect: string; got: string; loss: number }[] = [];
beforeAll(async () => { e = nodeEngine(); await e.whenReady(); });
afterAll(() => {
  e?.terminate();
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync('reports/classification.json', JSON.stringify(results, null, 1));
});

const budget = { depth: 16, movetime: 0 } as any;

describe('classification on known positions (Stockfish depth 16)', () => {
  for (const c of CLASSIFY_CASES) {
    test(c.name, async () => {
      const before = await e.analyse(c.fen, { multipv: 3, depth: 16 });
      const move = c.top ? before.lines[0].pv[0] : c.move;
      const r = await coachMove(e, { before, fenBefore: c.fen, move, history: c.history ?? [], opponentPrevLoss: c.prevLoss ?? null, isBook: !!c.book, ply: 10, budget });
      results.push({ name: c.name, expect: c.expect, got: r.verdict, loss: +r.ev.loss.toFixed(1) });
      expect(r.verdict).toBe(c.expect);
    });
  }
});

describe('calibration report (near-threshold quiet moves, informational)', () => {
  for (const c of CALIBRATION_CASES) {
    test(c.name, async () => {
      const r = await coachMove(e, { fenBefore: c.fen, move: c.move, history: c.history ?? [], opponentPrevLoss: null, isBook: false, ply: 4, budget });
      results.push({ name: '[calibration] ' + c.name, expect: c.expect, got: r.verdict, loss: +r.ev.loss.toFixed(1) });
      expect(r.ev.loss).toBeGreaterThanOrEqual(0);
    });
  }
});

// Deterministic unit tests of the thresholds with synthetic engine output.
const A = (fen: string, lines: [string, number | null, number | null][]): Analysis => ({
  fen, depth: 16, timeMs: 1, bestmove: lines[0][0], nodes: 1,
  lines: lines.map(([m, cp, mate], i) => ({ multipv: i + 1, depth: 16, cp, mate, pv: [m, 'e7e5'] })),
});
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function band(cpBest: number, cpAfter: number, move = 'b1c3') {
  const before = A(start, [['e2e4', cpBest, null], ['d2d4', cpBest - 1, null], ['g1f3', cpBest - 2, null]]);
  const after: Analysis = { ...A(start, [['e7e5', -cpAfter, null]]) };
  const ev = evaluateMove(before, after, move);
  return classify({ fenBefore: start, move, ev, opponentPrevLoss: null, isBook: false, ply: 1 }).verdict;
}

describe('threshold bands (synthetic)', () => {
  test('win% formula', () => {
    expect(winPct(0)).toBeCloseTo(50, 5);
    expect(winPct(300)).toBeGreaterThan(74);
    expect(winPct(-300)).toBeLessThan(26);
  });
  test('accuracy formula', () => { expect(moveAccuracy(0)).toBeCloseTo(100, 0); expect(moveAccuracy(30)).toBeLessThan(30); });
  test('top move → best', () => expect(band(30, 30, 'e2e4')).toBe('best'));
  test('loss ≈1 → excellent', () => expect(band(30, 20)).toBe('excellent'));
  test('loss ≈3.5 → good', () => expect(band(30, -8)).toBe('good'));
  test('loss ≈7 → inaccuracy', () => expect(band(30, -48)).toBe('inaccuracy'));
  test('loss ≈15 → mistake', () => expect(band(30, -140)).toBe('mistake'));
  test('loss >20 → blunder', () => expect(band(30, -400)).toBe('blunder'));
  test('allowing forced mate → blunder', () => {
    const before = A(start, [['e2e4', 30, null], ['d2d4', 29, null]]);
    const after = A(start, [['e7e5', null, 5]]);
    const ev = evaluateMove(before, after, 'f2f3');
    expect(classify({ fenBefore: start, move: 'f2f3', ev, opponentPrevLoss: null, isBook: false, ply: 1 }).verdict).toBe('blunder');
  });
});
