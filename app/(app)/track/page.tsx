import { TrackForm } from "./track-form";

export default function TrackPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Track a PR</h1>
      <p className="text-sm text-muted-foreground">Enter the routing slip number, or scan the QR code on the routing slip.</p>
      <TrackForm />
    </div>
  );
}
