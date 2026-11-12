import { chromium } from "playwright";
export const WEB = process.env.E2E_WEB, API = process.env.E2E_API, PASSWORD = "Demo@Pass2026";

export async function launch() {
  return chromium.launch({ executablePath: process.env.PW_EXECUTABLE || undefined, args: ["--no-sandbox"] });
}
export async function api(method, path, token, body, headers = {}) {
  const r = await fetch(API + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, body: j, data: j?.data };
}
export async function token(username) {
  const r = await api("POST", "/auth/login", null, { identifier: username, password: PASSWORD, deviceId: crypto.randomUUID(), platform: "android" });
  if (r.status !== 200) throw new Error(`login ${username}: ${JSON.stringify(r.body)}`);
  return r.data.accessToken;
}
export async function reauth(tok) { return (await api("POST", "/auth/reauth", tok, { password: PASSWORD })).data.reauthToken; }

/** Fresh isolated browser context signed in through the real login form. */
export async function signIn(browser, username, password = PASSWORD) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => console.error(`[pageerror ${username}]`, e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error(`[console ${username}]`, m.text().slice(0, 300)); });
  await page.goto(WEB + "/");
  await page.getByLabel("Username, email or student ID").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (password === PASSWORD) await page.getByRole("navigation", { name: "Main" }).waitFor(); // session established before any further navigation
  return { ctx, page };
}
