import { useEffect, lazy, Suspense } from 'react';
import { useRoute, navigate } from './lib/router';
import { useSettings, applyTheme } from './state/settings';
import { Icon, Toasts, Announcer } from './components/ui';
import { TutorScreen } from './features/tutor/TutorScreen';

const PuzzlesScreen = lazy(() => import('./features/puzzles/PuzzlesScreen'));
const LearnScreen = lazy(() => import('./features/learn/LearnScreen'));
const ProgressScreen = lazy(() => import('./features/progress/ProgressScreen'));
const MoreScreen = lazy(() => import('./features/more/MoreScreen'));
const ReviewScreen = lazy(() => import('./features/review/ReviewScreen'));

const TABS = [
  { id: 'tutor', label: 'Tutor', icon: Icon.tutor },
  { id: 'puzzles', label: 'Puzzles', icon: Icon.puzzle },
  { id: 'learn', label: 'Learn', icon: Icon.learn },
  { id: 'progress', label: 'Progress', icon: Icon.progress },
  { id: 'more', label: 'More', icon: Icon.more },
] as const;

export function App() {
  const route = useRoute();
  const theme = useSettings((s) => s.theme);
  const board = useSettings((s) => s.board);
  useEffect(() => {
    applyTheme({ theme, board });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme({ theme, board });
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme, board]);

  const top = route[0] ?? 'tutor';
  const tab = top === 'review' ? 'progress' : top;
  let screen: JSX.Element;
  switch (top) {
    case 'puzzles': screen = <PuzzlesScreen route={route.slice(1)} />; break;
    case 'learn': screen = <LearnScreen route={route.slice(1)} />; break;
    case 'progress': screen = <ProgressScreen />; break;
    case 'more': screen = <MoreScreen />; break;
    case 'review': screen = <ReviewScreen id={route[1]} />; break;
    default: screen = <TutorScreen />;
  }
  return (
    <div className="app">
      <a href="#main" className="sr-only">Skip to content</a>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate(`/${t.id}`); }}>
            <t.icon /><span>{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main" id="main">
        <Suspense fallback={<div className="page"><p className="muted">Loading…</p></div>}>{screen}</Suspense>
        {top !== 'tutor' && <footer className="site-foot">Ply is free software under the GPL-3.0. <a href="/source/ply-source.zip">Source code</a>. Puzzles and openings from Lichess (CC0). Engine: Stockfish.</footer>}
      </main>
      <Toasts />
      <Announcer />
    </div>
  );
}
