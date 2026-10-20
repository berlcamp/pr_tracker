// The 8 summary cards of the Budget Dashboard (spec §8.2). Figures are full-precision pesos so they
// can be checked against the printed SAAO; a card whose figure depends on a provisional rule shows
// a "provisional" marker whose tooltip lists every such rule.
import { formatAmount, formatPct } from "@/lib/saao/money";
import { RULES, isUnconfirmed } from "@/lib/saao/rules";
import type { SummaryCard } from "@/lib/saao/dashboard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]));

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
          const rules = (c.provisional ?? []).filter((id) => isUnconfirmed(id, ruleClasses[id]));
          const describe = (id: string) =>
            `${id} (${RULE[id]?.provisional ? `${RULE[id].provisional} provisional` : "provisional"}): ${RULE[id]?.title ?? ""}.${note?.[id] ? ` ${note[id]}` : ""}`;
          return (
            <li key={c.key} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                {rules.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                        aria-label={`Provisional: ${rules.map(describe).join(" ")}`}>
                        provisional
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      <ul className="space-y-1">
                        {rules.map((id) => <li key={id}>{describe(id)}</li>)}
                      </ul>
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
