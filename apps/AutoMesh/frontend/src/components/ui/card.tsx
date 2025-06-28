//AutoMesh/frontend/src/components/ui/card.tsx
export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-4 shadow ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={`mt-2 ${className}`}>{children}</div>;
}
