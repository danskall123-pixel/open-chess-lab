import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import type { EngineScore } from '@open-chess-lab/shared';
import { colorFromTurn, parseUciScore } from '@open-chess-lab/shared';

export interface EngineEvaluation {
  score: EngineScore;
  bestMoveUci: string | null;
}

type LineListener = (line: string) => void;

const SCORE_PATTERN = /\bscore (cp|mate) (-?\d+)/;
const MULTIPV_PATTERN = /\bmultipv (\d+)/;
const BESTMOVE_PATTERN = /^bestmove (\S+)/;
const ENGINE_TIMEOUT_MS = 60_000;

function defaultEnginePath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve('stockfish/bin/stockfish-19-lite-single.js');
}

export class UciEngine {
  private buffer = '';
  private readonly listeners = new Set<LineListener>();

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consume(chunk));
  }

  static async start(enginePath?: string): Promise<UciEngine> {
    const path = enginePath ?? defaultEnginePath();
    const child = path.endsWith('.js')
      ? spawn(process.execPath, [path], { stdio: 'pipe' })
      : spawn(path, [], { stdio: 'pipe' });
    const engine = new UciEngine(child);
    engine.send('uci');
    await engine.waitFor((line) => line === 'uciok');
    engine.send('setoption name Hash value 32');
    engine.send('isready');
    await engine.waitFor((line) => line === 'readyok');
    return engine;
  }

  async evaluate(fen: string, depth: number): Promise<EngineEvaluation> {
    const sideToMove = colorFromTurn(fen.split(' ')[1] === 'b' ? 'b' : 'w');
    let score: EngineScore = { kind: 'cp', value: 0 };
    const onInfo: LineListener = (line) => {
      const scoreMatch = SCORE_PATTERN.exec(line);
      const multipv = MULTIPV_PATTERN.exec(line)?.[1] ?? '1';
      if (scoreMatch?.[1] && scoreMatch[2] && multipv === '1') {
        score = parseUciScore(scoreMatch[1], Number(scoreMatch[2]), sideToMove);
      }
    };
    this.listeners.add(onInfo);
    try {
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
      const bestLine = await this.waitFor((line) => BESTMOVE_PATTERN.test(line));
      const bestMove = BESTMOVE_PATTERN.exec(bestLine)?.[1] ?? null;
      return { score, bestMoveUci: bestMove === '(none)' ? null : bestMove };
    } finally {
      this.listeners.delete(onInfo);
    }
  }

  quit(): void {
    if (this.child.exitCode === null) {
      this.send('quit');
      setTimeout(() => this.child.kill(), 1000).unref();
    }
  }

  private send(command: string): void {
    this.child.stdin.write(`${command}\n`);
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      for (const listener of [...this.listeners]) listener(line.trim());
    }
  }

  private waitFor(predicate: (line: string) => boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error('The engine did not answer in time'));
      }, ENGINE_TIMEOUT_MS);
      const listener: LineListener = (line) => {
        if (!predicate(line)) return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(line);
      };
      this.listeners.add(listener);
    });
  }
}
