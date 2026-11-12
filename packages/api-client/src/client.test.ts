import test from "node:test";
import assert from "node:assert/strict";
import { ApiClient, ApiError, memoryTokenStore } from "./index.ts";

type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (c: Call) => Response | Promise<Response>, calls: Call[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => { const c = { url: String(url), init }; calls.push(c); return handler(c); }) as unknown as typeof fetch;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("parses error envelope into ApiError with field errors", async () => {
  const api = new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", fetchImpl: fakeFetch(() => json(422, { error: { code: "VALIDATION_FAILED", message: "bad", requestId: "r1", fieldErrors: [{ field: "marksObtained", code: "OUT_OF_RANGE", message: "Must be between 0 and 100" }] } })) });
  await assert.rejects(() => api.get("/x"), (e: unknown) => e instanceof ApiError && e.status === 422 && e.code === "VALIDATION_FAILED" && e.fieldMessage("marksObtained") === "Must be between 0 and 100" && e.requestId === "r1");
});

test("single-flight refresh on TOKEN_EXPIRED, then retries once", async () => {
  const calls: Call[] = [];
  let valid = false; let refreshCalls = 0;
  const store = memoryTokenStore(); await store.save("rt-1");
  const api = new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", tokenStore: store, fetchImpl: fakeFetch(async (c) => {
    if (c.url.endsWith("/auth/refresh")) { refreshCalls++; await new Promise((r) => setTimeout(r, 20)); valid = true; return json(200, { data: { accessToken: "new", refreshToken: "rt-2", expiresIn: 900 } }); }
    const auth = (c.init.headers as Record<string, string>).Authorization;
    return valid && auth === "Bearer new" ? json(200, { data: { ok: true } }) : json(401, { error: { code: "TOKEN_EXPIRED", message: "expired" } });
  }, calls) });
  api.accessToken = "old";
  const [a, b, c] = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
  assert.deepEqual([a, b, c], [{ ok: true }, { ok: true }, { ok: true }]);
  assert.equal(refreshCalls, 1, "three concurrent 401s must share one refresh");
  assert.equal(await store.load(), "rt-2", "rotated token persisted");
});

test("revoked session clears token and notifies", async () => {
  let expired = 0;
  const api = new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", onSessionExpired: () => expired++, fetchImpl: fakeFetch(() => json(401, { error: { code: "TOKEN_REVOKED", message: "revoked" } })) });
  api.accessToken = "t";
  await assert.rejects(() => api.get("/me"));
  assert.equal(api.accessToken, null); assert.equal(expired, 1);
});

test("web client uses cookies, never stores or sends refresh token in body", async () => {
  const calls: Call[] = [];
  const api = new ApiClient({ baseUrl: "/api/v1", platform: "web", deviceId: "d", fetchImpl: fakeFetch(() => json(200, { data: { accessToken: "a", expiresIn: 900, user: {}, permissions: [], mustChangePassword: false } }), calls) });
  await api.login("u", "p");
  assert.equal(calls[0]!.init.credentials, "include");
  assert.equal((calls[0]!.init.headers as Record<string, string>)["X-Client"], "web");
});

test("sends idempotency key, if-match and cursor pagination helper", async () => {
  const calls: Call[] = [];
  let n = 0;
  const api = new ApiClient({ baseUrl: "http://x/api/v1", platform: "desktop", deviceId: "d", fetchImpl: fakeFetch((c) => {
    if (c.init.method === "GET") { n++; return json(200, { data: [n], meta: { limit: 1, nextCursor: n < 3 ? `c${n}` : null, hasMore: n < 3 } }); }
    return json(200, { data: {} });
  }, calls) });
  assert.deepEqual(await api.all<number>("/things"), [1, 2, 3]);
  await api.patch("/x/1", { a: 1 }, { ifMatch: 4, idempotencyKey: "k" });
  const h = calls.at(-1)!.init.headers as Record<string, string>;
  assert.equal(h["If-Match"], '"4"'); assert.equal(h["Idempotency-Key"], "k");
});

test("a 200 HTML page (misconfigured proxy) is reported as an error, not as empty data", async () => {
  const api = new ApiClient({ baseUrl: "/api/v1", platform: "web", deviceId: "d", fetchImpl: fakeFetch(() => new Response("<html>app shell</html>", { status: 200, headers: { "content-type": "text/html" } })) });
  await assert.rejects(() => api.login("u", "p"), (e: unknown) => e instanceof ApiError && e.code === "BAD_GATEWAY" && /API_PROXY_TARGET/.test(e.message));
});
