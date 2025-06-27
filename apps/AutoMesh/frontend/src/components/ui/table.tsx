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
    <th className={`border px-4 py-2 bg-gray-100 text-left ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '' }) {
  return (
    <td className={`border px-4 py-2 ${className}`}>
      {children}
    </td>
  );
}
