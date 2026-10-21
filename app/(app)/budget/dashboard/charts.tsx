"use client";
// Hand-built SVG charts for the Budget Dashboard (spec §8.2; no chart library).
// Follows the dataviz skill: thin bars (<= 24px) with a 4px rounded data end and a square
// baseline, 2px surface gaps between touching marks, hairline recessive axes, text in text
// tokens (never the series colour), a legend for >= 2 series, a per-mark hover/focus tooltip,
// and an SVG <title> on every mark so no value depends on hover. Data comes from rollup helpers
// (sectionSummaries / topSections / classificationTotals / monthlyTotals) via the page.
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { compactPeso } from "@/lib/saao/dashboard";
import { cn } from "@/lib/utils";

// Validated categorical slots (dataviz reference palette), light and dark steps, plus chrome.
// Light slots 3/4 sit under 3:1 on white: every chart here carries visible labels or a value table.
const VIZ_VARS = cn(
  "[--s1:#2a78d6] [--s2:#eb6834] [--s3:#1baf7a] [--s4:#eda100] [--s5:#e87ba4] [--s6:#008300] [--s7:#6250d6]",
  "[--s-other:#898781] [--grid:#e1e0d9] [--axis:#c3c2b7] [--surface:var(--card)]",
  "dark:[--s1:#3987e5] dark:[--s2:#d95926] dark:[--s3:#199e70] dark:[--s4:#c98500] dark:[--s5:#d55181] dark:[--s6:#008300] dark:[--s7:#9085e9]",
  "dark:[--grid:#2c2c2a] dark:[--axis:#383835]",
);

export type SeriesColor = "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s-other";
const fill = (c: SeriesColor) => `var(--${c})`;
/** Hover/focus lift on a mark group: its first <rect> (the hit area) gets a faint wash. */
const MARK = "outline-none [&>rect:first-of-type]:transition-colors hover:[&>rect:first-of-type]:fill-muted focus-visible:[&>rect:first-of-type]:fill-muted";

/** Container width, measured so text renders at its real size (no viewBox scaling). */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

type Tip = { x: number; y: number; title: string; lines: { label: string; value: string; color?: SeriesColor }[] } | null;

/** Wrapper with the palette variables, a positioned tooltip layer, and hover/focus helpers. */
function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const frame = useRef<HTMLDivElement>(null);
  const bind = (title: string, lines: NonNullable<Tip>["lines"]) => ({
    tabIndex: 0,
    onPointerMove: (e: PointerEvent) => {
      const box = frame.current?.getBoundingClientRect();
      if (box) setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title, lines });
    },
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<SVGGElement>) => {
      const box = frame.current?.getBoundingClientRect();
      const mark = e.currentTarget.getBoundingClientRect();
      if (box) setTip({ x: mark.left - box.left + mark.width / 2, y: mark.top - box.top, title, lines });
    },
    onBlur: () => setTip(null),
  });
  const layer = tip && (
    <div role="presentation" className="pointer-events-none absolute z-20 min-w-40 max-w-72 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      style={{ left: tip.x, top: tip.y, transform: `translate(${tip.x > 260 ? "-100%" : "0"}, calc(-100% - 10px))` }}>
      <div className="mb-1 text-muted-foreground">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l.label} className="flex items-center gap-2">
          {l.color && <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: fill(l.color) }} />}
          <span className="font-semibold tabular-nums">{l.value}</span>
          <span className="text-muted-foreground">{l.label}</span>
        </div>
      ))}
    </div>
  );
  return { bind, layer, frame };
}

function Frame({ children, frameRef, className }: { children: ReactNode; frameRef: RefObject<HTMLDivElement | null>; className?: string }) {
  return <div ref={frameRef} className={cn("relative min-w-0", VIZ_VARS, className)}>{children}</div>;
}

export function Legend({ items }: { items: { label: string; color: SeriesColor }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-sm" style={{ background: fill(i.color) }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal bar: square at the baseline x0, 4px rounded at the data end x1. */
function hbarPath(x0: number, x1: number, y: number, h: number) {
  const w = Math.abs(x1 - x0);
  if (w < 0.5) return "";
  const r = Math.min(4, w, h / 2);
  if (x1 >= x0) {
    return `M${x0},${y}H${x1 - r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 - r},${y + h}H${x0}Z`;
  }
  return `M${x0},${y}H${x1 + r}Q${x1},${y} ${x1},${y + r}V${y + h - r}Q${x1},${y + h} ${x1 + r},${y + h}H${x0}Z`;
}

/** Vertical column: square at the baseline y0, 4px rounded at the data end y1. */
function colPath(x: number, w: number, y0: number, y1: number) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const r = Math.min(4, h, w / 2);
  if (y1 <= y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/** 1-2-5 tick step covering [min, max] in about four steps. */
function ticks(min: number, max: number): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  // first tick <= min and last tick >= max, so every mark stays inside the plot
  const first = Math.floor(min / step), last = Math.ceil(max / step);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(k * step);
  return out;
}

const CHAR_PX = 7.2; // approx. width of one 12px glyph, sized for upper-case labels
const fit = (s: string, px: number) => {
  const n = Math.max(4, Math.floor(px / CHAR_PX));
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function domain(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  return hi === lo ? { lo, hi: lo + 1 } : { lo, hi };
}

export type HBar = { key: string; label: string; value: number; valueLabel: string; dim?: boolean };

/** Ranked horizontal bars, one series, value at the tip. Handles negative values. */
export function HBarChart({ bars, color = "s1", ariaLabel, seriesLabel }: { bars: HBar[]; color?: SeriesColor; ariaLabel: string; seriesLabel: string }) {
  const { ref, width } = useWidth();
  const { bind, layer, frame } = useTooltip();
  if (bars.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const rowH = 24, barH = 14, top = 4;
  const labelW = Math.round(Math.min(240, Math.max(96, width * 0.36)));
  const valueW = 76;
  const plotW = Math.max(40, width - labelW - valueW - 8);
  const { lo, hi } = domain(bars.map((b) => b.value));
  const x = (v: number) => labelW + 8 + ((v - lo) / (hi - lo)) * plotW;
  const height = top + bars.length * rowH + 4;
  return (
    <Frame frameRef={frame}>
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={width} height={height} role="list" aria-label={ariaLabel} className="block overflow-visible">
          <line x1={x(0)} x2={x(0)} y1={top} y2={height - 4} stroke="var(--axis)" strokeWidth={1} />
          {bars.map((b, i) => {
            const y = top + i * rowH;
            const end = x(b.value);
            const tipX = Math.max(end, x(0)) + 6;
            return (
              <g key={b.key} role="listitem" aria-label={`${b.label}: ${b.valueLabel}`} className={MARK}
                {...bind(b.label, [{ label: seriesLabel, value: b.valueLabel, color }])}>
                <title>{`${b.label}: ${b.valueLabel}`}</title>
                <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
                <text x={labelW} y={y + rowH / 2} dy="0.35em" textAnchor="end" className="fill-foreground text-xs">{fit(b.label, labelW)}</text>
                <path d={hbarPath(x(0), end, y + (rowH - barH) / 2, barH)} fill={fill(color)} opacity={b.dim ? 0.3 : 1} />
                <text x={tipX} y={y + rowH / 2} dy="0.35em" className="fill-muted-foreground text-xs tabular-nums">{b.valueLabel}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {layer}
    </Frame>
  );
}

export type Group = { key: string; label: string; values: number[]; valueLabels: string[]; dim?: boolean };

/** Horizontal grouped bars (one row per section, one thin bar per series), shared axis on top. */
/** Values are centavos; ticks use compact pesos. */
export function GroupedBarChart({ groups, series, ariaLabel }: { groups: Group[]; series: { name: string; color: SeriesColor }[]; ariaLabel: string }) {
  const { ref, width } = useWidth();
  const { bind, layer, frame } = useTooltip();
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const barH = 7, gap = 2, pad = 8, axisH = 18;
  const rowH = series.length * barH + (series.length - 1) * gap + pad * 2;
  const labelW = Math.round(Math.min(240, Math.max(96, width * 0.36)));
  const plotW = Math.max(40, width - labelW - 24);
  const all = groups.flatMap((g) => g.values);
  const t = ticks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = t[0], hi = t[t.length - 1] === lo ? lo + 1 : t[t.length - 1];
  const x = (v: number) => labelW + 8 + ((v - lo) / (hi - lo)) * plotW;
  const height = axisH + groups.length * rowH;
  return (
    <Frame frameRef={frame} className="space-y-2">
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={width} height={height} role="list" aria-label={ariaLabel} className="block overflow-visible">
          {t.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={axisH - 4} y2={height} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={x(v)} y={axisH - 8} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">{compactPeso(v)}</text>
            </g>
          ))}
          {groups.map((g, i) => {
            const y = axisH + i * rowH;
            const desc = series.map((s, k) => `${s.name} ${g.valueLabels[k]}`).join(", ");
            return (
              <g key={g.key} role="listitem" aria-label={`${g.label}: ${desc}`} className={MARK}
                {...bind(g.label, series.map((s, k) => ({ label: s.name, value: g.valueLabels[k], color: s.color })))}>
                <title>{`${g.label}: ${desc}`}</title>
                <rect x={0} y={y} width={width} height={rowH} fill="transparent" />
                <text x={labelW} y={y + rowH / 2} dy="0.35em" textAnchor="end" className="fill-foreground text-xs">{fit(g.label, labelW)}</text>
                {series.map((s, k) => (
                  <path key={s.name} d={hbarPath(x(0), x(g.values[k]), y + pad + k * (barH + gap), barH)} fill={fill(s.color)} opacity={g.dim ? 0.3 : 1} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {layer}
    </Frame>
  );
}

export type StackRow = { key: string; label: string; segments: { key: string; label: string; value: number; valueLabel: string; share: string; color: SeriesColor }[] };

/**
 * One 100% stacked bar per row (e.g. adjusted appropriation and obligations by classification),
 * with a 2px surface gap between segments. Negative parts cannot be stacked and are left out of the
 * bar; the value table below always lists every figure.
 */
export function StackedBar({ rows, ariaLabel }: { rows: StackRow[]; ariaLabel: string }) {
  const { ref, width } = useWidth();
  const { bind, layer, frame } = useTooltip();
  const barH = 20, rowH = 48, labelH = 16;
  const legend = rows[0]?.segments.map((s) => ({ label: s.label, color: s.color })) ?? [];
  return (
    <Frame frameRef={frame} className="space-y-3">
      <Legend items={legend} />
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={width} height={rows.length * rowH} role="list" aria-label={ariaLabel} className="block">
          {rows.map((r, i) => {
            const y = i * rowH;
            const pos = r.segments.map((s) => Math.max(0, s.value));
            const total = pos.reduce((a, b) => a + b, 0);
            const visible = r.segments.filter((_, k) => pos[k] > 0);
            let cx = 0;
            return (
              <g key={r.key} role="listitem" aria-label={`${r.label}: ${r.segments.map((s) => `${s.label} ${s.valueLabel}`).join(", ")}`}>
                <text x={0} y={y + 12} className="fill-foreground text-xs font-medium">{r.label}</text>
                {total > 0 && visible.map((s, k) => {
                  const gaps = (visible.length - 1) * 2;
                  const w = (Math.max(0, s.value) / total) * (width - gaps);
                  const x0 = cx;
                  cx += w + 2;
                  const last = k === visible.length - 1;
                  const d = last ? hbarPath(x0, x0 + w, y + labelH + 4, barH) : `M${x0},${y + labelH + 4}h${w}v${barH}h${-w}Z`;
                  return (
                    <g key={s.key} className={MARK} {...bind(r.label, [{ label: s.label, value: `${s.valueLabel} (${s.share})`, color: s.color }])}>
                      <title>{`${r.label}, ${s.label}: ${s.valueLabel} (${s.share})`}</title>
                      <rect x={x0} y={y + labelH} width={Math.max(w, 1)} height={barH + 8} fill="transparent" />
                      <path d={d} fill={fill(s.color)} />
                    </g>
                  );
                })}
                {total <= 0 && <text x={0} y={y + labelH + 18} className="fill-muted-foreground text-xs">Nothing to show</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {layer}
    </Frame>
  );
}

/** Monthly columns (Jan..cutoff) in centavos, one series; the latest month and the peak are labelled on the cap. */
export function MonthlyColumns({ months, color = "s1", ariaLabel, seriesLabel }: {
  months: { label: string; value: number; valueLabel: string }[]; color?: SeriesColor; ariaLabel: string; seriesLabel: string;
}) {
  const { ref, width } = useWidth();
  const { bind, layer, frame } = useTooltip();
  if (months.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  const height = 220, axisW = 52, bottom = 22, topPad = 20;
  const t = ticks(Math.min(0, ...months.map((m) => m.value)), Math.max(0, ...months.map((m) => m.value)));
  const lo = t[0], hi = t[t.length - 1] === lo ? lo + 1 : t[t.length - 1];
  const plotH = height - bottom - topPad;
  const y = (v: number) => topPad + (1 - (v - lo) / (hi - lo)) * plotH;
  const slot = (width - axisW) / 12; // fixed 12-month scale so months keep their place as the year fills
  const colW = Math.min(24, slot * 0.6);
  const peak = months.reduce((p, m, i) => (m.value > months[p].value ? i : p), 0);
  return (
    <Frame frameRef={frame}>
      <div ref={ref} className="w-full min-w-0 overflow-hidden">
        <svg width={width} height={height} role="list" aria-label={ariaLabel} className="block overflow-visible">
          {t.map((v) => (
            <g key={v}>
              <line x1={axisW} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={axisW - 6} y={y(v)} dy="0.35em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{compactPeso(v)}</text>
            </g>
          ))}
          {months.map((m, i) => {
            const cx = axisW + i * slot + slot / 2;
            const labelled = i === months.length - 1 || i === peak;
            return (
              <g key={m.label} role="listitem" aria-label={`${m.label}: ${m.valueLabel}`} className={MARK}
                {...bind(m.label, [{ label: seriesLabel, value: m.valueLabel, color }])}>
                <title>{`${m.label}: ${m.valueLabel}`}</title>
                <rect x={cx - slot / 2} y={topPad} width={slot} height={plotH} fill="transparent" />
                <path d={colPath(cx - colW / 2, colW, y(0), y(m.value))} fill={fill(color)} />
                {labelled && (
                  <text x={cx} y={Math.min(y(m.value), y(0)) - 6} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">{compactPeso(m.value)}</text>
                )}
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{m.label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {layer}
    </Frame>
  );
}
