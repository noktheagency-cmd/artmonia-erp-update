"use client";

import type { ComponentProps } from "react";
import { cx } from "@/components/ui/cx";

type CheckboxProps = Omit<ComponentProps<"input">, "type">;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return <input type="checkbox" className={cx("ui-checkbox", className)} {...props} />;
}
