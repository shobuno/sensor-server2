// sensor-server/apps/todo/frontend/src/pages/TodoClose.jsx

import { useEffect, useState } from "react";
import { getTodayItems, closeToday, pauseItem, finishItem } from "../lib/api";

export default function TodoClose() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);           // TODAYのうち未完のみ表示
  const [remain, setRemain] = useState(new Map());  // id -> number
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closedOk, setClosedOk] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const today = await getTodayItems();
        const targets = today.filter(i => i.status !== "DONE");
        setItems(targets);
        const init = new Map();
        targets.forEach(i => init.set(i.id, Number(i.remaining_amount ?? 0) || 0));
        setRemain(init);
      } catch (e) {
        setError(e.message || "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setVal = (id, v) => {
    const num = Number(v);
    const next = new Map(remain);
    next.set(id, Number.isFinite(num) ? num : 0);
    setRemain(next);
  };

  const onPause = async (id) => {
    try {
      await pauseItem(id);
      setItems(prev => prev.map(x => (x.id === id ? { ...x, status: "PAUSED" } : x)));
    } catch (e) { alert(e.message || "一時停止に失敗しました"); }
  };

  const onFinish = async (id) => {
    try {
      await finishItem(id);
      setItems(prev => prev.filter(x => x.id !== id));
      const next = new Map(remain); next.delete(id); setRemain(next);
    } catch (e) { alert(e.message || "完了に失敗しました"); }
  };

  const onClose = async () => {
    try {
      setClosing(true);
      setError(null);
      const body = Array.from(remain.entries()).map(([id, v]) => ({ id, remaining_amount: v ?? 0 }));
      const res = await closeToday(body);
      setClosedOk(res.updated);
    } catch (e) {
      setError(e.message || "締め処理に失敗しました");
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="p-4">読み込み中…</div>;
  if (closedOk != null) return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-bold">今日の終了 — 完了</h2>
      <div>未完了タスクの残量を保存し、TODAY → PAUSED に戻しました（{closedOk}件）。</div>
    </div>
  );

  return (
    <div className="pb-8">
      <div className="px-3 py-2 border-b bg-white">
        <h2 className="text-lg font-bold">今日の終了</h2>
        {error && <div className="mt-2 bg-red-100 text-red-700 p-2 rounded">{error}</div>}
      </div>

      <ul className="divide-y">
        {items.map(i => (
          <li key={i.id} className="p-3 space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{i.title}</div>
              <div className="text-xs text-gray-500">{i.status}</div>
            </div>
            <div className="text-xs text-gray-500">
              期日: {i.due_at ? new Date(i.due_at).toLocaleString() : "—"}／優先度: {i.priority}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">
                残作業量:
                <input
                  type="number"
                  inputMode="decimal"
                  className="ml-2 border rounded px-2 py-1 w-28"
                  value={remain.get(i.id) ?? 0}
                  onChange={(e) => setVal(i.id, e.target.value)}
                />
                {i.unit ? <span className="ml-1 text-gray-500">{i.unit}</span> : null}
              </label>
              <div className="ml-auto flex gap-2">
                <button className="px-3 py-1 rounded border" onClick={() => onPause(i.id)}>一時停止</button>
                <button className="px-3 py-1 rounded border bg-green-600 text-white" onClick={() => onFinish(i.id)}>完了</button>
              </div>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="p-3 text-sm text-gray-500">未完了の TODAY はありません</li>}
      </ul>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/90 border-t">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={closing}
          onClick={onClose}
        >
          {closing ? "締め処理中…" : "今日を終了する"}
        </button>
      </div>
    </div>
  );
}
