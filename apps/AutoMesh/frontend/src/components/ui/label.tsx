import React from "react";

export const Label = ({ htmlFor, children, className = "" }) => {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm font-medium text-gray-700 dark:text-gray-200 ${className}`}
    >
      {children}
    </label>
  );
};