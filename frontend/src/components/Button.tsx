import type { ComponentProps } from "react";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: "primary" | "quiet";
  pending?: boolean;
  pendingLabel?: string;
}

export function Button({
  variant = "primary",
  pending = false,
  pendingLabel,
  children,
  ...button
}: ButtonProps) {
  return (
    <button
      type="button"
      {...button}
      className={`button button-${variant}`}
      disabled={pending || button.disabled}
      aria-busy={pending || undefined}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
