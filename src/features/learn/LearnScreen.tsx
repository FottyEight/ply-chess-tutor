import { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { LESSONS, lessonById, type Lesson } from '../../data/lessons';
import { REPERTOIRE, type RepLine } from '../../data/openings-repertoire';
import { ENDGAMES } from '../../data/endgames';
import { useProgress, today, weekKey, DAILY_PUZZLE_GOAL, eloDelta } from '../../state/progress';
import { TaskBoard } from './TaskBoard';
import { Board, type Arrow } from '../../board/Board';
import { Icon, VerdictBadge } from '../../components/ui';
import { navigate } from '../../lib/router';
import { useTutor } from '../tutor/tutorStore';
import { getEngine } from '../../engine/browser';
import { quickJudge } from '../../coach/coach';
import { COACH, type Verdict } from '../../coach/config';
import { useSettings } from '../../state/settings';
import { unlock } from '../../state/achievements';
import { puzzlesNear, choosePuzzle, THEME_INFO } from '../../data/puzzles';
import { PuzzlePlayer, type PuzzleSpec } from '../puzzles/PuzzlePlayer';
import { feedback } from '../../lib/feedback';
import '../puzzles/puzzles.css';
import './learn.css';

export default function LearnScreen({ route }: { route: string[] }) {
  if (route[0] === 'lesson' && route[1]) { const l = lessonById(route[1]); if (l) return <LessonView key={l.id} lesson={l} />; }
  if (route[0] === 'openings' && route[1]) { const l = REPERTOIRE.find((x) => x.id === route[1]); if (l) return <OpeningDrill key={l.id} line={l} />; }
  if (route[0] === 'openings') return <Openings />;
  if (route[0] === 'endgames') return <Endgames />;
  if (route[0] === 'placement') return <Placement />;
  return <LearnHome />;
}

const Back = ({ to = '/learn', label = 'Learn' }: { to?: string; label?: string }) => <a className="back" href={`#${to}`}><Icon.prev />{label}</a>;

export function dueLine(openings: Record<string, { due: string }>) {
  const t = today();
  const unseen = REPERTOIRE.find((l) => !openings[l.id]);
  const due = REPERTOIRE.filter((l) => openings[l.id] && openings[l.id].due <= t).sort((a, b) => openings[a.id].due.localeCompare(openings[b.id].due))[0];
  return due ?? unseen ?? null;
}

function LearnHome() {
  const p = useProgress();
  const d = p.days[today()] ?? { puzzles: 0, lessons: 0, openings: 0, games: 0 };
  const nextLesson = LESSONS.find((l) => !p.lessons[l.id]?.done) ?? LESSONS[0];
  const line = dueLine(p.openings);
  const wk = weekKey();
  const gameThisWeek = p.games.some((g) => weekKey(new Date(g.date)) === wk);
  const plan = [
    { done: d.puzzles >= DAILY_PUZZLE_GOAL, title: `${DAILY_PUZZLE_GOAL} puzzles`, sub: `${Math.min(d.puzzles, DAILY_PUZZLE_GOAL)} of ${DAILY_PUZZLE_GOAL} done, about 7 minutes`, href: '/puzzles/rated' },
    { done: d.openings >= 1, title: 'One opening review', sub: line ? `${line.opening}: ${line.name}` : 'All lines reviewed', href: line ? `/learn/openings/${line.id}` : '/learn/openings' },
    { done: d.lessons >= 1, title: 'One lesson', sub: nextLesson.title, href: `/learn/lesson/${nextLesson.id}` },
    { done: gameThisWeek, title: 'A full game this week', sub: gameThisWeek ? 'Done this week' : 'Play a coached game, then review it', href: '/tutor' },
  ];
  const units = [...new Set(LESSONS.map((l) => l.unit))];
  return (
    <div className="page">
      <div className="page-head"><div><h1>Learn</h1><p className="muted">About fifteen minutes a day moves a 1000 player upward.</p></div></div>
      {!p.placement?.done && (
        <a className="panel placement-cta" href="#/learn/placement">
          <span className="grow"><strong className="serif">Find your level</strong><span className="small muted">15 quick questions set your puzzle rating and suggest what to work on.</span></span><Icon.chev />
        </a>
      )}
      <section className="section">
        <h2 className="h-sec">Today’s plan</h2>
        <ol className="rows plan">
          {plan.map((x) => (
            <li key={x.title}><a className={`row${x.done ? ' done' : ''}`} href={`#${x.href}`}>
              <span className={`check${x.done ? ' on' : ''}`} aria-hidden="true" />
              <span className="grow"><span className="title">{x.title}</span><span className="sub">{x.sub}</span></span><Icon.chev />
            </a></li>
          ))}
        </ol>
        {p.placement?.focus.length ? <p className="small muted">Focus areas from your placement: {p.placement.focus.map((f) => THEME_INFO[f]?.name ?? f).join(', ')}.</p> : null}
      </section>
      <section className="section">
        <h2 className="h-sec">Lessons</h2>
        {units.map((u) => (
          <div key={u} className="unit">
            <h3 className="unit-title">{u}</h3>
            <div className="rows">
              {LESSONS.filter((l) => l.unit === u).map((l) => (
                <a key={l.id} className={`row${p.lessons[l.id]?.done ? ' done' : ''}`} href={`#/learn/lesson/${l.id}`}>
                  <span className="grow"><span className="title">{l.title}</span><span className="sub">{l.summary}</span></span><Icon.chev />
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="section">
        <h2 className="h-sec">Trainers</h2>
        <div className="rows">
          <a className="row" href="#/learn/openings"><span className="grow"><span className="title">Opening trainer</span><span className="sub">Italian and London as White, Caro-Kann and Queen’s Gambit Declined as Black</span></span><Icon.chev /></a>
          <a className="row" href="#/learn/endgames"><span className="grow"><span className="title">Endgame trainer</span><span className="sub">Win or hold key endgames against Stockfish, with coaching</span></span><Icon.chev /></a>
          <a className="row" href="#/learn/placement"><span className="grow"><span className="title">Placement quiz</span><span className="sub">{p.placement?.done ? 'Take it again' : 'Not taken yet'}</span></span><Icon.chev /></a>
        </div>
      </section>
    </div>
  );
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const p = useProgress();
  const [stage, setStage] = useState<'learn' | 'quiz' | 'done'>('learn');
  const [stepDone, setStepDone] = useState<Record<number, boolean>>({});
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const finish = (s: number) => {
    p.completeLesson(lesson.id, s);
    if (Object.values({ ...useProgress.getState().lessons }).filter((x) => x.done).length >= 5) unlock('lessons-5');
    setStage('done');
  };
  const allTasksDone = lesson.steps.every((s, i) => s.kind === 'text' || stepDone[i]);
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  return (
    <div className="page lesson">
      <div className="page-head"><div><Back /><span className="small muted">{lesson.unit}</span><h1>{lesson.title}</h1></div></div>
      {stage === 'learn' && (
        <>
          {lesson.steps.map((s, i) => s.kind === 'text'
            ? <p key={i} className="serif lesson-text">{s.body}</p>
            : <TaskBoard key={i} task={s.task} onResult={() => setStepDone((d) => ({ ...d, [i]: true }))} />)}
          <div className="btn-row">
            {lesson.quiz.length ? <button type="button" className="btn primary" disabled={!allTasksDone} onClick={() => setStage('quiz')}>Take the quiz</button>
              : <button type="button" className="btn primary" disabled={!allTasksDone} onClick={() => finish(1)}>Complete lesson</button>}
            {!allTasksDone && <span className="small muted">Solve the board exercise to continue.</span>}
          </div>
        </>
      )}
      {stage === 'quiz' && lesson.quiz[qi] && (
        <section className="section">
          <span className="small muted">Question {qi + 1} of {lesson.quiz.length}</span>
          <TaskBoard key={qi} task={lesson.quiz[qi]} onResult={(ok) => { if (ok) setScore((x) => x + 1); setAnswered(true); }} />
          <div className="btn-row">
            <button type="button" className="btn primary" disabled={!answered} onClick={() => { setAnswered(false); if (qi + 1 < lesson.quiz.length) setQi(qi + 1); else finish(score / lesson.quiz.length); }}>
              {qi + 1 < lesson.quiz.length ? 'Next question' : 'Finish'}
            </button>
          </div>
        </section>
      )}
      {stage === 'done' && (
        <section className="section">
          <h2>Lesson complete</h2>
          {lesson.quiz.length > 0 && <p className="serif lesson-text">You got {score} of {lesson.quiz.length} right on the first try.</p>}
          <div className="btn-row">
            {lesson.practice && <a className="btn primary" href={`#/puzzles/themes/${lesson.practice}`}>Practise with puzzles</a>}
            {next && <a className="btn" href={`#/learn/lesson/${next.id}`}>Next: {next.title}</a>}
            <a className="btn ghost" href="#/learn">Back to Learn</a>
          </div>
        </section>
      )}
    </div>
  );
}

function Openings() {
  const p = useProgress();
  const groups = [...new Set(REPERTOIRE.map((l) => l.opening))];
  const t = today();
  return (
    <div className="page">
      <div className="page-head"><div><Back /><h2>Opening trainer</h2><p className="muted">Lines come back for review just before you would forget them (spaced repetition).</p></div></div>
      {groups.map((g) => {
        const lines = REPERTOIRE.filter((l) => l.opening === g);
        return (
          <section key={g} className="section">
            <h3>{g} <span className="small muted">as {lines[0].side === 'w' ? 'White' : 'Black'}</span></h3>
            <div className="rows">
              {lines.map((l) => {
                const c = p.openings[l.id];
                const status = !c ? 'New' : c.due <= t ? 'Due today' : `Next review ${new Date(c.due + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                return <a key={l.id} className="row" href={`#/learn/openings/${l.id}`}><span className="grow"><span className="title">{l.name}</span><span className="sub">{l.moves.length / 2 | 0} moves</span></span><span className="meta">{status}</span><Icon.chev /></a>;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OpeningDrill({ line }: { line: RepLine }) {
  const p = useProgress();
  const coords = useSettings((s) => s.coords);
  const learning = !p.openings[line.id];
  const [ply, setPly] = useState(0);
  const [errors, setErrors] = useState(0);
  const [msg, setMsg] = useState<{ text: string; verdict?: Verdict } | null>(null);
  const [off, setOff] = useState<{ fen: string; last: [Square, Square] } | null>(null);
  const [done, setDone] = useState(false);
  const positions = useMemo(() => {
    const c = new Chess();
    const out = [{ fen: c.fen(), last: null as [Square, Square] | null, san: '' }];
    for (const m of line.moves) { const r = c.move(m); out.push({ fen: c.fen(), last: [r.from, r.to], san: r.san }); }
    return out;
  }, [line.id]);
  const userTurn = (i: number) => (i % 2 === 0) === (line.side === 'w');

  // auto-play opponent moves
  useEffect(() => {
    if (done || off) return;
    if (ply >= line.moves.length) {
      setDone(true);
      p.reviewOpening(line.id, errors === 0 ? 5 : errors === 1 ? 3 : 1);
      return;
    }
    if (!userTurn(ply)) { const t = setTimeout(() => { setPly(ply + 1); feedback('move'); }, 450); return () => clearTimeout(t); }
  }, [ply, off, done]);

  const onMove = async (uci: string) => {
    const c = new Chess(positions[ply].fen);
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    if (m.san === line.moves[ply]) {
      setMsg(line.ideas[ply] ? { text: line.ideas[ply] } : null);
      setPly(ply + 1);
      feedback(m.captured ? 'capture' : 'move');
      return;
    }
    // left the repertoire
    setErrors((e) => e + 1);
    feedback('error');
    setOff({ fen: c.fen(), last: [m.from, m.to] });
    const expected = line.moves[ply];
    setMsg({ text: `You left the repertoire with ${m.san}. The line continues ${expected}${line.ideas[ply] ? `: ${line.ideas[ply].charAt(0).toLowerCase()}${line.ideas[ply].slice(1)}` : '.'} Checking your move…` });
    try {
      const j = await quickJudge(getEngine(), positions[ply].fen, m.lan, null);
      const v: Verdict = j.loss <= COACH.excellentMax ? 'excellent' : j.loss <= COACH.goodMax ? 'good' : j.loss <= COACH.inaccuracyMax ? 'inaccuracy' : j.loss <= COACH.mistakeMax ? 'mistake' : 'blunder';
      const comment = j.loss <= COACH.goodMax ? 'Stockfish says your move is fine too, but learn the repertoire move so your plans fit together.' : `Stockfish rates your move a${v === 'inaccuracy' ? 'n' : ''} ${v}: it costs about ${Math.round(j.loss)}% of your winning chances.`;
      setMsg({ text: `You left the repertoire with ${m.san}. The line continues ${expected}. ${comment}`, verdict: v });
    } catch { /* engine busy */ }
  };
  const back = () => { setOff(null); };

  const showFen = off ? off.fen : positions[ply].fen;
  const last = off ? off.last : positions[ply].last;
  const hintArrow: Arrow[] = learning && !off && !done && userTurn(ply) && line.moves[ply] ? (() => { const c = new Chess(positions[ply].fen); const m = c.move(line.moves[ply]); return [{ from: m.from, to: m.to, kind: 'info' as const }]; })() : [];
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back to="/learn/openings" label="Openings" /><h2>{line.opening}</h2><p className="muted">{line.name}{learning ? '. First time: the arrow shows each move.' : '. Play your moves from memory.'}</p></div></div>
      <div className="puzzle">
        <div className="puzzle-board"><Board fen={showFen} orientation={line.side} movable={!off && !done && userTurn(ply) ? line.side : null} onMove={onMove} lastMove={last} arrows={hintArrow} coords={coords} label="Opening board" /></div>
        <div className="puzzle-side">
          <p className="small muted">{positions.slice(1, ply + 1).map((x, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${x.san}`).join(' ') || 'Starting position'}</p>
          {msg && <div className="op-msg">{msg.verdict && <VerdictBadge v={msg.verdict} />}<p className="serif">{msg.text}</p></div>}
          {off && <button type="button" className="btn primary" onClick={back}>Play the repertoire move</button>}
          {done && (
            <div className="section">
              <p className="serif lead-text">{errors === 0 ? 'Perfect. You’ll see this line again in a few days.' : `Finished with ${errors} slip${errors > 1 ? 's' : ''}. It will come back sooner.`}</p>
              <div className="btn-row"><button type="button" className="btn" onClick={() => { setPly(0); setErrors(0); setDone(false); setMsg(null); }}>Again</button><a className="btn primary" href="#/learn/openings">All lines</a></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Endgames() {
  const p = useProgress();
  const start = useTutor((s) => s.start);
  return (
    <div className="page">
      <div className="page-head"><div><Back /><h2>Endgame trainer</h2><p className="muted">Play these against full-strength Stockfish. The coach labels every move.</p></div></div>
      <div className="rows">
        {ENDGAMES.map((d) => (
          <button key={d.id} type="button" className={`row${p.endgames[d.id]?.done ? ' done' : ''}`}
            onClick={() => { start({ color: d.side, level: 'full', tc: null, practice: true, startFen: d.fen, kind: 'endgame', goal: d.goal, title: d.title, endgameId: d.id }); navigate('/tutor'); }}>
            <span className="grow"><span className="title">{d.title}</span><span className="sub">{d.goal === 'win' ? 'Win it' : 'Hold the draw'} as {d.side === 'w' ? 'White' : 'Black'}. {d.tip}</span></span><Icon.chev />
          </button>
        ))}
      </div>
    </div>
  );
}

const PLACEMENT_RATED = 12;
const PLACEMENT_THREAT = 3;
function Placement() {
  const p = useProgress();
  const [i, setI] = useState(0);
  const [rating, setRating] = useState(1000);
  const [spec, setSpec] = useState<PuzzleSpec | null>(null);
  const [fails, setFails] = useState<string[]>([]);
  const [threatMisses, setThreatMisses] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [seen] = useState(() => new Set<string>());
  const total = PLACEMENT_RATED + PLACEMENT_THREAT;
  const load = async (k: number, r: number) => {
    const threat = k >= PLACEMENT_RATED;
    const pool = await puzzlesNear(threat ? 950 : r, 80);
    const filtered = threat ? pool.filter((x) => x.themes.some((t) => ['mateIn1', 'fork', 'hangingPiece'].includes(t))) : pool;
    const pz = choosePuzzle(filtered.length ? filtered : pool, seen, {}, Math.random);
    if (!pz) return;
    seen.add(pz.id);
    setSpec({ id: pz.id + (threat ? ':t' : ''), fen: pz.fen, moves: pz.moves, setup: true, themes: pz.themes, rating: pz.rating, mode: threat ? 'threat' : 'solve' });
    setAnswered(false);
  };
  useEffect(() => { load(0, 1000); }, []);
  if (i >= total) {
    const counts: Record<string, number> = {};
    for (const t of fails) counts[t] = (counts[t] ?? 0) + 1;
    const focus = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => THEME_INFO[t] && !['middlegame', 'endgame', 'opening', 'short', 'long', 'oneMove', 'crushing', 'advantage'].includes(t)).slice(0, 3);
    if (threatMisses >= 2) focus.unshift('threats');
    return (
      <div className="page">
        <div className="page-head"><div><Back /><h2>Your starting point</h2></div></div>
        <p className="serif lead-text">Your puzzle rating starts at <strong>{rating}</strong>.</p>
        {focus.length > 0 && <p className="serif">Work on: {focus.map((f) => f === 'threats' ? 'spotting your opponent’s threats' : THEME_INFO[f].name.toLowerCase()).join(', ')}.</p>}
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => { p.setPlacement(rating, focus.filter((f) => f !== 'threats')); unlock('placement'); navigate('/learn'); }}>Save and see my plan</button>
        </div>
      </div>
    );
  }
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back /><h2>Placement quiz</h2><p className="muted">Question {i + 1} of {total}{i >= PLACEMENT_RATED ? ': what is the threat?' : ''}</p></div></div>
      <div className="progressbar"><i style={{ transform: `scaleX(${i / total})` }} /></div>
      {spec && <PuzzlePlayer key={spec.id} spec={spec} allowHints={false} allowRetry={false}
        onDone={(o) => {
          setAnswered(true);
          if (i < PLACEMENT_RATED) {
            const d = eloDelta(rating, spec.rating ?? 1000, o.solved ? 1 : 0, 0) * 2;
            setRating((r) => Math.max(500, Math.min(1800, r + d)));
            if (!o.solved) setFails((f) => [...f, ...spec.themes]);
          } else if (!o.solved) setThreatMisses((n) => n + 1);
        }}
        onNext={() => { const n = i + 1; setI(n); if (n < total) load(n, rating); }} nextLabel={i + 1 < total ? 'Next' : 'See result'} />}
      {!answered && <p className="small muted">No hints here: just your best guess.</p>}
    </div>
  );
}
