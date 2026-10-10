import { useProgress } from './progress';
import { useUI } from './ui';

export const ACHIEVEMENTS: Record<string, { title: string; body: string }> = {
  'first-puzzle': { title: 'First puzzle', body: 'Solved your first puzzle.' },
  'puzzles-100': { title: 'Hundred puzzles', body: 'Solved 100 puzzles.' },
  'puzzles-500': { title: 'Five hundred puzzles', body: 'Solved 500 puzzles.' },
  'rating-1100': { title: 'Puzzle rating 1100', body: 'Your puzzle rating reached 1100.' },
  'rating-1200': { title: 'Puzzle rating 1200', body: 'Your puzzle rating reached 1200.' },
  'rating-1400': { title: 'Puzzle rating 1400', body: 'Your puzzle rating reached 1400.' },
  'streak-3': { title: 'Three-day streak', body: 'Met your daily goal three days running.' },
  'streak-7': { title: 'Week-long streak', body: 'Met your daily goal seven days running.' },
  'first-win': { title: 'First win', body: 'Won a game against the engine.' },
  'first-brilliant': { title: 'Brilliant', body: 'Played a move the coach rated Brilliant.' },
  'accuracy-80': { title: 'Clean game', body: 'Finished a game with 80% accuracy or better.' },
  'rush-15': { title: 'Rush 15', body: 'Scored 15 in Puzzle Rush.' },
  'lessons-5': { title: 'Five lessons', body: 'Completed five lessons.' },
  'placement': { title: 'Placed', body: 'Finished the placement quiz.' },
  // game challenges
  'ch-win-back': { title: 'Win a piece back', body: 'Came back from a piece down to level material.' },
  'ch-survive-20': { title: 'Survive 20 moves', body: 'Reached move 20 against Club level or stronger without losing.' },
  'ch-mate-15': { title: 'Quick checkmate', body: 'Checkmated the engine in under 15 moves.' },
  'ch-no-hang-10': { title: 'Nothing hanging', body: 'Played 10 moves in a row without leaving a piece en prise.' },
  'ch-good-5': { title: 'Five good moves', body: 'Played 5 consecutive Good-or-better moves.' },
};

export const CHALLENGES = ['ch-win-back', 'ch-survive-20', 'ch-mate-15', 'ch-no-hang-10', 'ch-good-5'];

export function unlock(id: string) {
  if (useProgress.getState().unlock(id)) {
    const a = ACHIEVEMENTS[id];
    if (a) useUI.getState().toast(a.title, a.body);
  }
}
