import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { nodeEngine } from './nodeEngine';
import { coachMove } from '../src/coach/coach';
import type { Engine } from '../src/engine/uci';
import { TAG_CASES } from './positions';
import fs from 'node:fs';

let e: Engine;
const out: any[] = [];
beforeAll(async () => { e = nodeEngine(); await e.whenReady(); });
afterAll(() => { e?.terminate(); fs.mkdirSync('reports', { recursive: true }); fs.writeFileSync('reports/explanations.json', JSON.stringify(out, null, 1)); });

describe('explanation detectors name the known reason', () => {
  for (const c of TAG_CASES) {
    test(`${c.name} → ${c.tag}`, async () => {
      const r = await coachMove(e, { fenBefore: c.fen, move: c.move, history: c.history ?? [], opponentPrevLoss: null, isBook: false, ply: 10, budget: { depth: 16, movetime: 0 } as any });
      const ids = r.allTags.map((t) => t.id);
      out.push({ name: c.name, expected: c.tag, tags: ids, verdict: r.verdict, summary: r.explanation.summary, happened: r.explanation.happened, cost: r.explanation.cost, instead: r.explanation.instead });
      expect(ids).toContain(c.tag);
      // every explanation for a mistake must say what to play instead
      if (['mistake', 'blunder', 'miss'].includes(r.verdict)) expect(r.explanation.instead.length).toBeGreaterThan(10);
      // tags carry squares for board highlighting
      const t = r.allTags.find((x) => x.id === c.tag)!;
      expect(t.squares.length).toBeGreaterThan(0);
    });
  }
});
