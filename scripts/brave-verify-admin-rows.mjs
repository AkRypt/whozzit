import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BRAVE =
  process.env.BRAVE_PATH ||
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const BASE = process.env.WHOZZIT_URL || "http://localhost:3000";
const password = process.env.WHOZZIT_ADMIN_PASSWORD || "";
const outDir = resolve("C:/Users/Akshit/AppData/Local/Temp/cursor/artifacts");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: BRAVE, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600);

if (await page.locator('input[type="password"]').count()) {
  if (!password) throw new Error("WHOZZIT_ADMIN_PASSWORD missing");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: resolve(outDir, "whozzit-admin-rows-brave.png"), fullPage: true });

const rowsBefore = await page.locator('ul li input[aria-label^="Question"]').count();
await page.getByRole("button", { name: "Add question" }).click();
await page.waitForTimeout(300);
const rowsAfterAdd = await page.locator('ul li input[aria-label^="Question"]').count();

const last = page.locator('ul li input[aria-label^="Question"]').last();
await last.fill("Most likely to verify admin row UI");
await page.waitForTimeout(200);

await page.locator('ul li button[aria-label^="Delete question"]').last().click();
await page.waitForTimeout(300);
const rowsAfterDelete = await page.locator('ul li input[aria-label^="Question"]').count();

const hasTextarea = (await page.locator("textarea").count()) > 0;
const result = {
  rowsBefore,
  rowsAfterAdd,
  rowsAfterDelete,
  hasTextarea,
  ok:
    !hasTextarea &&
    rowsAfterAdd === rowsBefore + 1 &&
    rowsAfterDelete === rowsBefore,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.ok ? 0 : 1);
