import { create } from 'zustand';

interface Toast { id: number; title: string; body?: string }
interface UI {
  toasts: Toast[];
  announcement: string;
  toast: (title: string, body?: string) => void;
  dismiss: (id: number) => void;
  announce: (msg: string) => void;
}
let n = 0;
export const useUI = create<UI>((set, get) => ({
  toasts: [],
  announcement: '',
  toast: (title, body) => {
    const id = ++n;
    set({ toasts: [...get().toasts, { id, title, body }].slice(-3) });
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  // toggling text forces screen readers to re-read identical messages
  announce: (msg) => set({ announcement: get().announcement === msg ? msg + ' ' : msg }),
}));
