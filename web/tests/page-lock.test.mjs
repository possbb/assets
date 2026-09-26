import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../app/lib/page-lock.ts", import.meta.url), "utf8")).replace("import.meta.env.BASE_URL", '"/assets/"');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const lock = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const makeConfig = (password) => { const salt = randomBytes(16).toString("hex"); return { version: 1, salt, hash: pbkdf2Sync(password, salt, 600000, 32, "sha256").toString("hex") }; };
test("one site password accepts correct input and rejects wrong and rotated passwords", async () => {
  const config = makeConfig("synthetic-old-password");
  assert.equal(await lock.verifySitePassword(config, "synthetic-old-password"), true);
  assert.equal(await lock.verifySitePassword(config, "incorrect"), false);
  const rotated = makeConfig("synthetic-new-password");
  assert.equal(await lock.verifySitePassword(rotated, "synthetic-old-password"), false);
  assert.equal(await lock.verifySitePassword(rotated, "synthetic-new-password"), true);
  assert.throws(() => lock.parseSitePassword(null));
  assert.throws(() => lock.parseSitePassword({ version: 1 }));
});
test("configuration is fetched fresh and missing configuration fails closed", async () => {
  const original = globalThis.fetch;
  const config = makeConfig("synthetic-password");
  try {
    globalThis.fetch = async (url, options) => { assert.match(url, /^\/assets\/site-password.json\?v=/); assert.equal(options.cache, "no-store"); return new Response(JSON.stringify(config)); };
    assert.deepEqual(await lock.loadSitePassword(), config);
    globalThis.fetch = async () => new Response("not found", { status: 404 });
    await assert.rejects(lock.loadSitePassword());
  } finally { globalThis.fetch = original; }
});
test("visitor has no account creation/settings or browser-local password source", async () => {
  const component = await readFile(new URL("../app/components/PageLock.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(component + source, /localStorage|sessionStorage|createLockAccount|设置访问账户|保存账户密码/);
  assert.match(component, /if \(unlocked\) return/);
  for (const path of ["../main.tsx", "../app/page.tsx"]) assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /<PageLock><AssetManager \/><\/PageLock>/);
  const config = JSON.parse(await readFile(new URL("../public/site-password.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(config).sort(), ["hash", "salt", "version"]);
  lock.parseSitePassword(config);
});
