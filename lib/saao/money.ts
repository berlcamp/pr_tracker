// Amount parsing and formatting. All amounts are integer centavos; no float
// arithmetic is ever done on pesos.

export type ParseResult = { ok: true; centavos: number; entry: string | null } | { ok: false; error: string };

/** Pesos at or above this are rejected (keeps centavos well inside Number.MAX_SAFE_INTEGER). */
const MAX_PESOS_DIGITS = 13; // 1e13 pesos
const MAX_CENTAVOS = 10 ** (MAX_PESOS_DIGITS + 2);

const TERM = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/;

function termToCentavos(term: string): number | "decimals" | "invalid" | "large" {
  const m = TERM.exec(term);
  if (!m) return "invalid";
  const int = m[1] ?? "0";
  const frac = m[2] ?? m[3] ?? "";
  if (frac.length > 2) return "decimals";
  if (int.replace(/^0+/, "").length > MAX_PESOS_DIGITS) return "large";
  return Number(int) * 100 + Number(frac.padEnd(2, "0"));
}

/**
 * Parses a typed amount: `1,234.50`, `-5`, `(500)`, `=a+b-c`. Returns centavos and,
 * when the input is an expression, the normalised expression as `entry`.
 */
export function parseAmount(input: string): ParseResult {
  let s = input.trim();
  if (s.startsWith("=")) {
    s = s.slice(1).trim();
    if (s === "") return { ok: false, error: "Amount must be a number" };
  }
  s = s.replace(/[\s,]/g, "");
  if (s === "") return { ok: true, centavos: 0, entry: null };

  let negate = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    negate = true;
    s = paren[1];
  }

  // Split into signed terms: optional leading sign, then (term)(op term)*.
  const parts = s.split(/([+-])/);
  // parts alternates term, op, term, ...; a leading sign yields an empty first term.
  let leadingSign = 1;
  if (parts[0] === "" && parts.length > 1) {
    leadingSign = parts[1] === "-" ? -1 : 1;
    parts.splice(0, 2);
  }
  if (paren && leadingSign === -1) return { ok: false, error: "Amount must be a number" };

  let total = 0;
  let decimalsError = false;
  let invalid = false;
  let large = false;
  for (let i = 0; i < parts.length; i += 2) {
    const sign = i === 0 ? leadingSign : parts[i - 1] === "-" ? -1 : 1;
    const v = termToCentavos(parts[i]);
    if (v === "invalid") invalid = true;
    else if (v === "decimals") decimalsError = true;
    else if (v === "large") large = true;
    else total += sign * v;
  }
  if (invalid) return { ok: false, error: "Amount must be a number" };
  if (decimalsError) return { ok: false, error: "Use at most 2 decimal places" };
  if (large || Math.abs(total) >= MAX_CENTAVOS) return { ok: false, error: "Amount is too large" };

  const centavos = (negate ? -total : total) || 0;
  const hasOperator = parts.length > 1;
  return { ok: true, centavos, entry: hasOperator ? (paren ? `(${s})` : s) : null };
}

/** 123450 → "1,234.50"; negative amounts get a leading "-". */
export function formatAmount(c: number): string {
  const abs = Math.abs(c);
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${c < 0 ? "-" : ""}${int}.${frac}`;
}

/** Obligation % with two decimals, or "—" when there is no meaningful denominator (R9). */
export function formatPct(p: number | null): string {
  return p === null ? "—" : `${p.toFixed(2)}%`;
}

export function toPeso(c: number): number {
  return c / 100;
}

const NUMERIC = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * PostgREST numeric (string) or number → exact centavos. Strings are split on the
 * decimal point, never multiplied as floats. Digits beyond the second decimal round
 * half away from zero, matching SQL round(x, 2).
 */
export function fromNumeric(v: string | number | null): number {
  if (v === null) return 0;
  const s = typeof v === "number" ? v.toFixed(2) : v.trim();
  const m = NUMERIC.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`Not a numeric amount: ${String(v)}`);
  const sign = m[1] === "-" ? -1 : 1;
  const frac = m[3] ?? "";
  let c = Number(m[2] || "0") * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (frac.length > 2 && Number(frac[2]) >= 5) c += 1;
  return sign * c || 0;
}
