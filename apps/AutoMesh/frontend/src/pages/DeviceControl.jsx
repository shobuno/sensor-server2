//sensor-server/apps/AutoMesh/frontend/src/pages/DeviceControl.jsx

import { useEffect, useState } from 'react';
import { fetchJson } from '@/auth';

export default function DeviceControl() {
  const [devices, setDevices] = useState([]);

  const fetchData = async () => {
    try {
      const [deviceGroups, relayStates, connectedSerials] = await Promise.all([
        fetchJson('/automesh/api/get-devices'),
        fetchJson('/automesh/api/relay-states'),
        fetchJson('/automesh/api/connection-status'),
      ]);

      const combined = deviceGroups.flatMap(group =>
        group.devices.map(device => {
          const foundState = relayStates.find(
            s => s.serial_number === group.serial_number && s.relay_index === device.relay_index
          );
          return {
            ...device,
            serial_number: group.serial_number,
            state: foundState ? foundState.state : false,
            connected: connectedSerials.includes(group.serial_number),
          };
        })
      );

      setDevices(combined);
    } catch (e) {
      // 401はfetchJson側でlogout→/loginへ飛ぶのでここでは握りつぶしでOK
      console.error('fetchData failed:', e);
    }
  };

  const toggleRelay = async (serial_number, relay_index, current) => {
    const newState = !current;

    // 楽観更新
    setDevices(prev =>
      prev.map(d =>
        d.serial_number === serial_number && d.relay_index === relay_index
          ? { ...d, state: newState }
          : d
      )
    );

    try {
      await fetchJson('/automesh/api/device-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_number, relay_index, on: newState }),
      });
    } catch (err) {
      console.error('Relay toggle failed:', err);
      // 失敗したら元に戻す
      setDevices(prev =>
        prev.map(d =>
          d.serial_number === serial_number && d.relay_index === relay_index
            ? { ...d, state: current }
            : d
        )
      );
    }
  };

  useEffect(() => {
    let alive = true;
    const tick = async () => { if (alive) await fetchData(); };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  return (
    <div className="p-2 sm:p-6 bg-white dark:bg-gray-900 min-h-screen">
      <h2 className="text-3xl sm:text-4xl font-bold mb-8 sm:mb-10 leading-tight text-gray-900 dark:text-white">
        デバイス制御
      </h2>
      <div className="grid grid-cols-1 gap-8 sm:gap-12">
        {devices.map((device) => (
          <div
            key={`${device.serial_number}-${device.relay_index}`}
            className="p-8 sm:p-12 border-2 rounded-3xl shadow bg-white dark:bg-gray-800 dark:border-gray-700 flex gap-8"
          >
            <div className="flex items-center gap-4 md:gap-4 flex-1 min-w-0">
              <div
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full ${
                  device.connected ? 'bg-sky-300 dark:bg-sky-400' : 'bg-gray-400 dark:bg-gray-600'
                }`}
              />
              <div className="min-w-0">
                <div className="font-semibold text-xl md:text-2xl lg:text-lg leading-tight text-gray-900 dark:text-white">
                  {device.name}
                </div>
                <div className="text-base text-gray-500 break-all md:text-base md:leading-tight lg:text-base dark:text-gray-300">
                  <span className="whitespace-nowrap">
                    {device.serial_number}（relay {device.relay_index}）
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center">
              <label className="relative inline-flex items-center cursor-pointer h-6 w-12 md:h-8 md:w-20">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={device.state}
                  onChange={() => toggleRelay(device.serial_number, device.relay_index, device.state)}
                />
                <div className="
                  w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 transition-all
                  md:w-20 md:h-8
                  dark:bg-gray-700 dark:peer-checked:bg-green-400
                "></div>
                <div className="
                  absolute top-1/2 left-1 w-4 h-4 bg-white rounded-full border -translate-y-1/2 transition-transform
                  peer-checked:translate-x-6 md:w-6 md:h-6 md:left-1 md:peer-checked:translate-x-12 dark:bg-gray-200
                "></div>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
