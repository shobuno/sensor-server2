import { useMemo, useState } from "react";
import {
  addMonths, startOfMonth, endOfMonth, startOfWeek, addDays,
  isSameMonth, isToday, format
} from "date-fns";
import { ja } from "date-fns/locale";

export default function MiniCalendar({ onPickDay }) {
  const [base, setBase] = useState(new Date());
  const start = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(start, i)),
    [start]
  );

  return (
    <div className="mt-3 rounded-2xl border p-3">
      <div className="flex items-center justify-between mb-2">
        <button className="px-2" onClick={() => setBase(addMonths(base, -1))}>‹</button>
        <div className="font-semibold">{format(base, "yyyy年M月", { locale: ja })}</div>
        <button className="px-2" onClick={() => setBase(addMonths(base, 1))}>›</button>
      </div>
      <div className="grid grid-cols-7 text-xs text-center mb-1">
        {["月","火","水","木","金","土","日"].map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-sm">
        {cells.map((d) => {
          const muted = !isSameMonth(d, base);
          const today = isToday(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay?.(d)}
              className={[
                "py-1 rounded-md w-full",
                muted ? "text-muted-foreground" : "",
                today ? "border border-primary" : "border border-transparent",
                "hover:bg-muted"
              ].join(" ")}
              title={format(d, "yyyy-MM-dd")}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
