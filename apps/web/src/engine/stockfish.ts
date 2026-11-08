import type { EngineLine } from './uci';
import { parseBestMove, parseInfoLine, sideToMoveOf } from './uci';

export interface SearchOptions {
  fen: string;
  depth?: number;
  movetimeMs?: number;
  multiPv?: number;
  skillLevel?: number;
  onUpdate?: (lines: EngineLine[]) => void;
  signal?: AbortSignal;
}

export interface SearchResult {
  bestMove: string | null;
  lines: EngineLine[];
}

const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js';
const MAX_SKILL_LEVEL = 20;

type LineHandler = (line: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private handler: LineHandler | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private searching = false;

  search(options: SearchOptions): Promise<SearchResult> {
    this.stop();
    const job = this.queue.then(() => this.runSearch(options));
    this.queue = job.catch(() => undefined);
    return job;
  }

  stop(): void {
    if (this.searching) this.post('stop');
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
  }

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker(ENGINE_URL);
    this.worker.addEventListener('message', (event: MessageEvent<string>) => {
      const line = typeof event.data === 'string' ? event.data : String(event.data);
      this.handler?.(line);
    });
    this.ready = (async () => {
      await this.command('uci', (line) => line === 'uciok');
      this.post('setoption name Hash value 32');
      await this.command('isready', (line) => line === 'readyok');
    })();
    return this.ready;
  }

  private command(text: string, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      this.handler = (line) => {
        if (!done(line)) return;
        this.handler = null;
        resolve();
      };
      this.post(text);
    });
  }

  private post(text: string): void {
    this.worker?.postMessage(text);
  }

  private async runSearch(options: SearchOptions): Promise<SearchResult> {
    await this.boot();
    if (options.signal?.aborted) return { bestMove: null, lines: [] };

    const multiPv = options.multiPv ?? 1;
    this.post(`setoption name MultiPV value ${multiPv}`);
    this.post(`setoption name Skill Level value ${options.skillLevel ?? MAX_SKILL_LEVEL}`);
    await this.command('isready', (line) => line === 'readyok');

    const sideToMove = sideToMoveOf(options.fen);
    const lines = new Map<number, EngineLine>();
    const onAbort = () => this.stop();
    options.signal?.addEventListener('abort', onAbort);

    try {
      return await new Promise<SearchResult>((resolve) => {
        this.handler = (line) => {
          const info = parseInfoLine(line, sideToMove);
          if (info) {
            lines.set(info.multipv, info);
            options.onUpdate?.(sortedLines(lines));
            return;
          }
          const bestMove = parseBestMove(line);
          if (bestMove === undefined) return;
          this.handler = null;
          this.searching = false;
          resolve({ bestMove, lines: sortedLines(lines) });
        };
        this.post(`position fen ${options.fen}`);
        this.searching = true;
        this.post(goCommand(options));
      });
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}

function sortedLines(lines: Map<number, EngineLine>): EngineLine[] {
  return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
}

function goCommand(options: SearchOptions): string {
  const parts = ['go'];
  if (options.depth !== undefined) parts.push('depth', String(options.depth));
  if (options.movetimeMs !== undefined) parts.push('movetime', String(options.movetimeMs));
  if (parts.length === 1) parts.push('depth', '18');
  return parts.join(' ');
}

export const engine = new StockfishEngine();
