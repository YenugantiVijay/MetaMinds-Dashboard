import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}

export function Button({ children, variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button className={["button", `button-${variant}`, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </button>
  );
}
