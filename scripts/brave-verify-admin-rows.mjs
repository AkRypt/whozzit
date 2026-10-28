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

const longQ =
  "Most likely to send a risky text after two drinks and then pretend it was autocorrect";

await page.getByRole("button", { name: "Add question" }).click();
await page.waitForTimeout(300);
const last = page.locator('textarea[aria-label^="Question"]').last();
await last.fill(longQ);
await page.waitForTimeout(400);

const box = await last.boundingBox();
const scrollH = await last.evaluate((el) => el.scrollHeight);
const clientH = await last.evaluate((el) => el.clientHeight);
const value = await last.inputValue();

await page.screenshot({
  path: resolve(outDir, "whozzit-admin-full-q-brave.png"),
  fullPage: true,
});

await page.locator('button[aria-label^="Delete question"]').last().click();
await page.waitForTimeout(200);

const hasSingleLineInput = (await page.locator('ul li input[aria-label^="Question"]').count()) > 0;
const result = {
  valueMatches: value === longQ,
  heightEnough: clientH >= 50 && scrollH <= clientH + 2,
  boxHeight: box?.height ?? 0,
  scrollH,
  clientH,
  hasSingleLineInput,
  ok: value === longQ && !hasSingleLineInput && clientH >= 50 && scrollH <= clientH + 4,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.ok ? 0 : 1);
