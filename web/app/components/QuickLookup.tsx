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
  const documents = state.documents.filter((d) => matchesQuery(query, [d.name, d.owner, d.type, d.accountType, d.institution, d.sourceStatus, d.purposeDescription, d.purposeCountry, d.purposeCategory, d.status, d.expiryDate]));
  const count = documents.length;
  return <section className="card">
    <h2>证照与银行账户资料查询</h2>
    <p className="footnote">查询已导入的证照与银行账户资料；多个关键词用空格分隔。</p>
    <SearchBox query={query} onQuery={setQuery} label="查询关键词" placeholder="例如：建设银行、护照、姓名 国家" />
    <div className="lookup-tabs"><span role="status">共 {count} 条结果</span></div>
    <div className="lookup-results">
      {documents.map((d) => {
        const parts = d.name.split(" · ");
        const remaining = d.expiryDate ? Math.ceil((new Date(`${d.expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
        const fields = [
          ["资料名称", d.name], ["资料类型", d.type],
          ["账户类型", d.accountType || (parts.length > 1 ? parts[0] : "未填写")],
          ["账户机构", d.institution || (parts.length > 1 ? parts.slice(1).join(" · ") : "未填写")],
          ["归属人", d.owner], ["账户用途描述", d.purposeDescription],
          ["账户用途国家", d.purposeCountry], ["账户用途分类", d.purposeCategory],
          ["原始账户状态", d.sourceStatus], ["资料状态", d.status],
          ["到期日期", d.expiryDate || (d.perpetual ? "长期有效（按当前记录）" : "未填写")],
          ["到期提醒", d.status === "保留但不使用" ? "已忽略提醒" : remaining === null ? "无到期日" : remaining < 0 ? `已过期 ${-remaining} 天` : remaining === 0 ? "今天到期" : `剩余 ${remaining} 天`],
          ["保险库关联", d.secretReference ? "已关联外部保险库" : "未关联"],
        ];
        return <article key={d.id}><h3>{d.name || "未填写资料名称"}</h3><span className="chip">{d.type}</span><dl>{fields.map(([label, value]) => <div className="lookup-field" key={label}><dt>{label}</dt><dd>{value || "未填写"}</dd></div>)}</dl></article>;
      })}
    </div>
    {!count && <p className="empty">没有匹配结果，请减少关键词或清空搜索。</p>}
  </section>;
}
