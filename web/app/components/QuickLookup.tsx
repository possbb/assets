"use client";

import { useState } from "react";
import type { AppState, DocumentRecord } from "../lib/storage";

function documentInstitution(document: DocumentRecord) {
  return document.institution?.trim() || document.name.split(" · ").slice(1).join(" · ").trim() || "未填写";
}

export function matchesQuery(query: string, fields: (string | undefined)[]) {
  const text = fields.filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
  return query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

export function SearchBox({ query, onQuery, label, placeholder }: { query: string; onQuery: (value: string) => void; label: string; placeholder: string }) {
  return <div className="lookup-search"><label>{label}<input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} /></label><button className="button" onClick={() => onQuery("")} disabled={!query}>清空</button></div>;
}

export function QuickLookup({ state }: { state: AppState }) {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [institution, setInstitution] = useState("");
  const owners = [...new Set(state.documents.map((d) => d.owner?.trim() || "未填写"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const institutions = [...new Set(state.documents.map(documentInstitution))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const documents = state.documents.filter((d) =>
    (!owner || (d.owner?.trim() || "未填写") === owner) &&
    (!institution || documentInstitution(d) === institution) &&
    matchesQuery(query, [d.name, d.owner, d.type, d.accountType, documentInstitution(d), d.accountNumber, d.accountNumber?.replace(/[\s-]/g, ""), d.sourceStatus, d.purposeDescription, d.purposeCountry, d.purposeCategory, d.status, d.expiryDate]));
  const count = documents.length;
  const groups = [...new Set(documents.map((document) => document.type || "未分类"))].sort();
  const statuses = [...new Set(state.documents.map((document) => document.sourceStatus?.trim()).filter((status): status is string => Boolean(status)))].sort();
  const statusColors = (status?: string) => {
    const index = statuses.indexOf(status?.trim() || "");
    if (index < 0) return { backgroundColor: "#f5f6f7", borderColor: "#cbd2d8" };
    const hue = Math.round((155 + index * 137.508) % 360);
    return { backgroundColor: `hsl(${hue} 45% 96%)`, borderColor: `hsl(${hue} 38% 52%)` };
  };
  return <section className="card">
    <h2>证照与银行账户资料查询</h2>
    <p className="footnote">查询已导入的证照与银行账户资料；多个关键词用空格分隔。</p>
    <SearchBox query={query} onQuery={setQuery} label="查询关键词" placeholder="例如：建设银行、护照、姓名 国家" />
    <div className="lookup-filters">
      <label>归属人<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">全部归属人</option>{owners.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>账户机构<select value={institution} onChange={(event) => setInstitution(event.target.value)}><option value="">全部账户机构</option>{institutions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <button className="button" disabled={!query && !owner && !institution} onClick={() => { setQuery(""); setOwner(""); setInstitution(""); }}>重置全部</button>
    </div>
    <div className="lookup-tabs"><span role="status">共 {count} 条结果</span></div>
    <div className="lookup-status-legend" aria-label="原始账户状态颜色说明"><strong>原始账户状态</strong>{[...statuses, ""].map((status) => <span key={status}><i style={statusColors(status)} />{status || "未填写"}</span>)}</div>
    {groups.map((type) => <section className="lookup-group" key={type} aria-label={type}>
    <h3 className="lookup-group-title">{type}<span>{documents.filter((document) => (document.type || "未分类") === type).length} 项</span></h3>
    <div className="lookup-results">
      {documents.filter((document) => (document.type || "未分类") === type).map((d) => {
        const parts = d.name.split(" · ");
        const remaining = d.expiryDate ? Math.ceil((new Date(`${d.expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
        const fields = [
          ["资料名称", d.name], ["资料类型", d.type],
          ["银行卡号 / 账号", d.accountNumber],
          ["账户类型", d.accountType || (parts.length > 1 ? parts[0] : "未填写")],
          ["账户机构", documentInstitution(d)],
          ["归属人", d.owner], ["账户用途描述", d.purposeDescription],
          ["账户用途国家", d.purposeCountry], ["账户用途分类", d.purposeCategory],
          ["原始账户状态", d.sourceStatus], ["资料状态", d.status],
          ["到期日期", d.expiryDate || (d.perpetual ? "长期有效（按当前记录）" : "未填写")],
          ["到期提醒", d.status === "保留但不使用" ? "已忽略提醒" : remaining === null ? "无到期日" : remaining < 0 ? `已过期 ${-remaining} 天` : remaining === 0 ? "今天到期" : `剩余 ${remaining} 天`],
        ];
        return <article key={d.id} style={statusColors(d.sourceStatus)}><h4>{d.name || "未填写资料名称"}</h4><span className="chip">{d.sourceStatus?.trim() || "原始账户状态未填写"}</span><dl>{fields.map(([label, value]) => <div className="lookup-field" key={label}><dt>{label}</dt><dd>{value || "未填写"}</dd></div>)}</dl></article>;
      })}
    </div></section>)}
    {!count && <p className="empty">没有匹配结果，请调整关键词或筛选条件，也可点击“重置全部”。</p>}
  </section>;
}
