import { expect, test } from "@playwright/test";
import { createPr, loginAs } from "./helpers";

test("routing slip renders QR code and one row per route step plus two blanks", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E slip");
  const id = path.split("/").pop();
  await cswd.goto(`/print/slips?ids=${id}&layout=single`);
  await expect(cswd.getByRole("img", { name: "QR code" })).toBeVisible();
  await expect(cswd.getByText("PURCHASE REQUEST ROUTING SLIP")).toBeVisible();
  await expect(cswd.locator("section tbody tr")).toHaveCount(12);
});
