import { useEffect, useMemo, useRef, useState } from 'react';
import { PuzzlePlayer, type PuzzleSpec, type PuzzleOutcome } from './PuzzlePlayer';
import { puzzlesNear, choosePuzzle, loadIndex, hashDay, THEME_INFO, TRAIN_THEMES, type Puzzle } from '../../data/puzzles';
import { useProgress, today, weekKey, streak, DAILY_PUZZLE_GOAL } from '../../state/progress';
import { unlock, ACHIEVEMENTS, CHALLENGES } from '../../state/achievements';
import { navigate } from '../../lib/router';
import { Icon } from '../../components/ui';
import './puzzles.css';

const toSpec = (p: Puzzle, extra: Partial<PuzzleSpec> = {}): PuzzleSpec => ({ id: p.id, fen: p.fen, moves: p.moves, setup: true, themes: p.themes, rating: p.rating, ...extra });
const scoreOf = (o: PuzzleOutcome) => (o.solved ? (o.hints === 0 ? 1 : o.hints === 1 ? 0.5 : 0) : 0);

function afterPuzzle() {
  const s = useProgress.getState();
  if (s.solved >= 1) unlock('first-puzzle');
  if (s.solved >= 100) unlock('puzzles-100');
  if (s.solved >= 500) unlock('puzzles-500');
  if (s.rating >= 1100) unlock('rating-1100');
  if (s.rating >= 1200) unlock('rating-1200');
  if (s.rating >= 1400) unlock('rating-1400');
  const st = streak(s.days);
  if (st >= 3) unlock('streak-3');
  if (st >= 7) unlock('streak-7');
}

export default function PuzzlesScreen({ route }: { route: string[] }) {
  const mode = route[0];
  if (mode === 'rated') return <Trainer key="rated" title="Rated puzzles" />;
  if (mode === 'themes' && route[1]) return <Trainer key={route[1]} title={THEME_INFO[route[1]]?.name ?? route[1]} theme={route[1]} />;
  if (mode === 'themes') return <Themes />;
  if (mode === 'mates') return <Trainer key="mates" title="Mate in 1 or 2" themes={['mateIn1', 'mateIn2']} />;
  if (mode === 'threat') return <Trainer key="threat" title="Spot the threat" threat />;
  if (mode === 'daily') return <Daily />;
  if (mode === 'rush') return <Rush />;
  if (mode === 'mine') return <Mine />;
  if (mode === 'challenges') return <Challenges />;
  return <Menu />;
}

function Menu() {
  const p = useProgress();
  const day = p.days[today()];
  const st = streak(p.days);
  const wk = weekly(p);
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Puzzles</h1><p className="muted">Tactics from real games, pitched at your rating.</p></div>
        <div className="rating-big"><span className="num">{p.rating}</span><span className="small muted">puzzle rating</span></div>
      </div>
      <div className="goal">
        <div className="goal-text"><strong>{Math.min(day?.puzzles ?? 0, DAILY_PUZZLE_GOAL)} of {DAILY_PUZZLE_GOAL}</strong> today{st > 0 && <span className="muted">, {st}-day streak</span>}</div>
        <div className="progressbar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, (day?.puzzles ?? 0) / DAILY_PUZZLE_GOAL)})` }} /></div>
      </div>
      <div className="rows">
        <Row href="/puzzles/rated" title="Rated puzzles" sub="Adapts to you and leans on the themes you miss most" />
        <Row href="/puzzles/daily" title="Daily puzzle" sub={p.daily?.date === today() && p.daily.done ? 'Solved today' : 'One new puzzle each day'} />
        <Row href="/puzzles/themes" title="Themed sets" sub="Pick a tactic and train it" />
        <Row href="/puzzles/rush" title="Puzzle Rush" sub={`3 minutes, 5 strikes${p.rushBest ? `. Best: ${p.rushBest}` : ''}`} />
        <Row href="/puzzles/mates" title="Mate in 1 or 2" sub="Checkmate drills" />
        <Row href="/puzzles/threat" title="Spot the threat" sub="What is your opponent threatening?" />
        <Row href="/puzzles/mine" title="From your games" sub={`${p.myPuzzles.length} positions where you went wrong`} />
        <Row href="/puzzles/challenges" title="Challenges" sub={`Weekly: ${wk.title} (${wk.done}/${wk.target})`} />
      </div>
    </div>
  );
}

function Row({ href, title, sub }: { href: string; title: string; sub: string }) {
  return <a className="row" href={`#${href}`}><span className="grow"><span className="title">{title}</span><span className="sub">{sub}</span></span><Icon.chev /></a>;
}

function Back({ to = '/puzzles', label = 'Puzzles' }: { to?: string; label?: string }) {
  return <a className="back" href={`#${to}`}><Icon.prev />{label}</a>;
}

/** Rated / themed / threat trainer. */
function Trainer({ title, theme, themes, threat }: { title: string; theme?: string; themes?: string[]; threat?: boolean }) {
  const p = useProgress();
  const [spec, setSpec] = useState<PuzzleSpec | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [n, setN] = useState(0);
  const pick = async () => {
    setDelta(null);
    const s = useProgress.getState();
    const target = threat ? Math.min(s.rating, 1100) : s.rating;
    const pool = await puzzlesNear(target, theme || themes ? 200 : 100);
    let filtered = pool;
    if (themes) filtered = pool.filter((x) => x.themes.some((t) => themes.includes(t)));
    if (threat) filtered = pool.filter((x) => x.themes.some((t) => ['mateIn1', 'fork', 'hangingPiece', 'short', 'oneMove'].includes(t)));
    const pz = choosePuzzle(filtered.length ? filtered : pool, new Set(s.seen), s.themeStats, Math.random, theme);
    if (pz) setSpec(toSpec(pz, threat ? { mode: 'threat', id: pz.id + ':t' } : {}));
  };
  useEffect(() => { pick(); }, []);
  const done = (o: PuzzleOutcome) => {
    if (!spec) return;
    const d = p.recordPuzzle({ id: spec.id.replace(':t', ''), rating: spec.rating ?? 1000, themes: spec.themes, score: scoreOf(o), rated: !threat });
    setDelta(threat ? null : d);
    setN((x) => x + 1);
    afterPuzzle();
  };
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back /><h2>{title}</h2></div>
        <div className="rating-big"><span className="num">{p.rating}</span>{delta !== null && <span className={`delta num ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '+' : '−'}{Math.abs(delta)}</span>}</div>
      </div>
      {spec ? <PuzzlePlayer spec={spec} onDone={done} onNext={pick} /> : <p className="muted">Loading puzzles…</p>}
      {n > 0 && <p className="small muted">{n} solved this session.</p>}
    </div>
  );
}

function Themes() {
  const p = useProgress();
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => { loadIndex().then((i) => setCounts(i.themes)); }, []);
  return (
    <div className="page">
      <div className="page-head"><div><Back /><h2>Themed sets</h2><p className="muted">Your success rate is shown once you have tried a theme a few times.</p></div></div>
      <div className="rows">
        {TRAIN_THEMES.map((t) => {
          const s = p.themeStats[t];
          const rate = s && s.tries >= 3 ? Math.round(100 * (1 - s.fails / s.tries)) : null;
          return (
            <a key={t} className="row" href={`#/puzzles/themes/${t}`}>
              <span className="grow"><span className="title">{THEME_INFO[t].name}</span><span className="sub">{THEME_INFO[t].explain}</span></span>
              <span className="meta num">{rate !== null ? `${rate}%` : counts[t] ? `${counts[t]}` : ''}</span><Icon.chev />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Daily() {
  const p = useProgress();
  const [spec, setSpec] = useState<PuzzleSpec | null>(null);
  useEffect(() => {
    (async () => {
      const pool = await puzzlesNear(1100, 100);
      const pz = pool[hashDay(today()) % pool.length];
      setSpec(toSpec(pz, { title: 'Today’s puzzle' }));
      if (p.daily?.date !== today()) p.setDaily({ date: today(), id: pz.id, done: false });
    })();
  }, []);
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back /><h2>Daily puzzle</h2><p className="muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      {spec && <PuzzlePlayer spec={spec} onDone={(o) => { p.recordPuzzle({ id: spec.id, rating: spec.rating!, themes: spec.themes, score: scoreOf(o), rated: true }); if (o.solved) p.setDaily({ date: today(), id: spec.id, done: true }); afterPuzzle(); }} onNext={() => navigate('/puzzles')} nextLabel="Back to puzzles" />}
    </div>
  );
}

function Rush() {
  const p = useProgress();
  const [state, setState] = useState<'ready' | 'run' | 'over'>('ready');
  const [left, setLeft] = useState(180);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [spec, setSpec] = useState<PuzzleSpec | null>(null);
  const level = useRef(650);
  const seen = useRef(new Set<string>());
  const next = async () => {
    const pool = await puzzlesNear(level.current, 60);
    const pz = choosePuzzle(pool, seen.current, {}, Math.random);
    if (pz) { seen.current.add(pz.id); setSpec(toSpec(pz)); }
  };
  useEffect(() => {
    if (state !== 'run') return;
    const id = setInterval(() => setLeft((l) => { if (l <= 1) { setState('over'); return 0; } return l - 1; }), 1000);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => { if (state === 'over') { p.setRushBest(score); if (score >= 15) unlock('rush-15'); } }, [state]);
  const begin = () => { setScore(0); setStrikes(0); setLeft(180); level.current = 650; seen.current = new Set(); setState('run'); next(); };
  const done = (o: PuzzleOutcome) => {
    if (o.solved && o.hints === 0) { setScore((s) => s + 1); level.current += 45; setTimeout(next, 350); }
    else { setStrikes((s) => { if (s + 1 >= 5) setState('over'); return s + 1; }); setTimeout(next, 900); }
  };
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back /><h2>Puzzle Rush</h2></div>
        {state === 'run' && <div className="rush-stats"><span className="num big">{score}</span><span className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span><span aria-label={`${strikes} of 5 strikes`} className="strikes">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < strikes ? 'x' : ''} />)}</span></div>}
      </div>
      {state === 'ready' && <div className="section"><p className="serif lead-text">Solve as many as you can in three minutes. Puzzles get harder as you go; five wrong answers end the run.</p><div><button type="button" className="btn primary big" onClick={begin}>Start</button></div>{p.rushBest > 0 && <p className="muted">Your best: {p.rushBest}</p>}</div>}
      {state === 'run' && spec && <PuzzlePlayer spec={spec} onDone={done} allowHints={false} allowRetry={false} />}
      {state === 'over' && <div className="section"><h3>Score: {score}</h3><p className="muted">Best: {Math.max(p.rushBest, score)}</p><div className="btn-row"><button type="button" className="btn primary" onClick={begin}>Play again</button><a className="btn" href="#/puzzles">Done</a></div></div>}
    </div>
  );
}

function Mine() {
  const p = useProgress();
  const [i, setI] = useState(0);
  const list = useMemo(() => [...p.myPuzzles].sort((a, b) => (a.solved - a.failed) - (b.solved - b.failed)), [p.myPuzzles.length]);
  const cur = list[i];
  if (!list.length) return (
    <div className="page"><div className="page-head"><div><Back /><h2>From your games</h2></div></div>
      <p className="serif lead-text">No positions yet. After a game, open its review and press “Fix this” on a mistake. That position lands here so you can practise finding the right move.</p>
      <div><a className="btn primary" href="#/tutor">Play a game</a></div></div>
  );
  return (
    <div className="page wide-page">
      <div className="page-head"><div><Back /><h2>From your games</h2><p className="muted">{i + 1} of {list.length}</p></div></div>
      <PuzzlePlayer key={cur.id} spec={{ id: cur.id, fen: cur.fen, moves: cur.solution, setup: false, themes: [cur.tag], check: 'engine', title: cur.summary }}
        onDone={(o) => p.markMyPuzzle(cur.id, o.solved)} onNext={() => setI((i + 1) % list.length)} />
    </div>
  );
}

export function weekly(p: ReturnType<typeof useProgress.getState>) {
  const wk = weekKey();
  const n = Number(wk.split('W')[1]) % 3;
  const days = Object.entries(p.days).filter(([d]) => weekKey(new Date(d + 'T12:00:00')) === wk);
  if (n === 0) return { title: 'Solve 50 puzzles', target: 50, done: days.reduce((s, [, d]) => s + d.puzzles, 0) };
  if (n === 1) return { title: 'Play 3 coached games', target: 3, done: days.reduce((s, [, d]) => s + d.games, 0) };
  return { title: 'Hit your daily goal on 4 days', target: 4, done: days.filter(([, d]) => d.goalMet).length };
}

function Challenges() {
  const p = useProgress();
  const wk = weekly(p);
  const goals: Record<string, string> = { 'ch-good-5': '5', 'ch-no-hang-10': '10' };
  return (
    <div className="page">
      <div className="page-head"><div><Back /><h2>Challenges</h2><p className="muted">Earned during coached games against the engine.</p></div></div>
      <div className="panel weekly"><span className="small muted">This week</span><strong className="serif">{wk.title}</strong>
        <div className="progressbar"><i style={{ transform: `scaleX(${Math.min(1, wk.done / wk.target)})` }} /></div><span className="small num">{Math.min(wk.done, wk.target)} of {wk.target}</span></div>
      <div className="rows">
        {CHALLENGES.map((id) => {
          const a = ACHIEVEMENTS[id];
          const got = p.achievements[id];
          const best = p.challengeBest[id];
          return (
            <div key={id} className={`row${got ? ' done' : ''}`}>
              <span className="grow"><span className="title">{a.title}</span><span className="sub">{a.body}</span></span>
              <span className="meta">{got ? new Date(got).toLocaleDateString() : best !== undefined && goals[id] ? `best ${best}/${goals[id]}` : ''}</span>
            </div>
          );
        })}
      </div>
      <div><a className="btn primary" href="#/tutor">Play a game</a></div>
    </div>
  );
}
