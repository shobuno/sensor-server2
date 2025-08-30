// sensor-server/apps/todo/frontend/src/pages/TodoDailyReport.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "@/auth";

function toISODateInput(d) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISODateInput(s) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export default function TodoDailyReport() {
  const [sp] = useSearchParams();

  // ====== 一覧（期間） ======
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const lastWeek = useMemo(() => new Date(Date.now() - 6 * 24 * 3600 * 1000), []);

  const [from, setFrom] = useState(toISODateInput(lastWeek));
  const [to, setTo] = useState(toISODateInput(today));
  const [rows, setRows] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // ====== 編集（特定日 or 期間プレビュー） ======
  const [editDate, setEditDate] = useState(() => sp.get("date") || null); // "YYYY-MM-DD" | null
  const [header, setHeader] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  // ==== 一覧取得（保存済みのスナップショット一覧）====
  const fetchList = async () => {
    setLoadingList(true);
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const data = await fetchJson(`/api/todo/reports/range?${q.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(`日報一覧の取得に失敗: ${e.message}`);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchList();
    // 初回 ?date= があればその日を開く
    const d = sp.get("date");
    if (d) openEditor(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==== 個別読み込み（保存済みが無ければプレビュー集計を返す）====
  const loadDay = async (dayStr) => {
    if (!dayStr) return;
    setLoadingEdit(true);
    try {
      const data = await fetchJson(`/api/todo/reports?date=${dayStr}`);
      setHeader(data.header);
      setItems(data.items || []);
    } catch (e) {
      alert(`日報読み込み失敗: ${e.message}`);
    } finally {
      setLoadingEdit(false);
    }
  };

  // ==== 締め前プレビュー（最後の終了〜今）====
  const loadLive = async () => {
    setLoadingEdit(true);
    try {
      const data = await fetchJson(`/api/todo/reports/live`);
      setHeader(data.header);
      setItems(data.items || []);
      setEditDate(null); // 期間表示なので日付はクリア
    } catch (e) {
      alert(`プレビュー取得失敗: ${e.message}`);
    } finally {
      setLoadingEdit(false);
    }
  };

  // ==== 編集開始（一覧行クリック or 日付指定）====
  const openEditor = (dayStr) => {
    setEditDate(dayStr);
    loadDay(dayStr);
  };

  // ==== フィールド編集 ====
  const setHeaderField = (key, val) => setHeader((h) => ({ ...(h || {}), [key]: val }));
  const setItemField = (idx, key, val) =>
    setItems((list) => {
      const copy = [...list];
      copy[idx] = { ...copy[idx], [key]: val };
      return copy;
    });

  // ==== 日付ベース保存 ====
  const save = async () => {
    if (!editDate) return;
    setSaving(true);
    try {
      await fetchJson(`/api/todo/reports`, {
        method: "POST",
        body: JSON.stringify({
          date: editDate,
          title: header?.title || "日報",
          memo: header?.memo || "",
          items: items.map((it, i) => ({
            ...it,
            sort_order: i + 1,
          })),
        }),
      });
      await loadDay(editDate);
      await fetchList();
      alert("保存しました");
    } catch (e) {
      alert(`保存に失敗: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ==== 「今日はここまで」：期間を確定保存 ====
  const closeAndSave = async () => {
    if (!confirm("この期間を日報として確定保存し、「今日の終了」を記録します。よろしいですか？")) return;
    setClosing(true);
    try {
      await fetchJson(`/api/todo/reports/close`, {
        method: "POST",
        body: JSON.stringify({ memo: header?.memo || "" }),
      });
      alert("保存しました");
      await fetchList();
      // 一番新しい保存済みを開く
      const newest = await fetchJson(`/api/todo/reports/range?from=&to=`);
      const lastDate = Array.isArray(newest) && newest[0]?.report_date;
      if (lastDate) openEditor(lastDate);
    } catch (e) {
      alert(`締め保存に失敗: ${e.message}`);
    } finally {
      setClosing(false);
    }
  };

  // ==== 前日/翌日移動 ====
  const moveDay = (delta) => {
    if (!editDate) return;
    const d = fromISODateInput(editDate);
    d.setDate(d.getDate() + delta);
    const next = toISODateInput(d);
    setEditDate(next);
    loadDay(next);
  };

  // ==== レンダリング ====
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-semibold">日報</h1>

      {/* 一覧（期間検索） */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button onClick={fetchList} className="px-3 py-1 rounded bg-black text-white">
            更新
          </button>
          <div className="ml-auto text-sm opacity-70">
            {loadingList ? "読み込み中…" : `${rows.length} 件`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded border" onClick={loadLive}>
            締め前のプレビュー（最後の終了〜今）
          </button>
          <button
            className="px-3 py-1 rounded bg-rose-600 text-white disabled:opacity-50"
            disabled={closing}
            onClick={closeAndSave}
          >
            {closing ? "保存中…" : "今日はここまで（締めて保存）"}
          </button>
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-[480px] w-full text-sm border-collapse">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="text-left py-2 px-2">日付</th>
                <th className="text-left py-2 px-2">タイトル</th>
                <th className="text-right py-2 px-2">合計実績(分)</th>
                <th className="text-right py-2 px-2">完了</th>
                <th className="text-right py-2 px-2">停止</th>
                <th className="text-right py-2 px-2">件数</th>
                <th className="py-2 px-2 w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dateStr = r.report_date?.slice(0, 10); // "YYYY-MM-DD"
                const sum = r.summary || {};
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{dateStr}</td>
                    <td className="py-2 px-2">{r.title || "日報"}</td>
                    <td className="py-2 px-2 text-right">{sum.total_spent_min ?? 0}</td>
                    <td className="py-2 px-2 text-right">{sum.completed ?? 0}</td>
                    <td className="py-2 px-2 text-right">{sum.paused ?? 0}</td>
                    <td className="py-2 px-2 text-right">{sum.total ?? 0}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => openEditor(dateStr)}
                        className="px-2 py-1 rounded border"
                      >
                        開く
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loadingList && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    データなし
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 任意の日付を直接編集に開くショートカット */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">日付を直接編集：</span>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={editDate || ""}
            onChange={(e) => openEditor(e.target.value)}
          />
          <button
            className="px-2 py-1 rounded border"
            onClick={() => openEditor(toISODateInput(today))}
          >
            今日を開く
          </button>
        </div>
      </section>

      {/* エディタ（特定日 or 期間プレビュー） */}
      {(editDate || header?.period_start_at) && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            {editDate ? (
              <>
                <button className="px-3 py-1 rounded bg-gray-200" onClick={() => moveDay(-1)}>
                  ← 前日
                </button>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => openEditor(e.target.value)}
                  className="border px-2 py-1 rounded"
                />
                <button className="px-3 py-1 rounded bg-gray-200" onClick={() => moveDay(1)}>
                  翌日 →
                </button>
              </>
            ) : (
              <div className="text-sm px-2 py-1 rounded bg-indigo-50 border">
                表示中の期間：
                {header?.period_start_at
                  ? new Date(header.period_start_at).toLocaleString()
                  : "-"}
                {" 〜 "}
                {header?.period_end_at ? new Date(header.period_end_at).toLocaleString() : "-"}
                （プレビュー）
              </div>
            )}
            <div className="ml-auto text-sm opacity-70">
              {loadingEdit ? "読み込み中…" : header?.id ? "保存済み" : "未保存（プレビュー）"}
            </div>
          </div>

          <div className="grid gap-2">
            <input
              className="border px-2 py-1 rounded text-lg"
              value={header?.title || "日報"}
              onChange={(e) => setHeaderField("title", e.target.value)}
            />
            <textarea
              rows={4}
              placeholder="自由記述メモ（任意）"
              className="border px-2 py-1 rounded"
              value={header?.memo || ""}
              onChange={(e) => setHeaderField("memo", e.target.value)}
            />
          </div>

          {header?.summary && (
            <div className="text-sm opacity-80">
              合計実績: {header.summary.total_spent_min ?? 0} 分　
              完了: {header.summary.completed ?? 0}　
              停止: {header.summary.paused ?? 0}　
              件数: {header.summary.total ?? 0}
            </div>
          )}

          <div className="overflow-auto border rounded">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left w-10">#</th>
                  <th className="p-2 text-left">タイトル</th>
                  <th className="p-2">状態</th>
                  <th className="p-2">予定(分)</th>
                  <th className="p-2">実績(分)</th>
                  <th className="p-2">残</th>
                  <th className="p-2">単位</th>
                  <th className="p-2">タグ</th>
                  <th className="p-2 w-[28ch]">メモ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{it.title}</td>
                    <td className="p-2 text-center">{it.status}</td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        className="w-20 border rounded px-1 py-0.5 text-right"
                        value={it.planned_minutes ?? ""}
                        onChange={(e) =>
                          setItemField(
                            idx,
                            "planned_minutes",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        className="w-20 border rounded px-1 py-0.5 text-right"
                        value={it.spent_minutes ?? ""}
                        onChange={(e) =>
                          setItemField(
                            idx,
                            "spent_minutes",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="number"
                        className="w-20 border rounded px-1 py-0.5 text-right"
                        value={it.remaining_amount ?? ""}
                        onChange={(e) =>
                          setItemField(
                            idx,
                            "remaining_amount",
                            e.target.value === "" ? null : Number(e.target.value)
                          )
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="text"
                        className="w-20 border rounded px-1 py-0.5"
                        value={it.remaining_unit ?? ""}
                        onChange={(e) => setItemField(idx, "remaining_unit", e.target.value || null)}
                      />
                    </td>
                    <td className="p-2">{(it.tags || []).join(", ")}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="w-full border rounded px-1 py-0.5"
                        value={it.note ?? ""}
                        onChange={(e) => setItemField(idx, "note", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !loadingEdit && (
                  <tr>
                    <td colSpan={9} className="p-4 text-center opacity-60">
                      対象がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            {editDate ? (
              <button
                disabled={saving}
                onClick={save}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            ) : null}
            <button className="px-3 py-2 rounded border" onClick={() => setEditDate(null)}>
              閉じる
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
