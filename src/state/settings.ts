import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './storage';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  board: 'slate' | 'walnut' | 'moss';
  sound: boolean;
  haptics: boolean;
  coords: boolean;
  warn: boolean;
  checklist: boolean;
  aiExplain: boolean;
  set: (p: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(persist((set) => ({
  theme: 'system', board: 'slate', sound: false, haptics: true, coords: true, warn: false, checklist: false, aiExplain: false,
  set: (p) => set(p),
}), { name: 'ply:settings', storage: createJSONStorage(() => zustandStorage) }));

export function applyTheme(s: Pick<Settings, 'theme' | 'board'>) {
  const el = document.documentElement;
  if (s.theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', s.theme);
  el.setAttribute('data-board', s.board);
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#15191e' : '#eceeec');
}
