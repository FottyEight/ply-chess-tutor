import { Chess, type Square, type PieceSymbol, type Color, type Move } from 'chess.js';

export type { Square, PieceSymbol, Color, Move };

export const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const FILES = 'abcdefgh';

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export function sqToXY(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, Number(sq[1]) - 1];
}
export function xyToSq(x: number, y: number): Square | null {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return (FILES[x] + (y + 1)) as Square;
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: (uci[4] as PieceSymbol | undefined) };
}
export const moveToUci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? '');

/** Plays a UCI move on a copy; returns null if illegal. */
export function tryMove(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const c = new Chess(fen);
  try {
    const move = c.move(uciToMove(uci));
    return { chess: c, move };
  } catch {
    return null;
  }
}

export function uciLineToSan(fen: string, line: string[], max = 99): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of line.slice(0, max)) {
    try { out.push(c.move(uciToMove(u)).san); } catch { break; }
  }
  return out;
}

/** Material from White's point of view (P=1, N=B=3, R=5, Q=9). */
export function materialBalance(c: Chess): number {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p) s += (p.color === 'w' ? 1 : -1) * VALUES[p.type];
  return s;
}
export function materialFor(c: Chess, color: Color) {
  const b = materialBalance(c);
  return color === 'w' ? b : -b;
}

/** Material balance (for `color`) after each ply of a line, index 0 = start position. */
export function materialAlongLine(fen: string, line: string[], color: Color): number[] {
  const c = new Chess(fen);
  const out = [materialFor(c, color)];
  for (const u of line) {
    try { c.move(uciToMove(u)); } catch { break; }
    out.push(materialFor(c, color));
  }
  return out;
}

export function positionKey(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

/** Formats a SAN line with move numbers, e.g. "12...Bxf3 13.gxf3". */
export function numberedLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let moveNo = Number(parts[5] || 1);
  let white = parts[1] === 'w';
  const out: string[] = [];
  sans.forEach((san, i) => {
    if (white) out.push(`${moveNo}.${san}`);
    else out.push(i === 0 ? `${moveNo}...${san}` : san);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

export function pieceAt(c: Chess, sq: Square) {
  return c.get(sq) ?? null;
}

export function describePiece(c: Chess, sq: Square): string {
  const p = c.get(sq);
  return p ? `${NAMES[p.type]} on ${sq}` : sq;
}

export function kingSquare(c: Chess, color: Color): Square {
  return c.findPiece({ type: 'k', color })[0];
}

export function allSquares(): Square[] {
  const out: Square[] = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out.push(xyToSq(x, y)!);
  return out;
}

/** Attackers of `sq` by `by`, independent of side to move (chess.js attackers handles this). */
export function attackersOf(c: Chess, sq: Square, by: Color): Square[] {
  return c.attackers(sq, by);
}

/** Static exchange evaluation (swap-list): material `by` wins by starting a capture sequence on `target`. */
export function seeSwap(fen: string, target: Square, by: Color): number {
  const c = new Chess(fen);
  const victim = c.get(target);
  if (!victim) return 0;
  const swap: number[] = [];
  let side = by;
  let captured = VALUES[victim.type];
  for (;;) {
    const atk = c.attackers(target, side).map((s) => ({ s, p: c.get(s)! }))
      .sort((a, b) => (a.p.type === 'k' ? 100 : VALUES[a.p.type]) - (b.p.type === 'k' ? 100 : VALUES[b.p.type]));
    if (!atk.length) break;
    const a = atk[0];
    if (a.p.type === 'k') {
      // king can capture only if no enemy attacker remains afterwards
      const tmp = new Chess(c.fen());
      tmp.remove(a.s); tmp.remove(target); tmp.put({ type: 'k', color: side }, target);
      if (tmp.attackers(target, other(side)).length) break;
    }
    swap.push(captured);
    captured = a.p.type === 'k' ? 100 : VALUES[a.p.type];
    c.remove(a.s);
    c.remove(target);
    c.put({ type: a.p.type, color: side }, target);
    side = other(side);
  }
  // swap[i] = value captured at step i. Resolve backwards: each side may decline to capture.
  let score = 0;
  for (let i = swap.length - 1; i >= 0; i--) score = Math.max(0, swap[i] - score);
  return score;
}

/** Pieces of `color` that the opponent can win material from (SEE > 0 for opponent). */
export function loosePieces(c: Chess, color: Color): { sq: Square; type: PieceSymbol; gain: number; defended: boolean }[] {
  const fen = c.fen();
  const out: { sq: Square; type: PieceSymbol; gain: number; defended: boolean }[] = [];
  for (const row of c.board()) for (const p of row) {
    if (!p || p.color !== color || p.type === 'k') continue;
    if (!c.attackers(p.square, other(color)).length) continue;
    const gain = seeSwap(fen, p.square, other(color));
    if (gain > 0) out.push({ sq: p.square, type: p.type, gain, defended: c.attackers(p.square, color).length > 0 });
  }
  return out.sort((a, b) => b.gain - a.gain);
}
