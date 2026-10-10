import { create } from 'zustand';
import { Chess, type Square, type Color } from 'chess.js';
import { Game, type Result } from '../../game/game';
import { getEngine, isPhoneClass } from '../../engine/browser';
import type { Analysis } from '../../engine/uci';
import { pickMove, levelById } from '../../engine/levels';
import { analyseBefore, finishCoach, quickJudge, defaultBudget, type CoachResult } from '../../coach/coach';
import { COACH, VERDICT_META, GOOD_OR_BETTER, type Verdict } from '../../coach/config';
import { lineCp, winPct, moveAccuracy } from '../../coach/classify';
import { inBook, loadBook, openingSummary } from '../../data/openings';
import { loosePieces, seeSwap, materialFor, other, NAMES, uciToMove } from '../../chess/util';
import { useProgress, type MistakeType, type SavedGame, type SavedMistake } from '../../state/progress';
import { useSettings } from '../../state/settings';
import { useUI } from '../../state/ui';
import { unlock } from '../../state/achievements';
import { feedback } from '../../lib/feedback';
import { rewriteExplanation } from '../../coach/ai';

export interface MoveRec {
  ply: number;
  uci: string;
  san: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  by: 'user' | 'engine';
  coach?: CoachResult;
  verdict?: Verdict;
  loss?: number;
  accuracy?: number;
  /** eval after the move, White's point of view */
  evalWhite?: { cp: number | null; mate: number | null };
  captured?: string;
  to: Square;
  from: Square;
  /** user's clock when the move was made (timed games) */
  clockLeft?: number;
}

export interface TimeControl { base: number; inc: number; label: string }
export const TIME_CONTROLS: (TimeControl | null)[] = [null, { base: 600_000, inc: 0, label: '10+0' }, { base: 900_000, inc: 10_000, label: '15+10' }];

export interface Preview { fen: string; lastMove: [Square, Square] | null; label: string }

interface ChecklistPrompt { truth: Square[]; answered: boolean; ok?: boolean; picked?: Square | 'none'; explain: string }

export interface TutorOptions { color: 'w' | 'b' | 'random'; level: string; tc: TimeControl | null; practice: boolean; startFen?: string; kind?: 'game' | 'endgame'; goal?: 'win' | 'draw'; title?: string; endgameId?: string }

interface TutorState {
  phase: 'setup' | 'playing' | 'over';
  opts: TutorOptions;
  userColor: Color;
  records: MoveRec[];
  viewPly: number | null;
  thinking: 'idle' | 'analysing' | 'opponent';
  liveEval: { cp: number | null; mate: number | null; depth: number } | null;
  pendingWarn: { uci: string; loss: number } | null;
  checklist: ChecklistPrompt | null;
  clocks: { w: number; b: number };
  result: (Result & { onTime?: boolean; resigned?: boolean }) | null;
  preview: Preview | null;
  showBest: boolean;
  gameId: string;
  savedId: string | null;
  fen: string;
  analysisTime: number[];
  /** practice mode pauses after a mistake so you can read the coach or try again */
  paused: boolean;

  resume: () => void;
  start: (o: TutorOptions) => void;
  userMove: (uci: string) => Promise<void>;
  confirmWarn: (proceed: boolean) => void;
  answerChecklist: (sq: Square | 'none') => void;
  takeback: () => void;
  resign: () => void;
  tick: (ms: number) => void;
  setView: (ply: number | null) => void;
  setPreview: (p: Preview | null) => void;
  toggleBest: (v?: boolean) => void;
  toSetup: () => void;
}

let game = new Game();
let gen = 0;
let beforeJob: { fen: string; promise: Promise<Analysis>; result?: Analysis } | null = null;

const budget = () => defaultBudget(isPhoneClass());
const sideToMove = () => game.turn();

function evalWhiteFrom(a: Analysis | null, fen: string) {
  const l = a?.lines[0];
  if (!l) return undefined;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  return { cp: l.cp !== null ? l.cp * sign : null, mate: l.mate !== null ? l.mate * sign : null };
}

function opponentBand(loss: number, isTop: boolean, book: boolean): Verdict {
  if (book && loss <= COACH.bookMaxLoss) return 'book';
  if (isTop) return 'best';
  if (loss > COACH.mistakeMax) return 'blunder';
  if (loss > COACH.inaccuracyMax) return 'mistake';
  if (loss > COACH.goodMax) return 'inaccuracy';
  if (loss > COACH.excellentMax) return 'good';
  return 'excellent';
}

export function mistakeType(r: MoveRec, onTimeTrouble: boolean): MistakeType {
  const tags = r.coach?.tags.map((t) => t.id) ?? [];
  if (onTimeTrouble) return 'time';
  if (tags.some((t) => ['hangingPiece', 'enPriseAfterCheck', 'overlookedThreat', 'unprotectedPawnLost', 'badTrade', 'trappedPiece', 'attackedByLesser'].includes(t))) return 'hung piece';
  if (tags.some((t) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'missedFork', 'missedFreeCapture', 'mateThreat', 'backRank', 'forcedMateMissed'].includes(t))) return 'missed tactic';
  const c = new Chess(r.fenBefore);
  let pieces = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') pieces += p.type === 'q' ? 9 : p.type === 'r' ? 5 : 3;
  if (pieces <= 13) return 'endgame error';
  if (r.ply <= 20) return 'opening error';
  return 'missed tactic';
}

/** Pieces of `me` newly attacked (winnable) because of the opponent's last move, plus mate/check threats. */
export function threatsCreated(fenBeforeTheirMove: string, fenNow: string, me: Color): { squares: Square[]; explain: string } {
  const now = new Chess(fenNow);
  const before = new Chess(fenBeforeTheirMove);
  const out: Square[] = [];
  const notes: string[] = [];
  if (now.inCheck()) { const k = now.findPiece({ type: 'k', color: me })[0]; out.push(k); notes.push('they gave check'); }
  for (const l of loosePieces(now, me)) {
    const p = before.get(l.sq);
    const was = p && p.color === me && p.type === l.type ? seeSwap(before.fen(), l.sq, other(me)) > 0 : false;
    if (!was) { out.push(l.sq); notes.push(`your ${NAMES[l.type]} on ${l.sq} can be won`); }
  }
  // mate-in-one threat: pretend it is their move again
  const parts = fenNow.split(' '); parts[1] = other(me); parts[3] = '-';
  try {
    const t = new Chess(parts.join(' '));
    if (!now.inCheck()) for (const m of t.moves({ verbose: true })) {
      t.move(m.san);
      if (t.isCheckmate()) { const k = now.findPiece({ type: 'k', color: me })[0]; if (!out.includes(k)) out.push(k); notes.push(`they threaten ${m.san} mate`); t.undo(); break; }
      t.undo();
    }
  } catch { /* illegal null-move position */ }
  return { squares: out, explain: notes.length ? `Their last move: ${notes.join('; ')}.` : 'Their last move created no new direct threat.' };
}

export const useTutor = create<TutorState>((set, get) => {
  function syncFen() { set({ fen: game.fen() }); }

  function prepareUserTurn() {
    const g = gen;
    const fen = game.fen();
    const engine = getEngine();
    const promise = analyseBefore(engine, fen, budget(), (a) => {
      if (g !== gen) return;
      const e = evalWhiteFrom(a, fen);
      if (e) set({ liveEval: { ...e, depth: a.depth } });
    });
    beforeJob = { fen, promise };
    promise.then((a) => {
      if (g !== gen || !beforeJob || beforeJob.fen !== fen) return;
      beforeJob.result = a;
      set({ analysisTime: [...get().analysisTime, a.timeMs].slice(-50) });
      // score the opponent's previous move now that we know the value of this position
      const recs = get().records;
      const last = recs[recs.length - 1];
      if (last && last.by === 'engine' && last.loss === undefined) {
        const prevUser = recs[recs.length - 2];
        const oppBefore = prevUser?.coach?.after?.lines[0];
        const userBest = a.lines[0];
        if (oppBefore && userBest) {
          const wpOppBefore = winPct(lineCp(oppBefore));
          const wpOppAfter = 100 - winPct(lineCp(userBest));
          const loss = Math.max(0, wpOppBefore - wpOppAfter);
          const isTop = oppBefore.pv[0] === last.uci;
          const v = opponentBand(loss, isTop, inBook(last.fenAfter) && last.ply <= COACH.bookMaxPly);
          set({ records: recs.map((r) => (r === last ? { ...r, loss, accuracy: moveAccuracy(loss), verdict: v, evalWhite: evalWhiteFrom(a, fen) } : r)) });
        } else {
          set({ records: recs.map((r) => (r === last ? { ...r, evalWhite: evalWhiteFrom(a, fen) } : r)) });
        }
      }
    }).catch(() => {});

    // blunder-check habit: ask what their last move threatened
    const recs = get().records;
    const last = recs[recs.length - 1];
    if (useSettings.getState().checklist && last && last.by === 'engine') {
      const t = threatsCreated(last.fenBefore, fen, get().userColor);
      set({ checklist: { truth: t.squares, answered: false, explain: t.explain } });
    } else set({ checklist: null });
  }

  async function opponentTurn() {
    const g = gen;
    set({ thinking: 'opponent' });
    const lvl = levelById(get().opts.level);
    const t0 = Date.now();
    let mv;
    try { mv = await pickMove(getEngine(), game.fen(), lvl); } catch { return; }
    const wait = Math.max(0, 380 - (Date.now() - t0));
    await new Promise((r) => setTimeout(r, wait));
    if (g !== gen) return;
    const fenBefore = game.fen();
    const m = game.play(mv.uci);
    if (!m) { set({ thinking: 'idle' }); return; }
    const rec: MoveRec = { ply: game.history().length, uci: m.lan, san: m.san, color: m.color, fenBefore, fenAfter: game.fen(), by: 'engine', captured: m.captured, to: m.to, from: m.from };
    addIncrement(m.color);
    set({ records: [...get().records, rec], thinking: 'idle', viewPly: null, preview: null, showBest: false });
    syncFen();
    feedback(m.captured ? 'capture' : m.san.includes('+') ? 'check' : 'move');
    useUI.getState().announce(`${m.color === 'w' ? 'White' : 'Black'} played ${m.san}`);
    if (checkOver()) return;
    prepareUserTurn();
  }

  function addIncrement(c: Color) {
    const tc = get().opts.tc;
    if (!tc || !tc.inc) return;
    const clocks = { ...get().clocks };
    clocks[c] += tc.inc;
    set({ clocks });
  }

  function checkOver(): boolean {
    const r = game.result();
    if (!r) return false;
    finish(r);
    return true;
  }

  function finish(r: TutorState['result']) {
    gen++;
    getEngine().cancelAll();
    set({ phase: 'over', result: r, thinking: 'idle', pendingWarn: null, checklist: null, paused: false });
    saveGame();
  }

  function saveGame() {
    const s = get();
    const recs = s.records;
    const acc = (c: Color) => {
      const a = recs.filter((r) => r.color === c && r.accuracy !== undefined).map((r) => r.accuracy!);
      return a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0;
    };
    const counts: Partial<Record<Verdict, number>> = {};
    for (const r of recs) if (r.by === 'user' && r.verdict) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    const userMistakes = recs.filter((r) => r.by === 'user' && r.coach && ['mistake', 'blunder', 'miss', 'inaccuracy'].includes(r.verdict!));
    const mistakes: SavedMistake[] = userMistakes.map((r) => ({
      fenBefore: r.fenBefore, move: r.uci, san: r.san, best: r.coach!.ev.bestMove, bestSan: r.coach!.explanation.bestLine?.san[0] ?? '',
      verdict: r.verdict!, loss: r.loss ?? 0, tags: r.coach!.tags.map((t) => t.id), summary: r.coach!.explanation.summary,
      happened: r.coach!.explanation.happened, cost: r.coach!.explanation.cost, instead: r.coach!.explanation.instead, ply: r.ply,
    }));
    const res = s.result!;
    const lvl = levelById(s.opts.level);
    const pgn = game.pgn({ Event: s.opts.kind === 'endgame' ? `Endgame: ${s.opts.title}` : 'Ply tutor game', Site: 'Ply', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: s.userColor === 'w' ? 'You' : `Stockfish (${lvl.name})`, Black: s.userColor === 'b' ? 'You' : `Stockfish (${lvl.name})`, Result: res.outcome });
    const saved: SavedGame = {
      id: s.gameId, date: new Date().toISOString(), pgn, userColor: s.userColor, level: s.opts.level, result: res.outcome, reason: res.reason,
      accuracy: { w: acc('w'), b: acc('b') }, counts, opening: openingSummary(game.positions().slice(1)), mistakes,
      verdicts: recs.map((r) => r.verdict ?? null), kind: s.opts.kind ?? 'game',
    };
    const P = useProgress.getState();
    if (recs.filter((r) => r.by === 'user').length >= 2) {
      P.saveGame(saved);
      P.logDay('games');
      const tc = s.opts.tc;
      const lowTime = (r: MoveRec) => !!tc && r.clockLeft !== undefined && r.clockLeft < tc.base * 0.1;
      P.addMistakeTypes(userMistakes.filter((r) => r.verdict !== 'inaccuracy').map((r) => mistakeType(r, lowTime(r))));
      if (res.onTime && res.outcome !== '1/2-1/2' && (res.outcome === '1-0') !== (s.userColor === 'w')) P.addMistakeTypes(['time']);
      set({ savedId: saved.id });
    }
    const won = (res.outcome === '1-0' && s.userColor === 'w') || (res.outcome === '0-1' && s.userColor === 'b');
    if (won) unlock('first-win');
    if (won && res.reason === 'checkmate' && game.history().length < 30) unlock('ch-mate-15');
    if (acc(s.userColor) >= 80 && recs.filter((r) => r.by === 'user').length >= 15) unlock('accuracy-80');
    if (s.opts.kind === 'endgame' && s.opts.endgameId) {
      const ok = s.opts.goal === 'win' ? won : (won || res.outcome === '1/2-1/2');
      if (ok) P.completeEndgame(s.opts.endgameId);
    }
  }

  function checkChallenges() {
    const s = get();
    const mine = s.records.filter((r) => r.by === 'user');
    // 5 consecutive good-or-better
    let run = 0;
    for (let i = mine.length - 1; i >= 0 && mine[i].verdict && GOOD_OR_BETTER.includes(mine[i].verdict!); i--) run++;
    useProgress.getState().bumpChallenge('ch-good-5', run);
    if (run >= 5) unlock('ch-good-5');
    // no piece left en prise for 10 moves
    let safe = 0;
    for (let i = mine.length - 1; i >= 0; i--) {
      const tags = mine[i].coach?.allTags.map((t) => t.id) ?? [];
      if (tags.some((t) => t === 'hangingPiece' || t === 'enPriseAfterCheck' || t === 'overlookedThreat')) break;
      safe++;
    }
    useProgress.getState().bumpChallenge('ch-no-hang-10', safe);
    if (safe >= 10) unlock('ch-no-hang-10');
    // survive 20 moves (Club or stronger)
    const lvl = s.opts.level;
    if ((lvl === 'club' || lvl === 'challenge') && game.history().length >= 40 && !game.result()) unlock('ch-survive-20');
    // win a piece back: was down >= 3, now level or better
    const mats = s.records.map((r) => materialFor(new Chess(r.fenAfter), s.userColor));
    const wasDown = mats.slice(0, -1).some((m) => m <= -3);
    if (wasDown && mats[mats.length - 1] >= 0) unlock('ch-win-back');
  }

  async function commitUserMove(uci: string) {
    const g = gen;
    const fenBefore = game.fen();
    const historyBefore = game.history();
    const m = game.play(uci);
    if (!m) return;
    const recs = get().records;
    const prev = recs[recs.length - 1];
    const rec: MoveRec = { ply: game.history().length, uci: m.lan, san: m.san, color: m.color, fenBefore, fenAfter: game.fen(), by: 'user', captured: m.captured, to: m.to, from: m.from, clockLeft: get().opts.tc ? get().clocks[m.color] : undefined };
    addIncrement(m.color);
    set({ records: [...recs, rec], thinking: 'analysing', viewPly: null, preview: null, showBest: false, checklist: null, pendingWarn: null });
    syncFen();
    feedback(m.captured ? 'capture' : m.san.includes('+') ? 'check' : 'move');

    try {
      const engine = getEngine();
      const b = budget();
      const before = beforeJob && beforeJob.fen === fenBefore ? await beforeJob.promise : await analyseBefore(engine, fenBefore, b);
      if (g !== gen) return;
      let after: Analysis | null = null;
      if (!game.result()) after = await engine.analyse(game.fen(), { multipv: 1, depth: b.depth, movetime: b.movetime });
      if (g !== gen) return;
      const coach = finishCoach({
        fenBefore, move: m.lan, history: historyBefore, opponentPrevLoss: prev?.by === 'engine' ? prev.loss ?? null : null,
        prevCaptureSquare: prev?.captured ? prev.to : null, isBook: inBook(game.fen()) && game.history().length <= COACH.bookMaxPly, ply: game.history().length,
      }, before, after);
      const updated: MoveRec = { ...rec, coach, verdict: coach.verdict, loss: coach.ev.loss, accuracy: coach.accuracy, evalWhite: evalWhiteFrom(after, game.fen()) ?? (game.result()?.reason === 'checkmate' ? { cp: null, mate: m.color === 'w' ? 1 : -1 } : { cp: 0, mate: null }) };
      set({ records: get().records.map((r) => (r === rec ? updated : r)), liveEval: updated.evalWhite ? { ...updated.evalWhite, depth: after?.depth ?? 0 } : get().liveEval });
      const meta = VERDICT_META[coach.verdict];
      useUI.getState().announce(`${m.san}: ${meta.label}. ${coach.explanation.summary}`);
      if (['mistake', 'blunder', 'miss'].includes(coach.verdict)) feedback('error');
      if (coach.verdict === 'brilliant') unlock('first-brilliant');
      checkChallenges();
      if (useSettings.getState().aiExplain && ['mistake', 'blunder', 'miss', 'inaccuracy'].includes(coach.verdict)) {
        rewriteExplanation(fenBefore, m.san, coach).then((text) => {
          if (!text || g !== gen) return;
          set({ records: get().records.map((r) => (r.ply === updated.ply && r.coach ? { ...r, coach: { ...r.coach, explanation: { ...r.coach.explanation, ai: text } } } : r)) });
        });
      }
    } catch (err) {
      if ((err as Error).message !== 'cancelled') console.warn(err);
      if (g !== gen) return;
    }
    set({ thinking: 'idle' });
    if (checkOver()) return;
    if (get().opts.goal === 'draw' && get().records.length >= 60) { finish({ outcome: '1/2-1/2', reason: 'held for 30 moves' }); return; }
    const last = get().records[get().records.length - 1];
    if (get().opts.practice && last?.verdict && ['mistake', 'blunder', 'miss'].includes(last.verdict)) { set({ paused: true }); return; }
    opponentTurn();
  }

  return {
    phase: 'setup',
    opts: { color: 'w', level: 'casual', tc: null, practice: true },
    userColor: 'w',
    records: [],
    viewPly: null,
    thinking: 'idle',
    liveEval: null,
    pendingWarn: null,
    checklist: null,
    clocks: { w: 0, b: 0 },
    result: null,
    preview: null,
    showBest: false,
    gameId: '',
    savedId: null,
    fen: new Chess().fen(),
    analysisTime: [],
    paused: false,

    resume: () => { if (!get().paused || get().phase !== 'playing') return; set({ paused: false }); opponentTurn(); },

    start: (o) => {
      gen++;
      const engine = getEngine();
      engine.cancelAll();
      engine.newGame();
      loadBook().catch(() => {});
      game = new Game(o.startFen);
      const userColor: Color = o.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : o.color;
      set({
        phase: 'playing', opts: o, userColor, records: [], viewPly: null, thinking: 'idle', liveEval: null, pendingWarn: null, checklist: null,
        clocks: o.tc ? { w: o.tc.base, b: o.tc.base } : { w: 0, b: 0 }, result: null, preview: null, showBest: false,
        gameId: `g${Date.now().toString(36)}`, savedId: null, fen: game.fen(), paused: false,
      });
      if (game.turn() !== userColor) opponentTurn(); else prepareUserTurn();
    },

    userMove: async (uci) => {
      const s = get();
      if (s.phase !== 'playing' || sideToMove() !== s.userColor || s.thinking !== 'idle' || s.pendingWarn || s.paused) return;
      if (s.checklist && !s.checklist.answered) { useUI.getState().toast('First, spot the threat', 'Tap the piece their last move attacks, or choose “Nothing new”.'); return; }
      if (!game.isLegal(uci)) return;
      if (useSettings.getState().warn) {
        const g = gen;
        set({ thinking: 'analysing' });
        try {
          const before = beforeJob && beforeJob.fen === game.fen() ? await beforeJob.promise : null;
          const j = await quickJudge(getEngine(), game.fen(), uci, before);
          if (g !== gen) return;
          set({ thinking: 'idle' });
          const allowsMate = j.ev.mateAfter !== null && j.ev.mateAfter < 0 && !(j.ev.mateBefore !== null && j.ev.mateBefore < 0);
          if (j.loss > COACH.inaccuracyMax || allowsMate) { set({ pendingWarn: { uci, loss: j.loss } }); feedback('error'); return; }
        } catch { if (g !== gen) return; set({ thinking: 'idle' }); }
      }
      commitUserMove(uci);
    },

    confirmWarn: (proceed) => {
      const w = get().pendingWarn;
      set({ pendingWarn: null });
      if (proceed && w) commitUserMove(w.uci);
    },

    answerChecklist: (sq) => {
      const c = get().checklist;
      if (!c || c.answered) return;
      const ok = sq === 'none' ? c.truth.length === 0 : c.truth.includes(sq);
      useProgress.getState().recordChecklist(ok);
      set({ checklist: { ...c, answered: true, ok, picked: sq } });
      feedback(ok ? 'move' : 'error');
    },

    takeback: () => {
      const s = get();
      if (!s.opts.practice || s.phase !== 'playing') return;
      let idx = -1;
      for (let i = s.records.length - 1; i >= 0; i--) if (s.records[i].by === 'user') { idx = i; break; }
      if (idx < 0) return;
      gen++;
      getEngine().cancelAll();
      game.undo(s.records.length - idx);
      set({ records: s.records.slice(0, idx), paused: false, thinking: 'idle', pendingWarn: null, preview: null, showBest: false, viewPly: null, checklist: null });
      syncFen();
      if (game.turn() === s.userColor) prepareUserTurn(); else opponentTurn();
    },

    resign: () => {
      const s = get();
      if (s.phase !== 'playing') return;
      finish({ outcome: s.userColor === 'w' ? '0-1' : '1-0', reason: 'resignation', resigned: true });
    },

    tick: (ms) => {
      const s = get();
      if (s.phase !== 'playing' || !s.opts.tc || game.history().length < 2) return;
      const c = game.turn();
      const clocks = { ...s.clocks, [c]: Math.max(0, s.clocks[c] - ms) };
      set({ clocks });
      if (clocks[c] === 0) {
        const insufficient = new Chess(game.fen()).isInsufficientMaterial();
        finish({ outcome: insufficient ? '1/2-1/2' : c === 'w' ? '0-1' : '1-0', reason: 'time', onTime: true });
      }
    },

    setView: (ply) => set({ viewPly: ply, preview: null, showBest: false }),
    setPreview: (p) => set({ preview: p }),
    toggleBest: (v) => set({ showBest: v ?? !get().showBest }),
    toSetup: () => { gen++; getEngine().cancelAll(); set({ phase: 'setup', preview: null, viewPly: null }); },
  };
});

export const currentGame = () => game;
export { uciToMove };
