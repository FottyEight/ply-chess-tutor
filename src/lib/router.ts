import { useEffect, useState } from 'react';

/** Minimal hash router: works on any static host without rewrites. */
export function navigate(path: string) {
  if (location.hash !== '#' + path) location.hash = path;
}
export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#/, '') || '/tutor').split('/').filter(Boolean);
  const [r, setR] = useState(read);
  useEffect(() => {
    const on = () => { setR(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
