import * as React from "react";
import { cx } from "@/components/ui/cx";
import {
  AZ_PHONE_MAX_LENGTH,
  blockInvalidNumberKey,
  isPhoneFieldProps,
  sanitizeAzPhoneInput,
} from "@/lib/phone-input";

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
>(
  (
    {
      className,
      type,
      name,
      inputMode,
      maxLength,
      autoComplete,
      onChange,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const isPhone = isPhoneFieldProps({ type, name, inputMode });
    const isNumber = type === "number";

    return (
      <input
        ref={ref}
        className={cx("ui-input-group-input", className)}
        {...props}
        type={isPhone ? type ?? "tel" : type}
        name={name}
        inputMode={isPhone ? inputMode ?? "tel" : inputMode}
        maxLength={isPhone ? maxLength ?? AZ_PHONE_MAX_LENGTH : maxLength}
        autoComplete={isPhone ? autoComplete ?? "tel" : autoComplete}
        onChange={(event) => {
          if (isPhone) {
            const next = sanitizeAzPhoneInput(event.target.value);
            if (next !== event.target.value) {
              event.target.value = next;
            }
          }
          onChange?.(event);
        }}
        onKeyDown={(event) => {
          if (isNumber) blockInvalidNumberKey(event);
          onKeyDown?.(event);
        }}
      />
    );
  },
);

InputGroupInput.displayName = "InputGroupInput";

export function InputGroupAddon({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-input-group-addon", className)} {...props} />;
}
