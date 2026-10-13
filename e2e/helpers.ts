import { expect, type Browser, type Page } from "@playwright/test";

export async function loginAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  // networkidle: wait for hydration, otherwise React resets filled inputs / the click submits natively
  await page.goto("/dev-login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByRole("button", { name: "Dev sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/not-authorized");
  return page;
}

export async function confirm(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function createPr(page: Page, purpose: string): Promise<string> {
  await page.goto("/prs/new", { waitUntil: "networkidle" });
  await page.getByLabel("Purpose", { exact: true }).fill(purpose);
  await page.getByLabel("Amount (₱)").fill("2455");
  await page.getByLabel(/PDF, JPG or PNG/).setInputFiles({
    name: "signed-pr.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"),
  });
  await page.getByRole("button", { name: "Create PR" }).click();
  await expect(page.getByRole("dialog")).toContainText("₱2,455.00");
  await expect(page.getByRole("dialog")).toContainText("signed-pr.pdf");
  await confirm(page, "Create PR");
  await page.waitForURL(/\/prs\/[0-9a-f-]{36}$/);
  await expect(page.getByText("PR document: signed-pr.pdf")).toBeVisible();
  return new URL(page.url()).pathname;
}

export async function forwardToSuggested(page: Page) {
  await page.getByRole("button", { name: "Forward" }).click();
  await expect(page.getByRole("dialog")).toContainText("step");
  await confirm(page, "Forward");
}

export async function receive(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Receive" }).click();
  await confirm(page, "Receive");
  await expect(page.getByTestId("location-line")).toContainText("Received at");
}
