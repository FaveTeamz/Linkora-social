import { expect, test } from "@playwright/test";
import { injectWalletMock } from "./test-utils";

test.describe("Governance proposals", () => {
  test("opens the governance page and exposes proposal creation to a connected wallet", async ({
    page,
  }) => {
    await injectWalletMock(page);
    await page.goto("/governance");

    await expect(page.getByRole("heading", { name: "Governance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create Proposal" })).toBeVisible();
    await expect(page.getByLabel("Parameter")).toBeVisible();
    await expect(page.getByLabel("New Value (Integer)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit Proposal" })).toBeVisible();
  });

  test("keeps an empty proposal value invalid until it is filled in", async ({ page }) => {
    await injectWalletMock(page);
    await page.goto("/governance");

    const value = page.getByLabel("New Value (Integer)");
    await expect(value).toHaveAttribute("required", "");
    await expect(value).toHaveAttribute("min", "0");
    await expect(value).toHaveAttribute("step", "1");
    await expect(value).toBeInvalid();
  });
});
