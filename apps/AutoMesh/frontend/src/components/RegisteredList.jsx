// AutoMesh/frontend/src/components/RegisteredList.jsx

import { useEffect, useState } from 'react';
import axios from 'axios';

export default function RegisteredList() {
  const [deviceGroups, setDeviceGroups] = useState([]);
  const [editTarget, setEditTarget] = useState(null); // { serial_number, relay_index }
  const [editName, setEditName] = useState('');

  const fetchDevices = async () => {
    const res = await fetch('/automesh/api/get-devices');
    const json = await res.json();
    setDeviceGroups(json);
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleBlink = async (serial_number, relay_index) => {
    try {
      const res = await fetch('/automesh/api/blink-led', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number, relay_index }),
      });

      const result = await res.json();
      alert(result.message || '✅ 点滅コマンド送信成功');
    } catch (err) {
      alert('❌ 点滅コマンド送信失敗: ' + err.message);
    }
  };

  const handleUnregister = async (serial_number) => {
    const confirmed = window.confirm(`本当に解除しますか？\nシリアル番号: ${serial_number}`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/automesh/api/unregister-device/${serial_number}`, {
        method: 'DELETE'
      });

      const result = await res.json();
      alert(result.message || '登録を解除しました');
      fetchDevices();
    } catch (err) {
      alert('❌ 登録解除に失敗しました: ' + err.message);
    }
  };

  const handleSaveName = async (serial_number, relay_index) => {
    try {
      await axios.put('/automesh/api/edit-device-name', {
        serial_number,
        relay_index,
        new_name: editName
      });
      alert('✅ 名前を更新しました');
      setEditTarget(null);
      fetchDevices();
    } catch (err) {
      alert('❌ 名前更新に失敗しました: ' + err.message);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">登録済みデバイス一覧</h2>
      {deviceGroups.length === 0 ? (
        <p className="text-gray-500">登録済みデバイスはありません。</p>
      ) : (
        <table className="w-full border mt-2">
          <thead>
            <tr>
              <th className="border p-2">シリアル番号</th>
              <th className="border p-2">リレー番号</th>
              <th className="border p-2">名前</th>
              <th className="border p-2">役割</th>
              <th className="border p-2">登録日時</th>
              <th className="border p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {deviceGroups.map((group) =>
              group.devices.map((device) => {
                const isEditing =
                  editTarget &&
                  editTarget.serial_number === group.serial_number &&
                  editTarget.relay_index === device.relay_index;

                return (
                  <tr key={`${group.serial_number}-${device.relay_index}`}>
                    <td className="border p-2">{group.serial_number}</td>
                    <td className="border p-2">{device.relay_index}</td>
                    <td className="border p-2">
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="border p-1 w-full"
                        />
                      ) : (
                        device.name || '-'
                      )}
                    </td>
                    <td className="border p-2">{device.role || '-'}</td>
                    <td className="border p-2">
                      {device.registered_at
                        ? new Date(device.registered_at).toLocaleString('ja-JP')
                        : '-'}
                    </td>
                    <td className="border p-2 space-x-2">
                      <button
                        className="bg-yellow-500 text-white px-3 py-1 rounded"
                        onClick={() => handleBlink(group.serial_number, device.relay_index)}
                      >
                        点滅
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            className="bg-green-600 text-white px-3 py-1 rounded"
                            onClick={() =>
                              handleSaveName(group.serial_number, device.relay_index)
                            }
                          >
                            保存
                          </button>
                          <button
                            className="ml-2 bg-gray-400 text-white px-3 py-1 rounded"
                            onClick={() => setEditTarget(null)}
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <button
                          className="bg-blue-500 text-white px-3 py-1 rounded"
                          onClick={() => {
                            setEditTarget({
                              serial_number: group.serial_number,
                              relay_index: device.relay_index
                            });
                            setEditName(device.name || '');
                          }}
                        >
                          編集
                        </button>
                      )}
                      <button
                        className="bg-red-500 text-white px-3 py-1 rounded"
                        onClick={() => handleUnregister(group.serial_number)}
                      >
                        登録解除
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
