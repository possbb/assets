import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/page-lock.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const lock = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
test("local account stores a salted hash, not a password, and verifies both fields", async () => {
  const account = await lock.createLockAccount(" demo-user ", "synthetic-password");
  assert.equal(account.username, "demo-user");
  assert.equal(JSON.stringify(account).includes("synthetic-password"), false);
  assert.equal(await lock.verifyLockAccount(account, "demo-user", "synthetic-password"), true);
  assert.equal(await lock.verifyLockAccount(account, "other", "synthetic-password"), false);
  assert.equal(await lock.verifyLockAccount(account, "demo-user", "wrong-password"), false);
  const changed = await lock.createLockAccount("demo-user", "replacement-password");
  assert.notEqual(account.salt, changed.salt);
  assert.equal(await lock.verifyLockAccount(changed, "demo-user", "synthetic-password"), false);
  assert.equal(await lock.verifyLockAccount(changed, "demo-user", "replacement-password"), true);
  assert.deepEqual(lock.parseLockAccount(JSON.stringify(changed)), changed);
});
test("invalid configuration fails closed and setup validates input", async () => {
  assert.equal(lock.parseLockAccount(null), null);
  assert.throws(() => lock.parseLockAccount("{}"));
  assert.throws(() => lock.parseLockAccount("not json"));
  await assert.rejects(lock.createLockAccount("", "synthetic-password"));
  await assert.rejects(lock.createLockAccount("test", "short"));
});
test("both app entries use the lock; unlock state is not persisted", async () => {
  for (const path of ["../main.tsx", "../app/page.tsx"]) assert.match(await readFile(new URL(path, import.meta.url), "utf8"), /<PageLock><AssetManager \/><\/PageLock>/);
  const component = await readFile(new URL("../app/components/PageLock.tsx", import.meta.url), "utf8");
  assert.match(component, /if \(!unlocked\) return/);
  assert.match(component, /verifyLockAccount\(account, account.username, currentPassword\)/);
  assert.match(component, /password !== confirm/);
  assert.doesNotMatch(component, /sessionStorage/);
  assert.match(component, /localStorage.setItem\(LOCK_KEY, JSON.stringify\(next\)\)/);
});
