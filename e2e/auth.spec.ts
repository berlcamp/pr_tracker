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

test("sign-out is a POST from the user menu; a GET never signs an authorized user out", async ({ browser }) => {
  const page = await loginAs(browser, "cswd@test.local");
  // what a Link prefetch would do: GET the sign-out URL
  const res = await page.request.get("/auth/signout", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.headers()["location"]).not.toContain("/login");
  await page.goto("/prs");
  await expect(page).toHaveURL(/\/prs$/);

  await page.getByRole("button", { name: "Carla Cswd" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.goto("/prs");
  await expect(page).toHaveURL(/\/login\?next=%2Fprs/);
});
