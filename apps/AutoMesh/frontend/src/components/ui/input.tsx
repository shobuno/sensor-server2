//AutoMesh/frontend/src/components/ui/input.tsx

import React from "react";

export const Input = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring focus:border-blue-300 ${className}`}
      {...props}
    />
  );
});

Input.displayName = "Input";