"use client";

import { useState } from "react";
import type { AppState } from "../lib/storage";

export function matchesQuery(query: string, fields: (string | undefined)[]) {
  const text = fields.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
  return query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

export function SearchBox({ query, onQuery, label, placeholder }: { query: string; onQuery: (value: string) => void; label: string; placeholder: string }) {
  return <div className="lookup-search"><label>{label}<input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} /></label><button className="button" onClick={() => onQuery("")} disabled={!query}>清空</button></div>;
}

export function QuickLookup({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("全部");
  const accounts = state.accounts.filter((a) => matchesQuery(query, [a.name, a.institution, a.owner, a.kind, a.category, a.status, a.currency]));
  const documents = state.documents.filter((d) => matchesQuery(query, [d.name, d.owner, d.type, d.purposeDescription, d.purposeCountry, d.purposeCategory, d.status, d.expiryDate]));
  const count = (scope !== "证照与账户资料" ? accounts.length : 0) + (scope !== "资金账户" ? documents.length : 0);
  return <section className="card">
    <h2>银行账户与证照快速查询</h2>
    <p className="footnote">搜索已导入的账户和资料；多个关键词用空格分隔，可组合查询姓名、银行、用途、国家或到期日期。</p>
    <SearchBox query={query} onQuery={setQuery} label="查询关键词" placeholder="例如：建设银行、护照、姓名 国家" />
    <div className="lookup-tabs">{["全部", "资金账户", "证照与账户资料"].map((value) => <button className="button" key={value} aria-pressed={scope === value} onClick={() => setScope(value)}>{value}</button>)}<span role="status">共 {count} 条结果</span></div>
    <div className="lookup-results">
      {scope !== "证照与账户资料" && accounts.map((a) => <article key={`account-${a.id}`}><h3>{a.name}</h3><span className="chip">资金账户 · {a.kind}</span><dl><dt>机构 / 归属人</dt><dd>{a.institution || "—"} / {a.owner || "—"}</dd><dt>资金分类</dt><dd>{a.category || "—"}</dd><dt>余额</dt><dd>{new Intl.NumberFormat("zh-CN", { style: "currency", currency: a.currency }).format(a.balanceMinor / 100)}</dd><dt>状态 / 更新日期</dt><dd>{a.status} / {a.asOfDate}</dd></dl></article>)}
      {scope !== "资金账户" && documents.map((d) => <article key={`document-${d.id}`}><h3>{d.purposeDescription || d.name}</h3><span className="chip">{d.type}</span><dl><dt>资料名称</dt><dd>{d.name}</dd><dt>归属人</dt><dd>{d.owner || "—"}</dd><dt>国家 / 用途分类</dt><dd>{d.purposeCountry || "—"} / {d.purposeCategory || "—"}</dd><dt>到期日期</dt><dd>{d.perpetual ? "长期有效" : d.expiryDate || "未填写"}</dd><dt>账户 / 资料状态</dt><dd>{d.status}</dd></dl></article>)}
    </div>
    {!count && <p className="empty">没有匹配结果，请减少关键词或清空搜索。</p>}
  </section>;
}
