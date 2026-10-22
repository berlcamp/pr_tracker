"use client";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";

export type WeeklyActivityRow = { week_start: string; received: number; sent: number };
export type LocationRow = { office_name: string; prs: number };

// week_start is a plain date; format it in UTC so the viewer's timezone can't shift it a day.
const weekLabel = (d: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">{children}</p>;
}

// Screen-reader equivalent of a chart, so its values are never conveyed by the graphic alone.
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

const activityConfig = {
  received: { label: "Received", color: "var(--chart-1)" },
  sent: { label: "Sent out", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function WeeklyActivityChart({ rows }: { rows: WeeklyActivityRow[] }) {
  if (!rows.some((r) => r.received || r.sent)) return <Empty>No PRs received or sent out in the last 12 weeks.</Empty>;
  const data = rows.map((r) => ({ ...r, label: weekLabel(r.week_start) }));
  return (
    <>
      <ChartContainer config={activityConfig} className="aspect-auto h-64 w-full" aria-hidden>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => `Week of ${l}`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="received" type="linear" stroke="var(--color-received)" strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0, fill: "var(--color-received)" }} activeDot={{ r: 5 }} />
          {/* Dashed so the two series differ by more than hue. */}
          <Line dataKey="sent" type="linear" stroke="var(--color-sent)" strokeWidth={2} strokeDasharray="6 4"
                dot={{ r: 4, strokeWidth: 0, fill: "var(--color-sent)" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartContainer>
      <SrTable caption="PRs received and sent out per week" head={["Week of", "Received", "Sent out"]}
               rows={data.map((r) => [r.label, r.received, r.sent])} />
    </>
  );
}

const countConfig = { prs: { label: "PRs", color: "var(--chart-1)" } } satisfies ChartConfig;

export type AgeBucket = { label: string; prs: number };

export function OnHandAgeChart({ buckets }: { buckets: AgeBucket[] }) {
  if (!buckets.some((b) => b.prs)) return <Empty>No PRs on hand.</Empty>;
  return (
    <>
      <ChartContainer config={countConfig} className="aspect-auto h-56 w-full" aria-hidden>
        <BarChart data={buckets} margin={{ top: 20, right: 4, left: -16 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="prs" fill="var(--color-prs)" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="prs" position="top" className="fill-foreground" fontSize={12} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <SrTable caption="PRs on hand by days held" head={["Days held", "PRs"]} rows={buckets.map((b) => [b.label, b.prs])} />
    </>
  );
}

const MAX_OFFICES = 8;

export function OpenPrLocationsChart({ rows, myOfficeName }: { rows: LocationRow[]; myOfficeName: string }) {
  if (!rows.length) return <Empty>Your office has no open PRs.</Empty>;
  const named = rows.map((r) => ({ office: r.office_name === myOfficeName ? "Your office" : r.office_name, prs: r.prs }));
  // Past MAX_OFFICES, fold the tail into one bar rather than letting the chart grow without bound.
  const data = named.length > MAX_OFFICES
    ? [...named.slice(0, MAX_OFFICES - 1), { office: "Other offices", prs: named.slice(MAX_OFFICES - 1).reduce((s, r) => s + r.prs, 0) }]
    : named;
  const max = Math.max(...data.map((r) => r.prs));
  // Plain HTML bars: office names are real text that wraps naturally at any width, and the list doubles as the table view.
  return (
    <ul className="space-y-3" aria-label="Where your office's open PRs are now">
      {data.map((r) => (
        <li key={r.office} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">{r.office}</span>
            <span className="font-medium tabular-nums">{r.prs}</span>
          </div>
          <div className="h-2.5 rounded-sm bg-muted" aria-hidden>
            <div className="h-full rounded-sm bg-chart-1" style={{ width: `${(r.prs / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
