// Diagnostic dump (not a pass/fail test): run with PROBE=1 npx vitest run tests/probe.test.ts
import { test } from 'vitest';
import { Chess } from 'chess.js';
import { nodeEngine } from './nodeEngine';
import { coachMove } from '../src/coach/coach';
import { CLASSIFY_CASES, TAG_CASES } from './positions';

test.skipIf(!process.env.PROBE)('probe', async () => {
  let e = nodeEngine();
  await e.whenReady();
  const budget = { depth: 16, movetime: 0 } as any;
  const all = [...CLASSIFY_CASES.map((c) => ({ ...c, kind: 'cls' })), ...TAG_CASES.map((c) => ({ ...c, kind: 'tag', expect: c.tag }))] as any[];
  const filter = process.env.PROBE !== '1' ? new RegExp(process.env.PROBE!, 'i') : null;
  for (const c of all) {
    if (filter && !filter.test(c.name)) continue;
    const run = async () => {
    let move = c.move;
    const before = await e.analyse(c.fen, { multipv: 3, depth: 16 });
    if (c.top) move = before.lines[0].pv[0];
    const r = await coachMove(e, { before, fenBefore: c.fen, move, history: c.history ?? [], opponentPrevLoss: c.prevLoss ?? null, isBook: !!c.book, ply: 10, budget: { depth: 16, movetime: 0 } as any });
    const ok = c.kind === 'cls' ? r.verdict === c.expect : r.allTags.some((t: any) => t.id === c.expect) ;
    console.log(`${ok ? 'PASS' : 'FAIL'} [${c.kind}] ${c.name} | move ${move} → ${r.verdict} (exp ${c.expect}) loss ${r.ev.loss.toFixed(1)} wpBest ${r.ev.wpBest.toFixed(0)} wpAfter ${r.ev.wpAfter.toFixed(0)} 2nd ${r.ev.secondWp?.toFixed(0)} mateB ${r.ev.mateBefore} mateA ${r.ev.mateAfter} | tags ${r.tags.map((t: any) => t.id).join(',')} all ${r.allTags.map((t: any) => t.id).join(',')} | ${r.reasons.join(';')}\n   » ${r.explanation.summary} | ${r.explanation.happened} | ${r.explanation.cost} | ${r.explanation.instead}`);
    };
    const to = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000));
    try { await Promise.race([run(), to]); } catch (err) { console.log(`TIMEOUT ${c.name}`); e.terminate(); e = nodeEngine(); await e.whenReady(); }
  }
  e.terminate();
}, 600000);
