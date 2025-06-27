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
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">登録済みデバイス一覧</h2>
      {devices.length === 0 ? (
        <p>登録済みデバイスはありません</p>
      ) : (
        <div className="space-y-4">
          {devices.map((d) => (
            <Card key={d.serial_number}>
              <CardContent className="flex justify-between items-center p-4">
                <div>
                  <div><b>名前:</b> {d.name}</div>
                  <div><b>役割:</b> {d.role || "-"}</div>
                  <div className="text-sm text-gray-500">{d.serial_number}</div>
                </div>
                <Button variant="destructive" onClick={() => handleUnregister(d.serial_number)}>
                  解除
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
