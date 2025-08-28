// sensor-server/apps/todo/frontend/src/pages/TodoToday.jsx

import { useEffect, useMemo, useState } from "react";
import { getStartCandidates, commitToday } from "../lib/api";

function sortByDueAndPriority(a, b) {
  const ad = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  const bd = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;
  const pri = { high: 0, medium: 1, low: 2 };
  if (pri[a.priority] !== pri[b.priority]) return pri[a.priority] - pri[b.priority];
  return a.id - b.id;
}

export default function TodoToday() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getStartCandidates();
        setItems(data.sort(sortByDueAndPriority));
      } catch (e) {
        setError(e.message || "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const overdueIds = useMemo(() => {
    const now = Date.now();
    return new Set(items.filter(i => i.due_at && new Date(i.due_at).getTime() < now).map(i => i.id));
  }, [items]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(items.map(i => i.id)));
  const clearAll = () => setSelected(new Set());
  const autoPick = () => setSelected(new Set(items.sort(sortByDueAndPriority).slice(0, 10).map(i => i.id)));

  const onCommit = async () => {
    try {
      setCommitting(true);
      setError(null);
      const ids = Array.from(selected);
      if (!ids.length) throw new Error("1件以上選択してください");
      const res = await commitToday(ids);
      setDone(res.plan_id);
    } catch (e) {
      setError(e.message || "確定に失敗しました");
    } finally {
      setCommitting(false);
    }
  };

  if (loading) return <div className="p-4">読み込み中…</div>;
  if (done) return (
    <div className="p-4 space-y-2">
      <h2 className="text-lg font-bold">今日の開始 — 確定しました</h2>
      <div className="text-sm text-gray-600">plan_id: {done}</div>
    </div>
  );

  return (
    <div className="pb-8">
      <div className="px-3 py-2 border-b bg-white">
        <h2 className="text-lg font-bold">今日の開始</h2>
        <div className="flex gap-2 mt-2">
          <button className="px-3 py-1 rounded border" onClick={autoPick}>自動選択</button>
          <button className="px-3 py-1 rounded border" onClick={selectAll}>全選択</button>
          <button className="px-3 py-1 rounded border" onClick={clearAll}>選択解除</button>
        </div>
        {error && <div className="mt-2 bg-red-100 text-red-700 p-2 rounded">{error}</div>}
      </div>

      <ul className="divide-y">
        {items.map(i => {
          const checked = selected.has(i.id);
          const overdue = overdueIds.has(i.id);
          return (
            <li key={i.id} className="p-3 flex items-center gap-3">
              <input type="checkbox" checked={checked} onChange={() => toggle(i.id)} />
              <div className="flex-1">
                <div className="font-medium">
                  {i.title} {overdue && <span className="ml-2 text-xs text-red-600">期限超過</span>}
                </div>
                <div className="text-xs text-gray-500">
                  期日: {i.due_at ? new Date(i.due_at).toLocaleString() : "—"}／優先度: {i.priority}
                </div>
              </div>
              <div className="text-xs text-gray-600">{i.status}</div>
            </li>
          );
        })}
      </ul>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/90 border-t">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          disabled={committing}
          onClick={onCommit}
        >
          {committing ? "確定中…" : "今日のタスクを確定"}
        </button>
      </div>
    </div>
  );
}
