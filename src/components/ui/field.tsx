import * as React from "react";
import { cx } from "@/components/ui/cx";

export function FieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-field-group", className)} {...props} />;
}

export function Field({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-field", className)} {...props} />;
}

export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label ref={ref} className={cx("ui-field-label", className)} {...props} />
));

FieldLabel.displayName = "FieldLabel";

export function FieldDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("ui-field-description", className)} {...props} />;
}
