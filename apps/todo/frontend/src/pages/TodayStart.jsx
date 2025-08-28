// sensor-server/apps/todo/frontend/src/pages/TodayStart.jsx

import { useEffect, useMemo, useState } from "react";
import { getStartCandidates, commitToday, listItems } from "@/api/todo"; // ← 追加

function byDueAndPriority(a, b) {
  // 期限 → priority（high→low）→ id
  const ad = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  const bd = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;

  const priOrder = { high: 0, medium: 1, low: 2 };
  const ap = typeof a.priority === "number" ? a.priority : priOrder[a.priority ?? "medium"];
  const bp = typeof b.priority === "number" ? b.priority : priOrder[b.priority ?? "medium"];
  if (ap !== bp) return ap - bp;

  return (a.id || 0) - (b.id || 0);
}

export default function TodayStart({ onCommitted, onEmptyInbox }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // ✅ 候補と「今日（today_flag=true）」を同時取得して合流
        const [candRes, todayRes] = await Promise.all([
          getStartCandidates(),                 // INBOX/PAUSED などの候補
          listItems({ today: 1, limit: 1000 }), // 既に today_flag=true の一覧
        ]);
        const list = candRes?.items || [];
        const todayArr = Array.isArray(todayRes) ? todayRes : (todayRes?.items ?? []);
        const todayIds = new Set(todayArr.map(i => i.id));
        if (!mounted) return;
        setItems(list);
        // ✅ 既に today_flag=true のIDを初期チェックONにする
        setSelected(new Set(list.filter(i => todayIds.has(i.id)).map(i => i.id)));

        if (list.length === 0 && onEmptyInbox) onEmptyInbox();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [onEmptyInbox]);

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

  const autoPick = () => {
    const picked = [...items].sort(byDueAndPriority).slice(0, 10).map(i => i.id);
    setSelected(new Set(picked));
  };

  const onCommit = async () => {
    try {
      setCommitting(true);
      setError(null);
      const ids = Array.from(selected);
      if (!ids.length) {
        setError("1件以上選択してください");
        return;
      }
      const res = await commitToday(ids);
      setDone(res?.plan_id ?? 0);
      onCommitted?.(); // 確定後に「今日」タブへ
    } catch (e) {
      setError(e?.message || "確定に失敗しました");
    } finally {
      setCommitting(false);
    }
  };

  if (loading) return <div className="p-4">読み込み中…</div>;

  if (items.length === 0)
    return (
      <div className="text-sm text-gray-500 border rounded p-3">
        INBOX が空です。新しいタスクを「追加」から登録してください。
      </div>
    );

  if (done)
    return (
      <div className="p-4">
        <h2 className="text-lg font-bold mb-2">今日の開始 — 確定しました</h2>
        <div>plan_id: {done}</div>
      </div>
    );

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-bold">今日の開始</h2>

      {error && <div className="bg-red-100 text-red-700 p-2 rounded">{error}</div>}

      <div className="flex gap-2">
        <button className="px-3 py-1 rounded border" onClick={autoPick}>自動選択</button>
        <button className="px-3 py-1 rounded border" onClick={selectAll}>全選択</button>
        <button className="px-3 py-1 rounded border" onClick={clearAll}>選択解除</button>
        <div className="ml-auto text-sm text-gray-500 self-center">選択 {selected.size} 件</div>
      </div>

      <ul className="divide-y border rounded">
        {items.map(i => {
          const checked = selected.has(i.id);
          const overdue = overdueIds.has(i.id);
          return (
            <li key={i.id} className="p-3 flex items-center gap-3">
              <input type="checkbox" checked={checked} onChange={() => toggle(i.id)} />
              <div className="flex-1">
                <div className="font-medium">
                  {i.title}
                  {overdue && <span className="ml-2 text-xs text-red-600">期限超過</span>}
                </div>
                <div className="text-xs text-gray-500">
                  期日: {i.due_at ? new Date(i.due_at).toLocaleString() : "—"}／優先度: {String(i.priority ?? "—")}
                </div>
              </div>
              <div className="text-xs text-gray-600">{i.status}</div>
            </li>
          );
        })}
      </ul>

      <button
        className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        disabled={committing}
        onClick={onCommit}
      >
        {committing ? "確定中…" : `今日のタスクを確定（${selected.size}）`}
      </button>
    </div>
  );
}
