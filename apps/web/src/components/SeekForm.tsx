import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateSeekRequest, SeekColor, TimeControl } from '@open-chess-lab/shared';
import {
  TIME_CONTROL_PRESETS,
  formatTimeControl,
  speedOf,
  timeControlKey,
} from '@open-chess-lab/shared';

export interface SeekFormProps {
  isInvite: boolean;
  canPlayRated: boolean;
  submitLabel: string;
  busy: boolean;
  onSubmit: (request: CreateSeekRequest) => void;
}

const DEFAULT_TIME_CONTROL: TimeControl = { initialSeconds: 300, incrementSeconds: 3 };

function parseBound(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function SeekForm({ isInvite, canPlayRated, submitLabel, busy, onSubmit }: SeekFormProps) {
  const [timeKey, setTimeKey] = useState(timeControlKey(DEFAULT_TIME_CONTROL));
  const [rated, setRated] = useState(canPlayRated);
  const [color, setColor] = useState<SeekColor>('random');
  const [ratingMin, setRatingMin] = useState('');
  const [ratingMax, setRatingMax] = useState('');
  const timeControl =
    TIME_CONTROL_PRESETS.find((preset) => timeControlKey(preset) === timeKey) ??
    DEFAULT_TIME_CONTROL;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      timeControl,
      rated: rated && canPlayRated,
      color,
      ratingMin: isInvite ? null : parseBound(ratingMin),
      ratingMax: isInvite ? null : parseBound(ratingMax),
      isInvite,
    });
  };

  return (
    <form className="form seek-form" onSubmit={submit}>
      <label className="field">
        <span>Time control</span>
        <select value={timeKey} onChange={(event) => setTimeKey(event.target.value)}>
          {TIME_CONTROL_PRESETS.map((preset) => (
            <option key={timeControlKey(preset)} value={timeControlKey(preset)}>
              {formatTimeControl(preset)} · {speedOf(preset)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="segmented" aria-label="Rated or casual">
        <button type="button" className={!rated ? 'selected' : ''} onClick={() => setRated(false)}>
          Casual
        </button>
        <button
          type="button"
          className={rated ? 'selected' : ''}
          onClick={() => setRated(true)}
          disabled={!canPlayRated}
          title={canPlayRated ? undefined : 'Create an account to play rated games'}
        >
          Rated
        </button>
      </fieldset>
      <fieldset className="segmented" aria-label="Your color">
        {(['white', 'random', 'black'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={color === option ? 'selected' : ''}
            onClick={() => setColor(option)}
          >
            {option === 'white' ? '♔ White' : option === 'black' ? '♚ Black' : '⚄ Random'}
          </button>
        ))}
      </fieldset>
      {!isInvite && rated && (
        <div className="field-row">
          <label className="field">
            <span>Min rating</span>
            <input
              type="number"
              min={400}
              max={3500}
              step={50}
              value={ratingMin}
              placeholder="any"
              onChange={(event) => setRatingMin(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Max rating</span>
            <input
              type="number"
              min={400}
              max={3500}
              step={50}
              value={ratingMax}
              placeholder="any"
              onChange={(event) => setRatingMax(event.target.value)}
            />
          </label>
        </div>
      )}
      <button type="submit" className="button primary" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
