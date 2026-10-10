import { positionKey } from '../chess/util';

type Book = Record<string, 0 | [string, string]>;
let book: Book | null = null;
let loading: Promise<Book> | null = null;

export function loadBook(fetcher: (u: string) => Promise<Book> = (u) => fetch(u).then((r) => r.json())): Promise<Book> {
  if (book) return Promise.resolve(book);
  if (!loading) loading = fetcher(`${(import.meta as any).env?.BASE_URL ?? '/'}data/openings.json`).then((b) => (book = b));
  return loading;
}
export function setBook(b: Book) { book = b; }
export function bookReady() { return !!book; }

/** True if the position (after a move) is a named or transit position in the opening book. */
export function inBook(fen: string): boolean {
  return !!book && positionKey(fen) in book;
}
export function openingName(fen: string): { eco: string; name: string } | null {
  const e = book?.[positionKey(fen)];
  return e ? { eco: e[0], name: e[1] } : null;
}
/** Walks a game's FENs (after each ply) and returns the deepest named opening and the ply where theory ended. */
export function openingSummary(fens: string[]): { eco: string; name: string; leftAtPly: number | null } | null {
  let last: { eco: string; name: string } | null = null;
  let left: number | null = null;
  for (let i = 0; i < fens.length; i++) {
    if (!inBook(fens[i])) { left = i; break; }
    const n = openingName(fens[i]);
    if (n) last = n;
  }
  return last ? { ...last, leftAtPly: left } : null;
}
