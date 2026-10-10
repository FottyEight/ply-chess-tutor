// Shared test positions for classification and explanation tests.
import { Chess } from 'chess.js';

export interface Hist { fen: string; history: any[] }

/** Plays SAN moves from the start (or a FEN) and returns the resulting FEN and verbose history. */
export function fromMoves(sans: string[], start?: string): Hist {
  const c = new Chess(start);
  for (const s of sans) c.move(s);
  return { fen: c.fen(), history: c.history({ verbose: true }) };
}

/** Builds a one-move history entry (the opponent's last move) from a FEN before it. */
export function lastMove(fenBefore: string, san: string): Hist {
  const c = new Chess(fenBefore);
  const m = c.move(san);
  return { fen: c.fen(), history: [m] };
}

export interface ClsCase {
  name: string;
  fen: string;
  move: string; // uci
  expect: string; // verdict
  history?: any[];
  prevLoss?: number;
  book?: boolean;
  /** use the engine's top move instead of `move` */
  top?: boolean;
  prevCap?: string;
}

export interface TagCase {
  name: string;
  fen: string;
  move: string;
  tag: string;
  history?: any[];
}

const scholar = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
const qg4 = 'rnbqkbnr/ppp2ppp/3p4/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';
const petrov = 'rnbqkb1r/ppp2ppp/3p1n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4';
const forkPos = '4r1k1/pp3ppp/8/4p3/3n4/8/PP1Q1PPP/6K1 w - - 0 1';
const backRank = '3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
const rookHang = '3k4/p4ppp/8/3b4/8/8/PP3PPP/4R1K1 w - - 0 1';
const mateMissed = '6k1/5ppp/8/8/8/8/2b2PPP/R5K1 w - - 0 1';
const freeQueen = 'rnb1kbnr/pppp1ppp/8/4p1q1/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 1 3';
const freeKnight = fromMoves(['d4', 'Nf6', 'Nc3', 'Ne4']).fen;
const smothered = 'rr5k/6pp/7N/q7/8/1Q6/6PP/6K1 w - - 0 1';
const anastasia = 'rr5k/4N1pp/8/4R3/8/3Q4/1q3PPP/6K1 w - - 0 1';
const royalFork = 'r3k3/pp4pp/8/3N4/8/8/PP4PP/4K3 w - - 0 1';
const pinPos = '5b2/5kpp/1p6/8/Q7/8/6PP/6K1 w - - 0 1';
const skewerPos = 'r6k/8/8/8/3K4/8/8/4Q3 w - - 0 1';
const discPos = '6k1/1b3ppp/8/3n4/8/6P1/2K2P1P/R2Q4 w - - 0 1';
const pawnPos = '4k3/5ppp/2b5/8/4P3/3P4/5PPP/4K3 w - - 0 1';
const queenGrab = '4k3/5p2/8/7Q/8/8/8/4K3 w - - 0 1';
const trapped = '2k5/ppp3pp/8/8/8/4B3/6PP/4K3 w - - 0 1';
const fpush = '3qk3/8/8/8/8/8/P4PPP/R5K1 w - - 0 1';

const ruyBefore = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
const ruy = lastMove(ruyBefore, 'a6');
const checkBefore = 'r3k2r/ppp1bppp/5q2/8/8/5NP1/PPP2P1P/R1Q1K2R b KQkq - 0 1';
const check = lastMove(checkBefore, 'Bb4+');
const ng5 = fromMoves(['e4', 'e5', 'Nf3', 'Nc6']);
const petrovHist = fromMoves(['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5', 'd6']);
const qh5 = fromMoves(['e4', 'e5']);
const bong = fromMoves(['e4', 'e5']);
const italian = fromMoves(['e4', 'e5', 'Nf3', 'Nc6']);
const caro = fromMoves(['e4']);
const london = fromMoves(['d4', 'd5']);

// Middlegame positions (not in book) for "top move = Best" checks.
const mid1 = 'r2q1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9';
const mid2 = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 0 7';
const mid3 = '2r2rk1/pp1nbppp/2p1pn2/q2p4/2PP4/1PN1PN2/P2BBPPP/2RQ1RK1 b - - 0 11';
const mid4 = 'r4rk1/1pp1qppp/p1np1n2/4p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 9';

export const CLASSIFY_CASES: ClsCase[] = [
  // Blunders
  { name: 'allows Scholar’s mate (Nf6??)', fen: scholar, move: 'g8f6', expect: 'blunder' },
  { name: 'queen hung to bishop (Qg4??)', fen: qg4, move: 'd1g4', expect: 'blunder' },
  { name: 'knight left hanging (Nc3??)', fen: petrov, move: 'b1c3', expect: 'blunder' },
  { name: 'walks into knight fork (Qc3??)', fen: forkPos, move: 'd2c3', expect: 'blunder' },
  { name: 'abandons back rank (Re7??)', fen: backRank, move: 'e1e7', expect: 'blunder' },
  { name: 'rook to an attacked square (Re4+??)', fen: rookHang, move: 'e1e4', expect: 'blunder' },
  { name: 'queen for a pawn (Qxf7+??)', fen: queenGrab, move: 'h5f7', expect: 'blunder' },
  { name: 'pinned queen (Qd4??)', fen: pinPos, move: 'a4d4', expect: 'blunder' },
  { name: 'walks into skewer (Ke4??)', fen: skewerPos, move: 'd4e4', expect: 'blunder' },
  { name: 'queen into discovered attack (Qf3??)', fen: discPos, move: 'd1f3', expect: 'blunder' },
  // Misses
  { name: 'misses mate in 1 (Kf1 instead of Ra8#)', fen: mateMissed, move: 'g1f1', expect: 'miss' },
  { name: 'ignores a free queen', fen: freeQueen, move: 'a2a3', expect: 'miss', prevLoss: 60 },
  { name: 'ignores a free knight', fen: freeKnight, move: 'e2e3', expect: 'miss', prevLoss: 25 },
  { name: 'misses a royal fork', fen: royalFork, move: 'e1e2', expect: 'miss', prevLoss: 30 },
  // Brilliant
  { name: 'smothered-mate queen sacrifice (Qg8+!!)', fen: smothered, move: 'b3g8', expect: 'brilliant' },
  { name: 'Anastasia’s mate queen sacrifice (Qxh7+!!)', fen: anastasia, move: 'd3h7', expect: 'brilliant' },
  // Great
  { name: 'royal fork is the only winning move (Nc7+!)', fen: royalFork, move: 'd5c7', expect: 'great' },
  { name: 'only move to save the knight in a forced spot', fen: '6k1/5ppp/8/8/8/2p5/1N3PPP/6K1 w - - 0 1', move: 'b2d3', expect: 'great' },
  // Best (engine top move, non-book middlegames)
  { name: 'top move is Best (QGD middlegame)', fen: mid1, move: '', top: true, expect: 'best' },
  { name: 'top move is Best (Giuoco Pianissimo)', fen: mid2, move: '', top: true, expect: 'best' },
  { name: 'top move is Best (QGD, Black)', fen: mid3, move: '', top: true, expect: 'best' },
  { name: 'top move is Best (symmetrical Italian)', fen: mid4, move: '', top: true, expect: 'best' },
  // Book
  { name: 'Italian Game 3.Bc4 is Book', fen: italian.fen, move: 'f1c4', expect: 'book', book: true },
  { name: 'Caro-Kann 1...c6 is Book', fen: caro.fen, move: 'c7c6', expect: 'book', book: true },
  { name: 'London 2.Bf4 is Book', fen: london.fen, move: 'c1f4', expect: 'book', book: true },
  // Calibrated by measured loss (see report): early oddities
  { name: 'bongcloud 2.Ke2 (measured loss 10–20)', fen: bong.fen, move: 'e1e2', expect: 'mistake', history: bong.history },
  { name: 'trapped bishop (Bxa7??)', fen: trapped, move: 'e3a7', expect: 'blunder' },
  { name: 'free knight taken (Nxe4) is Best, not Great', fen: freeKnight, move: 'c3e4', expect: 'best' },
  { name: 'free queen taken (Bxg5) is Best', fen: freeQueen, move: 'c1g5', expect: 'best' },
  { name: 'delivering mate (Ra8#) is Best', fen: mateMissed, move: 'a1a8', expect: 'best' },
  { name: 'pawn drop in a bishop ending (d4??)', fen: pawnPos, move: 'd3d4', expect: 'blunder' },
  { name: 'f-pawn push into queen fork (f4??)', fen: fpush, move: 'f2f4', expect: 'blunder' },
];

/** Near-boundary quiet moves: reported with their measured loss, not pass/fail (engine noise near thresholds). */
export const CALIBRATION_CASES: ClsCase[] = [
  { name: 'edge pawn 2.h4 (measured loss 2–5)', fen: qh5.fen, move: 'h2h4', expect: 'good' },
  { name: 'f3 weakening 2.f3 (measured loss 5–10)', fen: qh5.fen, move: 'f2f3', expect: 'inaccuracy' },
  { name: 'early queen 2.Qh5 (measured loss 2–5)', fen: qh5.fen, move: 'd1h5', expect: 'good', history: qh5.history },
  { name: 'solid alternative 3.Bb5 is Excellent when not treated as book', fen: italian.fen, move: 'f1b5', expect: 'excellent' },
  { name: 'knight goes home 3.Ng1', fen: ng5.fen, move: 'f3g1', expect: 'inaccuracy', history: ng5.history },
];

export const TAG_CASES: TagCase[] = [
  { name: 'hanging knight', fen: petrov, move: 'b1c3', tag: 'hangingPiece' },
  { name: 'missed the threat from ...d6', fen: petrov, move: 'b1c3', tag: 'overlookedThreat', history: petrovHist.history },
  { name: 'defended knight attacked by a pawn', fen: petrov, move: 'd2d4', tag: 'attackedByLesser' },
  { name: 'hanging queen', fen: qg4, move: 'd1g4', tag: 'hangingPiece' },
  { name: 'hanging rook', fen: rookHang, move: 'e1e4', tag: 'hangingPiece' },
  { name: 'knight fork', fen: forkPos, move: 'd2c3', tag: 'fork' },
  { name: 'queen fork after f4', fen: fpush, move: 'f2f4', tag: 'fork' },
  { name: 'back-rank mate allowed', fen: backRank, move: 'e1e7', tag: 'backRank' },
  { name: 'mate threat (Scholar)', fen: scholar, move: 'g8f6', tag: 'mateThreat' },
  { name: 'missed mate in 1', fen: mateMissed, move: 'g1f1', tag: 'forcedMateMissed' },
  { name: 'missed back-rank mate', fen: mateMissed, move: 'g1f1', tag: 'backRank' },
  { name: 'missed free queen', fen: freeQueen, move: 'a2a3', tag: 'missedFreeCapture' },
  { name: 'missed free knight', fen: freeKnight, move: 'e2e3', tag: 'missedFreeCapture' },
  { name: 'missed royal fork', fen: royalFork, move: 'e1e2', tag: 'missedFork' },
  { name: 'pin wins the queen', fen: pinPos, move: 'a4d4', tag: 'pin' },
  { name: 'skewer on the e-file', fen: skewerPos, move: 'd4e4', tag: 'skewer' },
  { name: 'discovered attack on the queen', fen: discPos, move: 'd1f3', tag: 'discoveredAttack' },
  { name: 'unprotected pawn lost', fen: pawnPos, move: 'd3d4', tag: 'unprotectedPawnLost' },
  { name: 'queen for pawn is a bad trade', fen: queenGrab, move: 'h5f7', tag: 'badTrade' },
  { name: 'f-pawn push exposes king', fen: fpush, move: 'f2f4', tag: 'exposedKing' },
  { name: 'king walk loses castling', fen: bong.fen, move: 'e1e2', tag: 'notCastling', history: bong.history },
  { name: 'same knight twice', fen: ng5.fen, move: 'f3g1', tag: 'openingDevelopment', history: ng5.history },
  { name: 'early queen', fen: qh5.fen, move: 'd1h5', tag: 'earlyQueen', history: qh5.history },
  { name: 'ignores the threat from ...a6', fen: ruy.fen, move: 'e1g1', tag: 'overlookedThreat', history: ruy.history },
  { name: 'piece left en prise after a check', fen: check.fen, move: 'e1f1', tag: 'enPriseAfterCheck', history: check.history },
  { name: 'trapped bishop', fen: trapped, move: 'e3a7', tag: 'trappedPiece' },
];
