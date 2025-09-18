import { useEffect, useState } from "react";
import { fetchJson } from "@/auth";

export default function WeatherMini({ lat = 35.68, lon = 139.76 }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchJson(`/api/todo/widgets/weather?lat=${lat}&lon=${lon}`)
      .then(setData)
      .catch(() => {});
  }, [lat, lon]);

  if (!data) {
    return (
      <div className="mt-3 rounded-2xl border p-3 text-sm text-muted-foreground">
        天気を読み込み中…
      </div>
    );
  }

  const days = data.daily?.time?.slice(0, 3) || [];
  const max = data.daily?.temperature_2m_max || [];
  const min = data.daily?.temperature_2m_min || [];

  return (
    <div className="mt-3 rounded-2xl border p-3">
      <div className="font-semibold mb-1">天気（3日間）</div>
      <ul className="text-sm space-y-1">
        {days.map((d, i) => (
          <li key={d} className="flex justify-between">
            <span>{d}</span>
            <span>{Math.round(min[i])}° / {Math.round(max[i])}°</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
