/**
 * Brave smoke: home → name → pass & play → leave → stay on home (no bounce).
 * Usage: node scripts/brave-verify-leave.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BRAVE =
  process.env.BRAVE_PATH ||
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const BASE = process.env.WHOZZIT_URL || "http://localhost:3000";
const outDir = resolve("C:/Users/Akshit/AppData/Local/Temp/cursor/artifacts");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: BRAVE,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(outDir, "whozzit-home-brave.png") });

const nameInput = page.locator('input[placeholder="What should we call you?"]');
if (await nameInput.count()) {
  await nameInput.fill("Akshit");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(400);
}

await page.getByRole("button", { name: "Pass & play" }).click();
await page.waitForURL(/\/lobby\//, { timeout: 8000 });
await page.waitForTimeout(600);
await page.screenshot({ path: resolve(outDir, "whozzit-lobby-brave.png") });

await page.getByRole("button", { name: "Leave" }).click();
await page.waitForURL((url) => url.pathname === "/", { timeout: 8000 });
await page.waitForTimeout(1500);
const afterLeave = new URL(page.url()).pathname;
await page.screenshot({ path: resolve(outDir, "whozzit-after-leave-brave.png") });

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const afterReload = new URL(page.url()).pathname;
await page.screenshot({ path: resolve(outDir, "whozzit-after-reload-brave.png") });

const authNoise = errors.filter((e) => /admin-restricted|signInAnonymously|auth\//i.test(e));
const result = {
  afterLeave,
  afterReload,
  authNoise,
  otherErrors: errors.filter((e) => !/admin-restricted|signInAnonymously|auth\//i.test(e)).slice(0, 8),
  ok: afterLeave === "/" && afterReload === "/" && authNoise.length === 0,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.ok ? 0 : 1);
