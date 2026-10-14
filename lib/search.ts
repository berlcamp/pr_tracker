export const RS_PATTERN = /^RS-\d{4}-\d{2}-\d{5}$/i;

export function searchTarget(q: string): string | null {
  const t = q.trim();
  if (!t) return null;
  if (RS_PATTERN.test(t)) return `/track/${t.toUpperCase()}`;
  return `/prs?q=${encodeURIComponent(t)}`;
}

const SORTABLE = ["created_at", "routing_slip_no", "pr_no", "amount", "pr_date", "days_here", "current_since"] as const;
const STATES = ["draft", "in_transit", "received", "returned", "completed", "cancelled"];
const SIZES = [10, 25, 50, 100];

export type ListParams = {
  page: number; size: number; sort: (typeof SORTABLE)[number]; dir: "asc" | "desc";
  q: string; state: string; office: string; origin: string; from: string; to: string; min: string; max: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNum = (s: string) => /^\d+(\.\d+)?$/.test(s);
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export function parseListParams(sp: Record<string, string | string[] | undefined>): ListParams {
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const sizeRaw = parseInt(one(sp.size), 10);
  const [sortCol, sortDir] = one(sp.sort).split(".");
  const sort = (SORTABLE as readonly string[]).includes(sortCol) ? (sortCol as ListParams["sort"]) : "created_at";
  return {
    page,
    size: SIZES.includes(sizeRaw) ? sizeRaw : 25,
    sort,
    dir: sortCol === sort && sortDir === "asc" ? "asc" : "desc",
    q: one(sp.q).trim().slice(0, 100),
    state: STATES.includes(one(sp.state)) ? one(sp.state) : "",
    office: isUuid(one(sp.office)) ? one(sp.office) : "",
    origin: isUuid(one(sp.origin)) ? one(sp.origin) : "",
    from: isDate(one(sp.from)) ? one(sp.from) : "",
    to: isDate(one(sp.to)) ? one(sp.to) : "",
    min: isNum(one(sp.min)) ? one(sp.min) : "",
    max: isNum(one(sp.max)) ? one(sp.max) : "",
  };
}

/** Removes characters that have meaning inside a PostgREST `or=(…)` filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%"\\:]/g, " ").replace(/\s+/g, " ").trim();
}
