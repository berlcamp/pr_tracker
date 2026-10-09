import Link from "next/link";

export function RsLink({ id, rs }: { id: string; rs: string }) {
  return <Link href={`/prs/${id}`} className="font-mono font-medium text-primary hover:underline">{rs}</Link>;
}
