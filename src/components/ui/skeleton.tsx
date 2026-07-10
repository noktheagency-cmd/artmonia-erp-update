import * as React from "react";
import { cx } from "@/components/ui/cx";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-skeleton", className)} aria-hidden="true" {...props} />;
}
