//automesh/frontend/src/App.jsx

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import ScheduleManager from './pages/ScheduleManager';
import DeviceControl from './pages/DeviceControl';
import DeviceManager from "./pages/DeviceManager"; 

export default function App() {
  return (
    <BrowserRouter basename="/auto-mesh">
      <nav className="p-4 bg-white shadow mb-4 space-x-4">
        <Link className="text-blue-600" to="/control">制御</Link>
        <Link className="text-blue-600" to="/schedules">スケジュール</Link>
        <Link className="text-blue-600" to="/devices">デバイス登録</Link>
      </nav>
      <Routes>
        <Route path="/control" element={<DeviceControl />} />
        <Route path="/schedules" element={<ScheduleManager />} />
        <Route path="/devices" element={<DeviceManager />} />
        <Route path="*" element={<p className="p-4">ページが見つかりません</p>} />
      </Routes>
    </BrowserRouter>
  );
}

