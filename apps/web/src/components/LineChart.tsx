import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';

export interface ChartPoint {
  label: string;
  value: number;
  valueLabel: string;
  marker?: 'warning' | 'critical';
}

export interface LineChartProps {
  points: readonly ChartPoint[];
  ariaLabel: string;
  height?: number;
  yDomain?: readonly [number, number];
  baseline?: number;
  fillToBaseline?: boolean;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  formatTick?: (value: number) => string;
}

const PADDING = { top: 12, right: 12, bottom: 22, left: 44 };
const TICK_COUNT = 4;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(200, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function niceDomain(values: readonly number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(10, (max - min) * 0.1);
  return [Math.floor((min - padding) / 10) * 10, Math.ceil((max + padding) / 10) * 10];
}

export function LineChart({
  points,
  ariaLabel,
  height = 180,
  yDomain,
  baseline,
  fillToBaseline = false,
  selectedIndex,
  onSelect,
  formatTick = (value) => String(Math.round(value)),
}: LineChartProps) {
  const [containerRef, width] = useWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return <div className="chart empty-state">No data yet.</div>;
  }

  const [minY, maxY] = yDomain ?? niceDomain(points.map((point) => point.value));
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const xOf = (index: number) =>
    PADDING.left +
    (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yOf = (value: number) =>
    PADDING.top +
    (1 - (Math.min(maxY, Math.max(minY, value)) - minY) / (maxY - minY || 1)) * plotHeight;

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(index)},${yOf(point.value)}`)
    .join(' ');
  const baseY = yOf(baseline ?? minY);
  const areaPath = `${linePath} L${xOf(points.length - 1)},${baseY} L${xOf(0)},${baseY} Z`;
  const ticks = Array.from(
    { length: TICK_COUNT + 1 },
    (_, index) => minY + ((maxY - minY) * index) / TICK_COUNT,
  );

  const indexAt = (event: MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    return Math.round(Math.min(1, Math.max(0, ratio)) * (points.length - 1));
  };

  const focusIndex = hoverIndex ?? selectedIndex ?? null;
  const focusPoint = focusIndex === null ? null : points[focusIndex];
  const tooltipLeft =
    focusIndex === null ? 0 : Math.min(width - 150, Math.max(0, xOf(focusIndex) - 70));

  return (
    <div className="chart" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid"
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
            />
            <text className="chart-tick" x={PADDING.left - 6} y={yOf(tick) + 4} textAnchor="end">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {baseline !== undefined && (
          <line
            className="chart-baseline"
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={baseY}
            y2={baseY}
          />
        )}
        {fillToBaseline && <path className="chart-area" d={areaPath} />}
        <path className="chart-line" d={linePath} />
        {points.map((point, index) =>
          point.marker ? (
            <circle
              key={index}
              className={`chart-marker chart-marker-${point.marker}`}
              cx={xOf(index)}
              cy={yOf(point.value)}
              r={4}
            />
          ) : null,
        )}
        {focusIndex !== null && focusPoint && (
          <g>
            <line
              className="chart-crosshair"
              x1={xOf(focusIndex)}
              x2={xOf(focusIndex)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
            />
            <circle className="chart-focus" cx={xOf(focusIndex)} cy={yOf(focusPoint.value)} r={4} />
          </g>
        )}
        <rect
          className="chart-hit"
          x={PADDING.left}
          y={0}
          width={plotWidth}
          height={height}
          onPointerMove={(event) => setHoverIndex(indexAt(event))}
          onPointerLeave={() => setHoverIndex(null)}
          onClick={(event) => onSelect?.(indexAt(event))}
        />
      </svg>
      {hoverIndex !== null && focusPoint && (
        <div className="chart-tooltip" style={{ left: tooltipLeft }}>
          <div className="chart-tooltip-label">{focusPoint.label}</div>
          <div className="chart-tooltip-value">{focusPoint.valueLabel}</div>
        </div>
      )}
    </div>
  );
}
