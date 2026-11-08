import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import type { ImportedGame, PgnCollection } from '@open-chess-lab/shared';
import { describeImportedGame, parsePgnCollection, validateFenInput } from '@open-chess-lab/shared';
import { IMPORTED_GAME_ID, storeHandoffGame } from '../chess/handoff';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImportPage() {
  const navigate = useNavigate();
  const [pgnText, setPgnText] = useState('');
  const [collection, setCollection] = useState<PgnCollection | null>(null);
  const [selected, setSelected] = useState(0);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [fenText, setFenText] = useState('');
  const [fenError, setFenError] = useState<string | null>(null);

  const readPgn = (text: string) => {
    const parsed = parsePgnCollection(text);
    setSelected(0);
    if (parsed.games.length === 0) {
      setCollection(null);
      setPgnError(
        parsed.errors[0]?.error ?? 'No games were found. Paste a PGN with at least one game.',
      );
      return;
    }
    setPgnError(null);
    setCollection(parsed);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setPgnError('That file is larger than 5 MB.');
      return;
    }
    const text = await file.text();
    setPgnText(text);
    readPgn(text);
  };

  const open = (game: ImportedGame, path: string) => {
    storeHandoffGame({
      initialFen: game.initialFen,
      movesUci: game.moves.map((move) => move.uci),
      headers: game.headers,
    });
    void navigate(path);
  };

  const openFen = () => {
    const result = validateFenInput(fenText);
    if (!result.ok) {
      setFenError(result.error);
      return;
    }
    void navigate(`/analysis?fen=${encodeURIComponent(result.value)}`);
  };

  const game = collection?.games[selected];

  return (
    <div className="two-columns">
      <section className="panel">
        <h1>Import PGN</h1>
        <label className="field">
          <span>Paste one or more games</span>
          <textarea
            rows={10}
            value={pgnText}
            spellCheck={false}
            placeholder={
              '[Event "Casual game"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 Nc6 *'
            }
            onChange={(event) => setPgnText(event.target.value)}
          />
        </label>
        <div className="button-row">
          <button type="button" className="button primary" onClick={() => readPgn(pgnText)}>
            Read PGN
          </button>
          <label className="button ghost file-button">
            Upload .pgn file
            <input
              type="file"
              accept=".pgn,text/plain,application/x-chess-pgn"
              onChange={(event) => void onFile(event)}
            />
          </label>
        </div>
        {pgnError && <p className="error-text">{pgnError}</p>}
        {collection && (
          <div className="import-result">
            {collection.games.length > 1 && (
              <label className="field">
                <span>{collection.games.length} games found — pick one</span>
                <select
                  value={selected}
                  onChange={(event) => setSelected(Number(event.target.value))}
                >
                  {collection.games.map((entry, index) => (
                    <option key={index} value={index}>
                      {describeImportedGame(entry, index)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {game && (
              <div className="panel compact inset">
                <strong>{describeImportedGame(game, selected)}</strong>
                <span className="muted small">{game.moves.length} half-moves</span>
                <div className="button-row">
                  <button
                    type="button"
                    className="button primary"
                    disabled={game.moves.length === 0}
                    onClick={() => open(game, `/review/${IMPORTED_GAME_ID}`)}
                  >
                    Review game
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => open(game, '/analysis?from=handoff')}
                  >
                    Open in analysis
                  </button>
                </div>
              </div>
            )}
            {collection.errors.length > 0 && (
              <details className="errors">
                <summary>{collection.errors.length} game(s) could not be read</summary>
                <ul>
                  {collection.errors.map((entry) => (
                    <li key={entry.index}>{entry.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h1>Set up a position</h1>
        <label className="field">
          <span>Paste a FEN</span>
          <input
            value={fenText}
            spellCheck={false}
            placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
            onChange={(event) => {
              setFenText(event.target.value);
              setFenError(null);
            }}
          />
        </label>
        <button type="button" className="button primary" onClick={openFen}>
          Analyze position
        </button>
        {fenError && <p className="error-text">{fenError}</p>}
      </section>
    </div>
  );
}
