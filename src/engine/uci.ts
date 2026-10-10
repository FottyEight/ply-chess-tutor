// Pure UCI parsing + the Engine queue. Works with any transport (Web Worker in the
// browser, child process in Node tests) so the exact same code is tested and shipped.

export interface Line {
  multipv: number;
  depth: number;
  /** centipawns from the side-to-move's point of view (null if mate) */
  cp: number | null;
  /** mate in N from side-to-move's POV: positive = side to move mates */
  mate: number | null;
  pv: string[];
}

export interface Analysis {
  fen: string;
  depth: number;
  lines: Line[];
  timeMs: number;
  bestmove: string | null;
  nodes: number;
}

export function parseInfo(line: string): (Line & { nodes: number; time: number }) | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const tok = line.split(' ');
  let depth = 0, multipv = 1, cp: number | null = null, mate: number | null = null, nodes = 0, time = 0;
  let bound = false;
  let i = 1;
  for (; i < tok.length; i++) {
    const t = tok[i];
    if (t === 'depth') depth = Number(tok[++i]);
    else if (t === 'multipv') multipv = Number(tok[++i]);
    else if (t === 'nodes') nodes = Number(tok[++i]);
    else if (t === 'time') time = Number(tok[++i]);
    else if (t === 'score') {
      const kind = tok[++i];
      const v = Number(tok[++i]);
      if (kind === 'cp') cp = v; else mate = v;
      if (tok[i + 1] === 'lowerbound' || tok[i + 1] === 'upperbound') { bound = true; i++; }
    } else if (t === 'pv') { i++; break; }
  }
  if (bound) return null;
  return { depth, multipv, cp, mate, pv: tok.slice(i).filter(Boolean), nodes, time };
}

export interface Transport {
  post(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface AnalyseOpts {
  multipv?: number;
  depth?: number;
  movetime?: number;
  searchmoves?: string[];
  skill?: number; // 0..20, default 20
  onUpdate?: (a: Analysis) => void;
}

interface Job {
  fen: string;
  opts: AnalyseOpts;
  resolve: (a: Analysis) => void;
  reject: (e: Error) => void;
  cancelled: boolean;
}

export class Engine {
  private t: Transport;
  private ready: Promise<void>;
  private queue: Job[] = [];
  private current: Job | null = null;
  private lines = new Map<number, Line>();
  private nodes = 0;
  private start = 0;
  private listeners: ((l: string) => void)[] = [];
  private state = { multipv: -1, skill: -1 };
  name = '';

  constructor(t: Transport) {
    this.t = t;
    t.onLine((l) => this.handle(l));
    this.ready = new Promise((res) => {
      const onUciok = (l: string) => {
        if (l.startsWith('id name')) this.name = l.slice(8);
        if (l === 'uciok') {
          this.listeners = this.listeners.filter((x) => x !== onUciok);
          t.post('setoption name Hash value 16');
          this.waitFor('readyok').then(res);
          t.post('isready');
        }
      };
      this.listeners.push(onUciok);
    });
    t.post('uci');
  }

  private waitFor(token: string) {
    return new Promise<void>((res) => {
      const f = (l: string) => { if (l === token) { this.listeners = this.listeners.filter((x) => x !== f); res(); } };
      this.listeners.push(f);
    });
  }

  whenReady() { return this.ready; }

  private handle(l: string) {
    for (const f of [...this.listeners]) f(l);
    const job = this.current;
    if (!job) return;
    const info = parseInfo(l);
    if (info) {
      this.nodes = info.nodes;
      this.lines.set(info.multipv, { multipv: info.multipv, depth: info.depth, cp: info.cp, mate: info.mate, pv: info.pv });
      if (job.opts.onUpdate && info.multipv === 1 && !job.cancelled) job.opts.onUpdate(this.snapshot(job, null));
    } else if (l.startsWith('bestmove')) {
      const best = l.split(' ')[1];
      const a = this.snapshot(job, best && best !== '(none)' ? best : null);
      this.current = null;
      if (!job.cancelled) job.resolve(a); else job.reject(new Error('cancelled'));
      this.next();
    }
  }

  private snapshot(job: Job, bestmove: string | null): Analysis {
    const lines = [...this.lines.values()].sort((a, b) => a.multipv - b.multipv);
    // keep only lines at the deepest completed depth of line 1 (shallower lines are from previous iterations)
    return { fen: job.fen, depth: lines[0]?.depth ?? 0, lines, timeMs: Date.now() - this.start, bestmove, nodes: this.nodes };
  }

  analyse(fen: string, opts: AnalyseOpts = {}): Promise<Analysis> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, opts, resolve, reject, cancelled: false });
      if (!this.current) this.next();
    });
  }

  /** Cancels queued and running jobs (their promises reject with 'cancelled'). */
  cancelAll() {
    for (const j of this.queue) { j.cancelled = true; j.reject(new Error('cancelled')); }
    this.queue = [];
    if (this.current) { this.current.cancelled = true; this.t.post('stop'); }
  }

  private async next() {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    await this.ready;
    const { multipv = 1, depth, movetime, searchmoves, skill = 20 } = job.opts;
    if (this.state.multipv !== multipv) { this.t.post(`setoption name MultiPV value ${multipv}`); this.state.multipv = multipv; }
    if (this.state.skill !== skill) { this.t.post(`setoption name Skill Level value ${skill}`); this.state.skill = skill; }
    this.lines.clear();
    this.nodes = 0;
    this.start = Date.now();
    this.t.post(`position fen ${job.fen}`);
    let go = 'go';
    if (depth) go += ` depth ${depth}`;
    if (movetime) go += ` movetime ${movetime}`;
    if (!depth && !movetime) go += ' depth 12';
    if (searchmoves?.length) go += ` searchmoves ${searchmoves.join(' ')}`;
    this.t.post(go);
  }

  newGame() { this.t.post('ucinewgame'); }
  terminate() { this.t.terminate(); }
}
