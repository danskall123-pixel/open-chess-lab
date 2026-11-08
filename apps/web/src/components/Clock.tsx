import { useEffect, useState } from 'react';

export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  if (safe < 10_000) return `${minutes}:${pad(seconds)}.${Math.floor((safe % 1000) / 100)}`;
  return `${minutes}:${pad(seconds)}`;
}

export interface ClockProps {
  ms: number;
  running: boolean;
  receivedAt: number;
  latencyMs: number;
}

export function Clock({ ms, running, receivedAt, latencyMs }: ClockProps) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [running]);

  const displayed = running ? ms - Math.max(0, now - receivedAt) - latencyMs : ms;
  const urgency = displayed < 10_000 ? 'low' : displayed < 30_000 ? 'warn' : 'ok';
  return (
    <div className={`clock ${running ? 'running' : ''} clock-${urgency}`} role="timer">
      {formatClock(displayed)}
    </div>
  );
}
