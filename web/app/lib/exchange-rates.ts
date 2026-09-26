/// <reference types="vite/client" />
import type { AppState } from "./storage";

export type ExchangeRates = { date: string; fetchedAt: string; source: string; rates: Record<string, number> };
const cacheKey = "asset-manager-fx-v1";
export function normalizeCurrency(value: unknown): string {
  const code = String(value ?? "").trim().toUpperCase();
  const aliases: Record<string, string> = { "": "CNY", "人民币": "CNY", "人民币元": "CNY", RMB: "CNY", "港币": "HKD", "港元": "HKD", "美元": "USD", "美金": "USD", "欧元": "EUR", "英镑": "GBP", "日元": "JPY", "澳元": "AUD", "澳币": "AUD", "加元": "CAD", "新加坡元": "SGD", "新币": "SGD", "瑞士法郎": "CHF" };
  return aliases[code] ?? code;
}
export function validateRates(value: unknown): ExchangeRates {
  const data = value as ExchangeRates;
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.fetchedAt)) || data.rates?.CNY !== 1 || data.source !== "Frankfurter / ECB") throw new Error("汇率文件格式无效");
  if (Date.parse(data.date) > Date.now() + 86400000) throw new Error("汇率日期无效");
  for (const [code, rate] of Object.entries(data.rates)) {
    if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(rate) || rate <= 0) throw new Error("汇率数值无效");
  }
  return data;
}
export async function loadExchangeRates(): Promise<{ data: ExchangeRates; cached: boolean }> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}exchange-rates.json`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("汇率文件读取失败");
    const data = validateRates(await response.json());
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* 汇率缓存不可用不影响显示。 */ }
    return { data, cached: false };
  } catch {
    try {
      const data = validateRates(JSON.parse(localStorage.getItem(cacheKey) ?? "null"));
      return { data, cached: true };
    } catch { throw new Error("无法获取汇率，暂不显示人民币汇总；请联网后重试。"); }
  }
}
export function toCny(amountMinor: number, currency: string, rates: ExchangeRates | null): number {
  const code = normalizeCurrency(currency);
  const rate = code === "CNY" ? 1 : rates?.rates[code];
  if (!rate) throw new Error(`缺少 ${code} 汇率，请核对原表币种；已暂停人民币汇总。`);
  return Math.round(amountMinor * rate);
}
export function displayInCny(state: AppState, rates: ExchangeRates | null): AppState {
  return { ...state,
    accounts: state.accounts.map((a) => ({ ...a, currency: "CNY", balanceMinor: toCny(a.balanceMinor, a.currency, rates) })),
    assets: state.assets.map((a) => ({ ...a, currency: "CNY", grossValueMinor: toCny(a.grossValueMinor, a.currency, rates), liabilityMinor: toCny(a.liabilityMinor, a.currency, rates) })),
    transactions: state.transactions.map((a) => ({ ...a, currency: "CNY", amountMinor: toCny(a.amountMinor, a.currency, rates) })),
    cashflows: state.cashflows.map((a) => ({ ...a, currency: "CNY", amountMinor: toCny(a.amountMinor, a.currency, rates) })),
  };
}
