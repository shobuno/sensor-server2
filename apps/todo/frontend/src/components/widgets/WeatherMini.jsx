// sensor-server/apps/todo/frontend/src/components/widgets/WeatherMini.jsx

import { useEffect, useState } from "react";

const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY; // .env に設定
const DEFAULT_CITY = import.meta.env.VITE_WEATHER_DEFAULT_CITY || "Tokyo";

console.log("OWM_KEY:", import.meta.env.VITE_OPENWEATHER_KEY);

export default function WeatherMini() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchWeatherByCoords(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ja`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather http ${res.status}`);
    return res.json();
  }
  async function fetchWeatherByCity(city) {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=ja`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather http ${res.status}`);
    return res.json();
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!API_KEY) {
        setErr("OpenWeatherMap APIキーが設定されていません（.env に VITE_OPENWEATHER_KEY を追加）");
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // 位置情報が取れたら優先、ダメなら都市名フォールバック
        const geo = await new Promise((resolve) => {
          if (!("geolocation" in navigator)) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: false, maximumAge: 600000, timeout: 3000 }
          );
        });

        const json = geo
          ? await fetchWeatherByCoords(geo.lat, geo.lon)
          : await fetchWeatherByCity(DEFAULT_CITY);

        if (!cancelled) {
          setData(json);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // 30分ごとに更新
    const h = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, []);

  if (loading) return <div className="mt-3 text-xs text-muted-foreground">天気読み込み中…</div>;
  if (err) return <div className="mt-3 text-xs text-red-600">天気取得エラー: {err}</div>;
  if (!data) return null;

  const w = data.weather?.[0];
  const temp = Math.round(data.main?.temp ?? 0);
  const place = data.name || DEFAULT_CITY;

  return (
    <div className="mt-3 text-sm flex items-center gap-3 bg-white border rounded-md p-2">
      {w?.icon && (
        <img
          alt={w.description || "weather"}
          src={`https://openweathermap.org/img/wn/${w.icon}@2x.png`}
          className="w-10 h-10"
          loading="lazy"
        />
      )}
      <div className="leading-tight">
        <div className="font-medium">{place}</div>
        <div className="text-muted-foreground">{w?.description}</div>
      </div>
      <div className="ml-auto text-xl font-bold">{temp}℃</div>
    </div>
  );
}
