export type SlipStep = { step_order: number; office_name: string; purpose: string };
export type SlipRow = { label: string; purpose: string | null };

export function buildSlipRows(steps: SlipStep[], blankRows = 2): SlipRow[] {
  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);
  return [
    ...ordered.map((s) => ({ label: s.office_name, purpose: s.purpose })),
    ...Array.from({ length: blankRows }, () => ({ label: "", purpose: null })),
  ];
}

export function trackUrl(appUrl: string, rs: string): string {
  return `${appUrl.replace(/\/+$/, "")}/track/${encodeURIComponent(rs)}`;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
