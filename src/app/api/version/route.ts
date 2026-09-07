import { APP_BUILD_ID } from "@/lib/app-version";

export const dynamic = "force-dynamic";

// Public, non-sensitive build identity. No database or authentication dependency.
export function GET() {
  return Response.json({ buildId: APP_BUILD_ID }, {
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" },
  });
}
