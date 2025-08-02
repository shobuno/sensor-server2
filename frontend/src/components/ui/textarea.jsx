import React from "react";

export const Textarea = React.forwardRef(({ className = "", ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`border border-gray-300 rounded px-3 py-2 w-full focus:outline-none focus:ring focus:border-blue-300 ${className}`}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";