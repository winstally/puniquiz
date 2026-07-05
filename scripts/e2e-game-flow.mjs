import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const headed = process.env.HEADED !== "0";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.resolve("test-results/e2e-game-flow");

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
if (!inviteToken) {
  throw new Error("ADMIN_INVITE_TOKEN is required for the admin-gated E2E flow");
}

fs.mkdirSync(outDir, { recursive: true });

const events = [];
function log(step, data = {}) {
  const line = { step, ...data, at: new Date().toISOString() };
  events.push(line);
  console.log(`[e2e] ${step}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ""}`);
}

function attachDiagnostics(page, name) {
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      events.push({ step: "browser-console", page: name, type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => {
    events.push({ step: "page-error", page: name, message: error.message });
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
}

async function clickByName(page, name, options = {}) {
  await page.getByRole("button", { name }).click({ timeout: 20_000, ...options });
}

async function clickFirstVisibleButton(page, names) {
  for (const name of names) {
    const locator = page.getByRole("button", { name });
    if ((await locator.count()) > 0) {
      await locator.first().click({ timeout: 20_000 });
      return name;
    }
  }
  throw new Error(`None of these buttons were visible: ${names.join(", ")}`);
}

async function visibleChoiceButton(page, names) {
  const candidates = Array.isArray(names) ? names : [names];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const name of candidates) {
      const locator = page.getByRole("button", { name });
      if ((await locator.count()) > 0 && await locator.first().isVisible()) {
        return { name, locator: locator.first() };
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Choice button not visible: ${candidates.join(" / ")}`);
}

async function joinPlayer(browser, pin, nickname, viewport, answerName) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  attachDiagnostics(page, nickname);

  await page.goto(`${baseURL}/?join=${encodeURIComponent(pin)}`);
  await clickByName(page, "次へ");
  await expect(page.getByLabel("ニックネーム")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("ニックネーム").fill(nickname);
  await clickByName(page, "参加する");
  await page.waitForURL(/\/play\//, { timeout: 30_000 });
  await expect(page.getByText("ゲーム開始を待っています")).toBeVisible({ timeout: 30_000 });
  log("player-joined", { nickname, url: page.url() });

  return { context, page, nickname, answerName };
}

async function main() {
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--window-size=1280,900"],
  });

  const contexts = [];
  try {
    const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    contexts.push(hostContext);
    const host = await hostContext.newPage();
    attachDiagnostics(host, "host");

    let hostPostCount = 0;
    host.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/host/")) {
        hostPostCount += 1;
      }
    });

    log("accept-admin-invite");
    await host.goto(`${baseURL}/admin?invite=${encodeURIComponent(inviteToken)}`);
    await Promise.all([
      host.waitForURL(
        (url) => url.pathname === "/admin" && !url.searchParams.has("invite"),
        { timeout: 30_000 },
      ),
      clickByName(host, "続行する"),
    ]);
    await expect(host.getByRole("heading", { name: "クイズスタジオ" })).toBeVisible({ timeout: 20_000 });

    log("start-demo-game");
    await host.goto(`${baseURL}/admin?demo=1`);
    await host.waitForURL(/\/host\/.+pin=/, { timeout: 30_000 });
    await expect(host.getByText("参加者を待っています")).toBeVisible({ timeout: 30_000 });
    await screenshot(host, "01-host-lobby");

    const pin = new URL(host.url()).searchParams.get("pin");
    if (!pin || !/^\d{6}$/.test(pin)) throw new Error(`Invalid game pin in host URL: ${host.url()}`);
    log("host-lobby", { pin, url: host.url() });

    await host.waitForTimeout(8000);
    const postCountBeforeIdle = hostPostCount;
    await host.waitForTimeout(5000);
    const idlePosts = hostPostCount - postCountBeforeIdle;
    if (idlePosts > 1) {
      throw new Error(`Host kept posting while idle in lobby: ${idlePosts} POSTs in 5s after stabilization`);
    }
    log("host-idle-post-check", { idlePosts, initialPosts: postCountBeforeIdle });

    const p1 = await joinPlayer(browser, pin, "E2E-正解", { width: 390, height: 844 }, "ティラミス");
    const p2 = await joinPlayer(browser, pin, "E2E-不正解", { width: 390, height: 844 }, "プリン");
    contexts.push(p1.context, p2.context);
    await screenshot(p1.page, "02-player1-lobby");
    await screenshot(p2.page, "03-player2-lobby");

    log("lock-registration");
    await clickFirstVisibleButton(host, ["応募を締め切る", "受付を締め切る"]);
    await expect(host.getByRole("button", { name: "受付を再開" })).toBeVisible({ timeout: 20_000 });

    log("start-question");
    await clickByName(host, "ゲーム開始");
    await clickByName(host, "開始する");
    await expect(p1.page.getByText("ホストの合図を待っています")).toBeVisible({ timeout: 30_000 });
    await expect(p2.page.getByText("ホストの合図を待っています")).toBeVisible({ timeout: 30_000 });
    await screenshot(host, "04-host-question-await");

    async function playRound(round, player1Answer, player2Answer, final = false) {
      log("open-answers", { round });
      await clickByName(host, "回答開始");
      const p1Choice = await visibleChoiceButton(p1.page, player1Answer);
      const p2Choice = await visibleChoiceButton(p2.page, player2Answer);

      log("players-answer", { round, player1Answer: p1Choice.name, player2Answer: p2Choice.name });
      await p1Choice.locator.click();
      await p2Choice.locator.click();
      await screenshot(p1.page, `${String(round).padStart(2, "0")}-player1-answered`);
      await screenshot(p2.page, `${String(round).padStart(2, "0")}-player2-answered`);

      log("reveal-round", { round });
      await clickByName(host, "正解発表");
      await expect(host.getByText("正解は…？")).toBeVisible({ timeout: 20_000 });
      await expect(p1.page.getByText("正解は…？")).toBeVisible({ timeout: 20_000 });
      await screenshot(host, `${String(round).padStart(2, "0")}-host-drumroll`);

      await expect(p1.page.getByText("正解！")).toBeVisible({ timeout: 12_000 });
      await expect(p2.page.getByText("おしい！")).toBeVisible({ timeout: 12_000 });
      await screenshot(p1.page, `${String(round).padStart(2, "0")}-player1-reveal`);
      await screenshot(p2.page, `${String(round).padStart(2, "0")}-player2-reveal`);

      log(final ? "advance-to-final" : "advance-to-scoreboard", { round });
      await clickByName(host, "つぎへ");
      await expect(p1.page.getByText(/現在|最終結果|位/).first()).toBeVisible({ timeout: 30_000 });
      await expect(p2.page.getByText(/現在|最終結果|位/).first()).toBeVisible({ timeout: 30_000 });
      await screenshot(host, final ? "final-host-ended" : `${String(round).padStart(2, "0")}-host-scoreboard`);

      if (final) return;

      log("advance-next-question", { round });
      await clickByName(host, "次の問題へ");
      await expect(p1.page.getByText("ホストの合図を待っています")).toBeVisible({ timeout: 30_000 });
      await expect(p2.page.getByText("ホストの合図を待っています")).toBeVisible({ timeout: 30_000 });
      await screenshot(host, `${String(round + 1).padStart(2, "0")}-host-question-await`);
    }

    await playRound(1, "ティラミス", "プリン");
    await playRound(2, "プリン", "ティラミス");
    await playRound(3, ["ロールケーキ", "ショートケーキ"], "パンケーキ", true);

    const severeEvents = events.filter((event) => event.step === "page-error");
    if (severeEvents.length > 0) {
      throw new Error(`Browser page errors detected: ${JSON.stringify(severeEvents, null, 2)}`);
    }

    fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
    log("completed", { screenshots: outDir });
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser.close();
  }
}

main().catch((error) => {
  fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
  console.error(error);
  process.exit(1);
});
