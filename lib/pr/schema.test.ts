import { describe, expect, test } from "vitest";
import { prFormSchema, toRpcPayload } from "./schema";

const valid = {
  pr_date: "2026-10-09", purpose: "Supplies", amount: 2695, responsibility_center_code: "", fund_cluster: "01",
  requested_by_name: "Maria", requested_by_designation: "",
};

describe("pr schema", () => {
  test("valid form parses", () => {
    expect(prFormSchema.safeParse(valid).success).toBe(true);
  });
  test("amount must be greater than zero", () => {
    const r = prFormSchema.safeParse({ ...valid, amount: 0 });
    expect(r.error?.issues[0].message).toBe("Amount must be greater than zero");
  });
  test("amount is required (empty number input gives NaN)", () => {
    expect(prFormSchema.safeParse({ ...valid, amount: Number.NaN }).success).toBe(false);
  });
  test("purpose is required", () => {
    expect(prFormSchema.safeParse({ ...valid, purpose: "  " }).error?.issues[0].message).toBe("Purpose is required");
  });
  test("toRpcPayload turns blanks into null and rounds amount to centavos", () => {
    const { header } = toRpcPayload(prFormSchema.parse({ ...valid, amount: 1234.567 }));
    expect(header.responsibility_center_code).toBeNull();
    expect(header.purpose).toBe("Supplies");
    expect(header.amount).toBe(1234.57);
  });
});
