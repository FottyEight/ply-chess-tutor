import { Chess } from 'chess.js';
import { _valuableTargets as valuableTargets, type Tag } from './detectors';
import type { Verdict } from './config';
import type { Evaluated } from './classify';
import {
  NAMES, VALUES, other, colorName, uciLineToSan, numberedLine, materialAlongLine, seeSwap, loosePieces,
  uciToMove, type Color, type Square,
} from '../chess/util';

export interface LineRef { fen: string; uci: string[]; san: string[] }

export interface Explanation {
  summary: string;
  happened: string;
  cost: string;
  instead: string;
  /** deeper detail for the "Why?" button */
  deeper: string[];
  costLine: LineRef | null;
  bestLine: LineRef | null;
  highlights: Square[];
  arrows: [Square, Square][];
  tags: Tag[];
  /** optional AI-rewritten text (only when the serverless function is configured) */
  ai?: string;
}

const pct = (x: number) => `${Math.round(x)}%`;

function materialPhrase(n: number): string {
  if (n >= 9) return 'a queen’s worth of material';
  if (n >= 5) return `${n} points of material (about a rook)`;
  if (n >= 3) return `${n} points of material (a piece)`;
  if (n === 2) return 'two pawns’ worth of material';
  return 'a pawn';
}

/**
 * If the side NOT to move could mate in one (were it their turn), returns that move's SAN.
 * With `afterMove`, checks the side to move's opponent... i.e. the threat in the given position
 * where it is already the opponent's turn.
 */
function mateInOneThreat(fen: string, afterMove = false): string | null {
  const parts = fen.split(' ');
  if (!afterMove) { parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-'; }
  let c: Chess;
  try { c = new Chess(parts.join(' ')); } catch { return null; }
  if (!afterMove && c.inCheck()) return null;
  for (const m of c.moves({ verbose: true })) {
    c.move(m.san);
    const mate = c.isCheckmate();
    c.undo();
    if (mate) return m.san;
  }
  return null;
}

/** Short plain-English reason why a move is good. */
export function whyMove(fen: string, uci: string, line: string[], mateFor?: number | null): string {
  const c = new Chess(fen);
  const me = c.turn() as Color;
  let m;
  try { m = c.move(uciToMove(uci)); } catch { return 'it is the engine’s choice'; }
  if (c.isCheckmate()) return 'it is checkmate';
  if (mateFor && mateFor > 0) return `it starts a forced checkmate in ${mateFor}`;
  const reasons: string[] = [];
  const threat = mateInOneThreat(fen);
  if (threat && !mateInOneThreat(c.fen(), true)) reasons.push(`it stops the threat of ${threat} mating you`);
  if (!c.isCheckmate()) {
    const t = valuableTargets(c, m.to).filter((x) => x.type !== 'p');
    if (t.length >= 2) reasons.push(`it forks (attacks at once) the ${t.slice(0, 2).map((x) => NAMES[x.type]).join(' and ')}`);
  }
  if (m.san.startsWith('O-O')) reasons.push('it castles, tucking your king into safety and bringing a rook toward the centre');
  if (m.captured) {
    const gain = seeSwap(fen, m.to, me);
    const undefended = new Chess(fen).attackers(m.to, other(me)).length === 0;
    if (undefended) reasons.push(`it wins the ${NAMES[m.captured]} on ${m.to} for free`);
    else if (gain >= 1) reasons.push(`it wins material by taking the ${NAMES[m.captured]}`);
    else reasons.push(`it takes back the ${NAMES[m.captured]}`);
  }
  // rescues a loose piece
  const beforeLoose = loosePieces(new Chess(fen), me).filter((l) => l.type !== 'p');
  const afterLoose = new Set(loosePieces(c, me).map((l) => l.sq as string));
  const saved = beforeLoose.find((l) => !afterLoose.has(l.sq === m.from ? m.to : l.sq) && !(l.sq === m.from && afterLoose.has(m.to)));
  if (saved && !m.captured) reasons.push(saved.sq === m.from ? `it moves your ${NAMES[saved.type]} out of danger` : `it protects your ${NAMES[saved.type]} on ${saved.sq}`);
  const home = me === 'w' ? '1' : '8';
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === home && !m.captured) reasons.push(`it develops your ${NAMES[m.piece]}`);
  if (m.san.includes('+') && reasons.length < 2) reasons.push('it gives check, so your opponent has to respond to it');
  if (m.piece === 'p' && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(m.to) && reasons.length < 2) reasons.push('it claims space in the centre');
  // material won along the line
  if (!reasons.length) {
    const mat = materialAlongLine(fen, line.slice(0, 6), me);
    const gain = mat[mat.length - 1] - mat[0];
    if (gain >= 1) reasons.push(`it wins ${materialPhrase(gain)} within a few moves`);
  }
  if (!reasons.length) reasons.push('it keeps all your pieces and pawns protected');
  return reasons.slice(0, 2).join(', and ');
}

function happenedFor(tag: Tag, opp: string): { line: string; short: string } {
  const f = tag.facts;
  switch (tag.id) {
    case 'hangingPiece': return { short: `Your ${f.piece} on ${f.square} was left undefended.`, line: `Your ${f.piece} on ${f.square} is left undefended, so ${opp} can simply take it with ${f.capSan}.` };
    case 'attackedByLesser': return { short: `Your ${f.piece} can be won by a cheaper piece.`, line: `Your ${f.piece} on ${f.square} can be captured by a ${f.capturer} (${f.capSan}). Even though it is defended, swapping a ${f.piece} for a cheaper piece loses material.` };
    case 'badTrade': return { short: `That capture loses material.`, line: `You took a ${f.captured} with your ${f.piece}, but ${f.recapSan} takes back, and a ${f.piece} is worth more than a ${f.captured}.` };
    case 'missedFreeCapture': return { short: `${f.san} would have won a ${f.piece}.`, line: `${f.san} would have won a ${f.piece}${f.undefended ? ' that was completely undefended' : ''}.` };
    case 'fork': return { short: `This allows a fork with ${f.san}.`, line: `This allows ${f.san}, a fork (one piece attacking two at once): the ${f.forker} hits your ${f.targets}, and you can only save one.` };
    case 'missedFork': return { short: `You missed a fork with ${f.san}.`, line: `${f.san} was a fork (one piece attacking two at once), hitting the ${f.targets}.` };
    case 'pin': return { short: `Your ${f.pinned} gets pinned.`, line: `Your ${f.pinned} on ${f.pinnedSq} gets pinned: it can’t move without exposing your ${f.behind}${f.toKing ? '' : ' behind it'}, and ${opp} uses that to win material.` };
    case 'skewer': return { short: `This allows a skewer with ${f.san}.`, line: `This allows ${f.san}, a skewer: the ${f.attacker} attacks your ${f.front}, and once it moves away the ${f.back} behind it is lost.` };
    case 'discoveredAttack': return { short: `This allows a discovered ${f.check ? 'check' : 'attack'}.`, line: `This allows ${f.san}: moving the ${f.moved} uncovers an attack from the ${f.attacker} on your ${f.target} (a discovered ${f.check ? 'check' : 'attack'}).` };
    case 'backRank': return f.against
      ? { short: `This allows a back-rank mate.`, line: `Your king is stuck on the back rank behind its own pawns, so ${f.san} ends the game (a back-rank mate).` }
      : { short: `There was a back-rank mate.`, line: `The enemy king was trapped on the back rank behind its own pawns, and you could have mated it.` };
    case 'mateThreat': return { short: `This allows checkmate in ${f.mateIn}.`, line: `This lets ${opp} force checkmate in ${f.mateIn}, starting with ${f.firstSan}.` };
    case 'forcedMateMissed': return { short: `You had checkmate in ${f.mateIn}.`, line: `You had a forced checkmate in ${f.mateIn}, starting with ${f.san}.` };
    case 'trappedPiece': return { short: `Your ${f.piece} gets trapped.`, line: `Your ${f.piece} on ${f.square} gets trapped: it is attacked and every square it could run to is covered.` };
    case 'exposedKing': return f.pawnMove
      ? { short: `That pawn move weakens your king.`, line: `Pushing that pawn opens up the shelter in front of your king, and ${opp} gets to attack it with checks.` }
      : { short: `Your king is exposed.`, line: `Walking your king forward exposes it, and ${opp} gets to attack it with checks.` };
    case 'unprotectedPawnLost': return { short: `Your pawn on ${f.square} is lost.`, line: `Your pawn on ${f.square} has no defender, and ${f.san} picks it off.` };
    case 'openingDevelopment': return f.reason === 'edgePawn'
      ? { short: `Edge-pawn moves don’t help development.`, line: `Moves with the edge pawns do little in the opening. Getting knights and bishops out first is usually better.` }
      : { short: `Moving the same piece twice costs time.`, line: `In the opening, moving the same ${f.piece} twice costs time while ${f.undeveloped} of your knights and bishops are still at home.` };
    case 'earlyQueen': return { short: `The queen came out too early.`, line: `Bringing your queen out this early lets ${opp} gain time by attacking it while developing their own pieces.` };
    case 'notCastling': return f.reason === 'lostRights'
      ? { short: `You gave up the right to castle.`, line: `Moving your king or rook gives up the right to castle, so your king may stay stuck in the centre.` }
      : { short: `Castling was the safer choice.`, line: `Castling was the safest move here: it tucks your king away and brings a rook into play.` };
    case 'enPriseAfterCheck': return { short: `After the check, your ${f.piece} was left hanging.`, line: `After getting out of check (${f.checkSan}), your ${f.piece} on ${f.square} was left undefended, and ${f.capSan} takes it. Always check what is loose after you answer a check.` };
    case 'overlookedThreat': return { short: `You missed what ${f.theirSan} was attacking.`, line: `${opp}’s last move ${f.theirSan} attacked your ${f.piece} on ${f.square}, and this move doesn’t deal with it, so ${f.capSan} wins it.` };
    case 'losesMaterial': return { short: `This loses material.`, line: f.capSan ? `This loses material: starting with ${f.capSan}, you end up ${materialPhrase(Number(f.lost))} down.` : `This loses ${materialPhrase(Number(f.lost))} over the next few moves.` };
    default: return { short: '', line: '' };
  }
}

export interface WriteInput {
  verdict: Verdict;
  fenBefore: string;
  move: string;
  ev: Evaluated;
  tags: Tag[];
  sacrifice?: number;
}

export function writeExplanation(inp: WriteInput): Explanation {
  const { verdict, fenBefore, move, ev, tags } = inp;
  const me = fenBefore.split(' ')[1] as Color;
  const opp = colorName(other(me));
  const c = new Chess(fenBefore);
  let san = move;
  try { san = c.move(uciToMove(move)).san; } catch { /* keep uci */ }
  const fenAfter = c.fen();

  const bestSans = uciLineToSan(fenBefore, ev.bestLine.slice(0, 6));
  const punishSans = uciLineToSan(fenAfter, ev.punish.slice(0, 6));
  const costLine: LineRef | null = punishSans.length ? { fen: fenAfter, uci: ev.punish.slice(0, punishSans.length), san: punishSans } : null;
  const bestLine: LineRef | null = bestSans.length ? { fen: fenBefore, uci: ev.bestLine.slice(0, bestSans.length), san: bestSans } : null;
  const bestSan = bestSans[0] ?? '';
  const highlights = [...new Set(tags.flatMap((t) => t.squares))];
  const arrows = tags.flatMap((t) => t.arrows ?? []).slice(0, 3);
  const chances = `Winning chances: ${pct(ev.wpBest)} with the best move, ${pct(ev.wpAfter)} after ${san}.`;
  const deeper: string[] = [
    `Engine evaluation: ${fmtEval(ev.cpBest)} before, ${fmtEval(ev.cpAfter)} after your move (from your side).`,
    chances,
    ...tags.slice(1).map((t) => happenedFor(t, opp).line).filter(Boolean),
  ];
  const base = { deeper, costLine, bestLine, highlights, arrows, tags };

  // --- good moves
  if (['brilliant', 'great', 'best', 'excellent', 'good', 'book'].includes(verdict)) {
    const why = whyMove(fenBefore, move, ev.moveLine.slice(0, 6), ev.mateAfter);
    let summary = '';
    let happened = '';
    if (verdict === 'brilliant') {
      summary = `A sound sacrifice: ${san} gives up material for a winning follow-up.`;
      happened = `${san} gives up ${materialPhrase(inp.sacrifice || 2)}, but the engine confirms it works: ${opp} can’t take advantage, and you stay ${ev.wpAfter >= 60 ? 'clearly better' : 'fine'}.`;
    } else if (verdict === 'great') {
      summary = `${san} was the only good move here.`;
      happened = `Most other moves would have dropped your winning chances to about ${pct(ev.secondWp ?? 0)}. ${cap(why)}.`;
    } else if (verdict === 'book') {
      summary = `${san} is a known opening move.`;
      happened = `This follows established opening theory: strong players have played it many times.`;
    } else if (verdict === 'best') {
      summary = `${san} is the best move.`;
      happened = `${cap(why)}.`;
    } else {
      summary = verdict === 'excellent' ? `${san} is an excellent move.` : `${san} is a good, solid move.`;
      happened = `${cap(why)}.` + (bestSan && bestSan !== san ? ` ${bestSan} was slightly more precise.` : '');
    }
    return { ...base, summary, happened, cost: chances, instead: bestSan && bestSan !== san && verdict !== 'book' ? `${bestSan} was the engine’s first choice: ${whyMove(fenBefore, ev.bestMove, ev.bestLine, ev.mateBefore)}.` : '' };
  }

  // --- errors
  const primary = tags[0];
  const h = primary ? happenedFor(primary, opp) : null;
  let summary = h?.short || '';
  let happened = h?.line || '';
  if (!primary) {
    summary = verdict === 'miss' ? `You missed a chance to punish ${opp}’s last move.` : `${san} gives ${opp} the easier game.`;
    happened = verdict === 'miss'
      ? `${opp}’s previous move was a mistake, and ${bestSan} would have taken advantage of it.`
      : `This doesn’t lose material straight away, but it hands ${opp} a better position.`;
  }

  // cost
  const mat = materialAlongLine(fenAfter, ev.punish.slice(0, 6), me);
  const matBefore = materialAlongLine(fenBefore, [move], me);
  const lost = matBefore[0] - mat[mat.length - 1];
  const firstDrop = mat.findIndex((m) => m < matBefore[0]);
  let cost = '';
  if (ev.mateAfter !== null && ev.mateAfter < 0) {
    cost = `It leads to checkmate: ${numberedLine(fenAfter, punishSans)}.`;
  } else if (verdict === 'miss') {
    const bestMat = materialAlongLine(fenBefore, ev.bestLine.slice(0, 6), me);
    const gain = bestMat[bestMat.length - 1] - bestMat[0];
    cost = ev.mateBefore && ev.mateBefore > 0
      ? `The winning line was ${numberedLine(fenBefore, bestSans)}.`
      : gain >= 1 ? `After ${numberedLine(fenBefore, bestSans.slice(0, 4))} you would have been ${materialPhrase(gain)} up.` : '';
    cost += ` ${chances}`;
  } else if (lost >= 1 && punishSans.length) {
    const showN = Math.min(punishSans.length, Math.max(2, firstDrop + 1));
    cost = `After ${numberedLine(fenAfter, punishSans.slice(0, showN))} you are ${materialPhrase(lost)} down.`;
    if (firstDrop >= 3) cost += ' Notice the loss only shows up a few moves later — that’s why it’s easy to miss.';
    cost += ` ${chances}`;
  } else {
    cost = (punishSans.length ? `The likely continuation is ${numberedLine(fenAfter, punishSans.slice(0, 4))}. ` : '') + chances;
  }

  const instead = bestSan ? `${bestSan} was better: ${whyMove(fenBefore, ev.bestMove, ev.bestLine, ev.mateBefore)}.` : '';
  return { ...base, summary, happened, cost: cost.trim(), instead };
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
export function fmtEval(cp: number) {
  if (Math.abs(cp) >= 9000) { const n = Math.round((10000 - Math.abs(cp)) / 10); return `${cp > 0 ? '' : '−'}M${n}`; }
  const v = cp / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

export { VALUES };
