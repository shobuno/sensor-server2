// apps/hydro-sense/frontend/src/pages/LatestData.jsx

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';

// 必ず拡張する必要があります
dayjs.extend(utc);
dayjs.extend(timezone);

export default function LatestData() {

  // console.log("✅ LatestDataコンポーネントがマウントされた ");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [graphData, setGraphData] = useState([]);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/latest`);
      if (!res.ok) throw new Error('レスポンスが異常です');
      const json = await res.json();
      if (!json || Object.keys(json).length === 0) throw new Error('データが空です');

      setData({
        timestamp: json.timestamp ?? null,
        temperature: json.temperature ?? null,
        water_temperature: json.water_temperature ?? null,
        ec: json.ec ?? null,
        ec25_corrected: json.ec25_corrected ?? null,
        water_level: json.water_level ?? null,
      });

      // console.log("LatestData: graphData", graphData);
      setError(null);
    } catch (err) {
      console.error('🔥 fetch エラー:', err);
      setError('データ取得に失敗しました');
    }
  };

  // データ取得後の変換処理の例
  const convertTimestamps = (data) => {
    return data.map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp).getTime(), // ← ここが重要
    }));
  };

  const fetchGraphData = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL;

      const res = await fetch(`/api/ec-graph?range=1d&type=all`);
      //const res = await fetch(`${apiBase}/api/ec-graph?range=1d&type=all`);
      if (!res.ok) throw new Error('グラフデータ取得失敗');

      const json = await res.json();

      // ✅ timestampをUNIXミリ秒に変換
      const converted = json.map((item) => ({
        ...item,
        timestamp: new Date(item.timestamp).getTime(),
      }));

      setGraphData(converted); // ← setするのは変換後のデータ
    } catch (err) {
      console.error('🔥 グラフデータ取得エラー:', err);
    }
  };


  useEffect(() => {
    // console.log("🧠 useEffect 起動");

    fetchData();
    fetchGraphData();
    const timer = setInterval(() => {
      fetchData();
      fetchGraphData();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const formatWaterLevel = (level) => {
    switch (level) {
      case 3: return "高";
      case 2: return "中";
      case 1: return "低";
      case 0: return "空";
      default: return "--";
    }
  };

  const levelColor = (level) => {
    switch (level) {
      case 3: return "bg-green-500";
      case 2: return "bg-blue-500";
      case 1: return "bg-yellow-400";
      case 0: return "bg-red-500";
      default: return "bg-gray-500";
    }
  };
//console.log("🔥 graphDataサンプル", graphData[0]);
// console.log("🔥 graphDataサンプル", graphData.slice(0, 5));

  // ナイトモード判定
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    window.addEventListener('resize', checkDark);
    // Tailwindのダーク切り替えイベントがあればそれも監視
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      window.removeEventListener('resize', checkDark);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
  if (data && data.timestamp) {
    console.log("🕒 data.timestamp:", data.timestamp);
    console.log("🕒 as dayjs (default):", dayjs(data.timestamp).format());
    console.log("🕒 as JST:", dayjs(data.timestamp).tz('Asia/Tokyo').format());
  }
}, [data]);


  return (
    <div className="bg-white dark:bg-gray-900 w-full min-h-screen text-gray-900 dark:text-white px-2 sm:px-4 py-6 flex flex-col">
      <div className="w-full flex flex-col md:flex-row gap-6 flex-grow">
        
        {/* 左：センサーデータ */}
        <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-xl shadow-xl w-full md:w-[300px] flex flex-col items-center justify-start" style={{ paddingLeft: '5px', paddingRight: '5px' }} >
          {/* アイコンを横並びで配置 */}
          <div className="flex flex-row items-center gap-3 mb-4">
            <img
              src="/hydro-sense/icons/latest.png"
              alt="最新情報"
              className="w-14 h-14 md:w-20 md:h-20"
              style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
            />
            {/* グラフアイコン */}
            <button
              onClick={() => navigate('/graph')}
              className="focus:outline-none active:scale-95 transition-transform"
              title="グラフ表示"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <img
                src="/hydro-sense/icons/graph.png"
                alt="グラフ表示"
                className="w-14 h-14 md:w-20 md:h-20 hover:opacity-80 hover:scale-105 transition-all"
                style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
              />
            </button>
            {/* EC補正アイコン */}
            <button
              onClick={() => navigate('/ec-correction')}
              className="focus:outline-none active:scale-95 transition-transform"
              title="EC補正"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <img
                src="/hydro-sense/icons/ecCorrection.png"
                alt="EC補正"
                className="w-14 h-14 md:w-20 md:h-20 hover:opacity-80 hover:scale-105 transition-all"
                style={{ minWidth: '3.5rem', minHeight: '3.5rem' }}
              />
            </button>
          </div>
          {error && <p className="text-red-400">{error}</p>}
          {data ? (
            <>
              {/* PCは縦並び・大きい文字、スマホは現状維持 */}
              <div className="w-full mb-4">
                <div className="flex flex-row md:flex-col gap-0.5 w-full">
                  {/* 気温 */}
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1 md:mb-4">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">気温</div>
                    <div className="text-4xl md:text-6xl font-bold text-green-600 dark:text-green-400 whitespace-nowrap overflow-hidden text-ellipsis">
                      {data.temperature != null ? Number(data.temperature).toFixed(1) : '--'}
                    </div>
                  </div>
                  {/* 水温 */}
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1 md:mb-4">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">水温</div>
                    <div className="text-4xl md:text-6xl font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap overflow-hidden text-ellipsis">
                      {data.water_temperature != null ? Number(data.water_temperature).toFixed(1) : '--'}
                    </div>
                  </div>
                  {/* EC */}
                  <div className="bg-gray-200 dark:bg-gray-700 px-0 py-2 rounded-xl text-center flex-1">
                    <div className="text-xs md:text-base text-gray-600 dark:text-gray-300">EC</div>
                    <div className="text-4xl md:text-6xl font-bold text-red-500 dark:text-red-400 whitespace-nowrap overflow-hidden text-ellipsis">
                      {data.ec25_corrected != null ? Number(data.ec25_corrected).toFixed(2) : '--'}
                    </div>
                  </div>
                </div>
                <p className="text-sm md:text-base text-right text-gray-400 mt-1">
                  <nobr>EC元値: {data.ec ?? '--'}</nobr>
                </p>
              </div>

              {/* 水位・更新などはそのまま */}
              <div className="mt-2">
                <p className="font-semibold">
                  水位&nbsp;:&nbsp;
                  <span
                    className={
                      {
                        3: "text-green-500",
                        2: "text-blue-500",
                        1: "text-yellow-400",
                        0: "text-red-500",
                      }[data.water_level] || "text-gray-500"
                    }
                  >
                    {formatWaterLevel(data.water_level)}
                  </span>
                </p>
                <div className="w-[150px] h-4 bg-gray-700 rounded mt-1">
                  <div
                    className={`h-4 ${levelColor(data.water_level)} rounded transition-all`}
                    style={{ width: `${Math.max((data.water_level ?? 0) * 33, 8)}%` }}
                  />
                </div>
              </div>

              {data.water_level === 0 && (
                <div className="mt-4 bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow-lg animate-pulse text-center">
                  ⚠️ 水が空です！早急に補給してください
                </div>
              )}

              <p className="text-sm text-right text-gray-400 mt-6">
                更新: {dayjs(data.timestamp).tz('Asia/Tokyo').format("YYYY/MM/DD HH:mm:ss")}
              </p>
            </>
          ) : (
            <p className="text-gray-400">読み込み中...</p>
          )}
        </div>

        {/* 右：グラフ表示 */}
        <div className="flex-1 flex flex-col gap-3 w-full"> {/* gapを6→3に変更 */}
          <div className="flex flex-col h-full">
            {/* グラフを縦に並べて、残りスペースを最大限使う */}
            <div className="flex-1 flex flex-col gap-3"> {/* gapを6→3に変更 */}
              {/* 温度グラフ */}
              <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-xl flex-1 min-h-[120px] h-[180px] md:h-[calc(50vh-32px)]"> {/* p-4→p-2, min-h/heightも縮小 */}
                <h2 className="text-base font-bold mb-1">気温・水温</h2> {/* mb-2→mb-1, text-lg→text-base */}
                <ResponsiveContainer width="100%" height="88%"> {/* height 80%→88% */}
                  <AreaChart data={graphData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}> {/* marginを小さく */}
                    <XAxis
                      dataKey="timestamp"
                      domain={["auto", "auto"]}
                      tickFormatter={(time) =>
                        dayjs.utc(time).format("HH:mm")
                      }
                      tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }} // ここで色を切り替え
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      width={38}
                      tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#222' : '#fff',
                        color: isDark ? '#fff' : '#222',
                        border: '1px solid #444'
                      }}
                      labelFormatter={(value) =>
                        dayjs.utc(value).format("YYYY-MM-DD HH:mm")
                      }
                      labelStyle={{
                        color: isDark ? '#fff' : '#222'
                      }}
                    />
                    <Legend verticalAlign="top" align="right" />
                    {/* 気温の塗りつぶし */}
                    <Area
                      type="monotone"
                      dataKey="air_avg"
                      stroke="#82c91e"
                      fill="#82c91e"
                      fillOpacity={0.25}
                      dot={false}
                      name="気温"
                    />
                    {/* 水温の塗りつぶし */}
                    <Area
                      type="monotone"
                      dataKey="water_avg"
                      stroke="#00e0ff"
                      fill="#00e0ff"
                      fillOpacity={0.25}
                      dot={false}
                      name="水温"
                    />
                    {/* 折れ線 */}
                    <Line type="monotone" dataKey="air_avg" name="気温" stroke="#82c91e" dot={false} />
                    <Line type="monotone" dataKey="water_avg" name="水温" stroke="#00e0ff" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* ECグラフ */}
              <div className="bg-white dark:bg-gray-800 p-2 rounded-xl shadow-xl flex-1 min-h-[120px] h-[180px] md:h-[calc(50vh-32px)]">
                <h2 className="text-base font-bold mb-1">EC</h2>
                <ResponsiveContainer width="100%" height="88%">
                  <AreaChart data={graphData}
                            margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <XAxis
                      dataKey="timestamp"
                      domain={["auto", "auto"]}
                      tickFormatter={(time) =>
                        dayjs.utc(time).format("HH:mm")
                      }
                      tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      width={40}
                      tickFormatter={(value) => value != null ? value.toFixed(2) : ''}
                      tick={{ fill: isDark ? "#e5e7eb" : "#374151", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#222' : '#fff',
                        color: isDark ? '#fff' : '#222',
                        border: '1px solid #444'
                      }}
                      labelStyle={{
                        color: isDark ? '#fff' : '#222'
                      }}
                      labelFormatter={(value) =>
                        dayjs.utc(value).format("YYYY-MM-DD HH:mm")
                      }
                    />
                    <Legend verticalAlign="top" align="right" />
                    <Area
                      type="monotone"
                      dataKey="ec_corrected"
                      stroke="#f28b82"
                      fill="#f28b82"
                      fillOpacity={0.25}
                      dot={false}
                    />
                    <Line type="monotone" dataKey="ec_corrected" name="補正EC" stroke="#f28b82" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
