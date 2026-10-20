import { expect, test, type Page } from "@playwright/test";
import { confirm, createPr, forwardToSuggested, loginAs, receive } from "./helpers";

test("PR travels the full default route and is completed by the Treasurer", async ({ browser }) => {
  test.setTimeout(480_000); // 11 actors/hops against next dev
  const cswd = await loginAs(browser, "cswd@test.local");
  const path = await createPr(cswd, "E2E full route");
  await forwardToSuggested(cswd);
  await expect(cswd.getByTestId("location-line")).toHaveText("In transit → General Services Office · for review · step 1 of 10");

  const route = ["gso", "mayor", "budget", "mayor", "bac", "mayor", "bac", "gso", "acctg", "treas"];
  const pages: Record<string, Page> = {};
  for (let i = 0; i < route.length; i++) {
    const who = route[i];
    pages[who] ??= await loginAs(browser, `${who}@test.local`);
    const page = pages[who];
    await receive(page, path);

    if (who === "budget") {
      await page.getByRole("button", { name: "Assign PR No." }).click();
      await page.getByRole("dialog").getByLabel("PR No.").fill("2026-10-0001");
      await confirm(page, "Save PR No.");
      await expect(page.getByText("2026-10-0001")).toBeVisible();
    }
    if (i < route.length - 1) {
      await forwardToSuggested(page);
      await expect(page.getByTestId("location-line")).toContainText(`step ${i + 2} of 10`);
    }
  }

  const treas = pages.treas;
  await expect(treas.getByText('Set the status to "Paid" before completing this PR.')).toBeVisible();
  await treas.getByRole("button", { name: "Update status" }).click();
  await treas.getByRole("dialog").getByRole("combobox", { name: "Status" }).click();
  await treas.getByRole("option", { name: "Paid" }).click();
  await confirm(treas, "Update status");
  await treas.getByRole("button", { name: "Complete" }).click();
  await confirm(treas, "Complete");
  await expect(treas.getByTestId("location-line")).toHaveText("Completed at City Treasurer's Office");

  await cswd.goto(path);
  await cswd.getByRole("tab", { name: "Timeline" }).click();
  await expect(cswd.getByText("Forwarded to Mayor's Office for signing of NOA / NTP (step 6 of 10)")).toBeVisible();
  await expect(cswd.getByRole("tabpanel").getByText("Completed", { exact: true })).toBeVisible();
});

test("notification bell shows incoming PR for destination office", async ({ browser }) => {
  const cswd = await loginAs(browser, "cswd@test.local");
  await createPr(cswd, "E2E bell");
  await forwardToSuggested(cswd);
  const gso = await loginAs(browser, "gso@test.local");
  await expect(gso.getByRole("button", { name: /Notifications \([1-9]\d* unread\)/ })).toBeVisible();
});
