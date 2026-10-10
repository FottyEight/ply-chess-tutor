import { Chess } from 'chess.js';
import {
  VALUES, NAMES, other, sqToXY, xyToSq, uciToMove, seeSwap, loosePieces, materialAlongLine, kingSquare,
  type Color, type Square, type PieceSymbol, type Move,
} from '../chess/util';

/** A named reason with the squares/pieces involved so the board can highlight them. */
export interface Tag {
  id: TagId;
  squares: Square[];
  /** arrows to draw [from, to] */
  arrows?: [Square, Square][];
  facts: Record<string, string | number | undefined>;
}

export type TagId =
  | 'hangingPiece' | 'attackedByLesser' | 'badTrade' | 'missedFreeCapture' | 'fork' | 'missedFork'
  | 'pin' | 'skewer' | 'discoveredAttack' | 'backRank' | 'mateThreat' | 'forcedMateMissed'
  | 'trappedPiece' | 'exposedKing' | 'unprotectedPawnLost' | 'openingDevelopment' | 'earlyQueen'
  | 'notCastling' | 'enPriseAfterCheck' | 'overlookedThreat' | 'losesMaterial' | 'positional';

export interface DetectContext {
  fenBefore: string;
  move: string; // uci of the move played
  /** opponent's best reply line after the move (UCI), the "punishment" */
  punish: string[];
  /** best line from fenBefore (UCI) */
  bestLine: string[];
  /** mate for the mover available before the move (positive) */
  mateBefore: number | null;
  /** mate after the move from mover POV (negative = mover gets mated) */
  mateAfter: number | null;
  /** previous game moves (verbose), oldest first; used for opening and threat detectors */
  history: Pick<Move, 'from' | 'to' | 'piece' | 'color' | 'san' | 'before' | 'after' | 'captured'>[];
}

const PUNISH_PLIES = 6;

function play(fen: string, line: string[], n = line.length): { chess: Chess; moves: Move[] } {
  const c = new Chess(fen);
  const moves: Move[] = [];
  for (const u of line.slice(0, n)) {
    try { moves.push(c.move(uciToMove(u))); } catch { break; }
  }
  return { chess: c, moves };
}

const val = (t: PieceSymbol) => (t === 'k' ? 100 : VALUES[t]);

/** squares attacked by the piece standing on `sq` (independent of side to move). */
function attacksFrom(c: Chess, sq: Square): Square[] {
  const p = c.get(sq);
  if (!p) return [];
  const out: Square[] = [];
  const [x, y] = sqToXY(sq);
  const add = (dx: number, dy: number, slide: boolean) => {
    let nx = x + dx, ny = y + dy;
    while (true) {
      const s = xyToSq(nx, ny);
      if (!s) break;
      out.push(s);
      if (!slide || c.get(s)) break;
      nx += dx; ny += dy;
    }
  };
  const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const orth = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  switch (p.type) {
    case 'p': { const d = p.color === 'w' ? 1 : -1; for (const dx of [-1, 1]) { const s = xyToSq(x + dx, y + d); if (s) out.push(s); } break; }
    case 'n': for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(dx, dy, false); break;
    case 'b': diag.forEach(([a, b]) => add(a, b, true)); break;
    case 'r': orth.forEach(([a, b]) => add(a, b, true)); break;
    case 'q': [...diag, ...orth].forEach(([a, b]) => add(a, b, true)); break;
    case 'k': [...diag, ...orth].forEach(([a, b]) => add(a, b, false)); break;
  }
  return out;
}

/** Targets of `color`'s pieces that the piece on `sq` attacks and that are "worth" attacking. */
function valuableTargets(c: Chess, sq: Square): { sq: Square; type: PieceSymbol }[] {
  const atk = c.get(sq)!;
  const fen = c.fen();
  return attacksFrom(c, sq)
    .map((s) => ({ s, p: c.get(s) }))
    .filter(({ p }) => p && p.color !== atk.color)
    .filter(({ s, p }) => p!.type === 'k' || val(p!.type) > val(atk.type) || c.attackers(s, p!.color).length === 0 || seeSwap(fen, s, atk.color) > 0)
    .map(({ s, p }) => ({ sq: s, type: p!.type }));
}

interface PinInfo { pinner: Square; pinned: Square; behind: Square; }
/** Pins against `color`: enemy slider -> my piece -> my more valuable piece (or king). */
function pinsAgainst(c: Chess, color: Color): PinInfo[] {
  const out: PinInfo[] = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color === color || !'brq'.includes(p.type)) continue;
    const [x, y] = sqToXY(p.square);
    const dirs: number[][] = [];
    if (p.type !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (p.type !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (const [dx, dy] of dirs) {
      let first: Square | null = null;
      let nx = x + dx, ny = y + dy;
      while (true) {
        const s = xyToSq(nx, ny);
        if (!s) break;
        const q = c.get(s);
        if (q) {
          if (q.color !== color) break;
          if (!first) { if (q.type === 'k') break; first = s; }
          else {
            if (val(q.type) > val(c.get(first)!.type)) out.push({ pinner: p.square, pinned: first, behind: s });
            break;
          }
        }
        nx += dx; ny += dy;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ detectors

type Detector = (ctx: DetectContext, d: Derived) => Tag | null;

interface Derived {
  me: Color;
  opp: Color;
  after: Chess; // position after my move
  myMove: Move;
  punish: Move[]; // opponent best line (first PUNISH_PLIES plies) as moves
  punishPositions: Chess[]; // position after each punish ply
  matLine: number[]; // my material along [my move, ...punish]
  bestMoves: Move[];
  bestMat: number[];
}

function derive(ctx: DetectContext): Derived | null {
  const me = ctx.fenBefore.split(' ')[1] as Color;
  const base = play(ctx.fenBefore, [ctx.move]);
  if (!base.moves.length) return null;
  const after = base.chess;
  const positions: Chess[] = [];
  const punishMoves: Move[] = [];
  const c = new Chess(after.fen());
  for (const u of ctx.punish.slice(0, PUNISH_PLIES)) {
    try { punishMoves.push(c.move(uciToMove(u))); positions.push(new Chess(c.fen())); } catch { break; }
  }
  const best = play(ctx.fenBefore, ctx.bestLine.slice(0, PUNISH_PLIES));
  return {
    me, opp: other(me), after, myMove: base.moves[0], punish: punishMoves, punishPositions: positions,
    matLine: materialAlongLine(ctx.fenBefore, [ctx.move, ...ctx.punish.slice(0, PUNISH_PLIES)], me),
    bestMoves: best.moves, bestMat: materialAlongLine(ctx.fenBefore, ctx.bestLine.slice(0, PUNISH_PLIES), me),
  };
}

const matLost = (d: Derived) => d.matLine[0] - d.matLine[d.matLine.length - 1];

/** The opponent's punishment line captures this square within the first `plies` opponent moves. */
function punishCaptures(d: Derived, sq: Square, oppMovesToCheck = 2) {
  return d.punish.filter((_, i) => i % 2 === 0).slice(0, oppMovesToCheck).find((m) => m.to === sq && m.captured);
}

const hangingPiece: Detector = (_ctx, d) => {
  // a piece that just captured and gets taken back is a bad trade, not a hanging piece
  const loose = loosePieces(d.after, d.me).filter((l) => l.type !== 'p' && !(d.myMove.captured && l.sq === d.myMove.to));
  for (const l of loose) {
    const cap = punishCaptures(d, l.sq, 2);
    if (!cap) continue;
    if (!l.defended) return { id: 'hangingPiece', squares: [l.sq, cap.from], arrows: [[cap.from, l.sq]], facts: { piece: NAMES[l.type], square: l.sq, capturer: NAMES[cap.piece], capSan: cap.san, value: VALUES[l.type] } };
    return { id: 'attackedByLesser', squares: [l.sq, cap.from], arrows: [[cap.from, l.sq]], facts: { piece: NAMES[l.type], square: l.sq, capturer: NAMES[cap.piece], capSan: cap.san, gain: l.gain } };
  }
  return null;
};

const badTrade: Detector = (ctx, d) => {
  const m = d.myMove;
  if (!m.captured) return null;
  const gave = val(m.piece);
  const got = VALUES[m.captured];
  if (gave <= got) return null;
  const recapture = d.punish[0];
  if (!recapture || recapture.to !== m.to || !recapture.captured) return null;
  if (matLost(d) < 1) return null;
  return { id: 'badTrade', squares: [m.to, recapture.from], arrows: [[recapture.from, m.to]], facts: { piece: NAMES[m.piece], captured: NAMES[m.captured], square: m.to, recapSan: recapture.san, net: got - gave } };
};

const missedFreeCapture: Detector = (ctx, d) => {
  const b = d.bestMoves[0];
  if (!b || !b.captured || ctx.move === b.from + b.to + (b.promotion ?? '')) return null;
  const gain = seeSwap(ctx.fenBefore, b.to, d.me);
  if (gain < 1) return null;
  const c = new Chess(ctx.fenBefore);
  const undefended = c.attackers(b.to, d.opp).length === 0;
  return { id: 'missedFreeCapture', squares: [b.from, b.to], arrows: [[b.from, b.to]], facts: { piece: NAMES[b.captured], square: b.to, san: b.san, gain, undefended: undefended ? 1 : 0 } };
};

function forkIn(moves: Move[], positions: Chess[], by: Color, plies: number[]) {
  for (const i of plies) {
    const m = moves[i];
    const pos = positions[i];
    if (!m || !pos || m.color !== by) continue;
    const targets = valuableTargets(pos, m.to).filter((t) => t.type !== 'p');
    if (targets.length >= 2) return { m, targets };
  }
  return null;
}

const fork: Detector = (_ctx, d) => {
  const f = forkIn(d.punish, d.punishPositions, d.opp, [0, 2]);
  if (!f || matLost(d) < 1) return null;
  return {
    id: 'fork', squares: [f.m.to, ...f.targets.map((t) => t.sq)], arrows: f.targets.map((t) => [f.m.to, t.sq] as [Square, Square]),
    facts: { forker: NAMES[f.m.piece], square: f.m.to, san: f.m.san, targets: f.targets.map((t) => NAMES[t.type]).join(' and '), lost: matLost(d) },
  };
};

const missedFork: Detector = (ctx, d) => {
  const positions = (() => { const c = new Chess(ctx.fenBefore); return d.bestMoves.map((m) => { c.move(m.san); return new Chess(c.fen()); }); })();
  const f = forkIn(d.bestMoves, positions, d.me, [0, 2]);
  if (!f) return null;
  const gain = d.bestMat[d.bestMat.length - 1] - d.bestMat[0];
  if (gain < 2) return null;
  return {
    id: 'missedFork', squares: [f.m.to, ...f.targets.map((t) => t.sq)], arrows: f.targets.map((t) => [f.m.to, t.sq] as [Square, Square]),
    facts: { forker: NAMES[f.m.piece], square: f.m.to, san: f.m.san, targets: f.targets.map((t) => NAMES[t.type]).join(' and '), gain },
  };
};

const pin: Detector = (ctx, d) => {
  if (matLost(d) < 1) return null;
  const beforeKeys = new Set(pinsAgainst(new Chess(ctx.fenBefore), d.me).map((p) => p.pinned + p.behind));
  for (let i = 0; i < Math.min(3, d.punishPositions.length); i += 2) {
    const pins = pinsAgainst(i === 0 ? d.after : d.punishPositions[i - 1], d.me).concat(pinsAgainst(d.punishPositions[i], d.me));
    for (const p of pins) {
      if (beforeKeys.has(p.pinned + p.behind)) {
        // pre-existing pin: only report if it is now exploited (pinned piece captured in the line)
        if (!d.punish.some((m, j) => j % 2 === 0 && m.to === p.pinned && m.captured)) continue;
      }
      const pos = d.punishPositions[i];
      const pinnedType = (i === 0 ? d.after : d.punishPositions[i - 1]).get(p.pinned)?.type ?? pos.get(p.pinned)?.type;
      if (!pinnedType) continue;
      const count = (c: Chess) => c.findPiece({ type: pinnedType, color: d.me }).length;
      const end = d.punishPositions[d.punishPositions.length - 1];
      if (!(count(end) < count(d.after))) continue; // the pin must actually cost the pinned piece
      const pinned = (i === 0 ? d.after : d.punishPositions[i - 1]).get(p.pinned) ?? pos.get(p.pinned);
      const behind = pos.get(p.behind) ?? d.after.get(p.behind);
      const pinner = pos.get(p.pinner) ?? d.after.get(p.pinner);
      if (!pinned || !behind || !pinner) continue;
      return {
        id: 'pin', squares: [p.pinner, p.pinned, p.behind], arrows: [[p.pinner, p.behind]],
        facts: { pinner: NAMES[pinner.type], pinned: NAMES[pinned.type], pinnedSq: p.pinned, behind: NAMES[behind.type], behindSq: p.behind, toKing: behind.type === 'k' ? 1 : 0 },
      };
    }
  }
  return null;
};

const skewer: Detector = (_ctx, d) => {
  for (const i of [0, 2]) {
    const m = d.punish[i];
    const pos = d.punishPositions[i];
    if (!m || !pos || !'brq'.includes(m.piece)) continue;
    const [x, y] = sqToXY(m.to);
    const [, ] = [x, y];
    // walk each ray from the slider: first my valuable piece, then a lesser piece of mine
    const dirs = m.piece === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : m.piece === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      let nx = x + dx, ny = y + dy; let front: Square | null = null;
      while (true) {
        const s = xyToSq(nx, ny); if (!s) break;
        const q = pos.get(s);
        if (q) {
          if (q.color !== d.me) break;
          if (!front) { front = s; }
          else {
            const fp = pos.get(front)!;
            if (val(fp.type) > val(q.type) && (fp.type === 'k' || fp.type === 'q' || val(fp.type) > val(m.piece))) {
              const later = d.punish.slice(i + 1).find((mm, j) => (i + 1 + j) % 2 === 0 && mm.to === s && mm.captured);
              if (later) return { id: 'skewer', squares: [m.to, front, s], arrows: [[m.to, s]], facts: { attacker: NAMES[m.piece], san: m.san, front: NAMES[fp.type], back: NAMES[q.type], backSq: s } };
            }
            break;
          }
        }
        nx += dx; ny += dy;
      }
    }
  }
  return null;
};

const discoveredAttack: Detector = (_ctx, d) => {
  for (const i of [0, 2]) {
    const m = d.punish[i];
    const pos = d.punishPositions[i];
    const prev = i === 0 ? d.after : d.punishPositions[i - 1];
    if (!m || !pos) continue;
    for (const row of pos.board()) for (const p of row) {
      if (!p || p.color !== d.me) continue;
      if (p.type !== 'k' && val(p.type) < 3) continue;
      const nowAtk = pos.attackers(p.square, d.opp).filter((s) => s !== m.to);
      const wasAtk = new Set(prev.attackers(p.square, d.opp));
      const fresh = nowAtk.find((s) => !wasAtk.has(s) && 'brq'.includes(pos.get(s)!.type));
      if (fresh) {
        if (p.type !== 'k' && matLost(d) < 1) continue;
        return { id: 'discoveredAttack', squares: [m.from, fresh, p.square], arrows: [[fresh, p.square]], facts: { moved: NAMES[m.piece], san: m.san, attacker: NAMES[pos.get(fresh)!.type], target: NAMES[p.type], targetSq: p.square, check: p.type === 'k' ? 1 : 0 } };
      }
    }
  }
  return null;
};

function isBackRankMate(pos: Chess, mated: Color, lastMove?: Move) {
  if (!pos.isCheckmate() || pos.turn() !== mated) return false;
  const k = kingSquare(pos, mated);
  const backRank = mated === 'w' ? '1' : '8';
  return k[1] === backRank && !!lastMove && (lastMove.piece === 'r' || lastMove.piece === 'q') && lastMove.to[1] === backRank;
}

const backRank: Detector = (ctx, d) => {
  const last = d.punishPositions.length - 1;
  if (last >= 0 && isBackRankMate(d.punishPositions[last], d.me, d.punish[last])) {
    const k = kingSquare(d.punishPositions[last], d.me);
    return { id: 'backRank', squares: [k, d.punish[last].to], arrows: [[d.punish[last].from, d.punish[last].to]], facts: { against: 1, san: d.punish[last].san, mateIn: Math.ceil(d.punish.length / 2) } };
  }
  // missed back-rank mate for me
  const bl = d.bestMoves.length - 1;
  if (bl >= 0 && ctx.mateBefore && ctx.mateBefore > 0) {
    const c = new Chess(ctx.fenBefore);
    d.bestMoves.forEach((m) => c.move(m.san));
    if (isBackRankMate(c, d.opp, d.bestMoves[bl])) return { id: 'backRank', squares: [kingSquare(c, d.opp), d.bestMoves[bl].to], facts: { against: 0, san: d.bestMoves[bl].san, mateIn: ctx.mateBefore } };
  }
  return null;
};

const mateThreat: Detector = (ctx, d) => {
  if (ctx.mateAfter === null || ctx.mateAfter >= 0) return null;
  const lastIdx = d.punish.length - 1;
  const mating = d.punish[lastIdx];
  return { id: 'mateThreat', squares: mating ? [mating.to, kingSquare(d.after, d.me)] : [kingSquare(d.after, d.me)], arrows: mating ? [[mating.from, mating.to]] : [], facts: { mateIn: -ctx.mateAfter, firstSan: d.punish[0]?.san ?? '' } };
};

const forcedMateMissed: Detector = (ctx, d) => {
  if (!ctx.mateBefore || ctx.mateBefore <= 0) return null;
  if (ctx.mateAfter !== null && ctx.mateAfter > 0) return null; // still mating
  const b = d.bestMoves[0];
  return b ? { id: 'forcedMateMissed', squares: [b.from, b.to], arrows: [[b.from, b.to]], facts: { mateIn: ctx.mateBefore, san: b.san } } : null;
};

const trappedPiece: Detector = (_ctx, d) => {
  // After the opponent's first reply: one of my pieces has no safe square and is won later in the line.
  const pos = d.punishPositions[0];
  if (!pos || pos.turn() !== d.me || pos.inCheck() || matLost(d) < 1) return null;
  const end = d.punishPositions[d.punishPositions.length - 1];
  for (const row of pos.board()) for (const p of row) {
    if (!p || p.color !== d.me || !'nbrq'.includes(p.type)) continue;
    const count = (c: Chess) => c.findPiece({ type: p.type, color: d.me }).length;
    if (!(count(end) < count(pos))) continue; // the piece is eventually lost
    const escapes = pos.moves({ square: p.square, verbose: true });
    const safe = escapes.some((m) => {
      const t = new Chess(pos.fen());
      t.move(m.san);
      const lost = t.attackers(m.to, d.opp).length ? seeSwap(t.fen(), m.to, d.opp) : 0;
      return lost - (m.captured ? VALUES[m.captured] : 0) < 2;
    });
    if (!safe) return { id: 'trappedPiece', squares: [p.square], facts: { piece: NAMES[p.type], square: p.square, escapes: escapes.length } };
  }
  return null;
};

const exposedKing: Detector = (ctx, d) => {
  const m = d.myMove;
  const k = kingSquare(d.after, d.me);
  const home = d.me === 'w' ? '1' : '8';
  const shelterFiles = 'abcfgh';
  const kingside = 'fgh'.includes(k[0]) && k[1] === home;
  const queenside = 'abc'.includes(k[0]) && k[1] === home;
  const shelterMove = m.piece === 'p' && shelterFiles.includes(m.from[0]) && ((kingside && 'fgh'.includes(m.from[0])) || (queenside && 'abc'.includes(m.from[0])));
  const kingWalk = m.piece === 'k' && !m.san.startsWith('O-O') && Math.abs(Number(m.to[1]) - Number(home)) >= 1;
  const checks = d.punish.filter((mm, i) => i % 2 === 0 && mm.san.includes('+')).length;
  if ((shelterMove || kingWalk) && checks >= 1 && (matLost(d) >= 1 || (ctx.mateAfter ?? 0) < 0 || checks >= 2)) {
    return { id: 'exposedKing', squares: [k, m.from], facts: { san: m.san, checks, pawnMove: shelterMove ? 1 : 0 } };
  }
  return null;
};

const unprotectedPawnLost: Detector = (_ctx, d) => {
  for (let i = 0; i < Math.min(d.punish.length, 4); i += 2) {
    const m = d.punish[i];
    if (m.captured !== 'p') continue;
    const prev = i === 0 ? d.after : d.punishPositions[i - 1];
    if (prev.attackers(m.to, d.me).length === 0 && matLost(d) >= 1) return { id: 'unprotectedPawnLost', squares: [m.to, m.from], arrows: [[m.from, m.to]], facts: { square: m.to, san: m.san } };
  }
  return null;
};

const openingDevelopment: Detector = (ctx, d) => {
  const fullmove = Number(ctx.fenBefore.split(' ')[5]);
  if (fullmove > 12) return null;
  const myHist = ctx.history.filter((h) => h.color === d.me);
  const m = d.myMove;
  const home = d.me === 'w' ? '1' : '8';
  const undeveloped = ['b', 'g', 'c', 'f'].map((f) => (f + home) as Square).filter((s) => { const p = d.after.get(s); return p && p.color === d.me && (p.type === 'n' || p.type === 'b'); });
  if (m.piece === 'q' && fullmove <= 8 && undeveloped.length >= 2 && !m.captured) return { id: 'earlyQueen', squares: [m.to, ...undeveloped], facts: { san: m.san, undeveloped: undeveloped.length } };
  const movedBefore = myHist.some((h) => h.to === m.from);
  if (movedBefore && m.piece !== 'p' && m.piece !== 'k' && !m.captured && undeveloped.length >= 2) {
    const wasAttacked = new Chess(ctx.fenBefore).attackers(m.from, d.opp).length > 0;
    if (!wasAttacked) return { id: 'openingDevelopment', squares: [m.from, m.to, ...undeveloped], facts: { san: m.san, piece: NAMES[m.piece], undeveloped: undeveloped.length, reason: 'twice' } };
  }
  if (m.piece === 'p' && 'ah'.includes(m.from[0]) && fullmove <= 8 && undeveloped.length >= 3) return { id: 'openingDevelopment', squares: [m.to, ...undeveloped], facts: { san: m.san, piece: 'pawn', undeveloped: undeveloped.length, reason: 'edgePawn' } };
  return null;
};

const notCastling: Detector = (ctx, d) => {
  const before = new Chess(ctx.fenBefore);
  const rights = before.getCastlingRights(d.me);
  if (!rights.k && !rights.q) return null;
  const m = d.myMove;
  const best = d.bestMoves[0];
  const lostRights = (m.piece === 'k' && !m.san.startsWith('O-O')) || (m.piece === 'r' && ['a1', 'h1', 'a8', 'h8'].includes(m.from));
  const fullmove = Number(ctx.fenBefore.split(' ')[5]);
  if (lostRights) return { id: 'notCastling', squares: [kingSquare(before, d.me)], facts: { san: m.san, reason: 'lostRights' } };
  if (best && best.san.startsWith('O-O') && fullmove >= 6) return { id: 'notCastling', squares: [kingSquare(before, d.me)], facts: { san: m.san, best: best.san, reason: 'bestWasCastle' } };
  return null;
};

const enPriseAfterCheck: Detector = (ctx, d) => {
  const last = ctx.history[ctx.history.length - 1];
  if (!last || !last.san.includes('+')) return null;
  const h = hangingPiece(ctx, d);
  if (!h) return null;
  return { ...h, id: 'enPriseAfterCheck', facts: { ...h.facts, checkSan: last.san } };
};

const overlookedThreat: Detector = (ctx, d) => {
  const last = ctx.history[ctx.history.length - 1];
  if (!last || last.color !== d.opp) return null;
  const beforeTheirs = new Chess(last.before);
  const nowBefore = new Chess(ctx.fenBefore);
  // pieces of mine that became losable because of their last move
  const threatened = loosePieces(nowBefore, d.me).filter((l) => {
    const p = beforeTheirs.get(l.sq);
    const wasLoose = p && p.color === d.me && p.type === l.type ? seeSwap(beforeTheirs.fen(), l.sq, d.opp) > 0 : false;
    return !wasLoose;
  });
  // ...also mate threats created by their move are covered by mateThreat
  for (const t of threatened) {
    const stillThere = d.after.get(t.sq);
    const cap = punishCaptures(d, t.sq, 1);
    if (stillThere && stillThere.color === d.me && cap) {
      return { id: 'overlookedThreat', squares: [last.to, t.sq], arrows: [[last.to, t.sq]], facts: { theirSan: last.san, piece: NAMES[t.type], square: t.sq, capSan: cap.san } };
    }
  }
  return null;
};

const losesMaterial: Detector = (_ctx, d) => {
  const lost = matLost(d);
  if (lost < 1) return null;
  const firstCap = d.punish.find((m, i) => i % 2 === 0 && m.captured);
  return { id: 'losesMaterial', squares: firstCap ? [firstCap.to] : [], facts: { lost, capSan: firstCap?.san ?? '' } };
};

/** Order = priority when writing the explanation. */
export const DETECTORS: [TagId, Detector][] = [
  ['forcedMateMissed', forcedMateMissed],
  ['mateThreat', mateThreat],
  ['backRank', backRank],
  ['overlookedThreat', overlookedThreat],
  ['enPriseAfterCheck', enPriseAfterCheck],
  ['hangingPiece', hangingPiece],
  ['fork', fork],
  ['skewer', skewer],
  ['pin', pin],
  ['discoveredAttack', discoveredAttack],
  ['trappedPiece', trappedPiece],
  ['badTrade', badTrade],
  ['missedFreeCapture', missedFreeCapture],
  ['missedFork', missedFork],
  ['unprotectedPawnLost', unprotectedPawnLost],
  ['exposedKing', exposedKing],
  ['notCastling', notCastling],
  ['openingDevelopment', openingDevelopment],
  ['losesMaterial', losesMaterial],
];

export function runDetectors(ctx: DetectContext): Tag[] {
  const d = derive(ctx);
  if (!d) return [];
  const tags: Tag[] = [];
  const seen = new Set<string>();
  for (const [, det] of DETECTORS) {
    let t: Tag | null = null;
    try { t = det(ctx, d); } catch { t = null; }
    if (t && !seen.has(t.id)) { tags.push(t); seen.add(t.id); }
  }
  // de-duplicate: enPriseAfterCheck supersedes hangingPiece; specific material reasons supersede losesMaterial
  const ids = new Set(tags.map((t) => t.id));
  return tags.filter((t) => {
    if (t.id === 'hangingPiece' && ids.has('enPriseAfterCheck')) return false;
    if (t.id === 'hangingPiece' && ids.has('overlookedThreat')) return false;
    if (t.id === 'losesMaterial' && tags.length > 1) return false;
    return true;
  });
}

export { derive as _derive, pinsAgainst as _pinsAgainst, valuableTargets as _valuableTargets };
