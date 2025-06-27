// AutoMesh/frontend/src/pages/DeviceManager.jsx

import RegisteredList from '../components/RegisteredList';
import UnregisteredList from '../components/UnregisteredList';

export default function DeviceManager() {
  return (
    <div className="space-y-10 p-4">
      <h1 className="text-2xl font-bold">デバイス管理</h1>
      <RegisteredList />
      <UnregisteredList />
    </div>
  );
}
