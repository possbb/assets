"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createLockAccount, LOCK_KEY, parseLockAccount, verifyLockAccount, type LockAccount } from "../lib/page-lock";

export function PageLock({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<LockAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [settings, setSettings] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState(false);
  const clearSecrets = () => { setPassword(""); setCurrentPassword(""); setConfirm(""); };
  useEffect(() => {
    const read = () => {
      try { const saved = parseLockAccount(localStorage.getItem(LOCK_KEY)); setAccount(saved); setUsername(saved?.username ?? ""); setFatal(""); }
      catch (error) { setFatal(error instanceof Error ? error.message : "浏览器禁止保存密码配置，请允许本站使用本地存储。"); }
      setReady(true);
    };
    const changed = (event: StorageEvent) => {
      if (event.key !== LOCK_KEY && event.key !== null) return;
      setUnlocked(false); setSettings(false); clearSecrets(); read(); setMessage("账户配置已变化，请重新登录。");
    };
    read(); window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const lock = () => { setUnlocked(false); setSettings(false); clearSecrets(); setMessage(""); setUsername(account?.username ?? ""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      // Recheck the saved configuration after async hashing to handle another tab changing it.
      const original = localStorage.getItem(LOCK_KEY);
      if (JSON.stringify(parseLockAccount(original)) !== JSON.stringify(account)) throw new Error("账户配置已变化，请刷新页面后重试。");
      if (account && !settings) {
        if (!await verifyLockAccount(account, username, password)) throw new Error("账户或密码不正确");
        if (localStorage.getItem(LOCK_KEY) !== original) throw new Error("账户配置已变化，请重新登录。");
        setUnlocked(true); clearSecrets();
      } else {
        if (account && !await verifyLockAccount(account, account.username, currentPassword)) throw new Error("当前密码不正确");
        if (password !== confirm) throw new Error("两次输入的新密码不一致");
        const next = await createLockAccount(username, password);
        if (localStorage.getItem(LOCK_KEY) !== original) throw new Error("账户配置已变化，请刷新页面后重试。");
        localStorage.setItem(LOCK_KEY, JSON.stringify(next));
        setAccount(next); setUsername(next.username); setSettings(false); setUnlocked(false); clearSecrets();
        setMessage("账户密码已保存，请使用新配置登录。");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  };
  if (!ready) return <main className="page-lock-shell"><p>正在读取密码配置…</p></main>;
  if (fatal) return <main className="page-lock-shell"><section className="card page-lock-card"><h1>无法读取密码配置</h1><p role="alert">{fatal}</p><button className="button" onClick={() => window.location.reload()}>重试</button></section></main>;
  const configure = !account || settings;
  const form = <section className="card page-lock-card" aria-label={configure ? "账户密码配置" : "登录"}>
    <h1>{settings ? "账户与密码" : account ? "登录家财管家" : "设置访问账户"}</h1>
    <p className="footnote">{configure ? "配置仅保存在当前浏览器，不跨设备同步。" : "请输入账户和密码。每次打开或刷新页面均需登录。"}</p>
    <form onSubmit={submit}>
      <label>账户<input autoFocus autoComplete="username" value={username} maxLength={64} required disabled={busy} onChange={(e) => setUsername(e.target.value)} /></label>
      {settings && <label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} maxLength={128} required disabled={busy} onChange={(e) => setCurrentPassword(e.target.value)} /></label>}
      <label>{configure ? "新密码" : "密码"}<input type="password" autoComplete={configure ? "new-password" : "current-password"} value={password} minLength={configure ? 6 : undefined} maxLength={128} required disabled={busy} onChange={(e) => setPassword(e.target.value)} /></label>
      {configure && <label>再次输入新密码<input type="password" autoComplete="new-password" value={confirm} minLength={6} maxLength={128} required disabled={busy} onChange={(e) => setConfirm(e.target.value)} /></label>}
      {message && <p role="status">{message}</p>}
      <div className="actions"><button className="button button-primary" disabled={busy}>{busy ? "正在验证…" : configure ? "保存账户密码" : "登录"}</button>{settings && <button type="button" className="button" disabled={busy} onClick={() => { setSettings(false); clearSecrets(); setMessage(""); }}>取消</button>}</div>
    </form>
    <p className="footnote">静态页面锁，不是服务端身份验证，也不加密账本。清除本站浏览器数据会重置密码配置，并可能丢失本地账本，请先备份。</p>
  </section>;
  if (!unlocked) return <main className="page-lock-shell">{form}</main>;
  return <><div className="page-lock-toolbar"><span>已登录：{account?.username}</span><button className="button" onClick={() => { setSettings(true); setUsername(account?.username ?? ""); clearSecrets(); setMessage(""); }}>账户与密码</button><button className="button" onClick={lock}>退出并锁定</button></div><div hidden={settings}>{children}</div>{settings && <main className="page-lock-shell">{form}</main>}</>;
}
