// frontend/src/components/ui/table.tsx
export function Table({ children, className = '' }) {
  return <table className={`w-full border-collapse ${className}`}>{children}</table>;
}

export function TableHeader({ children, className = '' }) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({ children, className = '' }) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className = '' }) {
  return <tr className={className}>{children}</tr>;
}

export function TableHead({ children, className = '' }) {
  return (
    <th className={`border px-4 py-2 bg-gray-100 dark:bg-gray-700 text-left text-gray-900 dark:text-white ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '' }) {
  return (
    <td className={`border px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${className}`}>
      {children}
    </td>
  );
}

// 例: TableCell内
<TableCell>
  <button className="text-xs sm:text-base px-2 sm:px-4 py-1 sm:py-2 bg-yellow-400 dark:bg-yellow-600 text-gray-900 dark:text-white rounded">
    <span className="inline sm:hidden">点</span>
    <span className="hidden sm:inline">点滅</span>
  </button>
  <button className="text-xs sm:text-base px-2 sm:px-4 py-1 sm:py-2 bg-blue-400 dark:bg-blue-600 text-white rounded">
    <span className="inline sm:hidden">編</span>
    <span className="hidden sm:inline">編集</span>
  </button>
  <button className="text-xs sm:text-base px-2 sm:px-4 py-1 sm:py-2 bg-red-400 dark:bg-red-600 text-white rounded">
    <span className="inline sm:hidden">解</span>
    <span className="hidden sm:inline">登録解除</span>
  </button>
</TableCell>
