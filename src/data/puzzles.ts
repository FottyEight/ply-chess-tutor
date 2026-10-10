export interface Puzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }
interface Index { total: number; bands: { min: number; max: number; file: string; count: number }[]; themes: Record<string, number> }

const BASE = import.meta.env.BASE_URL;
let index: Promise<Index> | null = null;
const chunks = new Map<string, Promise<Puzzle[]>>();

export function loadIndex() {
  index ??= fetch(`${BASE}data/puzzles/index.json`).then((r) => r.json());
  return index;
}
function loadChunk(file: string) {
  if (!chunks.has(file)) {
    chunks.set(file, fetch(`${BASE}data/puzzles/${file}`).then((r) => r.json()).then((rows: [string, string, string, number, string][]) =>
      rows.map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(' '), rating, themes: themes.split(' ') }))));
  }
  return chunks.get(file)!;
}

export async function puzzlesNear(rating: number, spread = 100): Promise<Puzzle[]> {
  const idx = await loadIndex();
  const bands = idx.bands.filter((b) => b.max >= rating - spread && b.min <= rating + spread);
  const use = bands.length ? bands : [rating < 600 ? idx.bands[0] : idx.bands[idx.bands.length - 1]];
  const all = (await Promise.all(use.map((b) => loadChunk(b.file)))).flat();
  const near = all.filter((p) => Math.abs(p.rating - rating) <= spread);
  return near.length >= 20 ? near : all;
}

export const THEME_INFO: Record<string, { name: string; explain: string }> = {
  mateIn1: { name: 'Mate in 1', explain: 'One move ends the game. Look at every check first.' },
  mateIn2: { name: 'Mate in 2', explain: 'A forcing first move (usually a check) leaves no defence to the mate that follows.' },
  fork: { name: 'Fork', explain: 'One piece attacks two targets at once, so the opponent can only save one.' },
  pin: { name: 'Pin', explain: 'A piece can’t move because a more valuable piece (or the king) is behind it on the same line.' },
  skewer: { name: 'Skewer', explain: 'A valuable piece is attacked and must move, exposing a piece behind it.' },
  discoveredAttack: { name: 'Discovered attack', explain: 'Moving one piece uncovers an attack from another piece behind it.' },
  backRankMate: { name: 'Back-rank mate', explain: 'The king is trapped on its back rank by its own pawns and is mated by a rook or queen.' },
  hangingPiece: { name: 'Hanging piece', explain: 'A piece is undefended and can simply be taken.' },
  trappedPiece: { name: 'Trapped piece', explain: 'A piece has no safe squares left, so it can be won.' },
  deflection: { name: 'Deflection', explain: 'A defender is forced away from the square or piece it was guarding.' },
  attraction: { name: 'Attraction', explain: 'A piece (often the king) is lured onto a square where it can be attacked.' },
  advancedPawn: { name: 'Advanced pawn', explain: 'A pawn close to promotion creates threats the opponent can’t meet.' },
  endgame: { name: 'Endgame', explain: 'Few pieces are left; king activity and pawns decide the game.' },
  opening: { name: 'Opening', explain: 'A tactic that appears in the first moves of the game.' },
  middlegame: { name: 'Middlegame', explain: 'A tactic from the middle of the game.' },
  mate: { name: 'Checkmate', explain: 'The line ends in checkmate.' },
  sacrifice: { name: 'Sacrifice', explain: 'Material is given up to gain something bigger.' },
  crushing: { name: 'Crushing', explain: 'The tactic wins decisive material.' },
  doubleCheck: { name: 'Double check', explain: 'Two pieces give check at once, so only a king move helps.' },
  promotion: { name: 'Promotion', explain: 'A pawn reaches the last rank and becomes a queen (or other piece).' },
  quietMove: { name: 'Quiet move', explain: 'The key move is not a check or capture, but it sets up an unstoppable threat.' },
  intermezzo: { name: 'In-between move', explain: 'Instead of the expected recapture, an in-between move with a bigger threat comes first.' },
  capturingDefender: { name: 'Remove the defender', explain: 'Capturing the piece that guards something leaves it undefended.' },
  xRayAttack: { name: 'X-ray', explain: 'A piece attacks through another piece along a line.' },
  smotheredMate: { name: 'Smothered mate', explain: 'A knight mates a king that is boxed in by its own pieces.' },
  exposedKing: { name: 'Exposed king', explain: 'The king lacks pawn cover and falls to an attack.' },
  kingsideAttack: { name: 'Kingside attack', explain: 'An attack against a king castled on the kingside.' },
  defensiveMove: { name: 'Defensive move', explain: 'The best move stops the opponent’s threat.' },
};

export const TRAIN_THEMES = ['mateIn1', 'mateIn2', 'fork', 'pin', 'skewer', 'discoveredAttack', 'backRankMate', 'hangingPiece', 'trappedPiece', 'deflection', 'attraction', 'advancedPawn', 'endgame', 'opening', 'middlegame'];

/** The most specific theme for the "this was a …" explanation. */
export function primaryTheme(themes: string[]): string {
  const prio = ['smotheredMate', 'backRankMate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'capturingDefender', 'trappedPiece', 'hangingPiece', 'intermezzo', 'xRayAttack', 'advancedPawn', 'promotion', 'quietMove', 'mateIn1', 'mateIn2', 'mate', 'sacrifice', 'defensiveMove', 'exposedKing', 'kingsideAttack', 'endgame', 'opening', 'middlegame'];
  return prio.find((t) => themes.includes(t)) ?? themes[0] ?? 'middlegame';
}

/** Picks a puzzle near `rating`, avoiding `seen`, weighted toward themes with high failure rates. */
export function choosePuzzle(pool: Puzzle[], seen: Set<string>, themeStats: Record<string, { tries: number; fails: number }>, rand = Math.random, theme?: string): Puzzle | null {
  let cands = pool.filter((p) => !seen.has(p.id) && (!theme || p.themes.includes(theme)));
  if (!cands.length) cands = pool.filter((p) => !theme || p.themes.includes(theme));
  if (!cands.length) return null;
  const w = cands.map((p) => {
    let x = 1;
    for (const t of p.themes) {
      const s = themeStats[t];
      if (s && s.tries >= 3) x += 3 * (s.fails / s.tries);
    }
    return x;
  });
  const total = w.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}

export function hashDay(day: string) {
  let h = 2166136261;
  for (const ch of day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
