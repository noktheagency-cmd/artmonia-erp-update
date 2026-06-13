import * as React from "react";
import { cx } from "@/components/ui/cx";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "icon";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cx("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}
      {...props}
    />
  )
);

Button.displayName = "Button";
