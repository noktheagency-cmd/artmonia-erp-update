import * as React from "react";
import { cx } from "@/components/ui/cx";

export const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx("ui-input-group", className)} {...props} />
));

InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cx("ui-input-group-input", className)} {...props} />
));

InputGroupInput.displayName = "InputGroupInput";

export function InputGroupAddon({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-input-group-addon", className)} {...props} />;
}
