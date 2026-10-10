import { Chess } from 'chess.js';
import type { Analysis, Line } from '../engine/uci';
import { COACH, type Verdict } from './config';
import { materialAlongLine, tryMove, seeSwap, type Color, type Square } from '../chess/util';

export const MATE_CP = 10000;

/** Win probability (0..100) from centipawns, Lichess formula. */
export function winPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Line score as centipawns from the side-to-move's view (mates mapped to ±10000 minus distance). */
export function lineCp(l: Pick<Line, 'cp' | 'mate'>): number {
  if (l.mate !== null && l.mate !== undefined) {
    if (l.mate === 0) return -MATE_CP; // side to move is mated
    return Math.sign(l.mate) * (MATE_CP - Math.abs(l.mate) * 10);
  }
  return l.cp ?? 0;
}

/** Lichess-style per-move accuracy from win% lost. */
export function moveAccuracy(loss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export interface Evaluated {
  /** mover's win% if they play the best move */
  wpBest: number;
  /** mover's win% after the move actually played */
  wpAfter: number;
  /** wpBest - wpAfter, clamped at 0 */
  loss: number;
  cpBest: number;
  cpAfter: number;
  /** mate (mover POV) available before the move (positive = mover mates) */
  mateBefore: number | null;
  /** mate (mover POV) after the move (positive = mover mates, negative = mover gets mated) */
  mateAfter: number | null;
  /** opponent's best reply line after the move (UCI) */
  punish: string[];
  /** the move's own line starting with the move (UCI) */
  moveLine: string[];
  bestMove: string;
  bestLine: string[];
  secondWp: number | null;
  inTopLines: number; // index in before.lines or -1
}

/**
 * Combines the analysis of the position before the move (MultiPV) with the
 * analysis after it. If the move is one of the MultiPV lines we use that line's
 * score (same search, so the comparison is consistent).
 */
export function evaluateMove(before: Analysis, after: Analysis | null, move: string): Evaluated {
  const top = before.lines[0];
  const cpBest = lineCp(top);
  const idx = before.lines.findIndex((l) => l.pv[0] === move);
  let cpAfter: number;
  let mateAfter: number | null = null;
  let punish: string[] = [];
  if (after && after.lines[0]) {
    const a = after.lines[0];
    punish = a.pv;
    mateAfter = a.mate !== null ? -a.mate : null;
  }
  if (idx >= 0) {
    const l = before.lines[idx];
    cpAfter = lineCp(l);
    if (l.mate !== null) mateAfter = l.mate;
    if (!punish.length) punish = l.pv.slice(1);
  } else if (after && after.lines[0]) {
    cpAfter = -lineCp(after.lines[0]);
  } else {
    cpAfter = cpBest;
  }
  const wpBest = winPct(cpBest);
  let wpAfter = winPct(cpAfter);
  if (idx === 0) wpAfter = wpBest;
  const second = before.lines[1] ? winPct(lineCp(before.lines[1])) : null;
  return {
    wpBest, wpAfter, loss: Math.max(0, wpBest - wpAfter), cpBest, cpAfter,
    mateBefore: top.mate, mateAfter, punish, moveLine: [move, ...punish],
    bestMove: top.pv[0], bestLine: top.pv, secondWp: second, inTopLines: idx,
  };
}

export interface ClassifyInput {
  fenBefore: string;
  move: string; // uci
  ev: Evaluated;
  /** win% the opponent lost with their previous move (for Miss); null if unknown */
  opponentPrevLoss: number | null;
  isBook: boolean;
  ply: number;
  /** square the opponent captured on with their last move (to exclude plain recaptures from Great) */
  prevCaptureSquare?: string | null;
  /** mate score (mover POV) of the 2nd-best line, if any */
  secondMate?: number | null;
}

export interface ClassifyResult {
  verdict: Verdict;
  reasons: string[]; // machine-readable notes on which rule fired
  sacrifice: number; // net material given up along the move's line (pawns), 0 if none
}

/**
 * Exact rules (in order):
 *  1. Book: position after the move is in the opening book, ply <= bookMaxPly, loss <= bookMaxLoss.
 *  2. Brilliant: loss <= 2; you were not already completely winning (material up <= 4 and the best
 *     ALTERNATIVE gives <= 90, unless the sacrifice mates faster than any alternative), wpAfter >= 50 (sound),
 *     move is not a promotion, and the move's line gives up >= 2 points net: the material
 *     balance after the opponent's reply is down >= 2 AND it is still down >= 2 at the end of the
 *     resolved line (8 plies) — unless the line ends in mate for the mover.
 *  3. Great: loss <= 2, best beats the 2nd-best by >= 15 points, wpAfter >= 35, 2nd-best < 85,
 *     not a plain recapture on the square the opponent just captured on, not simply taking
 *     hanging material (capture winning >= 2 by exchange evaluation), and not a forced
 *     check evasion with <= 3 legal moves.
 *  4. Best: the engine's top move (or identical score).
 *  5. Miss: you had a big chance (best win% >= 65 or a forced mate) created by the opponent's
 *     mistake (their last move lost >= 10) or a free capture/mate was on the board, and your
 *     move lost >= 10 — but your move doesn't itself give away material (>= 2, measured after your
 *     replies so ordinary exchanges don't count) or allow mate (those are Blunders).
 *  6. Blunder: loss > 20, or an equal-or-better position (>= 40) becomes clearly lost (< 20),
 *     or the move allows a forced mate that was not already on the board.
 *  7. Mistake > 10, Inaccuracy > 5, Good > 2, else Excellent.
 */
export function classify(inp: ClassifyInput): ClassifyResult {
  const { ev, move, fenBefore } = inp;
  const reasons: string[] = [];
  const res = tryMove(fenBefore, move);
  const mover: Color = fenBefore.split(' ')[1] as Color;
  if (!res) return { verdict: 'blunder', reasons: ['illegal'], sacrifice: 0 };
  if (res.chess.isCheckmate()) return { verdict: 'best', reasons: ['mates'], sacrifice: 0 };

  const loss = ev.loss;
  const isTop = ev.inTopLines === 0 || move === ev.bestMove || Math.abs(ev.cpAfter - ev.cpBest) < 1;

  // 1. Book
  if (inp.isBook && inp.ply <= COACH.bookMaxPly && loss <= COACH.bookMaxLoss) return { verdict: 'book', reasons: ['book'], sacrifice: 0 };

  // material along the move's own line, for sacrifice detection
  const B = COACH.brilliant;
  const mat = materialAlongLine(fenBefore, ev.moveLine.slice(0, B.resolvePlies), mover);
  const start = mat[0];
  const afterReply = mat[Math.min(2, mat.length - 1)];
  const end = mat[mat.length - 1];
  const lineMates = ev.mateAfter !== null && ev.mateAfter > 0;
  const minAlong = Math.min(...mat.slice(1));
  const sacrifice = Math.max(0, start - (lineMates ? minAlong : Math.max(end, Math.min(afterReply, end))));

  // 2. Brilliant
  // "Not already completely winning": material before the move is not lopsided, and either the best
  // alternative to the sacrifice is <= maxWpBefore, or the sacrifice mates faster than any alternative.
  const secondMate = inp.secondMate ?? null;
  const matUp = start;
  const notAlreadyWinning = matUp <= B.maxMaterialUp && (
    (ev.secondWp ?? ev.wpBest) <= B.maxWpBefore ||
    (lineMates && (secondMate === null || secondMate <= 0 || secondMate > (ev.mateAfter ?? 0))));
  if (
    loss <= B.maxLoss && notAlreadyWinning && ev.wpAfter >= B.minWpAfter && !res.move.promotion &&
    mat.length >= 3 && start - afterReply >= B.minSacrifice && (lineMates || start - end >= B.minSacrifice)
  ) {
    reasons.push(`sacrifice ${start - Math.min(afterReply, end)}`);
    return { verdict: 'brilliant', reasons, sacrifice: start - Math.min(afterReply, end) };
  }

  // 3. Great
  const G = COACH.great;
  if (loss <= COACH.excellentMax && ev.secondWp !== null && ev.inTopLines <= 0) {
    const gap = ev.wpBest - ev.secondWp;
    const c = new Chess(fenBefore);
    const legal = c.moves().length;
    const inCheck = c.inCheck();
    const lastCapSq = inp.prevCaptureSquare ?? null;
    const isRecapture = !!res.move.captured && lastCapSq === res.move.to;
    // grabbing hanging material is obvious, not "Great"
    const freeGrab = !!res.move.captured && seeSwap(fenBefore, res.move.to as Square, mover) >= 2;
    if (gap >= G.gap && ev.wpAfter >= G.minWpAfter && ev.secondWp < G.maxSecondWp && legal > 1 && !isRecapture && !freeGrab && !(inCheck && legal < G.minLegalMovesInCheck)) {
      reasons.push(`only move, gap ${gap.toFixed(1)}`);
      return { verdict: 'great', reasons, sacrifice };
    }
  }

  // 4. Best
  if (isTop) return { verdict: 'best', reasons: ['top'], sacrifice };

  // 5. Miss
  const M = COACH.miss;
  const hadMate = ev.mateBefore !== null && ev.mateBefore > 0;
  const stillMates = ev.mateAfter !== null && ev.mateAfter > 0;
  const bestRes = tryMove(fenBefore, ev.bestMove);
  const freeCapture = !!bestRes?.move.captured && seeSwap(fenBefore, bestRes.move.to as Square, mover) >= 2;
  const opportunity = (hadMate && !stillMates) || (ev.wpBest >= M.minBestWp && ((inp.opponentPrevLoss ?? 0) >= M.minOpponentError || freeCapture));
  const clearlyLost = ev.wpAfter < COACH.lostWp;
  // material the move itself gives away along the opponent's best reply (a Miss doesn't hand over material)
  const punishMat = materialAlongLine(fenBefore, ev.moveLine.slice(0, 7), mover);
  // measured after each of YOUR replies (odd plies >= 3) and at the end, so a normal exchange doesn't count
  const settled = punishMat.filter((_, i) => i >= 3 && i % 2 === 1).concat(punishMat[punishMat.length - 1]);
  const givesAway = punishMat[0] - Math.min(...settled);
  const allowsMateNow = ev.mateAfter !== null && ev.mateAfter < 0;
  if (opportunity && loss >= M.minLoss && givesAway < 2 && !allowsMateNow) {
    reasons.push(hadMate ? 'missed mate' : freeCapture ? 'missed free material' : 'did not punish');
    return { verdict: 'miss', reasons, sacrifice };
  }

  // 6. Blunder
  const allowsMate = ev.mateAfter !== null && ev.mateAfter < 0 && !(ev.mateBefore !== null && ev.mateBefore < 0);
  if (loss > COACH.mistakeMax) reasons.push('loss>20');
  if (ev.wpBest >= COACH.equalWp && clearlyLost) reasons.push('equal->lost');
  if (allowsMate) reasons.push('allows mate');
  if (reasons.length) return { verdict: 'blunder', reasons, sacrifice };

  if (loss > COACH.inaccuracyMax) return { verdict: 'mistake', reasons: ['loss>10'], sacrifice };
  if (loss > COACH.goodMax) return { verdict: 'inaccuracy', reasons: ['loss>5'], sacrifice };
  if (loss > COACH.excellentMax) return { verdict: 'good', reasons: ['loss>2'], sacrifice };
  return { verdict: 'excellent', reasons: ['loss<=2'], sacrifice };
}

