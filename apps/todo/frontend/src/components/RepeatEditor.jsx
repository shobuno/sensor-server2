// sensor-server/apps/todo/frontend/src/components/RepeatEditor.jsx
import { useMemo } from "react";

/**
 * value の形（保存用の素直なJSON）
 * {
 *   type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "after",
 *   interval?: number,                // daily/weekly/monthlyでの間隔（例: 1=毎, 2=隔〜）
 *   weekdays?: string[],              // weekly: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
 *   monthly?: { mode: "day"|"nth", day?: number, nth?: number, weekday?: string },
 *   yearly?: { month: number, day: number },
 *   after?: { amount: number, unit: "hour"|"day"|"week"|"month" },
 *   generate?: {                      // 次回分の生成タイミング
 *     policy: "immediate"|"on_due"|"before",
 *     advance_days?: number           // "before" のときだけ使用
 *   }
 * }
 *
 * props:
 * - value: 上記のオブジェクト or null/undefined → 内部で "none" 扱いに
 * - onChange(next): 値更新
 * - dueDate?: ISO (将来: UI上の補助表示で使用予定)
 */
export default function RepeatEditor({ value, onChange, dueDate }) {
  const r = useMemo(() => {
    const v = value || {};
    return {
      type: v.type || "none",
      interval: v.interval ?? 1,
      weekdays: Array.isArray(v.weekdays) ? v.weekdays : [],
      monthly: v.monthly || { mode: "day", day: 1, nth: 1, weekday: "mon" },
      yearly: v.yearly || { month: 1, day: 1 },
      after: v.after || { amount: 1, unit: "day" },
      generate: v.generate || { policy: "immediate", advance_days: 0 },
    };
  }, [value]);

  const set = (patch) => onChange({ ...r, ...patch });

  const WEEK = [
    { k: "mon", l: "月" },
    { k: "tue", l: "火" },
    { k: "wed", l: "水" },
    { k: "thu", l: "木" },
    { k: "fri", l: "金" },
    { k: "sat", l: "土" },
    { k: "sun", l: "日" },
  ];
  const toggleWeek = (k) =>
    set({
      weekdays: r.weekdays.includes(k)
        ? r.weekdays.filter((x) => x !== k)
        : [...r.weekdays, k],
    });

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">繰り返し</span>
        <select
          className="ml-auto border rounded px-2 py-1 text-sm"
          value={r.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="none">しない</option>
          <option value="daily">毎日/隔日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
          <option value="yearly">毎年</option>
          <option value="after">完了後◯時間/日/週/月</option>
        </select>
      </div>

      {/* 共通: interval */}
      {["daily", "weekly", "monthly"].includes(r.type) && (
        <label className="block text-sm">
          <span className="text-gray-600">間隔</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              className="w-24 border rounded px-2 py-1"
              value={r.interval}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-gray-500">
              {r.type === "daily" && "日ごと"}
              {r.type === "weekly" && "週ごと"}
              {r.type === "monthly" && "か月ごと"}
            </span>
          </div>
        </label>
      )}

      {/* weekly: 曜日選択 */}
      {r.type === "weekly" && (
        <div className="text-sm">
          <div className="text-gray-600 mb-1">曜日</div>
          <div className="flex flex-wrap gap-1">
            {WEEK.map(({ k, l }) => {
              const on = r.weekdays.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleWeek(k)}
                  className={`px-2 py-1 rounded border text-sm ${
                    on ? "bg-emerald-600 text-white border-emerald-700" : "bg-white"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {r.weekdays.length === 0 && (
            <div className="mt-1 text-xs text-amber-600">
              ※1つ以上選んでください
            </div>
          )}
        </div>
      )}

      {/* monthly: 日付 or 第n◯曜日 or 月末 */}
      {r.type === "monthly" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="text-gray-600">指定方法</span>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.monthly.mode}
              onChange={(e) =>
                set({ monthly: { ...r.monthly, mode: e.target.value } })
              }
            >
              <option value="day">日付で指定（◯日）</option>
              <option value="nth">第n◯曜日</option>
              <option value="eom">月末</option>
            </select>
          </label>

          {r.monthly.mode === "day" && (
            <label className="block">
              <span className="text-gray-600">日（1-31）</span>
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full border rounded px-2 py-1"
                value={r.monthly.day ?? 1}
                onChange={(e) =>
                  set({
                    monthly: {
                      ...r.monthly,
                      day: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
                    },
                  })
                }
              />
            </label>
          )}

          {r.monthly.mode === "nth" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-gray-600">第（1-5）</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={r.monthly.nth ?? 1}
                  onChange={(e) =>
                    set({
                      monthly: {
                        ...r.monthly,
                        nth: Math.min(5, Math.max(1, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </label>
              <label className="block">
                <span className="text-gray-600">曜日</span>
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={r.monthly.weekday ?? "mon"}
                  onChange={(e) =>
                    set({ monthly: { ...r.monthly, weekday: e.target.value } })
                  }
                >
                  {WEEK.map(({ k, l }) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {r.monthly.mode === "eom" && (
            <div className="text-gray-600 text-sm mt-2">
              月末（31日がない月は最終日）
            </div>
          )}
        </div>
      )}
      {/* yearly: 月/日 */}
      {r.type === "yearly" && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="text-gray-600">月</span>
            <input
              type="number"
              min={1}
              max={12}
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.yearly.month ?? 1}
              onChange={(e) =>
                set({ yearly: { ...r.yearly, month: Math.min(12, Math.max(1, Number(e.target.value) || 1)) } })
              }
            />
          </label>
          <label className="block">
            <span className="text-gray-600">日</span>
            <input
              type="number"
              min={1}
              max={31}
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.yearly.day ?? 1}
              onChange={(e) =>
                set({ yearly: { ...r.yearly, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) } })
              }
            />
          </label>
        </div>
      )}

      {/* after: 完了から相対 */}
      {r.type === "after" && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="text-gray-600">量</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.after.amount}
              onChange={(e) => set({ after: { ...r.after, amount: Math.max(1, Number(e.target.value) || 1) } })}
            />
          </label>
          <label className="block">
            <span className="text-gray-600">単位</span>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.after.unit}
              onChange={(e) => set({ after: { ...r.after, unit: e.target.value } })}
            >
              <option value="hour">時間</option>
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
            </select>
          </label>
        </div>
      )}

      {/* 生成タイミング */}
      {r.type !== "none" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="text-gray-600">次回レコード生成タイミング</span>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={r.generate.policy}
              onChange={(e) => set({ generate: { ...r.generate, policy: e.target.value } })}
            >
              <option value="immediate">すぐに生成</option>
              <option value="on_due">期限当日に生成</option>
              <option value="before">期限の◯日前に生成</option>
            </select>
          </label>

          {r.generate.policy === "before" && (
            <label className="block">
              <span className="text-gray-600">◯日前</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full border rounded px-2 py-1"
                value={r.generate.advance_days ?? 0}
                onChange={(e) =>
                  set({
                    generate: {
                      ...r.generate,
                      advance_days: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
