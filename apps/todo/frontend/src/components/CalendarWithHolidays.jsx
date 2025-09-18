// sensor-server/apps/todo/frontend/src/components/CalendarWithHolidays.jsx

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/auth";

/**
 * コンパクト祝日カレンダー
 * - セルは小さめ（高さ12/14）
 * - 祝日は赤丸●だけ表示（名称は別枠で出す）
 * - onSelect(ymd, meta) で祝日名/曜日などを渡す
 *
 * props:
 *   onSelect?: (ymd: string, meta: { name?: string; weekday: number; isHoliday: boolean }) => void
 *   className?: string
 *   onMonthChange?: (y:number, m:number)=>void
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
        (json?.holidays || []).forEach(h => { map[h.date] = h.name; });
        setHolidays(map);
      } catch {
        // 認証切れ等のフォールバック（任意）
        try {
          const r = await fetch(`https://holidays-jp.github.io/api/v1/${y}/date.json`);
          const j = await r.json();
          const m = {};
          Object.entries(j || {}).forEach(([d, name]) => { m[d] = name; });
          setHolidays(m);
        } catch { setHolidays({}); }
      }
    })();
    return () => { alive = false; };
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

  const ymd = (d) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const isToday = (d) => {
    const now = new Date();
    return now.getFullYear() === y && now.getMonth()+1 === m && now.getDate() === d;
  };
  function moveMonth(delta) {
    const base = new Date(y, m - 1, 1);
    base.setMonth(base.getMonth() + delta);
    const ny = base.getFullYear(); const nm = base.getMonth() + 1;
    setY(ny); setM(nm);
    onMonthChange?.(ny, nm);
  }
  function goToday() {
    const ny = today.getFullYear(); const nm = today.getMonth() + 1;
    setY(ny); setM(nm);
    onMonthChange?.(ny, nm);
  }

  return (
    <div className={`w-full rounded-2xl p-3 border bg-white text-slate-900 ${className}`}>
      {/* ヘッダ：月送り */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-base font-bold">{y}年 {m}月</div>
        <div className="flex items-center gap-1">
          <button className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs" onClick={() => moveMonth(-1)}>←</button>
          <button className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs" onClick={goToday}>今日</button>
          <button className="px-2 py-1 rounded-md border hover:bg-gray-50 text-xs" onClick={() => moveMonth(1)}>→</button>
        </div>
      </div>

      {/* 曜日ヘッダ */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs select-none">
        {["日","月","火","水","木","金","土"].map((l,i)=>(
          <div key={i} className={`py-1 ${i===0?'text-red-600': i===6?'text-sky-600':'text-slate-500'}`}>{l}</div>
        ))}

        {/* 日付セル（コンパクト） */}
        {cells.map((d,idx)=>{
          if (d == null) return <div key={idx} className="h-6" />;
          const key = ymd(d);
          const name = holidays[key];
          const dow = new Date(y, m - 1, d).getDay();
          const isHoliday = Boolean(name);
          const weekendClass = dow===0 ? "text-red-700" : dow===6 ? "text-sky-700" : "";
          const todayCls = isToday(d) ? "ring-1 ring-emerald-400/60" : "";

          return (
            <button
              key={idx}
              onClick={()=>{
                onSelect?.(key, { isHoliday: Boolean(name), name, weekday: dow });
              }}
              className={[
              "w-full rounded-xl border transition text-left h-12 lg:h-14 px-2 py-1 cursor-pointer",
              "border-slate-200 bg-slate-50 hover:bg-slate-100",  // ★ 薄い背景色
              todayCls
              ].join(' ')}
              title={name || key}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm leading-none ${weekendClass}`}>{d}</span>
                {isHoliday && <span className="text-[8px] leading-none text-rose-600">●</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
