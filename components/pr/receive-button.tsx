"use client";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { receivePr } from "@/app/(app)/prs/[id]/actions";

export function ReceiveButton({ prId, routingSlipNo, officeName, size = "default" }: {
  prId: string; routingSlipNo: string; officeName: string; size?: "default" | "sm";
}) {
  return (
    <ConfirmActionDialog
      trigger={<Button size={size}><Inbox className="mr-2 size-4" />Receive</Button>}
      title={`Receive ${routingSlipNo}?`}
      description={<p>This records that <b>{officeName}</b> has physically received the document now. The sending office will be notified.</p>}
      confirmLabel="Receive" successMessage="Received"
      onConfirm={() => receivePr(prId)}
    />
  );
}
