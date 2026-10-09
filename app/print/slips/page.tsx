import QRCode from "qrcode";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { buildSlipRows, trackUrl } from "@/lib/pr/routing-slip";
import { RoutingSlip } from "@/components/pr/routing-slip";
import { PrintToolbar } from "./print-toolbar";

export default async function PrintSlipsPage({ searchParams }: { searchParams: Promise<{ ids?: string; layout?: string }> }) {
  await requireProfile();
  const { ids = "", layout } = await searchParams;
  const fourUp = layout === "4up";
  const idList = ids.split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 40);
  const supabase = await createClient();

  const [{ data: prs }, { data: steps }, { data: lgu }] = await Promise.all([
    supabase.from("pr_overview").select("*").in("id", idList.length ? idList : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("default_route_steps").select("step_order, purpose, office:offices(name)").order("step_order"),
    supabase.from("app_settings").select("value").eq("key", "lgu_name").maybeSingle(),
  ]);
  const rows = buildSlipRows((steps ?? []).map((s) => ({
    step_order: s.step_order, purpose: s.purpose, office_name: (s.office as { name: string } | null)?.name ?? "",
  })));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const ordered = idList.map((id) => prs?.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const slips = await Promise.all(ordered.map(async (pr) => ({
    pr, qr: await QRCode.toDataURL(trackUrl(appUrl, pr.routing_slip_no!), { margin: 0, width: 240, errorCorrectionLevel: "M" }),
  })));
  const lguName = String(lgu?.value ?? "");

  return (
    <div className="bg-white">
      <style>{fourUp ? "@page { size: A4 portrait; margin: 0; }" : "@page { size: 105mm 148.5mm; margin: 0; }"}</style>
      <PrintToolbar ids={idList.join(",")} fourUp={fourUp} />
      {slips.length === 0 && <p className="p-6 text-sm">No PRs to print (you may not have access to the selected PRs).</p>}
      <div className={fourUp ? "grid w-[210mm] grid-cols-2" : ""}>
        {slips.map(({ pr, qr }, i) => (
          <RoutingSlip key={pr.id} lguName={lguName} qr={qr} rows={rows}
            pageBreak={fourUp ? (i + 1) % 4 === 0 : true}
            pr={{ routing_slip_no: pr.routing_slip_no!, pr_no: pr.pr_no, origin_office_name: pr.origin_office_name!,
                  pr_date: pr.pr_date!, purpose: pr.purpose!, amount: Number(pr.amount) }} />
        ))}
      </div>
    </div>
  );
}
