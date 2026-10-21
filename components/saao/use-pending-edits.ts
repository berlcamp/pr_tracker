"use client";
// Optimistic edits on top of the last server data (shared by the SAAO workspace and the Budget Data grids).
// Edits are applied locally as pending, dropped once fresh server data arrives (every successful action
// revalidates /budget), and rolled back with a toast when the action fails.
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/rpc";
import { applyLocalEdit, type LocalEdit } from "@/lib/saao/editor-state";
import type { EditorData } from "@/lib/saao/queries";
import { useUnsavedGuard } from "./use-unsaved-guard";

type PendingEdit = { id: number; edit: LocalEdit; done: boolean };

export function usePendingEdits(data: EditorData) {
  const [base, setBase] = useState(data);
  const [pending, setPending] = useState<PendingEdit[]>([]);
  if (data !== base) {
    // fresh server data: it includes the finished edits
    setBase(data);
    setPending((p) => p.filter((e) => !e.done));
  }
  const live = useMemo(() => pending.reduce((d, p) => applyLocalEdit(d, p.edit), base), [base, pending]);
  const seq = useRef(0);

  /** Marks the edits done on success; on failure shows the error and rolls them back. */
  const settle = useCallback((ids: number[], res: ActionResult<unknown>) => {
    if (res.ok) {
      setPending((p) => p.map((e) => (ids.includes(e.id) ? { ...e, done: true } : e)));
    } else {
      toast.error(res.error);
      setPending((p) => p.filter((e) => !ids.includes(e.id)));
    }
  }, []);

  const addPending = useCallback((edits: LocalEdit[]) => {
    const ids = edits.map(() => ++seq.current);
    setPending((p) => [...p, ...edits.map((edit, i) => ({ id: ids[i], edit, done: false }))]);
    return ids;
  }, []);

  /** Applies `edits` at once and settles them with the result of `save`. */
  const run = useCallback(async (edits: LocalEdit[], save: () => Promise<ActionResult<unknown>>): Promise<ActionResult<unknown>> => {
    const ids = addPending(edits);
    let res: ActionResult<unknown>;
    try {
      res = await save();
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : "Could not save" };
    }
    settle(ids, res);
    return res;
  }, [addPending, settle]);

  const saving = pending.some((p) => !p.done);
  // an edit still saving would be lost if the user left now
  useUnsavedGuard(saving);

  return { live, saving, addPending, settle, run };
}
