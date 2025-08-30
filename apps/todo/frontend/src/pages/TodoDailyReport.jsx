// sensor-server/apps/todo/frontend/src/pages/TodoDailyReport.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "@/auth";

/* ===== util ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISODateInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISODateInput = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
};
const titleFromDateStr = (iso) => {
  if (!iso) return "日報";
  const d = fromISODateInput(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}の日報`;
};

/* ===== timeline (共通) ===== */
function SessionsTimeline({ sessions, plan_start_at, plan_end_at, winStart, winEnd }) {
  const toPct = (dt) => {
    const t = (dt instanceof Date) ? dt : new Date(dt);
    const a = winStart.getTime(), b = winEnd.getTime();
    const x = Math.max(a, Math.min(b, t.getTime()));
    return ((x - a) / (b - a)) * 100;
  };
  const widthPct = (s, e) => Math.max(0, toPct(e) - toPct(s));
  const gridBg =
    "repeating-linear-gradient(90deg, transparent, transparent calc(100%/12 - 1px), rgba(0,0,0,0.06) calc(100%/12))";

  // 2h刻みのラベル（タイムライン枠の外）
  const spanMs = winEnd - winStart;
  const labels = [];
  const startH = new Date(winStart); startH.setMinutes(0,0,0);
  for (let t = startH.getTime(); t <= winEnd.getTime()+1; t += 2*60*60*1000) {
    const p = ((t - winStart.getTime()) / spanMs) * 100;
    if (p <= 2 || p >= 98) continue;
    labels.push({ p: Math.max(0, Math.min(100, p)), text: `${new Date(t).getHours()}時` });
  }

  return (
    <div className="w-full">
      <div className="relative h-10 border rounded" style={{ background: gridBg }}>
        {/* 予定（上段） */}
        <div className="absolute inset-x-0 top-0 h-[46%]">
          {plan_start_at && plan_end_at && (
            <div
              className="absolute top-[2px] bottom-[2px] rounded-sm"
              style={{
                left: `${toPct(plan_start_at)}%`,
                width: `${widthPct(plan_start_at, plan_end_at)}%`,
                background: "rgba(59,130,246,0.28)",
              }}
              title={`予定 ${new Date(plan_start_at).toLocaleTimeString()} - ${new Date(plan_end_at).toLocaleTimeString()}`}
            />
          )}
        </div>
        {/* 間隔 */}
        <div className="absolute inset-x-0 top-[46%] h-[6%]" />
        {/* 実績（下段） */}
        <div className="absolute inset-x-0 bottom-0 h-[46%]">
          {(sessions || []).map((s, i) => {
            const start = s.start_at;
            const end   = s.end_at || new Date();
            return (
              <div
                key={i}
                className="absolute top-[2px] bottom-[2px] rounded-sm"
                style={{
                  left: `${toPct(start)}%`,
                  width: `${Math.max(widthPct(start, end), 0.5)}%`,
                  background: "rgba(16,185,129,0.96)",
                }}
                title={`${new Date(start).toLocaleTimeString()} - ${s.end_at ? new Date(end).toLocaleTimeString() : "実行中"}`}
              />
            );
          })}
        </div>
      </div>
      {/* 外側ラベル */}
      <div className="mt-0.5 h-4 text-[10px] text-gray-600 relative select-none">
        <div className="absolute left-0">{`${winStart.getHours()}時`}</div>
        <div className="absolute right-0">{`${winEnd.getHours()}時`}</div>
        {labels.map((lb, i) => (
          <div key={i} className="absolute -translate-x-1/2" style={{ left: `${lb.p}%` }}>
            {lb.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== メイン ===== */
export default function TodoDailyReport() {
  const [sp] = useSearchParams();

  const todayIso = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0);
    return toISODateInput(d);
  }, []);
  const [editDate, setEditDate] = useState(() => sp.get("date") || todayIso);

  const [header, setHeader] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadDay = async (dayStr) => {
    if (!dayStr) return;
    setLoadingEdit(true);
    try {
      const data = await fetchJson(`/api/todo/reports?date=${dayStr}&with_sessions=1`);
      setHeader(data.header);
      setItems(data.items || []);
    } catch (e) {
      alert(`日報読み込み失敗: ${e.message}`);
    } finally {
      setLoadingEdit(false);
    }
  };

  useEffect(() => { loadDay(editDate); /* eslint-disable-next-line */ }, []);
  const openEditor = (dayStr) => { setEditDate(dayStr); loadDay(dayStr); };
  const moveDay = (delta) => { const d = fromISODateInput(editDate); d.setDate(d.getDate()+delta); openEditor(toISODateInput(d)); };
  const openToday = () => openEditor(todayIso);

  const setItemField = (idx, key, val) =>
    setItems((list) => { const cp = [...list]; cp[idx] = { ...cp[idx], [key]: val }; return cp; });

  const save = async () => {
    if (!editDate) return;
    setSaving(true);
    try {
      await fetchJson(`/api/todo/reports`, {
        method: "POST",
        body: JSON.stringify({
          date: editDate,
          title: titleFromDateStr(editDate),
          memo: header?.memo || "",
          items: items.map((it, i) => ({ ...it, sort_order: i + 1 })),
        }),
      });
      await loadDay(editDate);
      alert("保存しました");
    } catch (e) {
      alert(`保存に失敗: ${e.message}`);
    } finally { setSaving(false); }
  };

  // タイムライン表示範囲（±1h、無い時は 8–19 時）
  const timelineWindow = useMemo(() => {
    const padMin = 60;
    const toDate = (v) => (v ? new Date(v) : null);
    let start = toDate(header?.period_start_at);
    let end   = toDate(header?.period_end_at) || (editDate ? new Date(`${editDate}T19:00:00`) : null);
    if (start && !end) end = new Date();
    if (!start || !end) {
      const base = editDate ? new Date(`${editDate}T00:00:00`) : new Date();
      const s = new Date(base); s.setHours(8,0,0,0);
      const e = new Date(base); e.setHours(19,0,0,0);
      return { winStart: s, winEnd: e };
    }
    return {
      winStart: new Date(start.getTime() - padMin * 60000),
      winEnd:   new Date(end.getTime()   + padMin * 60000),
    };
  }, [header?.period_start_at, header?.period_end_at, editDate]);

  /* ========== レンダリング ========== */
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{titleFromDateStr(editDate)}</h1>

      {/* ===== 操作列：PC（従来のまま） ===== */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-black text-white" onClick={openToday}>今日を開く</button>
          <button className="px-3 py-1 rounded border" onClick={() => moveDay(-1)}>← 前日</button>
          <input type="date" value={editDate} onChange={(e)=>openEditor(e.target.value)} className="border px-2 py-1 rounded" />
          <button className="px-3 py-1 rounded border" onClick={() => moveDay(1)}>翌日 →</button>
        </div>
        <div className="text-sm opacity-70">
          {loadingEdit ? "読み込み中…" : header?.id ? "保存済み" : "未保存（プレビュー）"}
        </div>
      </div>

      {/* ===== 操作列：スマホ（省スペース） ===== */}
      <div className="lg:hidden flex items-center gap-2">
        <button className="px-3 py-1.5 rounded bg-black text-white" onClick={openToday}>今日</button>
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(-1)}>←</button>
        <input
          type="date"
          value={editDate}
          onChange={(e) => openEditor(e.target.value)}
          className="flex-1 border px-2 py-1 rounded text-[16px]"
        />
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(1)}>→</button>
        <div className="ml-auto text-xs opacity-70">{loadingEdit ? "…" : header?.id ? "保存済み" : "未保存"}</div>
      </div>

      {/* メモ */}
      <textarea
        rows={3}
        placeholder="自由記述メモ（任意）"
        className="border px-2 py-1 rounded w-full"
        value={header?.memo || ""}
        onChange={(e) => setHeader((h) => ({ ...(h || {}), memo: e.target.value }))}
      />

      {/* サマリ */}
      {header?.summary && (
        <div className="text-sm lg:text-xs opacity-80">
          合計実績: {header.summary.total_spent_min ?? 0} 分　完了: {header.summary.completed ?? 0}　
          停止: {header.summary.paused ?? 0}　件数: {header.summary.total ?? 0}
        </div>
      )}

      {/* ====== PC：従来のテーブル UI（そのまま復元） ====== */}
      <div className="hidden lg:block">
        {/* 列ラベル固定 */}
        <div className="grid grid-cols-[2rem_28ch_12ch_1fr] gap-x-1 text-xs text-gray-500 px-1">
          <div>#</div>
          <div>タイトル / 残</div>
          <div>予定 / 実績(分)</div>
          <div>時間帯</div>
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-[880px] w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "2rem" }} />
              <col style={{ width: "26ch" }} />
              <col style={{ width: "7.5ch" }} />
              <col />
            </colgroup>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="pl-2 pr-0 py-0.5 text-xs">{idx + 1}</td>
                  <td className="p-0.5">
                    <div className="text-sm leading-tight truncate">{it.title}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                      <span>残</span>
                      <input
                        type="number"
                        className="h-6 w-12 border rounded px-1 py-0.5 text-right"
                        value={it.remaining_amount ?? ""}
                        onChange={(e) =>
                          setItemField(idx, "remaining_amount", e.target.value === "" ? null : Number(e.target.value))
                        }
                      />
                      <input
                        type="text"
                        className="h-6 w-10 border rounded px-1 py-0.5"
                        value={it.remaining_unit ?? ""}
                        onChange={(e) => setItemField(idx, "remaining_unit", e.target.value || null)}
                        placeholder="単位"
                      />
                    </div>
                  </td>
                  <td className="p-0 pr-[2px]">
                    <div className="flex flex-col gap-[2px] text-xs">
                      <div className="flex items-center gap-1">
                        <span className="opacity-70">予</span>
                        <input
                          type="number"
                          className="h-6 w-10 border rounded px-1 py-0.5 text-right"
                          value={it.planned_minutes ?? ""}
                          onChange={(e) =>
                            setItemField(idx, "planned_minutes", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="opacity-70">実</span>
                        <input
                          type="number"
                          className="h-6 w-10 border rounded px-1 py-0.5 text-right"
                          value={it.spent_minutes ?? ""}
                          onChange={(e) =>
                            setItemField(idx, "spent_minutes", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </div>
                    </div>
                  </td>
                  <td className="p-0 pr-[2px]">
                    <SessionsTimeline
                      sessions={it.sessions}
                      plan_start_at={it.plan_start_at}
                      plan_end_at={it.plan_end_at}
                      winStart={timelineWindow.winStart}
                      winEnd={timelineWindow.winEnd}
                    />
                  </td>
                </tr>
              ))}
              {items.length === 0 && !loadingEdit && (
                <tr><td colSpan={4} className="p-3 text-center opacity-60 text-sm">対象がありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====== スマホ：カード UI（入力は残/予/実を一列に） ====== */}
      <div className="lg:hidden space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="border rounded-xl p-3 shadow-sm">
            <div className="text-lg font-semibold mb-1">
              {idx + 1}. {it.title}
            </div>
            <div className="flex items-center gap-2 text-base">
              <span className="text-gray-600">残</span>
              <input
                type="number"
                className="h-9 w-16 border rounded px-2 text-right"
                value={it.remaining_amount ?? ""}
                onChange={(e) =>
                  setItemField(idx, "remaining_amount", e.target.value === "" ? null : Number(e.target.value))
                }
              />
              <span className="text-gray-600">分</span>

              <span className="ml-3 text-gray-600">予</span>
              <input
                type="number"
                className="h-9 w-16 border rounded px-2 text-right"
                value={it.planned_minutes ?? ""}
                onChange={(e) =>
                  setItemField(idx, "planned_minutes", e.target.value ? Number(e.target.value) : null)
                }
              />

              <span className="ml-3 text-gray-600">実</span>
              <input
                type="number"
                className="h-9 w-16 border rounded px-2 text-right"
                value={it.spent_minutes ?? ""}
                onChange={(e) =>
                  setItemField(idx, "spent_minutes", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
          </div>
        ))}
        {items.length === 0 && !loadingEdit && (
          <div className="text-center text-sm opacity-60">対象がありません</div>
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex gap-2">
        <button
          disabled={saving}
          onClick={save}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
