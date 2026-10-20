// Shared SAAO types. Every amount is integer centavos (never float pesos).

export type SaaoRole = "viewer" | "encoder" | "finalizer" | "budget_admin";
export type NodeKind = "section" | "group" | "classification" | "line" | "note";
export type MovementKind = "supplemental" | "realignment" | "augmentation" | "reversion" | "nta_reduction" | "other";
export type RecordStatus = "pending" | "approved" | "cancelled";
export type AllotmentMode = "equals_adjusted" | "recorded";
export type MovementRule = "all_entered" | "approved_only";

/** One line's computed figures (spec §3, §4.8), in centavos. */
export type LineAmounts = {
  appropriation: number;
  nta: number;
  /** SB number (as a string key) → amount; only SB numbers with counted amounts appear. */
  sb: Record<string, number>;
  supplemental: number;
  realignment: number;
  totalChanges: number;
  adjusted: number;
  allotment: number;
  obligation: number;
  /** 12 monthly obligation totals, January first; months after the cutoff month are 0. */
  months: number[];
  balanceAppropriation: number;
  balanceAllotment: number;
  cna1: number;
  cna2: number;
  cna3: number;
  savings: number;
  savingsHalf: number;
};

/** One node of a report (live or snapshot), in tree order. Only lines carry amounts. */
export type ReportRow = {
  seq: number;
  parentSeq: number | null;
  depth: number;
  kind: NodeKind;
  nodeId: string | null;
  label: string;
  accountCode: string | null;
  classificationCode: string | null;
  classificationName: string | null;
  totalLabel: string | null;
  showTotal: boolean;
  amounts: LineAmounts | null;
};
