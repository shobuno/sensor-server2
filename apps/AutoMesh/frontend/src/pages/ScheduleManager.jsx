// AutoMesh/frontend/src/pages/ScheduleManager.jsx

import { useEffect, useState } from "react";
import Button from "../components/ui/button";

export default function ScheduleManager() {
  const [rawDeviceGroups, setRawDeviceGroups] = useState([]); // 元の構造
  const [devices, setDevices] = useState([]); // serial_numberの一覧
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState({
    serial_number: "",
    days: ["月"],
    time: "12:00",
    relay: 1,
    action: "ON"
  });
  const [editId, setEditId] = useState(null);

  const dayOptions = ["月", "火", "水", "木", "金", "土", "日"];

  useEffect(() => {
    fetch("/automesh/api/get-devices")
      .then((res) => res.json())
      .then((data) => {
        setRawDeviceGroups(data);
        const flat = data.map((group) => ({
          serial_number: group.serial_number,
          name: group.serial_number, // 表示に使うだけ
          relay_count: group.devices.length
        }));
        setDevices(flat);
        if (flat.length > 0) {
          setForm((prev) => ({ ...prev, serial_number: flat[0].serial_number }));
        }
      });

    fetch("/automesh/api/schedule")
      .then((res) => res.json())
      .then((data) => {
        const formatted = data.map((s) => ({
          id: s.id,
          serial_number: s.serial_number,
          days: s.weekdays,
          time: `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
          relay: s.relay_index,
          action: s.action.toUpperCase(),
          enabled: s.enabled
        }));
        setSchedules(formatted);
      });
  }, []);

  const toggleDay = (day) => {
    setForm((prev) => {
      const exists = prev.days.includes(day);
      return {
        ...prev,
        days: exists ? prev.days.filter((d) => d !== day) : [...prev.days, day],
      };
    });
  };

  const handleSubmit = async () => {
    const [hour, minute] = form.time.split(":" ).map(Number);
    const body = {
      serial_number: form.serial_number,
      relay_index: form.relay,
      weekdays: form.days,
      hour,
      minute,
      action: form.action.toLowerCase(),
      enabled: true
    };

    try {
      if (editId !== null) {
        await fetch(`/automesh/api/schedule/${editId}`, { method: "DELETE" });
        setSchedules((prev) => prev.filter((s) => s.id !== editId));
      }

      const res = await fetch("/automesh/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const newSchedule = await res.json();
      setSchedules((prev) => [
        ...prev,
        {
          id: newSchedule.id,
          serial_number: newSchedule.serial_number,
          days: newSchedule.weekdays,
          time: `${String(newSchedule.hour).padStart(2, "0")}:${String(newSchedule.minute).padStart(2, "0")}`,
          relay: newSchedule.relay_index,
          action: newSchedule.action.toUpperCase(),
          enabled: newSchedule.enabled
        }
      ]);
    } catch (err) {
      console.error("登録エラー:", err);
    }

    setForm({ serial_number: devices[0]?.serial_number || "", days: ["月"], time: "12:00", relay: 1, action: "ON" });
    setEditId(null);
  };

  const handleEdit = (id) => {
    const target = schedules.find((s) => s.id === id);
    if (target) {
      setForm({
        serial_number: target.serial_number,
        days: [...target.days],
        time: target.time,
        relay: target.relay,
        action: target.action,
      });
      setEditId(id);
    }
  };

  const toggleEnabled = async (id) => {
    const target = schedules.find((s) => s.id === id);
    if (!target) return;

    const newEnabled = !target.enabled;
    try {
      const res = await fetch(`/automesh/api/schedule/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled })
      });
      const updated = await res.json();
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: updated.enabled } : s))
      );
    } catch (err) {
      console.error("トグルエラー:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/automesh/api/schedule/${id}`, { method: "DELETE" });
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("削除エラー:", err);
    }
  };

  const selectedGroup = rawDeviceGroups.find(g => g.serial_number === form.serial_number);
  const relayDevices = selectedGroup?.devices || [];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">スケジュール管理</h2>

      <div className="border p-4 mb-6">
        <h3 className="font-semibold mb-2">スケジュール追加</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <label>装置：</label>
          <select
            value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value, relay: 1 })}
          >
            {devices.map((dev) => (
              <option key={dev.serial_number} value={dev.serial_number}>
                {dev.serial_number}
              </option>
            ))}
          </select>

          <label>曜日：</label>
          {dayOptions.map((day) => (
            <label key={day} className="flex items-center">
              <input
                type="checkbox"
                checked={form.days.includes(day)}
                onChange={() => toggleDay(day)}
              />
              <span className="ml-1">{day}</span>
            </label>
          ))}

          <label>時刻：</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />

          <label>リレー：</label>
          <select
            value={form.relay}
            onChange={(e) => setForm({ ...form, relay: Number(e.target.value) })}
          >
            {relayDevices.map((d) => (
              <option key={d.relay_index} value={d.relay_index}>
                {d.name || `リレー${d.relay_index}`}
              </option>
            ))}
          </select>

          <label>動作：</label>
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          >
            <option value="ON">ON</option>
            <option value="OFF">OFF</option>
          </select>

          <Button onClick={handleSubmit}>
            {editId !== null ? "更新" : "追加"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">スケジュール一覧</h3>
        <table className="w-full text-left border-t">
          <thead>
            <tr>
              <th>状態</th>
              <th>装置</th>
              <th>曜日</th>
              <th>時刻</th>
              <th>リレー</th>
              <th>動作</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => {
              const group = rawDeviceGroups.find((g) => g.serial_number === s.serial_number);
              const relayName = group?.devices.find((d) => d.relay_index === s.relay)?.name || `リレー${s.relay}`;
              return (
                <tr key={s.id} className="border-t">
                  <td className="py-2">
                    <label
                      className={`relative inline-block w-12 h-6 rounded-full cursor-pointer ${
                        s.enabled ? "bg-green-400" : "bg-gray-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={() => toggleEnabled(s.id)}
                        className="sr-only"
                      />
                      <span
                        className={`absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white rounded-full transition-all duration-200 ${
                          s.enabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </label>
                  </td>
                  <td>{s.serial_number}</td>
                  <td>{s.days.join(",")}</td>
                  <td>{s.time}</td>
                  <td>{relayName}</td>
                  <td>{s.action}</td>
                  <td className="flex gap-2 py-1">
                    <Button onClick={() => handleEdit(s.id)}>編集</Button>
                    <Button onClick={() => handleDelete(s.id)}>削除</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
