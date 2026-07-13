import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the asset manager rather than the starter preview", async () => {
  const [page, layout, manager, storage, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/components/AssetManager.tsx", root), "utf8"),
    readFile(new URL("app/lib/storage.ts", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  assert.match(page, /AssetManager/);
  assert.match(layout, /家财管家/);
  assert.match(manager, /内部转账/);
  assert.match(manager, /IndexedDB/);
  assert.match(storage, /indexedDB\.open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
