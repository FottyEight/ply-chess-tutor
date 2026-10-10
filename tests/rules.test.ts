import { describe, test, expect } from 'vitest';
import { Chess } from 'chess.js';
import { Game } from '../src/game/game';
import { seeSwap, numberedLine } from '../src/chess/util';

describe('chess rules (chess.js 1.4.0 via the Game wrapper)', () => {
  test('castling both sides, and rights lost after king move', () => {
    const g = new Game('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    expect(g.play('e1g1')).toBeTruthy();
    expect(g.chess.get('g1')?.type).toBe('k');
    expect(g.chess.get('f1')?.type).toBe('r');
    expect(g.play('e8c8')).toBeTruthy();
    expect(g.chess.get('d8')?.type).toBe('r');
    const h = new Game('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    h.play('e1f1'); h.play('a7a6'); h.play('f1e1'); h.play('a6a5');
    expect(h.play('e1g1')).toBeNull();
  });
  test('cannot castle through check', () => {
    const g = new Game('4k3/8/8/8/8/8/5r2/4K2R w K - 0 1');
    expect(g.play('e1g1')).toBeNull();
  });
  test('en passant', () => {
    const g = new Game('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    const m = g.play('e5d6');
    expect(m?.isEnPassant()).toBe(true);
    expect(g.chess.get('d5')).toBeUndefined();
  });
  test('promotion (queen and underpromotion)', () => {
    const g = new Game('8/P3k3/8/8/8/8/8/4K3 w - - 0 1');
    expect(g.needsPromotion('a7', 'a8')).toBe(true);
    g.play('a7a8n');
    expect(g.chess.get('a8')).toEqual({ type: 'n', color: 'w' });
  });
  test('check and checkmate', () => {
    const g = new Game();
    for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) g.play(m);
    expect(g.chess.isCheckmate()).toBe(true);
    expect(g.result()).toEqual({ outcome: '0-1', reason: 'checkmate' });
  });
  test('stalemate', () => {
    const g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(g.result()).toEqual({ outcome: '1/2-1/2', reason: 'stalemate' });
  });
  test('insufficient material', () => {
    const g = new Game('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1');
    expect(g.result()?.reason).toBe('insufficient material');
  });
  test('threefold repetition', () => {
    const g = new Game();
    for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) g.play(m);
    expect(g.result()?.reason).toBe('threefold repetition');
  });
  test('50-move rule', () => {
    const g = new Game('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
    g.play('a1a2');
    expect(g.result()?.reason).toBe('50-move rule');
  });
  test('takeback restores position', () => {
    const g = new Game();
    g.play('e2e4'); g.play('e7e5');
    g.undo(2);
    expect(g.fen()).toBe(new Chess().fen());
  });
  test('PGN export round-trips', () => {
    const g = new Game();
    for (const m of ['e2e4', 'e7e5', 'g1f3']) g.play(m);
    const c = new Chess(); c.loadPgn(g.pgn());
    expect(c.history()).toEqual(['e4', 'e5', 'Nf3']);
  });
  test('static exchange evaluation', () => {
    expect(seeSwap('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd5', 'w')).toBe(1);
    expect(seeSwap('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', 'd5', 'w')).toBe(0);
    expect(seeSwap('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1', 'd5', 'w')).toBe(0);
    expect(seeSwap('4k3/8/8/3n4/8/2N5/8/4K3 w - - 0 1', 'd5', 'w')).toBe(3);
  });
  test('numbered lines', () => {
    expect(numberedLine('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 3', ['Bc5', 'Bc4'])).toBe('3...Bc5 4.Bc4');
  });
});
