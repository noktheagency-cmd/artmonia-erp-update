import type { NextRequest } from "next/server";
import { updateSession } from "@/server/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/login/:path*",
    "/dashboard/:path*",
    "/students/:path*",
    "/bookings/:path*",
    "/crm/:path*",
    "/marketing/:path*",
    "/playbook/:path*",
    "/hr/:path*",
    "/finance/:path*",
    "/reports/:path*",
    "/api/:path*",
  ],
};
