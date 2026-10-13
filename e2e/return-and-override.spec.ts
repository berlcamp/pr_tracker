import { expect, test } from "@playwright/test";
import { confirm, createPr, forwardToSuggested, loginAs, receive } from "./helpers";

test("off-route forward needs a reason; return, edit with diff, re-forward", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E return flow");
  await forwardToSuggested(cswd);

  const gso = await loginAs(browser, "gso@test.local");
  await receive(gso, path);

  // Off-route forward: confirm disabled until a reason is given
  await gso.getByRole("button", { name: "Forward" }).click();
  const dialog = gso.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Destination office" }).click();
  await gso.getByRole("option", { name: "City Treasurer's Office" }).click();
  await expect(dialog).toContainText("not the default next stop");
  await expect(dialog.getByRole("button", { name: "Forward", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason for leaving the default route").fill("Testing");
  await expect(dialog.getByRole("button", { name: "Forward", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Return to CSWD
  await gso.getByRole("button", { name: "Return" }).click();
  await gso.getByRole("dialog").getByLabel("Reason").fill("Specs incomplete");
  await confirm(gso, "Return");
  await expect(gso.getByTestId("location-line")).toContainText("Returned → City Social Welfare");

  // CSWD receives, edits, re-forwards (suggestion back to GSO step 1)
  await receive(cswd, path);
  await cswd.getByRole("link", { name: "Edit" }).click();
  await cswd.getByLabel("Purpose", { exact: true }).fill("E2E return flow (revised)");
  await cswd.getByRole("button", { name: "Save changes" }).click();
  await confirm(cswd, "Save changes");
  await cswd.waitForURL(new RegExp(`${path}$`));
  await cswd.getByRole("tab", { name: "Timeline" }).click();
  await expect(cswd.getByText("after return")).toBeVisible();
  await expect(cswd.getByText('Purpose: "E2E return flow" → "E2E return flow (revised)"')).toBeVisible();
  await forwardToSuggested(cswd);
  await expect(cswd.getByTestId("location-line")).toContainText("General Services Office · for review · step 1 of 10");
});
