// src/components/ui/ToggleSwitch.jsx
export default function ToggleSwitch({ enabled, onToggle }) {
  return (
    <div
      onClick={() => onToggle(!enabled)}
      className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors
        ${enabled ? 'bg-green-400 dark:bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
    >
      <div
        className={`w-4 h-4 bg-white dark:bg-gray-200 rounded-full shadow-md transform transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </div>
  );
}
