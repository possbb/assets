import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
const compile = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString("base64")}`;
const fxUrl = compile((await readFile(new URL("../app/lib/exchange-rates.ts", import.meta.url), "utf8")).replace("import.meta.env.BASE_URL", '"/"'));
const fx = await import(fxUrl);
const rates = { date: "2026-09-25", fetchedAt: "2026-09-26T00:00:00Z", source: "Frankfurter / ECB", rates: { CNY: 1, HKD: 0.9, USD: 7 } };
test("currency aliases, blanks, rounding, debt and missing rates", () => {
  assert.equal(fx.normalizeCurrency(" 港币 "), "HKD");
  assert.equal(fx.normalizeCurrency("美元"), "USD");
  assert.equal(fx.normalizeCurrency(""), "CNY");
  assert.equal(fx.toCny(3184100, "港币", rates), 2865690);
  assert.equal(fx.toCny(60500, "USD", rates), 423500);
  assert.equal(fx.toCny(-60500, "USD", rates), -423500);
  assert.throws(() => fx.toCny(100, "ZZZ", rates), /缺少/);
  assert.throws(() => fx.validateRates({ ...rates, rates: { CNY: 1, USD: -1 } }));
});
test("display conversion does not mutate originals or convert forecast twice", () => {
  const raw = { accounts: [{ balanceMinor: 60500, currency: "USD" }], assets: [], transactions: [], cashflows: [], fundingForecast: [{ totalMinor: 10000 }] };
  const result = fx.displayInCny(raw, rates);
  assert.equal(result.accounts[0].balanceMinor, 423500);
  assert.equal(raw.accounts[0].balanceMinor, 60500);
  assert.equal(raw.accounts[0].currency, "USD");
  assert.equal(result.fundingForecast[0].totalMinor, 10000);
  assert.deepEqual(fx.displayInCny(raw, rates), result);
});
test("new workbook currency column and latest monthly snapshot", async () => {
  const source = (await readFile(new URL("../app/lib/excel-import.ts", import.meta.url), "utf8")).replace('"./exchange-rates"', JSON.stringify(fxUrl)).replace('"xlsx"', JSON.stringify(pathToFileURL(require.resolve("xlsx/xlsx.mjs")).href));
  const importer = await import(compile(source));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["期间（月）", "统计日期", "流动性分类", "资金分类", "具体项目", "负责人", "金额", "币种"],
    ["2026年9月", "2026/9/1", "灵活资金", "货币基金", "旧快照", "测试", 999, ""],
    ["2026年10月", "2026/9/1", "灵活资金", "货币基金", "外币", "测试", 605, "美元"],
    ["2026年10月", "2026/9/1", "灵活资金", "货币基金", "本币", "测试", -100, ""],
  ]), "账户余额（现金和投资情况）");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["期间-月初", "分类", "灵活资金", "非灵活资金", "资金预测合计"], ["2026/10/1", "ACT", 4135, 0, 4135]]), "资金预测");
  for (const name of ["年度收入", "年度支出", "固定资产和股票期权", "虚拟资产和银行账户证照"]) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["资料"]]), name);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(rates));
  try {
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const { appState } = await importer.importPersonalAssetWorkbook(new File([bytes], "synthetic.xlsx"));
    assert.equal(appState.accounts.length, 2);
    assert.equal(appState.accounts[0].currency, "USD");
    assert.equal(appState.accounts[0].balanceMinor, 60500);
    assert.equal(appState.accounts[1].currency, "CNY");
    assert.equal(appState.fundingForecast[0].totalMinor, 413500);
  } finally { globalThis.fetch = oldFetch; }
});
test("network failure uses labelled cache; no cache fails closed", async () => {
  const oldFetch = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.fetch = async () => { throw new Error("offline"); };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => JSON.stringify(rates) } });
  try {
    assert.equal((await fx.loadExchangeRates()).cached, true);
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null } });
    await assert.rejects(fx.loadExchangeRates(), /无法获取汇率/);
  } finally {
    globalThis.fetch = oldFetch;
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else delete globalThis.localStorage;
  }
});
