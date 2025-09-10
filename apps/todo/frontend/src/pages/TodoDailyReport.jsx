// sensor-server/apps/todo/frontend/src/pages/TodoDailyReport.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchJson } from "@/auth";

/* ===== util ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISODateInput = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISODateInput = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
};
const titleFromDateStr = (iso) => {
  if (!iso) return "日報";
  const d = fromISODateInput(iso);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(
    d.getDate()
  )}の日報`;
};
/** m(分) → "H時間M分" / "M分" */
function fmtMinutes(m) {
  const n = Number(m ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0分";
  const h = Math.floor(n / 60);
  const r = n % 60;
  return h > 0 ? `${h}時間${r ? `${r}分` : ""}` : `${r}分`;
}
/** 実績(分)：spent_minutes 優先、無ければ sessions 集計 */
function actualMinutesOf(item) {
  if (item?.spent_minutes != null) {
    const n = Number(item.spent_minutes);
    return Number.isFinite(n) ? n : 0;
  }
  const ses = Array.isArray(item?.sessions) ? item.sessions : [];
  if (!ses.length) return 0;
  let sec = 0;
  for (const s of ses) {
    if (typeof s?.seconds === "number") {
      sec += Math.max(0, s.seconds);
    } else if (s?.start_at) {
      const st = new Date(s.start_at).getTime();
      const et = s?.end_at ? new Date(s.end_at).getTime() : Date.now();
      sec += Math.max(0, Math.floor((et - st) / 1000));
    }
  }
  return Math.round(sec / 60);
}
/** 予定(分)：planned_minutes 優先、無ければ plan_start_at〜plan_end_at */
function plannedMinutesOf(item) {
  if (item?.planned_minutes != null) {
    const n = Number(item.planned_minutes);
    return Number.isFinite(n) ? n : 0;
  }
  if (item?.plan_start_at && item?.plan_end_at) {
    const st = new Date(item.plan_start_at).getTime();
    const et = new Date(item.plan_end_at).getTime();
    return Math.max(0, Math.round((et - st) / 60000));
  }
  return 0;
}

/* ===== timeline (共通) ===== */
function SessionsTimeline({ sessions, plan_start_at, plan_end_at, winStart, winEnd }) {
  const toPct = (dt) => {
    const t = dt instanceof Date ? dt : new Date(dt);
    const a = winStart.getTime(),
      b = winEnd.getTime();
    const x = Math.max(a, Math.min(b, t.getTime()));
    return ((x - a) / (b - a)) * 100;
  };
  const widthPct = (s, e) => Math.max(0, toPct(e) - toPct(s));
  const gridBg =
    "repeating-linear-gradient(90deg, transparent, transparent calc(100%/12 - 1px), rgba(0,0,0,0.06) calc(100%/12))";

  // 2h刻みラベル
  const spanMs = winEnd - winStart;
  const labels = [];
  const startH = new Date(winStart);
  startH.setMinutes(0, 0, 0);
  for (let t = startH.getTime(); t <= winEnd.getTime() + 1; t += 2 * 60 * 60 * 1000) {
    const p = ((t - winStart.getTime()) / spanMs) * 100;
    if (p <= 2 || p >= 98) continue;
    labels.push({ p: Math.max(0, Math.min(100, p)), text: `${new Date(t).getHours()}時` });
  }

  return (
    <div className="w-full">
      <div className="mb-0.5 h-4 text-[10px] text-gray-600 relative select-none">
        <div className="absolute left-0">{`${winStart.getHours()}時`}</div>
        <div className="absolute right-0">{`${winEnd.getHours()}時`}</div>
        {labels.map((lb, i) => (
          <div key={i} className="absolute -translate-x-1/2" style={{ left: `${lb.p}%` }}>
            {lb.text}
          </div>
        ))}
      </div>

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
              title={`予定 ${new Date(plan_start_at).toLocaleTimeString()} - ${new Date(
                plan_end_at
              ).toLocaleTimeString()}`}
            />
          )}
        </div>
        <div className="absolute inset-x-0 top-[46%] h-[6%]" />
        {/* 実績（下段） */}
        <div className="absolute inset-x-0 bottom-0 h-[46%]">
          {(sessions || []).map((s, i) => {
            const start = s.start_at;
            const end = s.end_at || new Date();
            return (
              <div
                key={i}
                className="absolute top-[2px] bottom-[2px] rounded-sm"
                style={{
                  left: `${toPct(start)}%`,
                  width: `${Math.max(widthPct(start, end), 0.5)}%`,
                  background: "rgba(16,185,129,0.96)",
                }}
                title={`${new Date(start).toLocaleTimeString()} - ${
                  s.end_at ? new Date(end).toLocaleTimeString() : "実行中"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ====== 小さなモーダル（共通） ====== */
function Modal({ open, title, children, onCancel, onSave, saveLabel = "保存" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative z-10 w-[min(92vw,460px)] rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 text-lg font-semibold">{title}</div>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="px-3 py-1 rounded border" onClick={onCancel}>
            キャンセル
          </button>
          <button className="px-4 py-1.5 rounded bg-blue-600 text-white" onClick={onSave}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== メイン ===== */
export default function TodoDailyReport() {
  const [sp] = useSearchParams();

  const todayIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toISODateInput(d);
  }, []);
  const [editDate, setEditDate] = useState(() => sp.get("date") || todayIso);

  const [header, setHeader] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  // ====== トースト ======
  const [toast, setToast] = useState(null); // {type, text}
  const toastTimerRef = useRef(null);
  const showToast = (t) => {
    setToast(t);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => toastTimerRef.current && clearTimeout(toastTimerRef.current), []);

  const loadDay = async (dayStr) => {
    if (!dayStr) return;
    setLoadingEdit(true);
    try {
      const data = await fetchJson(`/api/todo/reports?date=${dayStr}&with_sessions=1`);
      setHeader(data.header);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      showToast({ type: "error", text: `日報読み込み失敗: ${e.message}` });
    } finally {
      setLoadingEdit(false);
    }
  };

  useEffect(() => {
    loadDay(editDate);
    // eslint-disable-next-line
  }, []);
  const openEditor = (dayStr) => {
    setEditDate(dayStr);
    loadDay(dayStr);
  };
  const moveDay = (delta) => {
    const d = fromISODateInput(editDate);
    d.setDate(d.getDate() + delta);
    openEditor(toISODateInput(d));
  };
  const openToday = () => openEditor(todayIso);

  const setItemField = (idx, key, val) =>
    setItems((list) => {
      const cp = [...list];
      cp[idx] = { ...cp[idx], [key]: val };
      return cp;
    });

  const save = async () => {
    if (!editDate) return;
    setSaving(true);
    try {
      await fetchJson(`/api/todo/reports`, {
        method: "PATCH",
        body: JSON.stringify({
          date: editDate,
          title: titleFromDateStr(editDate),
          memo: header?.memo || "",
          items: items.map((it, i) => ({
            id: it.id,
            planned_minutes: it.planned_minutes ?? null,
            spent_minutes: it.spent_minutes ?? null,
            remaining_amount: it.remaining_amount ?? null,
            remaining_unit: it.remaining_unit ?? null,
            note: it.note ?? null,
            sort_order: i + 1,
          })),
        }),
      });
      await loadDay(editDate);
      showToast({ type: "success", text: "保存しました" });
    } catch (e) {
      showToast({ type: "error", text: `保存に失敗: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  // タイムライン表示範囲
  const timelineWindow = useMemo(() => {
    const padMin = 60;
    const isSnapshot = !!header?.id;
    const isToday = editDate === todayIso;

    if (isSnapshot) {
      const start = header?.period_start_at ? new Date(header.period_start_at) : null;
      const endRaw = header?.period_end_at
        ? new Date(header.period_end_at)
        : header?.period_start_at
        ? new Date()
        : null;
      if (start && endRaw) {
        return {
          winStart: new Date(start.getTime() - padMin * 60000),
          winEnd: new Date(endRaw.getTime() + padMin * 60000),
        };
      }
      const base = new Date(`${editDate}T00:00:00`);
      const s = new Date(base);
      s.setHours(8, 0, 0, 0);
      const e = new Date(base);
      e.setHours(19, 0, 0, 0);
      return { winStart: s, winEnd: e };
    }

    // プレビュー
    const base = new Date(`${editDate}T00:00:00`);
    const s = new Date(base);
    s.setHours(8, 0, 0, 0);
    let e = new Date(base);
    e.setHours(19, 0, 0, 0);

    if (isToday) {
      const now = new Date();
      if (now.getHours() >= 19) {
        e = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }
    }
    return { winStart: s, winEnd: e };
  }, [header?.id, header?.period_start_at, header?.period_end_at, editDate, todayIso]);

  /* ===== サマリ（完了/停止は削除） ===== */
  const totalsFromItems = useMemo(() => {
    const planned = items.reduce((acc, it) => acc + plannedMinutesOf(it), 0);
    const actual = items.reduce((acc, it) => acc + actualMinutesOf(it), 0);
    return { planned, actual, total: items.length };
  }, [items]);
  const isPreview = !header?.id;
  const summary = isPreview
    ? {
        total_planned_min: totalsFromItems.planned,
        total_spent_min: totalsFromItems.actual,
      }
    : {
        total_planned_min:
          header?.summary?.total_planned_min ?? totalsFromItems.planned,
        total_spent_min:
          header?.summary?.total_spent_min ?? totalsFromItems.actual,
      };

  /* ====== クリック編集モーダルの状態 ====== */
  const [editState, setEditState] = useState(null);
  // editState: { type: 'remain'|'plan'|'spent', idx: number }

  // 入力用の一時値
  const [tmpHours, setTmpHours] = useState(0);
  const [tmpMins, setTmpMins] = useState(0);
  const [tmpRemain, setTmpRemain] = useState(null);
  const [tmpUnit, setTmpUnit] = useState("");

  const openMinutesEditor = (type, idx, initialMin) => {
    const n = Math.max(0, Number(initialMin || 0));
    setTmpHours(Math.floor(n / 60));
    setTmpMins(n % 60);
    setEditState({ type, idx });
  };
  const openRemainEditor = (idx, amt, unit) => {
    setTmpRemain(amt ?? 0);
    setTmpUnit(unit ?? "");
    setEditState({ type: "remain", idx });
  };
  const closeEditor = () => setEditState(null);
  const saveEditor = () => {
    if (!editState) return;
    const { type, idx } = editState;
    if (type === "plan") {
      const total = Math.max(0, Math.floor(Number(tmpHours) * 60 + Number(tmpMins || 0)));
      setItemField(idx, "planned_minutes", total);
    } else if (type === "spent") {
      const total = Math.max(0, Math.floor(Number(tmpHours) * 60 + Number(tmpMins || 0)));
      setItemField(idx, "spent_minutes", total);
    } else if (type === "remain") {
      setItemField(idx, "remaining_amount", tmpRemain === "" ? null : Number(tmpRemain));
      setItemField(idx, "remaining_unit", tmpUnit || null);
    }
    closeEditor();
  };

  /* ========== レンダリング ========== */
  return (
    <div className="p-4 space-y-4">
      {/* 上部ヘッダー：タイトル + 保存 */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{titleFromDateStr(editDate)}</h1>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-sm opacity-70">
            {loadingEdit ? "読み込み中…" : header?.id ? "保存済み" : "未保存（プレビュー）"}
          </span>
          <button
            disabled={saving}
            onClick={save}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            title="日報を保存"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div
          className={[
            "fixed right-3 top-3 z-50 rounded shadow px-3 py-2 text-sm",
            toast.type === "success"
              ? "bg-green-600 text-white"
              : toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-gray-700 text-white",
          ].join(" ")}
        >
          {toast.text}
        </div>
      )}

      {/* 操作列：PC */}
      <div className="hidden lg:flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded bg-black text-white" onClick={openToday}>
            今日を開く
          </button>
          <button className="px-3 py-1 rounded border" onClick={() => moveDay(-1)}>
            ← 前日
          </button>
          <input
            type="date"
            value={editDate}
            onChange={(e) => openEditor(e.target.value)}
            className="border px-2 py-1 rounded"
          />
          <button className="px-3 py-1 rounded border" onClick={() => moveDay(1)}>
            翌日 →
          </button>
        </div>
      </div>

      {/* 操作列：スマホ */}
      <div className="lg:hidden flex items-center gap-2">
        <button className="px-3 py-1.5 rounded bg-black text-white" onClick={openToday}>
          今日
        </button>
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(-1)}>
          ←
        </button>
        <input
          type="date"
          value={editDate}
          onChange={(e) => openEditor(e.target.value)}
          className="flex-1 border px-2 py-1 rounded text-[16px]"
        />
        <button className="px-3 py-1 rounded border" onClick={() => moveDay(1)}>
          →
        </button>
      </div>

      {/* メモ */}
      <textarea
        rows={3}
        placeholder="自由記述メモ（任意）"
        className="border px-2 py-1 rounded w-full"
        value={header?.memo || ""}
        onChange={(e) => setHeader((h) => ({ ...(h || {}), memo: e.target.value }))}
      />

      {/* サマリ（完了/停止は表示しない） */}
      <div className="text-sm lg:text-xs opacity-80">
        予定合計: {fmtMinutes(summary.total_planned_min)}　実績合計:{" "}
        {fmtMinutes(summary.total_spent_min)}
      </div>

      {/* ====== PC：テーブル UI（値はテキスト表示、クリックで編集） ====== */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-[2rem_28ch_18ch_1fr] gap-x-1 text-xs text-gray-500 px-1">
          <div>#</div>
          <div>タイトル / 残</div>
          <div>予定 / 実績</div>
          <div>時間帯</div>
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-[900px] w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "2rem" }} />
              <col style={{ width: "26ch" }} />
              <col style={{ width: "14ch" }} />
              <col />
            </colgroup>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="pl-2 pr-0 py-1 text-xs">{idx + 1}</td>
                  <td className="p-1">
                    <div className="text-sm leading-tight truncate">{it.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
                      <span>残</span>
                      <button
                        className="underline underline-offset-2 decoration-dotted"
                        onClick={() => openRemainEditor(idx, it.remaining_amount, it.remaining_unit)}
                        title="残を編集"
                      >
                        {it.remaining_amount ?? 0}
                        {it.remaining_unit ? it.remaining_unit : ""}
                      </button>
                    </div>
                  </td>
                  <td className="p-1">
                    <div className="flex flex-col gap-[2px] text-xs">
                      <button
                        className="text-left underline underline-offset-2 decoration-dotted"
                        onClick={() =>
                          openMinutesEditor("plan", idx, plannedMinutesOf(it))
                        }
                        title="予定を編集"
                      >
                        予：{fmtMinutes(plannedMinutesOf(it))}
                      </button>
                      <button
                        className="text-left underline underline-offset-2 decoration-dotted"
                        onClick={() =>
                          openMinutesEditor("spent", idx, actualMinutesOf(it))
                        }
                        title="実績を編集"
                      >
                        実：{fmtMinutes(actualMinutesOf(it))}
                      </button>
                    </div>
                  </td>
                  <td className="p-1 pr-[2px]">
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
                <tr>
                  <td colSpan={4} className="p-3 text-center opacity-60 text-sm">
                    対象がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====== スマホ：カード UI（同様にクリック編集） ====== */}
      <div className="lg:hidden space-y-3">
        {items.map((it, idx) => (
          <div key={idx} className="border rounded-xl p-3 shadow-sm">
            <div className="text-lg font-semibold mb-1">
              {idx + 1}. {it.title}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-base">
              <div className="flex items-center gap-1">
                <span className="text-gray-600">残</span>
                <button
                  className="underline underline-offset-2 decoration-dotted"
                  onClick={() => openRemainEditor(idx, it.remaining_amount, it.remaining_unit)}
                  title="残を編集"
                >
                  {it.remaining_amount ?? 0}
                  {it.remaining_unit ? it.remaining_unit : ""}
                </button>
              </div>

              <div>
                <button
                  className="underline underline-offset-2 decoration-dotted"
                  onClick={() => openMinutesEditor("plan", idx, plannedMinutesOf(it))}
                  title="予定を編集"
                >
                  予：{fmtMinutes(plannedMinutesOf(it))}
                </button>
              </div>

              <div>
                <button
                  className="underline underline-offset-2 decoration-dotted"
                  onClick={() => openMinutesEditor("spent", idx, actualMinutesOf(it))}
                  title="実績を編集"
                >
                  実：{fmtMinutes(actualMinutesOf(it))}
                </button>
              </div>
            </div>

            <div className="mt-2">
              <SessionsTimeline
                sessions={it.sessions}
                plan_start_at={it.plan_start_at}
                plan_end_at={it.plan_end_at}
                winStart={timelineWindow.winStart}
                winEnd={timelineWindow.winEnd}
              />
            </div>
          </div>
        ))}
        {items.length === 0 && !loadingEdit && (
          <div className="text-center text-sm opacity-60">対象がありません</div>
        )}
      </div>

      {/* ==== 編集モーダル（分→時分） ==== */}
      <Modal
        open={!!editState && (editState.type === "plan" || editState.type === "spent")}
        title={editState?.type === "plan" ? "予定の編集" : "実績の編集"}
        onCancel={closeEditor}
        onSave={saveEditor}
        saveLabel="更新"
      >
        <div className="text-sm text-gray-600">表示は「{fmtMinutes(tmpHours * 60 + (Number(tmpMins) || 0))}」</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="w-20 border rounded px-2 py-1 text-right"
            value={tmpHours}
            min={0}
            onChange={(e) => setTmpHours(Math.max(0, Number(e.target.value || 0)))}
          />
          <span>時間</span>
          <input
            type="number"
            className="w-20 border rounded px-2 py-1 text-right"
            value={tmpMins}
            min={0}
            max={59}
            onChange={(e) => {
              const v = Math.max(0, Math.min(59, Number(e.target.value || 0)));
              setTmpMins(v);
            }}
          />
          <span>分</span>
        </div>
      </Modal>

      {/* ==== 残の編集モーダル ==== */}
      <Modal
        open={!!editState && editState.type === "remain"}
        title="残の編集"
        onCancel={closeEditor}
        onSave={saveEditor}
        saveLabel="更新"
      >
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="w-28 border rounded px-2 py-1 text-right"
            value={tmpRemain ?? ""}
            onChange={(e) => setTmpRemain(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="数量"
          />
          <input
            type="text"
            className="w-24 border rounded px-2 py-1"
            value={tmpUnit}
            onChange={(e) => setTmpUnit(e.target.value)}
            placeholder="単位（例: 分, 個）"
          />
        </div>
      </Modal>
    </div>
  );
}
