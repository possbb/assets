import type { AppState } from "./storage";

const projectUrl = "https://hkhsxguizzozkfevksha.supabase.co";
const publishableKey = "sb_publishable_JwhGtQZESr87W-DWzLbA7w_hzyJ8TRw";
const apiUrl = `${projectUrl}/rest/v1`;

function headers(extra: HeadersInit = {}) {
  return { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, ...extra };
}

export async function readSharedState(): Promise<AppState | null> {
  const response = await fetch(`${apiUrl}/shared_asset_state?id=eq.current&select=payload,updated_at`, { headers: headers() });
  if (!response.ok) throw new Error(`线上数据读取失败（${response.status}）`);
  const rows = await response.json() as { payload: AppState; updated_at: string }[];
  const record = rows[0];
  return record ? { ...record.payload, updatedAt: record.updated_at } : null;
}

export async function replaceSharedState(state: AppState, password: string) {
  const response = await fetch(`${apiUrl}/rpc/replace_shared_asset_state`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ p_payload: state, p_password: password }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(detail?.message ?? `线上数据保存失败（${response.status}）`);
  }
}
