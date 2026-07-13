export type AccountKind = "现金" | "投资" | "保险" | "信用卡" | "其他";
export type Liquidity = "高" | "中" | "低";
export type FlowType = "收入" | "支出" | "内部转账";

export type Account = {
  id: string; name: string; institution: string; owner: string; kind: AccountKind;
  currency: string; liquidity: Liquidity; balanceMinor: number; asOfDate: string;
  status: "活跃" | "冻结" | "关闭";
};

export type Transaction = {
  id: string; date: string; type: FlowType; amountMinor: number; currency: string;
  category: string; accountId?: string; fromAccountId?: string; toAccountId?: string; note: string;
};

export type Asset = {
  id: string; name: string; type: "房产" | "车辆" | "股权/期权" | "其他"; owner: string;
  ownershipPct: number; grossValueMinor: number; liabilityMinor: number; currency: string;
  valuationDate: string; liquidity: Liquidity; status: "持有" | "待出售" | "待出租" | "待购置";
};

export type ExpectedCashflow = {
  id: string; dueDate: string; direction: "流入" | "流出"; amountMinor: number;
  currency: string; category: string; title: string; scenario: "基准" | "保守";
  status: "待发生" | "已发生" | "取消";
};

export type DocumentRecord = {
  id: string; name: string; type: "证照" | "保险" | "合同" | "账户资料"; owner: string;
  expiryDate?: string; perpetual: boolean; status: "有效" | "待复核" | "已过期";
  secretReference: string;
};

export type AppState = {
  version: 1; accounts: Account[]; transactions: Transaction[]; assets: Asset[];
  cashflows: ExpectedCashflow[]; documents: DocumentRecord[]; updatedAt: string;
};

const storeName = "app-state";
const stateKey = "current";
const addDays = (iso: string, days: number) => { const date = new Date(`${iso}T00:00:00`); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };

export function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function seedState(): AppState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    version: 1, updatedAt: new Date().toISOString(),
    accounts: [
      { id: "acc-liquid", name: "日常流动资金", institution: "示例银行", owner: "家庭", kind: "现金", currency: "CNY", liquidity: "高", balanceMinor: 34262300, asOfDate: today, status: "活跃" },
      { id: "acc-invest", name: "锁定投资组合", institution: "示例机构", owner: "家庭", kind: "投资", currency: "CNY", liquidity: "低", balanceMinor: 132543200, asOfDate: today, status: "活跃" },
      { id: "acc-insurance", name: "保险现金价值", institution: "示例保险", owner: "家庭", kind: "保险", currency: "CNY", liquidity: "低", balanceMinor: 110000000, asOfDate: today, status: "活跃" },
    ],
    transactions: [
      { id: "txn-seed-1", date: today, type: "内部转账", amountMinor: 20000000, currency: "CNY", category: "资产转换", fromAccountId: "acc-liquid", toAccountId: "acc-insurance", note: "示例：内部转账不计入收入或支出" },
    ],
    assets: [
      { id: "asset-seed-1", name: "示例不动产", type: "房产", owner: "家庭", ownershipPct: 100, grossValueMinor: 300320000, liabilityMinor: 110000000, currency: "CNY", valuationDate: today, liquidity: "低", status: "持有" },
      { id: "asset-seed-2", name: "示例期权", type: "股权/期权", owner: "家庭", ownershipPct: 100, grossValueMinor: 23000000, liabilityMinor: 0, currency: "CNY", valuationDate: today, liquidity: "低", status: "持有" },
    ],
    cashflows: [
      { id: "flow-seed-1", dueDate: addDays(today, 21), direction: "流出", amountMinor: 2800000, currency: "CNY", category: "居住", title: "月度居住与生活支出", scenario: "基准", status: "待发生" },
      { id: "flow-seed-2", dueDate: addDays(today, 28), direction: "流入", amountMinor: 450000, currency: "CNY", category: "租赁", title: "租赁收入", scenario: "基准", status: "待发生" },
      { id: "flow-seed-3", dueDate: addDays(today, 46), direction: "流出", amountMinor: 1200000, currency: "CNY", category: "教育", title: "教育与学习支出", scenario: "基准", status: "待发生" },
    ],
    documents: [
      { id: "doc-seed-1", name: "示例旅行证件", type: "证照", owner: "家庭成员", expiryDate: addDays(today, 76), perpetual: false, status: "待复核", secretReference: "" },
      { id: "doc-seed-2", name: "示例保险合同", type: "保险", owner: "家庭", perpetual: false, status: "待复核", secretReference: "vault://provider/item-id（仅引用）" },
    ],
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("family-asset-manager", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readState(): Promise<AppState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(stateKey);
    request.onsuccess = () => { db.close(); resolve((request.result as AppState | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function writeState(state: AppState) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put({ ...state, updatedAt: new Date().toISOString() }, stateKey);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
