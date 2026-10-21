import { basisOfFigures } from "@/lib/saao/rules";
import { formatAmount } from "@/lib/saao/money";
import type { AllotmentMode, MovementRule } from "@/lib/saao/types";

export type FrozenMovement = { id: string; reference_no?: string | null; title?: string | null; kind?: string; status?: string; total?: string | number | null };

export function BasisNote({ rules, acknowledged }: {
  rules: { allotmentMode: AllotmentMode; movementRule: MovementRule };
  acknowledged: FrozenMovement[];
}) {
  return (
    <section className="space-y-2 rounded-md border p-4 text-sm">
      <h2 className="font-semibold">Basis of figures</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {basisOfFigures(rules).map((s) => <li key={s}>{s}</li>)}
      </ul>
      {acknowledged.length > 0 && (
        <div>
          <p className="font-medium">Unapproved movements counted (acknowledged at finalization)</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {acknowledged.map((m) => (
              <li key={m.id}>
                {[m.reference_no, m.title].filter(Boolean).join(" — ") || m.id}
                {m.status ? ` (${m.status})` : ""}
                {m.total != null && m.total !== "" ? `: ${formatAmount(Math.round(Number(m.total) * 100))}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
