import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BRAVE =
  process.env.BRAVE_PATH ||
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const BASE = process.env.WHOZZIT_URL || "http://localhost:3000";
const outDir = resolve("C:/Users/Akshit/AppData/Local/Temp/cursor/artifacts");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: BRAVE, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);

const nameInput = page.locator('input[placeholder="What should we call you?"]');
if (await nameInput.count()) {
  await nameInput.fill("Host");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(300);
}

await page.getByRole("button", { name: "Pass & play" }).click();
await page.waitForURL(/\/lobby\//, { timeout: 8000 });
await page.waitForTimeout(800);

// Add two more players to unlock Start
for (const n of ["Alex", "Sam"]) {
  await page.locator('input[placeholder="Add player"]').fill(n);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForTimeout(250);
}

const spicy = page.getByRole("button", { name: /Spicy/i }).first();
const before = await spicy.evaluate((el) => el.className);
await spicy.click();
await page.waitForTimeout(300);
const after = await spicy.evaluate((el) => el.className);
const packToggled = before !== after;

const slider = page.locator('input[type="range"]');
await slider.fill("45");
await page.waitForTimeout(200);
const timerLabel = await page.locator("span.tabular-nums").first().textContent();
const timerOk = (timerLabel || "").includes("45");

const start = page.getByRole("button", { name: "Start" });
const startEnabled = await start.isEnabled();
await start.click();
await page.waitForTimeout(600);
const inVoting = await page.getByText(/Round 1|Pass the phone|Voting as/i).count();

await page.screenshot({
  path: resolve(outDir, "whozzit-lobby-controls-brave.png"),
  fullPage: true,
});

const result = {
  packToggled,
  timerOk,
  timerLabel,
  startEnabled,
  inVoting: inVoting > 0,
  ok: packToggled && timerOk && startEnabled && inVoting > 0,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.ok ? 0 : 1);
