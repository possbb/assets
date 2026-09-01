import * as XLSX from "xlsx";
import type { Account, AppState, Asset, DocumentRecord, ExpectedCashflow, FundingForecastPoint, Liquidity } from "./storage";

const sheetNames = {
  forecast: ["资金预测"], accounts: ["账户余额（现金和投资情况）", "账户余额"], income: ["年度收入"], expenses: ["年度支出"],
  assets: ["固定资产和股票期权"], documents: ["虚拟资产和银行账户证照", "银行账户和证照信息"],
} as const;
const excelEpoch = Date.UTC(1899, 11, 30);
export type ImportReview = { skippedAssetTransfers: { source: string; reason: string }[]; skippedRows: { source: string; reason: string }[]; warnings: string[] };
export type ExcelImportResult = { appState: AppState; review: ImportReview };
type SheetRow = { rowNumber: number; values: Record<string, unknown>; formulas: Record<string, string> };
const today = () => new Date().toISOString().slice(0, 10);
const createImportId = (prefix: string, rowNumber: number) => `${prefix}-import-${rowNumber}`;
const sourceRow = (sheet: string, row: number) => `${sheet}!${row}`;

function safeText(value: unknown, fallback = "待确认") { return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback; }
function simpleFormulaNumber(formula?: string) {
  if (!formula) return null;
  const expression = formula.replace(/\s/g, "");
  if (!/^-?\d+(?:\.\d+)?(?:[+*/]-?\d+(?:\.\d+)?)*$/.test(expression)) return null;
  const tokens = expression.match(/-?\d+(?:\.\d+)?|[+*/]/g) ?? [];
  let total = Number(tokens[0]);
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index]; const value = Number(tokens[index + 1]);
    if (!Number.isFinite(value)) return null;
    if (operator === "+") total += value;
    if (operator === "-") total -= value;
    if (operator === "*") total *= value;
    if (operator === "/") total = value === 0 ? NaN : total / value;
  }
  return Number.isFinite(total) ? total : null;
}
function cellValue(cell?: XLSX.CellObject) { return !cell ? null : cell.f ? simpleFormulaNumber(cell.f) : cell.v ?? null; }
function findSheet(workbook: XLSX.WorkBook, candidates: readonly string[]) { const name = candidates.find((candidate) => workbook.SheetNames.includes(candidate)); return name ? { name, sheet: workbook.Sheets[name] } : null; }
function sheetRows(sheet: XLSX.WorkSheet): SheetRow[] {
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  if (!range) return [];
  const headers = new Map<number, string>();
  for (let column = range.s.c; column <= range.e.c; column++) {
    const value = cellValue(sheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]);
    if (typeof value === "string" && value.trim()) headers.set(column, value.trim());
  }
  const rows: SheetRow[] = [];
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const values: Record<string, unknown> = {}; const formulas: Record<string, string> = {};
    headers.forEach((header, column) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      values[header] = cellValue(cell);
      if (cell?.f) formulas[header] = cell.f;
    });
    if (Object.values(values).some((value) => value !== null && value !== "")) rows.push({ rowNumber: row + 1, values, formulas });
  }
  return rows;
}
function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[\s,¥￥]/g, "")); return Number.isFinite(parsed) ? parsed : null;
}
function moneyMinor(value: unknown) { const amount = numberValue(value); return amount === null ? null : Math.round(amount * 100); }
function normalizeDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : null;
}
function scheduleDate(value: unknown, forecastStart: string) {
  const date = normalizeDate(value); if (date) return date;
  const month = numberValue(value); if (!month || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const [year, startMonth] = forecastStart.slice(0, 7).split("-").map(Number);
  return `${year + (month < startMonth ? 1 : 0)}-${String(month).padStart(2, "0")}-01`;
}
function accountKind(category: string, item: string, amountMinor: number): Account["kind"] {
  const text = `${category}${item}`;
  if (amountMinor < 0 || text.includes("信用")) return "信用卡";
  if (text.includes("增额寿") || text.includes("保险")) return "保险";
  if (text.includes("货币资金") || text.includes("银行余额")) return "现金";
  return "投资";
}
function accountLiquidity(source: unknown, kind: Account["kind"]): Liquidity { const text = safeText(source, ""); return kind === "信用卡" ? "中" : text.includes("非灵活") ? "低" : text.includes("灵活") ? "高" : kind === "现金" ? "高" : "低"; }
function assetType(source: unknown): Asset["type"] { const text = safeText(source, ""); return text.includes("房") || text.includes("车位") ? "房产" : text.includes("车") ? "车辆" : text.includes("股票") || text.includes("期权") ? "股权/期权" : "其他"; }
function assetStatus(source: unknown): Asset["status"] { const text = safeText(source, ""); return text.includes("出售") ? "待出售" : text.includes("出租") ? "待出租" : text.includes("购置") ? "待购置" : "持有"; }
function ownership(value: unknown) { const match = safeText(value, "").match(/(\d+)\s*\/\s*(\d+)/); return match && Number(match[2]) ? Math.min(100, Math.max(0, Number(match[1]) / Number(match[2]) * 100)) : 100; }
function owner(value: unknown) { return safeText(value, "家庭").replace(/\s*\d+\s*\/\s*\d+\s*$/, ""); }
function fundingBucket(value: unknown): "灵活" | "非灵活" { return safeText(value, "").includes("非灵活") ? "非灵活" : "灵活"; }
function documentType(source: unknown): DocumentRecord["type"] { const text = safeText(source, "").toLowerCase(); return text.includes("证") || text.includes("visa") ? "证照" : "账户资料"; }
function documentStatus(source: unknown): DocumentRecord["status"] { const text = safeText(source, ""); return text.includes("活跃") || text.includes("维持") ? "有效" : "待复核"; }

function flowRows(rows: SheetRow[], sheet: string, direction: ExpectedCashflow["direction"], forecastStart: string, review: ImportReview) {
  return rows.flatMap((row) => {
    const values = row.values; const source = sourceRow(sheet, row.rowNumber);
    const amountMinor = moneyMinor(values[direction === "流入" ? "收入金额" : "支出金额"]);
    if (amountMinor === null || amountMinor === 0) { review.skippedRows.push({ source, reason: "金额为空、公式无法在浏览器中计算或为零" }); return []; }
    const dueDate = scheduleDate(values["期间（月）"], forecastStart);
    if (!dueDate) { review.skippedRows.push({ source, reason: "期间无法解析为日期" }); return []; }
    const category = safeText(values[direction === "流入" ? "收入项目" : "支出项目分类"], "未分类");
    const title = safeText(values[direction === "流入" ? "收入项目" : "支出项目"], direction === "流入" ? "导入收入" : "导入支出");
    return [{ id: createImportId(direction === "流入" ? "income" : "expense", row.rowNumber), dueDate, direction, amountMinor: Math.abs(amountMinor), currency: "CNY", category, title, scenario: "基准", status: "待发生", fundingBucket: fundingBucket(values[direction === "流入" ? "收入性质" : "支出性质"]) } satisfies ExpectedCashflow];
  });
}
function buildForecast(rows: SheetRow[], cashflows: ExpectedCashflow[], accounts: Account[]): FundingForecastPoint[] {
  const cashflowsByMonth = new Map<string, ExpectedCashflow[]>();
  cashflows.forEach((flow) => { const month = flow.dueDate.slice(0, 7); cashflowsByMonth.set(month, [...(cashflowsByMonth.get(month) ?? []), flow]); });
  let flexible = accounts.filter((account) => account.liquidity === "高").reduce((sum, account) => sum + account.balanceMinor, 0);
  let nonFlexible = accounts.filter((account) => account.liquidity === "低").reduce((sum, account) => sum + account.balanceMinor, 0);
  let liability = 0;
  return rows.flatMap((row, index) => {
    const monthDate = normalizeDate(row.values["期间-月初"]); if (!monthDate) return [];
    const directFlexible = moneyMinor(row.values["灵活资金"]); const directNonFlexible = moneyMinor(row.values["非灵活资金"]); const directTotal = moneyMinor(row.values["资金预测合计"]); const directLiability = moneyMinor(row.values["负债预测合计"]);
    if (index === 0) { flexible = directFlexible ?? flexible; nonFlexible = directNonFlexible ?? nonFlexible; liability = directLiability ?? liability; }
    else {
      const flowChange = (cashflowsByMonth.get(monthDate.slice(0, 7)) ?? []).reduce((sum, flow) => { const change = flow.direction === "流入" ? flow.amountMinor : -flow.amountMinor; return { flexible: sum.flexible + (flow.fundingBucket === "非灵活" ? 0 : change), nonFlexible: sum.nonFlexible + (flow.fundingBucket === "非灵活" ? change : 0) }; }, { flexible: 0, nonFlexible: 0 });
      const manualChange = ["日常消费-吃喝生存", "报班/学习消费（小娃上学）", "一次性消费", "回国/旅行消费", "现金预测调整项"].reduce((sum, header) => sum + (moneyMinor(row.values[header]) ?? 0), 0);
      flexible += flowChange.flexible + manualChange; nonFlexible += flowChange.nonFlexible;
      if (directLiability !== null) liability = directLiability;
      else { const increase = row.formulas["负债预测合计"]?.match(/^R\d+\+(-?\d+(?:\.\d+)?)$/)?.[1]; if (increase) liability += Math.round(Number(increase) * 100); }
    }
    return [{ month: monthDate.slice(0, 7), category: row.values["分类"] === "ACT" ? "ACT" : "FCST", flexibleMinor: flexible, nonFlexibleMinor: nonFlexible, totalMinor: directTotal ?? flexible + nonFlexible, liabilityMinor: liability }];
  });
}

export async function importPersonalAssetWorkbook(file: File): Promise<ExcelImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, sheetStubs: true });
  const matched = Object.fromEntries(Object.entries(sheetNames).map(([key, candidates]) => [key, findSheet(workbook, candidates)])) as Record<keyof typeof sheetNames, ReturnType<typeof findSheet>>;
  const missing = Object.entries(matched).filter(([, found]) => !found).map(([key]) => sheetNames[key as keyof typeof sheetNames][0]);
  if (missing.length) throw new Error(`缺少必要工作表：${missing.join("、")}`);
  const review: ImportReview = { skippedAssetTransfers: [], skippedRows: [], warnings: [] };
  const forecastRows = sheetRows(matched.forecast!.sheet); const accountRows = sheetRows(matched.accounts!.sheet); const incomeRows = sheetRows(matched.income!.sheet); const expenseRows = sheetRows(matched.expenses!.sheet); const assetRows = sheetRows(matched.assets!.sheet); const documentRows = sheetRows(matched.documents!.sheet);
  const forecastStart = normalizeDate(forecastRows[0]?.values["期间-月初"]) ?? today();
  const accounts: Account[] = accountRows.flatMap((row) => {
    const amountMinor = moneyMinor(row.values["金额"]);
    if (amountMinor === null) { review.skippedRows.push({ source: sourceRow(matched.accounts!.name, row.rowNumber), reason: "金额为空或公式无法在浏览器中计算" }); return []; }
    const category = safeText(row.values["资金分类"], "其他"); const item = safeText(row.values["具体项目"], category); const kind = accountKind(category, item, amountMinor);
    return [{ id: createImportId("acc", row.rowNumber), name: item, institution: "待补录机构", owner: owner(row.values["负责人"]), kind, currency: "CNY", liquidity: accountLiquidity(row.values["流动性分类"], kind), balanceMinor: amountMinor, asOfDate: normalizeDate(row.values["统计日期"]) ?? forecastStart, status: "活跃" }];
  });
  const assets: Asset[] = assetRows.map((row) => {
    const stated = moneyMinor(row.values["总金额"]); const quantity = numberValue(row.values["数量"]); const unitPrice = numberValue(row.values["单价"]); const grossValueMinor = stated ?? (quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice * 100) : 0);
    if (!grossValueMinor) review.skippedRows.push({ source: sourceRow(matched.assets!.name, row.rowNumber), reason: "缺少可用估值，已作为待补录资产导入且不计入净资产" });
    const rawOwner = row.values["归属人"];
    return { id: createImportId("asset", row.rowNumber), name: safeText(row.values["资产名称"], "导入资产"), type: assetType(row.values["资产类型"]), owner: owner(rawOwner), ownershipPct: ownership(rawOwner), grossValueMinor, liabilityMinor: 0, currency: "CNY", valuationDate: normalizeDate(row.values["购置时间"]) ?? forecastStart, liquidity: "低", status: assetStatus(row.values["资产状态"]) };
  });
  const cashflows = [...flowRows(incomeRows, matched.income!.name, "流入", forecastStart, review), ...flowRows(expenseRows, matched.expenses!.name, "流出", forecastStart, review)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const documents: DocumentRecord[] = documentRows.map((row) => {
    const values = row.values; const expiryDate = normalizeDate(values["到期时间"]);
    return { id: createImportId("doc", row.rowNumber), name: `${safeText(values["账户类型"], "资料")} · ${safeText(values["账户机构"], "待确认")}`, type: documentType(values["账户类型"]), owner: owner(values["归属人"]), expiryDate: expiryDate ?? undefined, perpetual: !expiryDate, status: documentStatus(values["账户状态"]), secretReference: "" };
  });
  const fundingForecast = buildForecast(forecastRows, cashflows, accounts);
  review.warnings.push("已按最新六张工作表和表头导入；未读取或保存备注、账号/卡号、地址、证件号、密码、验证码、邮箱或附件路径。", "负数账户余额按信用卡/应付款保留为负债，不会被当作负现金。", "资金预测由账户期初余额、年度收入、年度支出及资金预测中的手工消费项重新计算，不依赖被忽略的透视表。", "缺少总金额且无法由数量与单价计算的资产已导入为待补录估值，不计入净资产。");
  return { appState: { version: 1, accounts, transactions: [], assets, cashflows, documents, fundingForecast, updatedAt: new Date().toISOString() }, review };
}
