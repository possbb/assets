import * as XLSX from "xlsx";
import type { Account, AppState, Asset, DocumentRecord, ExpectedCashflow, Liquidity } from "./storage";

const requiredSheets = ["账户余额", "年度收入", "年度支出", "固定资产和股票期权", "银行账户和证照信息"] as const;
const excelEpoch = Date.UTC(1899, 11, 30);

export type ImportReview = {
  skippedAssetTransfers: { source: string; reason: string }[];
  skippedRows: { source: string; reason: string }[];
  warnings: string[];
};

export type ExcelImportResult = { appState: AppState; review: ImportReview };

const today = () => new Date().toISOString().slice(0, 10);
const createImportId = (prefix: string, index: number) => `${prefix}-import-${index + 1}`;
const sourceRow = (sheet: string, row: number) => `${sheet}!${row}`;

function safeText(value: unknown, fallback = "待确认") {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function moneyMinor(value: unknown) {
  const normalized = typeof value === "string" ? value.replace(/[\s,¥￥]/g, "") : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) : 0;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}

function nextMonthDate(month: unknown) {
  const number = Number(month);
  if (!Number.isInteger(number) || number < 1 || number > 12) return null;
  const now = new Date();
  const year = now.getFullYear() + (number < now.getMonth() + 1 ? 1 : 0);
  return `${year}-${String(number).padStart(2, "0")}-01`;
}

function accountKind(sourceType: unknown): Account["kind"] {
  const text = safeText(sourceType, "");
  if (text.includes("流动")) return "现金";
  if (text.includes("不含增额寿")) return "投资";
  if (text.includes("增额寿") || text.includes("保险")) return "保险";
  if (text.includes("信用")) return "信用卡";
  return "投资";
}

function assetType(sourceType: unknown): Asset["type"] {
  const text = safeText(sourceType, "");
  if (text.includes("房") || text.includes("车位")) return "房产";
  if (text.includes("车")) return "车辆";
  if (text.includes("股票") || text.includes("期权")) return "股权/期权";
  return "其他";
}

function liquidity(kind: Account["kind"]): Liquidity {
  return kind === "现金" ? "高" : kind === "信用卡" ? "中" : "低";
}

function sheetRows(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) : [];
}

export async function importPersonalAssetWorkbook(file: File): Promise<ExcelImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const missing = requiredSheets.filter((name) => !workbook.SheetNames.includes(name));
  if (missing.length) throw new Error(`缺少必要工作表：${missing.join("、")}`);

  const review: ImportReview = { skippedAssetTransfers: [], skippedRows: [], warnings: [] };
  const accountRows = sheetRows(workbook, "账户余额").slice(1);
  const incomeRows = sheetRows(workbook, "年度收入").slice(1);
  const expenseRows = sheetRows(workbook, "年度支出").slice(1);
  const assetRows = sheetRows(workbook, "固定资产和股票期权").slice(1);
  const documentRows = sheetRows(workbook, "银行账户和证照信息").slice(1);

  const accounts: Account[] = accountRows.flatMap((row, index) => {
    const balanceMinor = moneyMinor(row[5]);
    if (!balanceMinor) {
      review.skippedRows.push({ source: sourceRow("账户余额", index + 2), reason: "金额为空或不可解析" });
      return [];
    }
    const kind = accountKind(row[2]);
    return [{ id: createImportId("acc", index), name: safeText(row[3], safeText(row[2], "导入账户")), institution: "待补录机构", owner: "待映射成员", kind, currency: "CNY", liquidity: liquidity(kind), balanceMinor, asOfDate: normalizeDate(row[1]) ?? today(), status: "活跃" }];
  });

  const assets: Asset[] = assetRows.flatMap((row, index) => {
    const stated = Number(row[10]);
    const calculated = Number(row[8]) * Number(row[9]);
    const amount = Number.isFinite(stated) && stated > 0 ? stated : Number.isFinite(calculated) ? calculated : 0;
    if (!amount) {
      review.skippedRows.push({ source: sourceRow("固定资产和股票期权", index + 2), reason: "缺少可用估值" });
      return [];
    }
    const status = row[1] === "待出售" ? "待出售" : row[1] === "待出租" ? "待出租" : row[1] === "待购置" ? "待购置" : "持有";
    return [{ id: createImportId("asset", index), name: safeText(row[2], "导入资产"), type: assetType(row[0]), owner: "待映射成员", ownershipPct: 100, grossValueMinor: moneyMinor(amount), liabilityMinor: 0, currency: "CNY", valuationDate: normalizeDate(row[6]) ?? today(), liquidity: "低", status }];
  });

  function cashflowsFromRows(rows: unknown[][], sheet: string, direction: ExpectedCashflow["direction"], natureIndex: number, amountIndex: number, monthIndex: number, itemIndex: number): ExpectedCashflow[] {
    return rows.flatMap((row, index) => {
      const source = sourceRow(sheet, index + 2);
      const amountMinor = moneyMinor(row[amountIndex]);
      if (!amountMinor) {
        review.skippedRows.push({ source, reason: "金额为空或不可解析" });
        return [];
      }
      if (safeText(row[natureIndex], "") !== "流动资金") {
        review.skippedAssetTransfers.push({ source, reason: "标记为资产变化，需人工配对为内部转账或估值，不导入现金流" });
        return [];
      }
      const dueDate = nextMonthDate(row[monthIndex]) ?? normalizeDate(row[monthIndex]);
      if (!dueDate) {
        review.skippedRows.push({ source, reason: "期间无法解析为日期" });
        return [];
      }
      return [{ id: createImportId(direction === "流入" ? "income" : "expense", index), dueDate, direction, amountMinor, currency: "CNY", category: safeText(row[2], "未分类"), title: safeText(row[itemIndex], direction === "流入" ? "导入收入" : "导入支出"), scenario: "基准", status: "待发生" }];
    });
  }

  const cashflows = [...cashflowsFromRows(incomeRows, "年度收入", "流入", 4, 5, 1, 2), ...cashflowsFromRows(expenseRows, "年度支出", "流出", 6, 7, 1, 4)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const documents: DocumentRecord[] = documentRows.flatMap((row, index) => {
    if (safeText(row[0], "") !== "证件") return [];
    const expiryDate = normalizeDate(row[8]);
    return [{ id: createImportId("doc", index), name: safeText(row[5], "待确认证照"), type: "证照", owner: "待映射成员", expiryDate: expiryDate ?? undefined, perpetual: !expiryDate, status: expiryDate ? "有效" : "待复核", secretReference: "" }];
  });

  review.warnings.push("未读取或保存备注、账号/卡号、地址、证件号、密码、验证码、邮箱或附件路径。", "导入后请先处理待映射成员、待补录机构、资产权益比例、负债余额和内部转账配对。", "一次性资产变化不会作为收入或支出导入，以避免内部转换重复计算。");
  return { appState: { version: 1, accounts, transactions: [], assets, cashflows, documents, updatedAt: new Date().toISOString() }, review };
}
