// frontend/src/components/EcCorrectionForm.jsx

import { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { getToken } from "@/auth"; // ← ✅ これが必要
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import ecCorrectionIcon from '@hydro-sense/assets/icons/ecCorrection.png';


export default function EcCorrectionForm() {

  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const [serials, setSerials] = useState([]);
  const [selectedSerial, setSelectedSerial] = useState("");
  const [targetEc, setTargetEc] = useState("");
  const [latestValues, setLatestValues] = useState({ water_avg: "", ec_avg: "" });
  const [ecCorrected, setEcCorrected] = useState(null);
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  // console.log("✅ apiBase is:", apiBase);

  useEffect(() => {
    fetch(`${apiBase}/api/sensor-serials?type=water`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => res.json())
      .then((data) => {
        setSerials(data);
        if (data.length > 0) setSelectedSerial(data[0]);
      })
      .catch(err => console.error("🔥 sensor-serials fetch error", err));

    fetch(`${apiBase}/api/latest-hourly-avg`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => res.json())
      .then((data) => {
        setLatestValues({ water_avg: data.water_avg, ec_avg: data.ec_avg });
      })
      .catch(err => console.error("🔥 latest-hourly-avg fetch error", err));
  }, [apiBase]);

  useEffect(() => {
    if (selectedSerial && latestValues.ec_avg && latestValues.water_avg) {
      fetch(`${apiBase}/api/calculate-ec-corrected`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`, },
        body: JSON.stringify({
          serial_number: selectedSerial,
          ec_raw: latestValues.ec_avg,
          temperature: latestValues.water_avg
        })
      })
        .then(res => res.json())
        .then(data => setEcCorrected(data.ec_corrected ?? null))
        .catch(err => console.error("🔥 補正後EC取得エラー", err));
    }
  }, [selectedSerial, latestValues]);

  const handleCalculateK1 = () => {
    if (!targetEc || !selectedSerial) return alert("目標EC値を入力してください");
    fetch(`${apiBase}/api/calculate-k1`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
      Authorization: `Bearer ${token}`, 
    },
      body: JSON.stringify({
        serial_number: selectedSerial,
        target_ec: parseFloat(targetEc),
        ec_avg: latestValues.ec_avg,
        temperature: latestValues.water_avg,
      })
    })
      .then((res) => res.json())
      .then((result) => alert("K1計算完了: " + result.k1))
      .catch(() => alert("K1計算失敗"));
  };

  const handleCalculateABC = () => {
    if (!targetEc || !selectedSerial) return alert("目標EC値を入力してください");

    fetch(`${apiBase}/api/register-ec-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`, 
      },
      body: JSON.stringify({
        serial_number: selectedSerial,
        target_ec: parseFloat(targetEc),
        ec_avg: latestValues.ec_avg,
        temperature: latestValues.water_avg,
      })
    })
      .then((res) => res.json())
      .then(() => alert("abc計算用ログ記録完了"))
      .catch(() => alert("abcログ記録失敗"));
  };

  return (
    <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white w-full min-h-screen px-4 py-6 flex items-center justify-center">
      <Card className="bg-white dark:bg-gray-800 w-full max-w-xl rounded-xl shadow-lg">
        <CardContent className="space-y-6 p-6">
          <div className="flex justify-center">
            <img src={ecCorrectionIcon} alt="EC実測値" className="w-20 h-20" />
          </div>
          <div>
            <Label className="block mb-1">センサー選択</Label>
            <select
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-3 py-2"
              value={selectedSerial}
              onChange={(e) => setSelectedSerial(e.target.value)}
            >
              {Array.isArray(serials) && serials.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="block mb-1">目標EC値 (mS/cm)</Label>
            <Input
              type="number"
              step="0.01"
              value={targetEc}
              onChange={(e) => setTargetEc(e.target.value)}
              placeholder="例: 1.20"
              className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            現在の平均水温: {latestValues.water_avg ? Number(latestValues.water_avg).toFixed(1) : '--'} ℃<br />
            現在の補正後EC: {ecCorrected != null ? ecCorrected.toFixed(2) : '--'}
          </div>

          <div className="flex gap-4 justify-center">
            <Button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded" onClick={handleCalculateK1}>K1計算</Button>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded" onClick={handleCalculateABC}>abcログ登録</Button>
            <Button variant="outline" onClick={() => navigate('/hydro-sense/latest')}>戻る</Button>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
