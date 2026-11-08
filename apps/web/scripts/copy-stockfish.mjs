import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const engineScript = require.resolve('stockfish/bin/stockfish-19-lite-single.js');
const engineDirectory = dirname(engineScript);
const targetDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stockfish');

mkdirSync(targetDirectory, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(engineDirectory, file), join(targetDirectory, file));
}
copyFileSync(join(engineDirectory, '..', 'Copying.txt'), join(targetDirectory, 'COPYING.txt'));
console.info(`Copied Stockfish into ${targetDirectory}`);
