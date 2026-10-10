/**
 * All classification thresholds live here so they are easy to tune.
 * Units are "win-percentage points" (0–100) from the mover's point of view.
 */
export const COACH = {
  /** Loss bands. A move losing exactly 0 that is the engine's first choice is "Best". */
  excellentMax: 2,
  goodMax: 5,
  inaccuracyMax: 10,
  mistakeMax: 20,
  /** A position with win% below this is "clearly lost". */
  lostWp: 20,
  /** Positions at/above this are "equal or better" for the blunder rule. */
  equalWp: 40,

  great: {
    /** best line must beat the 2nd-best by at least this many points */
    gap: 15,
    /** the move must leave you with at least this win% (it "keeps the game") */
    minWpAfter: 35,
    /** if the 2nd-best move is already this good, nothing special was found */
    maxSecondWp: 85,
    /** ignore forced situations: in check with this many legal moves or fewer */
    minLegalMovesInCheck: 4,
  },

  brilliant: {
    maxLoss: 2,
    /** not already completely winning before the move */
    maxWpBefore: 90,
    /** ...and not already this many points of material ahead */
    maxMaterialUp: 4,
    /** sound: after the sacrifice you are at least about equal */
    minWpAfter: 50,
    /** net material deficit (pawns) that counts as a sacrifice */
    minSacrifice: 2,
    /** plies of the principal variation used to resolve exchanges */
    resolvePlies: 8,
  },

  miss: {
    /** your best move would have given at least this win% */
    minBestWp: 65,
    /** and your move lost at least this much of it */
    minLoss: 10,
    /** the opponent's previous move must have lost at least this much (i.e. it was a mistake) */
    minOpponentError: 10,
  },

  /** Book moves losing more than this are classified normally. */
  bookMaxLoss: 5,
  /** Book label is only given in the first N plies. */
  bookMaxPly: 30,

  /** Analysis budgets */
  analysis: {
    depthDesktop: 16,
    depthPhone: 14,
    movetimeDesktop: 800,
    movetimePhone: 1500,
    multipv: 3,
    warnDepth: 11,
  },
} as const;

export type Verdict =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book'
  | 'inaccuracy' | 'mistake' | 'blunder' | 'miss';

export const VERDICT_META: Record<Verdict, { label: string; symbol: string; tone: string; rank: number }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', tone: 'brilliant', rank: 0 },
  great: { label: 'Great', symbol: '!', tone: 'great', rank: 1 },
  best: { label: 'Best', symbol: '★', tone: 'best', rank: 2 },
  excellent: { label: 'Excellent', symbol: '✓', tone: 'excellent', rank: 3 },
  good: { label: 'Good', symbol: '✓', tone: 'good', rank: 4 },
  book: { label: 'Book', symbol: '≡', tone: 'book', rank: 5 },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', tone: 'inaccuracy', rank: 6 },
  mistake: { label: 'Mistake', symbol: '?', tone: 'mistake', rank: 7 },
  miss: { label: 'Miss', symbol: '✕', tone: 'miss', rank: 8 },
  blunder: { label: 'Blunder', symbol: '??', tone: 'blunder', rank: 9 },
};

export const GOOD_OR_BETTER: Verdict[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book'];
