// apps/AutoMesh/frontend/src/pages/RegisteredList.jsx
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function RegisteredList() {
  const [devices, setDevices] = useState([]);

  const fetchDevices = async () => {
    const res = await fetch("/automesh/api/get-devices");
    const json = await res.json();
    setDevices(json);
  };

  const handleUnregister = async (serial_number) => {
    const ok = window.confirm(`${serial_number} を解除しますか？`);
    if (!ok) return;

    const res = await fetch("/automesh/api/device-control/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial_number })
    });

    const json = await res.json();
    alert(json.message);
    fetchDevices(); // リロード
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <div className="p-4 bg-white dark:bg-gray-900 min-h-screen">
      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">登録済みデバイス一覧</h2>
      {devices.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">登録済みデバイスはありません</p>
      ) : (
        <div className="space-y-4">
          {devices.map((d) => (
            <Card key={d.serial_number} className="bg-white dark:bg-gray-800 border dark:border-gray-700">
              <CardContent className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg sm:text-base break-words text-gray-900 dark:text-white">
                    <b>名前:</b> {d.name}
                  </div>
                  <div className="text-base sm:text-sm text-gray-800 dark:text-gray-300">
                    <b>役割:</b> {d.role || "-"}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 break-all">{d.serial_number}</div>
                </div>
                <div className="flex gap-1 sm:gap-2">
                  <button className="text-[10px] sm:text-base px-1.5 sm:px-4 py-0.5 sm:py-2 bg-yellow-400 dark:bg-yellow-600 text-gray-900 dark:text-white rounded">
                    <span className="inline sm:hidden">点</span>
                    <span className="hidden sm:inline">点滅</span>
                  </button>
                  <button className="text-[10px] sm:text-base px-1.5 sm:px-4 py-0.5 sm:py-2 bg-blue-400 dark:bg-blue-600 text-white rounded">
                    <span className="inline sm:hidden">編</span>
                    <span className="hidden sm:inline">編集</span>
                  </button>
                  <button
                    className="text-[10px] sm:text-base px-1.5 sm:px-4 py-0.5 sm:py-2 bg-red-400 dark:bg-red-600 text-white rounded"
                    onClick={() => handleUnregister(d.serial_number)}
                  >
                    <span className="inline sm:hidden">解</span>
                    <span className="hidden sm:inline">登録解除</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
