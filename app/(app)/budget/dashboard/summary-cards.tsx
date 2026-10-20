// The 8 summary cards of the Budget Dashboard (spec §8.2). Figures are full-precision pesos so they
// can be checked against the printed SAAO; a card whose figure depends on a provisional rule shows
// a "provisional" marker whose tooltip names the rule.
import { formatAmount, formatPct } from "@/lib/saao/money";
import { RULES } from "@/lib/saao/rules";
import type { SummaryCard } from "@/lib/saao/dashboard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const RULE_TITLE = Object.fromEntries(RULES.map((r) => [r.id, r.title]));

const peso = (c: number) => (c < 0 ? `-₱${formatAmount(-c)}` : `₱${formatAmount(c)}`);

export function SummaryCards({ cards, ruleClasses, note }: {
  cards: SummaryCard[];
  /** Rule id → class ("C" | "P" | "A"), frozen with a finalized report, current for a draft. */
  ruleClasses: Record<string, string>;
  /** Extra tooltip text per rule id (e.g. the allotment mode in effect). */
  note?: Record<string, string>;
}) {
  return (
    <TooltipProvider>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary">
        {cards.map((c) => {
          const rule = c.provisional && ruleClasses[c.provisional] !== "C" ? c.provisional : null;
          return (
            <li key={c.key} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                {rule && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                        aria-label={`Provisional (${rule}): ${RULE_TITLE[rule] ?? ""}`}>
                        provisional
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      {rule} (provisional): {RULE_TITLE[rule]}.{note?.[rule] ? ` ${note[rule]}` : ""}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="mt-2 text-xl font-semibold break-words" data-card={c.key}>
                {c.centavos === null ? formatPct(c.pct ?? null) : peso(c.centavos)}
              </p>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
