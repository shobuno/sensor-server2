// sensor-server/apps/todo/frontend/src/components/widgets/MiniCalendar.jsx

import { useEffect, useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameDay, isSameMonth, format
} from "date-fns";
import { ja } from "date-fns/locale";

/**
 * 祝日API: https://holidays-jp.github.io/
 * JSON例: https://holidays-jp.github.io/api/v1/date.json
 * 形式: { "2025-01-01": "元日", ... }
 */
async function fetchHolidays(year) {
  const url = `https://holidays-jp.github.io/api/v1/${year}/date.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`holiday http ${res.status}`);
  return res.json(); // { 'YYYY-MM-DD': 'Name', ... }
}

export default function MiniCalendar({ onPickDay }) {
  const [cursor, setCursor] = useState(new Date());
  const [holidays, setHolidays] = useState({}); // {'YYYY-MM-DD': '名前'}
  const [loadingHol, setLoadingHol] = useState(true);

  // 月が変わったらその年の祝日を取得（年ごとキャッシュでもOK）
  useEffect(() => {
    let cancelled = false;
    const y = cursor.getFullYear();
    setLoadingHol(true);
    fetchHolidays(y)
      .then((json) => { if (!cancelled) setHolidays(json || {}); })
      .catch(() => { if (!cancelled) setHolidays({}); })
      .finally(() => { if (!cancelled) setLoadingHol(false); });
    return () => { cancelled = true; };
  }, [cursor]);

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const rows = [];
    let day = gridStart;
    while (day <= gridEnd) {
      const cells = [];
      for (let i = 0; i < 7; i++) {
        cells.push(day);
        day = addDays(day, 1);
      }
      rows.push(cells);
    }
    return rows;
  }, [cursor]);

  const today = new Date();

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function dayClass(d) {
    const wd = d.getDay();
    const isToday = isSameDay(d, today);
    const inMonth = isSameMonth(d, cursor);
    const isHoliday = Boolean(holidays[ymd(d)]);

    const base = "flex items-center justify-center rounded-md text-sm w-8 h-8";
    const muted = inMonth ? "" : " text-muted-foreground";
    const todayCls = isToday ? " ring-2 ring-amber-400 ring-offset-1 font-bold" : "";
    const sat = wd === 6 ? " text-sky-600" : "";
    const sun = wd === 0 ? " text-red-600" : "";
    const hol = isHoliday ? " text-red-600 font-medium" : "";
    return base + muted + todayCls + (isHoliday ? hol : sun || sat);
  }

  return (
    <div className="mt-3 border rounded-md p-2 bg-white">
      <div className="flex items-center justify-between mb-2">
        <button
          className="px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => setCursor((d) => subMonths(d, 1))}
          aria-label="前の月"
        >
          ‹
        </button>
        <div className="font-semibold">
          {format(cursor, "yyyy年 M月", { locale: ja })}
        </div>
        <button
          className="px-2 py-1 rounded border hover:bg-gray-50"
          onClick={() => setCursor((d) => addMonths(d, 1))}
          aria-label="次の月"
        >
          ›
        </button>
      </div>

      {/* 曜日ヘッダ */}
      <div className="grid grid-cols-7 text-center text-xs mb-1">
        {["日","月","火","水","木","金","土"].map((w, idx) => (
          <div
            key={w}
            className={
              "py-1 " +
              (idx === 0 ? "text-red-600" : idx === 6 ? "text-sky-600" : "text-muted-foreground")
            }
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row, rIdx) =>
          row.map((d, cIdx) => {
            const key = `${rIdx}-${cIdx}`;
            return (
              <button
                key={key}
                className={dayClass(d)}
                onClick={() => onPickDay?.(d)}
                title={holidays[ymd(d)] || ""}
              >
                {d.getDate()}
              </button>
            );
          })
        )}
      </div>

      {loadingHol && (
        <div className="mt-1 text-[10px] text-muted-foreground">祝日を取得中…</div>
      )}
    </div>
  );
}
