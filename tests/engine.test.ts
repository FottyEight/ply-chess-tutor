import { test, expect } from 'vitest';
import { nodeEngine } from './nodeEngine';

test('stockfish loads, speaks UCI and returns MultiPV lines', async () => {
  const e = nodeEngine();
  await e.whenReady();
  expect(e.name).toContain('Stockfish');
  const a = await e.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { multipv: 3, depth: 12 });
  expect(a.lines.length).toBe(3);
  expect(a.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/);
  const m = await e.analyse('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { multipv: 1, depth: 10 });
  expect(m.lines[0].mate).toBe(1);
  e.terminate();
}, 30000);
