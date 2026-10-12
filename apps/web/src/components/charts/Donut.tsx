/** One slice of a donut. */
export interface DonutSegment {
  key: string;
  label: string;
  /** Share of the whole, 0–1. Geometry only: see `shareFraction` in lib/format. */
  fraction: number;
  /** A CSS color, e.g. `var(--color-series-1)`. */
  color: string;
  /** Shown in the center while the slice is active: e.g. "42.1%" and "$3,471.94". */
  shareText: string;
  valueText: string;
  /** Clicking the slice calls `onSelect` (e.g. to open what's inside it). */
  selectable?: boolean;
}

const TAU = Math.PI * 2;
/** Surface gap between neighboring slices, in pixels (dataviz: 2px, never a stroke). */
const GAP_PX = 2;
/** A thin slice's hover target is still at least this wide at mid-ring (dataviz: hit > mark). */
const MIN_HIT_PX = 12;
/** Hover targets reach this far past the ring on both sides. */
const HIT_PAD_PX = 6;

/**
 * A donut chart for part-to-whole at a glance. Always pair it with a table of exact values: the
 * table is the legend, and the keyboard and screen-reader view (the slices themselves are
 * mouse-only). Hover a slice, or set `active` from the table, to read it in the center; click a
 * selectable slice to open it.
 */
export function Donut({
  segments,
  label,
  centerLabel,
  centerValue,
  active,
  onActiveChange,
  onSelect,
  size = 184,
  thickness = 24,
}: {
  segments: DonutSegment[];
  /** What the chart shows, for screen readers. */
  label: string;
  centerLabel: string;
  centerValue: string;
  active: string | null;
  onActiveChange: (key: string | null) => void;
  onSelect?: (key: string) => void;
  size?: number;
  thickness?: number;
}) {
  const c = size / 2;
  const outer = c - 4; // room for the active slice to grow
  const inner = outer - thickness;
  const middle = (outer + inner) / 2;
  const pad = GAP_PX / middle; // the gap as an angle at mid-ring
  const minHit = MIN_HIT_PX / middle;
  const drawn = segments.filter((s) => s.fraction > 0);
  const current = drawn.find((s) => s.key === active) ?? null;

  const at = (radius: number, angle: number) =>
    `${(c + radius * Math.sin(angle)).toFixed(3)} ${(c - radius * Math.cos(angle)).toFixed(3)}`;
  const arc = (start: number, end: number, from: number, to: number) => {
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${at(to, start)} A ${to} ${to} 0 ${large} 1 ${at(to, end)} L ${at(from, end)} A ${from} ${from} 0 ${large} 0 ${at(from, start)} Z`;
  };

  let angle = 0;
  const slices = drawn.map((s) => {
    const start = angle;
    angle += s.fraction * TAU;
    return { ...s, start, end: angle };
  });
  // Hover targets: thin slices are widened, and drawn last so they sit on top of their neighbors.
  const targets = [...slices]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .map((s) => {
      const grow = Math.max(0, (minHit - (s.end - s.start)) / 2);
      return { ...s, start: s.start - grow, end: s.end + grow };
    });
  const select = (s: DonutSegment) => (s.selectable && onSelect ? onSelect(s.key) : undefined);
  const only = slices.length === 1 ? slices[0] : undefined;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        onMouseLeave={() => onActiveChange(null)}
      >
        {only ? (
          // One slice is the whole ring; a path can't draw a full circle.
          <circle
            cx={c}
            cy={c}
            r={middle}
            fill="none"
            stroke={only.color}
            strokeWidth={thickness}
            pointerEvents="none"
          />
        ) : (
          slices.map((s) => {
            const isActive = s.key === active;
            // Too thin to survive the gap: still drawn, without one, so nothing silently vanishes.
            const gap = s.end - s.start > pad * 2 ? pad / 2 : 0;
            return (
              <path
                key={s.key}
                d={arc(s.start + gap, s.end - gap, inner, outer + (isActive ? 3 : 0))}
                fill={s.color}
                opacity={active && !isActive ? 0.45 : 1}
                className="transition-opacity"
                pointerEvents="none"
              />
            );
          })
        )}
        {only ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only extra; the table beside every donut carries the same values and actions for keyboard and screen readers.
          <circle
            cx={c}
            cy={c}
            r={middle}
            fill="none"
            stroke="transparent"
            strokeWidth={thickness + HIT_PAD_PX * 2}
            className={only.selectable ? 'cursor-pointer' : undefined}
            onMouseEnter={() => onActiveChange(only.key)}
            onClick={() => select(only)}
          />
        ) : (
          targets.map((s) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only extra; the table beside every donut carries the same values and actions for keyboard and screen readers.
            <path
              key={s.key}
              d={arc(s.start, s.end, inner - HIT_PAD_PX, outer + HIT_PAD_PX)}
              fill="transparent"
              className={s.selectable ? 'cursor-pointer' : undefined}
              onMouseEnter={() => onActiveChange(s.key)}
              onClick={() => select(s)}
            />
          ))
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="max-w-full truncate text-xs text-muted">
          {current ? current.label : centerLabel}
        </span>
        <span className="mt-0.5 text-sm font-semibold">
          {current ? current.shareText : centerValue}
        </span>
        {current && <span className="text-xs text-muted">{current.valueText}</span>}
      </div>
    </div>
  );
}
