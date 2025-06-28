//AutoMesh/frontend/src/components/ui/input.tsx

import React from "react";

export const Input = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded px-3 py-2 w-full focus:outline-none focus:ring focus:border-blue-300 dark:focus:border-blue-500 ${className}`}
      {...props}
    />
  );
});

Input.displayName = "Input";