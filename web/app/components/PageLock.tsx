"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { loadSitePassword, verifySitePassword, rememberAccess, readAccess, forgetAccess, SESSION_KEY, SESSION_TTL, type SitePassword } from "../lib/page-lock";

export function PageLock({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SitePassword | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadSitePassword().then((value) => { if (active) { setConfig(value); const expiry = readAccess(value); if (expiry) { setExpiresAt(expiry); setUnlocked(true); } } }).catch(() => { if (active) setMessage("无法读取网站密码配置，请联网后刷新重试。"); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY || event.key === null) {
        if (!config || !readAccess(config)) { setUnlocked(false); setPassword(""); }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [config]);
  useEffect(() => {
    if (!unlocked) return;
    const timer = window.setTimeout(() => { forgetAccess(); setUnlocked(false); setMessage("登录已超过 7 天，请重新输入密码。"); }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [unlocked, expiresAt]);
  useEffect(() => {
    if (!unlocked || !config) return;
    let active = true;
    const check = () => {
      if (Date.now() >= expiresAt) { forgetAccess(); setUnlocked(false); return; }
      void loadSitePassword().then((next) => {
      if (!active) return;
      if (next.hash !== config.hash || next.salt !== config.salt) { forgetAccess(); setUnlocked(false); setConfig(next); setMessage("管理员已更新密码，请重新输入。"); }
    }).catch(() => { /* A temporary focus-check failure does not end an existing unexpired session. */ }); };
    window.addEventListener("focus", check);
    return () => { active = false; window.removeEventListener("focus", check); };
  }, [unlocked, config, expiresAt]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      const latest = await loadSitePassword(); setConfig(latest);
      if (!await verifySitePassword(latest, password)) throw new Error("密码不正确，请重试。");
      const expiry = Date.now() + SESSION_TTL;
      if (!rememberAccess(latest, expiry)) setMessage("浏览器禁止保存登录状态，本次关闭后需要重新登录。");
      setExpiresAt(expiry); setPassword(""); setUnlocked(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "验证失败，请稍后重试。"); }
    finally { setBusy(false); }
  };
  if (unlocked) return <><div className="page-lock-toolbar"><span>{message || "已登录 · 此浏览器 7 天内免重复输入"}</span><button className="button" onClick={() => { forgetAccess(); setUnlocked(false); setPassword(""); setMessage(""); }}>退出并锁定</button></div>{children}</>;
  return <main className="page-lock-shell"><section className="card page-lock-card" aria-label="网站访问验证">
    <h1>访问家财管家</h1><p className="footnote">请输入管理员提供的访问密码。此浏览器登录后保留 7 天；共用设备请在使用后退出。</p>
    {!ready ? <p>正在读取网站配置…</p> : <form onSubmit={submit}>
      <label>访问密码<input autoFocus type="password" autoComplete="current-password" value={password} maxLength={128} required disabled={busy} onChange={(e) => setPassword(e.target.value)} /></label>
      {message && <p role="status">{message}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? "正在验证…" : "进入网站"}</button>
    </form>}
    <p className="footnote">密码由网站管理员统一设置。静态页面锁不替代服务端数据保护。</p>
  </section></main>;
}
