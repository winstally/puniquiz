import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const headed = process.env.HEADED !== "0";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.resolve("test-results/e2e-admin-editor");

function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\n/)
      .map((line) => line.match(/^([^#=\s]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
  );
}

const localEnv = readDotEnv(".env.local");
const inviteToken = process.env.ADMIN_INVITE_TOKEN ?? localEnv.ADMIN_INVITE_TOKEN;
if (!inviteToken) throw new Error("ADMIN_INVITE_TOKEN is required");

fs.mkdirSync(outDir, { recursive: true });
const events = [];
function log(step, data = {}) {
  events.push({ step, ...data, at: new Date().toISOString() });
  console.log(`[e2e-admin] ${step}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
}

function attachDiagnostics(page) {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      events.push({ step: "browser-console", type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => {
    events.push({ step: "page-error", message: error.message });
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

async function acceptInvite(page) {
  await page.goto(`${baseURL}/admin?invite=${encodeURIComponent(inviteToken)}`);
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/admin" && !url.searchParams.has("invite"), {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "続行する" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "クイズスタジオ" })).toBeVisible({ timeout: 20_000 });
}

async function main() {
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--window-size=1280,1000"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  attachDiagnostics(page);

  try {
    log("accept-admin-invite");
    await acceptInvite(page);

    log("create-blank-quiz");
    await page.getByRole("button", { name: "新しいクイズを作る" }).click();
    await page.waitForURL(/\/admin\/quizzes\//, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "クイズを編集" })).toBeVisible({ timeout: 30_000 });
    await screenshot(page, "01-editor-blank");

    log("validate-empty-save");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("未入力または範囲外の項目があります。赤字の項目を確認してください。")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("タイトルを入力してください")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("問題文を入力してください")).toBeVisible({ timeout: 20_000 });
    await screenshot(page, "02-inline-errors");

    log("fill-editor-fields");
    await page.locator('input[placeholder="かわいいスイーツ早押しクイズ"]').fill("E2E WebP クイズ");
    await page.locator('textarea[placeholder="どんなクイズか一言で"]').fill("画像圧縮と保存のE2E");
    await page.locator('textarea[placeholder="次のうち、ティラミスはどれ？"]').fill("赤い画像に近い答えはどれ？");
    const choices = page.locator(".puni-tile-input");
    await choices.nth(0).fill("赤");
    await choices.nth(1).fill("青");
    await choices.nth(2).fill("黄");
    await choices.nth(3).fill("緑");
    await page.getByRole("button", { name: "答え1を正解にする" }).click();

    log("stage-webp-image");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("画像を追加").click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles(path.resolve("public/desserts/tiramisu.webp"));
    await screenshot(page, "03-image-staged");

    log("save-quiz-with-upload");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByRole("button", { name: "もどる" })).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText("タイトルを入力してください")).toHaveCount(0, { timeout: 5_000 });
    await screenshot(page, "04-saved");

    const editLink = await page.getByLabel("編集リンク").inputValue();
    if (!/invite=/.test(editLink)) throw new Error(`Edit link does not include invite token: ${editLink}`);
    log("edit-link-includes-invite");

    const severeEvents = events.filter((event) => event.step === "page-error");
    if (severeEvents.length > 0) {
      throw new Error(`Browser page errors detected: ${JSON.stringify(severeEvents, null, 2)}`);
    }
    fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
    log("completed", { screenshots: outDir });
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
  console.error(error);
  process.exit(1);
});
