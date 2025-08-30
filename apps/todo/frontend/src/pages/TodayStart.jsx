// server2/apps/todo/frontend/src/pages/TodayStart.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/auth"; // ← TodayRunView と同じ経路

/** 並び順: 予定開始/期限 → priority（数値小さいほど高）→ id */
function byDueAndPriority(a, b) {
  const ad = a.plan_start_at
    ? new Date(a.plan_start_at).getTime()
    : a.due_at
    ? new Date(a.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  const bd = b.plan_start_at
    ? new Date(b.plan_start_at).getTime()
    : b.due_at
    ? new Date(b.due_at).getTime()
    : Number.POSITIVE_INFINITY;
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

  /** 初回ロード：当日日報IDと対象itemsを取得（※バックエンドは {daily_report_id, items} を返す想定） */
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { daily_report_id, items } = await fetchJson("/api/todo/day/start");
        if (!mounted) return;
        setDailyReportId(daily_report_id ?? null);
        setItems(Array.isArray(items) ? items : []);
        if ((!items || items.length === 0) && onEmptyInbox) onEmptyInbox();
      } catch (e) {
        if (mounted) setError("認証に失敗しました。ログイン（トークン/Cookie）を確認してください。");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [onEmptyInbox]);

  const selectedCount = useMemo(
    () => items.filter((i) => i.daily_report_id === dailyReportId).length,
    [items, dailyReportId]
  );

  const overdueIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      items
        .filter((i) => i.due_at && new Date(i.due_at).getTime() < now)
        .map((i) => i.id)
    );
  }, [items]);

  /** 単体PATCH（楽観更新） */
  async function patchItemDailyReport(itemId, nextDrId) {
    const prev = items;
    const next = items.map((it) =>
      it.id === itemId ? { ...it, daily_report_id: nextDrId } : it
    );
    setItems(next);
    try {
      await fetchJson(`/api/todo/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ daily_report_id: nextDrId }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // 失敗したら巻き戻し＋再読込を試みる
      setItems(prev);
      try {
        const { daily_report_id, items } = await fetchJson("/api/todo/day/start");
        setDailyReportId(daily_report_id ?? null);
        setItems(Array.isArray(items) ? items : []);
      } catch {}
      throw new Error("update-failed");
    }
  }

  /** 複数差分をまとめて適用 */
  async function bulkApply(toEnableIds, toDisableIds) {
    const tasks = [];
    toEnableIds.forEach((id) => {
      const cur = items.find((i) => i.id === id);
      if (cur && cur.daily_report_id !== dailyReportId) {
        tasks.push(patchItemDailyReport(id, dailyReportId));
      }
    });
    toDisableIds.forEach((id) => {
      const cur = items.find((i) => i.id === id);
      if (cur && cur.daily_report_id != null) {
        tasks.push(patchItemDailyReport(id, null));
      }
    });
    if (tasks.length === 0) return;
    try {
      await Promise.all(tasks);
    } catch {
      setError("一部の更新に失敗しました。再度お試しください。");
    }
  }

  /** チェックON/OFF（即時PATCH） */
  async function toggleCheck(item) {
    if (dailyReportId == null) return;
    const checked = item.daily_report_id === dailyReportId;
    try {
      await patchItemDailyReport(item.id, checked ? null : dailyReportId);
    } catch {
      setError("更新に失敗しました。");
    }
  }

  /** 自動選択（上位10件ON/他OFF） */
  async function autoPick() {
    if (dailyReportId == null) return;
    const sorted = [...items].sort(byDueAndPriority);
    const wantOn = new Set(sorted.slice(0, 10).map((i) => i.id));
    const toEnable = [];
    const toDisable = [];
    items.forEach((i) => {
      const isOn = i.daily_report_id === dailyReportId;
      if (wantOn.has(i.id) && !isOn) toEnable.push(i.id);
      if (!wantOn.has(i.id) && isOn) toDisable.push(i.id);
    });
    await bulkApply(toEnable, toDisable);
  }

  /** 全選択 / 選択解除 */
  async function selectAll() {
    if (dailyReportId == null) return;
    const toEnable = items
      .filter((i) => i.daily_report_id !== dailyReportId)
      .map((i) => i.id);
    await bulkApply(toEnable, []);
  }
  async function clearAll() {
    const toDisable = items
      .filter((i) => i.daily_report_id != null)
      .map((i) => i.id);
    await bulkApply([], toDisable);
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

      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded">{error}</div>
      )}

      <div className="flex gap-2">
        <button className="px-3 py-1 rounded border" onClick={autoPick}>
          自動選択
        </button>
        <button className="px-3 py-1 rounded border" onClick={selectAll}>
          全選択
        </button>
        <button className="px-3 py-1 rounded border" onClick={clearAll}>
          選択解除
        </button>
        <div className="ml-auto text-sm text-gray-500 self-center">
          選択 {selectedCount} 件
        </div>
      </div>

      <ul className="divide-y border rounded">
        {items.map((i) => {
          const checked = i.daily_report_id === dailyReportId;
          const overdue = overdueIds.has(i.id);
          return (
            <li key={i.id} className="p-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleCheck(i)}
              />
              <div className="flex-1">
                <div className="font-medium">
                  {i.title}
                  {overdue && (
                    <span className="ml-2 text-xs text-red-600">期限超過</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  期日: {i.due_at ? new Date(i.due_at).toLocaleString() : "—"}／
                  優先度: {String(i.priority ?? "—")}
                </div>
              </div>
              <div className="text-xs text-gray-600">{i.status}</div>
            </li>
          );
        })}
      </ul>
      {/* 確定ボタンは撤去（リアルタイム反映） */}
    </div>
  );
}
