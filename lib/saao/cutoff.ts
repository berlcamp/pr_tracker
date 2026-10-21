// Month-end cutoffs within a fiscal year, shared by the workspace and the Budget Data screens.
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (fy: number, m: number) => new Date(Date.UTC(fy, m, 0)).getUTCDate();

/** Last day of month `m` (1..12) of `fy` as YYYY-MM-DD. */
export const monthEnd = (fy: number, m: number) => `${fy}-${pad(m)}-${pad(lastDay(fy, m))}`;

/** "October 31, 2026". */
export const monthEndLabel = (fy: number, m: number) => `${MONTHS[m - 1]} ${lastDay(fy, m)}, ${fy}`;

/** The month in `raw` (1..12), else the current month for the current fiscal year, else December (past) or January (future). */
export function initialMonth(raw: string | string[] | undefined, fiscalYear: number, now = new Date()): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && /^(1[0-2]|[1-9])$/.test(v)) return Number(v);
  if (now.getFullYear() === fiscalYear) return now.getMonth() + 1;
  return now.getFullYear() > fiscalYear ? 12 : 1;
}
