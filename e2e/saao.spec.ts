import { expect, test, type Page } from "@playwright/test";
import { confirm, loginAs } from "./helpers";

// One book (FY2093) carried through the whole flow, so the tests run in order.
test.describe.configure({ mode: "serial" });

const BOOK_TITLE = "FY2093 E2E Book";
const VIEWER = "mayor.viewer@x.test";
const ENCODER = "budget.encoder@x.test";
const FINALIZER = "budget.finalizer@x.test";
const NO_SUCH_REPORT = "00000000-0000-4000-8000-000000000000";

let draftPath = "";
let v1Path = "";

/** The grid row (tr) whose first cell shows this text. */
const gridRow = (page: Page, label: string, grid = "SAAO workspace") =>
  page.getByRole("grid", { name: grid }).getByRole("row").filter({ has: page.locator("td[data-col]", { hasText: label }) }).first();

async function typeIntoCell(page: Page, row: ReturnType<typeof gridRow>, col: string, text: string) {
  await row.locator(`td[data-col="${col}"]`).click();
  await page.keyboard.press("Enter");
  const input = page.getByLabel("Cell value");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toBeHidden();
  // wait for the background save to settle before navigating away
  await expect(page.getByText("Saving…")).toBeHidden();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toHaveCount(0);
}

async function openRowMenu(page: Page, label: string) {
  const row = gridRow(page, label);
  await row.locator("td[data-col]").first().click();
  await row.getByRole("button", { name: `Row actions for ${label}` }).click();
}

test("viewer sees empty dashboard and no draft", async ({ browser }) => {
  const page = await loginAs(browser, VIEWER);
  await page.goto("/budget", { waitUntil: "networkidle" });
  await expect(page.getByText(/No finalized SAAO report for .* yet\./)).toBeVisible();
  const res = await page.goto(`/budget/history/${NO_SUCH_REPORT}`);
  expect(res?.status()).toBe(404);
});

test("encoder builds a small book and drafts", async ({ browser }) => {
  // the finalizer (budget_admin) creates the book in Budget Settings
  const admin = await loginAs(browser, FINALIZER);
  await admin.goto("/budget/settings", { waitUntil: "networkidle" });
  await admin.getByRole("tab", { name: "Books" }).click();
  await admin.getByRole("button", { name: "New book" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Fiscal year").fill("2093");
  await dialog.getByLabel("Title").fill(BOOK_TITLE);
  await confirm(admin, "Create book");
  await expect(admin.getByRole("cell", { name: BOOK_TITLE })).toBeVisible();

  // the encoder builds the structure: section > PS classification > line
  const enc = await loginAs(browser, ENCODER);
  await enc.goto("/budget/saao?month=1", { waitUntil: "networkidle" });
  await expect(enc.getByRole("heading", { name: "SAAO Reports" })).toBeVisible();
  await enc.getByRole("button", { name: "Section" }).click();
  await enc.getByLabel("Cell value").fill("E2E Section");
  await enc.getByLabel("Cell value").press("Enter");
  await expect(gridRow(enc, "E2E Section")).toBeVisible();

  await openRowMenu(enc, "E2E Section");
  await enc.getByRole("menuitem", { name: "Add child" }).click();
  await enc.getByRole("menuitem", { name: "Classification…", exact: true }).click();
  await enc.getByRole("dialog").getByRole("combobox", { name: "Classification" }).click();
  await enc.getByRole("option", { name: /^PS/ }).click();
  await confirm(enc, "Add");
  await expect(gridRow(enc, "Personal Services")).toBeVisible();

  await openRowMenu(enc, "Personal Services");
  await enc.getByRole("menuitem", { name: "Add child" }).click();
  await enc.getByRole("menuitem", { name: "Line", exact: true }).click();
  await enc.getByLabel("Cell value").fill("Salaries and Wages");
  await enc.getByLabel("Cell value").press("Enter");
  const line = gridRow(enc, "Salaries and Wages");
  await expect(line).toBeVisible();

  await typeIntoCell(enc, line, "appropriation", "100000");
  await expect(line.locator('td[data-col="appropriation"]')).toHaveText("100,000.00");

  // obligation for January as an expression
  await enc.goto("/budget/data/obligations?month=1", { waitUntil: "networkidle" });
  const obLine = gridRow(enc, "Salaries and Wages", "Obligations");
  await typeIntoCell(enc, obLine, "m1", "20000+5000");
  await expect(obLine.locator('td[data-col="m1"]')).toHaveText("25,000.00");
  await expect(obLine.locator('td[data-col="total"]')).toHaveText("25,000.00");

  // draft for January
  await enc.goto("/budget/saao?month=1", { waitUntil: "networkidle" });
  await enc.getByRole("button", { name: "Create draft" }).click();
  await expect(enc.getByLabel("Report state")).toContainText("Draft v1");
  await enc.getByRole("link", { name: "Preview" }).click();
  await enc.waitForURL(/\/budget\/history\/[0-9a-f-]{36}$/);
  draftPath = new URL(enc.url()).pathname;
  const row = enc.getByRole("row").filter({ hasText: "Salaries and Wages" }).first();
  await expect(row).toContainText("100,000.00");
  await expect(row).toContainText("25,000.00");
  await expect(row).toContainText("25.00%");

  // a viewer cannot open the draft
  const viewer = await loginAs(browser, VIEWER);
  const res = await viewer.goto(draftPath);
  expect(res?.status()).toBe(404);
});

test("finalizer finalizes; viewer sees official figures; later edit does not change them", async ({ browser }) => {
  const fin = await loginAs(browser, FINALIZER);
  await fin.goto("/budget/saao?month=1", { waitUntil: "networkidle" });
  await fin.getByRole("button", { name: "Finalize", exact: true }).click();
  const dialog = fin.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /I have reviewed this report/ }).click();
  await dialog.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(fin.getByLabel("Report state")).toContainText("Finalized v1");

  const viewer = await loginAs(browser, VIEWER);
  await viewer.goto("/budget", { waitUntil: "networkidle" });
  const card = viewer.getByRole("list", { name: "Summary" }).getByRole("listitem").filter({ hasText: "Obligations" });
  await expect(card).toContainText("₱25,000.00");

  // the encoder edits the live obligation afterwards
  const enc = await loginAs(browser, ENCODER);
  await enc.goto("/budget/data/obligations?month=1", { waitUntil: "networkidle" });
  const obLine = gridRow(enc, "Salaries and Wages", "Obligations");
  await typeIntoCell(enc, obLine, "m1", "30000");
  await expect(obLine.locator('td[data-col="m1"]')).toHaveText("30,000.00");

  await viewer.reload({ waitUntil: "networkidle" });
  await expect(card).toContainText("₱25,000.00");
  await viewer.goto("/budget/history", { waitUntil: "networkidle" });
  await viewer.getByRole("link", { name: /2093-01-31/ }).first().click();
  await viewer.waitForURL(/\/budget\/history\/[0-9a-f-]{36}$/);
  v1Path = new URL(viewer.url()).pathname;
  const row = viewer.getByRole("row").filter({ hasText: "Salaries and Wages" }).first();
  await expect(row).toContainText("25,000.00");
  await expect(row).not.toContainText("30,000.00");
});

test("revision keeps v1", async ({ browser }) => {
  const fin = await loginAs(browser, FINALIZER);
  await fin.goto("/budget/saao?month=1", { waitUntil: "networkidle" });
  await fin.getByRole("button", { name: "Start revision" }).click();
  await fin.getByLabel("Reason").fill("Correct January obligation");
  await confirm(fin, "Start revision");
  await expect(fin.getByLabel("Report state")).toContainText("Draft v2");
  await fin.getByRole("button", { name: "Finalize", exact: true }).click();
  const dialog = fin.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /I have reviewed this report/ }).click();
  await dialog.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect(dialog).toBeHidden();

  await fin.goto("/budget/history", { waitUntil: "networkidle" });
  const rows = fin.getByRole("row").filter({ hasText: "2093-01-31" });
  await expect(rows.filter({ hasText: "Superseded" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Superseded" })).toContainText("v1");
  await expect(rows.filter({ hasText: "Finalized" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Finalized" })).toContainText("v2");

  await fin.goto("/budget", { waitUntil: "networkidle" });
  const card = fin.getByRole("list", { name: "Summary" }).getByRole("listitem").filter({ hasText: "Obligations" });
  await expect(card).toContainText("30,000.00");

  // v1 keeps its original figures
  await fin.goto(v1Path, { waitUntil: "networkidle" });
  const v1Row = fin.getByRole("row").filter({ hasText: "Salaries and Wages" }).first();
  await expect(v1Row).toContainText("25,000.00");
  await expect(v1Row).not.toContainText("30,000.00");
});

test("export downloads xlsx and print layout renders", async ({ browser }) => {
  const fin = await loginAs(browser, FINALIZER);
  await fin.goto("/budget/history", { waitUntil: "networkidle" });
  await fin.getByRole("row").filter({ hasText: "Finalized" }).getByRole("link").first().click();
  await fin.waitForURL(/\/budget\/history\/([0-9a-f-]{36})$/);
  const id = new URL(fin.url()).pathname.split("/").pop()!;

  const [download] = await Promise.all([
    fin.waitForEvent("download"),
    fin.getByRole("link", { name: "Export Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  await fin.goto(`/print/saao/${id}`, { waitUntil: "networkidle" });
  await expect(fin.getByText("Certified Correct:").first()).toBeVisible();
  await expect(fin.getByText("GRAND TOTAL").first()).toBeVisible();
  await fin.screenshot({ path: "test-results/saao-print.png", fullPage: true });
});
