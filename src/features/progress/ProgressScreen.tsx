import { useProgress, streak, type MistakeType } from '../../state/progress';
import { ACHIEVEMENTS } from '../../state/achievements';
import { THEME_INFO, TRAIN_THEMES } from '../../data/puzzles';
import { levelById } from '../../engine/levels';
import { Icon } from '../../components/ui';
import './progress.css';

function LineChart({ points, label, yLabel, min, max }: { points: number[]; label: string; yLabel: (v: number) => string; min?: number; max?: number }) {
  if (points.length < 2) return <p className="small muted">Not enough data yet.</p>;
  const W = 600, H = 180, P = 28;
  const lo = min ?? Math.min(...points) - 20, hi = max ?? Math.max(...points) + 20;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - P * 2);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - P * 2);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: from ${yLabel(points[0])} to ${yLabel(points[points.length - 1])}`}>
      {ticks.map((t) => <g key={t}><line x1={P} x2={W - P} y1={y(t)} y2={y(t)} className="grid" /><text x={2} y={y(t) + 4} className="tick">{yLabel(t)}</text></g>)}
      <path d={d} className="line" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r={4} className="dot" />
    </svg>
  );
}

const TYPE_LABEL: Record<MistakeType, string> = { 'hung piece': 'Hung a piece', 'missed tactic': 'Missed a tactic', 'opening error': 'Opening error', 'endgame error': 'Endgame error', time: 'Time trouble' };

function recommend(p: ReturnType<typeof useProgress.getState>): { text: string; href: string; cta: string } {
  const types = Object.entries(p.mistakeTypes).sort((a, b) => b[1] - a[1]);
  const weakThemes = TRAIN_THEMES.map((t) => ({ t, s: p.themeStats[t] })).filter((x) => x.s && x.s.tries >= 5).sort((a, b) => b.s!.fails / b.s!.tries - a.s!.fails / a.s!.tries);
  const top = types[0];
  if (!top || top[1] === 0) {
    if (weakThemes[0]) return { text: `Your lowest puzzle success rate is ${THEME_INFO[weakThemes[0].t].name.toLowerCase()}. A themed set will help.`, href: `/puzzles/themes/${weakThemes[0].t}`, cta: `Train ${THEME_INFO[weakThemes[0].t].name}` };
    return { text: 'Play a coached game so the coach can see where your points go.', href: '/tutor', cta: 'Play a game' };
  }
  switch (top[0] as MistakeType) {
    case 'hung piece': return { text: 'Most of your lost points come from pieces left undefended. Do the safety lesson, then hanging-piece puzzles, and turn on the blunder-check habit.', href: '/learn/lesson/safety', cta: 'Count before you capture' };
    case 'missed tactic': { const t = weakThemes.find((x) => ['fork', 'pin', 'skewer', 'discoveredAttack', 'backRankMate', 'mateIn2'].includes(x.t))?.t ?? 'fork'; return { text: `You miss tactics most often. Your weakest tactical theme right now: ${THEME_INFO[t].name.toLowerCase()}.`, href: `/puzzles/themes/${t}`, cta: `Train ${THEME_INFO[t].name}` }; }
    case 'opening error': return { text: 'Your early moves cost the most. Review your repertoire lines and the opening principles lesson.', href: '/learn/openings', cta: 'Opening trainer' };
    case 'endgame error': return { text: 'Endgames are leaking points. Practise the key positions against Stockfish.', href: '/learn/endgames', cta: 'Endgame trainer' };
    default: return { text: 'You lose games on the clock. Try 15+10 or untimed games and use the time to do a blunder check every move.', href: '/tutor', cta: 'Play a slower game' };
  }
}

export default function ProgressScreen() {
  const p = useProgress();
  const ratings = p.ratingHistory.map((h) => h.r);
  const games = [...p.games].filter((g) => g.kind === 'game').reverse();
  const accs = games.map((g) => g.accuracy[g.userColor]);
  const types = Object.entries(p.mistakeTypes) as [MistakeType, number][];
  const maxType = Math.max(1, ...types.map(([, n]) => n));
  const rec = recommend(p);
  const st = streak(p.days);
  const unlocked = Object.entries(p.achievements).sort((a, b) => b[1] - a[1]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Progress</h1></div></div>
      <div className="stats">
        <div><span className="stat num">{p.rating}</span><span className="small muted">puzzle rating</span></div>
        <div><span className="stat num">{p.solved}</span><span className="small muted">puzzles solved</span></div>
        <div><span className="stat num">{p.games.length}</span><span className="small muted">games played</span></div>
        <div><span className="stat num">{st}</span><span className="small muted">day streak</span></div>
      </div>

      <section className="panel next-up">
        <span className="small muted">Train this next</span>
        <p className="serif">{rec.text}</p>
        <div><a className="btn primary" href={`#${rec.href}`}>{rec.cta}</a></div>
      </section>

      <section className="section"><h2 className="h-sec">Puzzle rating</h2><LineChart points={ratings} label="Puzzle rating over time" yLabel={(v) => String(Math.round(v))} /></section>
      <section className="section"><h2 className="h-sec">Accuracy by game</h2><LineChart points={accs} label="Game accuracy trend" yLabel={(v) => `${Math.round(v)}%`} min={0} max={100} /></section>

      <section className="section">
        <h2 className="h-sec">Where your points go</h2>
        <ul className="bars">
          {types.map(([t, n]) => (
            <li key={t}><span className="bar-label">{TYPE_LABEL[t]}</span><span className="bar"><i style={{ transform: `scaleX(${n / maxType})` }} /></span><span className="num bar-n">{n}</span></li>
          ))}
        </ul>
        <p className="small muted">Counted from your mistakes, blunders and misses in coached games.</p>
      </section>

      <section className="section">
        <h2 className="h-sec">Recent games</h2>
        {p.games.length === 0 ? <p className="muted">No games yet.</p> : (
          <div className="rows">
            {p.games.slice(0, 12).map((g) => {
              const won = g.result !== '1/2-1/2' && (g.result === '1-0') === (g.userColor === 'w');
              return (
                <a key={g.id} className="row" href={`#/review/${g.id}`}>
                  <span className={`res ${g.result === '1/2-1/2' ? 'd' : won ? 'w' : 'l'}`} aria-hidden="true">{g.result === '1/2-1/2' ? '½' : won ? 'W' : 'L'}</span>
                  <span className="grow"><span className="title">{g.kind === 'endgame' ? 'Endgame drill' : levelById(g.level).name}{g.opening ? `, ${g.opening.name}` : ''}</span><span className="sub">{new Date(g.date).toLocaleDateString()}, {g.result === '1/2-1/2' ? 'draw' : won ? 'win' : 'loss'} by {g.reason}</span></span>
                  <span className="meta num">{g.accuracy[g.userColor]}%</span><Icon.chev />
                </a>
              );
            })}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h-sec">Achievements</h2>
        {unlocked.length === 0 ? <p className="muted">None yet. They appear as you play, solve and learn.</p> : (
          <ul className="achievements">{unlocked.map(([id, t]) => <li key={id}><strong>{ACHIEVEMENTS[id]?.title ?? id}</strong><span className="small muted">{ACHIEVEMENTS[id]?.body} {new Date(t).toLocaleDateString()}</span></li>)}</ul>
        )}
        <p className="small muted">Blunder-check habit: {p.checklist.asked ? `${p.checklist.correct} of ${p.checklist.asked} threats spotted` : 'not used yet'}.</p>
      </section>
    </div>
  );
}
