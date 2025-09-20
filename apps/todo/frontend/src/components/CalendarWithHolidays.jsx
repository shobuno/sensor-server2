// sensor-server/apps/todo/frontend/src/components/CalendarWithHolidays.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/auth";

/**
 * コンパクト祝日カレンダー
 * - 通常日=白背景
 * - 日曜/祝日=赤字 + 薄赤背景
 * - 土曜=青字 + 薄灰背景
 * - 祝日は赤丸●も表示
 */
export default function CalendarWithHolidays({
  onSelect,
  className = "",
  onMonthChange,
}) {
  const today = useMemo(() => new Date(), []);
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth() + 1);

  const [holidays, setHolidays] = useState({}); // { "YYYY-MM-DD": "名称" }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await fetchJson(`/api/todo/holidays?year=${y}&country=JP`);
        if (!alive) return;
        const map = {};
        (json?.holidays || []).forEach((h) => {
          map[h.date] = h.name;
        });
        setHolidays(map);
      } catch {
        // フォールバック（公開API）
        try {
          const r = await fetch(
            `https://holidays-jp.github.io/api/v1/${y}/date.json`
          );
          const j = await r.json();
          const m = {};
          Object.entries(j || {}).forEach(([d, name]) => {
            m[d] = name;
          });
          setHolidays(m);
        } catch {
          setHolidays({});
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [y]);

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1);
    const startDow = first.getDay(); // 0=Sun
    const daysInMonth = new Date(y, m, 0).getDate();
    const items = [];
    for (let i = 0; i < startDow; i++) items.push(null);
    for (let d = 1; d <= daysInMonth; d++) items.push(d);
    while (items.length % 7 !== 0) items.push(null);
    return items;
  }, [y, m]);

  const ymd = (d) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isToday = (d) => {
    const now = new Date();
    return (
      now.getFullYear() === y &&
      now.getMonth() + 1 === m &&
      now.getDate() === d
    );
  };
  function moveMonth(delta) {
    const base = new Date(y, m - 1, 1);
    base.setMonth(base.getMonth() + delta);
    const ny = base.getFullYear();
    const nm = base.getMonth() + 1;
    setY(ny);
    setM(nm);
    onMonthChange?.(ny, nm);
  }
  function goToday() {
    const ny = today.getFullYear();
    const nm = today.getMonth() + 1;
    setY(ny);
    setM(nm);
    onMonthChange?.(ny, nm);
  }

  // ■ セルのクラス（背景と文字色を曜日/祝日で切替）
  function cellClass(d) {
    const key = ymd(d);
    const name = holidays[key];
    const dow = new Date(y, m - 1, d).getDay();

    // デフォルト: 白背景・通常文字色
    let bg = "bg-white";
    let text = "text-slate-900";

    if (name || dow === 0) {
      // 祝日 or 日曜
      bg = "bg-red-50";
      text = "text-red-600";
    } else if (dow === 6) {
      // 土曜
      bg = "bg-gray-200";
      text = "text-sky-600";
    }

    const ring = isToday(d) ? "ring-1 ring-emerald-400/60" : "";

    return [
      "w-full rounded-xl border transition text-left h-12 lg:h-14 px-2 py-1 cursor-pointer",
      "border-slate-200",
      bg,
      text,
      ring,
      "hover:brightness-95",
    ].join(" ");
  }

  return (
    <div className={`w-full rounded-2xl p-3 border bg-white text-slate-900 ${className}`}>
      {/* ヘッダ：月送り */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-base font-bold">
          {y}年 {m}月
        </div>
        <div className="flex items-center gap-1">
          <button
            className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs"
            onClick={() => moveMonth(-1)}
          >
            ←
          </button>
          <button
            className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs"
            onClick={goToday}
          >
            今日
          </button>
          <button
            className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs"
            onClick={() => moveMonth(1)}
          >
            →
          </button>
        </div>
      </div>

      {/* 曜日ヘッダ */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs select-none">
        {["日", "月", "火", "水", "木", "金", "土"].map((l, i) => (
          <div
            key={i}
            className={`py-1 ${
              i === 0 ? "text-red-600" : i === 6 ? "text-sky-600" : "text-slate-500"
            }`}
          >
            {l}
          </div>
        ))}

        {/* 日付セル（コンパクト） */}
        {cells.map((d, idx) => {
          if (d == null) return <div key={idx} className="h-6" />;
          const key = ymd(d);
          const name = holidays[key];
          const dow = new Date(y, m - 1, d).getDay();
          const isHoliday = Boolean(name);

          return (
            <button
              key={idx}
              onClick={() => {
                onSelect?.(key, { isHoliday, name, weekday: dow });
              }}
              className={cellClass(d)}
              title={name || key}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm leading-none">{d}</span>
                {isHoliday && (
                  <span className="text-[8px] leading-none text-rose-600">●</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
