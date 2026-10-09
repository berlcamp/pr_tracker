import { z } from "zod";

export const prFormSchema = z.object({
  pr_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  purpose: z.string().trim().min(1, "Purpose is required"),
  amount: z.number("Amount is required").positive("Amount must be greater than zero"),
  responsibility_center_code: z.string().trim(),
  fund_cluster: z.string().trim(),
  requested_by_name: z.string().trim().min(1, "Requested by is required"),
  requested_by_designation: z.string().trim(),
});

export type PrFormValues = z.infer<typeof prFormSchema>;

const blankToNull = (s: string) => (s.trim() === "" ? null : s.trim());

export function toRpcPayload(values: PrFormValues) {
  return {
    header: {
      pr_date: values.pr_date,
      purpose: values.purpose,
      amount: Math.round((values.amount + Number.EPSILON) * 100) / 100,
      responsibility_center_code: blankToNull(values.responsibility_center_code),
      fund_cluster: blankToNull(values.fund_cluster),
      requested_by_name: values.requested_by_name,
      requested_by_designation: blankToNull(values.requested_by_designation),
    } as Record<string, string | number | null>,
  };
}
