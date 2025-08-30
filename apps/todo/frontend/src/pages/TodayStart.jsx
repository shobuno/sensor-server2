// sensor-server/apps/todo/frontend/src/pages/TodayStart.jsx
import { useEffect, useMemo, useState } from "react";
import {
  getStartCandidates,   // ← 以前からある認証付きクライアント経由
  listItems,            // ← 同上
  api,                  // ← axios インスタンス（@/api/todo 側で Authorization 付与）
} from "@/api/todo";

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

  // 1) 初期ロード：当日の候補 + 既に今日に入っているもの
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 以前と同じ経路（@/api/todo）で取得
        const [candRes, todayRes, head] = await Promise.all([
          getStartCandidates(),
          listItems({ today: 1, limit: 1000 }),
          api.get("/day/start"), // ← ここも api 経由。レスに daily_report_id を持たせてある想定
        ]);
        if (!mounted) return;
        const list = candRes?.items ?? [];
        const todayArr = Array.isArray(todayRes) ? todayRes : (todayRes?.items ?? []);
        setDailyReportId(head?.data?.daily_report_id ?? null);

        // 既に今日のものはチェック済みとして表示する（＝ daily_report_id で判定）
        const todayIds = new Set(todayArr.map(i => i.id));
        setItems(
          list.map(i =>
            todayIds.has(i.id) ? { ...i, daily_report_id: head?.data?.daily_report_id ?? null } : i
          )
        );
        if (list.length === 0 && onEmptyInbox) onEmptyInbox();
      } catch (e) {
        if (mounted) setError("認証エラーまたは読み込みに失敗しました。ログイン状態をご確認ください。");
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

  // 2) 単体PATCH（楽観更新）— 認証は api 側で付与
  async function patchDailyReportId(itemId, nextDrId) {
    const prev = items;
    const next = items.map(it => it.id === itemId ? { ...it, daily_report_id: nextDrId } : it);
    setItems(next);
    try {
      await api.patch(`/items/${itemId}`, { daily_report_id: nextDrId });
    } catch (e) {
      setItems(prev); // 失敗したら戻す
      throw e;
    }
  }

  // 3) 一括PATCH（差分のみ送る）
  async function bulkSet(idsToEnable, idsToDisable) {
    const tasks = [];
    idsToEnable.forEach(id => {
      const cur = items.find(i => i.id === id);
      if (cur && cur.daily_report_id !== dailyReportId) tasks.push(patchDailyReportId(id, dailyReportId));
    });
    idsToDisable.forEach(id => {
      const cur = items.find(i => i.id === id);
      if (cur && cur.daily_report_id != null) tasks.push(patchDailyReportId(id, null));
    });
    if (!tasks.length) return;
    try {
      await Promise.all(tasks);
    } catch {
      // ずれたら再同期
      try {
        const { data } = await api.get("/day/start");
        setDailyReportId(data?.daily_report_id ?? null);
        const todayIds = new Set((await listItems({ today: 1, limit: 1000 }))?.items?.map(i => i.id) ?? []);
        setItems(items.map(i =>
          todayIds.has(i.id) ? { ...i, daily_report_id: data?.daily_report_id ?? null } : { ...i, daily_report_id: null }
        ));
      } catch {}
    }
  }

  // 4) チェックの即時反映
  async function toggleCheck(item) {
    if (dailyReportId == null) return;
    const checked = item.daily_report_id === dailyReportId;
    try {
      await patchDailyReportId(item.id, checked ? null : dailyReportId);
    } catch {
      setError("更新に失敗しました。もう一度お試しください。");
    }
  }

  // 5) 自動選択・全選択・解除（全部リアルタイム反映）
  async function autoPick() {
    if (dailyReportId == null) return;
    const sorted = [...items].sort(byDueAndPriority);
    const wantOn = new Set(sorted.slice(0, 10).map(i => i.id));
    const toEnable = [], toDisable = [];
    items.forEach(i => {
      const isOn = i.daily_report_id === dailyReportId;
      if (wantOn.has(i.id) && !isOn) toEnable.push(i.id);
      if (!wantOn.has(i.id) && isOn) toDisable.push(i.id);
    });
    await bulkSet(toEnable, toDisable);
  }
  async function selectAll() {
    const toEnable = items.filter(i => i.daily_report_id !== dailyReportId).map(i => i.id);
    await bulkSet(toEnable, []);
  }
  async function clearAll() {
    const toDisable = items.filter(i => i.daily_report_id != null).map(i => i.id);
    await bulkSet([], toDisable);
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
              <input type="checkbox" checked={checked} onChange={() => toggleCheck(i)} />
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
      {/* 確定ボタンは撤去（リアルタイム反映） */}
    </div>
  );
}
