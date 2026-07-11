"use client";

import { RouteErrorState } from "@/components/ui/route-error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="az">
      <body>
        <RouteErrorState error={error} reset={reset} global />
      </body>
    </html>
  );
}
