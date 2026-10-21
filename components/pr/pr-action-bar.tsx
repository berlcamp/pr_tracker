"use client";
import { useState } from "react";
import Link from "next/link";
import { Ban, Bell, BellOff, CheckCircle2, Hash, ListChecks, Pencil, Send, Undo2, Gavel, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { TextActionDialog } from "./remarks-panel";
import { ReceiveButton } from "./receive-button";
import type { PrAction } from "@/lib/pr/permissions";
import {
  assignPrNo, cancelPr, completePr, followPr, forwardPr, recallPr, returnPr, setModeOfProcurement, setStatus, unfollowPr,
} from "@/app/(app)/prs/[id]/actions";

type Option = { id: string; name: string };
export type Suggestion = { step_order: number; office_id: string; office_name: string; purpose: string } | null;

type Props = {
  pr: { id: string; routing_slip_no: string; pr_no: string | null; mode_of_procurement: string | null;
        current_office_name: string; sent_by_office_name: string | null; total_steps: number; has_pr_document: boolean;
        current_status_id: string | null; current_status_label: string | null };
  actions: PrAction[];
  suggestion: Suggestion;
  offices: Option[];
  returnTargets: Option[];
  statuses: { id: string; label: string; allows_completion: boolean }[];
  myOfficeId: string | null;
  myOfficeName: string | null;
  isFollowing: boolean;
  canFollow: boolean;
};

const MODES = ["Competitive Bidding", "Small Value Procurement", "Shopping", "Direct Contracting",
  "Negotiated Procurement", "Repeat Order", "Direct Acquisition", "Emergency Purchase"];

export function PrActionBar(p: Props) {
  const has = (a: PrAction) => p.actions.includes(a);
  // Mirrors complete_pr: an office with final statuses (e.g. Paid) completes only from one of them.
  const finalStatuses = p.statuses.filter((s) => s.allows_completion);
  const completeBlocked = finalStatuses.length > 0 && !finalStatuses.some((s) => s.id === p.pr.current_status_id);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4 empty:hidden">
      {has("upload_pr_document") && !p.pr.has_pr_document && (
        <p className="w-full text-sm text-amber-700">Upload the PR document before forwarding.</p>
      )}
      {has("receive") && p.myOfficeName && <ReceiveButton prId={p.pr.id} routingSlipNo={p.pr.routing_slip_no} officeName={p.myOfficeName} />}
      {has("forward") && <ForwardDialog {...p} />}
      {has("set_status") && <StatusDialog {...p} />}
      {has("assign_pr_no") && (
        <TextActionDialog
          trigger={<Button variant="outline"><Hash className="mr-2 size-4" />Assign PR No.</Button>}
          title={`Assign PR No. to ${p.pr.routing_slip_no}?`}
          description={p.pr.pr_no ? `Current PR No. is ${p.pr.pr_no}. The change will be logged.` : "The PR No. will be recorded in the audit trail."}
          label="PR No." required multiline={false} initialValue={p.pr.pr_no ?? ""}
          confirmLabel="Save PR No." successMessage="PR No. saved"
          onConfirm={(t) => assignPrNo(p.pr.id, t)}
        />
      )}
      {has("set_mode") && (
        <TextActionDialog
          trigger={<Button variant="outline"><Gavel className="mr-2 size-4" />Mode of procurement</Button>}
          title="Set mode of procurement?"
          description={<span>Common modes: {MODES.join(", ")}.</span>}
          label="Mode of procurement" required multiline={false} initialValue={p.pr.mode_of_procurement ?? ""}
          confirmLabel="Save mode" successMessage="Mode of procurement saved"
          onConfirm={(t) => setModeOfProcurement(p.pr.id, t)}
        />
      )}
      {has("return") && <ReturnDialog {...p} />}
      {has("recall") && (
        <TextActionDialog
          trigger={<Button variant="outline"><RotateCcw className="mr-2 size-4" />Recall</Button>}
          title={`Recall ${p.pr.routing_slip_no}?`}
          description={<p>It has not been received by <b>{p.pr.current_office_name}</b> yet. Recalling brings it back to your office, and they will be notified.</p>}
          label="Reason" confirmLabel="Recall" successMessage="Recalled"
          onConfirm={(t) => recallPr(p.pr.id, t || null)}
        />
      )}
      {has("complete") && completeBlocked && (
        <>
          <Button disabled className="bg-emerald-600"><CheckCircle2 className="mr-2 size-4" />Complete</Button>
          <p className="w-full text-sm text-amber-700 sm:order-last">
            Set the status to {finalStatuses.map((s) => `"${s.label}"`).join(" or ")} before completing this PR.
          </p>
        </>
      )}
      {has("complete") && !completeBlocked && (
        <TextActionDialog
          trigger={<Button className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 size-4" />Complete</Button>}
          title={`Mark ${p.pr.routing_slip_no} as completed?`}
          description="This closes the PR. It can no longer be forwarded or updated."
          label="Remark" confirmLabel="Complete" successMessage="PR completed"
          onConfirm={(t) => completePr(p.pr.id, t || null)}
        />
      )}
      {has("edit") && <Button asChild variant="outline"><Link href={`/prs/${p.pr.id}/edit`}><Pencil className="mr-2 size-4" />Edit</Link></Button>}
      {p.canFollow && (
        <ConfirmActionDialog
          trigger={<Button variant="ghost">{p.isFollowing ? <BellOff className="mr-2 size-4" /> : <Bell className="mr-2 size-4" />}{p.isFollowing ? "Unfollow" : "Follow"}</Button>}
          title={p.isFollowing ? "Stop following this PR?" : "Follow this PR?"}
          description={p.isFollowing ? "Your office will no longer get notifications about this PR." : "Your office will be notified when this PR is received, updated or completed."}
          confirmLabel={p.isFollowing ? "Unfollow" : "Follow"} successMessage={p.isFollowing ? "Unfollowed" : "Following"}
          onConfirm={() => (p.isFollowing ? unfollowPr(p.pr.id) : followPr(p.pr.id))}
        />
      )}
      {has("cancel") && (
        <TextActionDialog
          trigger={<Button variant="ghost" className="text-destructive"><Ban className="mr-2 size-4" />Cancel PR</Button>}
          title={`Cancel ${p.pr.routing_slip_no}?`} description="Cancelled PRs cannot be reopened."
          label="Reason" required destructive confirmLabel="Cancel PR" successMessage="PR cancelled"
          onConfirm={(t) => cancelPr(p.pr.id, t)}
        />
      )}
    </div>
  );
}

function ForwardDialog({ pr, suggestion, offices, myOfficeId }: Props) {
  const [to, setTo] = useState(suggestion?.office_id ?? "");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const offRoute = !suggestion || to !== suggestion.office_id;
  const toName = offices.find((o) => o.id === to)?.name;
  const reset = () => { setTo(suggestion?.office_id ?? ""); setReason(""); setRemark(""); };

  return (
    <ConfirmActionDialog
      trigger={<Button><Send className="mr-2 size-4" />Forward</Button>}
      title={`Forward ${pr.routing_slip_no}?`}
      description={!to ? "Choose the destination office." : offRoute
        ? <p>Send to <b>{toName}</b>. This is <b>not</b> the default next stop{suggestion ? ` (${suggestion.office_name} · ${suggestion.purpose})` : ""}, so a reason is required.</p>
        : <p>Send to <b>{toName}</b> · {suggestion!.purpose.toLowerCase()} (step {suggestion!.step_order} of {pr.total_steps}).</p>}
      confirmLabel="Forward" successMessage="Forwarded"
      canConfirm={!!to && (!offRoute || reason.trim().length > 0)}
      onOpenChange={(o) => o && reset()}
      onConfirm={() => forwardPr(pr.id, to, offRoute ? reason.trim() : null, remark.trim() || null)}
    >
      <Label>Destination office</Label>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger aria-label="Destination office"><SelectValue placeholder="Select office" /></SelectTrigger>
        <SelectContent>
          {offices.filter((o) => o.id !== myOfficeId).map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}{suggestion?.office_id === o.id ? " (suggested)" : ""}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {offRoute && to && (
        <>
          <Label htmlFor="override-reason">Reason for leaving the default route</Label>
          <Textarea id="override-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
      <Label htmlFor="forward-remark">Remark (optional)</Label>
      <Textarea id="forward-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
    </ConfirmActionDialog>
  );
}

function ReturnDialog({ pr, returnTargets }: Props) {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const toName = returnTargets.find((o) => o.id === to)?.name;
  return (
    <ConfirmActionDialog
      trigger={<Button variant="outline"><Undo2 className="mr-2 size-4" />Return</Button>}
      title={`Return ${pr.routing_slip_no}?`}
      description={to ? <p>Send it back to <b>{toName}</b> for correction.</p> : "Choose the office to return it to."}
      confirmLabel="Return" successMessage="Returned"
      canConfirm={!!to && reason.trim().length > 0}
      onOpenChange={(o) => { if (o) { setTo(returnTargets[0]?.id ?? ""); setReason(""); } }}
      onConfirm={() => returnPr(pr.id, to, reason.trim())}
    >
      <Label>Return to</Label>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger aria-label="Return to office"><SelectValue placeholder="Select office" /></SelectTrigger>
        <SelectContent>{returnTargets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
      </Select>
      <Label htmlFor="return-reason">Reason</Label>
      <Textarea id="return-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </ConfirmActionDialog>
  );
}

function StatusDialog({ pr, statuses }: Props) {
  const current = pr.current_status_id;
  const [statusId, setStatusId] = useState(current ?? "");
  const [remark, setRemark] = useState("");
  const label = statuses.find((s) => s.id === statusId)?.label;
  const changed = !!statusId && statusId !== current;
  return (
    <ConfirmActionDialog
      trigger={<Button variant="outline"><ListChecks className="mr-2 size-4" />Update status</Button>}
      title={`Update status of ${pr.routing_slip_no}?`}
      description={<>
        <p>Current status: <b>{pr.current_status_label ?? "none yet"}</b></p>
        {changed ? <p>Set the processing status to <b>{label}</b>. Followers will be notified.</p>
                 : <p>Choose a new status from your office&apos;s list.</p>}
      </>}
      confirmLabel="Update status" successMessage="Status updated"
      canConfirm={changed}
      onOpenChange={(o) => { if (o) { setStatusId(current ?? ""); setRemark(""); } }}
      onConfirm={() => setStatus(pr.id, statusId, remark.trim() || null)}
    >
      <Label>Status</Label>
      <Select value={statusId} onValueChange={setStatusId}>
        <SelectTrigger aria-label="Status"><SelectValue placeholder="Select status" /></SelectTrigger>
        <SelectContent>{statuses.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.label}{s.id === current ? " (current)" : ""}</SelectItem>
        ))}</SelectContent>
      </Select>
      <Label htmlFor="status-remark">Remark (optional)</Label>
      <Textarea id="status-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} />
    </ConfirmActionDialog>
  );
}
