import { Chess, type Move, type Square } from 'chess.js';
import { uciToMove } from '../chess/util';

export interface Result { outcome: '1-0' | '0-1' | '1/2-1/2'; reason: string }

/** Thin wrapper over chess.js with UCI moves, safe play/undo and explicit draw reasons. */
export class Game {
  chess: Chess;
  readonly startFen: string;
  private fens: string[] = [];

  constructor(fen?: string) {
    this.chess = new Chess(fen);
    this.startFen = this.chess.fen();
    this.fens = [this.startFen];
  }

  fen() { return this.chess.fen(); }
  turn() { return this.chess.turn(); }
  history() { return this.chess.history({ verbose: true }); }
  /** FEN after each ply; index 0 = start. */
  positions() { return [...this.fens]; }

  needsPromotion(from: Square, to: Square) {
    const p = this.chess.get(from);
    if (!p || p.type !== 'p') return false;
    return (p.color === 'w' && to[1] === '8') || (p.color === 'b' && to[1] === '1');
  }

  isLegal(uci: string) {
    const { from, to, promotion } = uciToMove(uci);
    return this.chess.moves({ square: from, verbose: true }).some((m) => m.to === to && (!m.promotion || m.promotion === (promotion ?? 'q')));
  }

  play(uci: string): Move | null {
    try {
      const m = this.chess.move(uciToMove(uci));
      this.fens.push(this.chess.fen());
      return m;
    } catch {
      return null;
    }
  }

  undo(n = 1) {
    for (let i = 0; i < n; i++) {
      if (!this.chess.undo()) break;
      this.fens.pop();
    }
  }

  result(): Result | null {
    const c = this.chess;
    if (c.isCheckmate()) return { outcome: c.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
    if (c.isStalemate()) return { outcome: '1/2-1/2', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { outcome: '1/2-1/2', reason: 'insufficient material' };
    if (c.isThreefoldRepetition()) return { outcome: '1/2-1/2', reason: 'threefold repetition' };
    if (c.isDrawByFiftyMoves()) return { outcome: '1/2-1/2', reason: '50-move rule' };
    return null;
  }

  pgn(headers: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(headers)) this.chess.setHeader(k, v);
    return this.chess.pgn();
  }
}
