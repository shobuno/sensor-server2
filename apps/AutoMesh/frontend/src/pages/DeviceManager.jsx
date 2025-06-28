// AutoMesh/frontend/src/pages/DeviceManager.jsx

import RegisteredList from '../components/RegisteredList';
import UnregisteredList from '../components/UnregisteredList';

export default function DeviceManager() {
  return (
    <div className="space-y-10 p-4 bg-white dark:bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">デバイス管理</h1>
      <RegisteredList />
      <UnregisteredList />
    </div>
  );
}
