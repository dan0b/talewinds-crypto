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
}

const TAU = Math.PI * 2;
/** Surface gap between neighboring slices, in pixels (dataviz: 2px, never a stroke). */
const GAP_PX = 2;

/**
 * A donut chart for part-to-whole at a glance (at most six slices; fold the rest into "Other").
 * Always pair it with a table of exact values: the table is the legend, and the keyboard and
 * screen-reader view (the slices themselves are mouse-only). Hover a slice, or set `active` from
 * the table, to read it in the center.
 */
export function Donut({
  segments,
  label,
  centerLabel,
  centerValue,
  active,
  onActiveChange,
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
  size?: number;
  thickness?: number;
}) {
  const c = size / 2;
  const outer = c - 4; // room for the active slice to grow
  const inner = outer - thickness;
  const pad = GAP_PX / ((outer + inner) / 2); // the gap as an angle at mid-ring
  const drawn = segments.filter((s) => s.fraction > 0);
  const current = drawn.find((s) => s.key === active) ?? null;

  const at = (radius: number, angle: number) =>
    `${(c + radius * Math.sin(angle)).toFixed(3)} ${(c - radius * Math.cos(angle)).toFixed(3)}`;
  const arc = (start: number, end: number, grow: number) => {
    const r = outer + grow;
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${at(r, start)} A ${r} ${r} 0 ${large} 1 ${at(r, end)} L ${at(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${at(inner, start)} Z`;
  };

  let angle = 0;
  const slices = drawn.map((s) => {
    const start = angle;
    angle += s.fraction * TAU;
    return { ...s, start, end: angle };
  });

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
        {slices.length === 1 && slices[0] ? (
          // One slice is the whole ring; a path can't draw a full circle.
          <circle
            cx={c}
            cy={c}
            r={(outer + inner) / 2}
            fill="none"
            stroke={slices[0].color}
            strokeWidth={thickness}
          />
        ) : (
          slices.map((s) => {
            const isActive = s.key === active;
            const span = s.end - s.start;
            // Too thin to survive the gap: still drawn, without one, so nothing silently vanishes.
            const gap = span > pad * 2 ? pad / 2 : 0;
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: hover is a mouse-only extra; the table beside every donut carries the same values for keyboard and screen readers.
              <path
                key={s.key}
                d={arc(s.start + gap, s.end - gap, isActive ? 3 : 0)}
                fill={s.color}
                opacity={active && !isActive ? 0.45 : 1}
                className="transition-opacity"
                onMouseEnter={() => onActiveChange(s.key)}
              />
            );
          })
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
