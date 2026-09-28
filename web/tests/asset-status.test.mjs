import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

test("sold assets remain distinct from assets awaiting sale on import", async () => {
  const source = await readFile(new URL("../app/lib/excel-import.ts", import.meta.url), "utf8");
  const helpers = ["safeText", "assetStatus"].map((name) => source.split("\n").find((line) => line.startsWith(`function ${name}(`))).join("\n");
  const js = ts.transpileModule(`${helpers}\nexport { assetStatus };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { assetStatus } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
  assert.equal(assetStatus(" 已出售 "), "已出售");
  assert.equal(assetStatus("待出售"), "待出售");
  assert.equal(assetStatus("持有"), "持有");
  assert.equal(assetStatus(undefined), "持有");
});

test("overview amounts and expanded details use the same unsold asset list", async () => {
  const source = await readFile(new URL("../app/components/AssetManager.tsx", import.meta.url), "utf8");
  assert.match(source, /const currentAssets = state\.assets\.filter\(\(asset\) => asset\.status !== "已出售"\)/);
  assert.match(source, /fixedAssetGroups = \[\.\.\.currentAssets\.reduce/);
  assert.match(source, /<FixedAssetSnapshot assets=\{currentAssets\}/);
});
