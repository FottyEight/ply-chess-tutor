import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './storage';
import type { Verdict } from '../coach/config';

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)}`;
}

export type MistakeType = 'hung piece' | 'missed tactic' | 'opening error' | 'endgame error' | 'time';

export interface SavedMistake { fenBefore: string; move: string; san: string; best: string; bestSan: string; verdict: Verdict; loss: number; tags: string[]; summary: string; happened: string; cost: string; instead: string; ply: number }
export interface SavedGame {
  id: string; date: string; pgn: string; userColor: 'w' | 'b'; level: string; result: string; reason: string;
  accuracy: { w: number; b: number }; counts: Partial<Record<Verdict, number>>;
  opening: { eco: string; name: string; leftAtPly: number | null } | null;
  mistakes: SavedMistake[];
  verdicts: (Verdict | null)[];
  kind: 'game' | 'endgame';
}
export interface MyPuzzle { id: string; fen: string; solution: string[]; summary: string; tag: string; gameId: string; created: number; solved: number; failed: number }
export interface Sm2Card { ef: number; interval: number; reps: number; due: string; lapses: number }
export interface DayLog { puzzles: number; lessons: number; openings: number; games: number; goalMet?: boolean }

export interface ProgressState {
  rating: number;
  ratingGames: number;
  ratingHistory: { t: number; r: number }[];
  seen: string[];
  themeStats: Record<string, { tries: number; fails: number }>;
  solved: number;
  daily: { date: string; id: string; done: boolean } | null;
  rushBest: number;
  days: Record<string, DayLog>;
  games: SavedGame[];
  myPuzzles: MyPuzzle[];
  mistakeTypes: Record<MistakeType, number>;
  lessons: Record<string, { done: boolean; score: number; at: number }>;
  openings: Record<string, Sm2Card>;
  endgames: Record<string, { done: boolean; at: number }>;
  achievements: Record<string, number>;
  placement: { done: boolean; rating: number; focus: string[] } | null;
  checklist: { asked: number; correct: number };
  /** game-challenge progress counters */
  challengeBest: Record<string, number>;

  recordPuzzle: (p: { id: string; rating: number; themes: string[]; score: number; rated: boolean }) => number;
  logDay: (k: keyof Omit<DayLog, 'goalMet'>, n?: number) => void;
  saveGame: (g: SavedGame) => void;
  addMyPuzzle: (p: Omit<MyPuzzle, 'created' | 'solved' | 'failed'>) => void;
  markMyPuzzle: (id: string, ok: boolean) => void;
  addMistakeTypes: (types: MistakeType[]) => void;
  completeLesson: (id: string, score: number) => void;
  reviewOpening: (id: string, quality: number) => void;
  completeEndgame: (id: string) => void;
  unlock: (id: string) => boolean;
  setPlacement: (rating: number, focus: string[]) => void;
  setDaily: (d: ProgressState['daily']) => void;
  setRushBest: (n: number) => void;
  recordChecklist: (ok: boolean) => void;
  bumpChallenge: (id: string, v: number) => void;
}

/** Elo with a larger K while the rating is new. Returns the rating change. */
export function eloDelta(rating: number, puzzleRating: number, score: number, games: number) {
  const K = games < 20 ? 40 : games < 60 ? 28 : 20;
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400));
  return Math.round(K * (score - expected));
}

/** SM-2: quality 0..5. */
export function sm2(card: Sm2Card | undefined, quality: number, now = new Date()): Sm2Card {
  const c = card ?? { ef: 2.5, interval: 0, reps: 0, due: today(now), lapses: 0 };
  let { ef, interval, reps, lapses } = c;
  if (quality < 3) { reps = 0; interval = 1; lapses++; }
  else { reps++; interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ef); }
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const due = new Date(now); due.setDate(due.getDate() + interval);
  return { ef, interval, reps, lapses, due: today(due) };
}

export function streak(days: Record<string, DayLog>): number {
  let n = 0;
  const d = new Date();
  if (!days[today(d)]?.goalMet) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
  while (days[today(d)]?.goalMet) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const DAILY_PUZZLE_GOAL = 10;
const emptyDay = (): DayLog => ({ puzzles: 0, lessons: 0, openings: 0, games: 0 });

export const useProgress = create<ProgressState>()(persist((set, get) => ({
  rating: 1000, ratingGames: 0, ratingHistory: [{ t: Date.now(), r: 1000 }], seen: [], themeStats: {}, solved: 0,
  daily: null, rushBest: 0, days: {}, games: [], myPuzzles: [],
  mistakeTypes: { 'hung piece': 0, 'missed tactic': 0, 'opening error': 0, 'endgame error': 0, time: 0 },
  lessons: {}, openings: {}, endgames: {}, achievements: {}, placement: null, checklist: { asked: 0, correct: 0 }, challengeBest: {},

  recordPuzzle: ({ id, rating, themes, score, rated }) => {
    const s = get();
    const delta = rated ? eloDelta(s.rating, rating, score, s.ratingGames) : 0;
    const themeStats = { ...s.themeStats };
    for (const t of themes) {
      const ts = themeStats[t] ?? { tries: 0, fails: 0 };
      themeStats[t] = { tries: ts.tries + 1, fails: ts.fails + (score < 1 ? 1 : 0) };
    }
    const seen = [...s.seen.filter((x) => x !== id), id].slice(-4000);
    const r = Math.max(400, s.rating + delta);
    set({
      rating: r, ratingGames: s.ratingGames + (rated ? 1 : 0), themeStats, seen, solved: s.solved + (score >= 1 ? 1 : 0),
      ratingHistory: rated ? [...s.ratingHistory, { t: Date.now(), r }].slice(-1000) : s.ratingHistory,
    });
    get().logDay('puzzles');
    return delta;
  },
  logDay: (k, n = 1) => {
    const key = today();
    const days = { ...get().days };
    const d = { ...(days[key] ?? emptyDay()) };
    d[k] += n;
    d.goalMet = d.puzzles >= DAILY_PUZZLE_GOAL;
    days[key] = d;
    set({ days });
  },
  saveGame: (g) => set({ games: [g, ...get().games.filter((x) => x.id !== g.id)].slice(0, 200) }),
  addMyPuzzle: (p) => {
    if (get().myPuzzles.some((x) => x.id === p.id)) return;
    set({ myPuzzles: [{ ...p, created: Date.now(), solved: 0, failed: 0 }, ...get().myPuzzles].slice(0, 500) });
  },
  markMyPuzzle: (id, ok) => set({ myPuzzles: get().myPuzzles.map((p) => (p.id === id ? { ...p, solved: p.solved + (ok ? 1 : 0), failed: p.failed + (ok ? 0 : 1) } : p)) }),
  addMistakeTypes: (types) => {
    const m = { ...get().mistakeTypes };
    for (const t of types) m[t] = (m[t] ?? 0) + 1;
    set({ mistakeTypes: m });
  },
  completeLesson: (id, score) => { set({ lessons: { ...get().lessons, [id]: { done: true, score, at: Date.now() } } }); get().logDay('lessons'); },
  reviewOpening: (id, q) => { set({ openings: { ...get().openings, [id]: sm2(get().openings[id], q) } }); get().logDay('openings'); },
  completeEndgame: (id) => set({ endgames: { ...get().endgames, [id]: { done: true, at: Date.now() } } }),
  unlock: (id) => {
    if (get().achievements[id]) return false;
    set({ achievements: { ...get().achievements, [id]: Date.now() } });
    return true;
  },
  setPlacement: (rating, focus) => set({ placement: { done: true, rating, focus }, rating, ratingHistory: [...get().ratingHistory, { t: Date.now(), r: rating }] }),
  setDaily: (daily) => set({ daily }),
  setRushBest: (n) => set({ rushBest: Math.max(get().rushBest, n) }),
  recordChecklist: (ok) => set({ checklist: { asked: get().checklist.asked + 1, correct: get().checklist.correct + (ok ? 1 : 0) } }),
  bumpChallenge: (id, v) => set({ challengeBest: { ...get().challengeBest, [id]: Math.max(get().challengeBest[id] ?? 0, v) } }),
}), { name: 'ply:progress', storage: createJSONStorage(() => zustandStorage), version: 1 }));

export { DAILY_PUZZLE_GOAL };
