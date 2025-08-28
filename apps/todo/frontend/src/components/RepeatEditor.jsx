// sensor-server/apps/todo/frontend/src/components/RepeatEditor.jsx

export default function RepeatEditor({ value, onChange, dueDate }) {
  const r = value || { type: "none", interval: 1, weekdays: [], yearly: { month: "", day: "" } };
  const set = (patch) => onChange({ ...r, ...patch });

  const WEEK = [
    { k: "Mon", l: "月" }, { k: "Tue", l: "火" }, { k: "Wed", l: "水" },
    { k: "Thu", l: "木" }, { k: "Fri", l: "金" }, { k: "Sat", l: "土" }, { k: "Sun", l: "日" },
  ];
  const toggle = (k) =>
    set({ weekdays: r.weekdays?.includes(k) ? r.weekdays.filter((x) => x !== k) : [...(r.weekdays || []), k] });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="w-28 text-sm text-gray-500">繰り返し</label>
        <select className="select" value={r.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="none">なし</option>
          <option value="daily">毎日</option>
          <option value="weekday">平日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
          <option value="yearly">毎年（誕生日など）</option>
        </select>

        {r.type !== "none" && (
          <div className="text-xs text-gray-500">
            間隔：
            <input
              type="number" min={1}
              className="input !w-20 !py-1 !px-2 inline-block ml-1"
              value={r.interval || 1}
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="ml-1">
              {r.type === "daily" && "(1=毎日, 2=1日おき)"}
              {r.type === "weekday" && "(土日を除く)"}
              {r.type === "weekly" && "(1=毎週, 2=隔週)"}
              {r.type === "monthly" && "(1=毎月, 2=隔月)"}
              {r.type === "yearly" && "(1=毎年, 2=隔年)"}
            </span>
          </div>
        )}
      </div>

      {r.type === "weekly" && (
        <div className="flex items-center gap-2">
          <label className="w-28 text-sm text-gray-500">曜日</label>
          <div className="flex flex-wrap gap-1">
            {WEEK.map((w) => (
              <button
                key={w.k}
                type="button"
                className={r.weekdays?.includes(w.k) ? "chip-on" : "chip"}
                onClick={() => toggle(w.k)}
              >
                {w.l}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-1">（例：火・金を選択）</span>
        </div>
      )}

      {r.type === "monthly" && (
        <div className="text-xs text-gray-500 ml-28 -mt-1">
          ※ 基準日は「期限日」。存在しない月は末日に自動調整
          {dueDate && <span className="ml-2">(現在の期限日: {dueDate})</span>}
        </div>
      )}

      {r.type === "yearly" && (
        <div className="flex items-center gap-2">
          <label className="w-28 text-sm text-gray-500">日付</label>
          <input
            type="number" min={1} max={12} placeholder="月" className="input !w-24"
            value={r.yearly?.month ?? ""}
            onChange={(e) => set({ yearly: { ...(r.yearly || {}), month: Number(e.target.value) || "" } })}
          />
          <input
            type="number" min={1} max={31} placeholder="日" className="input !w-24"
            value={r.yearly?.day ?? ""}
            onChange={(e) => set({ yearly: { ...(r.yearly || {}), day: Number(e.target.value) || "" } })}
          />
          <span className="text-xs text-gray-500">（例：誕生日= 7月 21日）</span>
        </div>
      )}
    </div>
  );
}
