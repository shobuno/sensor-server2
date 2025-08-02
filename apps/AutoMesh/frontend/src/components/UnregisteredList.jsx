// apps/AutoMesh/frontend/src/components/UnregisteredList.jsx
import { useEffect, useState } from 'react';
import { getToken } from "@/auth";

export default function UnregisteredList() {
  const [devices, setDevices] = useState([]);
  const [formValues, setFormValues] = useState({});

  const fetchData = async () => {
    const token = getToken();
    const res = await fetch('/automesh/api/entry-devices', {
    headers: {
      Authorization: `Bearer ${token}`,
      }
    });
    const json = await res.json();
    setDevices(json);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRegister = async (serial) => {
    const name = formValues[serial];
    if (!name) return alert("名前を入力してください");

    const res = await fetch('/automesh/api/register-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ serial_number: serial, name }),
    });

    if (res.ok) {
      alert("登録成功！");
      setFormValues((prev) => ({ ...prev, [serial]: "" }));
      fetchData(); // 即更新
    } else {
      alert("登録に失敗しました");
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">未登録デバイス一覧</h2>
      {devices.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-300">現在接続中の未登録デバイスはありません。</p>
      ) : (
        <table className="w-full border mt-2 bg-white dark:bg-gray-800 dark:border-gray-700">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">シリアル番号</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">デバイス名</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">操作</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d, i) => (
              <tr key={i}>
                <td className="border p-2 text-gray-900 dark:text-gray-100">{d.serial_number}</td>
                <td className="border p-2">
                  <input
                    type="text"
                    value={formValues[d.serial_number] || ''}
                    onChange={(e) =>
                      setFormValues({ ...formValues, [d.serial_number]: e.target.value })
                    }
                    placeholder="登録名を入力"
                    className="border px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 rounded"
                  />
                </td>
                <td className="border p-2">
                  <button
                    onClick={() => handleRegister(d.serial_number)}
                    className="bg-blue-500 dark:bg-blue-600 text-white px-3 py-1 rounded"
                  >
                    登録
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
