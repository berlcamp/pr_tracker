import { Badge } from "@/components/ui/badge";

export type ReportHeaderData = {
  headerLines: string[];
  fundName: string;
  fiscalYear: number;
  status: "draft" | "finalized" | "superseded";
  version: number;
  supersededByVersion?: number | null;
  cutoffLabel: string;
};

export function ReportHeader({ data }: { data: ReportHeaderData }) {
  const badge =
    data.status === "draft" ? <Badge className="bg-amber-100 text-amber-900">Draft</Badge>
    : data.status === "finalized" ? <Badge className="bg-green-100 text-green-900">Finalized v{data.version}</Badge>
    : <Badge variant="secondary">Superseded{data.supersededByVersion ? ` by v${data.supersededByVersion}` : ""} (v{data.version})</Badge>;
  return (
    <header className="space-y-1 text-center">
      {data.headerLines.map((l, i) => <p key={i} className="text-sm">{l}</p>)}
      <h1 className="text-lg font-bold">STATUS OF APPROPRIATION, ALLOTMENT &amp; OBLIGATION</h1>
      <p className="text-sm">{data.fundName} · FY {data.fiscalYear}</p>
      <p className="text-sm">As of {data.cutoffLabel}</p>
      <div className="flex justify-center pt-1">{badge}</div>
    </header>
  );
}
