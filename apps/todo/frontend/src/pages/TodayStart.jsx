// sensor-server2/apps/todo/frontend/src/pages/TodayStart.jsx
import { useEffect, useMemo, useState } from "react";
import { getDayStart, listItems, patchItem } from "@/lib/apiTodo"; // ← 認証付きAPIだけ使う

/** 並び順: 予定開始/期限 → priority（小さいほど高）→ id */
function byDueAndPriority(a, b) {
  const ad = a.plan_start_at
    ? new Date(a.plan_start_at).getTime()
    : a.due_at
    ? new Date(a.due_at).getTime()
    : Number.MAX_SAFE_INTEGER;
  const bd = b.plan_start_at
    ? new Date(b.plan_start_at).getTime()
    : b.due_at
    ? new Date(b.due_at).getTime()
    : Number.MAX_SAFE_INTEGER;
  if (ad !== bd) return ad - bd;
  const ap = typeof a.priority === "number" ? a.priority : 3;
  const bp = typeof b.priority === "number" ? b.priority : 3;
  if (ap !== bp) return ap - bp;
  return (a.id || 0) - (b.id || 0);
}

export default function TodayStart({ onEmptyInbox }) {
  const [loading, setLoading] = useState(true);
  const [dailyReportId, setDailyReportId] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  // 初期ロード：当日日報ID＋候補一覧（認証付きクライアント経由）
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const head = await getDayStart(); // { daily_report_id, items } を返す
        setDailyReportId(head?.daily_report_id ?? null);

        // 既に today に入っている一覧（フロント表示のためだけに利用）
        const todayRes = await listItems({ today: 1, limit: 1000 });
        const todayIds = new Set(
          Array.isArray(todayRes) ? todayRes.map(i => i.id) : (todayRes?.items ?? []).map(i => i.id)
        );

        const base = head?.items ?? [];
        const merged = base.map(i =>
          todayIds.has(i.id) ? { ...i, daily_report_id: head?.daily_report_id ?? null } : { ...i, daily_report_id: null }
        );
        if (!mounted) return;
        setItems(merged);
        if (merged.length === 0 && onEmptyInbox) onEmptyInbox();
      } catch (e) {
        if (mounted) setError("認証エラーまたは読み込み失敗。ログイン状態をご確認ください。");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [onEmptyInbox]);

  const selectedCount = useMemo(
    () => items.filter(i => i.daily_report_id === dailyReportId).length,
    [items, dailyReportId]
  );

  const overdueIds = useMemo(() => {
    const now = Date.now();
    return new Set(items.filter(i => i.due_at && new Date(i.due_at).getTime() < now).map(i => i.id));
  }, [items]);

  // 単体PATCH（楽観更新）— 認証付き patchItem を必ず使用
  async function setDr(itemId, nextDrId) {
    const prev = items;
    const next = items.map(it => it.id === itemId ? { ...it, daily_report_id: nextDrId } : it);
    setItems(next);
    try {
      await patchItem(itemId, { daily_report_id: nextDrId });
    } catch {
      setItems(prev);
      setError("更新に失敗しました。もう一度お試しください。");
    }
  }

  // チェックトグル（即時反映）
  async function toggle(item) {
    if (dailyReportId == null) return;
    const checked = item.daily_report_id === dailyReportId;
    await setDr(item.id, checked ? null : dailyReportId);
  }

  // 自動選択（上位10件ON、他OFF）
  async function autoPick() {
    if (dailyReportId == null) return;
    const sorted = [...items].sort(byDueAndPriority);
    const wantOn = new Set(sorted.slice(0, 10).map(i => i.id));
    const ops = [];
    for (const it of items) {
      const isOn = it.daily_report_id === dailyReportId;
      if (wantOn.has(it.id) && !isOn) ops.push(setDr(it.id, dailyReportId));
      if (!wantOn.has(it.id) && isOn) ops.push(setDr(it.id, null));
    }
    await Promise.all(ops);
  }

  async function selectAll() {
    if (dailyReportId == null) return;
    await Promise.all(items.filter(i => i.daily_report_id !== dailyReportId).map(i => setDr(i.id, dailyReportId)));
  }

  async function clearAll() {
    await Promise.all(items.filter(i => i.daily_report_id != null).map(i => setDr(i.id, null)));
  }

  if (loading) return <div className="p-4">読み込み中…</div>;

  if (items.length === 0)
    return (
      <div className="text-sm text-gray-500 border rounded p-3">
        INBOX が空です。新しいタスクを「追加」から登録してください。
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
        <div className="ml-auto text-sm text-gray-500 self-center">選択 {selectedCount} 件</div>
      </div>

      <ul className="divide-y border rounded">
        {items.map(i => {
          const checked = i.daily_report_id === dailyReportId;
          const overdue = overdueIds.has(i.id);
          return (
            <li key={i.id} className="p-3 flex items-center gap-3">
              <input type="checkbox" checked={checked} onChange={() => toggle(i)} />
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
      {/* 「確定」ボタンは無し（リアルタイム反映） */}
    </div>
  );
}
