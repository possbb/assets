import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve(".local-import", "asset-manager-import.json");

if (!sourcePath) {
  console.error("Usage: node tools/import-workbook.mjs <source.xlsx> [output.json]");
  process.exit(1);
}

const REQUIRED_SHEETS = [
  "账户余额",
  "年度收入",
  "年度支出",
  "固定资产和股票期权",
  "银行账户和证照信息",
];

const excelEpoch = Date.UTC(1899, 11, 30);
const now = new Date();
const today = now.toISOString().slice(0, 10);

function excelDate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (typeof value === "number") return excelDate(value);
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function nextMonthDate(month) {
  const currentMonth = now.getMonth() + 1;
  const year = now.getFullYear() + (Number(month) < currentMonth ? 1 : 0);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function moneyMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) : 0;
}

function safeText(value, fallback = "待确认") {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, 80) : fallback;
}

function id(prefix, index) {
  return `${prefix}-import-${index + 1}`;
}

function accountKind(sourceType) {
  const text = safeText(sourceType, "");
  if (text.includes("流动")) return "现金";
  if (text.includes("增额寿") || text.includes("保险")) return "保险";
  if (text.includes("信用")) return "信用卡";
  return "投资";
}

function assetType(sourceType) {
  const text = safeText(sourceType, "");
  if (text.includes("房") || text.includes("车位")) return "房产";
  if (text.includes("车")) return "车辆";
  if (text.includes("股票") || text.includes("期权")) return "股权/期权";
  return "其他";
}

function liquidity(kind) {
  return kind === "现金" ? "高" : kind === "信用卡" ? "中" : "低";
}

function sourceRow(sheet, row) {
  return `${sheet}!${row}`;
}

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheetNames = workbook.worksheets.items.map((sheet) => sheet.name);
const missing = REQUIRED_SHEETS.filter((name) => !sheetNames.includes(name));
if (missing.length) throw new Error(`Missing required sheets: ${missing.join(", ")}`);

function values(sheetName) {
  const used = workbook.worksheets.getItem(sheetName).getUsedRange(true);
  return used?.values ?? [];
}

const accountRows = values("账户余额").slice(1);
const incomeRows = values("年度收入").slice(1);
const expenseRows = values("年度支出").slice(1);
const assetRows = values("固定资产和股票期权").slice(1);
const documentRows = values("银行账户和证照信息").slice(1);

const review = {
  skippedAssetTransfers: [],
  skippedRows: [],
  warnings: [],
};

const accounts = accountRows.flatMap((row, index) => {
  const balance = moneyMinor(row[5]);
  if (!balance) {
    review.skippedRows.push({ source: sourceRow("账户余额", index + 2), reason: "金额为空或不可解析" });
    return [];
  }
  const kind = accountKind(row[2]);
  return [{
    id: id("acc", index),
    name: safeText(row[3], safeText(row[2], "导入账户")),
    institution: "待补录机构",
    owner: "待映射成员",
    kind,
    currency: "CNY",
    liquidity: liquidity(kind),
    balanceMinor: balance,
    asOfDate: normalizeDate(row[1]) ?? today,
    status: "活跃",
  }];
});

const assets = assetRows.flatMap((row, index) => {
  const type = assetType(row[0]);
  const quantity = Number(row[8]);
  const unitPrice = Number(row[9]);
  const stated = Number(row[10]);
  const amount = Number.isFinite(stated) && stated > 0 ? stated : Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0;
  if (!amount) {
    review.skippedRows.push({ source: sourceRow("固定资产和股票期权", index + 2), reason: "缺少可用估值" });
    return [];
  }
  return [{
    id: id("asset", index),
    name: safeText(row[2], "导入资产"),
    type,
    owner: "待映射成员",
    ownershipPct: 100,
    grossValueMinor: moneyMinor(amount),
    liabilityMinor: 0,
    currency: "CNY",
    valuationDate: normalizeDate(row[6]) ?? today,
    liquidity: "低",
    status: row[1] === "待出售" ? "待出售" : row[1] === "待出租" ? "待出租" : row[1] === "待购置" ? "待购置" : "持有",
  }];
});

function cashflowsFromRows(rows, sheetName, direction, natureIndex, amountIndex, monthIndex, itemIndex) {
  return rows.flatMap((row, index) => {
    const source = sourceRow(sheetName, index + 2);
    const nature = safeText(row[natureIndex], "");
    const amount = moneyMinor(row[amountIndex]);
    if (!amount) {
      review.skippedRows.push({ source, reason: "金额为空或不可解析" });
      return [];
    }
    if (nature !== "流动资金") {
      review.skippedAssetTransfers.push({ source, reason: "标记为资产变化；需人工配对为内部转账或估值，不导入现金流" });
      return [];
    }
    const period = row[monthIndex];
    const dueDate = typeof period === "number" && period >= 1 && period <= 12 ? nextMonthDate(period) : normalizeDate(period);
    if (!dueDate) {
      review.skippedRows.push({ source, reason: "期间无法解析为日期" });
      return [];
    }
    return [{
      id: id(direction === "流入" ? "income" : "expense", index),
      dueDate,
      direction,
      amountMinor: amount,
      currency: "CNY",
      category: safeText(row[2], "未分类"),
      title: safeText(row[itemIndex], direction === "流入" ? "导入收入" : "导入支出"),
      scenario: "基准",
      status: "待发生",
    }];
  });
}

const cashflows = [
  ...cashflowsFromRows(incomeRows, "年度收入", "流入", 4, 5, 1, 2),
  ...cashflowsFromRows(expenseRows, "年度支出", "流出", 6, 7, 1, 4),
].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

const documents = documentRows.flatMap((row, index) => {
  if (safeText(row[0], "") !== "证件") return [];
  const expiryDate = normalizeDate(row[8]);
  return [{
    id: id("doc", index),
    name: safeText(row[5], "待确认证照"),
    type: "证照",
    owner: "待映射成员",
    expiryDate: expiryDate ?? undefined,
    perpetual: !expiryDate,
    status: expiryDate ? "有效" : "待复核",
    secretReference: "",
  }];
});

review.warnings.push(
  "未读取或导出备注、账号/卡号、地址、证件号、密码、验证码、邮箱或附件路径。",
  "导入后请先处理“待映射成员”“待补录机构”、资产权益比例、负债余额和内部转账配对。",
  "一次性资产变化未作为收入/支出导入，以防存单到期、保险缴费等内部转换重复计算。",
);

const appState = {
  version: 1,
  accounts,
  transactions: [],
  assets,
  cashflows,
  documents,
  updatedAt: new Date().toISOString(),
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify({ appState, review, source: path.basename(sourcePath) }, null, 2), "utf8");

console.log(JSON.stringify({
  outputPath,
  imported: { accounts: accounts.length, assets: assets.length, cashflows: cashflows.length, documents: documents.length },
  review: { skippedAssetTransfers: review.skippedAssetTransfers.length, skippedRows: review.skippedRows.length },
}, null, 2));
