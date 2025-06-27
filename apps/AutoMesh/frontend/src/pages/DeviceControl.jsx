// AutoMesh/frontend/src/pages/DeviceControl.jsx
import { useEffect, useState } from "react";

export default function DeviceControl() {
  const [devices, setDevices] = useState([]);

  const fetchData = async () => {
    const [deviceRes, stateRes] = await Promise.all([
      fetch("/automesh/api/get-devices"),
      fetch("/automesh/api/relay-states"),
    ]);

    const deviceGroups = await deviceRes.json();
    const relayStates = await stateRes.json();

    const combined = deviceGroups.flatMap(group =>
      group.devices.map(device => {
        const foundState = relayStates.find(
          s => s.serial_number === group.serial_number && s.relay_index === device.relay_index
        );
        return {
          ...device,
          serial_number: group.serial_number,
          state: foundState ? foundState.state : false,
        };
      })
    );

    setDevices(combined);
  };

  const toggleRelay = async (serial_number, relay_index, current) => {
    const newState = !current;

    setDevices(prev =>
      prev.map(d =>
        d.serial_number === serial_number && d.relay_index === relay_index
          ? { ...d, state: newState }
          : d
      )
    );

    try {
      await fetch("/automesh/api/device-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial_number, relay_index, on: newState }),
      });
    } catch (err) {
      console.error("Relay toggle failed:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">デバイス制御</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {devices.map((device, idx) => (
          <div
            key={`${device.serial_number}-${device.relay_index}`}
            className="p-4 border rounded-lg shadow flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-6 h-6 rounded-full ${
                  device.state ? "bg-green-500" : "bg-gray-400"
                }`}
              ></div>
              <div>
                <div className="font-semibold">{device.name}</div>
                <div className="text-xs text-gray-500">
                  {device.serial_number}（relay {device.relay_index}）
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={device.state}
                onChange={() =>
                  toggleRelay(device.serial_number, device.relay_index, device.state)
                }
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500 transition-all"></div>
              <div className="absolute w-5 h-5 bg-white rounded-full border top-0.5 left-0.5 peer-checked:translate-x-full transition-transform"></div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
