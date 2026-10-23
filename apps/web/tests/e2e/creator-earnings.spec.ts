import { test, expect } from "@playwright/test";
import { injectWalletMock, MOCK_ADDRESS } from "./test-utils";

test.describe("Creator earnings dashboard", () => {
  test("shows attested earnings and exports the timeline as CSV", async ({ page }) => {
    await injectWalletMock(page);
    await page.route("http://localhost:3001/api/posts?**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          posts: [
            {
              id: "earnings-post-1",
              author: url.searchParams.get("author") ?? MOCK_ADDRESS,
              deleted: false,
              tip_total: "25000000",
              like_count: "4",
              created_ledger: 1000,
              deleted_ledger: null,
            },
          ],
          has_more: false,
        }),
      });
    });
    await page.route("http://localhost:4000/attestations/**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          oracleName: "e2e-oracle",
          reportHash: "e2e-report-hash",
          signature: "e2e-signature",
          txHash: "e2e-transaction",
          submittedAt: 1,
          report: {
            version: 1,
            creator: MOCK_ADDRESS,
            windowStart: "1",
            windowEnd: "1000",
            totalTips: "50000000",
            postCount: "1",
            followerDelta: "3",
            uniqueTippers: 2,
          },
        }),
      });
    });

    await page.goto("/creator");
    await page.goto("/creator/earnings");
    await expect(page.getByTestId("earnings-dashboard")).toBeVisible();
    await expect(page.getByTestId("earnings-total")).toContainText("5 XLM");
    await expect(page.getByTestId("earnings-tippers")).toContainText("2");
    await expect(page.getByRole("table")).toContainText("25000000");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-earnings-csv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("creator-earnings.csv");
  });
});
