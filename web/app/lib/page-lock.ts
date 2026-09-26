/// <reference types="vite/client" />
// Static access gate only; does not secure data APIs or encrypt the ledger.
export type SitePassword = { version: 1; salt: string; hash: string };
export function parseSitePassword(value: unknown): SitePassword {
  const config = value as SitePassword;
  if (config?.version !== 1 || !/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{64}$/.test(config.hash)) throw new Error("网站密码配置无效，请联系管理员。");
  return config;
}
export async function loadSitePassword(): Promise<SitePassword> {
  const response = await fetch(`${import.meta.env.BASE_URL}site-password.json?v=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("无法读取网站密码配置，请联网后重试。");
  return parseSitePassword(await response.json());
}
export async function verifySitePassword(config: SitePassword, password: string) {
  if (!password || password.length > 128) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(config.salt), iterations: 600000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("") === config.hash;
}
