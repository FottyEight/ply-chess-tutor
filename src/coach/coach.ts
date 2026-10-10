import { Chess } from 'chess.js';
import type { Engine, Analysis } from '../engine/uci';
import { COACH, type Verdict } from './config';
import { evaluateMove, classify, moveAccuracy, type Evaluated } from './classify';
import { runDetectors, type DetectContext, type Tag } from './detectors';
import { writeExplanation, type Explanation } from './writer';
import { uciToMove } from '../chess/util';

export interface CoachInput {
  fenBefore: string;
  move: string;
  before?: Analysis;
  history: DetectContext['history'];
  opponentPrevLoss: number | null;
  prevCaptureSquare?: string | null;
  isBook: boolean;
  ply: number;
  budget?: { depth: number; movetime: number };
}

export interface CoachResult {
  verdict: Verdict;
  ev: Evaluated;
  tags: Tag[];
  /** every detector hit, before filtering by verdict */
  allTags: Tag[];
  explanation: Explanation;
  accuracy: number;
  before: Analysis;
  after: Analysis | null;
  reasons: string[];
}

export const defaultBudget = (phone: boolean): { depth: number; movetime: number } => ({
  depth: phone ? COACH.analysis.depthPhone : COACH.analysis.depthDesktop,
  movetime: phone ? COACH.analysis.movetimePhone : COACH.analysis.movetimeDesktop,
});

export async function analyseBefore(engine: Engine, fen: string, budget = defaultBudget(false), onUpdate?: (a: Analysis) => void) {
  return engine.analyse(fen, { multipv: COACH.analysis.multipv, depth: budget.depth, movetime: budget.movetime, onUpdate });
}

export async function coachMove(engine: Engine, inp: CoachInput): Promise<CoachResult> {
  const budget = inp.budget ?? defaultBudget(false);
  const before = inp.before ?? (await analyseBefore(engine, inp.fenBefore, budget));
  const c = new Chess(inp.fenBefore);
  c.move(uciToMove(inp.move));
  let after: Analysis | null = null;
  if (!c.isGameOver()) after = await engine.analyse(c.fen(), { multipv: 1, depth: budget.depth, movetime: budget.movetime });
  return finishCoach(inp, before, after, c);
}

export function finishCoach(inp: CoachInput, before: Analysis, after: Analysis | null, afterChess?: Chess): CoachResult {
  const c = afterChess ?? (() => { const x = new Chess(inp.fenBefore); x.move(uciToMove(inp.move)); return x; })();
  const ev = evaluateMove(before, after, inp.move);
  if (c.isStalemate() || c.isDraw()) {
    // drawn outcome: score it as 0.5
    ev.wpAfter = 50; ev.cpAfter = 0; ev.loss = Math.max(0, ev.wpBest - 50); ev.mateAfter = null;
  }
  const cls = classify({ fenBefore: inp.fenBefore, move: inp.move, ev, opponentPrevLoss: inp.opponentPrevLoss, isBook: inp.isBook, ply: inp.ply, prevCaptureSquare: inp.prevCaptureSquare, secondMate: before.lines[1]?.mate ?? null });
  const tags = runDetectors({ fenBefore: inp.fenBefore, move: inp.move, punish: ev.punish, bestLine: ev.bestLine, mateBefore: ev.mateBefore, mateAfter: ev.mateAfter, history: inp.history });
  // For good moves, only keep "positive" tags; for errors, drop tags that describe chances you missed unless it was a Miss.
  const negative = ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(cls.verdict);
  const missTags = new Set(['missedFreeCapture', 'missedFork', 'forcedMateMissed']);
  let used = negative ? tags : [];
  if (negative && cls.verdict !== 'miss') used = tags.filter((t) => !missTags.has(t.id) || tags.length === 1);
  if (cls.verdict === 'miss') used = [...tags.filter((t) => missTags.has(t.id) || (t.id === 'backRank' && t.facts.against === 0)), ...tags.filter((t) => !missTags.has(t.id))];
  if (cls.verdict === 'inaccuracy') used = used.filter((t) => t.id !== 'losesMaterial' || used.length === 1);
  const explanation = writeExplanation({ verdict: cls.verdict, fenBefore: inp.fenBefore, move: inp.move, ev, tags: used, sacrifice: cls.sacrifice });
  return { verdict: cls.verdict, ev, tags: used, allTags: tags, explanation, accuracy: moveAccuracy(ev.loss), before, after, reasons: cls.reasons };
}

/** Quick pre-commit check for "Warn me before I blunder": scores a candidate move without playing it. */
export async function quickJudge(engine: Engine, fenBefore: string, move: string, before: Analysis | null) {
  let b = before;
  if (!b || b.fen !== fenBefore) b = await engine.analyse(fenBefore, { multipv: COACH.analysis.multipv, depth: COACH.analysis.warnDepth });
  const inTop = b.lines.find((l) => l.pv[0] === move);
  let a: Analysis | null = null;
  if (!inTop) {
    const s = await engine.analyse(fenBefore, { multipv: 1, depth: COACH.analysis.warnDepth, searchmoves: [move] });
    const l = s.lines[0];
    // re-express as an "after" analysis (opponent to move) by negating
    if (l) a = { ...s, lines: [{ ...l, cp: l.cp !== null ? -l.cp : null, mate: l.mate !== null ? -l.mate : null, pv: l.pv.slice(1) }] };
  }
  const ev = evaluateMove(b, a, move);
  return { loss: ev.loss, ev, before: b };
}
