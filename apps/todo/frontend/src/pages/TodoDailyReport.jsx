import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "@/auth";

/* ========= util ========= */
const pad2 = (n) => String(n).padStart(2, "0");
function toISODateInput(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fromISODateInput(s) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function titleFromDateStr(iso) {
  if (!iso) return "日報";
  const d = fromISODateInput(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}の日報`;
}

/* ========= timeline (PC用) ========= */
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

  const hourLabels = useMemo(() => {
    const labels = [];
    const spanMs = winEnd - winStart;
    const startH = new Date(winStart); startH.setMinutes(0,0,0);
    for (let t = startH.getTime(); t <= winEnd.getTime()+1; t += 2*60*60*1000) {
      const p = ((t - winStart.getTime()) / spanMs) * 100;
      if (p <= 2 || p >= 98) continue; // 端は別で描く
      const h = new Date(t).getHours();
      labels.push({ p: Math.max(0, Math.min(100, p)), text: `${h}時` });
    }
    return labels;
  }, [winStart, winEnd]);

  return (
    <div className="w-full">
      <div className="relative h-10 border rounded" style={{ background: gridBg }}>
        {/* plan (top) */}
        <div className="absolute inset-x-0 top-0 h-[46%]">
          {plan_start_at && plan_end_at && (() => {
            const left  = `${toPct(plan_start_at)}%`;
            const width = `${widthPct(plan_start_at, plan_end_at)}%`;
            return (
              <div className="absolute top-[2px] bottom-[2px] rounded-sm"
                   style={{ left, width, background: "rgba(59,130,246,0.28)" }} />
            );
          })()}
        </div>
        {/* small gap */}
        <div className="absolute inset-x-0 top-[46%] h-[6%]" />
        {/* sessions (bottom) */}
        <div className="absolute inset-x-0 bottom-0 h-[46%]">
          {(sessions || []).map((s, i) => {
            const start = s.start_at;
            const end   = s.end_at || new Date();
            const left  = `${toPct(start)}%`;
            const width = `${Math.max(widthPct(start, end), 0.5)}%`;
            return (
              <div key={i}
                   className="absolute top-[2px] bottom-[2px] rounded-sm"
                   style={{ left, width, background: "rgba(16,185,129,0.96)" }} />
            );
          })}
        </div>
      </div>
      <div className="mt-[2px] h-4 text-[10px] text-gray-600 relative select-none">
        <div className="absolute left-0">{`${winStart.getHours()}時`}</div>
        <div className="absolute right-0">{`${winEnd.getHours()}時`}</div>
        {hourLabels.map((lb, i) => (
          <div key={i} className="absolute -translate-x-1/2" style={{ left: `${lb.p}%` }}>
            {lb.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========= main ========= */
export default function TodoDailyReport() {
  const [sp] = useSearchParams();

  // 既定で当日を開く
  const todayIso = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
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

  const openEditor = (d) => { setEditDate(d); loadDay(d); };
  const setItemField = (idx, key, val) =>
    setItems((list) => { const copy = [...list]; copy[idx] = { ...copy[idx], [key]: val }; return copy; });

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

  const moveDay = (delta) => {
    const d = fromISODateInput(editDate);
    d.setDate(d.getDate() + delta);
    openEditor(toISODateInput(d));
  };
  const openToday = () => openEditor(todayIso);

  // PCのタイムライン表示ウィンドウ（±1h / 既存仕様）
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

  /* ===== ここからUI ===== */

  // 共通ヘッダ(タイトル＋メモ)
  const HeaderCommon = (
    <>
      <h1 className="text-xl md:text-2xl font-semibold">{titleFromDateStr(editDate)}</h1>
      <textarea
        rows={3}
        placeholder="自由記述メモ（任意）"
        className="border px-2 py-1 rounded w-full"
        value={header?.memo || ""}
        onChange={(e) => setHeader((h) => ({ ...(h || {}), memo: e.target.value }))}
      />
      {header?.summary && (
        <div className="text-[13px] md:text-sm opacity-80">
          合計実績: {header.summary.total_spent_min ?? 0} 分　
          完了: {header.summary.completed ?? 0}　
          停止: {header.summary.paused ?? 0}　
          件数: {header.summary.total ?? 0}
        </div>
      )}
    </>
  );

  // 日付ナビ（PC/スマホ両方に出す）
  const DateNav = (
    <div className="flex flex-wrap items-center gap-2 justify-between">
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded bg-black text-white" onClick={openToday}>
          今日を開く
        </button>
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(-1)}>← 前日</button>
        <input
          type="date"
          value={editDate}
          onChange={(e) => openEditor(e.target.value)}
          className="border px-2 py-1 rounded"
        />
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(1)}>翌日 →</button>
      </div>
      <div className="text-sm opacity-70">
        {loadingEdit ? "読み込み中…" : header?.id ? "保存済み" : "未保存（プレビュー）"}
      </div>
    </div>
  );

  /* ------ PC: 従来のテーブル＋タイムライン（md以上で表示） ------ */
  const DesktopTable = (
    <div className="hidden md:block space-y-4">
      {DateNav}
      {HeaderCommon}

      {/* 列ラベル（スクロール外に固定） */}
      <div className="grid grid-cols-[2rem_28ch_12ch_1fr] gap-x-1 text-xs text-gray-500 px-1">
        <div>#</div>
        <div>タイトル / 残</div>
        <div>予定 / 実績(分)</div>
        <div>時間帯</div>
      </div>

      <div className="overflow-auto border rounded">
        <table className="min-w-[880px] w-full text-sm border-collapse table-fixed">
          <colgroup>
            <col style={{ width: "2.0rem" }} />
            <col style={{ width: "26ch"  }} />
            <col style={{ width: "9.5ch" }} />
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
                        setItemField(idx, "remaining_amount",
                          e.target.value === "" ? null : Number(e.target.value))}
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
                          setItemField(idx, "planned_minutes",
                            e.target.value ? Number(e.target.value) : null)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="opacity-70">実</span>
                      <input
                        type="number"
                        className="h-6 w-10 border rounded px-1 py-0.5 text-right"
                        value={it.spent_minutes ?? ""}
                        onChange={(e) =>
                          setItemField(idx, "spent_minutes",
                            e.target.value ? Number(e.target.value) : null)}
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
              <tr><td colSpan={4} className="p-3 text-center opacity-60">対象がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button disabled={saving} onClick={save}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );

  /* ------ スマホ: グラフ省略のカード表示（md未満で表示） ------ */
  const MobileCards = (
    <div className="md:hidden space-y-4">
      {DateNav}
      {HeaderCommon}

      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="border rounded-lg p-3">
            <div className="text-lg font-semibold mb-1">
              {idx + 1}. {it.title}
            </div>
            <div className="text-[15px] text-gray-700 space-y-1">
              <div>残: <span className="font-medium">{it.remaining_amount ?? 0}</span> <span className="opacity-70">{it.remaining_unit ?? "分"}</span></div>
              <div className="flex gap-6">
                <div>予: <span className="font-medium">{it.planned_minutes ?? "-"}</span></div>
                <div>実: <span className="font-medium">{it.spent_minutes ?? 0}</span></div>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && !loadingEdit && (
          <div className="text-center text-sm opacity-60">対象がありません</div>
        )}
      </div>

      <div className="flex gap-2">
        <button disabled={saving} onClick={save}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 text-base">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      {/* スマホ/PCで出し分け */}
      {DesktopTable}
      {MobileCards}
    </div>
  );
}
