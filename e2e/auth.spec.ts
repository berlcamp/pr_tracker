import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/prs");
  await expect(page).toHaveURL(/\/login\?next=%2Fprs/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("a signed-in account without a profile is declined", async ({ browser }) => {
  const page = await loginAs(browser, "nobody@test.local");
  await expect(page).toHaveURL(/\/not-authorized$/);
  await expect(page.getByText("Your account is not authorized. Please contact the administrator.")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
