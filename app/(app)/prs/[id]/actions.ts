"use server";
import { rpcAction } from "@/lib/actions/rpc";

const paths = (id: string) => [`/prs/${id}`, "/"];

export async function addRemark(prId: string, body: string) {
  return rpcAction("add_remark", { p_pr_id: prId, p_body: body }, paths(prId));
}

export async function addPrivateNote(prId: string, body: string) {
  return rpcAction("add_private_note", { p_pr_id: prId, p_body: body }, paths(prId));
}
