import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Chess } from 'chess.js';
import fs from 'node:fs';
import { LESSONS, type Task } from '../src/data/lessons';
import { REPERTOIRE } from '../src/data/openings-repertoire';
import { ENDGAMES } from '../src/data/endgames';
import { nodeEngine } from './nodeEngine';
import { quickJudge } from '../src/coach/coach';
import { setBook, inBook } from '../src/data/openings';
import { uciToMove } from '../src/chess/util';
import type { Engine } from '../src/engine/uci';

const tasks: { lesson: string; t: Task }[] = [];
for (const l of LESSONS) {
  for (const s of l.steps) if (s.kind === 'task') tasks.push({ lesson: l.id, t: s.task });
  for (const q of l.quiz) tasks.push({ lesson: l.id, t: q });
}

let e: Engine;
const report: any[] = [];
beforeAll(async () => { e = nodeEngine(); await e.whenReady(); setBook(JSON.parse(fs.readFileSync('public/data/openings.json', 'utf8'))); });
afterAll(() => { e?.terminate(); fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/content.json', JSON.stringify(report, null, 1)); });

describe('lesson positions: legal and engine-approved', () => {
  for (const { lesson, t } of tasks) {
    test(`${lesson}: ${t.prompt.slice(0, 60)}`, async () => {
      const c = new Chess(t.fen);
      // side not to move must not be in check
      const parts = t.fen.split(' '); parts[1] = parts[1] === 'w' ? 'b' : 'w';
      let flippedCheck = false;
      try { flippedCheck = new Chess(parts.join(' ')).inCheck(); } catch { flippedCheck = false; }
      expect(flippedCheck).toBe(false);
      expect(c.isGameOver()).toBe(false);
      const before = await e.analyse(t.fen, { multipv: 3, depth: 16 });
      for (const a of t.accept) {
        const legal = new Chess(t.fen);
        expect(() => legal.move(uciToMove(a))).not.toThrow();
        const j = await quickJudge(e, t.fen, a, before);
        report.push({ lesson, prompt: t.prompt, answer: a, loss: +j.loss.toFixed(1), engineBest: before.lines[0].pv[0] });
        expect(j.loss).toBeLessThanOrEqual(5);
      }
    });
  }
});

describe('opening repertoire', () => {
  for (const l of REPERTOIRE) {
    test(`${l.opening}: ${l.name} is legal and starts in the Lichess book`, () => {
      const c = new Chess();
      let inTheory = 0;
      for (const m of l.moves) { c.move(m); if (inBook(c.fen())) inTheory++; }
      expect(inTheory).toBeGreaterThanOrEqual(3);
      for (const k of Object.keys(l.ideas)) {
        const i = Number(k);
        expect(i % 2 === (l.side === 'w' ? 0 : 1)).toBe(true);
      }
    });
  }
});

describe('endgame drills', () => {
  for (const d of ENDGAMES) test(d.title, () => {
    const c = new Chess(d.fen);
    expect(c.turn()).toBe(d.side);
    expect(c.isGameOver()).toBe(false);
  });
});

describe('puzzle dataset', () => {
  test('every stored puzzle is legal (re-validated)', () => {
    const idx = JSON.parse(fs.readFileSync('public/data/puzzles/index.json', 'utf8'));
    let n = 0;
    for (const b of idx.bands) {
      const rows = JSON.parse(fs.readFileSync(`public/data/puzzles/${b.file}`, 'utf8'));
      for (const [, fen, moves] of rows) {
        const c = new Chess(fen);
        for (const u of moves.split(' ')) c.move(uciToMove(u));
        n++;
      }
    }
    expect(n).toBe(idx.total);
    expect(n).toBeGreaterThanOrEqual(8000);
  });
});
