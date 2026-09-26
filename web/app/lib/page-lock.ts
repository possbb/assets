// A browser-local convenience lock, not server authentication or data encryption.
export const LOCK_KEY = "family-assets-page-lock-v1";
export type LockAccount = { version: 1; username: string; salt: string; hash: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 600000, hash: "SHA-256" }, key, 256);
  return hex(new Uint8Array(bits));
}
export function parseLockAccount(raw: string | null): LockAccount | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as LockAccount;
  if (value?.version !== 1 || typeof value.username !== "string" || !value.username.trim() || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{64}$/.test(value.hash)) throw new Error("密码配置损坏，请恢复浏览器配置或联系维护者；账本数据未删除。");
  return value;
}
export async function createLockAccount(username: string, password: string): Promise<LockAccount> {
  if (!username.trim() || username.trim().length > 64) throw new Error("请输入 1–64 个字符的账户名");
  if (password.length < 6 || password.length > 128) throw new Error("密码需为 6–128 个字符");
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, username: username.trim(), salt, hash: await passwordHash(password, salt) };
}
export async function verifyLockAccount(account: LockAccount, username: string, password: string) {
  if (password.length > 128) return false;
  return (await passwordHash(password, account.salt)) === account.hash && username.trim() === account.username;
}
