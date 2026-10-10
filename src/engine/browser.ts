import { Engine, type Transport } from './uci';

function workerTransport(url: string): Transport {
  const w = new Worker(url);
  let cb: (l: string) => void = () => {};
  w.onmessage = (e) => {
    const data = typeof e.data === 'string' ? e.data : String(e.data);
    for (const line of data.split('\n')) if (line) cb(line.trim());
  };
  return { post: (c) => w.postMessage(c), onLine: (f) => (cb = f), terminate: () => w.terminate() };
}

let shared: Engine | null = null;
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

/** One engine instance for the whole app: phones have little memory and 1–2 fast cores. */
export function getEngine(): Engine {
  if (!shared) shared = new Engine(workerTransport(ENGINE_URL));
  return shared;
}

/** True on phone-class devices: used to pick analysis time budgets. */
export const isPhoneClass = () =>
  typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency ?? 4) <= 4 || /Android|iPhone|iPad/i.test(navigator.userAgent));
