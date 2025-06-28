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
      <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">登録済みデバイス一覧</h2>
      {deviceGroups.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-300">登録済みデバイスはありません。</p>
      ) : (
        <table className="w-full border mt-2 bg-white dark:bg-gray-800 dark:border-gray-700">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">シリアル番号</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">リレー番号</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">名前</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">役割</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">登録日時</th>
              <th className="border p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">操作</th>
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
                    <td className="border p-2 text-gray-900 dark:text-gray-100">{group.serial_number}</td>
                    <td className="border p-2 text-gray-900 dark:text-gray-100">{device.relay_index}</td>
                    <td className="border p-2 text-gray-900 dark:text-gray-100">
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="border p-1 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 rounded"
                        />
                      ) : (
                        device.name || '-'
                      )}
                    </td>
                    <td className="border p-2 text-gray-900 dark:text-gray-100">{device.role || '-'}</td>
                    <td className="border p-2 text-gray-900 dark:text-gray-100">
                      {device.registered_at
                        ? new Date(device.registered_at).toLocaleString('ja-JP')
                        : '-'}
                    </td>
                    <td className="border p-2 space-x-1 sm:space-x-2">
                      <button
                        className="text-xs sm:text-base px-2 sm:px-3 py-1 rounded bg-yellow-500 dark:bg-yellow-600 text-white"
                        onClick={() => handleBlink(group.serial_number, device.relay_index)}
                      >
                        <span className="inline sm:hidden">点</span>
                        <span className="hidden sm:inline">点滅</span>
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            className="text-xs sm:text-base px-2 sm:px-3 py-1 rounded bg-green-600 dark:bg-green-700 text-white"
                            onClick={() => handleSaveName(group.serial_number, device.relay_index)}
                          >
                            <span className="inline sm:hidden">保</span>
                            <span className="hidden sm:inline">保存</span>
                          </button>
                          <button
                            className="text-xs sm:text-base px-2 sm:px-3 py-1 rounded bg-gray-400 dark:bg-gray-600 text-white"
                            onClick={() => setEditTarget(null)}
                          >
                            <span className="inline sm:hidden">戻</span>
                            <span className="hidden sm:inline">キャンセル</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="text-xs sm:text-base px-2 sm:px-3 py-1 rounded bg-blue-500 dark:bg-blue-600 text-white"
                          onClick={() => {
                            setEditTarget({
                              serial_number: group.serial_number,
                              relay_index: device.relay_index
                            });
                            setEditName(device.name || '');
                          }}
                        >
                          <span className="inline sm:hidden">編</span>
                          <span className="hidden sm:inline">編集</span>
                        </button>
                      )}
                      <button
                        className="text-xs sm:text-base px-2 sm:px-3 py-1 rounded bg-red-500 dark:bg-red-600 text-white"
                        onClick={() => handleUnregister(group.serial_number)}
                      >
                        <span className="inline sm:hidden">解</span>
                        <span className="hidden sm:inline">登録解除</span>
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
