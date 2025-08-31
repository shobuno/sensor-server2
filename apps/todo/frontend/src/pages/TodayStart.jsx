// server2/apps/todo/frontend/src/pages/TodayStart.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import {
   getDayStart,
   getReport,
   patchReport,
   patchItem,
   } from "../lib/apiTodo";

/** 並び順: 予定開始/期限 → priority（数値小さいほど高）→ id */
function byDueAndPriority(a, b) {
  const ad = a?.plan_start_at
    ? new Date(a.plan_start_at).getTime()
    : a?.due_at
    ? new Date(a.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  const bd = b?.plan_start_at
    ? new Date(b.plan_start_at).getTime()
    : b?.due_at
    ? new Date(b.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;

  const ap = typeof a?.priority === "number" ? a.priority : 3;
  const bp = typeof b?.priority === "number" ? b.priority : 3;
  if (ap !== bp) return ap - bp;

  return (a?.id || 0) - (b?.id || 0);
}

/** JSTの "HH:mm" を ISO から得る（period_start_at 用） */
function hhmmFromISOJST(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "YYYY-MM-DD" → "YYYY/MM/DD" */
function ymdSlash(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-");
  return `${y}/${m}/${d}`;
}

/** ISO → "YYYY/MM/DD"（JST） */
function isoToYmdSlashJST(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replaceAll("-", "/"); // Safari対策（環境によっては 2025/08/31 形式で出ます）
}

export default function TodayStart({ onEmptyInbox }) {
  const [loading, setLoading] = useState(true);
  const [dailyReportId, setDailyReportId] = useState(null);
  const [report, setReport] = useState(null); // { id, report_date, period_start_at, ... }
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  // 時刻入力はローカルに保持（更新ボタン or Enter でだけ保存）
  const [timeInput, setTimeInput] = useState(""); // "HH:mm"
  const [saving, setSaving] = useState(false);

  // 画面右上に出す微小バージョン印（このファイルでビルドされているか即確認用）
  const BUILD_TAG = "TS-v3"; // ← これが画面右上に見えれば差し替え済み

  // 初期ロード
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await getDayStart();
        const drId = payload?.daily_report_id ?? null;
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        if (!mounted) return;

        setDailyReportId(drId);
        setItems(
          rows.map((it) => ({
            ...it,
            today_flag: it.daily_report_id === drId ? true : !!it.today_flag,
          }))
        );

        if (drId) {
          try {
            const rep = await getReport(drId);
            if (mounted) {
              setReport(rep);
              setTimeInput(hhmmFromISOJST(rep?.period_start_at) || "");
            }
          } catch {}
        }

        if (rows.length === 0 && onEmptyInbox) onEmptyInbox();
      } catch {
        if (mounted) setError("認証エラーまたは読み込みに失敗しました。ログイン状態をご確認ください。");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onEmptyInbox]);

  const selectedCount = useMemo(
    () => items.filter((i) => i.daily_report_id === dailyReportId).length,
    [items, dailyReportId]
  );

  const overdueIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      items.filter((i) => i.due_at && new Date(i.due_at).getTime() < now).map((i) => i.id)
    );
  }, [items]);

  // ===== 日付表示（JST） =====
  // 第一優先: report_date(YYYY-MM-DD) を "YYYY/MM/DD"
  // 代替: period_start_at(ISO) から JST日付を生成
  const jstDateStr = useMemo(() => {
    const byReportDate = ymdSlash(report?.report_date);
    if (byReportDate) return byReportDate;
    const byStartIso = isoToYmdSlashJST(report?.period_start_at);
    return byStartIso || "—";
  }, [report?.report_date, report?.period_start_at]);

  // 入力値と現在値の差分
  const dirty = useMemo(() => {
    const base = report ? hhmmFromISOJST(report.period_start_at) : "";
    return timeInput !== base;
  }, [timeInput, report]);

  // ===== 保存（更新ボタン or Enter） =====
  const saveStartTime = useCallback(async () => {
    if (!dailyReportId) return;
    if (!/^\d{2}:\d{2}$/.test(timeInput)) return;

    // 保存用ISO（JST固定）
    const ymd = report?.report_date;
    // report_date が無い場合は period_start_at のJST日付を使う
    const datePart =
      ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)
        ? ymd
        : (isoToYmdSlashJST(report?.period_start_at) || "")
            ?.replaceAll("/", "-"); // "YYYY/MM/DD" → "YYYY-MM-DD"

    if (!datePart) return;

    const iso = `${datePart}T${timeInput}:00+09:00`;

    setSaving(true);
    const prev = report;
    setReport((r) => (r ? { ...r, period_start_at: iso } : r));
    try {
      await patchReport(dailyReportId, { period_start_at: iso });
      // ページ遷移なし
    } catch (err) {
      console.error(err);
      setReport(prev);
      setError("開始時刻の更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  }, [dailyReportId, timeInput, report]);

  const onKeyDownTime = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault(); // 暗黙のフォーム送信を抑止
        e.stopPropagation();
        saveStartTime();
      }
    },
    [saveStartTime]
  );

  // ===== items の更新系 =====
  async function patchItemDailyReport(itemId, nextDrId) {
    const nextToday = !!nextDrId;
    const prev = items;
    const next = items.map((it) =>
      it.id === itemId ? { ...it, daily_report_id: nextDrId, today_flag: nextToday } : it
    );
    setItems(next);
    try {
      await patchItem(itemId, { daily_report_id: nextDrId, today_flag: nextToday });
    } catch {
      setItems(prev);
      try {
        const payload = await getDayStart();
        const drId = payload?.daily_report_id ?? null;
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        setDailyReportId(drId);
        setItems(
          rows.map((it) => ({
            ...it,
            today_flag: it.daily_report_id === drId ? true : !!it.today_flag,
          }))
        );
      } catch {}
      setError("一部の更新に失敗しました。もう一度お試しください。");
    }
  }

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
      if (cur && cur.daily_report_id === dailyReportId) {
        tasks.push(patchItemDailyReport(id, null));
      }
    });
    if (tasks.length === 0) return;
    try {
      await Promise.all(tasks);
    } catch {}
  }

  async function toggleCheck(item) {
    if (dailyReportId == null) return;
    const checked = item.daily_report_id === dailyReportId;
    try {
      await patchItemDailyReport(item.id, checked ? null : dailyReportId);
    } catch {
      setError("更新に失敗しました。");
    }
  }

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

  async function selectAll() {
    if (dailyReportId == null) return;
    const toEnable = items.filter((i) => i.daily_report_id !== dailyReportId).map((i) => i.id);
    await bulkApply(toEnable, []);
  }
  async function clearAll() {
    if (dailyReportId == null) return;
    const toDisable = items.filter((i) => i.daily_report_id === dailyReportId).map((i) => i.id);
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
      <div className="flex items-center">
        <h2 className="text-lg font-bold">今日の開始</h2>
        <span className="ml-auto text-[10px] text-gray-400">{BUILD_TAG}</span>
      </div>

      {error && <div className="bg-red-100 text-red-700 p-2 rounded">{error}</div>}

      {/* 日付（JST）と開始時刻（手動保存） */}
      <div className="flex flex-wrap items-center gap-3 p-3 border rounded">
        <div className="text-sm text-gray-600">
          日付：<span className="font-medium">{jstDateStr}</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">開始時刻</span>
          <input
            type="time"
            value={timeInput}
            onChange={(e) => setTimeInput(e.target.value)}
            onKeyDown={onKeyDownTime}
            className="rounded border px-2 py-1"
          />
        </label>
        <button
          className="px-3 py-1 rounded border"
          disabled={!dirty || saving}
          onClick={saveStartTime}
        >
          {saving ? "保存中…" : "更新"}
        </button>
        <div className="text-xs text-gray-500">
          （更新ボタン または Enter で保存／ページ遷移しません）
        </div>
      </div>

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
        <div className="ml-auto text-sm text-gray-500 self-center">選択 {selectedCount} 件</div>
      </div>

      <ul className="divide-y border rounded">
        {items.map((i) => {
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
                  期日: {i.due_at ? new Date(i.due_at).toLocaleString() : "—"}／
                  優先度: {String(i.priority ?? "—")}
                </div>
              </div>
              <div className="text-xs text-gray-600">
                {i.status} {i.today_flag ? "(今日)" : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
