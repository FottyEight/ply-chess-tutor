import { Chess } from 'chess.js';
import type { Engine } from './uci';

export interface Level {
  id: 'beginner' | 'casual' | 'club' | 'challenge' | 'full';
  name: string;
  elo: string;
  skill: number; // Stockfish "Skill Level" 0..20
  depth: number;
  movetime: number;
  /** chance to replace the engine move with a plausible human-style move (captures, checks, development) */
  humanError: number;
  /** chance to pick a random move among the engine's top 4 instead of its first choice */
  secondChoice: number;
}

export const LEVELS: Level[] = [
  { id: 'beginner', name: 'Beginner', elo: '≈600', skill: 0, depth: 1, movetime: 50, humanError: 0.38, secondChoice: 0.4 },
  { id: 'casual', name: 'Casual', elo: '≈900', skill: 2, depth: 3, movetime: 100, humanError: 0.2, secondChoice: 0.3 },
  { id: 'club', name: 'Club', elo: '≈1200', skill: 6, depth: 6, movetime: 200, humanError: 0.08, secondChoice: 0.18 },
  { id: 'challenge', name: 'Challenge', elo: '≈1500', skill: 10, depth: 8, movetime: 350, humanError: 0.03, secondChoice: 0.1 },
];
/** Full strength, used by the endgame trainer. */
export const FULL: Level = { id: 'full', name: 'Full strength', elo: '', skill: 20, depth: 14, movetime: 700, humanError: 0, secondChoice: 0 };

export const levelById = (id: string) => LEVELS.find((l) => l.id === id) ?? (id === 'full' ? FULL : LEVELS[1]);

/** A plausible "human" move: weighted toward captures, checks and development. */
export function humanMove(fen: string, rand = Math.random): string | null {
  const c = new Chess(fen);
  const moves = c.moves({ verbose: true });
  if (!moves.length) return null;
  const home = c.turn() === 'w' ? '1' : '8';
  const weights = moves.map((m) => {
    let w = 1;
    if (m.captured) w += 3;
    if (m.san.includes('+')) w += 2;
    if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === home) w += 2;
    if (m.piece === 'p' && ['d', 'e'].includes(m.from[0])) w += 1;
    if (m.piece === 'k' && !m.san.startsWith('O-O')) w *= 0.3;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < moves.length; i++) { r -= weights[i]; if (r <= 0) return moves[i].lan; }
  return moves[moves.length - 1].lan;
}

export interface PlayedMove { uci: string; source: 'engine' | 'second' | 'human' }

/** Chooses the opponent's move at a given strength. */
export async function pickMove(engine: Engine, fen: string, level: Level, rand = Math.random): Promise<PlayedMove> {
  // Never throw away a forced mate-in-1 at the strongest levels, but do at the weakest (that's human).
  if (rand() < level.humanError) {
    const h = humanMove(fen, rand);
    if (h) return { uci: h, source: 'human' };
  }
  const a = await engine.analyse(fen, { multipv: level.skill < 20 ? 4 : 1, depth: level.depth, movetime: level.movetime, skill: level.skill });
  const lines = a.lines.filter((l) => l.pv.length);
  if (lines.length > 1 && rand() < level.secondChoice) {
    const pick = lines[1 + Math.floor(rand() * (lines.length - 1))];
    return { uci: pick.pv[0], source: 'second' };
  }
  const best = a.bestmove ?? lines[0]?.pv[0];
  if (best) return { uci: best, source: 'engine' };
  const h = humanMove(fen, rand);
  return { uci: h!, source: 'human' };
}
