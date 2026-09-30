import { useEffect, useState } from "react";
import { QuickLookup } from "./QuickLookup";
import { readState, type AppState } from "../lib/storage";
import { readSharedState } from "../lib/remote-storage";

export function HomeLookup() {
  const [state, setState] = useState<AppState | null>(null);
  const [request, setRequest] = useState<{ query: string; id: number } | null>(null);
  const [status, setStatus] = useState("正在读取查询资料…");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const origins = [window.location.origin, "http://127.0.0.1:4190"];
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || !origins.includes(event.origin)) return;
      if (event.data?.type !== "hub-lookup-query" || typeof event.data.query !== "string" || event.data.query.length > 200) return;
      setRequest((old) => ({ query: event.data.query, id: (old?.id ?? 0) + 1 }));
    };
    window.addEventListener("message", receive);
    for (const origin of origins) window.parent.postMessage({ type: "hub-lookup-ready" }, origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    let active = true;
    setStatus("正在读取查询资料…");
    setState(null);
    void (async () => {
      let sharedFailed = false;
      let next: AppState | null = null;
      try { next = await readSharedState(); } catch { sharedFailed = true; }
      const shared = Boolean(next);
      if (!next) next = await readState().catch(() => null);
      if (!active) return;
      setState(next);
      setStatus(next
        ? shared ? "使用家财管家最新线上资料" : sharedFailed ? "线上读取失败，当前显示此浏览器的本地资料" : "使用此浏览器的本地资料"
        : sharedFailed ? "暂时无法读取资料，请重试或打开家财管家。" : "尚无可查询资料，请先在家财管家导入资料。");
    })();
    return () => { active = false; };
  }, [revision]);
  return <main className="home-lookup">
    <div className="home-lookup-status"><span role="status">{status}</span><button className="button" onClick={() => setRevision((value) => value + 1)}>刷新资料</button></div>
    {state && request && <QuickLookup key={request.id} state={state} initialQuery={request.query} />}
  </main>;
}
