"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Account, AccountKind, AppState, Asset, createId, DocumentRecord,
  ExpectedCashflow, FlowType, Liquidity, readState, seedState, Transaction, writeState,
} from "../lib/storage";
import { importPersonalAssetWorkbook } from "../lib/excel-import";
import { readSharedState, replaceSharedState } from "../lib/remote-storage";

type View = "总览" | "账户" | "流水" | "资产负债" | "资金预测" | "证照提醒" | "数据安全";
type DialogKind = "账户" | "流水" | "资产" | "预测" | "证照" | null;
const views: View[] = ["总览", "账户", "流水", "资产负债", "资金预测", "证照提醒", "数据安全"];
const today = () => new Date().toISOString().slice(0, 10);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const parseMoney = (value: string) => Math.round((Number(value.replace(/,/g, "")) || 0) * 100);
const daysUntil = (date?: string) => date ? Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000) : null;
function money(minor: number, currency = "CNY") {
  try { return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100); }
  catch { return `${(minor / 100).toFixed(0)} ${currency}`; }
}
function shortDate(date?: string) { return date ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`)) : "未填写"; }

export function AssetManager() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("总览");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const shared = await readSharedState();
        if (shared) {
          if (active) setState(shared);
          return;
        }
      } catch { /* 首次使用时尚未创建线上表，继续读取本地账本。 */ }
      const local = await readState().catch(() => null);
      if (active) setState(local ?? seedState());
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (state) void writeState(state).catch(() => setNotice("本地保存失败，请导出备份后重试。")); }, [state]);

  const metrics = useMemo(() => state ? calculateMetrics(state) : null, [state]);
  const update = (mutate: (draft: AppState) => void) => setState((current) => {
    if (!current) return current;
    const draft = clone(current);
    mutate(draft);
    draft.updatedAt = new Date().toISOString();
    return draft;
  });

  const exportData = () => {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `家财管家备份-${today()}.json`; link.click();
    URL.revokeObjectURL(url); setNotice("已导出本地备份。请将文件保存到加密位置。");
  };

  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as AppState | { appState?: AppState; review?: { skippedAssetTransfers?: unknown[]; skippedRows?: unknown[] } };
        const next = "appState" in payload && payload.appState ? payload.appState : payload as AppState;
        if (next.version !== 1 || !Array.isArray(next.accounts)) throw new Error("格式不匹配");
        const review = "review" in payload ? payload.review : undefined;
        const transferCount = review?.skippedAssetTransfers?.length ?? 0;
        const skippedCount = review?.skippedRows?.length ?? 0;
        setState(next); setNotice(transferCount || skippedCount ? `导入完成：仍有 ${transferCount} 条资产转换和 ${skippedCount} 条缺失/异常记录待人工复核。` : "备份已导入，本地数据已替换。");
      } catch { setNotice("无法识别该备份文件。请确认它由本应用导出。"); }
    };
    reader.readAsText(file); event.target.value = "";
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!window.confirm("Excel 导入会替换当前浏览器中的账本。建议先导出备份，是否继续？")) return;
    try {
      const { appState, review } = await importPersonalAssetWorkbook(file);
      setState(appState);
      const password = window.prompt("输入同步密码，将本次导入作为线上最新账本：");
      if (!password) {
        setNotice("Excel 已导入本地；未输入同步密码，因此没有更新线上最新账本。");
        return;
      }
      try {
        await replaceSharedState(appState, password);
        setNotice(`Excel 已导入并同步线上：${appState.accounts.length} 个账户、${appState.assets.length} 项资产、${appState.cashflows.length} 条预计现金流、${appState.fundingForecast?.length ?? 0} 个月资金预测、${appState.documents.length} 项资料。另有 ${review.skippedAssetTransfers.length} 条资产转换和 ${review.skippedRows.length} 条异常记录待复核。`);
      } catch (error) {
        setNotice(error instanceof Error ? `Excel 已导入本地，但线上同步失败：${error.message}` : "Excel 已导入本地，但线上同步失败。");
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Excel 导入失败：${error.message}` : "Excel 导入失败，请确认文件格式与工作表名称。");
    }
  };

  if (!state || !metrics) return <main className="main"><p className="muted">正在打开本地账本…</p></main>;
  const defaultDialog: DialogKind = view === "账户" ? "账户" : view === "流水" ? "流水" : view === "资产负债" ? "资产" : view === "资金预测" ? "预测" : "证照";

  return <div className="app-shell">
    <aside className="sidebar">
      <div><div className="brand-kicker">Local-first finance</div><div className="brand-name">家财管家</div><p className="brand-note">资产、资金、提醒与证照的本地账本</p></div>
      <nav className="nav" aria-label="主导航">{views.map((item) => <button key={item} type="button" aria-current={view === item ? "page" : undefined} onClick={() => { setView(item); setQuery(""); }}>{item}</button>)}</nav>
      <div className="local-badge">本地原型<br />数据保存在当前浏览器；不保存密码、PIN、CVV 或验证码。</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">家庭资产管理 · 本地 MVP</div><h1>{view}</h1><p className="subtitle">最后更新：{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.updatedAt))}</p></div>
        <div className="actions"><button className="button" type="button" onClick={exportData}>导出备份</button><label className="button">导入备份<input aria-label="导入备份文件" type="file" accept="application/json" hidden onChange={importData} /></label><label className="button">导入 Excel<input aria-label="导入 Excel 数据文件" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={importExcel} /></label><button className="button button-primary" type="button" onClick={() => setDialog(defaultDialog)}>新增记录</button></div>
      </header>
      {notice && <div className="alert"><strong>提示</strong>{notice}<button className="button" type="button" onClick={() => setNotice("")}>知道了</button></div>}
      {view === "总览" && <Dashboard state={state} onNavigate={setView} />}
      {view === "账户" && <Accounts state={state} query={query} onQuery={setQuery} />}
      {view === "流水" && <Transactions state={state} query={query} onQuery={setQuery} />}
      {view === "资产负债" && <Assets state={state} />}
      {view === "资金预测" && <Forecast state={state} />}
      {view === "证照提醒" && <Documents state={state} />}
      {view === "数据安全" && <Security reset={() => { if (window.confirm("将清除当前浏览器中的数据并恢复示例。是否继续？")) { setState(seedState()); setNotice("已恢复示例数据。"); } }} />}
      {dialog === "账户" && <AccountDialog onClose={() => setDialog(null)} onSave={(account) => { update((draft) => draft.accounts.unshift(account)); setDialog(null); setNotice("账户已添加。请在月结时更新余额快照。"); }} />}
      {dialog === "流水" && <TransactionDialog accounts={state.accounts} onClose={() => setDialog(null)} onSave={(transaction) => { update((draft) => applyTransaction(draft, transaction)); setDialog(null); setNotice(transaction.type === "内部转账" ? "转账已记入两端账户，家庭净资产不变。" : "流水已记入账户余额。"); }} />}
      {dialog === "资产" && <AssetDialog onClose={() => setDialog(null)} onSave={(asset) => { update((draft) => draft.assets.unshift(asset)); setDialog(null); setNotice("资产估值已添加。请同时维护权益比例与关联负债。"); }} />}
      {dialog === "预测" && <CashflowDialog onClose={() => setDialog(null)} onSave={(flow) => { update((draft) => draft.cashflows.push(flow)); setDialog(null); setNotice("预计现金流已添加到基准情景。"); }} />}
      {dialog === "证照" && <DocumentDialog onClose={() => setDialog(null)} onSave={(document) => { update((draft) => draft.documents.unshift(document)); setDialog(null); setNotice("证照元数据已保存；秘密请保存在外部保险库。" ); }} />}
    </main>
  </div>;
}

function calculateMetrics(state: AppState) {
  const financial = state.accounts.reduce((sum, account) => sum + account.balanceMinor, 0);
  const liquid = state.accounts.filter((account) => account.liquidity === "高").reduce((sum, account) => sum + account.balanceMinor, 0);
  const creditLiabilities = -state.accounts.filter((account) => account.balanceMinor < 0).reduce((sum, account) => sum + account.balanceMinor, 0);
  const grossAssets = state.assets.reduce((sum, asset) => sum + asset.grossValueMinor * asset.ownershipPct / 100, 0);
  const liabilities = state.assets.reduce((sum, asset) => sum + asset.liabilityMinor * asset.ownershipPct / 100, 0);
  const next90Out = state.cashflows.filter((flow) => flow.status === "待发生" && flow.direction === "流出" && (daysUntil(flow.dueDate) ?? 999) <= 90 && (daysUntil(flow.dueDate) ?? -1) >= 0).reduce((sum, flow) => sum + flow.amountMinor, 0);
  const next90In = state.cashflows.filter((flow) => flow.status === "待发生" && flow.direction === "流入" && (daysUntil(flow.dueDate) ?? 999) <= 90 && (daysUntil(flow.dueDate) ?? -1) >= 0).reduce((sum, flow) => sum + flow.amountMinor, 0);
  const upcoming = state.documents.filter((document) => !document.perpetual && document.expiryDate && (daysUntil(document.expiryDate) ?? 999) <= 90).length + state.cashflows.filter((flow) => flow.status === "待发生" && (daysUntil(flow.dueDate) ?? 999) <= 30).length;
  return { financial, liquid, creditLiabilities, grossAssets, liabilities, next90Out, next90In, upcoming, netWorth: financial + grossAssets - liabilities };
}

function Dashboard({ state, onNavigate }: { state: AppState; onNavigate: (view: View) => void }) {
  const points = cashSafetyPoints(state);
  const latestActual = [...(state.fundingForecast ?? [])].filter((point) => point.category === "ACT").sort((a, b) => b.month.localeCompare(a.month))[0];
  const accountAsOf = [...state.accounts].map((account) => account.asOfDate).sort().at(-1) ?? "待导入";
  const forecastEnd = points.at(-1)?.month ?? "—";
  const fixedAssetGroups = [...state.assets.reduce((groups, asset) => {
    const category = asset.category ?? asset.type;
    groups.set(category, (groups.get(category) ?? 0) + (asset.grossValueMinor - asset.liabilityMinor) * asset.ownershipPct / 100);
    return groups;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const fixedAssetNet = fixedAssetGroups.reduce((sum, [, amount]) => sum + amount, 0);
  const fundingCategoryGroups = (["灵活", "非灵活"] as const).map((fundingNature) => ({
    fundingNature,
    rows: [...state.accounts.filter((account) => account.category && (account.fundingNature ?? (account.liquidity === "低" ? "非灵活" : "灵活")) === fundingNature).reduce((groups, account) => {
      const category = account.category!;
      groups.set(category, (groups.get(category) ?? 0) + account.balanceMinor);
      return groups;
    }, new Map<string, number>()).entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])),
  }));
  return <>
    <section className="overview-hero"><div><div className="eyebrow">资金安全视图</div><h2>当前资金与未来现金流</h2><p>账户快照截至 {accountAsOf} · 预测覆盖至 {forecastEnd} · 实际流水不会被预测覆盖。</p></div><button className="button" type="button" onClick={() => onNavigate("资金预测")}>查看完整预测</button></section>
    <section className="overview-summary-grid" aria-label="当前资金与资产摘要">
      <OverviewSnapshot title="当前资金" value={latestActual ? money(latestActual.totalMinor) : "—"} detail={latestActual ? `资金预测 · ACT · ${latestActual.month}（最新实际期间）` : "导入资金预测中的 ACT 数据后显示"} rows={[{ label: "灵活资金", value: latestActual ? money(latestActual.flexibleMinor) : "—" }, { label: "非灵活资金", value: latestActual ? money(latestActual.nonFlexibleMinor) : "—" }]} sections={fundingCategoryGroups.map((group) => ({ title: "", className: group.fundingNature === "灵活" ? "flexible" : "non-flexible", rows: group.rows.map(([label, amount]) => ({ label, value: money(amount), tone: amount < 0 ? "negative" as const : undefined })) }))} />
      <OverviewSnapshot title="固定资产和股票期权" value={money(fixedAssetNet)} detail="仅统计“固定资产和股票期权”工作表导入的资产；按资产分类汇总" rows={fixedAssetGroups.slice(0, 3).map(([label, amount]) => ({ label, value: money(amount) }))} />
    </section>
    <section className="overview-grid"><div className="card overview-trend-card"><div className="card-header"><div><h2>按月资金趋势</h2><p className="footnote">灵活资金与非灵活资金按月连续堆积展示；悬停图形可查看资金预测合计与明细。</p></div></div><CashSafetyChart points={points} /></div><CashflowPlan state={state} onNavigate={onNavigate} /></section>
    <section className="overview-attention-row"><DashboardAttention state={state} onNavigate={onNavigate} /></section>
  </>;
}

function OverviewSnapshot({ title, value, detail, rows, sections }: { title: string; value: string; detail: string; rows: { label: string; value: string; tone?: "warn" | "negative" }[]; sections?: { title: string; className?: string; rows: { label: string; value: string; tone?: "warn" | "negative" }[] }[] }) {
  const rowTemplate = sections?.map((section) => `${Math.max(1, section.rows.length)}fr`).join(" ");
  return <article className="card overview-snapshot"><div className="overview-snapshot-main"><span>{title}</span><strong className="money">{value}</strong><p>{detail}</p></div><div className="overview-snapshot-rows" style={rowTemplate ? { gridTemplateRows: rowTemplate } : undefined}>{rows.map((row) => <div className="overview-snapshot-row" key={row.label}><span>{row.label}</span><strong className={`money ${row.tone ?? ""}`}>{row.value}</strong></div>)}</div>{sections && <div className="overview-snapshot-sections" style={{ gridTemplateRows: rowTemplate }}>{sections.map((section, index) => <div className={`overview-snapshot-section ${section.className ?? ""}`} key={`${section.title}-${index}`}>{section.title && <span className="overview-snapshot-section-title">{section.title}</span>}{section.rows.map((row) => <div className="overview-snapshot-row" key={row.label}><span>{row.label}</span><strong className={`money ${row.tone ?? ""}`}>{row.value}</strong></div>)}</div>)}</div>}</article>;
}
function CashflowPlan({ state, onNavigate }: { state: AppState; onNavigate: (view: View) => void }) {
  const flows = state.cashflows.filter((flow) => flow.status === "待发生" && (daysUntil(flow.dueDate) ?? 999) >= 0 && (daysUntil(flow.dueDate) ?? 999) <= 90).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const inflow = flows.filter((flow) => flow.direction === "流入").reduce((sum, flow) => sum + flow.amountMinor, 0);
  const outflow = flows.filter((flow) => flow.direction === "流出").reduce((sum, flow) => sum + flow.amountMinor, 0);
  return <div className="card cashflow-plan"><div className="card-header"><div><h2>未来90天现金流与资金安排</h2><p className="footnote">流入、流出和具体计划在同一时间窗口核对。</p></div><button className="button" type="button" onClick={() => onNavigate("资金预测")}>全部计划</button></div><div className="cashflow-plan-summary"><div><span>预计流入</span><strong className="money inflow">{money(inflow)}</strong></div><div><span>预计流出</span><strong className="money outflow">{money(outflow)}</strong></div><div><span>预计净额</span><strong className={`money ${inflow - outflow < 0 ? "negative" : ""}`}>{money(inflow - outflow)}</strong></div></div><CashflowRows cashflows={flows.slice(0, 10)} showFundingBucket /></div>;
}

function DashboardAttention({ state, onNavigate }: { state: AppState; onNavigate: (view: View) => void }) {
  const alerts = getAlerts(state);
  const expiryAlerts = alerts.filter((alert) => alert.id.startsWith("doc"));
  return <div className="card"><div className="card-header"><div><h2>到期提醒</h2><p className="footnote">仅提示证照、账户资料等临近到期或已过期项目。</p></div><button className="button" type="button" onClick={() => onNavigate("证照提醒")}>全部提醒</button></div><div className="attention-group">{expiryAlerts.slice(0, 4).map((alert) => <div className={`alert ${alert.level}`} key={alert.id}><strong>{alert.title}</strong>{alert.detail}</div>)}{expiryAlerts.length === 0 && <p className="muted">当前没有临近的到期资料。</p>}</div></div>;
}

type CashSafetyPoint = { month: string; flexibleMinor: number; nonFlexibleMinor: number; totalMinor: number };
function normalizedForecastMonth(month: string) {
  const [year, rawMonth] = month.split("-").map(Number);
  if (!year || !rawMonth) return month;
  const date = new Date(year, rawMonth - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function cashSafetyPoints(state: AppState): CashSafetyPoint[] {
  if (state.fundingForecast?.length) return state.fundingForecast.map((point) => ({ month: normalizedForecastMonth(point.month), flexibleMinor: point.flexibleMinor, nonFlexibleMinor: point.nonFlexibleMinor, totalMinor: point.totalMinor })).sort((a, b) => a.month.localeCompare(b.month));
  const liquid = state.accounts.filter((account) => account.liquidity === "高").reduce((sum, account) => sum + account.balanceMinor, 0);
  const investment = state.accounts.filter((account) => account.liquidity === "低").reduce((sum, account) => sum + account.balanceMinor, 0);
  return buildFallbackForecast(liquid, investment, state.cashflows).map((point) => ({ month: point.month, flexibleMinor: point.liquid, nonFlexibleMinor: point.investment, totalMinor: point.total }));
}

function CashSafetyChart({ points }: { points: CashSafetyPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [rangeMonths, setRangeMonths] = useState(24);
  if (points.length < 2) return <p className="empty">导入至少两个月的资金预测后显示趋势。</p>;
  const rangeOptions = Array.from({ length: Math.max(1, Math.floor(points.length / 12)) }, (_, index) => (index + 1) * 12);
  const selectedRange = Math.min(rangeMonths, rangeOptions.at(-1) ?? points.length);
  const visiblePoints = points.slice(0, selectedRange);
  const width = 920; const height = 338; const padding = { top: 22, right: 24, bottom: 68, left: 78 };
  const plotWidth = width - padding.left - padding.right; const plotHeight = height - padding.top - padding.bottom; const baseline = padding.top + plotHeight;
  const maximum = Math.max(1, ...visiblePoints.map((point) => Math.max(point.totalMinor, point.flexibleMinor + point.nonFlexibleMinor)));
  const x = (index: number) => padding.left + index / (visiblePoints.length - 1) * plotWidth;
  const y = (value: number) => baseline - Math.max(0, value) / maximum * plotHeight;
  const areaPath = (upper: (point: CashSafetyPoint) => number, lower: (point: CashSafetyPoint) => number) => `M ${visiblePoints.map((point, index) => `${x(index)} ${y(upper(point))}`).join(" L ")} L ${[...visiblePoints].reverse().map((point, index) => `${x(visiblePoints.length - 1 - index)} ${y(lower(point))}`).join(" L ")} Z`;
  const compact = (amount: number) => { const yuan = amount / 100; return yuan >= 100000000 ? `¥${(yuan / 100000000).toFixed(1)}亿` : `¥${Math.round(yuan / 10000)}万`; };
  const monthLabel = (month: string) => { const [year, monthNumber] = month.split("-"); return `${year.slice(-2)}-${Number(monthNumber)}`; };
  const labelEvery = Math.max(1, Math.ceil(visiblePoints.length / 24));
  const flexibleExtremes = visiblePoints.reduce((extremes, point, index) => ({
    highest: point.flexibleMinor > visiblePoints[extremes.highest].flexibleMinor ? index : extremes.highest,
    lowest: point.flexibleMinor < visiblePoints[extremes.lowest].flexibleMinor ? index : extremes.lowest,
  }), { highest: 0, lowest: 0 });
  const flexibleLabelIndexes = new Set([flexibleExtremes.highest, flexibleExtremes.lowest]);
  const active = activeIndex === null ? null : visiblePoints[activeIndex] ?? null;
  const tooltipX = activeIndex === null ? 0 : Math.max(padding.left, Math.min(width - padding.right - 178, x(activeIndex) - 82));
  return <section className="cash-safety-chart"><div className="cash-safety-legend"><span><i className="funding-stack-swatch non-flexible" />非灵活资金</span><span><i className="funding-stack-swatch flexible" />灵活资金</span><label className="funding-range">显示范围<select aria-label="资金趋势显示范围" value={selectedRange} onChange={(event) => { setActiveIndex(null); setRangeMonths(Number(event.target.value)); }}>{rangeOptions.map((months) => <option value={months} key={months}>近 {months} 个月</option>)}</select></label><span className="cash-safety-hint">悬停查看当月明细</span></div><svg className="funding-area-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="按月连续堆积面积图，底层为非灵活资金，上层为灵活资金。" onMouseLeave={() => setActiveIndex(null)}><defs><linearGradient id="funding-non-flexible-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d5a551" stopOpacity=".78" /><stop offset="100%" stopColor="#f7e9ca" stopOpacity=".42" /></linearGradient><linearGradient id="funding-flexible-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2c8c78" stopOpacity=".74" /><stop offset="100%" stopColor="#bde6d7" stopOpacity=".45" /></linearGradient><filter id="funding-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#102a25" floodOpacity=".2" /></filter><clipPath id="funding-plot-clip"><rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="10" /></clipPath></defs><rect className="funding-area-background" x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="10" /><line className="funding-trend-grid" x1={padding.left} x2={width - padding.right} y1={padding.top} y2={padding.top} /><line className="funding-trend-grid" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight / 2} y2={padding.top + plotHeight / 2} /><line className="funding-trend-grid" x1={padding.left} x2={width - padding.right} y1={baseline} y2={baseline} /><text className="funding-trend-axis" x={padding.left - 10} y={padding.top + 4} textAnchor="end">{compact(maximum)}</text><text className="funding-trend-axis" x={padding.left - 10} y={baseline + 4} textAnchor="end">¥0</text><g clipPath="url(#funding-plot-clip)"><path className="funding-area-non-flexible" d={areaPath((point) => point.nonFlexibleMinor, () => 0)} /><path className="funding-area-flexible" d={areaPath((point) => point.nonFlexibleMinor + point.flexibleMinor, (point) => point.nonFlexibleMinor)} /><polyline className="funding-area-boundary non-flexible" points={visiblePoints.map((point, index) => `${x(index)},${y(point.nonFlexibleMinor)}`).join(" ")} /><polyline className="funding-area-boundary flexible" points={visiblePoints.map((point, index) => `${x(index)},${y(point.nonFlexibleMinor + point.flexibleMinor)}`).join(" ")} />{visiblePoints.map((point, index) => flexibleLabelIndexes.has(index) ? <text className="funding-flexible-value" key={`value-${point.month}`} x={x(index)} y={y(point.nonFlexibleMinor + point.flexibleMinor / 2)} textAnchor="middle">{compact(point.flexibleMinor)}</text> : null)}{active && <><line className="funding-active-guide" x1={x(activeIndex!)} x2={x(activeIndex!)} y1={padding.top} y2={baseline} /><circle className="funding-active-dot non-flexible" cx={x(activeIndex!)} cy={y(active.nonFlexibleMinor)} r="4" /><circle className="funding-active-dot flexible" cx={x(activeIndex!)} cy={y(active.nonFlexibleMinor + active.flexibleMinor)} r="4" /></>}</g>{visiblePoints.map((point, index) => <g key={point.month} className={activeIndex === index ? "funding-stack active" : "funding-stack"} tabIndex={0} aria-label={`${point.month}，资金预测合计 ${money(point.totalMinor)}，灵活资金 ${money(point.flexibleMinor)}，非灵活资金 ${money(point.nonFlexibleMinor)}`} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)}><rect className="funding-stack-hit" x={x(index) - plotWidth / visiblePoints.length / 2} y={padding.top} width={plotWidth / visiblePoints.length} height={plotHeight} /><text className="funding-time-axis" transform={`translate(${x(index)},${height - 20}) rotate(-45)`} textAnchor="end">{index % labelEvery === 0 || index === visiblePoints.length - 1 ? monthLabel(point.month) : ""}</text></g>)}{active && <g className="funding-stack-tooltip" transform={`translate(${tooltipX},${padding.top + 12})`} pointerEvents="none" filter="url(#funding-tooltip-shadow)"><rect width="178" height="84" rx="10" /><text x="12" y="20" className="funding-stack-tooltip-title">{active.month}</text><text x="12" y="41">资金预测合计 {money(active.totalMinor)}</text><text x="12" y="59">灵活资金 {money(active.flexibleMinor)}</text><text x="12" y="77">非灵活资金 {money(active.nonFlexibleMinor)}</text></g>}</svg></section>;
}

function Accounts({ state, query, onQuery }: { state: AppState; query: string; onQuery: (value: string) => void }) {
  const rows = state.accounts.filter((account) => `${account.name}${account.institution}${account.owner}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="card"><div className="card-header"><div><h2>账户与余额快照</h2><p className="footnote">余额是账户最新快照，不录入账号、卡号或登录秘密。</p></div><input className="search" aria-label="搜索账户" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索账户、机构或归属人" /></div><div className="table-wrap"><table><thead><tr><th>账户</th><th>机构/归属</th><th>类型</th><th>流动性</th><th>余额</th><th>截至日期</th></tr></thead><tbody>{rows.map((account) => <tr key={account.id}><td><strong>{account.name}</strong><div className="footnote">{account.status}</div></td><td>{account.institution}<div className="footnote">{account.owner}</div></td><td>{account.kind}</td><td><span className={`chip ${account.liquidity === "低" ? "muted" : account.liquidity === "中" ? "warn" : ""}`}>{account.liquidity}</span></td><td className="money">{money(account.balanceMinor, account.currency)}</td><td>{account.asOfDate}</td></tr>)}</tbody></table></div>{rows.length === 0 && <p className="empty">没有匹配账户。</p>}</section>;
}

function Transactions({ state, query, onQuery }: { state: AppState; query: string; onQuery: (value: string) => void }) {
  const accountName = (id?: string) => state.accounts.find((account) => account.id === id)?.name ?? "未关联";
  const rows = state.transactions.filter((transaction) => `${transaction.type}${transaction.category}${transaction.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="card"><div className="card-header"><div><h2>实际流水与内部转账</h2><p className="footnote">收入、支出影响一个账户；内部转账同时影响来源和去向，不改变家庭总额。</p></div><input className="search" aria-label="搜索流水" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索分类或备注" /></div><div className="table-wrap"><table><thead><tr><th>日期</th><th>类型/分类</th><th>账户路径</th><th>金额</th><th>备注</th></tr></thead><tbody>{rows.map((transaction) => <tr key={transaction.id}><td>{transaction.date}</td><td><span className={`chip ${transaction.type === "支出" ? "danger" : transaction.type === "内部转账" ? "muted" : ""}`}>{transaction.type}</span><div className="footnote">{transaction.category}</div></td><td>{transaction.type === "内部转账" ? `${accountName(transaction.fromAccountId)} → ${accountName(transaction.toAccountId)}` : accountName(transaction.accountId)}</td><td className={`money ${transaction.type === "支出" ? "negative" : ""}`}>{transaction.type === "支出" ? "-" : transaction.type === "收入" ? "+" : "↔"}{money(transaction.amountMinor, transaction.currency)}</td><td>{transaction.note || "—"}</td></tr>)}</tbody></table></div>{rows.length === 0 && <p className="empty">还没有流水记录。</p>}</section>;
}

function Assets({ state }: { state: AppState }) {
  const totals = state.assets.reduce((sum, asset) => {
    const share = asset.ownershipPct / 100;
    sum.gross += asset.grossValueMinor * share;
    sum.liability += asset.liabilityMinor * share;
    return sum;
  }, { gross: 0, liability: 0 });
  const netTotal = totals.gross - totals.liability;
  return <section className="card"><div className="card-header"><div><h2>资产、估值与关联负债</h2><p className="footnote">当前价值以最新估值为准；成本、市场价、行权价和贷款余额应分开维护。</p></div></div><div className="table-wrap"><table><thead><tr><th>资产</th><th>归属/权益</th><th>状态</th><th>估值日期</th><th>毛值</th><th>关联负债</th><th>净值</th></tr></thead><tbody>{state.assets.map((asset) => { const share = asset.ownershipPct / 100; const net = (asset.grossValueMinor - asset.liabilityMinor) * share; return <tr key={asset.id}><td><strong>{asset.name}</strong><div className="footnote">{asset.type} · {asset.liquidity}流动性</div></td><td>{asset.owner}<div className="footnote">{asset.ownershipPct}%</div></td><td><span className="chip muted">{asset.status}</span></td><td>{asset.valuationDate}</td><td className="money">{money(asset.grossValueMinor * share, asset.currency)}</td><td className="money negative">-{money(asset.liabilityMinor * share, asset.currency)}</td><td className="money">{money(net, asset.currency)}</td></tr>; })}</tbody><tfoot><tr><th colSpan={4}>合计</th><td className="money">{money(totals.gross)}</td><td className="money negative">-{money(totals.liability)}</td><td className="money">{money(netTotal)}</td></tr></tfoot></table></div>{state.assets.length === 0 && <p className="empty">还没有资产记录。</p>}</section>;
}

function Forecast({ state }: { state: AppState }) {
  const flows = state.cashflows.filter((flow) => flow.scenario === "基准" && flow.status === "待发生").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const net = flows.reduce((sum, flow) => sum + (flow.direction === "流入" ? flow.amountMinor : -flow.amountMinor), 0);
  return <><section className="metric-grid"><Metric label="基准情景净现金流" value={money(net)} detail="所有待发生、基准情景记录" tone={net < 0 ? "warn" : "good"} /><Metric label="待发生事项" value={`${flows.length} 项`} detail="需在月结时与实际流水核对" tone="good" /><Metric label="最近一笔" value={flows[0] ? shortDate(flows[0].dueDate) : "—"} detail={flows[0]?.title ?? "暂无计划"} tone="good" /><Metric label="导入预测" value={`${state.fundingForecast?.length ?? 0} 月`} detail="以资金预测表为准，不依赖透视表" tone="good" /></section><section className="card" style={{ marginTop: 16 }}><div className="card-header"><div><h2>资金余额结构</h2><p className="footnote">展示灵活资金、非灵活资金、总资金与负债；优先使用最新导入的资金预测。</p></div></div><FundingBalanceChart state={state} /></section><section className="card" style={{ marginTop: 16 }}><div className="card-header"><div><h2>预计现金流</h2><p className="footnote">预测是独立计划，不会自动改变账户余额；发生后请新增实际流水并标记已发生。</p></div></div><CashflowRows cashflows={flows} /></section></>;
}

function FundingBalanceChart({ state }: { state: AppState }) {
  const imported = state.fundingForecast?.length ? state.fundingForecast : undefined;
  const latest = imported?.at(-1);
  const liquid = latest?.flexibleMinor ?? state.accounts.filter((account) => account.liquidity === "高").reduce((sum, account) => sum + account.balanceMinor, 0);
  const investment = latest?.nonFlexibleMinor ?? state.accounts.filter((account) => account.liquidity === "低").reduce((sum, account) => sum + account.balanceMinor, 0);
  const total = latest?.totalMinor ?? liquid + investment;
  const liability = latest?.liabilityMinor ?? state.accounts.filter((account) => account.kind === "信用卡").reduce((sum, account) => sum + account.balanceMinor, 0);
  const items = [{ label: "灵活资金", amount: liquid }, { label: "非灵活资金", amount: investment }, { label: "资金预测合计", amount: total }, { label: "负债预测合计", amount: liability }];
  const maxAmount = Math.max(1, ...items.map((item) => Math.abs(item.amount)));
  return <div className="funding-chart" role="img" aria-label={`资金预测柱形图：灵活资金${money(liquid)}，非灵活资金${money(investment)}，资金预测合计${money(total)}，负债预测合计${money(liability)}。`}>
    <div className="funding-chart-columns">{items.map((item) => <div className="funding-column" key={item.label}><div className="funding-bar-area" aria-hidden="true"><div className="funding-bar" style={{ height: item.amount ? `${Math.max(4, Math.abs(item.amount) / maxAmount * 100)}%` : 0, opacity: item.amount < 0 ? .55 : 1 }} /></div><strong className={`money ${item.amount < 0 ? "negative" : ""}`}>{money(item.amount)}</strong><span>{item.label}</span></div>)}</div>
    <FundingBalanceTrendChart forecast={imported} liquid={liquid} investment={investment} flows={state.cashflows} />
  </div>;
}

function FundingBalanceTrendChart({ forecast, liquid, investment, flows }: { forecast?: AppState["fundingForecast"]; liquid: number; investment: number; flows: ExpectedCashflow[] }) {
  const points = forecast?.length ? forecast.map((point) => ({ month: point.month, liquid: point.flexibleMinor, investment: point.nonFlexibleMinor, total: point.totalMinor, liability: point.liabilityMinor })) : buildFallbackForecast(liquid, investment, flows);
  const maxAmount = Math.max(1, ...points.flatMap((point) => [point.liquid, point.investment, point.total, Math.abs(point.liability)]));
  const width = 920;
  const height = 286;
  const padding = { top: 20, right: 24, bottom: 42, left: 78 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
  const y = (amount: number) => padding.top + (1 - Math.abs(amount) / maxAmount) * plotHeight;
  const series = [{ key: "liquid", label: "灵活资金", className: "liquid" }, { key: "investment", label: "非灵活资金", className: "investment" }, { key: "total", label: "资金预测合计", className: "total" }, { key: "liability", label: "负债预测合计", className: "endowment" }] as const;
  const compactMoney = (amount: number) => {
    const yuan = amount / 100;
    return yuan >= 100000000 ? `¥${(yuan / 100000000).toFixed(1)}亿` : `¥${Math.round(yuan / 10000)}万`;
  };

  return <section className="funding-trend">
    <div className="funding-trend-header"><div><h3>按月资金余额趋势</h3><p className="footnote">以最新导入的资金预测为准；未导入时才按当前账户与待发生现金流估算。</p></div></div>
    <div className="funding-trend-legend" aria-hidden="true">{series.map((item) => <span key={item.key}><i className={`funding-trend-swatch ${item.className}`} />{item.label} {money(points.at(-1)?.[item.key] ?? 0)}</span>)}</div>
    <svg className="funding-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="funding-trend-title funding-trend-desc">
      <title id="funding-trend-title">按月资金预测趋势</title>
      <desc id="funding-trend-desc">显示灵活资金、非灵活资金、资金预测合计和负债预测合计的按月趋势。</desc>
      {[0, .5, 1].map((ratio) => { const lineY = padding.top + (1 - ratio) * plotHeight; return <g key={ratio}><line className="funding-trend-grid" x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} /><text className="funding-trend-axis" x={padding.left - 10} y={lineY + 4} textAnchor="end">{compactMoney(maxAmount * ratio)}</text></g>; })}
      {points.map((point, index) => <text className="funding-trend-axis" key={point.month} x={x(index)} y={height - 16} textAnchor="middle">{index % Math.max(1, Math.ceil(points.length / 12)) === 0 || index === points.length - 1 ? `${point.month.slice(2).replace("-", "/")}` : ""}</text>)}
      {series.map((item) => <g key={item.key}><polyline className={`funding-trend-line ${item.className}`} points={points.map((point, index) => `${x(index)},${y(point[item.key])}`).join(" ")} />{points.map((point, index) => <circle className={`funding-trend-point ${item.className}`} key={`${item.key}-${point.month}`} cx={x(index)} cy={y(point[item.key])} r="3" />)}</g>)}
    </svg>
  </section>;
}

function buildFallbackForecast(liquid: number, investment: number, flows: ExpectedCashflow[]) {
  const planned = flows.filter((flow) => flow.scenario === "基准" && flow.status === "待发生").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const firstMonth = planned[0]?.dueDate.slice(0, 7) ?? today().slice(0, 7);
  const start = new Date(`${firstMonth}-01T00:00:00`);
  let flexible = liquid; let nonFlexible = investment;
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    planned.filter((flow) => flow.dueDate.startsWith(month)).forEach((flow) => {
      const change = flow.direction === "流入" ? flow.amountMinor : -flow.amountMinor;
      if (flow.fundingBucket === "非灵活") nonFlexible += change; else flexible += change;
    });
    return { month, liquid: flexible, investment: nonFlexible, total: flexible + nonFlexible, liability: 0 };
  });
}

function Documents({ state }: { state: AppState }) {
  const docs = [...state.documents].sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  return <section className="card"><div className="card-header"><div><h2>证照、合同与到期提醒</h2><p className="footnote">仅记录元数据和外部保险库引用；不保存完整证件号或密码。</p></div></div><div className="table-wrap"><table><thead><tr><th>资料</th><th>类型/归属</th><th>到期日</th><th>状态</th><th>保险库引用</th></tr></thead><tbody>{docs.map((document) => { const days = daysUntil(document.expiryDate); const className = !document.perpetual && days !== null && days < 0 ? "danger" : !document.perpetual && days !== null && days <= 90 ? "warn" : "muted"; return <tr key={document.id}><td><strong>{document.name}</strong></td><td>{document.type}<div className="footnote">{document.owner}</div></td><td>{document.perpetual ? "长期有效" : document.expiryDate ?? "待补录"}</td><td><span className={`chip ${className}`}>{document.perpetual ? "长期有效" : days !== null && days < 0 ? "已过期" : days !== null && days <= 90 ? `${days}天内` : document.status}</span></td><td>{document.secretReference ? "已关联外部保险库" : <span className="muted">未关联</span>}</td></tr>; })}</tbody></table></div></section>;
}

function Security({ reset }: { reset: () => void }) {
  return <section className="two-col"><div className="card"><h2>本地数据边界</h2><div className="privacy-card"><strong>本应用不保存秘密。</strong>不要在备注或资料名称中输入密码、PIN、CVV、验证码、恢复码或助记词。需要时只填写外部凭证保险库的引用，例如 vault://provider/item-id。</div><p className="footnote">当前 MVP 将业务数据保存在浏览器 IndexedDB。请定期导出 JSON 备份到受加密保护的位置；清除浏览器数据会导致本地记录丢失。</p></div><div className="card"><h2>示例数据与恢复</h2><p className="section-intro">首次打开会载入脱敏示例。正式录入前，请先导出一份备份；后续可通过“导入备份”恢复。</p><button className="button button-danger" type="button" onClick={reset}>恢复脱敏示例数据</button><p className="footnote">此操作只影响当前浏览器中的本地数据。</p></div></section>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "warn" | "danger" }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className={`metric-value metric-${tone}`}>{value}</div><div className="metric-detail">{detail}</div></article>; }
function CashflowRows({ cashflows, showFundingBucket = false }: { cashflows: ExpectedCashflow[]; showFundingBucket?: boolean }) { return <div className={`forecast-list ${showFundingBucket ? "funding-plan-list" : ""}`}>{showFundingBucket && <div className="forecast-row-header" aria-hidden="true"><span>日期</span><span>事项</span><span>收支</span><span>资金性质</span><span>金额</span></div>}{cashflows.map((flow) => <div className="forecast-row" key={flow.id}><span>{shortDate(flow.dueDate)}</span><span className="forecast-item"><strong>{flow.title}</strong>{showFundingBucket ? null : <span className="footnote">{flow.category} · {flow.scenario}</span>}</span>{showFundingBucket && <><span className={`cashflow-direction ${flow.direction === "流出" ? "outflow" : "inflow"}`}>{flow.direction}</span><span className={`cashflow-bucket ${flow.fundingBucket === "非灵活" ? "non-flexible" : "flexible"}`}>{flow.fundingBucket ?? "灵活"}</span></>}<span className={`money ${flow.direction === "流出" ? "negative" : ""}`}>{flow.direction === "流出" ? "-" : "+"}{money(flow.amountMinor, flow.currency)}</span></div>)}{cashflows.length === 0 && <p className="empty">没有待发生的预测现金流。</p>}</div>; }

function getAlerts(state: AppState) {
  const alerts: { id: string; title: string; detail: string; level: "danger" | "warn" }[] = [];
  state.documents.forEach((document) => { const days = daysUntil(document.expiryDate); if (!document.perpetual && days !== null && days < 0) alerts.push({ id: document.id, level: "danger", title: `${document.name} 已过期`, detail: "请复核有效性并更新到期日。" }); else if (!document.perpetual && days !== null && days <= 90) alerts.push({ id: document.id, level: "warn", title: `${document.name} 将在 ${days} 天内到期`, detail: "建议在 90 / 30 / 7 天前完成续期或补件。" }); });
  state.cashflows.filter((flow) => flow.status === "待发生").forEach((flow) => { const days = daysUntil(flow.dueDate); if (days !== null && days >= 0 && days <= 30) alerts.push({ id: flow.id, level: "warn", title: `${flow.title} 将在 ${days} 天内发生`, detail: `${flow.direction}${money(flow.amountMinor, flow.currency)} · ${flow.category}` }); });
  return alerts.sort((a, b) => a.level === b.level ? 0 : a.level === "danger" ? -1 : 1);
}

function applyTransaction(draft: AppState, transaction: Transaction) {
  const change = (id: string | undefined, delta: number) => { const account = draft.accounts.find((candidate) => candidate.id === id); if (account) account.balanceMinor += delta; };
  if (transaction.type === "收入") change(transaction.accountId, transaction.amountMinor);
  if (transaction.type === "支出") change(transaction.accountId, -transaction.amountMinor);
  if (transaction.type === "内部转账") { change(transaction.fromAccountId, -transaction.amountMinor); change(transaction.toAccountId, transaction.amountMinor); }
  draft.transactions.unshift(transaction);
}

function Dialog({ title, description, children, onClose }: { title: string; description: string; children: ReactNode; onClose: () => void }) { return <div className="dialog-shade" role="presentation" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><h2>{title}</h2><p>{description}</p>{children}</section></div>; }
function FormActions({ onClose }: { onClose: () => void }) { return <div className="form-actions"><button className="button" type="button" onClick={onClose}>取消</button><button className="button button-primary" type="submit">保存</button></div>; }
function Field({ label, value, onChange, type = "text", required = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; className?: string }) { return <label className={className}><span>{label}</span><input type={type} value={value} required={required} step={type === "number" ? "0.01" : undefined} onChange={(event) => onChange(event.target.value)} /></label>; }
function Select({ label, value, options, optionLabels, onChange }: { label: string; value: string; options: string[]; optionLabels?: Record<string, string>; onChange: (value: string) => void }) { return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{optionLabels?.[option] ?? option}</option>)}</select></label>; }

function AccountDialog({ onClose, onSave }: { onClose: () => void; onSave: (account: Account) => void }) {
  const [form, setForm] = useState({ name: "", institution: "", owner: "家庭", kind: "现金" as AccountKind, currency: "CNY", liquidity: "高" as Liquidity, balance: "", asOfDate: today() });
  return <Dialog title="新增账户与余额快照" description="录入展示名称和最新余额；账号等敏感标识请保存在外部保险库。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.name.trim()) return; onSave({ id: createId("acc"), name: form.name.trim(), institution: form.institution.trim() || "未填写", owner: form.owner.trim() || "家庭", kind: form.kind, currency: form.currency, liquidity: form.liquidity, balanceMinor: parseMoney(form.balance), asOfDate: form.asOfDate, status: "活跃" }); }}><div className="form-grid"><Field label="账户名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Field label="机构" value={form.institution} onChange={(value) => setForm({ ...form, institution: value })} /><Field label="归属人" value={form.owner} onChange={(value) => setForm({ ...form, owner: value })} /><Select label="类型" value={form.kind} options={["现金", "投资", "保险", "信用卡", "其他"]} onChange={(value) => setForm({ ...form, kind: value as AccountKind })} /><Select label="流动性" value={form.liquidity} options={["高", "中", "低"]} onChange={(value) => setForm({ ...form, liquidity: value as Liquidity })} /><Field label="币种" value={form.currency} onChange={(value) => setForm({ ...form, currency: value.toUpperCase() })} /><Field label="余额（元）" type="number" value={form.balance} onChange={(value) => setForm({ ...form, balance: value })} /><Field label="快照日期" type="date" value={form.asOfDate} onChange={(value) => setForm({ ...form, asOfDate: value })} /></div><FormActions onClose={onClose} /></form></Dialog>;
}

function TransactionDialog({ accounts, onClose, onSave }: { accounts: Account[]; onClose: () => void; onSave: (transaction: Transaction) => void }) {
  const [form, setForm] = useState({ date: today(), type: "支出" as FlowType, amount: "", currency: "CNY", category: "日常消费", accountId: accounts[0]?.id ?? "", fromAccountId: accounts[0]?.id ?? "", toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? "", note: "" });
  const transfer = form.type === "内部转账"; const accountLabels = Object.fromEntries(accounts.map((account) => [account.id, account.name]));
  return <Dialog title="新增实际流水" description="内部转账必须选择来源与去向；它不会被统计为家庭收入或支出。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); const amount = parseMoney(form.amount); if (!amount || (transfer && form.fromAccountId === form.toAccountId)) return; onSave({ id: createId("txn"), date: form.date, type: form.type, amountMinor: amount, currency: form.currency, category: form.category.trim() || "未分类", accountId: transfer ? undefined : form.accountId, fromAccountId: transfer ? form.fromAccountId : undefined, toAccountId: transfer ? form.toAccountId : undefined, note: form.note.trim() }); }}><div className="form-grid"><Select label="流水类型" value={form.type} options={["收入", "支出", "内部转账"]} onChange={(value) => setForm({ ...form, type: value as FlowType })} /><Field label="日期" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /><Field label="金额（元）" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><Field label="币种" value={form.currency} onChange={(value) => setForm({ ...form, currency: value.toUpperCase() })} /><Field label="分类" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />{transfer ? <><Select label="来源账户" value={form.fromAccountId} options={accounts.map((account) => account.id)} optionLabels={accountLabels} onChange={(value) => setForm({ ...form, fromAccountId: value })} /><Select label="去向账户" value={form.toAccountId} options={accounts.map((account) => account.id)} optionLabels={accountLabels} onChange={(value) => setForm({ ...form, toAccountId: value })} /></> : <Select label="影响账户" value={form.accountId} options={accounts.map((account) => account.id)} optionLabels={accountLabels} onChange={(value) => setForm({ ...form, accountId: value })} />}<Field label="备注" value={form.note} onChange={(value) => setForm({ ...form, note: value })} className="span-all" /></div><FormActions onClose={onClose} /></form></Dialog>;
}

function AssetDialog({ onClose, onSave }: { onClose: () => void; onSave: (asset: Asset) => void }) {
  const [form, setForm] = useState({ name: "", type: "房产" as Asset["type"], owner: "家庭", ownershipPct: "100", gross: "", liability: "0", currency: "CNY", valuationDate: today(), liquidity: "低" as Liquidity, status: "持有" as Asset["status"] });
  return <Dialog title="新增资产估值" description="请填写权益比例及关联负债余额；估值来源可在下一阶段附件模块中补充。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.name.trim()) return; onSave({ id: createId("asset"), name: form.name.trim(), type: form.type, owner: form.owner.trim() || "家庭", ownershipPct: Math.min(100, Math.max(0, Number(form.ownershipPct) || 0)), grossValueMinor: parseMoney(form.gross), liabilityMinor: parseMoney(form.liability), currency: form.currency, valuationDate: form.valuationDate, liquidity: form.liquidity, status: form.status }); }}><div className="form-grid"><Field label="资产名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Select label="资产类型" value={form.type} options={["房产", "车辆", "股权/期权", "其他"]} onChange={(value) => setForm({ ...form, type: value as Asset["type"] })} /><Field label="归属人" value={form.owner} onChange={(value) => setForm({ ...form, owner: value })} /><Field label="权益比例（%）" type="number" value={form.ownershipPct} onChange={(value) => setForm({ ...form, ownershipPct: value })} /><Field label="毛值（元）" type="number" value={form.gross} onChange={(value) => setForm({ ...form, gross: value })} /><Field label="关联负债（元）" type="number" value={form.liability} onChange={(value) => setForm({ ...form, liability: value })} /><Field label="估值日期" type="date" value={form.valuationDate} onChange={(value) => setForm({ ...form, valuationDate: value })} /><Select label="流动性" value={form.liquidity} options={["高", "中", "低"]} onChange={(value) => setForm({ ...form, liquidity: value as Liquidity })} /><Select label="状态" value={form.status} options={["持有", "待出售", "待出租", "待购置"]} onChange={(value) => setForm({ ...form, status: value as Asset["status"] })} /></div><FormActions onClose={onClose} /></form></Dialog>;
}

function CashflowDialog({ onClose, onSave }: { onClose: () => void; onSave: (flow: ExpectedCashflow) => void }) {
  const [form, setForm] = useState({ title: "", dueDate: today(), direction: "流出" as ExpectedCashflow["direction"], amount: "", currency: "CNY", category: "日常消费", scenario: "基准" as ExpectedCashflow["scenario"] });
  return <Dialog title="新增预计现金流" description="这是一项计划，不会自动改变账户余额；发生后请在流水中单独登记实际交易。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.title.trim()) return; onSave({ id: createId("flow"), title: form.title.trim(), dueDate: form.dueDate, direction: form.direction, amountMinor: parseMoney(form.amount), currency: form.currency, category: form.category.trim() || "未分类", scenario: form.scenario, status: "待发生" }); }}><div className="form-grid"><Field label="事项名称" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required /><Field label="预计日期" type="date" value={form.dueDate} onChange={(value) => setForm({ ...form, dueDate: value })} /><Select label="方向" value={form.direction} options={["流入", "流出"]} onChange={(value) => setForm({ ...form, direction: value as ExpectedCashflow["direction"] })} /><Field label="金额（元）" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} /><Field label="分类" value={form.category} onChange={(value) => setForm({ ...form, category: value })} /><Select label="情景" value={form.scenario} options={["基准", "保守"]} onChange={(value) => setForm({ ...form, scenario: value as ExpectedCashflow["scenario"] })} /></div><FormActions onClose={onClose} /></form></Dialog>;
}

function DocumentDialog({ onClose, onSave }: { onClose: () => void; onSave: (document: DocumentRecord) => void }) {
  const [form, setForm] = useState({ name: "", type: "证照" as DocumentRecord["type"], owner: "家庭", expiryDate: "", perpetual: false, secretReference: "" });
  return <Dialog title="新增证照或合同元数据" description="完整证件号、扫描件和密码请不要填写在这里；需要时填写外部保险库/附件系统的引用。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!form.name.trim()) return; onSave({ id: createId("doc"), name: form.name.trim(), type: form.type, owner: form.owner.trim() || "家庭", expiryDate: form.perpetual ? undefined : form.expiryDate || undefined, perpetual: form.perpetual, status: form.perpetual ? "有效" : form.expiryDate ? "有效" : "待复核", secretReference: form.secretReference.trim() }); }}><div className="form-grid two"><Field label="资料名称" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Select label="类型" value={form.type} options={["证照", "保险", "合同", "账户资料"]} onChange={(value) => setForm({ ...form, type: value as DocumentRecord["type"] })} /><Field label="归属人" value={form.owner} onChange={(value) => setForm({ ...form, owner: value })} /><Field label="到期日" type="date" value={form.expiryDate} onChange={(value) => setForm({ ...form, expiryDate: value })} /><Select label="长期有效" value={form.perpetual ? "是" : "否"} options={["否", "是"]} onChange={(value) => setForm({ ...form, perpetual: value === "是" })} /><Field label="外部保险库引用（可选）" value={form.secretReference} onChange={(value) => setForm({ ...form, secretReference: value })} /></div><FormActions onClose={onClose} /></form></Dialog>;
}
