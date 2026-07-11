"use client";

import { Streamdown } from "streamdown";

export function MessageResponse({ children, className }: { children: string; className?: string }) {
  return <Streamdown className={className}>{children}</Streamdown>;
}
