import { type ReactNode, useEffect, useRef, useState } from 'react';

/** One point of a time series. */
export interface SeriesPoint {
  /** Time, in epoch milliseconds. */
  t: number;
  /** Height on the y axis, geometry only (see `chartNumber`); null is a gap: the line breaks. */
  y: number | null;
  /** Drawn dashed: the value is known to be incomplete. */
  uncertain?: boolean;
  /** A hollow marker on the line: something happened here (e.g. a wallet was added). */
  marked?: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TICK_STEPS = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
const MARGIN = { top: 10, right: 12, bottom: 24, left: 56 };

const hourLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** Round tick values covering [min, max], about `count` of them (1, 2, 2.5, or 5 × 10ⁿ apart). */
function niceTicks(min: number, max: number, count: number): number[] {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) as number;
  const ticks: number[] = [];
  for (let k = Math.floor(lo / step); k * step <= Math.ceil(hi / step) * step + step / 2; k++) {
    ticks.push(Number((k * step).toPrecision(12)));
  }
  return ticks;
}

/** Ticks on round local times (hours, or midnights), at most `max` of them. */
function timeTicks(from: number, to: number, max: number): { t: number; label: string }[] {
  const step = TICK_STEPS.find((s) => (to - from) / s <= max) ?? (TICK_STEPS.at(-1) as number);
  const d = new Date(from);
  const ticks: { t: number; label: string }[] = [];
  if (step < DAY) {
    const hours = step / HOUR;
    d.setMinutes(0, 0, 0);
    while (d.getTime() < from || d.getHours() % hours !== 0) d.setHours(d.getHours() + 1);
    for (; d.getTime() <= to; d.setHours(d.getHours() + hours)) {
      const midnight = d.getHours() === 0;
      ticks.push({ t: d.getTime(), label: midnight ? dayLabel.format(d) : hourLabel.format(d) });
    }
  } else {
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < from) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= to; d.setDate(d.getDate() + step / DAY)) {
      ticks.push({ t: d.getTime(), label: dayLabel.format(d) });
    }
  }
  return ticks;
}

/** The width an element is laid out at, kept current. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A single-series line over time (dataviz: 2px line, a 10% wash, hairline grid, a crosshair that
 * snaps to the nearest point). Gaps break the line, and a lone point between gaps is a dot.
 * Mouse-only: pair it with a table of the values.
 */
export function TimeSeries({
  points,
  domain,
  label,
  formatY,
  tooltip,
  height = 200,
  color = 'var(--color-series-1)',
}: {
  points: SeriesPoint[];
  /** The x range to show, in epoch ms (the requested range, even where there's no data). */
  domain: [number, number];
  /** What the chart shows, for screen readers. */
  label: string;
  formatY: (tick: number) => string;
  /** What to show for the point at `index` under the crosshair. */
  tooltip: (index: number) => ReactNode;
  height?: number;
  color?: string;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const ys = points.flatMap((p) => (p.y === null ? [] : [p.y]));
  const yTicks = ys.length > 0 ? niceTicks(Math.min(...ys), Math.max(...ys), 4) : [0, 1];
  const [y0, y1] = [yTicks[0] as number, yTicks.at(-1) as number];
  const [t0, t1] = domain;
  const x = (t: number) => MARGIN.left + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => MARGIN.top + plotH - (y1 === y0 ? 0.5 : (v - y0) / (y1 - y0)) * plotH;
  const bottom = MARGIN.top + plotH;

  // Edges between neighboring points with values, grouped into runs of the same style.
  const runs: { uncertain: boolean; from: number; to: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a?.y == null || b?.y == null) continue;
    const uncertain = Boolean(a.uncertain || b.uncertain);
    const last = runs.at(-1);
    if (last && last.to === i - 1 && last.uncertain === uncertain) last.to = i;
    else runs.push({ uncertain, from: i - 1, to: i });
  }
  const pathOf = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.y as number).toFixed(1)}`)
      .join(' ');
  // The wash sits under every unbroken stretch, whatever its style.
  const stretches: { from: number; to: number }[] = [];
  for (const r of runs) {
    const last = stretches.at(-1);
    if (last && last.to === r.from) last.to = r.to;
    else stretches.push({ from: r.from, to: r.to });
  }
  const lone = points.flatMap((p, i) =>
    p.y !== null && points[i - 1]?.y == null && points[i + 1]?.y == null ? [i] : [],
  );

  const times = points.map((p) => p.t);
  const nearest = (t: number) => {
    let best = 0;
    for (let i = 1; i < times.length; i++) {
      if (Math.abs((times[i] as number) - t) < Math.abs((times[best] as number) - t)) best = i;
    }
    return best;
  };
  const current = active === null ? null : points[active];

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - box.left;
            if (px < MARGIN.left - 8 || px > width - MARGIN.right + 8 || points.length === 0) {
              setActive(null);
              return;
            }
            setActive(nearest(t0 + ((px - MARGIN.left) / Math.max(1, plotW)) * (t1 - t0)));
          }}
          onPointerLeave={() => setActive(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-border)"
                strokeOpacity={0.6}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted text-[11px] tabular-nums"
              >
                {formatY(tick)}
              </text>
            </g>
          ))}
          {timeTicks(t0, t1, Math.max(2, Math.floor(plotW / 90))).map((tick) => (
            <text
              key={tick.t}
              x={x(tick.t)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted text-[11px]"
            >
              {tick.label}
            </text>
          ))}
          {stretches.map((s) => (
            <path
              key={`wash-${s.from}`}
              d={`${pathOf(s.from, s.to)} L ${x((points[s.to] as SeriesPoint).t).toFixed(1)} ${bottom} L ${x((points[s.from] as SeriesPoint).t).toFixed(1)} ${bottom} Z`}
              fill={color}
              fillOpacity={0.1}
            />
          ))}
          {runs.map((r) => (
            <path
              key={`line-${r.from}`}
              d={pathOf(r.from, r.to)}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={r.uncertain ? '4 4' : undefined}
              strokeOpacity={r.uncertain ? 0.7 : 1}
            />
          ))}
          {lone.map((i) => (
            <circle
              key={`lone-${i}`}
              cx={x((points[i] as SeriesPoint).t)}
              cy={y((points[i] as SeriesPoint).y as number)}
              r={2.5}
              fill={color}
            />
          ))}
          {points.map((p, i) =>
            p.marked && p.y !== null ? (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: points are a fixed grid; the index is the point.
                key={`mark-${i}`}
                cx={x(p.t)}
                cy={y(p.y)}
                r={4}
                fill="var(--color-surface)"
                stroke="var(--color-fg)"
                strokeOpacity={0.8}
                strokeWidth={1.5}
              />
            ) : null,
          )}
          {current && (
            <g pointerEvents="none">
              <line
                x1={x(current.t)}
                x2={x(current.t)}
                y1={MARGIN.top}
                y2={bottom}
                stroke="var(--color-muted)"
                strokeOpacity={0.6}
              />
              {current.y !== null && (
                <circle
                  cx={x(current.t)}
                  cy={y(current.y)}
                  r={4}
                  fill={color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>
      )}
      {current && active !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-border bg-canvas px-3 py-2 text-xs shadow-lg"
          style={{
            left: x(current.t),
            top: MARGIN.top,
            transform:
              x(current.t) > width * 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          {tooltip(active)}
        </div>
      )}
    </div>
  );
}
